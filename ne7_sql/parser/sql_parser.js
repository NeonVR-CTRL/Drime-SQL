/**
 * NE7-SQL - SQL Parser
 * Implements PostgreSQL-compatible SQL syntax parsing
 */

import { logger } from '../core/logger.js';

export class Token {
  constructor(type, value, position) {
    this.type = type;
    this.value = value;
    this.position = position;
  }

  toString() {
    return `Token(${this.type}, ${this.value})`;
  }
}

export class Lexer {
  constructor(sql) {
    this.sql = sql;
    this.pos = 0;
    this.tokens = [];
  }

  tokenize() {
    while (this.pos < this.sql.length) {
      this.skipWhitespace();
      if (this.pos >= this.sql.length) break;

      const char = this.sql[this.pos];

      // String literal
      if (char === "'") {
        this.readString();
      }
      // Identifier or keyword
      else if (/[a-zA-Z_]/.test(char)) {
        this.readIdentifier();
      }
      // Number
      else if (/[0-9]/.test(char)) {
        this.readNumber();
      }
      // Operators and punctuation
      else if (/[(),=<>!+\-*/%;&|]/.test(char)) {
        this.readOperator();
      }
      // Dot for qualified names
      else if (char === '.') {
        this.tokens.push(new Token('DOT', '.', this.pos));
        this.pos++;
      }
      // Asterisk
      else if (char === '*') {
        this.tokens.push(new Token('STAR', '*', this.pos));
        this.pos++;
      }
      else {
        logger.warn('Unknown character', { char, pos: this.pos, location: 'sql_parser.js:Lexer' });
        this.pos++;
      }
    }

    logger.debug('Tokenization complete', { 
      tokenCount: this.tokens.length,
      location: 'sql_parser.js:Lexer:tokenize' 
    });

    return this.tokens;
  }

  skipWhitespace() {
    while (this.pos < this.sql.length && /\s/.test(this.sql[this.pos])) {
      this.pos++;
    }
  }

  readString() {
    const start = this.pos;
    this.pos++; // Skip opening quote
    let value = '';
    
    while (this.pos < this.sql.length && this.sql[this.pos] !== "'") {
      if (this.sql[this.pos] === "'" && this.sql[this.pos + 1] === "'") {
        value += "'";
        this.pos += 2;
      } else {
        value += this.sql[this.pos];
        this.pos++;
      }
    }
    
    this.pos++; // Skip closing quote
    this.tokens.push(new Token('STRING', value, start));
  }

  readIdentifier() {
    const start = this.pos;
    let value = '';
    
    while (this.pos < this.sql.length && /[a-zA-Z0-9_]/.test(this.sql[this.pos])) {
      value += this.sql[this.pos];
      this.pos++;
    }
    
    const upperValue = value.toUpperCase();
    const keywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 
                      'INTO', 'VALUES', 'SET', 'CREATE', 'TABLE', 'DROP',
                      'INDEX', 'ON', 'AND', 'OR', 'NOT', 'NULL', 'IS',
                      'LIKE', 'IN', 'BETWEEN', 'ORDER', 'BY', 'ASC', 'DESC',
                      'LIMIT', 'OFFSET', 'JOIN', 'INNER', 'LEFT', 'RIGHT',
                      'OUTER', 'ON', 'AS', 'DISTINCT', 'GROUP', 'HAVING'];
    
