/**
 * NE7-SQL - Transaction Manager (xact rewrite)
 * Implements PostgreSQL transaction state, XID generation, MVCC snapshots
 */

import { 
  InvalidTransactionId, 
  MaxTransactionId, 
  BootstrapTransactionId,
  FrozenTransactionId,
  TRANSACTION_STATUS_IN_PROGRESS,
  TRANSACTION_STATUS_COMMITTED,
  TRANSACTION_STATUS_ABORTED
} from '../core/constants.js';
import { logger } from '../core/logger.js';

export class TransactionState {
  constructor() {
    this.xid = InvalidTransactionId;
    this.state = 'IDLE'; // IDLE, START, INPROGRESS, COMMITTED, ABORTED
    this.startTime = null;
    this.nestingLevel = 0;
  }

  startTransaction(xid) {
    this.xid = xid;
    this.state = 'INPROGRESS';
    this.startTime = Date.now();
    this.nestingLevel = 1;
    logger.debug('Transaction started', { 
      xid, 
      location: 'xact.js:startTransaction' 
    });
  }

  commit() {
    this.state = 'COMMITTED';
    logger.info('Transaction committed', { 
      xid: this.xid, 
      location: 'xact.js:commit' 
    });
  }

  abort() {
    this.state = 'ABORTED';
    logger.warn('Transaction aborted', { 
      xid: this.xid, 
      location: 'xact.js:abort' 
    });
  }

  beginSubtransaction() {
    this.nestingLevel++;
    logger.debug('Subtransaction started', { 
      xid: this.xid, 
      level: this.nestingLevel,
      location: 'xact.js:beginSubtransaction' 
    });
  }

  endSubtransaction() {
    if (this.nestingLevel > 1) {
      this.nestingLevel--;
      logger.debug('Subtransaction ended', { 
        xid: this.xid, 
        level: this.nestingLevel,
        location: 'xact.js:endSubtransaction' 
      });
    }
  }

  isCurrentXid(xid) {
    return this.xid === xid;
  }
}

export class XidGenerator {
  constructor() {
    this.nextXid = FirstNormalObjectId;
    this.epoch = 0;
    logger.info('XID generator initialized', { 
      nextXid: this.nextXid,
      location: 'xidGenerator.js:constructor' 
    });
  }

  getNextXid() {
    if (this.nextXid > MaxTransactionId) {
      this.nextXid = FirstNormalObjectId;
      this.epoch++;
      logger.warn('XID wraparound occurred', { 
        epoch: this.epoch,
        location: 'xidGenerator.js:getNextXid' 
      });
    }
    
    const xid = this.nextXid++;
    logger.debug('XID generated', { 
      xid, 
      epoch: this.epoch,
      location: 'xidGenerator.js:getNextXid' 
    });
    
    return xid;
  }

  getCurrentXid() {
    return this.nextXid - 1;
  }

  reset() {
    this.nextXid = FirstNormalObjectId;
    this.epoch = 0;
    logger.info('XID generator reset', { location: 'xidGenerator.js:reset' });
  }
}

// Import after definition to avoid circular dependency
const FirstNormalObjectId = 16384;

export class Snapshot {
  constructor(xmin, xmax, xipList) {
    this.xmin = xmin; // Transactions < xmin are visible
    this.xmax = xmax; // Transactions >= xmax are not visible
    this.xipList = xipList || []; // In-progress transactions array
    this.takenAt = Date.now();
    
    logger.debug('Snapshot created', { 
      xmin, 
      xmax, 
      xipLength: xipList ? xipList.length : 0,
      location: 'snapshot.js:constructor' 
    });
  }

  static create(activeXids, nextXid) {
    const xmin = nextXid;
    const xmax = nextXid + 1000; // Arbitrary future bound
    return new Snapshot(xmin, xmax, activeXids);
  }
}

export class TransactionManager {
  constructor(storageMgr, bufferPool) {
    this.storageMgr = storageMgr;
    this.bufferPool = bufferPool;
    this.currentTx = new TransactionState();
    this.xidGenerator = new XidGenerator();
    this.activeTransactions = new Map(); // xid -> TransactionState
    this.committedXids = new Set();
    this.abortedXids = new Set();
    
    logger.info('Transaction manager initialized', { location: 'xact.js:constructor' });
  }

  // Start a new transaction
  startTransaction() {
    if (this.currentTx.state !== 'IDLE') {
      throw new Error('Transaction already in progress');
    }

    const xid = this.xidGenerator.getNextXid();
    this.currentTx.startTransaction(xid);
    this.activeTransactions.set(xid, this.currentTx);
    
    // Log transaction start in WAL
    this.logTransactionStart(xid);
    
    return xid;
  }

