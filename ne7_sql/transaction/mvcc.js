/**
 * NE7-SQL - MVCC Visibility Rules
 * PostgreSQL 18.6 Logic Rewrite (heapam.c - HeapTupleSatisfiesSnapshot)
 * 
 * Implements Multi-Version Concurrency Control visibility checks.
 */

import { logDebug, logError } from '../core/logger.js';

export class MVCCVisibility {
    constructor(transactionManager) {
        this.xactMgr = transactionManager;
        logDebug('MVCCVisibility initialized', { file: 'mvcc.js', line: 12 });
    }

    /**
     * Check if a tuple is visible to the current transaction snapshot
     * @param {Object} tuple - HeapTuple with xmin, xmax, t_cid
     * @param {Object} snapshot - Transaction snapshot with xmin, xmax, xip
     * @returns {boolean} True if tuple is visible
     */
    heapTupleSatisfiesSnapshot(tuple, snapshot) {
        try {
            const { xmin, xmax } = tuple;
            const { xmin: snapXmin, xmax: snapXmax, xip } = snapshot;

            logDebug('Checking tuple visibility', { 
                file: 'mvcc.js', 
                line: 24, 
                data: { tupleXmin: xmin.toString(), tupleXmax: xmax.toString(), snapXmin: snapXmin.toString() } 
            });

            // Tuple inserted by current transaction?
            if (xmin === snapshot.currentXid) {
                return true;
            }

            // Tuple inserted by future transaction? (not visible)
            if (xmin >= snapXmax) {
                return false;
            }

            // Tuple inserted by too-old transaction? (not visible)
            if (xmin < snapXmin) {
                return false;
            }

            // Tuple inserted by transaction in progress? (check xip)
            if (xip.includes(xmin)) {
                return false;
            }

            // Tuple deleted by current transaction?
            if (xmax !== BigInt(0) && xmax === snapshot.currentXid) {
                return false;
            }

            // Tuple deleted by future transaction? (still visible)
            if (xmax >= snapXmax) {
                return true;
            }

            // Tuple deleted by too-old transaction? (not visible)
            if (xmax < snapXmin) {
                return false;
            }

            // Tuple deleted by transaction in progress? (still visible)
            if (xip.includes(xmax)) {
                return true;
            }

            // Default: visible
            return true;

        } catch (error) {
            logError('MVCC visibility check failed', { file: 'mvcc.js', line: 72, error: error.message });
            throw error;
        }
    }

    /**
     * Create a new snapshot for the current transaction
     * @param {bigint} currentXid - Current transaction ID
     * @param {Array<bigint>} activeTransactions - List of active XIDs
     * @returns {Object} Snapshot object
     */
    createSnapshot(currentXid, activeTransactions) {
        const snapshot = {
            xmin: currentXid,
            xmax: currentXid + BigInt(activeTransactions.length) + BigInt(1),
            xip: activeTransactions.filter(xid => xid < currentXid),
            currentXid: currentXid
        };

        logDebug('Snapshot created', { 
            file: 'mvcc.js', 
            line: 92, 
            data: { snapshotXmin: snapshot.xmin.toString(), activeCount: snapshot.xip.length } 
        });

        return snapshot;
    }
}

export default MVCCVisibility;
