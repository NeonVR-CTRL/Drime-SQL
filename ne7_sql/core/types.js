/**
 * NE7-SQL - PostgreSQL Data Types
 * OID mappings and type definitions from PostgreSQL 18.6
 */

export const PG_TYPES = {
  BOOL: 16,
  BYTEA: 17,
  CHAR: 18,
  NAME: 19,
  INT8: 20,
  INT2: 21,
  INT4: 23,
  REGPROC: 24,
  TEXT: 25,
  OID: 26,
  TID: 27,
  XID: 28,
  CID: 29,
  JSON: 114,
  XML: 142,
  PG_NODE_TREE: 194,
  SMGR: 210,
  PATH: 602,
  POLYGON: 604,
  OIDVECTOR: 30,
  INT2VECTOR: 22,
  FLOAT4: 700,
  FLOAT8: 701,
  ABSTIME: 702,
  RELTIME: 703,
  TINTERVAL: 704,
  CIRCLE: 718,
  MONEY: 790,
  MACADDR: 829,
  INET: 869,
  CIDR: 650,
  MACADDR8: 774,
  ACLITEM: 1033,
  BPCHAR: 1042,
  VARCHAR: 1043,
  DATE: 1082,
  TIME: 1083,
  TIMESTAMP: 1114,
  TIMESTAMPTZ: 1184,
  INTERVAL: 1186,
  TIMETZ: 1266,
  BIT: 1560,
  VARBIT: 1562,
  NUMERIC: 1700,
  REFCURSOR: 1790,
  REGPROCEDURE: 2202,
  REGOPER: 2203,
  REGOPERATOR: 2204,
  REGCLASS: 2205,
  REGTYPE: 2206,
  UUID: 2950,
  TXID_SNAPSHOT: 2970,
  PG_LSN: 3220,
  JSONB: 3802,
  ANYELEMENT: 2276,
  ANYARRAY: 2277
};

// Type alignment requirements
export const TYPE_ALIGNMENT = {
  [PG_TYPES.BOOL]: 1,
  [PG_TYPES.INT2]: 2,
  [PG_TYPES.INT4]: 4,
  [PG_TYPES.INT8]: 8,
  [PG_TYPES.FLOAT4]: 4,
  [PG_TYPES.FLOAT8]: 8,
  [PG_TYPES.TEXT]: 1,
  [PG_TYPES.TIMESTAMP]: 8,
  [PG_TYPES.OID]: 4
};

// Type sizes (-1 for variable length)
export const TYPE_SIZE = {
  [PG_TYPES.BOOL]: 1,
  [PG_TYPES.INT2]: 2,
  [PG_TYPES.INT4]: 4,
  [PG_TYPES.INT8]: 8,
  [PG_TYPES.FLOAT4]: 4,
  [PG_TYPES.FLOAT8]: 8,
  [PG_TYPES.OID]: 4,
  [PG_TYPES.TEXT]: -1,
  [PG_TYPES.TIMESTAMP]: 8,
  [PG_TYPES.DATE]: 4
};

// Helper to get type name from OID
export function getTypeName(oid) {
  for (const [name, typeOid] of Object.entries(PG_TYPES)) {
    if (typeOid === oid) return name.toLowerCase();
  }
  return 'unknown';
}

// Helper to get OID from type name
export function getTypeOid(name) {
  const upperName = name.toUpperCase();
  return PG_TYPES[upperName] || PG_TYPES.TEXT;
}
