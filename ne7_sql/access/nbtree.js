/**
 * NE7-SQL - B-Tree Index Access Method (nbtree rewrite)
 * Implements PostgreSQL _bt_search, _bt_insert, _bt_split
 */

import { BLCKSZ, SizeOfPageHeaderData } from '../core/constants.js';
import { logger } from '../core/logger.js';
import { PageOperations } from '../buffer/page_ops.js';
import { ItemPointer } from '../buffer/item_pointer.js';
import { getBufferPool } from '../buffer/buffer_mgr.js';

// B-Tree Page Types
export const BTREE_PAGE_LEAF = 0x01;
export const BTREE_PAGE_ROOT = 0x02;
export const BTREE_PAGE_DELETED = 0x04;

export class BTreePageHeader {
  constructor(view) {
    this.view = view;
    this.offset = SizeOfPageHeaderData; // After standard page header
  }

  init(pageType, level) {
    const dv = new DataView(this.view.buffer, this.offset, 16);
    // bt_page_type (2 bytes)
    dv.setUint16(0, pageType, true);
    // bt_level (2 bytes) - distance from leaf
    dv.setUint16(2, level, true);
    // bt_prev (4 bytes) - previous block (0 for first)
    dv.setInt32(4, 0, true);
    // bt_next (4 bytes) - next block (0 for last)
    dv.setInt32(8, 0, true);
    // padding (4 bytes)
    dv.setInt32(12, 0, true);
    
    logger.debug('B-Tree page header initialized', { 
      pageType, 
      level,
      location: 'nbtree.js:BTreePageHeader:init' 
    });
  }

  getPageType() {
    const dv = new DataView(this.view.buffer, this.offset, 2);
    return dv.getUint16(0, true);
  }

  getLevel() {
    const dv = new DataView(this.view.buffer, this.offset + 2, 2);
    return dv.getUint16(0, true);
  }

  getPrev() {
    const dv = new DataView(this.view.buffer, this.offset + 4, 4);
    return dv.getInt32(0, true);
  }

  setPrev(blockNum) {
    const dv = new DataView(this.view.buffer, this.offset + 4, 4);
    dv.setInt32(0, blockNum, true);
  }

  getNext() {
    const dv = new DataView(this.view.buffer, this.offset + 8, 4);
    return dv.getInt32(0, true);
  }

  setNext(blockNum) {
    const dv = new DataView(this.view.buffer, this.offset + 8, 4);
    dv.setInt32(0, blockNum, true);
  }
}

export class BTreeItem {
  constructor(key, tid, isLeaf = true) {
    this.key = key; // The indexed value
    this.tid = tid; // ItemPointer to heap tuple
    this.isLeaf = isLeaf;
  }

  toBytes() {
    // Simple encoding: key length (2) + key data + block (4) + offset (2)
    const keyBytes = new TextEncoder().encode(JSON.stringify(this.key));
    const totalLen = 2 + keyBytes.length + 4 + 2;
    const bytes = new Uint8Array(totalLen);
    const dv = new DataView(bytes.buffer);
    
    dv.setUint16(0, keyBytes.length, true);
    bytes.set(keyBytes, 2);
    dv.setInt32(2 + keyBytes.length, this.tid.blockNumber, true);
    dv.setUint16(6 + keyBytes.length, this.tid.offsetNumber, true);
    
    return bytes;
  }

  static fromBytes(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    const keyLen = dv.getUint16(0, true);
    const keyStr = new TextDecoder().decode(bytes.slice(2, 2 + keyLen));
    const key = JSON.parse(keyStr);
    const blockNum = dv.getInt32(2 + keyLen, true);
    const offsetNum = dv.getUint16(6 + keyLen, true);
    const tid = new ItemPointer(blockNum, offsetNum);
    
    return new BTreeItem(key, tid, true);
  }
}

export class BTreeAccessMethod {
  constructor(storageMgr, bufferPool) {
    this.storageMgr = storageMgr;
    this.bufferPool = bufferPool || getBufferPool();
    logger.info('B-Tree access method initialized', { location: 'nbtree.js:constructor' });
  }

