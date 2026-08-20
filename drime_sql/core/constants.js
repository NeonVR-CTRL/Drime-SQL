/**
 * DRIME.SQL - PostgreSQL 18.6 Constants
 * Exact replication of Postgres internal constants
 */

// Block size (8KB standard in PostgreSQL)
export const BLCKSZ = 8192;
export const USE_SMGR_BLCKSZ = true;

// Page header size
export const MAXALIGN_SIZE = 8;
export const PAGE_HEADER_SIZE = 24; // Size of PageHeaderData

// Item identifier
export const ITEM_ID_SIZE = 4;
export const INVALID_ITEMID = 0;

// Naming limits
export const NAMEDATALEN = 64;
export const INDEX_MAX_KEYS = 32;

// OID definitions
export const InvalidOid = 0;
export const FirstNormalObjectId = 16384;

// Transaction IDs
export const InvalidTransactionId = 0;
export const FirstNormalTransactionId = 3;
export const MAX_TRANSACTION_ID = 0xFFFFFFFF;

// WAL constants
export const XLOG_SEG_SIZE = 16 * 1024 * 1024; // 16MB
export const XLOG_BLCKSZ = 8192;

// Access method types
export const HEAP_AM = 'heap';
export const BTREE_AM = 'btree';

// Visibility mask bits
export const HEAP_XMIN_INVALID = 0x01;
export const HEAP_XMIN_COMMITTED = 0x02;
export const HEAP_XMIN_FROZEN = 0x04;
export const HEAP_XMAX_INVALID = 0x08;
export const HEAP_XMAX_COMMITTED = 0x10;
export const HEAP_XMAX_IS_MULTI = 0x20;
export const HEAP_UPDATED = 0x40;
export const HEAP_MOVED_OFF = 0x80;
export const HEAP_MOVED_IN = 0x40;

// Lock modes
export const NoLock = 0;
export const AccessShareLock = 1;
export const RowShareLock = 2;
export const RowExclusiveLock = 3;
export const ShareUpdateExclusiveLock = 4;
export const ShareLock = 5;
export const ShareRowExclusiveLock = 6;
export const ExclusiveLock = 7;
export const AccessExclusiveLock = 8;

// PostgreSQL version we're emulating
export const PG_VERSION_NUM = 180006; // 18.6
export const PG_VERSION_STR = '18.6';
