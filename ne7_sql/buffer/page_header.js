/**
 * NE7-SQL - Page Header Structure
 * Exact replication of PostgreSQL PageHeaderData
 */

import { BLCKSZ, SizeOfPageHeaderData } from '../core/constants.js';
import { logger } from '../core/logger.js';

export class PageHeader {
  constructor(view) {
    this.view = view; // Uint8Array view of the page
  }

  init() {
    // Initialize all bytes to 0
    this.view.fill(0);
    
    // Set pd_lsn (Log Sequence Number) - 8 bytes at offset 0
    this.setLSN(0);
    
    // Set pd_checksum - 2 bytes at offset 8
    this.setViewUint16(8, 0);
    
    // Set pd_flags - 2 bytes at offset 10
    this.setViewUint16(10, 0);
    
    // Set pd_lower - offset to start of free space (after header)
    this.setViewUint16(12, SizeOfPageHeaderData);
    
    // Set pd_upper - offset to end of free space (end of page)
    this.setViewUint16(14, BLCKSZ);
    
    // Set pd_special - offset to start of special space (same as upper for heap)
    this.setViewUint16(16, BLCKSZ);
    
    // Set pd_pagesize_version - 2 bytes at offset 18
    // Version bits: lower 16 bits = version, upper 16 bits = page size
    const versionInfo = (BLCKSZ << 16) | 4; // Version 4
    this.setViewUint16(18, versionInfo & 0xFFFF);
    this.setViewUint16(20, (versionInfo >> 16) & 0xFFFF);
    
    // Set pd_prune_xid - 4 bytes at offset 22 (for pruning)
    this.setViewUint32(22, 0);
    
    logger.debug('Page header initialized', { 
      pageSize: BLCKSZ, 
      headerSize: SizeOfPageHeaderData,
      location: 'page_header.js:init' 
    });
  }

  getLSN() {
    return this.getViewUint64(0);
  }

  setLSN(lsn) {
    this.setViewUint64(0, lsn);
  }

  getChecksum() {
    return this.getViewUint16(8);
  }

  setChecksum(checksum) {
    this.setViewUint16(8, checksum);
  }

  getFlags() {
    return this.getViewUint16(10);
  }

  setFlags(flags) {
    this.setViewUint16(10, flags);
  }

  getLower() {
    return this.getViewUint16(12);
  }

  setLower(lower) {
    this.setViewUint16(12, lower);
  }

  getUpper() {
    return this.getViewUint16(14);
  }

  setUpper(upper) {
    this.setViewUint16(14, upper);
  }

  getSpecial() {
    return this.getViewUint16(16);
  }

  setSpecial(special) {
    this.setViewUint16(16, special);
  }

  getVersion() {
    return this.getViewUint16(18);
  }

  getPageSize() {
    return this.getViewUint16(20) << 16;
  }

  getPruneXid() {
    return this.getViewUint32(22);
  }

  setPruneXid(xid) {
    this.setViewUint32(22, xid);
  }

  getFreeSpace() {
    const lower = this.getLower();
    const upper = this.getUpper();
    return upper - lower;
  }

  isFull(requiredSpace) {
    return this.getFreeSpace() < requiredSpace;
  }

  // Helper methods for reading/writing multi-byte values
  getViewUint16(offset) {
    const dv = new DataView(this.view.buffer, 0, BLCKSZ);
    return dv.getUint16(offset, true); // little-endian
  }

  setViewUint16(offset, value) {
    const dv = new DataView(this.view.buffer, 0, BLCKSZ);
    dv.setUint16(offset, value, true);
  }

  getViewUint32(offset) {
    const dv = new DataView(this.view.buffer, 0, BLCKSZ);
    return dv.getUint32(offset, true);
  }

  setViewUint32(offset, value) {
    const dv = new DataView(this.view.buffer, 0, BLCKSZ);
    dv.setUint32(offset, value, true);
  }

  getViewUint64(offset) {
    const dv = new DataView(this.view.buffer, 0, BLCKSZ);
    const low = dv.getUint32(offset, true);
    const high = dv.getUint32(offset + 4, true);
    return BigInt(high) << BigInt(32) | BigInt(low);
  }

  setViewUint64(offset, value) {
    const dv = new DataView(this.view.buffer, 0, BLCKSZ);
    const bigValue = BigInt(value);
    const low = Number(bigValue & BigInt(0xFFFFFFFF));
    const high = Number((bigValue >> BigInt(32)) & BigInt(0xFFFFFFFF));
    dv.setUint32(offset, low, true);
    dv.setUint32(offset + 4, high, true);
  }
}

logger.debug('Page header module loaded', { location: 'page_header.js:module' });
