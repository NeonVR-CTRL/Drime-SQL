/**
 * NE7-SQL - Storage Manager (smgr)
 * Maps PostgreSQL blocks to Drime.cloud objects
 * Rewrites Postgres smgr API for HTTP storage
 */

import { Logger } from '../core/logger.js';
import { BLCKSZ, XLOG_SEG_SIZE } from '../core/constants.js';
import { crc32c } from '../core/utils.js';

const log = new Logger('DrimeSMGR');

export class DrimeStorageManager {
  constructor(bucket, apiKey) {
    log.info('Initializing Storage Manager', { bucket, blockSize: BLCKSZ });
    this.bucket = bucket;
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.drime.cloud/v1';
    this.openFiles = new Map(); // fd -> metadata
    this.nextFd = 100; // Start after standard fds
  }

  /**
   * Create a new relation (file) in Drime storage
   * Equivalent to smgrcreate()
   */
  async smgrcreate(relnode, isRedo = false) {
    log.info('Creating relation', { relnode, isRedo });
    
    const objectKey = `${this.bucket}/${relnode}`;
    const response = await fetch(`${this.baseUrl}/objects/${objectKey}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/octet-stream'
      },
      body: Buffer.alloc(0) // Empty initial file
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create relation: ${response.statusText}`);
    }
    
    log.debug('Relation created', { objectKey });
    return true;
  }

  /**
   * Open a relation and return a file descriptor
   * Equivalent to smgropen()
   */
  async smgropen(relnode) {
    log.debug('Opening relation', { relnode });
    
    const fd = this.nextFd++;
    this.openFiles.set(fd, { relnode, blocks: [] });
    
    // Fetch existing blocks metadata
    const objectKey = `${this.bucket}/${relnode}`;
    try {
      const response = await fetch(`${this.baseUrl}/objects/${objectKey}/meta`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
      
      if (response.ok) {
        const meta = await response.json();
        // Parse block count from size
        const blockCount = Math.ceil(meta.size / BLCKSZ);
        this.openFiles.get(fd).blocks = Array(blockCount).fill(null);
      }
    } catch (err) {
      log.warn('Could not fetch metadata, starting fresh', { relnode });
    }
    
    log.debug('Relation opened', { fd, relnode });
    return fd;
  }

  /**
   * Read a block from storage
   * Equivalent to smgrread()
   */
  async smgrread(fd, blockNum) {
    const fileInfo = this.openFiles.get(fd);
    if (!fileInfo) {
      throw new Error(`Invalid file descriptor: ${fd}`);
    }
    
    log.debug('Reading block', { fd, relnode: fileInfo.relnode, blockNum });
    
    const objectKey = `${this.bucket}/${fileInfo.relnode}/${blockNum}`;
    const response = await fetch(`${this.baseUrl}/objects/${objectKey}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    
    if (!response.ok) {
      throw new Error(`Block ${blockNum} not found`);
    }
    
    const buffer = await response.arrayBuffer();
    const data = Buffer.from(buffer);
    
    if (data.length !== BLCKSZ) {
      throw new Error(`Invalid block size: ${data.length}, expected ${BLCKSZ}`);
    }
    
    // Verify checksum if enabled
    const checksum = data.readUInt32LE(0);
    if (checksum !== 0) {
      const computedChecksum = crc32c(data.slice(4));
      if (checksum !== computedChecksum) {
        log.error('Checksum mismatch', { blockNum, expected: checksum, got: computedChecksum });
        throw new Error('Page checksum failed');
      }
    }
    
    log.debug('Block read successful', { blockNum, checksum });
    return data;
  }

  /**
   * Write a block to storage
   * Equivalent to smgrextend() or smgrwrite()
   */
  async smgrwrite(fd, blockNum, data) {
    const fileInfo = this.openFiles.get(fd);
    if (!fileInfo) {
      throw new Error(`Invalid file descriptor: ${fd}`);
    }
    
    if (data.length !== BLCKSZ) {
      throw new Error(`Invalid data size: ${data.length}, expected ${BLCKSZ}`);
    }
    
    log.debug('Writing block', { fd, relnode: fileInfo.relnode, blockNum });
    
    // Calculate and set checksum
    const checksum = crc32c(data.slice(4));
    data.writeUInt32LE(checksum, 0);
    
    const objectKey = `${this.bucket}/${fileInfo.relnode}/${blockNum}`;
    const response = await fetch(`${this.baseUrl}/objects/${objectKey}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/octet-stream'
      },
      body: data
    });
    
    if (!response.ok) {
      throw new Error(`Failed to write block: ${response.statusText}`);
    }
    
    // Update local metadata
    if (blockNum >= fileInfo.blocks.length) {
      fileInfo.blocks.length = blockNum + 1;
    }
    fileInfo.blocks[blockNum] = data;
    
    log.info('Block written', { blockNum, checksum });
    return true;
  }

  /**
   * Extend a relation with a new block
   */
  async smgrextend(fd, data) {
    const fileInfo = this.openFiles.get(fd);
    const blockNum = fileInfo.blocks.length;
    return await this.smgrwrite(fd, blockNum, data);
  }

  /**
   * Truncate a relation to specified blocks
   */
  async smgrtruncate(fd, nblocks) {
    const fileInfo = this.openFiles.get(fd);
    log.info('Truncating relation', { fd, relnode: fileInfo.relnode, newBlocks: nblocks });
    
    // Delete blocks beyond nblocks
    for (let i = nblocks; i < fileInfo.blocks.length; i++) {
      const objectKey = `${this.bucket}/${fileInfo.relnode}/${i}`;
      await fetch(`${this.baseUrl}/objects/${objectKey}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });
    }
    
    fileInfo.blocks.length = nblocks;
    return true;
  }

  /**
   * Close a relation
   */
  smgrclose(fd) {
    log.debug('Closing relation', { fd });
    this.openFiles.delete(fd);
  }

  /**
   * Unlink (delete) a relation
   */
  async smgrunlink(relnode) {
    log.info('Unlinking relation', { relnode });
    
    const objectKey = `${this.bucket}/${relnode}`;
    // Delete all blocks
    const response = await fetch(`${this.baseUrl}/objects/${objectKey}?recursive=true`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to unlink relation: ${response.statusText}`);
    }
    
    log.info('Relation unlinked', { relnode });
    return true;
  }
}
