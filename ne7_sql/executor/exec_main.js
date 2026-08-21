/**
 * NE7-SQL - SQL Executor
 * Executes parsed SQL AST against the database engine
 */

import { logger } from '../core/logger.js';
import { parseSQL } from '../parser/sql_parser.js';
import { HeapAccessMethod } from '../access/heapam.js';
import { BTreeAccessMethod } from '../access/nbtree.js';
import { TransactionManager } from '../transaction/xact.js';
import { getBufferPool } from '../buffer/buffer_mgr.js';

export class SQLExecutor {
  constructor(storageMgr, transactionMgr) {
    this.storageMgr = storageMgr;
    this.transactionMgr = transactionMgr;
    this.bufferPool = getBufferPool();
    this.heapAM = new HeapAccessMethod(storageMgr, this.bufferPool, transactionMgr);
    this.btreeAM = new BTreeAccessMethod(storageMgr, this.bufferPool);
    this.catalogs = new Map(); // Store table metadata
    
    logger.info('SQL Executor initialized', { location: 'exec_main.js:constructor' });
  }

  async execute(sql) {
    logger.info('Executing SQL', { 
      sql: sql.substring(0, 200),
      location: 'exec_main.js:execute' 
    });

    try {
      const ast = parseSQL(sql);
      return await this.executeAST(ast);
    } catch (e) {
      logger.error('SQL execution failed', { 
        error: e.message,
        location: 'exec_main.js:execute' 
      });
      throw e;
    }
  }

  async executeAST(ast) {
    switch (ast.type) {
      case 'CREATE_TABLE':
        return await this.execCreateTable(ast);
      case 'INSERT':
        return await this.execInsert(ast);
      case 'SELECT':
        return await this.execSelect(ast);
      case 'UPDATE':
        return await this.execUpdate(ast);
      case 'DELETE':
        return await this.execDelete(ast);
      case 'DROP':
        return await this.execDrop(ast);
      case 'CREATE_INDEX':
        return await this.execCreateIndex(ast);
      default:
        throw new Error(`Unsupported statement type: ${ast.type}`);
    }
  }

  async execCreateTable(ast) {
    const tableName = ast.children.name;
    const columns = ast.children.columns;
    
    logger.info('Creating table', { 
      tableName, 
      columnCount: columns.length,
      location: 'exec_main.js:execCreateTable' 
    });

    // Store table metadata
    const relOid = this.allocateRelOid();
    this.catalogs.set(tableName, {
      relOid,
      columns,
      indexes: []
    });

    // Create heap relation
    await this.storageMgr.createRelation(relOid);

    return {
      success: true,
      message: `Table ${tableName} created`,
      relOid
    };
  }

  async execInsert(ast) {
    const tableName = ast.children.table;
    const values = ast.children.values;
    
    const tableMeta = this.catalogs.get(tableName);
    if (!tableMeta) {
      throw new Error(`Table ${tableName} does not exist`);
    }

    logger.info('Inserting row', { 
      tableName, 
      valueCount: values.length,
      location: 'exec_main.js:execInsert' 
    });

    // Start transaction if not already in one
    const startedTx = !this.transactionMgr.isInTransaction();
        const xid = startedTx ? this.transactionMgr.startTransaction() : this.transactionMgr.getCurrentXid();

    // Encode values into tuple
    const tupleData = this.encodeTuple(values, tableMeta.columns);

    // Insert into heap
    const tid = await this.heapAM.heapInsert(tableMeta.relOid, tupleData, xid);

    // Commit if we started the transaction
    if (startedTx) {
            await this.transactionMgr.commit();
        }

    return {
      success: true,
      message: '1 row inserted',
      tid: tid.toString()
    };
  }

