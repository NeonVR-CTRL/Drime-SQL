/**
 * NE7-SQL - Sequential and Index Scan Executor Nodes
 * Rewritten from PostgreSQL 18.6 src/backend/executor/nodeSeqscan.c & nodeIndexscan.c
 */

import { logger } from '../core/logger.js';

export class SeqScan {
    constructor(relation, qual) {
        this.relation = relation; // Table name/relation object
        this.qual = qual;         // Qualification (WHERE clause) ExprState
        this.currentBlock = 0;
        
        logger.info('SeqScan initialized', { 
            file: 'exec_scan.js', 
            line: 13, 
            data: { relation: this.relation } 
        });
    }

    reset() {
        this.currentBlock = 0;
        logger.debug('SeqScan reset', { file: 'exec_scan.js', line: 21 });
    }

    async *execute(heapAccess) {
        logger.debug('Starting Sequential Scan', { 
            file: 'exec_scan.js', 
            line: 25, 
            data: { relation: this.relation } 
        });

        let block = 0;
        while (true) {
            // Get page from buffer manager via heap access
            const page = await heapAccess.readPage(this.relation, block);
            if (!page || page.pageHeader.lower === 0) break; // Empty or end

            // Scan all items on page
            for (let off = 0; off < page.items.length; off++) {
                const item = page.items[off];
                if (!item.used) continue;

                // Check MVCC visibility
                if (!heapAccess.checkVisibility(item.tupleHeader, heapAccess.snapshot)) {
                    continue;
                }

                // Apply WHERE qualification
                if (this.qual && !this.qual.evaluate(item.data)) {
                    continue;
                }

                logger.debug('SeqScan yielded tuple', { 
                    file: 'exec_scan.js', 
                    line: 47, 
                    data: { block, offset: off } 
                });
                yield item.data;
            }
            block++;
        }

        logger.info('Sequential Scan completed', { 
            file: 'exec_scan.js', 
            line: 54, 
            data: { blocksScanned: block } 
        });
    }
}

export class IndexScan {
    constructor(relation, indexRel, scanKeys, qual) {
        this.relation = relation;
        this.indexRel = indexRel;     // Index relation name
        this.scanKeys = scanKeys;     // Search keys (e.g., id = 5)
        this.qual = qual;             // Remaining quals
        this.btScanner = null;
        
        logger.info('IndexScan initialized', { 
            file: 'exec_scan.js', 
            line: 68, 
            data: { index: this.indexRel } 
        });
    }

    reset() {
        this.btScanner = null;
        logger.debug('IndexScan reset', { file: 'exec_scan.js', line: 76 });
    }

    async *execute(heapAccess, indexAccess) {
        logger.debug('Starting Index Scan', { 
            file: 'exec_scan.js', 
            line: 80, 
            data: { index: this.indexRel, keys: this.scanKeys } 
        });

        // Use B-Tree to find matching TIDs
        const tids = await indexAccess.search(this.indexRel, this.scanKeys);
        
        logger.debug('Index search returned TIDs', { 
            file: 'exec_scan.js', 
            line: 87, 
            data: { count: tids.length } 
        });

        // Fetch actual tuples from heap using TIDs
        for (const tid of tids) {
            const tuple = await heapAccess.fetchTuple(this.relation, tid);
            
            if (!tuple) continue;

            // Check visibility
            if (!heapAccess.checkVisibility(tuple.header, heapAccess.snapshot)) {
                continue;
            }

            // Apply remaining quals (if any not handled by index)
            if (this.qual && !this.qual.evaluate(tuple.data)) {
                continue;
            }

            logger.debug('IndexScan yielded tuple', { 
                file: 'exec_scan.js', 
                line: 105, 
                data: { tid } 
            });
            yield tuple.data;
        }

        logger.info('Index Scan completed', { 
            file: 'exec_scan.js', 
            line: 111, 
            data: { tidsProcessed: tids.length } 
        });
    }
}
