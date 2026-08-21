/**
 * NE7-SQL Server Launcher
 * Starts the PostgreSQL Wire Protocol server
 */
const { NE7SQLDatabase } = require('./main.js');
const { PgWireServer } = require('./protocol/pg_server.js');
const { logger } = require('./core/logger.js');

const PORT = process.env.NE7_PORT || 5432;

async function startServer() {
    logger.info('Starting NE7-SQL Server...', { location: 'server.js:startServer' });
    
    // Initialize database engine
    const db = new NE7SQLDatabase();
    
    // Create and start wire protocol server
    const server = new PgWireServer(db, PORT);
    server.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
        logger.info('Shutting down NE7-SQL Server...', { location: 'server.js:SIGINT' });
        server.stop();
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        logger.info('Shutting down NE7-SQL Server...', { location: 'server.js:SIGTERM' });
        server.stop();
        process.exit(0);
    });
}

startServer().catch(err => {
    logger.error('Failed to start server', { error: err.message, location: 'server.js:startServer' });
    console.error(err.stack);
    process.exit(1);
});
