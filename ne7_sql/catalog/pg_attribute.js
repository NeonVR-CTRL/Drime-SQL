/**
 * NE7-SQL - pg_attribute Helper
 * PostgreSQL 18.6 Logic Rewrite: catalog/pg_attribute.c
 * Column definition operations
 */

import { Logger } from '../core/logger.js';

const log = new Logger('pg_attribute');

export class PgAttribute {
    constructor(catalogManager) {
        this.catalogs = catalogManager;
        log.debug('PgAttribute helper initialized');
    }

    async getColumnByName(tableOid, columnName) {
        log.debug('Looking up column', { tableOid, columnName });
        const attr = this.catalogs.catalogs['pg_attribute'].find(
            a => a.attrelid === tableOid && a.attname === columnName && !a.attisdropped
        );
        
        if (attr) {
            log.info('Column found', { columnName, attnum: attr.attnum });
        } else {
            log.warn('Column not found', { tableOid, columnName });
        }
        return attr;
    }

    async getColumnsByTable(tableOid) {
        log.debug('Getting all columns for table', { tableOid });
        const attrs = this.catalogs.catalogs['pg_attribute']
            .filter(a => a.attrelid === tableOid && !a.attisdropped)
            .sort((a, b) => a.attnum - b.attnum);
        
        log.info('Columns retrieved', { tableOid, count: attrs.length });
        return attrs;
    }

    async alterColumnNotNull(tableOid, colName, notNull) {
        log.info('Altering column NOT NULL constraint', { tableOid, colName, notNull });
        const attr = await this.getColumnByName(tableOid, colName);
        if (!attr) {
            log.error('Cannot alter - column not found', { colName });
            return false;
        }
        
        attr.attnotnull = notNull;
        log.info('Column constraint updated', { colName, notNull });
        return true;
    }

    async dropColumn(tableOid, colName) {
        log.warn('Dropping column', { tableOid, colName });
        const attr = await this.getColumnByName(tableOid, colName);
        if (!attr) {
            log.error('Cannot drop - column not found', { colName });
            return false;
        }
        
        // Mark as dropped instead of removing (Postgres behavior)
        attr.attisdropped = true;
        log.info('Column marked as dropped', { colName });
        return true;
    }

    async renameColumn(tableOid, oldName, newName) {
        log.info('Renaming column', { tableOid, oldName, newName });
        const attr = await this.getColumnByName(tableOid, oldName);
        if (!attr) {
            log.error('Cannot rename - column not found', { oldName });
            return false;
        }
        
        // Check if new name already exists
        const existing = await this.getColumnByName(tableOid, newName);
        if (existing) {
            log.error('Cannot rename - new name already exists', { newName });
            return false;
        }
        
        attr.attname = newName;
        log.info('Column renamed', { oldName, newName });
        return true;
    }

    async validateColumnTypes(tableOid, columns) {
        log.debug('Validating column types', { tableOid, columns: columns.length });
        const attrs = await this.getColumnsByTable(tableOid);
        
        if (attrs.length !== columns.length) {
            log.error('Column count mismatch', { expected: columns.length, actual: attrs.length });
            return false;
        }
        
        for (let i = 0; i < columns.length; i++) {
            if (attrs[i].attname !== columns[i].name) {
                log.error('Column name mismatch', { expected: columns[i].name, actual: attrs[i].attname });
                return false;
            }
        }
        
        log.info('Column types validated successfully');
        return true;
    }
}
