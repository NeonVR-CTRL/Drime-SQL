/**
 * DRIME.SQL - Core Logger
 * Deep tracing system with timestamps, file paths, line numbers
 * PostgreSQL 18.6 compatible logging levels
 */

export class Logger {
  constructor(moduleName) {
    this.module = moduleName;
    this.colors = {
      reset: '\x1b[0m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
  }

  _formatMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const error = new Error();
    const stackLines = error.stack.split('\n');
    const callerLine = stackLines[3] || stackLines[2];
    const match = callerLine.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/);
    
    let location = 'unknown';
    if (match) {
      const [, func, file, line] = match;
      const fileName = file.split('/').pop();
      location = `${fileName}:${line}:${func}`;
    }

    const logData = {
      timestamp,
      level,
      module: this.module,
      location,
      message,
      ...data
    };

    return logData;
  }

  _print(level, color, message, data) {
    const logData = this._formatMessage(level, message, data);
    const colorCode = this.colors[color] || '';
    const reset = this.colors.reset;
    
    const consoleMsg = `${colorCode}[${logData.timestamp}] [${level}] [${logData.module}] ${logData.message}${reset}`;
    
    if (data && Object.keys(data).length > 0) {
      console.log(consoleMsg, logData);
    } else {
      console.log(consoleMsg);
    }
  }

  debug(message, data) {
    this._print('DEBUG', 'cyan', message, data);
  }

  info(message, data) {
    this._print('INFO', 'blue', message, data);
  }

  warn(message, data) {
    this._print('WARN', 'yellow', message, data);
  }

  error(message, data) {
    this._print('ERROR', 'red', message, data);
  }

  fatal(message, data) {
    this._print('FATAL', 'magenta', message, data);
  }
}
