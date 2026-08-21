/**
 * NE7-SQL - Join Executor Nodes
 * Rewritten from PostgreSQL 18.6 src/backend/executor/nodeNestloop.c & nodeHashjoin.c
 * Implements Nested Loop and Hash Join algorithms
 */

import { logger } from '../core/logger.js';

export class NestLoopJoin {
    constructor(outerPlan, innerPlan, joinQual) {
        this.outerPlan = outerPlan;
        this.innerPlan = innerPlan;
        this.joinQual = joinQual; // Expression state for WHERE clause
        
        logger.info('NestLoopJoin initialized', { 
            file: 'exec_join.js', 
            line: 14,
            data: { type: 'NestedLoop' } 
        });
    }

    async *execute() {
        logger.debug('Starting Nested Loop Join', { file: 'exec_join.js', line: 20 });
        
        // Iterate over outer tuples
        for await (const outerTuple of this.outerPlan.execute()) {
            logger.debug('Processing outer tuple', { 
                file: 'exec_join.js', 
                line: 24, 
                data: { ctid: outerTuple.t_ctid } 
            });
            
            // Reset inner plan for each outer tuple
            this.innerPlan.reset();
            
            // Iterate over inner tuples
            for await (const innerTuple of this.innerPlan.execute()) {
                // Combine tuples
                const combined = { ...outerTuple, ...innerTuple };
                
                // Apply join qualification (WHERE clause)
                if (this.joinQual.evaluate(combined)) {
                    logger.debug('Join match found', { 
                        file: 'exec_join.js', 
                        line: 35, 
                        data: { matched: true } 
                    });
                    yield combined;
                }
            }
        }
        
        logger.info('Nested Loop Join completed', { file: 'exec_join.js', line: 41 });
    }
}

export class HashJoin {
    constructor(outerPlan, innerPlan, joinQual, hashKeys) {
        this.outerPlan = outerPlan;
        this.innerPlan = innerPlan;
        this.joinQual = joinQual;
        this.hashKeys = hashKeys; // Columns to hash on
        this.hashTable = new Map();
        
        logger.info('HashJoin initialized', { 
            file: 'exec_join.js', 
            line: 53,
            data: { hashKeys } 
        });
    }

    async buildHashTable() {
        logger.debug('Building hash table', { file: 'exec_join.js', line: 58 });
        this.hashTable.clear();
        
        for await (const tuple of this.innerPlan.execute()) {
            // Create hash key from tuple values
            const key = this.hashKeys.map(k => tuple[k]).join('|');
            
            if (!this.hashTable.has(key)) {
                this.hashTable.set(key, []);
            }
            this.hashTable.get(key).push(tuple);
        }
        
        logger.info('Hash table built', { 
            file: 'exec_join.js', 
            line: 70, 
            data: { size: this.hashTable.size } 
        });
    }

    async *execute() {
        // Phase 1: Build hash table from inner side
        await this.buildHashTable();
        
        logger.debug('Probing hash table', { file: 'exec_join.js', line: 77 });
        
        // Phase 2: Probe with outer side
        for await (const outerTuple of this.outerPlan.execute()) {
            const key = this.hashKeys.map(k => outerTuple[k]).join('|');
            const matches = this.hashTable.get(key);
            
            if (matches) {
                for (const innerTuple of matches) {
                    const combined = { ...outerTuple, ...innerTuple };
                    
                    if (this.joinQual.evaluate(combined)) {
                        logger.debug('Hash join match', { 
                            file: 'exec_join.js', 
                            line: 90, 
                            data: { key } 
                        });
                        yield combined;
                    }
                }
            }
        }
        
        logger.info('Hash Join completed', { file: 'exec_join.js', line: 96 });
    }
}
