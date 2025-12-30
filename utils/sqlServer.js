const sql = require('mssql/msnodesqlv8');

//Configuracion para autenticacion de Sql Server

// const config = {
//     user: process.env.MSSQL_USER || 'sa',
//     password: process.env.MSSQL_PASSWORD || 'Informa2025$$',
//     server: process.env.MSSQL_SERVER || '192.168.18.117',
//     database: process.env.MSSQL_DB || 'ContextBot',
//     options: {
//         encrypt: false, // para conexiones sin TLS
//         trustServerCertificate: true,
//         enableArithAbort: true,
//     },
//     pool: {
//         max: 10,
//         min: 0,
//         idleTimeoutMillis: 30000,
//     },
// };

// Configuración para Autenticación de Windows usando msnodesqlv8
const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS;Database=ContextBot;Trusted_Connection=yes;TrustServerCertificate=yes;'
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
