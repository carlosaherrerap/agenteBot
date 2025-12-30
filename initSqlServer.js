const sql = require('mssql/msnodesqlv8');
const config = {
    connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=192.168.18.117;Database=ContextBot;UID=sa;PWD=Informa2025$$;Encrypt=no;TrustServerCertificate=yes;'
};

async function main() {
    try {
        const pool = await sql.connect(config);
        console.log('✅ Connected to SQL Server');

        // 1. BotCache
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BotCache')
            CREATE TABLE BotCache (
                jid NVARCHAR(100) PRIMARY KEY,
                dni NVARCHAR(20),
                clientData NVARCHAR(MAX),
                lastUpdated DATETIME DEFAULT GETDATE()
            )
        `);
        console.log('✅ BotCache ready');

        // 2. Conversaciones
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Conversaciones')
            CREATE TABLE Conversaciones (
                id INT IDENTITY PRIMARY KEY,
                cliente_id INT,
                telefono_whatsapp NVARCHAR(50),
                dni_proporcionado NVARCHAR(20),
                mensaje_cliente NVARCHAR(MAX),
                respuesta_bot NVARCHAR(MAX),
                intent NVARCHAR(100),
                derivado_asesor BIT DEFAULT 0,
                fecha_hora DATETIME DEFAULT GETDATE()
            )
        `);
        console.log('✅ Conversaciones ready');

        // Note: HuancayoBase, Clientes, Deudas, etc. are assumed to exist in the remote DB as stated by user.

        await pool.close();
        console.log('✅ SQL Initialization complete');
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

main();
