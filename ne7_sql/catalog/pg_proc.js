/**
 * NE7-SQL - pg_proc Helper
 * PostgreSQL 18.6 Logic Rewrite: catalog/pg_proc.c
 * Function/procedure metadata operations
 */

import { Logger } from '../core/logger.js';

const log = new Logger('pg_proc');

export class PgProc {
    constructor(catalogManager) {
        this.catalogs = catalogManager;
        log.debug('PgProc helper initialized');
        
        // Initialize built-in functions
        this.builtinFunctions = [
            { name: 'count', oid: 2803, nargs: 0, returnType: 20 }, // BIGINT
            { name: 'sum', oid: 2804, nargs: 1, returnType: 20 },
            { name: 'avg', oid: 2805, nargs: 1, returnType: 701 }, // FLOAT8
            { name: 'min', oid: 2806, nargs: 1, returnType: 0 }, // anyelement
            { name: 'max', oid: 2807, nargs: 1, returnType: 0 },
            { name: 'now', oid: 2808, nargs: 0, returnType: 1184 }, // TIMESTAMPTZ
            { name: 'current_timestamp', oid: 2809, nargs: 0, returnType: 1184 },
            { name: 'upper', oid: 2810, nargs: 1, returnType: 1043 }, // VARCHAR
            { name: 'lower', oid: 2811, nargs: 1, returnType: 1043 },
            { name: 'length', oid: 2812, nargs: 1, returnType: 23 }, // INT4
            { name: 'substring', oid: 2813, nargs: 3, returnType: 1043 },
            { name: 'trim', oid: 2814, nargs: 1, returnType: 1043 },
            { name: 'coalesce', oid: 2815, nargs: -1, returnType: 0 }, // variadic
            { name: 'nullif', oid: 2816, nargs: 2, returnType: 0 }
        ];
    }

    async initialize() {
        log.info('Initializing pg_proc with builtin functions');
        for (const func of this.builtinFunctions) {
            await this.registerFunction(
                func.oid,
                func.name,
                func.nargs,
                func.returnType,
                'f', // funckind: f=function
                'i', // provolatile: i=immutable
                true // proisstrict
            );
        }
        log.info('Builtin functions registered', { count: this.builtinFunctions.length });
    }

    async registerFunction(oid, proname, nargs, returnType, funcKind = 'f', volatile = 'i', isStrict = false) {
        log.debug('Registering function', { proname, oid, nargs });
        
        const tuple = {
            oid: oid,
            proname: proname,
            pronamespace: 11, // pg_catalog
            proowner: 10, // postgres
            prolang: 12, // internal
            procost: 1.0,
            prorows: 0.0,
            provariadic: 0,
            protransform: 0,
            proisagg: funcKind === 'a',
            proiswindow: funcKind === 'w',
            prosecdef: false,
            proleakproof: false,
            proisstrict: isStrict,
            proretset: false,
            provolatile: volatile,
            proparallel: 's', // safe
            pronargs: nargs >= 0 ? nargs : 0,
            pronargdefaults: 0,
            prorettype: returnType,
            proargtypes: [], // array of OIDs
            proallargtypes: [],
            proargmodes: [],
            proargnames: [],
            proargdefaults: null,
            protrftypes: null,
            prosrc: proname, // source code (internal function name)
            probin: null,
            proconfig: null
        };
        
        this.catalogs.catalogs['pg_proc'].push(tuple);
        log.info('Function registered', { proname, oid });
        return tuple;
    }

    async getFunctionByName(name) {
        log.debug('Looking up function', { name });
        const func = this.catalogs.catalogs['pg_proc'].find(f => f.proname === name);
        
        if (func) {
            log.info('Function found', { name, oid: func.oid });
        } else {
            log.warn('Function not found', { name });
        }
        return func;
    }

    async getFunctionByOid(oid) {
        log.debug('Looking up function by OID', { oid });
        const func = this.catalogs.catalogs['pg_proc'].find(f => f.oid === oid);
        
        if (func) {
            log.info('Function found', { oid, name: func.proname });
        } else {
            log.warn('Function not found', { oid });
        }
        return func;
    }

    async isAggregateFunction(funcOid) {
        log.debug('Checking if function is aggregate', { funcOid });
        const func = await this.getFunctionByOid(funcOid);
        if (!func) return false;
        
        const isAgg = func.proisagg;
        log.debug('Aggregate check result', { funcOid, isAgg });
        return isAgg;
    }

    async isWindowFunction(funcOid) {
        log.debug('Checking if function is window', { funcOid });
        const func = await this.getFunctionByOid(funcOid);
        if (!func) return false;
        
        const isWindow = func.proiswindow;
        log.debug('Window function check result', { funcOid, isWindow });
        return isWindow;
    }

    async validateFunctionCall(funcOid, argTypes) {
        log.debug('Validating function call', { funcOid, argTypes: argTypes.length });
        const func = await this.getFunctionByOid(funcOid);
        if (!func) {
            log.error('Function not found for validation', { funcOid });
            return false;
        }
        
        if (func.pronargs !== -1 && func.pronargs !== argTypes.length) {
            log.error('Argument count mismatch', { expected: func.pronargs, actual: argTypes.length });
            return false;
        }
        
        log.info('Function call validated', { funcOid, args: argTypes.length });
        return true;
    }

    async dropFunction(funcOid) {
        log.warn('Dropping function', { funcOid });
        const idx = this.catalogs.catalogs['pg_proc'].findIndex(f => f.oid === funcOid);
        
        if (idx === -1) {
            log.error('Cannot drop - function not found', { funcOid });
            return false;
        }
        
        const funcName = this.catalogs.catalogs['pg_proc'][idx].proname;
        this.catalogs.catalogs['pg_proc'].splice(idx, 1);
        log.info('Function dropped', { name: funcName, oid: funcOid });
        return true;
    }
}
