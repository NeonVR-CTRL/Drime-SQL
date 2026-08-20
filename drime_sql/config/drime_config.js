/**
 * DRIME.SQL - Configuration Settings
 * Drime.cloud API and PostgreSQL parameters
 */

export const CONFIG = {
  // Drime.cloud Storage Configuration
  DRIME_BUCKET: process.env.DRIME_BUCKET || 'drime-sql-data',
  DRIME_API_KEY: process.env.DRIME_API_KEY || '',
  DRIME_BASE_URL: 'https://api.drime.cloud/v1',
  
  // PostgreSQL Compatibility Settings
  PG_VERSION: '18.6',
  PG_PORT: 5432,
  PG_ENCODING: 'UTF8',
  
  // Memory & Buffer Settings
  MAX_CONNECTIONS: 100,
  SHARED_BUFFERS: 128 * 1024 * 1024, // 128MB
  WORK_MEM: 4 * 1024 * 1024, // 4MB
  
  // WAL Settings
  WAL_SEGMENT_SIZE: 16 * 1024 * 1024, // 16MB
  CHECKPOINT_TIMEOUT: 300000, // 5 minutes
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'INFO',
  LOG_DESTINATION: 'console,file'
};

// Export for Worker environment
export function getEnvConfig(env) {
  return {
    DRIME_BUCKET: env.DRIME_BUCKET || CONFIG.DRIME_BUCKET,
    DRIME_API_KEY: env.DRIME_API_KEY || CONFIG.DRIME_API_KEY,
    LOG_LEVEL: env.LOG_LEVEL || CONFIG.LOG_LEVEL
  };
}