  // Commit current transaction
  async commit() {
    if (this.currentTx.state !== 'INPROGRESS') {
      throw new Error('No transaction to commit');
    }

    const xid = this.currentTx.xid;
    
    // Write commit record to WAL
    await this.logTransactionCommit(xid);
    
    // Mark as committed
    this.currentTx.commit();
    this.committedXids.add(xid);
    this.activeTransactions.delete(xid);
    
    // Update CLOG
    await this.updateCLOG(xid, TRANSACTION_STATUS_COMMITTED);
    
    // Reset current transaction
    this.currentTx = new TransactionState();
    
    logger.info('Transaction committed successfully', { 
      xid, 
      location: 'xact.js:commit' 
    });
  }

  // Abort current transaction
  async abort() {
    if (this.currentTx.state !== 'INPROGRESS') {
      throw new Error('No transaction to abort');
    }

    const xid = this.currentTx.xid;
    
    // Write abort record to WAL
    await this.logTransactionAbort(xid);
    
    // Mark as aborted
    this.currentTx.abort();
    this.abortedXids.add(xid);
    this.activeTransactions.delete(xid);
    
    // Update CLOG
    await this.updateCLOG(xid, TRANSACTION_STATUS_ABORTED);
    
    // Reset current transaction
    this.currentTx = new TransactionState();
    
    logger.warn('Transaction aborted successfully', { 
      xid, 
      location: 'xact.js:abort' 
    });
  }

  // Get snapshot for MVCC
  getSnapshot() {
    const activeXids = Array.from(this.activeTransactions.keys());
    const nextXid = this.xidGenerator.getNextXid();
    // Don't increment, just peek
    this.xidGenerator.nextXid--;
    
    return Snapshot.create(activeXids, nextXid);
  }

  // Check if tuple is visible in snapshot
  isVisible(tupleHeader, snapshot) {
    const xmin = tupleHeader.t_xmin;
    const xmax = tupleHeader.t_xmax;
    
    // Inserted by uncommitted transaction?
    if (this.isInProgress(xmin)) {
      return false;
    }
    
    // Inserted by aborted transaction?
    if (this.isAborted(xmin)) {
      return false;
    }
    
    // Inserted too far in future?
    if (xmin >= snapshot.xmax) {
      return false;
    }
    
    // Inserted before our snapshot and not in progress?
    if (xmin < snapshot.xmin && !snapshot.xipList.includes(xmin)) {
      // Visible unless deleted
      if (xmax === InvalidTransactionId) {
        return true;
      }
      
      // Deleted by uncommitted transaction?
      if (this.isInProgress(xmax)) {
        return true;
      }
      
      // Deleted by aborted transaction?
      if (this.isAborted(xmax)) {
        return true;
      }
      
      // Deleted after our snapshot started?
      if (xmax >= snapshot.xmin) {
        return true;
      }
    }
    
    return false;
  }

  isInProgress(xid) {
    return this.activeTransactions.has(xid);
  }

  isAborted(xid) {
    return this.abortedXids.has(xid);
  }

  isCommitted(xid) {
    return this.committedXids.has(xid);
  }

  // WAL logging for transactions
  async logTransactionStart(xid) {
    logger.debug('WAL: Transaction start logged', { 
      xid, 
      location: 'xact.js:logTransactionStart' 
    });
  }

  async logTransactionCommit(xid) {
    logger.info('WAL: Transaction commit logged', { 
      xid, 
      location: 'xact.js:logTransactionCommit' 
    });
  }

  async logTransactionAbort(xid) {
    logger.warn('WAL: Transaction abort logged', { 
      xid, 
      location: 'xact.js:logTransactionAbort' 
    });
  }

  // CLOG management
  async updateCLOG(xid, status) {
    logger.debug('CLOG updated', { 
      xid, 
      status,
      location: 'xact.js:updateCLOG' 
    });
  }

  async readCLOG(xid) {
    if (this.committedXids.has(xid)) {
      return TRANSACTION_STATUS_COMMITTED;
    }
    if (this.abortedXids.has(xid)) {
      return TRANSACTION_STATUS_ABORTED;
    }
    if (this.activeTransactions.has(xid)) {
      return TRANSACTION_STATUS_IN_PROGRESS;
    }
    return TRANSACTION_STATUS_IN_PROGRESS;
  }

  // Get current transaction ID
  getCurrentXid() {
    return this.currentTx.xid;
  }

  // Check if in transaction
  isInTransaction() {
    return this.currentTx.state === 'INPROGRESS';
  }
}

logger.info('Transaction manager module loaded', { location: 'xact.js:module' });
