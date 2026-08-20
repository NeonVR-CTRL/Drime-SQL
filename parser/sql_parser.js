/**
 * DRIME.SQL - SQL Parser
 */
import { logger } from '../core/logger.js';

export class SQLParser {
    constructor() {
        logger.info('SQLParser initialized', { module: 'parser' });
    }

    parse(sql) {
        const trimmed = sql.trim().toUpperCase();
        logger.debug(`Parsing SQL`, { sql, module: 'parser' });

        if (trimmed.startsWith('INSERT')) return this.parseInsert(sql);
        if (trimmed.startsWith('SELECT')) return this.parseSelect(sql);
        if (trimmed.startsWith('UPDATE')) return this.parseUpdate(sql);
        if (trimmed.startsWith('DELETE')) return this.parseDelete(sql);
        if (trimmed.startsWith('CREATE TABLE')) return this.parseCreateTable(sql);
        
        throw new Error(`Unsupported SQL: ${sql}`);
    }

    parseInsert(sql) {
        const match = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (!match) throw new Error('Invalid INSERT');
        const table = match[1];
        const columns = match[2].split(',').map(c => c.trim());
        const values = match[3].split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''));
        const data = {};
        columns.forEach((col, i) => data[col] = values[i]);
        logger.info(`Parsed INSERT`, { table, module: 'parser' });
        return { type: 'INSERT', table, data };
    }

    parseSelect(sql) {
        const match = sql.match(/SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
        if (!match) throw new Error('Invalid SELECT');
        const table = match[2];
        const where = match[3] ? this.parseWhere(match[3]) : null;
        logger.info(`Parsed SELECT`, { table, module: 'parser' });
        return { type: 'SELECT', table, columns: match[1], where };
    }

    parseUpdate(sql) {
        const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?/i);
        if (!match) throw new Error('Invalid UPDATE');
        const table = match[1];
        const updates = {};
        match[2].split(',').forEach(part => {
            const [k, v] = part.split('=').map(s => s.trim());
            updates[k] = v.replace(/^['"]|['"]$/g, '');
        });
        const where = match[3] ? this.parseWhere(match[3]) : null;
        logger.info(`Parsed UPDATE`, { table, module: 'parser' });
        return { type: 'UPDATE', table, updates, where };
    }

    parseDelete(sql) {
        const match = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
        if (!match) throw new Error('Invalid DELETE');
        const table = match[1];
        const where = match[2] ? this.parseWhere(match[2]) : null;
        logger.info(`Parsed DELETE`, { table, module: 'parser' });
        return { type: 'DELETE', table, where };
    }

    parseCreateTable(sql) {
        const match = sql.match(/CREATE\s+TABLE\s+(\w+)\s*\(([^)]+)\)/i);
        if (!match) throw new Error('Invalid CREATE TABLE');
        const table = match[1];
        const columns = match[2].split(',').map(c => {
            const [name, type] = c.trim().split(/\s+/);
            return { name, type: type.toUpperCase() };
        });
        logger.info(`Parsed CREATE TABLE`, { table, module: 'parser' });
        return { type: 'CREATE_TABLE', table, columns };
    }

    parseWhere(clause) {
        const conditions = [];
        clause.split(/\s+AND\s+/i).forEach(cond => {
            const match = cond.match(/(\w+)\s*=\s*['"]?([^'"]+)['"]?/);
            if (match) conditions.push({ column: match[1], value: match[2].trim() });
        });
        return conditions;
    }
}
