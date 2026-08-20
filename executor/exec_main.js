/**
 * DRIME.SQL - SQL Executor
 */
import { logger } from '../core/logger.js';
import { HeapAccessMethod } from '../access/heapam.js';
import { TransactionMgr } from '../transaction/xact.js';

export class Executor {
    constructor(bufferMgr) {
        this.bufferMgr = bufferMgr;
        this.transactionMgr = new TransactionMgr();
        this.heapAM = new HeapAccessMethod(bufferMgr, this.transactionMgr);
        this.relations = new Map();
        logger.info('Executor initialized', { module: 'executor' });
    }

    async execute(ast) {
        logger.debug(`Executing ${ast.type}`, { module: 'executor' });
        switch (ast.type) {
            case 'CREATE_TABLE': return await this.createTable(ast);
            case 'INSERT': return await this.insert(ast);
            case 'SELECT': return await this.select(ast);
            case 'UPDATE': return await this.update(ast);
            case 'DELETE': return await this.delete(ast);
            default: throw new Error(`Unknown: ${ast.type}`);
        }
    }

    async createTable(ast) {
        const tableId = `rel_${ast.table}`;
        this.relations.set(ast.table, tableId);
        await this.bufferMgr.createRelation(tableId);
        logger.info(`Table created: ${ast.table}`, { module: 'executor' });
        return { success: true, message: `Table ${ast.table} created` };
    }

    async insert(ast) {
        const relId = this.relations.get(ast.table);
        if (!relId) throw new Error(`Table ${ast.table} not found`);
        const result = await this.heapAM.heapInsert(relId, ast.data);
        await this.transactionMgr.commit();
        return { success: true, ctid: result.ctid };
    }

    async select(ast) {
        const relId = this.relations.get(ast.table);
        if (!relId) throw new Error(`Table ${ast.table} not found`);
        const snapshot = this.transactionMgr.GetSnapshot();
        const rows = [];
        for await (const tuple of this.heapAM.heapScan(relId, snapshot)) {
            if (ast.where && !ast.where.every(c => tuple.data[c.column] === c.value)) continue;
            rows.push(tuple.data);
        }
        return { success: true, rows };
    }

    async update(ast) {
        const relId = this.relations.get(ast.table);
        if (!relId) throw new Error(`Table ${ast.table} not found`);
        const snapshot = this.transactionMgr.GetSnapshot();
        let count = 0;
        for await (const tuple of this.heapAM.heapScan(relId, snapshot)) {
            if (ast.where && !ast.where.every(c => tuple.data[c.column] === c.value)) continue;
            await this.heapAM.heapUpdate(relId, tuple.ctid, { ...tuple.data, ...ast.updates });
            count++;
        }
        await this.transactionMgr.commit();
        return { success: true, updated: count };
    }

    async delete(ast) {
        const relId = this.relations.get(ast.table);
        if (!relId) throw new Error(`Table ${ast.table} not found`);
        const snapshot = this.transactionMgr.GetSnapshot();
        let count = 0;
        for await (const tuple of this.heapAM.heapScan(relId, snapshot)) {
            if (ast.where && !ast.where.every(c => tuple.data[c.column] === c.value)) continue;
            await this.heapAM.heapDelete(relId, tuple.ctid);
            count++;
        }
        await this.transactionMgr.commit();
        return { success: true, deleted: count };
    }
}
