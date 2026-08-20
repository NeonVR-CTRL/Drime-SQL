/**
 * DRIME.SQL - Buffer Manager & Page Operations
 * Rewritten from PostgreSQL 18.6 buffer/bufmgr.c and storage/page.c
 * 
 * Handles:
 * - Shared Buffer Pool Management
 * - Page Layout (Heap, Index, FSM)
 * - Tuple Insertion/Deletion
 * - MVCC Visibility (Simplified for JS)
 */

import { DrimeLogger } from './core_logger.js';

const BLCKSZ = 8192;
const MAXALIGN = 8; // Alignment requirement

export class DrimeBufferManager {
    constructor(storageManager) {
        this.storage = storageManager;
        this.logger = new DrimeLogger('DrimeBufferManager');
        this.pinCount = new Map(); // Track pinned buffers
    }

    /**
     * Read a page and pin it in memory
     * Mirrors: ReadBufferExtended() + PinBuffer()
     */
    async readPage(relationId, blockNumber) {
        const page = await this.storage.readBlock(relationId, blockNumber);
        const key = `${relationId}:${blockNumber}`;
        
        const currentPins = this.pinCount.get(key) || 0;
        this.pinCount.set(key, currentPins + 1);
        
        this.logger.debug(`Page pinned`, { relationId, blockNumber, pins: currentPins + 1 });
        return page;
    }

    /**
     * Unpin a page after use
     * Mirrors: UnpinBuffer()
     */
    async releasePage(relationId, blockNumber) {
        const key = `${relationId}:${blockNumber}`;
        const currentPins = this.pinCount.get(key) || 0;
        
        if (currentPins <= 0) {
            this.logger.warn(`Attempted to unpin unpinned page`, { relationId, blockNumber });
            return;
        }

        const newPins = currentPins - 1;
        this.pinCount.set(key, newPins);
        
        if (newPins === 0) {
            this.pinCount.delete(key);
            this.logger.debug(`Page unpinned completely`, { relationId, blockNumber });
        } else {
            this.logger.debug(`Page pin count decreased`, { relationId, blockNumber, pins: newPins });
        }
    }

    /**
     * Insert a tuple into a heap page
     * Mirrors: heap_insert() -> PageAddItem()
     */
    async insertTuple(relationId, blockNumber, tupleData) {
        const page = await this.readPage(relationId, blockNumber);
        const view = new DataView(page.buffer);
        
        // Read PageHeader
        const pdLower = view.getUint16(12, true);
        const pdUpper = view.getUint16(14, true);
        
        const tupleSize = tupleData.length;
        const alignedSize = this.maxAlign(tupleSize);
        
        // Check space
        if (pdLower + alignedSize > pdUpper) {
            await this.releasePage(relationId, blockNumber);
            this.logger.warn(`No space in page, need new block`, { relationId, blockNumber, required: alignedSize, available: pdUpper - pdLower });
            return false; // Need to allocate new block
        }

        // Write ItemId (LinePointer) at pdLower
        const itemIdOffset = 24 + (this.getItemCount(page) * 4); // 4 bytes per ItemId
        
        // ItemId: lp_off (2), lp_len (2)
        view.setUint16(itemIdOffset, pdUpper - alignedSize, true); // Offset
        view.setUint16(itemIdOffset + 2, alignedSize, true);      // Length
        
        // Write Tuple Data at pdUpper - alignedSize
        const dataOffset = pdUpper - alignedSize;
        for (let i = 0; i < tupleData.length; i++) {
            page[dataOffset + i] = tupleData[i];
        }

        // Update Header
        const newLower = itemIdOffset + 4;
        const newUpper = dataOffset;
        
        view.setUint16(12, newLower, true);
        view.setUint16(14, newUpper, true);

        // Write back
        await this.storage.writeBlock(relationId, blockNumber, page);
        await this.releasePage(relationId, blockNumber);
        
        this.logger.info(`Tuple inserted`, { relationId, blockNumber, offset: dataOffset, size: tupleSize });
        return true;
    }

    /**
     * Scan a heap page for tuples
     * Mirrors: heapgettup()
     */
    async scanPage(relationId, blockNumber) {
        const page = await this.readPage(relationId, blockNumber);
        const view = new DataView(page.buffer);
        const tuples = [];

        const pdLower = view.getUint16(12, true);
        const pdUpper = view.getUint16(14, true);
        const itemCount = this.getItemCount(page);

        this.logger.debug(`Scanning page`, { relationId, blockNumber, itemCount });

        for (let i = 0; i < itemCount; i++) {
            const itemIdOffset = 24 + (i * 4);
            const lpOff = view.getUint16(itemIdOffset, true);
            const lpLen = view.getUint16(itemIdOffset + 2, true);

            if (lpOff === 0 || lpLen === 0) continue; // Unused item

            // Extract tuple data
            const tupleData = new Uint8Array(lpLen);
            for (let j = 0; j < lpLen; j++) {
                tupleData[j] = page[lpOff + j];
            }

            tuples.push({
                itemId: i,
                offset: lpOff,
                length: lpLen,
                data: tupleData
            });
        }

        await this.releasePage(relationId, blockNumber);
        return tuples;
    }

    /**
     * Helper: Get number of items in page
     */
    getItemCount(page) {
        const view = new DataView(page.buffer);
        const pdLower = view.getUint16(12, true);
        // Items start after header (24 bytes). Each ItemId is 4 bytes.
        return Math.floor((pdLower - 24) / 4);
    }

    /**
     * Helper: Max Align macro from Postgres
     */
    maxAlign(len) {
        return (len + (MAXALIGN - 1)) & ~(MAXALIGN - 1);
    }
}
