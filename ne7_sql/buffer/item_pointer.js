/**
 * NE7-SQL - Item Pointer and Item ID
 * Implements PostgreSQL ItemIdData and ItemPointerData
 */

import { MAXALIGN } from '../core/constants.js';
import { logger } from '../core/logger.js';

// ItemIdData structure (4 bytes)
// lp_off: offset to item (2 bytes)
// lp_len: length of item (2 bytes, includes item header)
export class ItemId {
  constructor(offset = 0, len = 0) {
    this.offset = offset;
    this.len = len;
    this.used = offset > 0;
  }

  isValid() {
    return this.used && this.offset > 0 && this.len > 0;
  }

  getOffset() {
    return this.offset;
  }

  getLength() {
    return this.len;
  }

  setOffset(offset) {
    this.offset = offset;
    this.used = true;
  }

  setLength(len) {
    this.len = len;
  }

  markUnused() {
    this.offset = 0;
    this.len = 0;
    this.used = false;
  }

  static fromBytes(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, 4);
    const offset = dv.getUint16(0, true);
    const len = dv.getUint16(2, true);
    return new ItemId(offset, len);
  }

  toBytes() {
    const bytes = new Uint8Array(4);
    const dv = new DataView(bytes.buffer);
    dv.setUint16(0, this.offset, true);
    dv.setUint16(2, this.len, true);
    return bytes;
  }
}

// ItemPointerData (TID - Tuple Identifier)
// blockNumber: block number (4 bytes)
// offsetNumber: offset within block (2 bytes)
export class ItemPointer {
  constructor(blockNumber = 0, offsetNumber = 0) {
    this.blockNumber = blockNumber;
    this.offsetNumber = offsetNumber;
  }

  setBlockNumber(blockNum) {
    this.blockNumber = blockNum;
  }

  setOffsetNumber(offsetNum) {
    this.offsetNumber = offsetNum;
  }

  getBlockNumber() {
    return this.blockNumber;
  }

  getOffsetNumber() {
    return this.offsetNumber;
  }

  isValid() {
    return this.blockNumber >= 0 && this.offsetNumber > 0;
  }

  static fromBytes(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
    const blockNum = dv.getInt32(0, true);
    const offsetNum = dv.getUint16(4, true);
    return new ItemPointer(blockNum, offsetNum);
  }

  toBytes() {
    const bytes = new Uint8Array(8);
    const dv = new DataView(bytes.buffer);
    dv.setInt32(0, this.blockNumber, true);
    dv.setUint16(4, this.offsetNumber, true);
    return bytes;
  }

  toString() {
    return `(${this.blockNumber},${this.offsetNumber})`;
  }

  equals(other) {
    if (!other) return false;
    return this.blockNumber === other.blockNumber && 
           this.offsetNumber === other.offsetNumber;
  }
}

// Max number of items per page
// Each ItemId is 4 bytes, page has 24 byte header
// Remaining space for ItemIds: (8192 - 24) / 4 = 2042
export const MaxItemIdIndex = 2042;
export const InvalidItemIdIndex = 0;

logger.debug('Item pointer module loaded', { 
  MaxItemIdIndex, 
  location: 'item_pointer.js:module' 
});
