/**
 * NE7-SQL - System Catalogs Manager
 * PostgreSQL 18.6 Logic Rewrite: catalog/sys_cat.c
 * Manages pg_class, pg_attribute, pg_index metadata
 */

import { Logger } from '../core/logger.js';
import { OidGenerator } from '../core/types.js';

const log = new Logger('sys_catalogs');

export class SystemCatalogs {
    constructor(storageManager) {
        this.smgr = storageManager;
        this.catalogs = {
            'pg_class': [],
            'pg_attribute': [],
            'pg_index': [],
            'pg_proc': [],
            'pg_type': []
        };
        log.info('SystemCatalogs initialized', { catalogs: Object.keys(this.catalogs) });
    }

    async initialize() {
        log.debug('Initializing system catalogs');
        await this._createPgClass();
        await this._createPgAttribute();
        await this._createPgIndex();
        await this._createPgType();
        log.info('System catalogs initialized successfully');
    }

    async _createPgClass() {
        // pg_class: stores table/index metadata
        const schema = [
            { name: 'oid', type: 'OID' },
            { name: 'relname', type: 'NAME' },
            { name: 'relnamespace', type: 'OID' },
            { name: 'reltype', type: 'OID' },
            { name: 'reloftype', type: 'OID' },
            { name: 'relowner', type: 'OID' },
            { name: 'relam', type: 'OID' },
            { name: 'relfilenode', type: 'OID' },
            { name: 'reltablespace', type: 'OID' },
            { name: 'relpages', type: 'INT4' },
            { name: 'reltuples', type: 'FLOAT4' },
            { name: 'relkind', type: 'CHAR' }, // r=table, i=index, S=sequence
            { name: 'relnatts', type: 'INT2' },
            { name: 'relchecks', type: 'INT2' },
            { name: 'relhasindex', type: 'BOOL' },
            { name: 'relisshared', type: 'BOOL' },
            { name: 'relpersistence', type: 'CHAR' }
        ];
        this.catalogs['pg_class'].schema = schema;
        log.debug('pg_class schema defined', { columns: schema.length });
    }

    async _createPgAttribute() {
        // pg_attribute: stores column definitions
        const schema = [
            { name: 'attrelid', type: 'OID' },
            { name: 'attname', type: 'NAME' },
            { name: 'atttypid', type: 'OID' },
            { name: 'attlen', type: 'INT2' },
            { name: 'attnum', type: 'INT2' },
            { name: 'attndims', type: 'INT4' },
            { name: 'attcacheoff', type: 'INT4' },
            { name: 'atttypmod', type: 'INT4' },
            { name: 'attbyval', type: 'BOOL' },
            { name: 'attstorage', type: 'CHAR' },
            { name: 'attalign', type: 'CHAR' },
            { name: 'attnotnull', type: 'BOOL' },
            { name: 'atthasdef', type: 'BOOL' },
            { name: 'attisdropped', type: 'BOOL' },
            { name: 'attislocal', type: 'BOOL' },
            { name: 'attinhcount', type: 'INT4' },
            { name: 'attcollation', type: 'OID' }
        ];
        this.catalogs['pg_attribute'].schema = schema;
        log.debug('pg_attribute schema defined', { columns: schema.length });
    }

    async _createPgIndex() {
        // pg_index: stores index metadata
        const schema = [
            { name: 'indexrelid', type: 'OID' },
            { name: 'indrelid', type: 'OID' },
            { name: 'indnatts', type: 'INT2' },
            { name: 'indisunique', type: 'BOOL' },
            { name: 'indisprimary', type: 'BOOL' },
            { name: 'indisexclusion', type: 'BOOL' },
            { name: 'indimmediate', type: 'BOOL' },
            { name: 'indisclustered', type: 'BOOL' },
            { name: 'indisvalid', type: 'BOOL' },
            { name: 'indcheckxmin', type: 'BOOL' },
            { name: 'indisready', type: 'BOOL' },
            { name: 'indislive', type: 'BOOL' },
            { name: 'indisreplica', type: 'BOOL' },
            { name: 'indkey', type: 'INT2_VECTOR' },
            { name: 'indcollation', type: 'OID_VECTOR' },
            { name: 'indclass', type: 'OID_VECTOR' },
            { name: 'indoption', type: 'INT2_VECTOR' },
            { name: 'indexprs', type: 'TEXT' },
            { name: 'indpred', type: 'TEXT' }
        ];
        this.catalogs['pg_index'].schema = schema;
        log.debug('pg_index schema defined', { columns: schema.length });
    }

