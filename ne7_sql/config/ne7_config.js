/**
 * NE7-SQL Configuration
 * Multi-key Drime.cloud storage with PostgreSQL 18.6 compatibility
 */
export const CONFIG = {
    ENGINE_NAME: 'NE7-SQL',
    ENGINE_VERSION: '18.6',
    PG_COMPAT_VERSION: '18.6',
    PLATFORM: 'Cloudflare Workers',

    // Multi-Key Storage (YOUR MASTER TRICK)
    STORAGE_KEYS: [
        { apiKey: process.env.NE7_KEY_1 || '', endpoint: 'https://api.drime.cloud/v1', capacityGB: 20 },
        // Add more keys as you scale:
        // { apiKey: process.env.NE7_KEY_2 || '', endpoint: 'https://api.drime.cloud/v1', capacityGB: 20 },
    ],

    // PostgreSQL Compatibility
    PG_PORT: 5432,
    PG_ENCODING: 'UTF8',
    MAX_CONNECTIONS: 100,

    // Memory
    SHARED_BUFFERS: 128,
    WORK_MEM: 4 * 1024 * 1024,

    // WAL
    WAL_SEGMENT_SIZE: 16 * 1024 * 1024,
    CHECKPOINT_TIMEOUT: 300000,

    LOG_LEVEL: process.env.LOG_LEVEL || 'INFO'
};
