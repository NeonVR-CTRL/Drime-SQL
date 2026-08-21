/**
 * NE7-SQL - PostgreSQL Wire Protocol TCP Server
 * Implements PostgreSQL Frontend/Backend Protocol v3
 * Allows psql, DBeaver, pgAdmin to connect directly
 */
const net = require('net');
const { logger } = require('../core/logger.js');
const { NE7SQLDatabase } = require('../main.js');

const PG_PROTOCOL_VERSION = 196608; // 3.0 = (3 << 16) | 0

class PgWireServer {
    constructor(db, port = 5432) {
        this.db = db;
        this.port = port;
        this.server = null;
        this.connections = new Map();
        this.backendKeyCounter = 1;
        logger.info('PgWireServer created', { port, location: 'pg_server.js:constructor' });
    }

    start() {
        this.server = net.createServer((socket) => {
            const connId = this.backendKeyCounter++;
            logger.info('New connection', { connId, remoteAddr: socket.remoteAddress, location: 'pg_server.js:start' });
            
            const conn = {
                id: connId,
                socket,
                state: 'STARTUP', // STARTUP -> AUTH -> READY -> QUERY
                buffer: Buffer.alloc(0),
                backendKey: Math.floor(Math.random() * 0x7FFFFFFF),
                secretKey: Math.floor(Math.random() * 0x7FFFFFFF),
                user: 'postgres',
                database: 'ne7sql'
            };
            
            this.connections.set(connId, conn);
            
            socket.on('data', (data) => this.handleData(conn, data));
            socket.on('error', (err) => {
                logger.error('Socket error', { connId, error: err.message, location: 'pg_server.js:start' });
                this.connections.delete(connId);
            });
            socket.on('close', () => {
                logger.info('Connection closed', { connId, location: 'pg_server.js:start' });
                this.connections.delete(connId);
            });
        });
        
        this.server.listen(this.port, () => {
            logger.info(`NE7-SQL PostgreSQL Wire Protocol Server listening on port ${this.port}`, {
                location: 'pg_server.js:start'
            });
            console.log(`\n🔌 NE7-SQL Wire Protocol Server started on port ${this.port}`);
            console.log(`   Connect with: psql -h localhost -p ${this.port} -U postgres -d ne7sql\n`);
        });
    }

    handleData(conn, data) {
        conn.buffer = Buffer.concat([conn.buffer, data]);
        
        while (conn.buffer.length > 0) {
            if (conn.state === 'STARTUP') {
                if (!this.parseStartupMessage(conn)) return;
            } else {
                if (!this.parseProtocolMessage(conn)) return;
            }
        }
    }

    parseStartupMessage(conn) {
        if (conn.buffer.length < 4) return false;
        
        const length = conn.buffer.readInt32BE(0);
        if (conn.buffer.length < length) return false;
        
        const msgBuf = conn.buffer.slice(0, length);
        conn.buffer = conn.buffer.slice(length);
        
        const protocolVersion = msgBuf.readInt32BE(4);
        
        // Check for SSL request (80877103)
        if (protocolVersion === 80877103) {
            logger.info('SSL request received, declining', { location: 'pg_server.js:parseStartupMessage' });
            conn.socket.write(Buffer.from('N')); // 'N' = no SSL
            return true;
        }
        
        // Check for cancel request (80877102)
        if (protocolVersion === 80877102) {
            logger.info('Cancel request received', { location: 'pg_server.js:parseStartupMessage' });
            conn.socket.destroy();
            return false;
        }
        
        logger.info('Startup message received', {
            protocolVersion,
            location: 'pg_server.js:parseStartupMessage'
        });
        
        // Parse startup parameters (key-value pairs)
        let offset = 8;
        while (offset < msgBuf.length - 1) {
            const keyEnd = msgBuf.indexOf(0, offset);
            if (keyEnd === -1) break;
            const key = msgBuf.toString('utf8', offset, keyEnd);
            offset = keyEnd + 1;
            
            const valEnd = msgBuf.indexOf(0, offset);
            if (valEnd === -1) break;
            const val = msgBuf.toString('utf8', offset, valEnd);
            offset = valEnd + 1;
            
            if (key === 'user') conn.user = val;
            if (key === 'database') conn.database = val;
            
            logger.debug('Startup parameter', { key, val, location: 'pg_server.js:parseStartupMessage' });
        }
        
        // Send AuthenticationOk
        this.sendAuthenticationOk(conn);
        
        // Send ParameterStatus messages
        this.sendParameterStatus(conn, 'server_version', '18.6');
        this.sendParameterStatus(conn, 'server_encoding', 'UTF8');
        this.sendParameterStatus(conn, 'client_encoding', 'UTF8');
        this.sendParameterStatus(conn, 'application_name', 'ne7sql');
        this.sendParameterStatus(conn, 'is_superuser', 'on');
        this.sendParameterStatus(conn, 'session_authorization', conn.user);
        this.sendParameterStatus(conn, 'DateStyle', 'ISO, MDY');
        this.sendParameterStatus(conn, 'IntervalStyle', 'postgres');
        this.sendParameterStatus(conn, 'TimeZone', 'UTC');
        this.sendParameterStatus(conn, 'integer_datetimes', 'on');
        this.sendParameterStatus(conn, 'standard_conforming_strings', 'on');
        
        // Send BackendKeyData
        this.sendBackendKeyData(conn);
        
        // Send ReadyForQuery
        this.sendReadyForQuery(conn, 'I');
        
        conn.state = 'READY';
        logger.info('Client authenticated and ready', {
            connId: conn.id,
            user: conn.user,
            database: conn.database,
            location: 'pg_server.js:parseStartupMessage'
        });
        
        return true;
    }

