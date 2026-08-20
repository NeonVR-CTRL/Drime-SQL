/**
 * DRIME.SQL - Transaction Manager
 * Rewritten from PostgreSQL 18.6 src/backend/access/transam/xact.c
 */

import { logger } from '../core/logger.js';
import { MVCCManager } from './mvcc.js';

export class TransactionMgr {
    constructor() {
        this.currentXID = 1;
        this.transactionState = 'IDLE';
        this.mvcc = new MVCCManager(this);
        logger.info('TransactionMgr initialized', { module: 'xact' });
    }

    getCurrentXID() {
        if (this.transactionState === 'IDLE') {
            this.transactionState = 'INPROGRESS';
            this.currentXID++;
            logger.debug(`New transaction started`, { xid: this.currentXID, module: 'xact' });
        }
        return this.currentXID;
    }

    GetSnapshot() {
        return this.mvcc.GetSnapshot();
    }

    heapTupleSatisfiesSnapshot(header, snapshot) {
        return this.mvcc.heapTupleSatisfiesSnapshot(header, snapshot);
    }

    async commit() {
        logger.info(`Transaction committed`, { xid: this.currentXID, module: 'xact' });
        this.transactionState = 'COMMITTED';
        this.currentXID++;
        this.transactionState = 'IDLE';
        return { success: true };
    }

    async rollback() {
        logger.warn(`Transaction rolled back`, { xid: this.currentXID, module: 'xact' });
        this.transactionState = 'ABORTED';
        this.currentXID++;
        this.transactionState = 'IDLE';
        return { success: true };
    }

    async begin() {
        this.transactionState = 'IDLE';
        logger.debug(`Transaction ready to begin`, { module: 'xact' });
        return { success: true };
    }
}
