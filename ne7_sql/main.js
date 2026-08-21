const { logger } = require('./core/logger.js');
const { StorageRouter } = require('./storage/storage_router.js');
const { SQLExecutor } = require('./executor/exec_main.js');
const { TransactionManager } = require('./transaction/xact.js');
const { CONFIG } = require('./config/ne7_config.js');

class NE7SQLDatabase {
    constructor(storageRouter) {
        this.storage = storageRouter || new StorageRouter();
        this.version = CONFIG.ENGINE_VERSION;
        if (this.storage.keyPool && this.storage.keyPool.length === 0) {
            this.storage.addApiKey('local_test_key', 'http://localhost', 20);
        }
        this.txMgr = new TransactionManager(this.storage);
        this.executor = new SQLExecutor(this.storage, this.txMgr);
        logger.info('Starting NE7-SQL Engine', {
            version: this.version,
            storageKeys: this.storage.keyPool ? this.storage.keyPool.length : 0,
            platform: CONFIG.PLATFORM
        });
    }

    async exec(sql) {
        if (!sql || typeof sql !== 'string') throw new Error("Invalid SQL");
        const result = await this.executor.execute(sql);
        
        // Add column metadata for wire protocol
        if (result && result.rows && result.rows.length > 0) {
            const firstRow = result.rows[0];
            if (firstRow && typeof firstRow === 'object' && !Array.isArray(firstRow)) {
                result.columns = Object.keys(firstRow).map(k => ({ name: k }));
            } else if (Array.isArray(firstRow)) {
                result.columns = firstRow.map((_, i) => ({ name: 'column' + (i+1) }));
            }
        }
        
        return result;
    }

    getStorageStats() { 
        return this.storage.getStats ? this.storage.getStats() : { totalKeys: 0, pagesInMemory: 0 }; 
    }
}

module.exports = { NE7SQLDatabase, StorageRouter, CONFIG };
