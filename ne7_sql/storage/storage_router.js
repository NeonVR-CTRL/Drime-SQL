const { logger } = require('../core/logger.js');
const { BLCKSZ } = require('../core/constants.js');

class StorageRouter {
    constructor() {
        this.keyPool = [];
        this.shardMap = new Map();
        this.totalCapacity = 0;
        this.totalUsed = 0;
        this.memoryStore = new Map();
        this.relationSizes = new Map(); // CRITICAL FIX: Track block counts per relation
        logger.info('NE7-SQL Storage Router initialized');
    }
    addApiKey(apiKey, endpoint, capacityGB = 20) {
        this.keyPool.push({ id: this.keyPool.length, apiKey, endpoint, capacity: capacityGB * 1024 * 1024 * 1024, used: 0, healthy: true });
        this.totalCapacity += capacityGB * 1024 * 1024 * 1024;
    }
    route(pageId) {
        if (this.keyPool.length === 0) throw new Error('No API keys');
        return this.keyPool.reduce((a, b) => a.used <= b.used ? a : b);
    }
    async readBlock(relOid, blockNum) {
        const pageId = `${relOid}:${blockNum}`;
        if (this.memoryStore.has(pageId)) return this.memoryStore.get(pageId);
        const shard = this.route(pageId);
        try {
            if (typeof fetch !== 'undefined' && shard.endpoint !== 'http://localhost') {
                const resp = await fetch(`${shard.endpoint}/objects/${pageId}`, { headers: { 'Authorization': `Bearer ${shard.apiKey}` } });
                if (resp.ok) return new Uint8Array(await resp.arrayBuffer());
            }
        } catch (e) {}
        return null;
    }
    async writeBlock(relOid, blockNum, data) {
        const pageId = `${relOid}:${blockNum}`;
        const shard = this.route(pageId);
        this.memoryStore.set(pageId, new Uint8Array(data));
        
        // Update relation size dynamically
        const currentMax = this.relationSizes.get(relOid) || 0;
        if (blockNum >= currentMax) this.relationSizes.set(relOid, blockNum + 1);

        shard.used += data.byteLength || data.length;
        this.totalUsed += data.byteLength || data.length;
        try {
            if (typeof fetch !== 'undefined' && shard.endpoint !== 'http://localhost') {
                await fetch(`${shard.endpoint}/objects/${pageId}`, { method: 'PUT', headers: { 'Authorization': `Bearer ${shard.apiKey}`, 'Content-Type': 'application/octet-stream' }, body: data });
            }
        } catch (e) { logger.warn('Edge push failed, saved locally'); }
        return true;
    }
    async createRelation(relOid) { this.relationSizes.set(relOid, 0); return true; }
    getBlockCount(relOid) { return this.relationSizes.get(relOid) || 0; }
    getStats() {
        return { totalKeys: this.keyPool.length, totalCapacityGB: (this.totalCapacity / (1024*1024*1024)).toFixed(2), totalUsedMB: (this.totalUsed / (1024*1024)).toFixed(2), pagesInMemory: this.memoryStore.size };
    }
}
module.exports = { StorageRouter };
