/**
 * NE7-SQL - pg_class Helper
 * PostgreSQL 18.6 Logic Rewrite: catalog/pg_class.c
 * Specific operations for relation metadata
 */

import { Logger } from '../core/logger.js';

const log = new Logger('pg_class');

export class PgClass {
    constructor(catalogManager) {
        this.catalogs = catalogManager;
        log.debug('PgClass helper initialized');
    }

    async createTableEntry(oid, tableName, columns) {
        log.info('Creating pg_class entry', { tableName, oid, columns: columns.length });
        
        // Insert into pg_class
        const relation = await this.catalogs.insertRelation(
            oid, 
            tableName, 
            'r', // relkind = regular table
            columns.length
        );

        // Insert column definitions into pg_attribute
        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            await this.catalogs.insertAttribute(
                oid,
                col.name,
                col.typeOid || 23, // default to INT4
                i + 1, // attnum starts at 1
                col.notNull || false
            );
        }

        log.info('Table metadata created successfully', { tableName, oid });
        return relation;
    }

    async createIndexEntry(oid, indexName, tableOid, natts, isUnique = false, isPrimary = false) {
        log.info('Creating pg_class entry for index', { indexName, oid, tableOid });
        
        const relation = await this.catalogs.insertRelation(
            oid,
            indexName,
            'i', // relkind = index
            natts
        );

        log.info('Index metadata created', { indexName, oid, isUnique, isPrimary });
        return relation;
    }

    async updateRelPages(tableName, pages) {
        log.debug('Updating relpages for table', { tableName, pages });
        const relation = await this.catalogs.getRelation(tableName);
        if (relation) {
            relation.relpages = pages;
            log.info('relpages updated', { tableName, pages });
            return true;
        }
        log.warn('Failed to update relpages - table not found', { tableName });
        return false;
    }

    async updateRelTuples(tableName, tuples) {
        log.debug('Updating reltuples for table', { tableName, tuples });
        const relation = await this.catalogs.getRelation(tableName);
        if (relation) {
            relation.reltuples = tuples;
            log.info('reltuples updated', { tableName, tuples });
            return true;
        }
        log.warn('Failed to update reltuples - table not found', { tableName });
        return false;
    }

    async setHasIndex(tableName, hasIndex = true) {
        log.debug('Setting relhasindex flag', { tableName, hasIndex });
        const relation = await this.catalogs.getRelation(tableName);
        if (relation) {
            relation.relhasindex = hasIndex;
            log.info('relhasindex updated', { tableName, hasIndex });
            return true;
        }
        return false;
    }

    async getTableStats(tableName) {
        log.debug('Getting table statistics', { tableName });
        const relation = await this.catalogs.getRelation(tableName);
        if (!relation) {
            log.warn('Table not found for stats', { tableName });
            return null;
        }
        
        const stats = {
            pages: relation.relpages,
            tuples: relation.reltuples,
            hasIndex: relation.relhasindex,
            kind: relation.relkind
        };
        
        log.info('Table statistics retrieved', { tableName, stats });
        return stats;
    }

    async dropTable(tableName) {
        log.warn('Dropping table metadata', { tableName });
        const relation = await this.catalogs.getRelation(tableName);
        if (!relation) {
            log.error('Cannot drop - table not found', { tableName });
            return false;
        }

        // Remove from pg_class
        const idx = this.catalogs.catalogs['pg_class'].findIndex(r => r.oid === relation.oid);
        if (idx !== -1) {
            this.catalogs.catalogs['pg_class'].splice(idx, 1);
        }

        // Remove attributes from pg_attribute
        const attrCount = this.catalogs.catalogs['pg_attribute'].length;
        this.catalogs.catalogs['pg_attribute'] = this.catalogs.catalogs['pg_attribute'].filter(
            a => a.attrelid !== relation.oid
        );
        const removedAttrs = attrCount - this.catalogs.catalogs['pg_attribute'].length;

        log.info('Table metadata dropped', { tableName, oid: relation.oid, removedAttrs });
        return true;
    }
}
