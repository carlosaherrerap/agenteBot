const sql = require('mssql');
require('dotenv').config();

const config = {
    user: 'sa',
    password: 'Informa2025$$',
    server: '192.168.18.117',
    database: 'ContextBot',
    options: { encrypt: false, trustServerCertificate: true },
};

async function findTable() {
    try {
        const pool = await sql.connect(config);
        const res = await pool.request().query("SELECT SCHEMA_NAME(schema_id) as s, name FROM sys.tables");
        console.log('--- Tablas en sys.tables ---');
        res.recordset.forEach(r => console.log(`[${r.s}].[${r.name}]`));
        await pool.close();
    } catch (err) {
        console.error(err);
    }
}
findTable();
