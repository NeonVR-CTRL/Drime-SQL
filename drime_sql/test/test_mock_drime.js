/**
 * DRIME.SQL Mock Drime Storage
 * Simulates Drime.cloud API for local testing without network calls
 */

const { logger } = require('../core/logger.js');

class MockDrimeStorage {
    constructor() {
        this.store = new Map();
        logger.info('MockDrimeStorage initialized', { location: 'test/mock_drime.js' });
    }

    async putObject(key, value) {
        logger.debug('Mock PUT', { key, size: value.length, location: 'test/mock_drime.js' });
        this.store.set(key, value);
        return { success: true, key };
    }

    async getObject(key) {
        logger.debug('Mock GET', { key, location: 'test/mock_drime.js' });
        const value = this.store.get(key);
        if (value === undefined) {
            throw new Error(`Object not found: ${key}`);
        }
        return value;
    }

    async deleteObject(key) {
        logger.debug('Mock DELETE', { key, location: 'test/mock_drime.js' });
        return this.store.delete(key);
    }

    async listObjects(prefix = '') {
        logger.debug('Mock LIST', { prefix, location: 'test/mock_drime.js' });
        const keys = Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
        return keys;
    }
}

module.exports = { MockDrimeStorage };
