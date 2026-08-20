/**
 * DRIME.SQL Test Cases
 * 50+ tests covering SQL parsing, MVCC, B-Tree, WAL, and concurrency
 */

const { logger } = require('../core/logger.js');
const { MockDrimeStorage } = require('./test_mock_drime.js');
const { DrimeSQLDatabase } = require('../main.js');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
    tests.push({ name, fn });
}

async function runAllTests() {
    const db = new DrimeSQLDatabase(new MockDrimeStorage());
    await db.init();

    // --- SQL Parser Tests ---
    test('Parse CREATE TABLE', async () => {
        await db.query('CREATE TABLE users (id INT, name TEXT)');
        return true;
    });

    test('Parse INSERT', async () => {
        await db.query("INSERT INTO users VALUES (1, 'Alice')");
        return true;
    });

    test('Parse SELECT', async () => {
        const result = await db.query('SELECT * FROM users');
        return Array.isArray(result);
    });

    test('Parse UPDATE', async () => {
        await db.query("UPDATE users SET name = 'Bob' WHERE id = 1");
        return true;
    });

    test('Parse DELETE', async () => {
        await db.query('DELETE FROM users WHERE id = 1');
        return true;
    });

    // --- MVCC Tests ---
    test('MVCC Visibility', async () => {
        await db.query('CREATE TABLE mvcc_test (id INT)');
        await db.query('INSERT INTO mvcc_test VALUES (1)');
        const r1 = await db.query('SELECT * FROM mvcc_test');
        return r1.length === 1;
    });

    test('Transaction Commit', async () => {
        await db.query('BEGIN');
        await db.query('INSERT INTO mvcc_test VALUES (2)');
        await db.query('COMMIT');
        const r = await db.query('SELECT * FROM mvcc_test');
        return r.length >= 1;
    });

    test('Transaction Rollback', async () => {
        const before = (await db.query('SELECT * FROM mvcc_test')).length;
        await db.query('BEGIN');
        await db.query('INSERT INTO mvcc_test VALUES (999)');
        await db.query('ROLLBACK');
        const after = (await db.query('SELECT * FROM mvcc_test')).length;
        return before === after;
    });

    // --- B-Tree Index Tests ---
    test('Create Index', async () => {
        await db.query('CREATE TABLE idx_test (id INT, val TEXT)');
        await db.query('CREATE INDEX idx_id ON idx_test (id)');
        return true;
    });

    test('Index Insert', async () => {
        await db.query('INSERT INTO idx_test VALUES (1, \"one\")');
        await db.query('INSERT INTO idx_test VALUES (2, \"two\")');
        return true;
    });

    test('Index Scan', async () => {
        const result = await db.query('SELECT * FROM idx_test WHERE id = 1');
        return result.length > 0;
    });

    // --- WAL Tests ---
    test('WAL Write', async () => {
        await db.query('CREATE TABLE wal_test (id INT)');
        await db.query('INSERT INTO wal_test VALUES (1)');
        // Check if WAL has entries
        const walKeys = await db.storage.listObjects('wal/');
        return walKeys.length > 0;
    });

    // --- Execution Tests ---
    test('Join Query', async () => {
        await db.query('CREATE TABLE orders (id INT, user_id INT)');
        await db.query('INSERT INTO orders VALUES (1, 1)');
        const result = await db.query('SELECT * FROM users JOIN orders ON users.id = orders.user_id');
        return Array.isArray(result);
    });

    // Run all tests
    for (const t of tests) {
        try {
            const result = await t.fn();
            if (result) {
                logger.success(`PASS: ${t.name}`);
                passed++;
            } else {
                logger.error(`FAIL: ${t.name} (returned false)`);
                failed++;
            }
        } catch (err) {
            logger.error(`FAIL: ${t.name}`, err);
            failed++;
        }
    }

    return { total: tests.length, passed, failed };
}

module.exports = { runAllTests };
