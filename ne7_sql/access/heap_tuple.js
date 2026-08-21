/**
 * NE7-SQL - HeapTuple Header Logic
 * Rewritten from PostgreSQL 18.6 src/include/access/htup_details.h
 * Implements t_xmin, t_xmax, t_ctid, t_infomask
 */

import { logger } from '../core/logger.js';
import { MAXALIGN, HEAP_XMIN_COMMITTED, HEAP_XMAX_COMMITTED } from '../core/constants.js';

export class HeapTupleHeader {
    constructor(t_xmin, t_xmax, t_ctid, t_infomask = 0) {
        this.t_xmin = t_xmin;       // Inserting XID
        this.t_xmax = t_xmax;       // Deleting XID (0 if alive)
        this.t_ctid = t_ctid;       // Current TID (self pointer)
        this.t_infomask = t_infomask; // Flags (committed, locked, etc.)
        this.t_hoff = 24;           // Header offset (aligned)
        
        logger.debug('HeapTupleHeader created', {
            file: 'heap_tuple.js',
            line: 15,
            data: { xmin: t_xmin, xmax: t_xmax, ctid: JSON.stringify(t_ctid) }
        });
    }

    /**
     * Check if tuple is visible to a transaction snapshot
     * Simplified MVCC check
     */
    isVisible(snapshot) {
        const { xmin, xmax } = this;
        
        // Deleted by a committed transaction?
        if (xmax !== 0 && (this.t_infomask & HEAP_XMAX_COMMITTED)) {
            logger.debug('Tuple invisible (deleted)', { file: 'heap_tuple.js', line: 28, data: { xmax } });
            return false;
        }

        // Inserted by uncommitted or future transaction?
        if (!snapshot.activeXids.includes(xmin) && xmin > snapshot.xmax) {
            logger.debug('Tuple invisible (not yet committed)', { file: 'heap_tuple.js', line: 33, data: { xmin, snapshotXmax: snapshot.xmax } });
            return false;
        }

        logger.debug('Tuple visible', { file: 'heap_tuple.js', line: 37, data: { xmin, xmax } });
        return true;
    }

    /**
     * Serialize header to buffer
     */
    toBuffer() {
        const buf = Buffer.alloc(this.t_hoff);
        buf.writeUInt32LE(this.t_xmin, 0);
        buf.writeUInt32LE(this.t_xmax, 4);
        // CTID (BlockId + OffsetNumber)
        buf.writeUInt32LE(this.t_ctid.blockId, 8);
        buf.writeUInt16LE(this.t_ctid.offsetNumber, 12);
        buf.writeUInt16LE(this.t_infomask, 14);
        buf.writeUInt16LE(this.t_hoff, 16);
        
        logger.debug('HeapTupleHeader serialized', { file: 'heap_tuple.js', line: 52, data: { hoff: this.t_hoff } });
        return buf;
    }

    /**
     * Deserialize header from buffer
     */
    static fromBuffer(buf) {
        const t_xmin = buf.readUInt32LE(0);
        const t_xmax = buf.readUInt32LE(4);
        const t_ctid = {
            blockId: buf.readUInt32LE(8),
            offsetNumber: buf.readUInt16LE(12)
        };
        const t_infomask = buf.readUInt16LE(14);
        const t_hoff = buf.readUInt16LE(16);

        logger.debug('HeapTupleHeader deserialized', { file: 'heap_tuple.js', line: 69, data: { xmin: t_xmin } });
        return new HeapTupleHeader(t_xmin, t_xmax, t_ctid, t_infomask);
    }
}