  // Search for a key in the B-Tree
  async btSearch(indexRelOid, key) {
    logger.debug('bt_search started', { 
      indexRelOid, 
      key,
      location: 'nbtree.js:btSearch' 
    });

    // Start from root (block 0)
    let blockNum = 0;
    let currentLevel = -1;

    while (true) {
      const buffer = await this.bufferPool.getBuffer(indexRelOid, blockNum, this.storageMgr);
      const pageOps = new PageOperations(buffer.view);
      const btHeader = new BTreePageHeader(buffer.view);
      
      const level = btHeader.getLevel();
      if (currentLevel === -1) {
        currentLevel = level;
      }

      const numItems = pageOps.getNumItems();
      let found = false;
      let nextBlock = -1;

      for (let i = 1; i <= numItems; i++) {
        const item = pageOps.getItem(i);
        if (!item) continue;

        const btItem = BTreeItem.fromBytes(item.data);
        
        if (this.compareKeys(btItem.key, key) >= 0) {
          if (level === 0) {
            // Leaf level - check if match
            if (this.compareKeys(btItem.key, key) === 0) {
              logger.debug('Key found in leaf', { 
                key, 
                tid: btItem.tid.toString(),
                location: 'nbtree.js:btSearch' 
              });
              buffer.unpin();
              return btItem.tid;
            }
          } else {
            // Internal node - go to child
            nextBlock = btItem.tid.blockNumber;
          }
          found = true;
          break;
        }
      }

      buffer.unpin();

      if (level === 0) {
        // Reached leaf without finding key
        logger.debug('Key not found', { key, location: 'nbtree.js:btSearch' });
        return null;
      }

      if (!found && nextBlock === -1) {
        // Go to rightmost child
        const buffer = await this.bufferPool.getBuffer(indexRelOid, blockNum, this.storageMgr);
        const pageOps = new PageOperations(buffer.view);
        const numItems = pageOps.getNumItems();
        if (numItems > 0) {
          const item = pageOps.getItem(numItems);
          const btItem = BTreeItem.fromBytes(item.data);
          nextBlock = btItem.tid.blockNumber;
        }
        buffer.unpin();
      }

      if (nextBlock === -1) {
        logger.debug('No more blocks to search', { location: 'nbtree.js:btSearch' });
        return null;
      }

      blockNum = nextBlock;
    }
  }

  // Insert a key-value pair into the B-Tree
  async btInsert(indexRelOid, key, tid) {
    logger.debug('bt_insert started', { 
      indexRelOid, 
      key, 
      tid: tid.toString(),
      location: 'nbtree.js:btInsert' 
    });

    const btItem = new BTreeItem(key, tid, true);
    const itemData = btItem.toBytes();

    // Find leaf page for insertion
    let blockNum = this.findLeafPage(indexRelOid, key);
    let buffer = await this.bufferPool.getBuffer(indexRelOid, blockNum, this.storageMgr);
    let pageOps = new PageOperations(buffer.view);

    // Check if page has space
    if (!pageOps.canFit(itemData.length)) {
      // Need to split
      logger.info('Page split required', { 
        blockNum, 
        location: 'nbtree.js:btInsert' 
      });
      await this.btSplit(indexRelOid, blockNum, key, tid);
      buffer.unpin();
      return;
    }

    // Insert item in sorted order
    const itemIdIndex = pageOps.addItem(itemData);
    buffer.markDirty();
    buffer.unpin();

    logger.info('Key inserted successfully', { 
      indexRelOid, 
      key, 
      tid: tid.toString(),
      location: 'nbtree.js:btInsert' 
    });
  }

  // Find leaf page for a key
  async findLeafPage(indexRelOid, key) {
    let blockNum = 0;
    let level = -1;

    while (true) {
      const buffer = await this.bufferPool.getBuffer(indexRelOid, blockNum, this.storageMgr);
      const btHeader = new BTreePageHeader(buffer.view);
      const currentPageLevel = btHeader.getLevel();
      
      if (level === -1) {
        level = currentPageLevel;
      }

      if (currentPageLevel === 0) {
        buffer.unpin();
        return blockNum;
      }

      const pageOps = new PageOperations(buffer.view);
      const numItems = pageOps.getNumItems();
      let nextBlock = -1;

      for (let i = 1; i <= numItems; i++) {
        const item = pageOps.getItem(i);
        if (!item) continue;
        const btItem = BTreeItem.fromBytes(item.data);
        if (this.compareKeys(btItem.key, key) >= 0) {
          nextBlock = btItem.tid.blockNumber;
          break;
        }
      }

      buffer.unpin();

      if (nextBlock === -1 && numItems > 0) {
        const item = pageOps.getItem(numItems);
        const btItem = BTreeItem.fromBytes(item.data);
        nextBlock = btItem.tid.blockNumber;
      }

      if (nextBlock === -1) {
        return blockNum;
      }

      blockNum = nextBlock;
    }
  }