    async _createPgType() {
        // pg_type: stores data type definitions
        const schema = [
            { name: 'oid', type: 'OID' },
            { name: 'typname', type: 'NAME' },
            { name: 'typnamespace', type: 'OID' },
            { name: 'typowner', type: 'OID' },
            { name: 'typlen', type: 'INT2' },
            { name: 'typbyval', type: 'BOOL' },
            { name: 'typcategory', type: 'CHAR' },
            { name: 'typispreferred', type: 'BOOL' },
            { name: 'typisdefined', type: 'BOOL' },
            { name: 'typdelim', type: 'CHAR' },
            { name: 'typrelid', type: 'OID' },
            { name: 'typelem', type: 'OID' },
            { name: 'typarray', type: 'OID' },
            { name: 'typinput', type: 'REGPROC' },
            { name: 'typoutput', type: 'REGPROC' },
            { name: 'typreceive', type: 'REGPROC' },
            { name: 'typsend', type: 'REGPROC' },
            { name: 'typmodin', type: 'REGPROC' },
            { name: 'typmodout', type: 'REGPROC' },
            { name: 'typanalyze', type: 'REGPROC' },
            { name: 'typalign', type: 'CHAR' },
            { name: 'typstorage', type: 'CHAR' },
            { name: 'typnotnull', type: 'BOOL' },
            { name: 'typbasetype', type: 'OID' },
            { name: 'typtypmod', type: 'INT4' },
            { name: 'typndims', type: 'INT4' },
            { name: 'typcollation', type: 'OID' },
            { name: 'typdefaultbin', type: 'TEXT' },
            { name: 'typdefault', type: 'TEXT' }
        ];
        this.catalogs['pg_type'].schema = schema;
        log.debug('pg_type schema defined', { columns: schema.length });
    }

    async insertRelation(oid, relname, relkind, relnatts) {
        log.debug('Inserting relation into pg_class', { oid, relname, relkind });
        const tuple = {
            oid: oid,
            relname: relname,
            relnamespace: 11, // pg_catalog namespace
            reltype: oid,
            reloftype: 0,
            relowner: 10, // postgres user
            relam: 0,
            relfilenode: oid,
            reltablespace: 0,
            relpages: 0,
            reltuples: 0.0,
            relkind: relkind,
            relnatts: relnatts,
            relchecks: 0,
            relhasindex: false,
            relisshared: false,
            relpersistence: 'p' // permanent
        };
        this.catalogs['pg_class'].push(tuple);
        log.info('Relation inserted', { relname, oid });
        return tuple;
    }

    async insertAttribute(attrelid, attname, atttypid, attnum, attnotnull = false) {
        log.debug('Inserting attribute into pg_attribute', { attrelid, attname, attnum });
        const tuple = {
            attrelid: attrelid,
            attname: attname,
            atttypid: atttypid,
            attlen: -1, // variable length
            attnum: attnum,
            attndims: 0,
            attcacheoff: -1,
            atttypmod: -1,
            attbyval: false,
            attstorage: 'p',
            attalign: 'i',
            attnotnull: attnotnull,
            atthasdef: false,
            attisdropped: false,
            attislocal: true,
            attinhcount: 0,
            attcollation: 0
        };
        this.catalogs['pg_attribute'].push(tuple);
        log.info('Attribute inserted', { attname, attnum });
        return tuple;
    }

    async getRelation(relname) {
        log.debug('Looking up relation', { relname });
        const relation = this.catalogs['pg_class'].find(r => r.relname === relname);
        if (relation) {
            log.info('Relation found', { oid: relation.oid });
        } else {
            log.warn('Relation not found', { relname });
        }
        return relation;
    }

    async getAttributes(relid) {
        log.debug('Getting attributes for relation', { relid });
        const attrs = this.catalogs['pg_attribute'].filter(a => a.attrelid === relid && !a.attisdropped);
        log.info('Attributes retrieved', { count: attrs.length });
        return attrs;
    }

    async getTableSchema(tableName) {
        log.debug('Getting full schema for table', { tableName });
        const relation = await this.getRelation(tableName);
        if (!relation) return null;
        
        const attributes = await this.getAttributes(relation.oid);
        const schema = {
            relation: relation,
            columns: attributes.sort((a, b) => a.attnum - b.attnum)
        };
        log.info('Table schema retrieved', { tableName, columns: schema.columns.length });
        return schema;
    }
}
