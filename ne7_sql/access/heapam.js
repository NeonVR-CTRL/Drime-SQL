/**
 * NE7-SQL - Heap Access Method (heapam rewrite)
 * Implements PostgreSQL heap_insert, heap_update, heap_delete
 */

import { BLCKSZ, SizeOfPageHeaderData } from '../core/constants.js';
import { logger } from '../core/logger.js';
import { PageOperations } from '../buffer/page_ops.js';
import { ItemPointer } from '../buffer/item_pointer.js';
import { getBufferPool } from '../buffer/buffer_mgr.js';

export class HeapTupleHeader {
  constructor(t_xmin, t_xmax, t_ctid) {
    this.t_xmin = t_xmin; // Transaction ID that inserted tuple
    this.t_xmax = t_xmax; // Transaction ID that deleted tuple (0 if live)
    this.t_ctid = t_ctid; // Current TID (self pointer)
    this.t_hoff = 24; // Header offset (fixed for now)
    this.t_infomask = 0;
  }

  toBytes() {
    const bytes = new Uint8Array(this.t_hoff);
    const dv = new DataView(bytes.buffer);
    
    // t_xmin (4 bytes)
    dv.setUint32(0, this.t_xmin, true);
    // t_xmax (4 bytes)
    dv.setUint32(4, this.t_xmax, true);
    // t_cid (4 bytes) - command ID
    dv.setUint32(8, 0, true);
    // t_ctid (6 bytes) - block (4) + offset (2)
    dv.setInt32(12, this.t_ctid.blockNumber, true);
    dv.setUint16(16, this.t_ctid.offsetNumber, true);
    // t_infomask2 (2 bytes)
    dv.setUint16(18, 0, true);
    // t_infomask (2 bytes)
    dv.setUint16(20, this.t_infomask, true);
    // t_hoff (1 byte) - but we use full header
    dv.setUint8(22, this.t_hoff);
    // t_bits (variable, skipped for now)
    
    return bytes;
  }

  static fromBytes(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    const t_xmin = dv.getUint32(0, true);
    const t_xmax = dv.getUint32(4, true);
    const blockNum = dv.getInt32(12, true);
    const offsetNum = dv.getUint16(16, true);
    const t_ctid = new ItemPointer(blockNum, offsetNum);
    
    return new HeapTupleHeader(t_xmin, t_xmax, t_ctid);
  }
}

export class HeapAccessMethod {
  constructor(storageMgr, bufferPool, transactionMgr) {
    this.storageMgr = storageMgr;
    this.bufferPool = bufferPool || getBufferPool();
    this.transactionMgr = transactionMgr;
    logger.info('Heap access method initialized', { location: 'heapam.js:constructor' });
  }

  // Insert a tuple into a relation
  async heapInsert(relOid, data, xid) {
    logger.debug('heap_insert started', { 
      relOid, 
      xid, 
      dataSize: data.length,
      location: 'heapam.js:heapInsert' 
    });

    const tupleHeader = new HeapTupleHeader(xid, 0, new ItemPointer(0, 0));
    const headerBytes = tupleHeader.toBytes();
    
    // Combine header and data
    const tupleData = new Uint8Array(headerBytes.length + data.length);
    tupleData.set(headerBytes);
    tupleData.set(data, headerBytes.length);

    // Find or create first block
    let blockNum = 0;
    let buffer = await this.bufferPool.getBuffer(relOid, blockNum, this.storageMgr);
    let pageOps = new PageOperations(buffer.view);

    // Try to find space
    let attempts = 0;
    while (!pageOps.canFit(tupleData.length) && attempts < 100) {
      // Flush and get next block
      if (buffer.dirty) {
        await this.bufferPool.flushBuffer(buffer, this.storageMgr);
      }
      buffer.unpin();
      
      blockNum++;
      buffer = await this.bufferPool.getBuffer(relOid, blockNum, this.storageMgr);
      pageOps = new PageOperations(buffer.view);
      attempts++;
    }

    if (attempts >= 100) {
      logger.error('Could not find space for tuple', { 
        relOid, 
        location: 'heapam.js:heapInsert' 
      });
      throw new Error('No space for tuple insertion');
    }

    // Add tuple to page
    let itemIdIndex = pageOps.addItem(tupleData);
    if (itemIdIndex < 0) {
      throw new Error('Failed to add item to page');
    }

    // Update tuple's self-pointer (t_ctid)
    tupleHeader.t_ctid = new ItemPointer(blockNum, itemIdIndex);
    const updatedHeaderBytes = tupleHeader.toBytes();
    const offset = SizeOfPageHeaderData + ((itemIdIndex - 1) * 4);
    const item = pageOps.getItem(itemIdIndex);
    if (item) {
            buffer.view.set(updatedHeaderBytes, item.offset);
        }
        buffer.markDirty();
        buffer.unpin();
        const tid = new ItemPointer(blockNum, itemIdIndex || itemIdIndex);
    logger.info('Tuple inserted successfully', { 
      relOid, 
      tid: tid.toString(),
      xid,
      location: 'heapam.js:heapInsert' 
    });

    return tid;
  }

