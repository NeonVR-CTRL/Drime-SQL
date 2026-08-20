/**
 * DRIME.SQL Test Runner
 * Executes all test cases and reports PASS/FAIL with timing
 */

const { runAllTests } = require('./test_cases.js');
const { logger } = require('../core/logger.js');

async function main() {
    logger.info('Starting DRIME.SQL Test Suite...');
    const startTime = Date.now();
    
    try {
        const results = await runAllTests();
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log('\n========================================');
        console.log(`TOTAL TESTS: ${results.total}`);
        console.log(`PASSED: ${results.passed}`);
        console.log(`FAILED: ${results.failed}`);
        console.log(`DURATION: ${duration}ms`);
        console.log('========================================\n');
        
        if (results.failed > 0) {
            logger.error('Some tests failed. Check output above.');
            process.exit(1);
        } else {
            logger.success('All tests passed! DRIME.SQL is ready.');
            process.exit(0);
        }
    } catch (error) {
        logger.error('Test runner crashed', error);
        process.exit(1);
    }
}

main();
