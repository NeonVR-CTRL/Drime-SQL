/**
 * NE7-SQL v18.6 - PostgreSQL Constants
 * All missing exports FIXED
 */
export const BLCKSZ = 8192;
export const MAXALIGN = 8;
export const MAXALIGN_SIZE = 8;
export const NAMEDATALEN = 64;
export const SizeOfPageHeaderData = 24;
export const INVALID_OFFSET = 0;
export const INVALID_BLOCK_NUMBER = 4294967295;
export const FIRST_NORMAL_OBJECT_ID = 16384;
export const BOOTSTRAP_OBJECT_ID = 1;

// Transaction IDs
export const InvalidTransactionId = 0;
export const BootstrapTransactionId = 1;
export const FrozenTransactionId = 2;
export const FirstNormalTransactionId = 3;
export const MAX_TRANSACTION_ID = 4294967295;
export const MaxTransactionId = 4294967295;

// Heap Tuple Flags (WAS MISSING - CRITICAL FIX)
export const HEAP_XMIN_COMMITTED = 0x0001;
export const HEAP_XMIN_INVALID = 0x0002;
export const HEAP_XMAX_COMMITTED = 0x0004;
export const HEAP_XMAX_INVALID = 0x0008;
export const HEAP_XMAX_LOCK_ONLY = 0x0010;
export const HEAP_HASOID = 0x0020;
export const HEAP_TUPLE_UPDATED = 0x0040;
export const HEAP_TUPLE_DELETED = 0x0080;

// WAL & Storage (WAS MISSING - CRITICAL FIX)
export const XLOG_BLCKSZ = 8192;
export const XLOG_SEG_SIZE = 16 * 1024 * 1024;
export const XLOG_SEG_SIZE_BYTES = 16777216;

// Page constants
export const DEF_FREE_SPACE = 100;
export const MIN_FREE_SPACE = 100;
export const MaxHeapTupleSize = 8126;
export const INDEX_ATTR_BITMAP_ALL = -1;
export const INDEX_ATTNUM = -1;

// ItemPointer
export const SelfItemPointer = { ip_blkid: { bi_hi: 0, bi_lo: 0 }, ip_posid: 0 };

// Transaction Status
export const TRANSACTION_STATUS_INPROGRESS = 0;
export const TRANSACTION_STATUS_COMMITTED = 1;
export const TRANSACTION_STATUS_ABORTED = 2;
export const TRANSACTION_STATUS_SUB_COMMITTED = 3;
export const TRANSACTION_STATUS_IN_PROGRESS = 0;

// Lock Modes
export const NoLock = 0;
export const AccessShareLock = 1;
export const RowShareLock = 2;
export const RowExclusiveLock = 3;
export const ShareUpdateExclusiveLock = 4;
export const ShareLock = 5;
export const ShareRowExclusiveLock = 6;
export const ExclusiveLock = 7;
export const AccessExclusiveLock = 8;

// ItemPointer max
export const MaxItemIdIndex = 2042;
export const InvalidItemIdIndex = 0;
