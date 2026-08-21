/**
 * NE7-SQL Test Runner
 * Executes all test cases and reports PASS/FAIL with timing
 */
const { runAllTests } = require('./test_cases.js');
const { runWireProtocolTests } = require('./test_wire_protocol.js');
const { logger } = require('../core/logger.js');

async function main() {
    logger.info('Starting NE7-SQL Test Suite...');
    const startTime = Date.now();
    
    let totalPassed = 0;
    let totalFailed = 0;
    let totalTests = 0;
    
    try {
        // Run core engine tests
        logger.info('=== Phase 1-4: Core Engine Tests ===');
        const coreResults = await runAllTests();
        totalPassed += coreResults.passed;
        totalFailed += coreResults.failed;
        totalTests += coreResults.total;
        
        // Run wire protocol tests
        logger.info('=== Phase 5: Wire Protocol Tests ===');
        const wireResults = await runWireProtocolTests();
        totalPassed += wireResults.passed;
        totalFailed += wireResults.failed;
        totalTests += wireResults.total;
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log('\n========================================');
        console.log('  NE7-SQL v18.6 FULL TEST RESULTS');
        console.log('========================================');
        console.log(`TOTAL TESTS: ${totalTests}`);
        console.log(`PASSED: ${totalPassed}`);
        console.log(`FAILED: ${totalFailed}`);
        console.log(`DURATION: ${duration}ms`);
        console.log('========================================\n');
        
        if (totalFailed > 0) {
            logger.error('Some tests failed.');
            process.exit(1);
        } else {
            logger.info('All tests passed! NE7-SQL is ready for psql connections.');
            setTimeout(() => process.exit(0), 200);
        }
    } catch (err) {
        logger.error('Test runner crashed: ' + err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

main();
