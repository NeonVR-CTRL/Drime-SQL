/**
 * NE7-SQL - Utility Functions
 * Memory alignment, CRC32C, byte manipulation
 * Rewritten from PostgreSQL src/port and src/common
 */

import { MAXALIGN_SIZE } from './constants.js';

/**
 * Align a size to MAXALIGN boundary (8 bytes)
 * Matches TYPEALIGN macro in Postgres
 */
export function MAXALIGN(len) {
  return ((len) + (MAXALIGN_SIZE - 1)) & ~(MAXALIGN_SIZE - 1);
}

/**
 * Align to double boundary
 */
export function DOUBLEALIGN(len) {
  return ((len) + 7) & ~7;
}

/**
 * Convert string to buffer with null terminator
 */
export function stringToBuffer(str) {
  const buf = Buffer.alloc(str.length + 1);
  buf.write(str + '\0', 0);
  return buf;
}

/**
 * Read null-terminated string from buffer
 */
export function readCString(buffer, offset = 0) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end++;
  }
  return buffer.toString('utf8', offset, end);
}

/**
 * Simple CRC32C implementation
 * Used for PostgreSQL page checksums
 */
export function crc32c(data) {
  let crc = 0xFFFFFFFF;
  const table = getCRC32CTable();
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Pre-computed CRC32C lookup table
let crc32cTable = null;

function getCRC32CTable() {
  if (crc32cTable) return crc32cTable;
  
  crc32cTable = new Uint32Array(256);
  const polynomial = 0x82F63B78; // CRC32C polynomial
  
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? (crc >>> 1) ^ polynomial : crc >>> 1;
    }
    crc32cTable[i] = crc >>> 0;
  }
  
  return crc32cTable;
}

/**
 * Pack multiple values into a buffer
 */
export function packValues(values) {
  const buffers = [];
  let totalSize = 0;
  
  for (const val of values) {
    if (typeof val === 'number') {
      // Assume 4-byte integer for simplicity
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(val, 0);
      buffers.push(buf);
      totalSize += 4;
    } else if (Buffer.isBuffer(val)) {
      buffers.push(val);
      totalSize += val.length;
    } else if (typeof val === 'string') {
      const buf = Buffer.from(val, 'utf8');
      buffers.push(buf);
      totalSize += buf.length;
    }
  }
  
  return Buffer.concat(buffers, totalSize);
}

/**
 * Compare two buffers
 */
export function bufferCompare(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * Generate a unique ID (simplified OID generator)
 */
export function generateOID() {
  return Math.floor(Math.random() * 0x7FFFFFFF);
}

/**
 * Encode a timestamp to PostgreSQL format
 */
export function encodeTimestamp(date) {
  // PostgreSQL epoch is 2000-01-01
  const postgresEpoch = new Date('2000-01-01T00:00:00Z').getTime();
  const ms = date.getTime() - postgresEpoch;
  return BigInt(Math.floor(ms * 1000)); // Microseconds
}

/**
 * Decode a PostgreSQL timestamp
 */
export function decodeTimestamp(microseconds) {
  const postgresEpoch = new Date('2000-01-01T00:00:00Z').getTime();
  const ms = Number(microseconds) / 1000;
  return new Date(postgresEpoch + ms);
}