  // Get tuple by TID
  async heapGetTuple(relOid, tid) {
    logger.debug('heap_get_tuple started', { 
      relOid, 
      tid: tid.toString(),
      location: 'heapam.js:heapGetTuple' 
    });

    const buffer = await this.bufferPool.getBuffer(relOid, tid.blockNumber, this.storageMgr);
    const pageOps = new PageOperations(buffer.view);
    
    const item = pageOps.getItem(tid.offsetNumber);
    buffer.unpin();

    if (!item) {
      logger.warn('Tuple not found', { 
        relOid, 
        tid: tid.toString(),
        location: 'heapam.js:heapGetTuple' 
      });
      return null;
    }

    const header = HeapTupleHeader.fromBytes(item.data);
    const tupleData = item.data.slice(header.t_hoff);

    logger.debug('Tuple retrieved', { 
      relOid, 
      tid: tid.toString(),
      xmin: header.t_xmin,
      xmax: header.t_xmax,
      location: 'heapam.js:heapGetTuple' 
    });

    return {
      header,
      data: tupleData,
      raw: item.data
    };
  }

  // Scan all tuples in a relation
  async *heapScan(relOid, snapshot) {
        logger.debug('heap_scan started', {
            relOid,
            location: 'heapam.js:heapScan'
        });
        let blockNum = 0;
        const MAX_BLOCKS = 1000; // Safety limit
        let emptyBlockCount = 0;
        const EMPTY_BLOCK_LIMIT = 3; // Stop after 3 consecutive empty blocks
    while (true) {
      try {
        const buffer = await this.bufferPool.getBuffer(relOid, blockNum, this.storageMgr);
        const pageOps = new PageOperations(buffer.view);
        const numItems = pageOps.getNumItems();

                // Stop if we hit consecutive empty blocks
                if (numItems === 0) {
                    emptyBlockCount++;
                    if (emptyBlockCount >= EMPTY_BLOCK_LIMIT || blockNum >= MAX_BLOCKS) {
                        buffer.unpin();
                        break;
                    }
                    buffer.unpin();
                    blockNum++;
                    continue;
                }
                emptyBlockCount = 0; // Reset on non-empty block

        for (let itemIdIndex = 1; itemIdIndex <= numItems; itemIdIndex++) {
          const item = pageOps.getItem(itemIdIndex);
          if (item && item.itemId.isValid()) {
            const header = HeapTupleHeader.fromBytes(item.data);
            
            // Check visibility with MVCC
            if (snapshot && !this.transactionMgr.isVisible(header, snapshot)) {
              continue;
            }

            const tupleData = item.data.slice(header.t_hoff);
            const tid = new ItemPointer(blockNum, itemIdIndex);

            yield {
              header,
              data: tupleData,
              tid,
              raw: item.data
            };
          }
        }

        buffer.unpin();
        blockNum++;
      } catch (e) {
        // No more blocks
        break;
      }
    }

    logger.debug('heap_scan completed', { 
      relOid, 
      blocksScanned: blockNum,
      location: 'heapam.js:heapScan' 
    });
  }

  // Mark tuple for update/delete (sets xmax)
  async heapMarkForUpdate(relOid, tid, xid) {
    logger.debug('heap_mark_for_update started', { 
      relOid, 
      tid: tid.toString(),
      xid,
      location: 'heapam.js:heapMarkForUpdate' 
    });

    const buffer = await this.bufferPool.getBuffer(relOid, tid.blockNumber, this.storageMgr);
    const pageOps = new PageOperations(buffer.view);
    
    const item = pageOps.getItem(tid.offsetNumber);
    if (!item) {
      buffer.unpin();
      throw new Error('Tuple not found for update');
    }

    // Create new header with xmax set
    const oldHeader = HeapTupleHeader.fromBytes(item.data);
    const newHeader = new HeapTupleHeader(oldHeader.t_xmin, xid, oldHeader.t_ctid);
    const newHeaderBytes = newHeader.toBytes();

    // Rewrite tuple
    const newData = new Uint8Array(item.data.length);
    newData.set(newHeaderBytes);
    newData.set(item.data.slice(newHeaderBytes.length), newHeaderBytes.length);
    
    pageOps.deleteItem(tid.offsetNumber);
    pageOps.addItem(newData);
    
    buffer.markDirty();
    buffer.unpin();

    logger.info('Tuple marked for update', { 
      relOid, 
      tid: tid.toString(),
      newXmax: xid,
      location: 'heapam.js:heapMarkForUpdate' 
    });
  }
}

logger.info('Heap access method module loaded', { location: 'heapam.js:module' });
