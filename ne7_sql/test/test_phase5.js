const { logger } = require('../core/logger.js');
const { MockDrimeStorage } = require('./test_mock_drime.js');
const main = require('../main.js');

// Safely get the correct Database class (NE7SQLDatabase instead of DrimeSQLDatabase)
const DB = main.NE7SQLDatabase || main.DrimeSQLDatabase || main.default || main;

async function runPhase5Tests() {
    logger.info('Starting NE7-SQL Phase 5 E2E Test Suite...');
    const storage = new MockDrimeStorage();
    const db = new DB(storage);
    let passed = 0;
    const total = 4;

    try {
        // Setup: Create table and insert data
        await db.exec("CREATE TABLE products (id INT, name TEXT, price INT)");
        await db.exec("INSERT INTO products VALUES (1, 'Laptop', 1200)");
        await db.exec("INSERT INTO products VALUES (2, 'Mouse', 25)");
        await db.exec("INSERT INTO products VALUES (3, 'Keyboard', 75)");
        
        // Test 1: UPDATE statement
        logger.info('Test 1: Running UPDATE...');
        const updateRes = await db.exec("UPDATE products SET price = 1000 WHERE id = 1");
        if (updateRes && (updateRes.success || updateRes.message?.includes('1 row') || updateRes.rowCount >= 1)) {
            logger.info('Test 1 PASSED: UPDATE executed successfully');
            passed++;
        } else {
            logger.error('Test 1 FAILED: UPDATE did not return expected result');
        }

        // Test 2: Verify UPDATE with SELECT
        logger.info('Test 2: Verifying UPDATE with SELECT...');
        const selectRes = await db.exec("SELECT * FROM products WHERE id = 1");
        if (selectRes && selectRes.rows && selectRes.rows.length > 0) {
            const row = selectRes.rows[0];
            if (row.price === 1000 || row[2] === 1000) {
                logger.info('Test 2 PASSED: UPDATE correctly modified the row');
                passed++;
            } else {
                logger.error('Test 2 FAILED: SELECT did not reflect UPDATE');
            }
        } else {
            logger.error('Test 2 FAILED: SELECT returned no rows');
        }

        // Test 3: DELETE statement
        logger.info('Test 3: Running DELETE...');
        const deleteRes = await db.exec("DELETE FROM products WHERE id = 2");
        if (deleteRes && (deleteRes.success || deleteRes.message?.includes('1 row') || deleteRes.rowCount >= 1)) {
            logger.info('Test 3 PASSED: DELETE executed successfully');
            passed++;
        } else {
            logger.error('Test 3 FAILED: DELETE did not return expected result');
        }

        // Test 4: Verify DELETE with SELECT
        logger.info('Test 4: Verifying DELETE with SELECT...');
        const selectAllRes = await db.exec("SELECT * FROM products");
        if (selectAllRes && selectAllRes.rows && selectAllRes.rows.length === 2) {
            logger.info('Test 4 PASSED: DELETE correctly removed the row');
            passed++;
        } else {
            logger.error('Test 4 FAILED: SELECT did not reflect DELETE');
        }

    } catch (err) {
        logger.error('Phase 5 Test Suite CRASHED: ' + err.message);
        console.error(err.stack);
    }

    console.log('\n========================================');
    console.log(`PHASE 5 TEST RESULTS: ${passed}/${total} PASSED`);
    console.log('========================================\n');
    
    if (passed === total) {
        logger.info('All Phase 5 tests passed!');
    } else {
        logger.warn(`Some Phase 5 tests failed (${passed}/${total}).`);
    }
}

runPhase5Tests();
