/**
 * NE7-SQL - PostgreSQL Wire Protocol Implementation
 * Rewrites Postgres Frontend/Backend protocol for HTTP/Workers
 */

import { Logger } from '../core/logger.js';
import { PG_TYPES } from '../core/types.js';

const log = new Logger('WireProtocol');

export class WireProtocol {
  constructor() {
    log.info('Initializing PostgreSQL Wire Protocol adapter');
    this.messageTypes = {
      QUERY: 'Q',
      READY: 'Z',
      ROW_DESC: 'T',
      DATA_ROW: 'D',
      COMMAND_COMPLETE: 'C',
      ERROR: 'E',
      NOTICE: 'N',
      AUTH_OK: 'R'
    };
  }

  /**
   * Encodes a backend message to Postgres binary format
   * Compatible with psql and other clients
   */
  encodeMessage(type, payload) {
    log.debug('Encoding message', { type, payloadSize: payload.length });
    
    const buffer = Buffer.alloc(payload.length + 5);
    buffer.writeUInt8(type.charCodeAt(0), 0);
    buffer.writeUInt32BE(payload.length + 4, 1);
    payload.copy(buffer, 5);
    
    return buffer;
  }

  /**
   * Decodes frontend message from binary
   */
  decodeMessage(buffer) {
    log.debug('Decoding incoming message', { size: buffer.length });
    
    const type = String.fromCharCode(buffer[0]);
    const length = buffer.readUInt32BE(1);
    const payload = buffer.slice(5, 5 + length - 4);
    
    return { type, length, payload };
  }

  /**
   * Generates ReadyForQuery message (Z)
   */
  readyForQuery(status = 'I') {
    // I = Idle, T = Transaction, E = Error
    const payload = Buffer.from([status.charCodeAt(0)]);
    log.debug('Sending ReadyForQuery', { status });
    return this.encodeMessage(this.messageTypes.READY, payload);
  }

  /**
   * Generates RowDescription message (T)
   */
  rowDescription(columns) {
    log.debug('Generating RowDescription', { columnCount: columns.length });
    
    const parts = [Buffer.from([0, columns.length])]; // Field count
    
    for (const col of columns) {
      // Field name
      const nameBuf = Buffer.from(col.name + '\0');
      parts.push(nameBuf);
      
      // Table OID, Attr number, Type OID, Type size, Type mod, Format code
      const meta = Buffer.alloc(18);
      meta.writeUInt32BE(col.tableOid || 0, 0);
      meta.writeUInt16BE(col.attrNum || 0, 4);
      meta.writeUInt32BE(col.typeOid || PG_TYPES.TEXT, 6);
      meta.writeUInt16BE(col.typeSize || -1, 10);
      meta.writeInt32BE(col.typeMod || -1, 12);
      meta.writeUInt16BE(col.formatCode || 0, 16); // 0=text, 1=binary
      
      parts.push(meta);
    }
    
    const payload = Buffer.concat(parts);
    return this.encodeMessage(this.messageTypes.ROW_DESC, payload);
  }

  /**
   * Generates DataRow message (D)
   */
  dataRow(values) {
    log.debug('Generating DataRow', { valueCount: values.length });
    
    const parts = [Buffer.from([0, values.length])]; // Column count
    
    for (const val of values) {
      if (val === null) {
        parts.push(Buffer.from([0xFF, 0xFF, 0xFF, 0xFE])); // -1 length for NULL
      } else {
        const strVal = String(val);
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(strVal.length, 0);
        parts.push(lenBuf);
        parts.push(Buffer.from(strVal));
      }
    }
    
    const payload = Buffer.concat(parts);
    return this.encodeMessage(this.messageTypes.DATA_ROW, payload);
  }

  /**
   * Generates CommandComplete message (C)
   */
  commandComplete(tag) {
    log.info('Command Complete', { tag });
    const payload = Buffer.from(tag + '\0');
    return this.encodeMessage(this.messageTypes.COMMAND_COMPLETE, payload);
  }

  /**
   * Generates ErrorResponse message (E)
   */
  errorResponse(message, severity = 'ERROR') {
    log.error('Error Response', { severity, message });
    
    const fields = [
      `S${severity}\0`,
      `C58000\0`, // Internal Error
      `M${message}\0`,
      `\0` // Terminator
    ];
    
    const payload = Buffer.from(fields.join(''));
    return this.encodeMessage(this.messageTypes.ERROR, payload);
  }
}
