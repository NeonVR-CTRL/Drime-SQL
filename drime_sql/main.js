/**
 * DRIME.SQL - Main Entry Point
 * Bootstraps the entire engine
 */

import { Logger } from './core/logger.js';
import { CONFIG } from './config/drime_config.js';
import { DrimeSQLDatabase } from './executor/drime_sql_main.js';

const log = new Logger('Main');

export class DrimeSQLEngine {
  constructor(config = {}) {
    log.info('Starting DRIME.SQL Engine', { 
      version: CONFIG.PG_VERSION,
      storage: 'Drime.cloud',
      platform: 'Cloudflare Workers'
    });
    
    this.config = { ...CONFIG, ...config };
    this.db = null;
  }

  /**
   * Initialize the database engine
   */
  async initialize() {
    log.info('Initializing database engine');
    
    try {
      this.db = new DrimeSQLDatabase(
        this.config.DRIME_BUCKET,
        this.config.DRIME_API_KEY
      );
      
      // Run internal bootstrap queries
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS pg_drime_version (
          id INTEGER PRIMARY KEY,
          version TEXT,
          initialized_at TEXT
        )
      `);
      
      const now = new Date().toISOString();
      await this.db.execute(`
        INSERT OR REPLACE INTO pg_drime_version (id, version, initialized_at)
        VALUES (1, '${CONFIG.PG_VERSION}', '${now}')
      `);
      
      log.info('Engine initialized successfully', { 
        bucket: this.config.DRIME_BUCKET,
        postgresVersion: CONFIG.PG_VERSION
      });
      
      return true;
    } catch (error) {
      log.error('Failed to initialize engine', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute a SQL query
   */
  async query(sql, params = []) {
    if (!this.db) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }
    
    log.debug('Executing query', { sql, paramCount: params.length });
    return await this.db.execute(sql, params);
  }

  /**
   * Begin a transaction
   */
  async beginTransaction() {
    log.info('Beginning transaction');
    return await this.db.beginTransaction();
  }

  /**
   * Commit current transaction
   */
  async commit() {
    log.info('Committing transaction');
    return await this.db.commit();
  }

  /**
   * Rollback current transaction
   */
  async rollback() {
    log.info('Rolling back transaction');
    return await this.db.rollback();
  }

  /**
   * Get engine statistics
   */
  getStats() {
    return {
      version: CONFIG.PG_VERSION,
      platform: 'Cloudflare Workers',
      storage: 'Drime.cloud',
      bucket: this.config.DRIME_BUCKET,
      logLevel: this.config.LOG_LEVEL
    };
  }
}

// Auto-initialize if run directly
if (typeof window === 'undefined' && typeof globalThis !== 'undefined') {
  log.info('DRIME.SQL module loaded');
}

export default DrimeSQLEngine;