    parseProtocolMessage(conn) {
        if (conn.buffer.length < 5) return false;
        
        const msgType = String.fromCharCode(conn.buffer[0]);
        const length = conn.buffer.readInt32BE(1);
        
        if (conn.buffer.length < length + 1) return false;
        
        const msgBuf = conn.buffer.slice(5, length + 1);
        conn.buffer = conn.buffer.slice(length + 1);
        
        logger.debug('Protocol message received', {
            msgType,
            length,
            connId: conn.id,
            location: 'pg_server.js:parseProtocolMessage'
        });
        
        switch (msgType) {
            case 'Q': // Simple Query
                this.handleSimpleQuery(conn, msgBuf);
                break;
            case 'X': // Terminate
                logger.info('Client disconnecting', { connId: conn.id, location: 'pg_server.js:parseProtocolMessage' });
                conn.socket.destroy();
                return false;
            case 'P': // Parse (Extended Query Protocol)
            case 'B': // Bind
            case 'E': // Execute
            case 'S': // Sync
            case 'D': // Describe
            case 'C': // Close
                logger.info('Extended query protocol message (simplified handling)', {
                    msgType,
                    location: 'pg_server.js:parseProtocolMessage'
                });
                if (msgType === 'S') {
                    this.sendReadyForQuery(conn, 'I');
                }
                break;
            default:
                logger.warn('Unknown message type', { msgType, location: 'pg_server.js:parseProtocolMessage' });
                break;
        }
        
        return true;
    }

    async handleSimpleQuery(conn, msgBuf) {
        const sql = msgBuf.toString('utf8').replace(/\0$/, '').trim();
        
        logger.info('Simple Query received', {
            connId: conn.id,
            sql: sql.substring(0, 200),
            location: 'pg_server.js:handleSimpleQuery'
        });
        
        if (!sql) {
            this.sendEmptyQueryResponse(conn);
            this.sendReadyForQuery(conn, 'I');
            return;
        }
        
        try {
            const result = await this.db.exec(sql);
            
            if (result && result.rows) {
                // SELECT query - send RowDescription + DataRows
                if (result.columns) {
                    this.sendRowDescription(conn, result.columns);
                }
                
                for (const row of result.rows) {
                    this.sendDataRow(conn, row);
                }
                
                this.sendCommandComplete(conn, `SELECT ${result.rows.length}`);
            } else if (result && result.message) {
                this.sendCommandComplete(conn, result.message);
            } else {
                this.sendCommandComplete(conn, 'OK');
            }
        } catch (err) {
            logger.error('Query execution error', {
                connId: conn.id,
                error: err.message,
                location: 'pg_server.js:handleSimpleQuery'
            });
            this.sendErrorResponse(conn, 'ERROR', '58000', err.message);
        }
        
        this.sendReadyForQuery(conn, 'I');
    }

    // ═══════════════════════════════════════
    // MESSAGE ENCODING FUNCTIONS
    // ═══════════════════════════════════════

    sendAuthenticationOk(conn) {
        const buf = Buffer.alloc(9);
        buf.writeUInt8(0x52, 0); // 'R'
        buf.writeInt32BE(8, 1);  // length
        buf.writeInt32BE(0, 5);  // AuthenticationOk
        conn.socket.write(buf);
        logger.debug('Sent AuthenticationOk', { location: 'pg_server.js:sendAuthenticationOk' });
    }

    sendParameterStatus(conn, name, value) {
        const nameBuf = Buffer.from(name + '\0', 'utf8');
        const valueBuf = Buffer.from(value + '\0', 'utf8');
        const length = 4 + nameBuf.length + valueBuf.length;
        
        const buf = Buffer.alloc(1 + length);
        buf.writeUInt8(0x53, 0); // 'S'
        buf.writeInt32BE(length, 1);
        nameBuf.copy(buf, 5);
        valueBuf.copy(buf, 5 + nameBuf.length);
        conn.socket.write(buf);
    }

    sendBackendKeyData(conn) {
        const buf = Buffer.alloc(13);
        buf.writeUInt8(0x4B, 0); // 'K'
        buf.writeInt32BE(12, 1); // length
        buf.writeInt32BE(conn.backendKey, 5);
        buf.writeInt32BE(conn.secretKey, 9);
        conn.socket.write(buf);
        logger.debug('Sent BackendKeyData', { location: 'pg_server.js:sendBackendKeyData' });
    }

