/**
 * NE7-SQL - Cloudflare Worker Handler
 * Entry point for HTTP requests, translates to Wire Protocol
 */

import { Logger } from '../core/logger.js';
import { NE7SQLDatabase } from '../executor/ne7_sql_main.js';
import { WireProtocol } from './wire_protocol.js';
import { CONFIG } from '../config/drime_config.js';

const log = new Logger('WorkerHandler');

export class WorkerHandler {
  constructor() {
    log.info('Initializing Cloudflare Worker Handler');
    this.db = new NE7SQLDatabase(CONFIG.DRIME_BUCKET, CONFIG.DRIME_API_KEY);
    this.protocol = new WireProtocol();
  }

  /**
   * Main fetch handler for Cloudflare Workers
   */
  async fetch(request) {
    const url = new URL(request.url);
    log.info('Incoming request', { method: request.method, path: url.pathname });

    try {
      // Handle SQL queries via POST /query
      if (request.method === 'POST' && url.pathname === '/query') {
        const body = await request.json();
        const sql = body.query;
        
        if (!sql) {
          return new Response(JSON.stringify({ error: 'Missing query' }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        log.debug('Executing SQL', { sql });
        const result = await this.db.execute(sql);
        
        // Format response as JSON for HTTP clients
        return new Response(JSON.stringify({
          rows: result.rows || [],
          command: result.command,
          rowCount: result.rowCount
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Handle binary protocol via WebSocket or specific endpoint
      if (request.method === 'POST' && url.pathname === '/binary') {
        const buffer = await request.arrayBuffer();
        const responseBuffer = await this.handleBinaryMessage(Buffer.from(buffer));
        
        return new Response(responseBuffer, {
          headers: { 'Content-Type': 'application/octet-stream' }
        });
      }

      // Health check
      if (request.method === 'GET' && url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', engine: 'NE7-SQL' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });

    } catch (error) {
      log.error('Request failed', { error: error.message, stack: error.stack });
      
      const errorResponse = this.protocol.errorResponse(error.message);
      return new Response(errorResponse, {
        status: 500,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
    }
  }

  /**
   * Handles binary PostgreSQL protocol messages
   */
  async handleBinaryMessage(buffer) {
    log.debug('Processing binary message', { size: buffer.length });
    
    const message = this.protocol.decodeMessage(buffer);
    let responseBuffers = [];

    if (message.type === 'Q') { // Query message
      const sql = message.payload.toString('utf8').replace(/\0$/, '');
      log.info('Received SQL Query', { sql });

      try {
        const result = await this.db.execute(sql);

        // Send RowDescription if columns exist
        if (result.columns && result.columns.length > 0) {
          responseBuffers.push(this.protocol.rowDescription(result.columns));
          
          // Send DataRows
          for (const row of result.rows) {
            const values = result.columns.map(col => row[col.name]);
            responseBuffers.push(this.protocol.dataRow(values));
          }
        }

        // Send CommandComplete
        const tag = `${result.command} ${result.rowCount || 0}`;
        responseBuffers.push(this.protocol.commandComplete(tag));

      } catch (err) {
        responseBuffers.push(this.protocol.errorResponse(err.message));
      }

      // Always end with ReadyForQuery
      responseBuffers.push(this.protocol.readyForQuery('I'));
    }

    return Buffer.concat(responseBuffers);
  }
}

// Export default handler for Cloudflare Workers
const handler = new WorkerHandler();

export default {
  async fetch(request, env, ctx) {
    return handler.fetch(request);
  }
};
