/**
 * NE7-SQL - Modify Table Executor Nodes (Insert, Update, Delete)
 * Rewritten from PostgreSQL 18.6 src/backend/executor/nodeModifyTable.c
 */

import { logger } from '../core/logger.js';

export class Insert {
    constructor(relation, columns, valuesExpr) {
        this.relation = relation;
        this.columns = columns;
        this.valuesExpr = valuesExpr; // Expressions to compute values
        
        logger.info('Insert node initialized', { 
            file: 'exec_modify.js', 
            line: 13, 
            data: { relation, columnCount: columns.length } 
        });
    }

    async execute(heapAccess, context) {
        logger.debug('Executing Insert', { 
            file: 'exec_modify.js', 
            line: 19, 
            data: { relation: this.relation } 
        });

        // Compute values from expressions
        const tupleData = {};
        for (let i = 0; i < this.columns.length; i++) {
            const col = this.columns[i];
            const expr = this.valuesExpr[i];
            tupleData[col] = expr ? expr.evaluate(context) : null;
        }

        // Insert into heap
        const tid = await heapAccess.insertTuple(this.relation, tupleData);
        
        logger.info('Insert completed', { 
            file: 'exec_modify.js', 
            line: 34, 
            data: { relation: this.relation, tid } 
        });
        
        return { tid, count: 1 };
    }
}

export class Update {
    constructor(relation, targetList, qual) {
        this.relation = relation;
        this.targetList = targetList; // Set clauses (col = expr)
        this.qual = qual;             // WHERE clause
        
        logger.info('Update node initialized', { 
            file: 'exec_modify.js', 
            line: 47, 
            data: { relation } 
        });
    }

    async execute(heapAccess, scanNode) {
        let count = 0;
        logger.debug('Executing Update', { 
            file: 'exec_modify.js', 
            line: 54, 
            data: { relation: this.relation } 
        });

        // Scan for matching tuples
        for await (const oldTuple of scanNode.execute(heapAccess)) {
            if (this.qual && !this.qual.evaluate(oldTuple)) {
                continue;
            }

            // Compute new values
            const newTupleData = { ...oldTuple };
            for (const target of this.targetList) {
                newTupleData[target.col] = target.expr.evaluate(newTupleData);
            }

            // Perform heap update (marks old as deleted, inserts new)
            await heapAccess.updateTuple(this.relation, oldTuple.t_ctid, newTupleData);
            count++;
            
            logger.debug('Tuple updated', { 
                file: 'exec_modify.js', 
                line: 73, 
                data: { ctid: oldTuple.t_ctid } 
            });
        }

        logger.info('Update completed', { 
            file: 'exec_modify.js', 
            line: 78, 
            data: { relation: this.relation, updatedCount: count } 
        });
        
        return { count };
    }
}

export class Delete {
    constructor(relation, qual) {
        this.relation = relation;
        this.qual = qual;
        
        logger.info('Delete node initialized', { 
            file: 'exec_modify.js', 
            line: 90, 
            data: { relation } 
        });
    }

    async execute(heapAccess, scanNode) {
        let count = 0;
        logger.debug('Executing Delete', { 
            file: 'exec_modify.js', 
            line: 97, 
            data: { relation: this.relation } 
        });

        // Scan for matching tuples
        for await (const tuple of scanNode.execute(heapAccess)) {
            if (this.qual && !this.qual.evaluate(tuple)) {
                continue;
            }

            // Perform heap delete (marks as deleted via xmax)
            await heapAccess.deleteTuple(this.relation, tuple.t_ctid);
            count++;
            
            logger.debug('Tuple deleted', { 
                file: 'exec_modify.js', 
                line: 110, 
                data: { ctid: tuple.t_ctid } 
            });
        }

        logger.info('Delete completed', { 
            file: 'exec_modify.js', 
            line: 115, 
            data: { relation: this.relation, deletedCount: count } 
        });
        
        return { count };
    }
}