    const type = keywords.includes(upperValue) ? upperValue : 'IDENTIFIER';
    this.tokens.push(new Token(type, value, start));
  }

  readNumber() {
    const start = this.pos;
    let value = '';
    let hasDot = false;
    
    while (this.pos < this.sql.length && /[0-9.]/.test(this.sql[this.pos])) {
      if (this.sql[this.pos] === '.') {
        if (hasDot) break;
        hasDot = true;
      }
      value += this.sql[this.pos];
      this.pos++;
    }
    
    const type = hasDot ? 'FLOAT' : 'INTEGER';
    this.tokens.push(new Token(type, value, start));
  }

  readOperator() {
    const start = this.pos;
    let value = this.sql[this.pos];
    
    // Check for two-character operators
    if (this.pos + 1 < this.sql.length) {
      const next = this.sql[this.pos + 1];
      if ((value === '=' && next === '>') ||
          (value === '<' && next === '=') ||
          (value === '>' && next === '=') ||
          (value === '!' && next === '=') ||
          (value === '|' && next === '|') ||
          (value === '&' && next === '&')) {
        value += next;
        this.pos++;
      }
    }
    
    this.pos++;
    const type = value.length === 1 && /[(),;]/.test(value) ? value : 'OPERATOR';
    this.tokens.push(new Token(type, value, start));
  }
}

export class ASTNode {
  constructor(type, children = {}, value = null) {
    this.type = type;
    this.children = children;
    this.value = value;
  }
}

export class SQLParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  parse() {
    logger.debug('Parsing started', { 
      tokenCount: this.tokens.length,
      location: 'sql_parser.js:SQLParser:parse' 
    });

    if (this.tokens.length === 0) {
      throw new Error('Empty SQL statement');
    }

    const firstToken = this.tokens[0].type;
    let ast;

    switch (firstToken) {
      case 'SELECT':
        ast = this.parseSelect();
        break;
      case 'INSERT':
        ast = this.parseInsert();
        break;
      case 'UPDATE':
        ast = this.parseUpdate();
        break;
      case 'DELETE':
        ast = this.parseDelete();
        break;
      case 'CREATE':
        ast = this.parseCreate();
        break;
      case 'DROP':
        ast = this.parseDrop();
        break;
      default:
        throw new Error(`Unsupported SQL statement: ${firstToken}`);
    }

    logger.info('Parsing completed', { 
      statementType: ast.type,
      location: 'sql_parser.js:SQLParser:parse' 
    });

