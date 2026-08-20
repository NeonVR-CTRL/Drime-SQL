/**
 * DRIME.SQL - Heap Access Method (heapam)
 * Rewritten from PostgreSQL 18.6 src/backend/access/heap/heapam.c
 */

import { logger } from '../core/logger.js';
import { BLCKSZ, SIZEOF_PAGE_HEADER } from '../core/constants.js';
import { PageInit, PageGetItem, PageAddItem } from '../buffer/page_ops.js';
import { HeapTupleHeader } from './heap_tuple.js';

export class HeapAccessMethod {
    constructor(bufferMgr, transactionMgr) {
        this.bufferMgr = bufferMgr;
        this.transactionMgr = transactionMgr;
        logger.info('HeapAccessMethod initialized', { module: 'heapam' });
    }

    async heapInsert(relationId, tupleData) {
        const xid = this.transactionMgr.getCurrentXID();
        logger.debug(`heapInsert start`, { relationId, xid, module: 'heapam' });

        const tupleHeader = new HeapTupleHeader({ xmin: xid, xmax: 0, ctid: null, data: tupleData });
        const tupleBytes = tupleHeader.serialize();
        
        let buffer = await this.bufferMgr.getBufferWithSpace(relationId, tupleBytes.length);
        
        if (!buffer) {
            const newBlockNum = await this.bufferMgr.extendRelation(relationId);
            buffer = await this.bufferMgr.readBuffer(relationId, newBlockNum);
            await PageInit(buffer.page);
        }

        const offset = await PageAddItem(buffer.page, tupleBytes);
        buffer.dirty = true;
        const ctid = { blockNumber: buffer.blockNum, offsetNumber: offset };

        logger.info(`Tuple inserted`, { ctid, xid, module: 'heapam' });
        return { success: true, ctid };
    }

    async heapUpdate(relationId, oldCtid, newTupleData) {
        const xid = this.transactionMgr.getCurrentXID();
        logger.debug(`heapUpdate start`, { relationId, oldCtid, module: 'heapam' });

        const oldBuffer = await this.bufferMgr.readBuffer(relationId, oldCtid.blockNumber);
        const oldTuple = await PageGetItem(oldBuffer.page, oldCtid.offsetNumber);
        if (!oldTuple) throw new Error('Tuple not found');

        const oldHeader = HeapTupleHeader.deserialize(oldTuple);
        oldHeader.xmax = xid;
        oldBuffer.dirty = true;

        const result = await this.heapInsert(relationId, newTupleData);
        oldHeader.ctid = result.ctid;

        logger.info(`Tuple updated`, { oldCtid, newCtid: result.ctid, module: 'heapam' });
        return { success: true, oldCtid, newCtid: result.ctid };
    }

    async heapDelete(relationId, ctid) {
        const xid = this.transactionMgr.getCurrentXID();
        logger.debug(`heapDelete start`, { relationId, ctid, module: 'heapam' });

        const buffer = await this.bufferMgr.readBuffer(relationId, ctid.blockNumber);
        const tuple = await PageGetItem(buffer.page, ctid.offsetNumber);
        if (!tuple) throw new Error('Tuple not found');

        const header = HeapTupleHeader.deserialize(tuple);
        header.xmax = xid;
        buffer.dirty = true;

        logger.info(`Tuple deleted`, { ctid, xid, module: 'heapam' });
        return { success: true, ctid };
    }

    async *heapScan(relationId, snapshot) {
        const totalBlocks = await this.bufferMgr.getRelationSize(relationId);
        logger.debug(`heapScan start`, { relationId, totalBlocks, module: 'heapam' });

        for (let blockNum = 0; blockNum < totalBlocks; blockNum++) {
            const buffer = await this.bufferMgr.readBuffer(relationId, blockNum);
            const page = buffer.page;
            const itemSize = 4;

            for (let offset = 1; offset * itemSize < (page.header.lower - SIZEOF_PAGE_HEADER); offset++) {
                const tupleBytes = await PageGetItem(page, offset);
                if (!tupleBytes) continue;

                const header = HeapTupleHeader.deserialize(tupleBytes);
                if (this.transactionMgr.heapTupleSatisfiesSnapshot(header, snapshot)) {
                    yield { ctid: { blockNumber: blockNum, offsetNumber: offset }, data: header.data };
                }
            }
        }
        logger.info(`Scan completed`, { relationId, module: 'heapam' });
    }
}
