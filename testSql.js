const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || 'Informa2025$$',
    server: process.env.MSSQL_SERVER || '192.168.18.117',
    database: process.env.MSSQL_DB || 'ContextBot',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
    },
};

async function testConnection() {
    try {
        const pool = await sql.connect(config);
        console.log('✅ Conectado a SQL Server');

        const tables = await pool.request().query("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES");
        console.log('Tablas encontradas:');
        tables.recordset.forEach(t => {
            console.log(`- [${t.TABLE_SCHEMA}].[${t.TABLE_NAME}]`);
        });

        const queryHuancayo = `SELECT TOP 1 * FROM [Huancayo].[Base]`;
        try {
            const res = await pool.request().query(queryHuancayo);
            console.log('✅ Consulta a [Huancayo].[Base] exitosa.');
            console.log('Columnas encontradas:', Object.keys(res.recordset[0] || {}).join(', '));
        } catch (e) {
            console.log('❌ Error al consultar [Huancayo].[Base]:', e.message);
        }

        const queryHuancayoNoDot = `SELECT TOP 1 * FROM [dbo].[HuancayoBase]`;
        try {
            const res = await pool.request().query(queryHuancayoNoDot);
            console.log('✅ Consulta a [dbo].[HuancayoBase] exitosa.');
            console.log('Columnas encontradas:', Object.keys(res.recordset[0] || {}).join(', '));
        } catch (e) {
            console.log('❌ Error al consultar [dbo].[HuancayoBase]:', e.message);
        }

        await pool.close();
    } catch (err) {
        console.error('❌ ERROR FATAL:', err.message);
    }
}

testConnection();
