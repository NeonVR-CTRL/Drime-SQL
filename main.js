/**
 * DRIME.SQL - Main Entry Point
 * PostgreSQL 18.6 Logic Rewritten for Cloudflare Workers + Drime.cloud
 */

import { logger } from './core/logger.js';
import { DrimeStorageManager } from './storage/drime_smgr.js';
import { BufferMgr } from './buffer/buffer_mgr.js';
import { Executor } from './executor/exec_main.js';
import { SQLParser } from './parser/sql_parser.js';

export class DrimeSQL {
    constructor(drimeConfig) {
        logger.info('DRIME.SQL Starting...', { module: 'main' });
        
        this.storage = new DrimeStorageManager(drimeConfig);
        this.bufferMgr = new BufferMgr(this.storage);
        this.executor = new Executor(this.bufferMgr);
        this.parser = new SQLParser();
        
        logger.info('DRIME.SQL Ready', { module: 'main' });
    }

    async query(sql) {
        try {
            logger.info(`Executing SQL: ${sql}`, { module: 'main' });
            const ast = this.parser.parse(sql);
            const result = await this.executor.execute(ast);
            logger.info(`Query completed successfully`, { module: 'main' });
            return result;
        } catch (error) {
            logger.error(`Query failed: ${error.message}`, { sql, module: 'main' });
            throw error;
        }
    }
}

// Export for Cloudflare Workers
export default {
    async fetch(request, env) {
        const db = new DrimeSQL({
            apiKey: env.DRIME_API_KEY,
            bucket: env.DRIME_BUCKET
        });
        
        // Handle HTTP requests to SQL endpoint
        const url = new URL(request.url);
        if (url.pathname === '/query' && request.method === 'POST') {
            const { sql } = await request.json();
            const result = await db.query(sql);
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        return new Response('DRIME.SQL Ready', { status: 200 });
    }
};
