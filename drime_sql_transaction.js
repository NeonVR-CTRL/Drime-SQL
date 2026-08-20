/**
 * DRIME.SQL - Transaction Manager (MVCC)
 * Rewritten from PostgreSQL 18.6 access/transam/twophase.c
 * 
 * Features:
 * - Multi-Version Concurrency Control (MVCC)
 * - Transaction IDs (XID)
 * - Snapshot Isolation
 * - Commit/Rollback with WAL
 */

import { DrimeLogger } from './core_logger.js';

export class DrimeTransactionManager {
    constructor(storageManager) {
        this.storage = storageManager;
        this.logger = new DrimeLogger('DrimeTransactionManager');
        this.currentXid = 1n; // Start XID at 1 (0 is invalid)
        this.activeTransactions = new Map();
        this.committedXids = new Set();
        this.abortedXids = new Set();
    }

    /**
     * Start a new transaction
     * Mirrors: StartTransaction()
     */
    async begin() {
        const xid = this.currentXid++;
        const snapshot = this.getSnapshot();
        
        const tx = {
            xid,
            snapshot,
            startTime: Date.now(),
            state: 'ACTIVE',
            modifications: [] // Track changes for rollback
        };

        this.activeTransactions.set(xid, tx);
        this.logger.info(`Transaction Started`, { xid: xid.toString(), snapshot });
        
        return xid;
    }

    /**
     * Get current snapshot of active transactions
     * Mirrors: GetSnapshotData()
     */
    getSnapshot() {
        const activeXids = Array.from(this.activeTransactions.keys()).map(x => x.toString());
        return {
            xmin: this.currentXid, // Transactions >= xmin are invisible
            xmax: this.currentXid + BigInt(activeXids.length), 
            xip: activeXids // In-progress transactions
        };
    }

    /**
     * Commit a transaction
     * Mirrors: CommitTransaction()
     */
    async commit(xid) {
        const tx = this.activeTransactions.get(xid);
        if (!tx || tx.state !== 'ACTIVE') {
            throw new Error(`Invalid transaction state for XID ${xid}`);
        }

        this.logger.info(`Committing Transaction`, { xid: xid.toString() });

        // 1. Write COMMIT record to WAL
        await this.writeXlogRecord('COMMIT', xid, tx.modifications);

        // 2. Mark as committed
        this.committedXids.add(xid.toString());
        tx.state = 'COMMITTED';

        // 3. Remove from active
        this.activeTransactions.delete(xid);

        // 4. Trigger Checkpoint (optional, usually background)
        await this.storage.checkpoint();

        this.logger.info(`Transaction Committed`, { xid: xid.toString() });
        return true;
    }

    /**
     * Rollback a transaction
     * Mirrors: AbortTransaction()
     */
    async rollback(xid) {
        const tx = this.activeTransactions.get(xid);
        if (!tx) {
            throw new Error(`Transaction not found: ${xid}`);
        }

        this.logger.warn(`Rolling back Transaction`, { xid: xid.toString() });

        // 1. Write ABORT record to WAL
        await this.writeXlogRecord('ABORT', xid, tx.modifications);

        // 2. Undo modifications (in real impl, we'd revert pages)
        // Here we just discard the changes since they weren't flushed permanently yet
        
        tx.state = 'ABORTED';
        this.abortedXids.add(xid.toString());
        this.activeTransactions.delete(xid);

        this.logger.info(`Transaction Rolled Back`, { xid: xid.toString() });
        return true;
    }

    /**
     * Check visibility of a tuple's XID
     * Mirrors: HeapTupleSatisfiesMVCC()
     */
    isVisible(tupleXid, snapshot) {
        const xidBig = BigInt(tupleXid);
        
        // Created by an uncommitted transaction? -> Invisible
        if (this.activeTransactions.has(xidBig)) {
            return false;
        }

        // Created by a committed transaction before our snapshot? -> Visible
        if (this.committedXids.has(tupleXid)) {
            return xidBig < snapshot.xmin;
        }

        // Created by an aborted transaction? -> Invisible
        if (this.abortedXids.has(tupleXid)) {
            return false;
        }

        return false;
    }

    /**
     * Write Transaction Log Record
     */
    async writeXlogRecord(type, xid, modifications) {
        const record = {
            type,
            xid: xid.toString(),
            timestamp: Date.now(),
            modificationCount: modifications.length
        };
        
        // Append to WAL buffer in Storage Manager
        await this.storage.writeWalRecord(
            this.storage.generateLsn(), 
            0, // System relation
            0, // Xlog block
            new TextEncoder().encode(JSON.stringify(record))
        );
        
        this.logger.debug(`XLog Record Written`, record);
    }
}