  // Split a page
  async btSplit(indexRelOid, blockNum, key, tid) {
    logger.info('bt_split started', { 
      blockNum, 
      location: 'nbtree.js:btSplit' 
    });

    const buffer = await this.bufferPool.getBuffer(indexRelOid, blockNum, this.storageMgr);
    const pageOps = new PageOperations(buffer.view);
    const btHeader = new BTreePageHeader(buffer.view);
    const level = btHeader.getLevel();

    // Collect all items including new one
    const items = [];
    const numItems = pageOps.getNumItems();
    for (let i = 1; i <= numItems; i++) {
      const item = pageOps.getItem(i);
      if (item) {
        items.push(BTreeItem.fromBytes(item.data));
      }
    }

    // Add new item
    const newItem = new BTreeItem(key, tid, level === 0);
    items.push(newItem);

    // Sort items by key
    items.sort((a, b) => this.compareKeys(a.key, b.key));

    // Split in half
    const midPoint = Math.floor(items.length / 2);
    const leftItems = items.slice(0, midPoint);
    const rightItems = items.slice(midPoint);

    // Clear original page and add left items
    pageOps.compact();
    for (const item of leftItems) {
      pageOps.addItem(item.toBytes());
    }
    buffer.markDirty();
    buffer.unpin();

    // Create new right page
    const newBlockNum = await this.allocateNewPage(indexRelOid);
    const newBuffer = await this.bufferPool.getBuffer(indexRelOid, newBlockNum, this.storageMgr);
    const newPageOps = new PageOperations(newBuffer.view);
    const newBtHeader = new BTreePageHeader(newBuffer.view);
    newBtHeader.init(btHeader.getPageType(), level);

    // Link pages
    const oldNext = btHeader.getNext();
    btHeader.setNext(newBlockNum);
    newBtHeader.setPrev(blockNum);
    newBtHeader.setNext(oldNext);

    // Add right items to new page
    for (const item of rightItems) {
      newPageOps.addItem(item.toBytes());
    }

    newBuffer.markDirty();
    newBuffer.unpin();

    // If this was root, create new root
    if (blockNum === 0) {
      await this.createNewRoot(indexRelOid, leftItems[leftItems.length - 1], newBlockNum);
    } else {
      // Insert pivot into parent
      const pivotKey = leftItems[leftItems.length - 1].key;
      const pivotTid = new ItemPointer(newBlockNum, 1);
      await this.btInsert(indexRelOid, pivotKey, pivotTid);
    }

    logger.info('Page split completed', { 
      blockNum, 
      newBlockNum,
      location: 'nbtree.js:btSplit' 
    });
  }

  // Allocate a new page
  async allocateNewPage(indexRelOid) {
    // Find first unused block
    let blockNum = 1;
    while (true) {
      try {
        const buffer = await this.bufferPool.getBuffer(indexRelOid, blockNum, this.storageMgr);
        const pageOps = new PageOperations(buffer.view);
        if (pageOps.getNumItems() === 0) {
          buffer.unpin();
          return blockNum;
        }
        buffer.unpin();
        blockNum++;
      } catch (e) {
        return blockNum;
      }
    }
  }

  // Create new root after split
  async createNewRoot(indexRelOid, pivotItem, rightBlock) {
    logger.info('Creating new root', { location: 'nbtree.js:createNewRoot' });

    const buffer = await this.bufferPool.getBuffer(indexRelOid, 0, this.storageMgr);
    const pageOps = new PageOperations(buffer.view);
    const btHeader = new BTreePageHeader(buffer.view);
    
    // Initialize as internal node
    btHeader.init(BTREE_PAGE_ROOT, 1);
    
    // Clear existing items
    pageOps.compact();

    // Add pivot pointing to right block
    const pivotTid = new ItemPointer(rightBlock, 1);
    const pivot = new BTreeItem(pivotItem.key, pivotTid, false);
    pageOps.addItem(pivot.toBytes());

    // Add left child pointer
    const leftTid = new ItemPointer(0, 1); // Original root is now left child
    const leftItem = new BTreeItem(null, leftTid, false);
    pageOps.addItem(leftItem.toBytes());

    buffer.markDirty();
    buffer.unpin();
  }

  // Compare keys
  compareKeys(a, b) {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b;
    }
    return String(a).localeCompare(String(b));
  }
}

logger.info('B-Tree access method module loaded', { location: 'nbtree.js:module' });
