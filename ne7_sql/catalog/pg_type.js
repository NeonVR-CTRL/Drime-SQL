/**
 * NE7-SQL - pg_type Helper
 * PostgreSQL 18.6 Logic Rewrite: catalog/pg_type.c
 * Data type definitions and operations
 */

import { Logger } from '../core/logger.js';

const log = new Logger('pg_type');

export class PgType {
    constructor(catalogManager) {
        this.catalogs = catalogManager;
        log.debug('PgType helper initialized');
        
        // PostgreSQL built-in types with their OIDs
        this.builtinTypes = [
            { oid: 16, name: 'bool', len: 1, byval: true, category: 'B', align: 'c' },
            { oid: 17, name: 'bytea', len: -1, byval: false, category: 'U', align: 'i' },
            { oid: 18, name: 'char', len: 1, byval: true, category: 'S', align: 'c' },
            { oid: 19, name: 'name', len: 64, byval: false, category: 'S', align: 'i' },
            { oid: 20, name: 'int8', len: 8, byval: true, category: 'N', align: 'd' },
            { oid: 21, name: 'int2', len: 2, byval: true, category: 'N', align: 's' },
            { oid: 23, name: 'int4', len: 4, byval: true, category: 'N', align: 'i' },
            { oid: 25, name: 'text', len: -1, byval: false, category: 'S', align: 'i' },
            { oid: 26, name: 'oid', len: 4, byval: true, category: 'N', align: 'i' },
            { oid: 700, name: 'float4', len: 4, byval: true, category: 'N', align: 'i' },
            { oid: 701, name: 'float8', len: 8, byval: true, category: 'N', align: 'd' },
            { oid: 1042, name: 'bpchar', len: -1, byval: false, category: 'S', align: 'i' }, // char(n)
            { oid: 1043, name: 'varchar', len: -1, byval: false, category: 'S', align: 'i' },
            { oid: 1082, name: 'date', len: 4, byval: true, category: 'D', align: 'i' },
            { oid: 1114, name: 'timestamp', len: 8, byval: true, category: 'D', align: 'd' },
            { oid: 1184, name: 'timestamptz', len: 8, byval: true, category: 'D', align: 'd' },
            { oid: 1266, name: 'timetz', len: 12, byval: false, category: 'D', align: 'd' },
            { oid: 1700, name: 'numeric', len: -1, byval: false, category: 'N', align: 'd' },
            { oid: 2278, name: 'void', len: 4, byval: true, category: 'P', align: 'i' },
            { oid: 2950, name: 'uuid', len: 16, byval: false, category: 'U', align: 'i' },
            { oid: 3802, name: 'jsonb', len: -1, byval: false, category: 'U', align: 'i' },
            { oid: 114, name: 'json', len: -1, byval: false, category: 'U', align: 'i' }
        ];
    }

    async initialize() {
        log.info('Initializing pg_type with builtin types');
        for (const type of this.builtinTypes) {
            await this.registerType(
                type.oid,
                type.name,
                type.len,
                type.byval,
                type.category,
                type.align
            );
        }
        log.info('Builtin types registered', { count: this.builtinTypes.length });
    }

    async registerType(oid, typname, typlen, typbyval, typcategory, typalign, typstorage = 'p') {
        log.debug('Registering type', { typname, oid });
        
        const tuple = {
            oid: oid,
            typname: typname,
            typnamespace: 11, // pg_catalog
            typowner: 10, // postgres
            typlen: typlen,
            typbyval: typbyval,
            typcategory: typcategory,
            typispreferred: false,
            typisdefined: true,
            typdelim: ',',
            typrelid: 0,
            typelem: 0,
            typarray: 0,
            typinput: 0,
            typoutput: 0,
            typreceive: 0,
            typsend: 0,
            typmodin: 0,
            typmodout: 0,
            typanalyze: 0,
            typalign: typalign,
            typstorage: typstorage,
            typnotnull: false,
            typbasetype: 0,
            typtypmod: -1,
            typndims: 0,
            typcollation: 0,
            typdefaultbin: null,
            typdefault: null
        };
        
        this.catalogs.catalogs['pg_type'].push(tuple);
        log.info('Type registered', { typname, oid });
        return tuple;
    }

    async getTypeByName(name) {
        log.debug('Looking up type by name', { name });
        const type = this.catalogs.catalogs['pg_type'].find(t => t.typname === name);
        
        if (type) {
            log.info('Type found', { name, oid: type.oid });
        } else {
            log.warn('Type not found', { name });
        }
        return type;
    }

    async getTypeByOid(oid) {
        log.debug('Looking up type by OID', { oid });
        const type = this.catalogs.catalogs['pg_type'].find(t => t.oid === oid);
        
        if (type) {
            log.info('Type found', { oid, name: type.typname });
        } else {
            log.warn('Type not found', { oid });
        }
        return type;
    }

    async getArrayType(baseTypeOid) {
        log.debug('Getting array type for base type', { baseTypeOid });
        const baseType = await this.getTypeByOid(baseTypeOid);
        if (!baseType) {
            log.error('Base type not found', { baseTypeOid });
            return null;
        }
        
        // Check if array type already exists
        if (baseType.typarray !== 0) {
            const arrayType = await this.getTypeByOid(baseType.typarray);
            if (arrayType) return arrayType;
        }
        
        // Create array type on the fly
        const arrayOid = baseTypeOid + 10000; // Simple array OID generation
        const arrayName = `_${baseType.typname}`;
        
        log.info('Creating array type', { baseType: baseType.typname, arrayName, arrayOid });
        
        await this.registerType(
            arrayOid,
            arrayName,
            -1, // variable length
            false,
            'A', // array category
            'i'
        );
        
        // Update base type to reference array
        baseType.typarray = arrayOid;
        
        const arrayType = await this.getTypeByOid(arrayOid);
        arrayType.typelem = baseTypeOid;
        
        log.info('Array type created', { arrayName, element: baseType.typname });
        return arrayType;
    }

    async isValidType(typeOid) {
        log.debug('Validating type', { typeOid });
        const type = await this.getTypeByOid(typeOid);
        const valid = type !== null && type.typisdefined;
        log.debug('Type validation result', { typeOid, valid });
        return valid;
    }

    async isNumericType(typeOid) {
        const type = await this.getTypeByOid(typeOid);
        if (!type) return false;
        return type.typcategory === 'N';
    }

    async isStringType(typeOid) {
        const type = await this.getTypeByOid(typeOid);
        if (!type) return false;
        return type.typcategory === 'S';
    }

    async isDateTimeType(typeOid) {
        const type = await this.getTypeByOid(typeOid);
        if (!type) return false;
        return type.typcategory === 'D';
    }

    async getTypeSize(typeOid) {
        const type = await this.getTypeByOid(typeOid);
        if (!type) return -1;
        return type.typlen;
    }

    async isPassByValue(typeOid) {
        const type = await this.getTypeByOid(typeOid);
        if (!type) return false;
        return type.typbyval;
    }
}
