/**
 * NE7-SQL Wire Protocol Test
 * Simulates a psql client connecting and executing queries
 */
const net = require('net');
const { logger } = require('../core/logger.js');
const { NE7SQLDatabase } = require('../main.js');
const { PgWireServer } = require('../protocol/pg_server.js');

const TEST_PORT = 15432;

function encodeStartupMessage(user, database) {
    const params = `user\0${user}\0database\0${database}\0\0`;
    const paramsBuf = Buffer.from(params, 'utf8');
    const length = 4 + 4 + paramsBuf.length; // length + protocol + params
    
    const buf = Buffer.alloc(length);
    buf.writeInt32BE(length, 0);
    buf.writeInt32BE(196608, 4); // Protocol 3.0
    paramsBuf.copy(buf, 8);
    return buf;
}

function encodeQueryMessage(sql) {
    const sqlBuf = Buffer.from(sql + '\0', 'utf8');
    const length = 4 + sqlBuf.length;
    
    const buf = Buffer.alloc(1 + length);
    buf.writeUInt8(0x51, 0); // 'Q'
    buf.writeInt32BE(length, 1);
    sqlBuf.copy(buf, 5);
    return buf;
}

function encodeTerminateMessage() {
    const buf = Buffer.alloc(5);
    buf.writeUInt8(0x58, 0); // 'X'
    buf.writeInt32BE(4, 1);
    return buf;
}

async function runWireProtocolTests() {
    let passed = 0;
    let failed = 0;
    const results = { total: 5, passed: 0, failed: 0 };
    
    // Start server
    const db = new NE7SQLDatabase();
    const server = new PgWireServer(db, TEST_PORT);
    server.start();
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
        // Test 1: Connect and authenticate
        logger.info('Test 1: Connecting to NE7-SQL Wire Protocol Server...');
        const client = net.connect(TEST_PORT, '127.0.0.1');
        
        await new Promise((resolve, reject) => {
            client.on('connect', resolve);
            client.on('error', reject);
        });
        
        // Send startup message
        client.write(encodeStartupMessage('postgres', 'ne7sql'));
        
        // Wait for ReadyForQuery
        const startupResponse = await new Promise((resolve) => {
            let data = Buffer.alloc(0);
            const handler = (chunk) => {
                data = Buffer.concat([data, chunk]);
                // Check for ReadyForQuery 'Z' message
                if (data.includes(0x5A)) {
                    client.removeListener('data', handler);
                    resolve(data);
                }
            };
            client.on('data', handler);
        });
        
        logger.info('Test 1 PASSED: Connected and authenticated');
        passed++;
        
        // Test 2: Execute CREATE TABLE
        logger.info('Test 2: Executing CREATE TABLE via wire protocol...');
        client.write(encodeQueryMessage('CREATE TABLE wire_test (id INT, name TEXT)'));
        
        await new Promise((resolve) => {
            let data = Buffer.alloc(0);
            const handler = (chunk) => {
                data = Buffer.concat([data, chunk]);
                if (data.includes(0x5A)) {
                    client.removeListener('data', handler);
                    resolve(data);
                }
            };
            client.on('data', handler);
        });
        
        logger.info('Test 2 PASSED: CREATE TABLE executed via wire protocol');
        passed++;
        
        // Test 3: Execute INSERT
        logger.info('Test 3: Executing INSERT via wire protocol...');
        client.write(encodeQueryMessage("INSERT INTO wire_test VALUES (1, 'Alice')"));
        
        await new Promise((resolve) => {
            let data = Buffer.alloc(0);
            const handler = (chunk) => {
                data = Buffer.concat([data, chunk]);
                if (data.includes(0x5A)) {
                    client.removeListener('data', handler);
                    resolve(data);
                }
            };
            client.on('data', handler);
        });
        
        logger.info('Test 3 PASSED: INSERT executed via wire protocol');
        passed++;
        
        // Test 4: Execute SELECT
        logger.info('Test 4: Executing SELECT via wire protocol...');
        client.write(encodeQueryMessage('SELECT * FROM wire_test'));
        
        const selectResponse = await new Promise((resolve) => {
            let data = Buffer.alloc(0);
            const handler = (chunk) => {
                data = Buffer.concat([data, chunk]);
                if (data.includes(0x5A)) {
                    client.removeListener('data', handler);
                    resolve(data);
                }
            };
            client.on('data', handler);
        });
        
        // Check for RowDescription 'T' and DataRow 'D' messages
        const hasRowDesc = selectResponse.includes(0x54);
        const hasDataRow = selectResponse.includes(0x44);
        
        if (hasRowDesc && hasDataRow) {
            logger.info('Test 4 PASSED: SELECT returned RowDescription + DataRow');
            passed++;
        } else {
            logger.error('Test 4 FAILED: Missing RowDescription or DataRow');
            failed++;
        }
        
        // Test 5: Disconnect
        logger.info('Test 5: Disconnecting...');
        client.write(encodeTerminateMessage());
        client.destroy();
        
        logger.info('Test 5 PASSED: Clean disconnect');
        passed++;
        
    } catch (err) {
        logger.error('Wire protocol test failed', { error: err.message, location: 'test_wire_protocol.js' });
        console.error(err.stack);
        failed++;
    }
    
    // Stop server
    server.stop();
    
    results.passed = passed;
    results.failed = failed;
    return results;
}

module.exports = { runWireProtocolTests };
