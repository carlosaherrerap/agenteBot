const sql = require('mssql/msnodesqlv8');

const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=192.168.18.117;Database=ContextBot;UID=sa;PWD=Informa2025$$;Encrypt=no;TrustServerCertificate=yes;'
};

async function testRawInsert() {
    try {
        const pool = await sql.connect(config);
        console.log('Connected!');

        // Raw insert without parameters
        await pool.request().query(`
            DELETE FROM BotCache WHERE jid = 'raw_test';
            INSERT INTO BotCache (jid, dni, clientData) 
            VALUES ('raw_test', '12345678', '{"test": "data"}');
        `);
        console.log('Raw INSERT OK');

        // Check
        const result = await pool.request().query("SELECT * FROM BotCache WHERE jid = 'raw_test'");
        console.log('Found:', result.recordset.length, 'records');
        console.log('Data:', result.recordset[0]);

        await pool.close();
        console.log('✅ SUCCESS');
    } catch (err) {
        console.error('❌ ERROR:', err.message);
    }
    process.exit(0);
}

testRawInsert();