  async execSelect(ast) {
    // Phase 5: B-Tree Index Scan Integration Hook
    const tableName = ast.children.table.name;
    
    const tableMeta = this.catalogs.get(tableName);
    if (!tableMeta) {
      throw new Error(`Table ${tableName} does not exist`);
    }

    logger.info('Selecting rows', { 
      tableName,
      location: 'exec_main.js:execSelect' 
    });

    // Get snapshot for MVCC
    const snapshot = this.transactionMgr.getSnapshot();
    const results = [];

    // Scan heap
    for await (const tuple of this.heapAM.heapScan(tableMeta.relOid, snapshot)) {
      // Apply WHERE filter
      if (ast.children.where) {
        const matches = await this.evaluateWhere(ast.children.where, tuple, tableMeta.columns);
        if (!matches) continue;
      }

      // Project columns
      const row = this.projectRow(tuple, ast.children.columns, tableMeta.columns);
      results.push(row);
    }

    // Apply ORDER BY
    if (ast.children.orderBy) {
      results.sort((a, b) => this.compareRows(a, b, ast.children.orderBy, tableMeta.columns));
    }

    // Apply LIMIT
    if (ast.children.limit) {
      results.splice(parseInt(ast.children.limit));
    }

    return {
      success: true,
      rowCount: results.length,
      rows: results
    };
  }

  async execUpdate(ast) {
    const tableName = ast.children.table;
    const assignments = ast.children.assignments;
    
    const tableMeta = this.catalogs.get(tableName);
    if (!tableMeta) {
      throw new Error(`Table ${tableName} does not exist`);
    }

    logger.info('Updating rows', { 
      tableName,
      assignmentCount: assignments.length,
      location: 'exec_main.js:execUpdate' 
    });

    const startedTx = !this.transactionMgr.isInTransaction();
        const xid = startedTx ? this.transactionMgr.startTransaction() : this.transactionMgr.getCurrentXid();

    const snapshot = this.transactionMgr.getSnapshot();
    let updatedCount = 0;

    for await (const tuple of this.heapAM.heapScan(tableMeta.relOid, snapshot)) {
      // Check WHERE condition
      if (ast.children.where) {
        const matches = await this.evaluateWhere(ast.children.where, tuple, tableMeta.columns);
        if (!matches) continue;
      }

      // Mark old tuple for update
      await this.heapAM.heapMarkForUpdate(tableMeta.relOid, tuple.tid, xid);

      // Create new tuple with updated values
      const newData = this.decodeTuple(tuple.data, tableMeta.columns);
      for (const assignment of assignments) {
        const colIndex = tableMeta.columns.findIndex(c => c.name === assignment.column);
        if (colIndex >= 0) {
          newData[colIndex] = assignment.value.value;
        }
      }

      const newTupleData = this.encodeTuple(newData, tableMeta.columns);
      await this.heapAM.heapInsert(tableMeta.relOid, newTupleData, xid);
      updatedCount++;
    }

    if (startedTx) {
            await this.transactionMgr.commit();
        }

    return {
      success: true,
      message: `${updatedCount} row(s) updated`
    };
  }

  async execDelete(ast) {
    const tableName = ast.children.table;
    
    const tableMeta = this.catalogs.get(tableName);
    if (!tableMeta) {
      throw new Error(`Table ${tableName} does not exist`);
    }

    logger.info('Deleting rows', { 
      tableName,
      location: 'exec_main.js:execDelete' 
    });

    const startedTx = !this.transactionMgr.isInTransaction();
        const xid = startedTx ? this.transactionMgr.startTransaction() : this.transactionMgr.getCurrentXid();

    const snapshot = this.transactionMgr.getSnapshot();
    let deletedCount = 0;

    for await (const tuple of this.heapAM.heapScan(tableMeta.relOid, snapshot)) {
      // Check WHERE condition
      if (ast.children.where) {
        const matches = await this.evaluateWhere(ast.children.where, tuple, tableMeta.columns);
        if (!matches) continue;
      }

      // Mark tuple for deletion
      await this.heapAM.heapMarkForUpdate(tableMeta.relOid, tuple.tid, xid);
      deletedCount++;
    }

    if (startedTx) {
            await this.transactionMgr.commit();
        }

    return {
      success: true,
      message: `${deletedCount} row(s) deleted`
    };
  }

