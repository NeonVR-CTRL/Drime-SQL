/**
 * NE7-SQL - pg_index Helper
 * PostgreSQL 18.6 Logic Rewrite: catalog/pg_index.c
 * Index metadata operations
 */

import { Logger } from '../core/logger.js';

const log = new Logger('pg_index');

export class PgIndex {
    constructor(catalogManager) {
        this.catalogs = catalogManager;
        log.debug('PgIndex helper initialized');
    }

    async createIndexEntry(indexOid, tableOid, indkey, isUnique = false, isPrimary = false) {
        log.info('Creating index entry', { indexOid, tableOid, isUnique, isPrimary });
        
        const natts = indkey.length;
        const tuple = {
            indexrelid: indexOid,
            indrelid: tableOid,
            indnatts: natts,
            indisunique: isUnique,
            indisprimary: isPrimary,
            indisexclusion: false,
            indimmediate: true,
            indisclustered: false,
            indisvalid: true,
            indcheckxmin: false,
            indisready: true,
            indislive: true,
            indisreplica: false,
            indkey: indkey, // array of attnum
            indcollation: new Array(natts).fill(0),
            indclass: new Array(natts).fill(0),
            indoption: new Array(natts).fill(0),
            indexprs: null,
            indpred: null
        };
        
        this.catalogs.catalogs['pg_index'].push(tuple);
        log.info('Index entry created', { indexOid, columns: natts });
        return tuple;
    }

    async getIndexByOid(indexOid) {
        log.debug('Looking up index by OID', { indexOid });
        const index = this.catalogs.catalogs['pg_index'].find(i => i.indexrelid === indexOid);
        
        if (index) {
            log.info('Index found', { indexOid, tableOid: index.indrelid });
        } else {
            log.warn('Index not found', { indexOid });
        }
        return index;
    }

    async getIndexesForTable(tableOid) {
        log.debug('Getting all indexes for table', { tableOid });
        const indexes = this.catalogs.catalogs['pg_index'].filter(i => i.indrelid === tableOid);
        log.info('Indexes retrieved', { tableOid, count: indexes.length });
        return indexes;
    }

    async getPrimaryKey(tableOid) {
        log.debug('Looking for primary key', { tableOid });
        const pk = this.catalogs.catalogs['pg_index'].find(
            i => i.indrelid === tableOid && i.indisprimary
        );
        
        if (pk) {
            log.info('Primary key found', { indexOid: pk.indexrelid, columns: pk.indkey });
        } else {
            log.debug('No primary key found', { tableOid });
        }
        return pk;
    }

    async dropIndex(indexOid) {
        log.warn('Dropping index', { indexOid });
        const idx = this.catalogs.catalogs['pg_index'].findIndex(i => i.indexrelid === indexOid);
        
        if (idx === -1) {
            log.error('Cannot drop - index not found', { indexOid });
            return false;
        }
        
        this.catalogs.catalogs['pg_index'].splice(idx, 1);
        log.info('Index dropped', { indexOid });
        return true;
    }

    async setIndexValid(indexOid, isValid) {
        log.info('Setting index validity', { indexOid, isValid });
        const index = await this.getIndexByOid(indexOid);
        if (!index) {
            log.error('Cannot set validity - index not found', { indexOid });
            return false;
        }
        
        index.indisvalid = isValid;
        log.info('Index validity updated', { indexOid, isValid });
        return true;
    }

    async validateIndexStructure(indexOid, expectedColumns) {
        log.debug('Validating index structure', { indexOid, expectedColumns });
        const index = await this.getIndexByOid(indexOid);
        if (!index) {
            log.error('Validation failed - index not found', { indexOid });
            return false;
        }
        
        if (index.indnatts !== expectedColumns.length) {
            log.error('Column count mismatch', { expected: expectedColumns.length, actual: index.indnatts });
            return false;
        }
        
        for (let i = 0; i < expectedColumns.length; i++) {
            if (index.indkey[i] !== expectedColumns[i]) {
                log.error('Column mismatch at position', { pos: i, expected: expectedColumns[i], actual: index.indkey[i] });
                return false;
            }
        }
        
        log.info('Index structure validated successfully');
        return true;
    }
}
