/**
 * DRIME.SQL - Main Entry Point
 * Combines all layers: Storage, Buffer, Index, Transaction, Executor
 * 
 * Usage:
 * const db = new DrimeSQL(drimeClient, 'mydb');
 * await db.execute('CREATE TABLE users (id INT, name TEXT)');
 * await db.execute("INSERT INTO users VALUES (1, 'Alice')");
 * const res = await db.execute('SELECT * FROM users');
 */

import { DrimeLogger } from './core_logger.js';
import { DrimeStorageManager } from './drime_sql_storage.js';
import { DrimeSQLExecutor } from './drime_sql_executor.js';

export class DrimeSQL {
    constructor(drimeClient, dbName = 'default') {
        this.logger = new DrimeLogger('DrimeSQL');
        this.logger.info(`Initializing DRIME.SQL Engine`, { dbName, version: '18.6-rewrite' });

        // 1. Initialize Storage Manager (Postgres smgr rewrite)
        this.storageMgr = new DrimeStorageManager(drimeClient, dbName);

        // 2. Initialize SQL Executor (Parser + Planner + Executor)
        this.executor = new DrimeSQLExecutor(this.storageMgr);

        this.logger.info(`DRIME.SQL Ready`, { storage: 'Drime.cloud', engine: 'PostgreSQL 18.6 Logic' });
    }

    /**
     * Execute any SQL command
     */
    async execute(sql) {
        return this.executor.execute(sql);
    }

    /**
     * Begin a transaction manually
     */
    async begin() {
        return this.executor.txnMgr.begin();
    }

    /**
     * Commit a transaction
     */
    async commit(xid) {
        return this.executor.txnMgr.commit(xid);
    }

    /**
     * Rollback a transaction
     */
    async rollback(xid) {
        return this.executor.txnMgr.rollback(xid);
    }

    /**
     * Force Checkpoint
     */
    async checkpoint() {
        return this.storageMgr.checkpoint();
    }
}

// ==========================================
// DEMO / TEST RUNNER
// ==========================================

// Mock Drime Client for Testing (Replace with real Drime.cloud SDK in Workers)
class MockDrimeClient {
    constructor() {
        this.store = new Map();
        console.log('[MockDrime] Initialized in-memory store');
    }

    async put(key, data, metadata) {
        this.store.set(key, { data, metadata });
        console.log(`[MockDrime] PUT ${key} (${data.byteLength} bytes)`);
    }

    async get(key) {
        const item = this.store.get(key);
        if (!item) return null;
        // Return a Response-like object
        return {
            arrayBuffer: async () => item.data.buffer || item.data
        };
    }

    async delete(key) {
        this.store.delete(key);
        console.log(`[MockDrime] DELETE ${key}`);
    }
}

// Run Demo if executed directly
async function runDemo() {
    console.log('\n=== DRIME.SQL DEMO START ===\n');

    const drime = new MockDrimeClient();
    const db = new DrimeSQL(drime, 'testdb');

    try {
        // 1. Create Table
        console.log('\n--- Creating Table ---');
        await db.execute('CREATE TABLE users (id INT, name TEXT, email TEXT)');

        // 2. Insert Data
        console.log('\n--- Inserting Data ---');
        await db.execute("INSERT INTO users (id, name, email) VALUES (1, 'Alice', 'alice@example.com')");
        await db.execute("INSERT INTO users (id, name, email) VALUES (2, 'Bob', 'bob@example.com')");
        await db.execute("INSERT INTO users (id, name, email) VALUES (3, 'Charlie', 'charlie@example.com')");

        // 3. Select All
        console.log('\n--- Selecting All Users ---');
        const allUsers = await db.execute('SELECT * FROM users');
        console.log('Results:', JSON.stringify(allUsers.rows, null, 2));

        // 4. Select with WHERE
        console.log('\n--- Selecting User with id=2 ---');
        const bob = await db.execute('SELECT * FROM users WHERE id = 2');
        console.log('Results:', JSON.stringify(bob.rows, null, 2));

        // 5. Transaction Example
        console.log('\n--- Transaction Example ---');
        const xid = await db.begin();
        await db.execute("INSERT INTO users (id, name, email) VALUES (4, 'David', 'david@example.com')");
        await db.commit(xid);
        
        const afterTxn = await db.execute('SELECT * FROM users');
        console.log('After Transaction:', afterTxn.rows.length, 'rows');

        console.log('\n=== DRIME.SQL DEMO COMPLETE ===\n');

    } catch (error) {
        console.error('Demo Failed:', error);
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DrimeSQL };
}

// Run demo if in Node environment
if (typeof window === 'undefined' && process.argv[1]?.includes('drime_sql_main')) {
    runDemo();
}
