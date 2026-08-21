/**
 * NE7-SQL - Page Operations
 * Implements PostgreSQL page manipulation functions
 */

import { BLCKSZ, SizeOfPageHeaderData, MAXALIGN } from '../core/constants.js';
import { logger } from '../core/logger.js';
import { PageHeader } from './page_header.js';
import { ItemId, MaxItemIdIndex } from './item_pointer.js';

export class PageOperations {
  constructor(view) {
    this.view = view;
    this.header = new PageHeader(view);
  }

  // Initialize a new page
  static pageInit(view) {
    const header = new PageHeader(view);
    header.init();
    logger.debug('Page initialized', { location: 'page_ops.js:pageInit' });
  }

  // Get available space on page
  getFreeSpace() {
    return this.header.getFreeSpace();
  }

  // Check if page can fit an item
  canFit(itemSize) {
    // Need space for item + ItemId (4 bytes)
    const totalNeeded = itemSize + 4;
    const alignedSize = this.align(totalNeeded);
    return this.header.getFreeSpace() >= alignedSize;
  }

  // Add item to page
  addItem(data) {
    const itemSize = data.byteLength || data.length;
    const alignedSize = this.align(itemSize + 4); // Include ItemId space
    
    if (!this.canFit(alignedSize)) {
      logger.warn('Page full, cannot add item', { 
        itemSize, 
        freeSpace: this.getFreeSpace(),
        location: 'page_ops.js:addItem' 
      });
      return -1;
    }

    const lower = this.header.getLower();
    const upper = this.header.getUpper();
    
    // Place item at upper end of free space
    const itemOffset = upper - itemSize;
    
    // Copy item data
    if (data instanceof Uint8Array) {
      this.view.set(data, itemOffset);
    } else if (data instanceof ArrayBuffer) {
      this.view.set(new Uint8Array(data), itemOffset);
    } else {
      throw new Error('Unsupported data type for page item');
    }

    // Create ItemId entry
    const itemIdIndex = this.getNumItems() + 1;
    if (itemIdIndex > MaxItemIdIndex) {
      logger.error('Too many items on page', { 
        itemIdIndex, 
        MaxItemIdIndex,
        location: 'page_ops.js:addItem' 
      });
      return -1;
    }

    // Store ItemId in line pointer array (starts after header)
    const itemIdOffset = SizeOfPageHeaderData + ((itemIdIndex - 1) * 4);
    const itemIdBytes = new ItemId(itemOffset, itemSize).toBytes();
    this.view.set(itemIdBytes, itemIdOffset);

    // Update page header
    this.header.setLower(lower + 4); // Move lower up by ItemId size
    this.header.setUpper(itemOffset); // Move upper down by item size

    logger.debug('Item added to page', { 
      itemIdIndex, 
      itemOffset, 
      itemSize,
      location: 'page_ops.js:addItem' 
    });

    return itemIdIndex;
  }

  // Get item by index
  getItem(itemIdIndex) {
    if (itemIdIndex < 1 || itemIdIndex > MaxItemIdIndex) {
      logger.warn('Invalid item index', { itemIdIndex, location: 'page_ops.js:getItem' });
      return null;
    }

    const itemIdOffset = SizeOfPageHeaderData + ((itemIdIndex - 1) * 4);
    const itemIdBytes = this.view.slice(itemIdOffset, itemIdOffset + 4);
    const itemId = ItemId.fromBytes(itemIdBytes);

    if (!itemId.isValid()) {
      logger.debug('Item not used', { itemIdIndex, location: 'page_ops.js:getItem' });
      return null;
    }

    const offset = itemId.getOffset();
    const len = itemId.getLength();
    const itemData = this.view.slice(offset, offset + len);

    logger.debug('Item retrieved', { 
      itemIdIndex, 
      offset, 
      len,
      location: 'page_ops.js:getItem' 
    });

    return {
      itemId,
      data: itemData,
      offset,
      length: len
    };
  }

  // Get number of items on page
  getNumItems() {
    const lower = this.header.getLower();
    return Math.floor((lower - SizeOfPageHeaderData) / 4);
  }

  // Align size to MAXALIGN boundary
  align(size) {
    return ((size) + (MAXALIGN - 1)) & ~(MAXALIGN - 1);
  }

  // Delete item by marking it unused
  deleteItem(itemIdIndex) {
    if (itemIdIndex < 1 || itemIdIndex > MaxItemIdIndex) {
      return false;
    }

    const itemIdOffset = SizeOfPageHeaderData + ((itemIdIndex - 1) * 4);
    const unusedItemId = new ItemId(0, 0);
    this.view.set(unusedItemId.toBytes(), itemIdOffset);

    logger.debug('Item deleted', { 
      itemIdIndex, 
      location: 'page_ops.js:deleteItem' 
    });

    return true;
  }

  // Compact page (defragment)
  compact() {
    logger.info('Page compaction started', { location: 'page_ops.js:compact' });
    
    // Collect all valid items
    const numItems = this.getNumItems();
    const validItems = [];
    
    for (let i = 1; i <= numItems; i++) {
      const item = this.getItem(i);
      if (item && item.itemId.isValid()) {
        validItems.push({ index: i, data: item.data });
      }
    }

    // Reinitialize page
    this.header.init();

    // Re-add all valid items
    for (const item of validItems) {
      this.addItem(item.data);
    }

    logger.info('Page compaction completed', { 
      itemsCompacted: validItems.length,
      location: 'page_ops.js:compact' 
    });
  }

  // Verify page integrity
  verify() {
    const numItems = this.getNumItems();
    const errors = [];

    if (numItems < 0 || numItems > MaxItemIdIndex) {
      errors.push(`Invalid number of items: ${numItems}`);
    }

    const lower = this.header.getLower();
    const upper = this.header.getUpper();
    
    if (lower > upper) {
      errors.push(`Lower (${lower}) > Upper (${upper})`);
    }

    if (lower < SizeOfPageHeaderData) {
      errors.push(`Lower (${lower}) < Header size (${SizeOfPageHeaderData})`);
    }

    if (errors.length > 0) {
      logger.error('Page verification failed', { 
        errors, 
        location: 'page_ops.js:verify' 
      });
      return false;
    }

    logger.debug('Page verified successfully', { 
      numItems, 
      freeSpace: this.getFreeSpace(),
      location: 'page_ops.js:verify' 
    });

    return true;
  }
}

logger.debug('Page operations module loaded', { location: 'page_ops.js:module' });
