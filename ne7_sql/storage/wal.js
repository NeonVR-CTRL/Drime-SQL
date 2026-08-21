const { logger } = require('../core/logger.js');
const { crc32c } = require('../core/utils.js');

class WriteAheadLog {
    constructor(storageRouter) {
        this.storage = storageRouter;
        this.currentLSN = { segment: 0, offset: 0 };
        this.pendingRecords = [];
        logger.info('WAL initialized with Storage Router');
    }

    async insert(record) {
        const header = Buffer.alloc(24);
        header.writeUInt32LE(24 + (record.data?.length || 0), 0);
        header.writeUInt32LE(this.currentLSN.segment, 12);
        header.writeUInt32LE(this.currentLSN.offset, 16);
        const crc = crc32c(header.slice(8));
        header.writeUInt32LE(crc, 4);
        
        const fullRecord = Buffer.concat([header, record.data || Buffer.alloc(0)]);
        this.pendingRecords.push({ lsn: { ...this.currentLSN }, data: fullRecord });
        this.advanceLSN(fullRecord.length);
        return this.currentLSN;
    }

    async flush() {
        for (const record of this.pendingRecords) {
            const pageId = `wal:${record.lsn.segment}:${record.lsn.offset}`;
            // Route WAL records through the Multi-Key Storage Router!
            if (this.storage.memoryStore) {
                this.storage.memoryStore.set(pageId, record.data);
            }
        }
        this.pendingRecords = [];
        logger.debug('WAL flushed to storage router');
    }

    advanceLSN(bytes) {
        this.currentLSN.offset += bytes;
        if (this.currentLSN.offset >= 16 * 1024 * 1024) {
            this.currentLSN.segment++;
            this.currentLSN.offset = 0;
        }
    }
}
module.exports = { WriteAheadLog };
