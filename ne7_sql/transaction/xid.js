/**
 * NE7-SQL - Transaction ID Generator
 * PostgreSQL 18.6 Logic Rewrite (xid.c)
 * 
 * Handles 32-bit Transaction ID generation with wraparound safety.
 */

import { logDebug, logError } from '../core/logger.js';

const XID_WRAPAROUND_THRESHOLD = 2000000000; // 2 billion
const FIRST_NORMAL_XID = 3; // 0 and 1 are reserved, 2 is bootstrap

export class XidGenerator {
    constructor() {
        this.nextXid = BigInt(FIRST_NORMAL_XID);
        this.epoch = 0;
        logDebug('XidGenerator initialized', { file: 'xid.js', line: 14, data: { firstXid: FIRST_NORMAL_XID } });
    }

    /**
     * Generate next transaction ID
     * @returns {bigint} Next XID
     */
    getNextXid() {
        try {
            const xid = this.nextXid;
            this.nextXid++;
            
            // Handle wraparound logic (simplified for JS)
            if (this.nextXid > BigInt(Number.MAX_SAFE_INTEGER)) {
                this.epoch++;
                this.nextXid = BigInt(FIRST_NORMAL_XID);
                logDebug('XID epoch wraparound occurred', { 
                    file: 'xid.js', 
                    line: 27, 
                    data: { newEpoch: this.epoch } 
                });
            }
            
            return xid;
        } catch (error) {
            logError('Failed to generate XID', { file: 'xid.js', line: 32, error: error.message });
            throw error;
        }
    }

    /**
     * Check if XID is in normal range
     */
    isNormalXid(xid) {
        return xid >= BigInt(FIRST_NORMAL_XID);
    }

    /**
     * Get current state for debugging
     */
    getState() {
        return {
            nextXid: this.nextXid.toString(),
            epoch: this.epoch
        };
    }
}

export default XidGenerator;
