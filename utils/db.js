const { Pool } = require('pg');

// Flag to track if DB is available
let dbAvailable = true;

// Create a connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'admin123',
    database: process.env.DB_NAME || 'chatbot_db',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
});

// Test connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
    dbAvailable = true;
});

pool.on('error', (err) => {
    console.error('⚠️ PostgreSQL not available:', err.message);
    dbAvailable = false;
});

// Helper function to execute queries (graceful failure)
async function query(text, params) {
    if (!dbAvailable) {
        return { rows: [], rowCount: 0 };
    }

    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log(`⚡ Query executed in ${duration}ms | Rows: ${res.rowCount}`);
        return res;
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            console.warn('⚠️ Database not available, continuing without DB');
            dbAvailable = false;
            return { rows: [], rowCount: 0 };
        }
        console.error('❌ Database query error:', error.message);
        return { rows: [], rowCount: 0 };
    }
}

// Get a client from the pool for transactions
async function getClient() {
    const client = await pool.connect();
    const originalQuery = client.query;
    const originalRelease = client.release;

    // Set timeout
    const timeout = setTimeout(() => {
        console.error('⚠️ Client checked out for more than 5 seconds!');
    }, 5000);

    // Track last query
    client.query = (...args) => {
        client.lastQuery = args;
        return originalQuery.apply(client, args);
    };

    client.release = () => {
        clearTimeout(timeout);
        client.query = originalQuery;
        client.release = originalRelease;
        return originalRelease.apply(client);
    };

    return client;
}

module.exports = {
    query,
    getClient,
    pool
};
