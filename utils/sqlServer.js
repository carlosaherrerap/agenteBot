const sql = require('mssql');

// Configuración basada en variables de entorno (con valores por defecto)
const config = {
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || 'Informa2025$$',
    server: process.env.MSSQL_SERVER || '192.168.18.117',
    database: process.env.MSSQL_DB || 'ContextBot',
    options: {
        encrypt: false, // para conexiones sin TLS
        trustServerCertificate: true,
        enableArithAbort: true,
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
    },
};

let pool;

async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
    }
    return pool;
}

/**
 * Ejecuta una consulta parametrizada contra SQL Server.
 * @param {string} queryString - Sentencia SQL con parámetros @p0, @p1, ...
 * @param {Array} params - Valores de los parámetros en orden.
 * @returns {Promise<Array>} - Conjunto de filas resultantes.
 */
async function query(queryString, params = []) {
    const p = await getPool();
    const request = p.request();
    params.forEach((value, idx) => {
        request.input(`p${idx}`, value);
    });
    const result = await request.query(queryString);
    return result.recordset;
}

module.exports = { query };
