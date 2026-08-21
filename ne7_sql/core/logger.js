/**
 * NE7-SQL Logger - Universal module support
 */
class Logger {
    constructor(moduleName) { this.moduleName = moduleName || 'NE7-SQL'; }
    _log(level, message, meta = {}) {
        const stack = new Error().stack.split('\n')[3] || '';
        if (!meta.module) {
            const match = stack.match(/\/ne7_sql\/([^/]+)\/([^.]+)/);
            meta.module = match ? `${match[1]}/${match[2]}` : this.moduleName;
        }
        meta.location = meta.location || stack;
        meta.message = message;
        meta.timestamp = new Date().toISOString();
        meta.level = level;
        console.log(`[${meta.timestamp}] [${level}] [${meta.module}] ${message}`, meta);
    }
    debug(msg, meta) { this._log('DEBUG', msg, meta); }
    info(msg, meta) { this._log('INFO', msg, meta); }
    warn(msg, meta) { this._log('WARN', msg, meta); }
    error(msg, meta) { this._log('ERROR', msg, meta); }
}

const logger = new Logger('NE7-SQL');

// Named exports for ES modules
export { Logger, logger };

// Named function exports (FIX for lock_mgr.js and mvcc.js)
export function logDebug(msg, meta) { logger.debug(msg, meta); }
export function logInfo(msg, meta) { logger.info(msg, meta); }
export function logWarn(msg, meta) { logger.warn(msg, meta); }
export function logError(msg, meta) { logger.error(msg, meta); }

// CommonJS compat
export default logger;
