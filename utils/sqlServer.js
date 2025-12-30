const sql = require('mssql/msnodesqlv8');

const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=192.168.18.117;Database=ContextBot;UID=sa;PWD=Informa2025$$;Encrypt=no;TrustServerCertificate=yes;'
};

let pool;

async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
    }
    return pool;
}

/**
 * Execute a parameterized query.
 * Uses proper input binding for ODBC driver.
 */
async function query(queryString, params = []) {
    const p = await getPool();
    const request = p.request();

    params.forEach((value, idx) => {
        // Determine SQL type based on value type
        if (value === null || value === undefined) {
            request.input(`p${idx}`, sql.NVarChar, null);
        } else if (typeof value === 'number') {
            request.input(`p${idx}`, sql.Int, value);
        } else {
            request.input(`p${idx}`, sql.NVarChar, String(value));
        }
    });

    const result = await request.query(queryString);
    return result.recordset || [];
}

/**
 * Execute a raw query without parameters (for simple operations).
 */
async function rawQuery(queryString) {
    const p = await getPool();
    const result = await p.request().query(queryString);
    return result.recordset || [];
}

/**
 * Escape a string for safe SQL insertion (prevent SQL injection).
 */
function escape(str) {
    if (str === null || str === undefined) return 'NULL';
    return "'" + String(str).replace(/'/g, "''") + "'";
}

/**
 * Helper for cache operations using raw queries (workaround for ODBC parameter issues).
 */
async function upsertCache(jid, dni, clientData) {
    const p = await getPool();
    const escapedJid = escape(jid);
    const escapedDni = escape(dni);
    const escapedData = escape(typeof clientData === 'string' ? clientData : JSON.stringify(clientData));

    // First try to update
    const updateResult = await p.request().query(`
        UPDATE BotCache 
        SET dni = ${escapedDni}, clientData = ${escapedData}, lastUpdated = GETDATE() 
        WHERE jid = ${escapedJid}
    `);

    // If no rows affected, insert
    if (updateResult.rowsAffected[0] === 0) {
        await p.request().query(`
            INSERT INTO BotCache (jid, dni, clientData) 
            VALUES (${escapedJid}, ${escapedDni}, ${escapedData})
        `);
    }

    return true;
}

/**
 * Get cache data for a JID.
 */
async function getCache(jid) {
    const p = await getPool();
    const escapedJid = escape(jid);
    const result = await p.request().query(`SELECT clientData, dni FROM BotCache WHERE jid = ${escapedJid}`);
    return result.recordset.length > 0 ? result.recordset[0] : null;
}

module.exports = { query, rawQuery, escape, upsertCache, getCache };
