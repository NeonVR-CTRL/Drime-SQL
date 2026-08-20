/**
 * DRIME.SQL - Heap Tuple Header
 * Rewritten from PostgreSQL 18.6 src/include/access/htup_details.h
 */

import { logger } from '../core/logger.js';

export class HeapTupleHeader {
    constructor({ xmin, xmax, ctid, data }) {
        this.xmin = xmin;      // Inserting XID
        this.xmax = xmax;      // Deleting XID (0 if not deleted)
        this.ctid = ctid;      // Pointer to new version (for update)
        this.data = data;      // Actual tuple data
        logger.debug('HeapTupleHeader created', { xmin, xmax, module: 'heap_tuple' });
    }

    serialize() {
        // Simple serialization: [xmin:4][xmax:4][hasCtid:1][block:4][offset:4][dataLen:4][data...]
        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(JSON.stringify(this.data));
        
        const hasCtid = this.ctid ? 1 : 0;
        const block = this.ctid ? this.ctid.blockNumber : 0;
        const offset = this.ctid ? this.ctid.offsetNumber : 0;
        
        const buffer = new ArrayBuffer(21 + dataBytes.length);
        const view = new DataView(buffer);
        
        view.setUint32(0, this.xmin, true);
        view.setUint32(4, this.xmax, true);
        view.setUint8(8, hasCtid);
        view.setUint32(9, block, true);
        view.setUint32(13, offset, true);
        view.setUint32(17, dataBytes.length, true);
        
        new Uint8Array(buffer, 21).set(dataBytes);
        
        logger.debug('HeapTupleHeader serialized', { size: buffer.byteLength, module: 'heap_tuple' });
        return new Uint8Array(buffer);
    }

    static deserialize(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        
        const xmin = view.getUint32(0, true);
        const xmax = view.getUint32(4, true);
        const hasCtid = view.getUint8(8);
        const block = view.getUint32(9, true);
        const offset = view.getUint32(13, true);
        const dataLen = view.getUint32(17, true);
        
        const dataBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + 21, dataLen);
        const decoder = new TextDecoder();
        const data = JSON.parse(decoder.decode(dataBytes));
        
        const ctid = hasCtid ? { blockNumber: block, offsetNumber: offset } : null;
        
        logger.debug('HeapTupleHeader deserialized', { xmin, xmax, module: 'heap_tuple' });
        return new HeapTupleHeader({ xmin, xmax, ctid, data });
    }
}