  async execDrop(ast) {
    const type = ast.children.type;
    const name = ast.children.name;

    logger.info('Dropping object', { 
      type, 
      name,
      location: 'exec_main.js:execDrop' 
    });

    if (type === 'TABLE') {
      this.catalogs.delete(name);
      return { success: true, message: `Table ${name} dropped` };
    }

    throw new Error(`DROP ${type} not implemented`);
  }

  async execCreateIndex(ast) {
    const indexName = ast.children.indexName;
    const tableName = ast.children.tableName;
    const columns = ast.children.columns;

    logger.info('Creating index', { 
      indexName, 
      tableName,
      location: 'exec_main.js:execCreateIndex' 
    });

    const tableMeta = this.catalogs.get(tableName);
    if (!tableMeta) {
      throw new Error(`Table ${tableName} does not exist`);
    }

    // Create index relation
    const indexRelOid = this.allocateRelOid();
    await this.storageMgr.createRelation(indexRelOid);

    tableMeta.indexes.push({
      name: indexName,
      relOid: indexRelOid,
      columns
    });

    return {
      success: true,
      message: `Index ${indexName} created on ${tableName}`
    };
  }

  // Helper methods
  allocateRelOid() {
    return Math.floor(Math.random() * 100000) + 16384;
  }

  encodeTuple(values, columns) {
    // Simple encoding: JSON string
    const obj = {};
    values.forEach((val, i) => {
      const colName = columns[i] ? columns[i].name : `col${i}`;
      obj[colName] = val.value || val;
    });
    return new TextEncoder().encode(JSON.stringify(obj));
  }

  decodeTuple(data, columns) {
    const str = new TextDecoder().decode(data);
    const obj = JSON.parse(str);
    return columns.map(c => obj[c.name]);
  }

  projectRow(tuple, columns, tableColumns) {
        const data = this.decodeTuple(tuple.data, tableColumns);
        const rowObj = {};
        if (columns[0] && columns[0].type === 'star') {
            tableColumns.forEach((col, i) => {
                rowObj[col.name] = data[i];
            });
        } else {
            columns.forEach(col => {
                const colName = col.column || col;
                const idx = tableColumns.findIndex(c => c.name === colName);
                if (idx >= 0) {
                    rowObj[colName] = data[idx];
                }
            });
        }
        return rowObj;
    }

  async evaluateWhere(expr, tuple, columns) {
    // Simplified expression evaluation
    if (!expr) return true;
    
    const data = this.decodeTuple(tuple.data, columns);
    
    if (expr.type === 'BINARY_OP') {
      const leftVal = this.getNodeValue(expr.children.left, data, columns);
      const rightVal = this.getNodeValue(expr.children.right, data, columns);
      
      switch (expr.value) {
        case '=': return leftVal === rightVal;
        case '<>': return leftVal !== rightVal;
        case '<': return leftVal < rightVal;
        case '>': return leftVal > rightVal;
        case '<=': return leftVal <= rightVal;
        case '>=': return leftVal >= rightVal;
        case 'AND': return leftVal && rightVal;
        case 'OR': return leftVal || rightVal;
        default: return false;
      }
    }
    
    return true;
  }

  getNodeValue(node, data, columns) {
    if (node.type === 'LITERAL') {
      return node.value;
    }
    if (node.type === 'column') {
      const idx = columns.findIndex(c => c.name === node.column);
      return idx >= 0 ? data[idx] : null;
    }
    return null;
  }

  compareRows(a, b, orderBy, columns) {
    for (const item of orderBy) {
      const colName = item.column.column || item.column;
      const aIdx = columns.findIndex(c => c.name === colName);
      const bIdx = aIdx;
      
      const aVal = a[aIdx];
      const bVal = b[bIdx];
      
      let cmp = 0;
      if (aVal < bVal) cmp = -1;
      else if (aVal > bVal) cmp = 1;
      
      if (cmp !== 0) {
        return item.direction === 'DESC' ? -cmp : cmp;
      }
    }
    return 0;
  }
}

logger.info('SQL Executor module loaded', { location: 'exec_main.js:module' });