    sendReadyForQuery(conn, status) {
        const buf = Buffer.alloc(6);
        buf.writeUInt8(0x5A, 0); // 'Z'
        buf.writeInt32BE(5, 1);  // length
        buf.writeUInt8(status.charCodeAt(0), 5); // 'I', 'T', or 'E'
        conn.socket.write(buf);
        logger.debug('Sent ReadyForQuery', { status, location: 'pg_server.js:sendReadyForQuery' });
    }

    sendRowDescription(conn, columns) {
        const parts = [];
        
        // Field count (2 bytes)
        const countBuf = Buffer.alloc(2);
        countBuf.writeInt16BE(columns.length, 0);
        parts.push(countBuf);
        
        for (const col of columns) {
            const name = col.name || col;
            const nameBuf = Buffer.from(name + '\0', 'utf8');
            
            // Fixed fields: table_oid(4) + attr_num(2) + type_oid(4) + type_size(2) + type_mod(4) + format(2) = 18 bytes
            const metaBuf = Buffer.alloc(18);
            metaBuf.writeInt32BE(0, 0);      // table OID
            metaBuf.writeInt16BE(0, 4);      // attribute number
            metaBuf.writeInt32BE(25, 6);     // type OID (25 = TEXT)
            metaBuf.writeInt16BE(-1, 10);    // type size (-1 = variable)
            metaBuf.writeInt32BE(-1, 12);    // type modifier
            metaBuf.writeInt16BE(0, 16);     // format code (0 = text)
            
            parts.push(nameBuf);
            parts.push(metaBuf);
        }
        
        const payload = Buffer.concat(parts);
        const length = 4 + payload.length;
        
        const header = Buffer.alloc(5);
        header.writeUInt8(0x54, 0); // 'T'
        header.writeInt32BE(length, 1);
        
        conn.socket.write(Buffer.concat([header, payload]));
        logger.debug('Sent RowDescription', { columnCount: columns.length, location: 'pg_server.js:sendRowDescription' });
    }

    sendDataRow(conn, row) {
        const parts = [];
        
        // Column count (2 bytes)
        const values = Array.isArray(row) ? row : Object.values(row);
        const countBuf = Buffer.alloc(2);
        countBuf.writeInt16BE(values.length, 0);
        parts.push(countBuf);
        
        for (const val of values) {
            if (val === null || val === undefined) {
                // NULL value: length = -1
                const nullBuf = Buffer.alloc(4);
                nullBuf.writeInt32BE(-1, 0);
                parts.push(nullBuf);
            } else {
                const strVal = String(val);
                const valBuf = Buffer.from(strVal, 'utf8');
                const lenBuf = Buffer.alloc(4);
                lenBuf.writeInt32BE(valBuf.length, 0);
                parts.push(lenBuf);
                parts.push(valBuf);
            }
        }
        
        const payload = Buffer.concat(parts);
        const length = 4 + payload.length;
        
        const header = Buffer.alloc(5);
        header.writeUInt8(0x44, 0); // 'D'
        header.writeInt32BE(length, 1);
        
        conn.socket.write(Buffer.concat([header, payload]));
        logger.debug('Sent DataRow', { columnCount: values.length, location: 'pg_server.js:sendDataRow' });
    }

    sendCommandComplete(conn, tag) {
        const tagBuf = Buffer.from(tag + '\0', 'utf8');
        const length = 4 + tagBuf.length;
        
        const buf = Buffer.alloc(1 + length);
        buf.writeUInt8(0x43, 0); // 'C'
        buf.writeInt32BE(length, 1);
        tagBuf.copy(buf, 5);
        conn.socket.write(buf);
        logger.debug('Sent CommandComplete', { tag, location: 'pg_server.js:sendCommandComplete' });
    }

    sendEmptyQueryResponse(conn) {
        const buf = Buffer.alloc(5);
        buf.writeUInt8(0x49, 0); // 'I'
        buf.writeInt32BE(4, 1);
        conn.socket.write(buf);
        logger.debug('Sent EmptyQueryResponse', { location: 'pg_server.js:sendEmptyQueryResponse' });
    }

    sendErrorResponse(conn, severity, code, message) {
        const fields = [
            Buffer.from('S' + severity + '\0', 'utf8'),
            Buffer.from('V' + severity + '\0', 'utf8'),
            Buffer.from('C' + code + '\0', 'utf8'),
            Buffer.from('M' + message + '\0', 'utf8'),
            Buffer.from('\0', 'utf8') // terminator
        ];
        
        const payload = Buffer.concat(fields);
        const length = 4 + payload.length;
        
        const header = Buffer.alloc(5);
        header.writeUInt8(0x45, 0); // 'E'
        header.writeInt32BE(length, 1);
        
        conn.socket.write(Buffer.concat([header, payload]));
        logger.debug('Sent ErrorResponse', { severity, code, message, location: 'pg_server.js:sendErrorResponse' });
    }

    stop() {
        if (this.server) {
            this.server.close();
            logger.info('PgWireServer stopped', { location: 'pg_server.js:stop' });
        }
    }
}

module.exports = { PgWireServer };
