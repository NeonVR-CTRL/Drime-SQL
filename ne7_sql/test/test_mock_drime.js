class MockDrimeStorage {
    constructor() {
        this.store = new Map();
        this.relationSizes = new Map();
        this.keyPool = [{ id: 0, apiKey: 'mock', capacity: 20*1024*1024*1024, used: 0, healthy: true, pages: new Set() }];
    }
    async readBlock(relOid, blockNum) { return this.store.get(`${relOid}:${blockNum}`) || null; }
    async writeBlock(relOid, blockNum, data) { 
        this.store.set(`${relOid}:${blockNum}`, data); 
        const currentMax = this.relationSizes.get(relOid) || 0;
        if (blockNum >= currentMax) this.relationSizes.set(relOid, blockNum + 1);
        return true; 
    }
    async createRelation(relOid) { this.relationSizes.set(relOid, 0); return true; }
    getBlockCount(relOid) { return this.relationSizes.get(relOid) || 0; }
    getStats() { return { totalKeys: 1, totalPages: this.store.size, engine: 'NE7-SQL Mock' }; }
}
module.exports = { MockDrimeStorage };