    return ast;
  }

  currentToken() {
    return this.tokens[this.pos];
  }

  peekToken(offset = 0) {
    return this.tokens[this.pos + offset];
  }

  consume(expectedType) {
    const token = this.currentToken();
    if (!token) {
      throw new Error(`Unexpected end of input, expected ${expectedType}`);
    }
    if (token.type !== expectedType) {
      throw new Error(`Expected ${expectedType}, got ${token.type} (${token.value})`);
    }
    this.pos++;
    return token;
  }

  match(...types) {
    const token = this.currentToken();
    return token && types.includes(token.type);
  }

  parseSelect() {
    this.consume('SELECT');
    
    const distinct = this.match('DISTINCT');
    if (distinct) this.consume('DISTINCT');
    
    const columns = this.parseSelectList();
    this.consume('FROM');
    const table = this.parseTableRef();
    
    let where = null;
    if (this.match('WHERE')) {
      this.consume('WHERE');
      where = this.parseExpression();
    }
    
    let orderBy = null;
    if (this.match('ORDER')) {
      this.consume('ORDER');
      this.consume('BY');
      orderBy = this.parseOrderBy();
    }
    
    let limit = null;
    if (this.match('LIMIT')) {
      this.consume('LIMIT');
      limit = this.currentToken().value;
      this.pos++;
    }
    
    return new ASTNode('SELECT', {
      distinct,
      columns,
      table,
      where,
      orderBy,
      limit
    });
  }

  parseSelectList() {
    const columns = [];
    
    if (this.match('STAR')) {
      this.consume('STAR');
      columns.push({ type: 'star' });
      return columns;
    }
    
    columns.push(this.parseColumnRef());
    
    while (this.match(',')) {
      this.consume(',');
      columns.push(this.parseColumnRef());
    }
    
    return columns;
  }

  parseColumnRef() {
    const table = this.currentToken().value;
    this.pos++;
    
    if (this.match('DOT')) {
      this.consume('DOT');
      const column = this.currentToken().value;
      this.pos++;
      return { type: 'column', table, column };
    }
    
    return { type: 'column', column: table };
  }

  parseTableRef() {
    const name = this.currentToken().value;
    this.pos++;
    
    let alias = null;
    if (this.match('AS')) {
      this.consume('AS');
      alias = this.currentToken().value;
      this.pos++;
    } else if (this.match('IDENTIFIER')) {
      alias = this.currentToken().value;
      this.pos++;
    }
    
    return { name, alias };
  }

  parseExpression() {
    let left = this.parsePrimary();
    
    while (this.match('OPERATOR', 'AND', 'OR', 'LIKE', 'IN', 'BETWEEN', 'IS')) {
      const op = this.currentToken().value || this.currentToken().type;
      this.pos++;
      
      if (op.toUpperCase() === 'IS') {
        if (this.match('NOT')) {
          this.consume('NOT');
          this.consume('NULL');
          left = new ASTNode('IS_NOT_NULL', { left });
        } else {
          this.consume('NULL');
          left = new ASTNode('IS_NULL', { left });
        }
      } else if (op.toUpperCase() === 'IN') {
        this.consume('(');
        const values = this.parseValueList();
        this.consume(')');
        left = new ASTNode('IN', { left, values });
      } else if (op.toUpperCase() === 'BETWEEN') {
        const low = this.parsePrimary();
        this.consume('AND');
        const high = this.parsePrimary();
        left = new ASTNode('BETWEEN', { left, low, high });
      } else {
        const right = this.parsePrimary();
        left = new ASTNode('BINARY_OP', { left, right }, op);
      }
    }
    
    return left;
  }

  parsePrimary() {
    if (this.match('STRING')) {
      const value = this.currentToken().value;
      this.pos++;
      return new ASTNode('LITERAL', {}, value);
    }
    
    if (this.match('INTEGER', 'FLOAT')) {
      const value = this.currentToken().value;
      this.pos++;
      return new ASTNode('LITERAL', {}, parseFloat(value));
    }
    
    if (this.match('NULL')) {
      this.consume('NULL');
      return new ASTNode('NULL', {});
    }
    
    return this.parseColumnRef();
  }

  parseValueList() {
    const values = [];
    values.push(this.parsePrimary());
    
    while (this.match(',')) {
      this.consume(',');
      values.push(this.parsePrimary());
    }
    
    return values;
  }

  parseOrderBy() {
    const items = [];
    items.push(this.parseOrderByItem());
    
    while (this.match(',')) {
      this.consume(',');
      items.push(this.parseOrderByItem());
    }
    
    return items;
  }

  parseOrderByItem() {
    const column = this.parseColumnRef();
    let direction = 'ASC';
    
    if (this.match('ASC')) {
      this.consume('ASC');
      direction = 'ASC';
    } else if (this.match('DESC')) {
      this.consume('DESC');
      direction = 'DESC';
    }
    
    return { column, direction };
  }

  parseInsert() {
    this.consume('INSERT');
    this.consume('INTO');
    
    const table = this.currentToken().value;
    this.pos++;
    
    let columns = [];
    if (this.match('(')) {
      this.consume('(');
      columns = this.parseColumnNameList();
      this.consume(')');
    }
    
    this.consume('VALUES');
    this.consume('(');
    const values = this.parseValueList();
    this.consume(')');
    
    return new ASTNode('INSERT', {
      table,
      columns,
      values
    });
  }

  parseColumnNameList() {
    const columns = [];
    columns.push(this.currentToken().value);
    this.pos++;
    
    while (this.match(',')) {
      this.consume(',');
      columns.push(this.currentToken().value);
      this.pos++;
    }
    
    return columns;
  }

  parseUpdate() {
    this.consume('UPDATE');
    
    const table = this.currentToken().value;
    this.pos++;
    
    this.consume('SET');
    const assignments = this.parseAssignments();
    
    let where = null;
    if (this.match('WHERE')) {
      this.consume('WHERE');
      where = this.parseExpression();
    }
    
    return new ASTNode('UPDATE', {
      table,
      assignments,
      where
    });
  }

  parseAssignments() {
    const assignments = [];
    assignments.push(this.parseAssignment());
    
    while (this.match(',')) {
      this.consume(',');
      assignments.push(this.parseAssignment());
    }
    
    return assignments;
  }

  parseAssignment() {
    const column = this.currentToken().value;
    this.pos++;
    this.consume('OPERATOR'); // =
    const value = this.parsePrimary();
    return { column, value };
  }

  parseDelete() {
    this.consume('DELETE');
    this.consume('FROM');
    
    const table = this.currentToken().value;
    this.pos++;
    
    let where = null;
    if (this.match('WHERE')) {
      this.consume('WHERE');
      where = this.parseExpression();
    }
    
    return new ASTNode('DELETE', {
      table,
      where
    });
  }

  parseCreate() {
    this.consume('CREATE');
    
    if (this.match('TABLE')) {
      return this.parseCreateTable();
    } else if (this.match('INDEX')) {
      return this.parseCreateIndex();
    }
    
    throw new Error('Expected TABLE or INDEX after CREATE');
  }

  parseCreateTable() {
    this.consume('TABLE');
    
    const name = this.currentToken().value;
    this.pos++;
    
    this.consume('(');
    const columns = this.parseColumnDefinitions();
    this.consume(')');
    
    return new ASTNode('CREATE_TABLE', {
      name,
      columns
    });
  }

  parseColumnDefinitions() {
    const columns = [];
    columns.push(this.parseColumnDefinition());
    
    while (this.match(',')) {
      this.consume(',');
      columns.push(this.parseColumnDefinition());
    }
    
    return columns;
  }

  parseColumnDefinition() {
    const name = this.currentToken().value;
    this.pos++;
    
    const type = this.currentToken().value.toUpperCase();
    this.pos++;
    
    const constraints = [];
    while (this.match('NOT', 'NULL', 'PRIMARY', 'KEY', 'UNIQUE')) {
      if (this.match('NOT')) {
        this.consume('NOT');
        this.consume('NULL');
        constraints.push('NOT NULL');
      } else if (this.match('PRIMARY')) {
        this.consume('PRIMARY');
        this.consume('KEY');
        constraints.push('PRIMARY KEY');
      } else if (this.match('UNIQUE')) {
        this.consume('UNIQUE');
        constraints.push('UNIQUE');
      }
    }
    
    return { name, type, constraints };
  }

  parseCreateIndex() {
    this.consume('INDEX');
    
    const indexName = this.currentToken().value;
    this.pos++;
    
    this.consume('ON');
    const tableName = this.currentToken().value;
    this.pos++;
    
    this.consume('(');
    const columns = this.parseColumnNameList();
    this.consume(')');
    
    return new ASTNode('CREATE_INDEX', {
      indexName,
      tableName,
      columns
    });
  }

  parseDrop() {
    this.consume('DROP');
    
    let type;
    if (this.match('TABLE')) {
      this.consume('TABLE');
      type = 'TABLE';
    } else if (this.match('INDEX')) {
      this.consume('INDEX');
      type = 'INDEX';
    } else {
      throw new Error('Expected TABLE or INDEX after DROP');
    }
    
    const name = this.currentToken().value;
    this.pos++;
    
    return new ASTNode('DROP', { type, name });
  }
}

export function parseSQL(sql) {
  logger.info('Parsing SQL', { 
    sql: sql.substring(0, 100),
    location: 'sql_parser.js:parseSQL' 
  });
  
  const lexer = new Lexer(sql);
  const tokens = lexer.tokenize();
  const parser = new SQLParser(tokens);
  return parser.parse();
}

logger.info('SQL parser module loaded', { location: 'sql_parser.js:module' });
