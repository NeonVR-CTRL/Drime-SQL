/**
 * NE7-SQL - Buffer Manager (bufmgr rewrite)
 * Implements PostgreSQL shared buffer pool with LRU eviction
 */

import { BLCKSZ, MAXALIGN, SizeOfPageHeaderData } from '../core/constants.js';
import { logger } from '../core/logger.js';
import { PageHeader } from './page_header.js';

export class BufferDesc {
  constructor(blockId) {
    this.blockId = blockId;
    this.frame = new ArrayBuffer(BLCKSZ);
    this.view = new Uint8Array(this.frame);
    this.pinCount = 0;
    this.dirty = false;
    this.usageCount = 0;
    this.relOid = null;
    this.blockNum = -1;
    logger.debug('BufferDesc created', { blockId, location: 'buffer_mgr.js:BufferDesc' });
  }

  pin() {
    this.pinCount++;
    logger.debug('Buffer pinned', { blockId: this.blockId, pinCount: this.pinCount, location: 'buffer_mgr.js:pin' });
  }

  unpin() {
    if (this.pinCount > 0) {
      this.pinCount--;
      logger.debug('Buffer unpinned', { blockId: this.blockId, pinCount: this.pinCount, location: 'buffer_mgr.js:unpin' });
    }
  }

  incrementUsage() {
    this.usageCount = Math.min(this.usageCount + 1, 255);
  }

  resetUsage() {
    this.usageCount = 0;
  }

  markDirty() {
    this.dirty = true;
    logger.debug('Buffer marked dirty', { blockId: this.blockId, location: 'buffer_mgr.js:markDirty' });
  }

  markClean() {
    this.dirty = false;
    logger.debug('Buffer marked clean', { blockId: this.blockId, location: 'buffer_mgr.js:markClean' });
  }
}

export class SharedBufferPool {
  constructor(size = 128) { // Default 128 buffers (1MB)
    this.buffers = new Array(size);
    this.freeList = [];
    this.hashMap = new Map(); // relOid:blockNum -> bufferIndex
    this.size = size;
    
    for (let i = 0; i < size; i++) {
      this.buffers[i] = new BufferDesc(i);
      this.freeList.push(i);
    }
    
    logger.info('Shared buffer pool initialized', { 
      size, 
      totalMemory: size * BLCKSZ, 
      location: 'buffer_mgr.js:SharedBufferPool' 
    });
  }

  findBuffer(relOid, blockNum) {
    const key = `${relOid}:${blockNum}`;
    const index = this.hashMap.get(key);
    if (index !== undefined) {
      const buffer = this.buffers[index];
      buffer.incrementUsage();
      logger.debug('Buffer found in pool', { relOid, blockNum, index, location: 'buffer_mgr.js:findBuffer' });
      return buffer;
    }
    logger.debug('Buffer not found', { relOid, blockNum, location: 'buffer_mgr.js:findBuffer' });
    return null;
  }

  async getBuffer(relOid, blockNum, storageMgr) {
    let buffer = this.findBuffer(relOid, blockNum);
    
    if (buffer) {
      buffer.pin();
      return buffer;
    }
    
    // Need to allocate new buffer
    let bufferIndex;
    if (this.freeList.length > 0) {
      bufferIndex = this.freeList.pop();
    } else {
      bufferIndex = this.findVictim();
      if (bufferIndex === -1) {
        throw new Error('No free buffers available');
      }
      const victim = this.buffers[bufferIndex];
      if (victim.dirty) {
        await this.flushBuffer(victim, storageMgr);
      }
      this.removeBufferFromHash(victim);
    }
    
    buffer = this.buffers[bufferIndex];
    buffer.relOid = relOid;
    buffer.blockNum = blockNum;
    buffer.pinCount = 1;
    buffer.dirty = false;
    buffer.usageCount = 1;
    
    const key = `${relOid}:${blockNum}`;
    this.hashMap.set(key, bufferIndex);
    
    // Read from storage
    const data = await storageMgr.readBlock(relOid, blockNum);
    if (data) {
      buffer.view.set(data);
      logger.debug('Buffer loaded from storage', { relOid, blockNum, location: 'buffer_mgr.js:getBuffer' });
    } else {
      // New block, initialize page header
      this.initializeNewPage(buffer.view);
      logger.debug('New buffer initialized', { relOid, blockNum, location: 'buffer_mgr.js:getBuffer' });
    }
    
    return buffer;
  }

  findVictim() {
    // Clock sweep algorithm for LRU
    let startIndex = Math.floor(Math.random() * this.size);
    for (let i = 0; i < this.size; i++) {
      const index = (startIndex + i) % this.size;
      const buffer = this.buffers[index];
      if (buffer.pinCount === 0) {
        if (buffer.usageCount === 0) {
          return index;
        }
        buffer.usageCount--;
      }
    }
    return -1;
  }

  removeBufferFromHash(buffer) {
    if (buffer.relOid !== null && buffer.blockNum >= 0) {
      const key = `${buffer.relOid}:${buffer.blockNum}`;
      this.hashMap.delete(key);
    }
  }

  async flushBuffer(buffer, storageMgr) {
    if (buffer.dirty && buffer.relOid !== null && buffer.blockNum >= 0) {
      await storageMgr.writeBlock(buffer.relOid, buffer.blockNum, buffer.view);
      buffer.markClean();
      logger.info('Buffer flushed to storage', { 
        relOid: buffer.relOid, 
        blockNum: buffer.blockNum, 
        location: 'buffer_mgr.js:flushBuffer' 
      });
    }
  }

  initializeNewPage(view) {
    const header = new PageHeader(view);
    header.init();
    logger.debug('New page initialized', { location: 'buffer_mgr.js:initializeNewPage' });
  }

  async writeAllDirty(storageMgr) {
    for (const buffer of this.buffers) {
      if (buffer.dirty && buffer.relOid !== null && buffer.blockNum >= 0) {
        await this.flushBuffer(buffer, storageMgr);
      }
    }
    logger.info('All dirty buffers flushed', { location: 'buffer_mgr.js:writeAllDirty' });
  }
}

// Global buffer pool instance
let globalBufferPool = null;

export function getBufferPool(size = 128) {
  if (!globalBufferPool) {
    globalBufferPool = new SharedBufferPool(size);
  }
  return globalBufferPool;
}

logger.info('Buffer manager module loaded', { location: 'buffer_mgr.js:module' });
