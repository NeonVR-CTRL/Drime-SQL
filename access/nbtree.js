/**
 * DRIME.SQL - B-Tree Index Access Method
 * Rewritten from PostgreSQL 18.6 src/backend/access/nbtree/nbtinsert.c
 */

import { logger } from '../core/logger.js';
import { PageInit, PageAddItem, PageGetItem } from '../buffer/page_ops.js';

export class BTreeIndex {
    constructor(bufferMgr) {
        this.bufferMgr = bufferMgr;
        logger.info('BTreeIndex initialized', { module: 'nbtree' });
    }

    async create(indexId) {
        // Create root page (initially empty leaf)
        const buffer = await this.bufferMgr.readBuffer(indexId, 0);
        await PageInit(buffer.page);
        buffer.dirty = true;
        logger.info('B-Tree root created', { indexId, module: 'nbtree' });
    }

    async insert(indexId, key, value) {
        logger.debug('B-Tree insert', { indexId, key, module: 'nbtree' });
        
        // Simple implementation: find leaf, insert key
        const leafBuffer = await this._findLeaf(indexId, key);
        const itemData = JSON.stringify({ key, value });
        
        const offset = await PageAddItem(leafBuffer.page, new TextEncoder().encode(itemData));
        leafBuffer.dirty = true;
        
        logger.info('Key inserted', { indexId, key, offset, module: 'nbtree' });
        return { success: true };
    }

    async search(indexId, key) {
        logger.debug('B-Tree search', { indexId, key, module: 'nbtree' });
        
        const leafBuffer = await this._findLeaf(indexId, key);
        const decoder = new TextDecoder();
        const results = [];
        
        // Scan page for matching keys
        const itemSize = 4;
        const SIZEOF_PAGE_HEADER = 24;
        for (let offset = 1; offset * itemSize < (leafBuffer.page.header.lower - SIZEOF_PAGE_HEADER); offset++) {
            const itemBytes = await PageGetItem(leafBuffer.page, offset);
            if (!itemBytes) continue;
            
            const item = JSON.parse(decoder.decode(itemBytes));
            if (item.key === key) {
                results.push({ offset, value: item.value });
            }
        }
        
        logger.info('Search completed', { indexId, key, found: results.length, module: 'nbtree' });
        return results;
    }

    async _findLeaf(indexId, key) {
        // Simplified: always return block 0 (root/leaf)
        // Real implementation would traverse internal nodes
        return await this.bufferMgr.readBuffer(indexId, 0);
    }
}
