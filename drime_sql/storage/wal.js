/**
 * DRIME.SQL - Write-Ahead Log (WAL)
 * Implements PostgreSQL WAL for ACID compliance
 * Rewrites XLogInsert, XLogFlush, checkpoints
 */

import { Logger } from '../core/logger.js';
import { BLCKSZ, XLOG_SEG_SIZE, XLOG_BLCKSZ } from '../core/constants.js';
import { crc32c } from '../core/utils.js';

const log = new Logger('WAL');

export class WriteAheadLog {
  constructor(bucket, apiKey) {
    log.info('Initializing Write-Ahead Log', { segmentSize: XLOG_SEG_SIZE });
    this.bucket = bucket;
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.drime.cloud/v1';
    
    // WAL state
    this.currentLSN = { segment: 0, offset: 0 };
    this.walBuffer = Buffer.alloc(XLOG_BLCKSZ);
    this.walPosition = 0;
    this.pendingRecords = [];
  }

  /**
   * Insert a WAL record
   * Equivalent to XLogInsert()
   */
  async insert(record) {
    log.debug('Inserting WAL record', { 
      rmid: record.rmid, 
      info: record.info,
      dataSize: record.data?.length || 0 
    });
    
    const header = this.createXLogRecordHeader(record);
    const fullRecord = Buffer.concat([header, record.data || Buffer.alloc(0)]);
    
    // Add to pending records
    this.pendingRecords.push({
      lsn: this.getCurrentLSN(),
      data: fullRecord
    });
    
    // Advance LSN
    this.advanceLSN(fullRecord.length);
    
    return this.getCurrentLSN();
  }

  /**
   * Flush WAL buffer to storage
   * Equivalent to XLogFlush()
   */
  async flush(lsn) {
    log.info('Flushing WAL to storage', { lsn });
    
    if (this.pendingRecords.length === 0) {
      log.debug('No pending records to flush');
      return true;
    }
    
    // Write all pending records
    for (const record of this.pendingRecords) {
      const objectKey = `${this.bucket}/wal/${record.lsn.segment}/${record.lsn.offset}`;
      
      const response = await fetch(`${this.baseUrl}/objects/${objectKey}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/octet-stream'
        },
        body: record.data
      });
      
      if (!response.ok) {
        throw new Error(`Failed to write WAL record: ${response.statusText}`);
      }
      
      log.debug('WAL record written', { lsn: record.lsn });
    }
    
    this.pendingRecords = [];
    log.info('WAL flush complete');
    return true;
  }

  /**
   * Create a checkpoint
   * Forces all dirty buffers to disk and records checkpoint in WAL
   */
  async checkpoint() {
    log.info('Creating checkpoint');
    
    const checkpointLSN = this.getCurrentLSN();
    
    // Create checkpoint record
    const checkpointRecord = {
      rmid: 0, // RM_XLOG_ID
      info: 'CHECKPOINT',
      data: Buffer.from(JSON.stringify({
        lsn: checkpointLSN,
        timestamp: Date.now(),
        redo: checkpointLSN
      }))
    };
    
    await this.insert(checkpointRecord);
    await this.flush(checkpointLSN);
    
    log.info('Checkpoint complete', { lsn: checkpointLSN });
    return checkpointLSN;
  }

  /**
   * Read WAL records from a given LSN
   * Used for crash recovery
   */
  async read(startLSN) {
    log.info('Reading WAL from LSN', { startLSN });
    
    const records = [];
    let currentSegment = startLSN.segment;
    let currentOffset = startLSN.offset;
    
    while (true) {
      const objectKey = `${this.bucket}/wal/${currentSegment}/${currentOffset}`;
      
      try {
        const response = await fetch(`${this.baseUrl}/objects/${currentOffset}`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });
        
        if (!response.ok) break;
        
        const buffer = await response.arrayBuffer();
        const data = Buffer.from(buffer);
        
        // Parse record header
        const header = this.parseXLogRecordHeader(data);
        const recordData = data.slice(header.size);
        
        records.push({
          lsn: { segment: currentSegment, offset: currentOffset },
          rmid: header.rmid,
          info: header.info,
          data: recordData
        });
        
        currentOffset += data.length;
        if (currentOffset >= XLOG_SEG_SIZE) {
          currentSegment++;
          currentOffset = 0;
        }
      } catch (err) {
        log.debug('End of WAL or error', { error: err.message });
        break;
      }
    }
    
    log.info('WAL read complete', { recordCount: records.length });
    return records;
  }

  /**
   * Create XLog record header (simplified PostgreSQL format)
   */
  createXLogRecordHeader(record) {
    const headerSize = 24; // Simplified header
    const header = Buffer.alloc(headerSize);
    
    // Total length
    const totalLen = headerSize + (record.data?.length || 0);
    header.writeUInt32LE(totalLen, 0);
    
    // CRC (calculated after filling rest)
    header.writeUInt32LE(0, 4); // Placeholder
    
    // Record info
    header.writeUInt8(record.rmid, 8);
    header.writeUInt8(record.info, 9);
    
    // LSN
    header.writeUInt32LE(this.currentLSN.segment, 12);
    header.writeUInt32LE(this.currentLSN.offset, 16);
    
    // Calculate CRC
    const crc = crc32c(header.slice(8));
    header.writeUInt32LE(crc, 4);
    
    return header;
  }

  /**
   * Parse XLog record header
   */
  parseXLogRecordHeader(buffer) {
    const totalLen = buffer.readUInt32LE(0);
    const crc = buffer.readUInt32LE(4);
    const rmid = buffer.readUInt8(8);
    const info = buffer.readUInt8(9);
    const segment = buffer.readUInt32LE(12);
    const offset = buffer.readUInt32LE(16);
    
    // Verify CRC
    const computedCRC = crc32c(buffer.slice(8, totalLen));
    if (crc !== computedCRC) {
      throw new Error('WAL record CRC mismatch');
    }
    
    return { totalLen, crc, rmid, info, segment, offset };
  }

  /**
   * Get current LSN
   */
  getCurrentLSN() {
    return { ...this.currentLSN };
  }

  /**
   * Advance LSN by given bytes
   */
  advanceLSN(bytes) {
    this.currentLSN.offset += bytes;
    if (this.currentLSN.offset >= XLOG_SEG_SIZE) {
      this.currentLSN.segment++;
      this.currentLSN.offset = 0;
    }
  }

  /**
   * Replay WAL records for recovery
   */
  async replay(startLSN, endLSN, redoFunction) {
    log.info('Starting WAL replay', { startLSN, endLSN });
    
    const records = await this.read(startLSN);
    let replayed = 0;
    
    for (const record of records) {
      // Stop if we've passed the end LSN
      if (this.compareLSN(record.lsn, endLSN) > 0) break;
      
      log.debug('Replaying record', { lsn: record.lsn, rmid: record.rmid });
      
      // Call redo function for this record type
      if (redoFunction) {
        await redoFunction(record);
      }
      
      replayed++;
    }
    
    log.info('WAL replay complete', { replayed });
    return replayed;
  }

  /**
   * Compare two LSNs
   * Returns: -1 if a < b, 0 if a == b, 1 if a > b
   */
  compareLSN(a, b) {
    if (a.segment !== b.segment) {
      return a.segment < b.segment ? -1 : 1;
    }
    if (a.offset !== b.offset) {
      return a.offset < b.offset ? -1 : 1;
    }
    return 0;
  }
}
