/**
 * SQL Server Connection and Query Module
 * Connects to ContextBot database and BotHuancayo.Base table
 * Supports both SQL Server Authentication and Windows Authentication
 */
require('dotenv').config();
const isWindows = process.platform === 'win32';
const sql = isWindows ? require('mssql/msnodesqlv8') : require('mssql');
const logger = require('./logger');

// Connection status tracking
let connectionStatus = {
    server: false,
    database: false,
    table: false,
    lastError: null
};

/**
 * Build connection configuration based on platform and environment
 */
function buildConfig() {
    const stripQuotes = (str) => {
        if (!str) return '';
        return str.replace(/^['"]|['"]$/g, '');
    };

    const server = stripQuotes(process.env.SQL_HOST) || 'localhost';
    const database = stripQuotes(process.env.SQL_DATABASE) || 'ContextBot';
    const user = stripQuotes(process.env.SQL_USER) || '';
    const password = stripQuotes(process.env.SQL_PASSWORD) || '';
    const driver = stripQuotes(process.env.SQL_DRIVER) || 'ODBC Driver 18 for SQL Server';
    const useWindowsAuth = process.env.SQL_WINDOWS_AUTH === 'true' || (!user && isWindows);

    if (isWindows) {
        // Windows: Use msnodesqlv8 with Connection String
        let connString = `Driver={${driver}};Server=${server};Database=${database};`;
        if (useWindowsAuth) {
            connString += 'Trusted_Connection=yes;';
            logger.info('SQL', `Usando Autenticación de Windows en ${server} (msnodesqlv8)`);
        } else {
            connString += `UID=${user};PWD=${password};`;
            logger.info('SQL', `Usando Autenticación SQL Server (usuario: ${user})`);
        }
        connString += 'Encrypt=no;TrustServerCertificate=yes;';
        return { connectionString: connString };
    } else {
        // Linux/Docker: Use standard mssql (tedious) with config object
        logger.info('SQL', `Usando driver Tedious en ${server} (Linux/Docker)`);
        return {
            user: user,
            password: password,
            server: server,
            database: database,
            options: {
                encrypt: false, // Set to true if using Azure
                trustServerCertificate: true,
                enableArithAbort: true
            },
            port: parseInt(process.env.SQL_PORT || '1433')
        };
    }
}

// Database configuration
const config = buildConfig();

let pool = null;

// Estado filter from environment (defaults to 0 if not set, handles 0 correctly)
const ESTADO_FILTRO = process.env.ESTADO_FILTRO !== undefined ? parseInt(process.env.ESTADO_FILTRO) : 0;

// Phone fields to search in
const PHONE_FIELDS = [
    'TELEFONO_FIJO_TITULAR',
    'TELEFONO_TITULAR',
    'TELEFONO_REPRESENTANTE',
    'TELEFONO_CONYUGE',
    'TELEFONO_CODEUDOR',
    'TELEFONO_FIADOR',
    'TELEFONO_CONY_FIADOR'
];

/**
 * Get or create connection pool
 */
async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
    }
    return pool;
}

/**
 * Connect and verify all phases (Server → DB → Table)
 * @returns {object} Connection status with details
 */
async function connect() {
    logger.info('SQL', 'Iniciando verificación de conexión en 3 fases...');

    connectionStatus = {
        server: false,
        database: false,
        table: false,
        lastError: null
    };

    try {
        // Phase 1: Connect to server
        logger.info('SQL', 'Fase 1: Conectando al servidor...');
        pool = await sql.connect(config);
        connectionStatus.server = true;
        logger.success('SQL', `Conectado a ${process.env.SQL_HOST || '192.168.18.117'}`);

        // Phase 2: Verify database
        logger.info('SQL', 'Fase 2: Verificando base de datos...');
        const dbCheck = await pool.request().query(`SELECT DB_NAME() as dbName`);
        if (dbCheck.recordset[0].dbName === (process.env.SQL_DATABASE || 'ContextBot')) {
            connectionStatus.database = true;
            logger.success('SQL', `Base de datos: ${process.env.SQL_DATABASE || 'ContextBot'}`);
        }

        // Phase 3: Verify table exists
        logger.info('SQL', 'Fase 3: Verificando tabla...');
        const tableName = process.env.SQL_TABLE || 'BotHuancayo.Base';
        const tableCheck = await pool.request().query(`
            SELECT TOP 1 * FROM [${tableName.replace('.', '].[')}]
        `);
        connectionStatus.table = true;
        logger.success('SQL', `Tabla encontrada: ${tableName}`);
        logger.debug('SQL', `Campos: ${Object.keys(tableCheck.recordset[0] || {}).join(', ')}`);

        // Create BotCache table if not exists
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BotCache')
            CREATE TABLE BotCache (
                jid NVARCHAR(100) PRIMARY KEY,
                dni NVARCHAR(20),
                clientData NVARCHAR(MAX),
                lastUpdated DATETIME DEFAULT GETDATE()
            )
        `);
        logger.debug('SQL', 'Tabla BotCache verificada');

        return getConnectionStatus();

    } catch (err) {
        connectionStatus.lastError = err.message;

        // Determine which phase failed
        if (!connectionStatus.server) {
            logger.error('SQL', 'FASE 1 FALLIDA: No se pudo conectar al servidor', err);
        } else if (!connectionStatus.database) {
            logger.error('SQL', 'FASE 2 FALLIDA: Base de datos no encontrada', err);
        } else if (!connectionStatus.table) {
            logger.error('SQL', 'FASE 3 FALLIDA: Tabla no encontrada', err);
        }

        // Log JSON error detail
        console.log('\n' + JSON.stringify({
            CONEXION_SQL_SERVER: connectionStatus.server,
            CONEXION_BASE_DATOS: connectionStatus.database,
            CONEXION_TABLA: connectionStatus.table,
            ERROR: connectionStatus.lastError
        }, null, 2) + '\n');

        return getConnectionStatus();
    }
}

/**
 * Get current connection status
 */
function getConnectionStatus() {
    return {
        CONEXION_SQL_SERVER: connectionStatus.server,
        CONEXION_BASE_DATOS: connectionStatus.database,
        CONEXION_TABLA: connectionStatus.table,
        ERROR: connectionStatus.lastError
    };
}

/**
 * Check if fully connected
 */
function isConnected() {
    return connectionStatus.server && connectionStatus.database && connectionStatus.table;
}

/**
 * Execute a parameterized query
 */
async function query(queryString, params = []) {
    const p = await getPool();
    const request = p.request();

    params.forEach((value, idx) => {
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
 * Escape string for SQL (prevent injection)
 */
function escape(str) {
    if (str === null || str === undefined) return 'NULL';
    return "'" + String(str).replace(/'/g, "''") + "'";
}

/**
 * Find client by phone number in any of the 7 phone fields
 * @param {string} phone - Phone number to search (9 digits)
 * @returns {object|null} Client data or null
 */
async function findByPhone(phone) {
    if (!phone || phone.length !== 9) return null;

    try {
        const tableName = process.env.SQL_TABLE || 'BotHuancayo.Base';
        const conditions = PHONE_FIELDS.map(field =>
            `REPLACE(REPLACE(REPLACE([${field}], ' ', ''), '-', ''), '+', '') LIKE '%${phone}%'`
        ).join(' OR ');

        const queryStr = `
            SELECT TOP 1 * 
            FROM [${tableName.replace('.', '].[')}]
            WHERE ESTADO = ${ESTADO_FILTRO}
            AND (${conditions})
        `;

        logger.debug('SQL', `Buscando teléfono: ${phone}`);
        const result = await query(queryStr);

        if (result.length > 0) {
            logger.success('SQL', `Cliente encontrado por teléfono: ${result[0].NOMBRE_CLIENTE}`);
            return result[0];
        }

        logger.debug('SQL', `Teléfono no encontrado: ${phone}`);
        return null;

    } catch (err) {
        logger.error('SQL', 'Error buscando por teléfono', err);
        return null;
    }
}

/**
 * Find client by account number (18 digits)
 * @param {string} account - Account number (CUENTA_CREDITO)
 * @returns {object|null} Client data or null
 */
async function findByAccount(account) {
    if (!account || account.length !== 18) return null;

    try {
        const tableName = process.env.SQL_TABLE || 'BotHuancayo.Base';
        const queryStr = `
            SELECT TOP 1 * 
            FROM [${tableName.replace('.', '].[')}]
            WHERE ESTADO = ${ESTADO_FILTRO}
            AND CUENTA_CREDITO = @p0
        `;

        logger.debug('SQL', `Buscando cuenta: ${account}`);
        const result = await query(queryStr, [account]);

        if (result.length > 0) {
            logger.success('SQL', `Cliente encontrado por cuenta: ${result[0].NOMBRE_CLIENTE}`);
            return result[0];
        }

        logger.debug('SQL', `Cuenta no encontrada: ${account}`);
        return null;

    } catch (err) {
        logger.error('SQL', 'Error buscando por cuenta', err);
        return null;
    }
}

/**
 * Find client by document (DNI/RUC)
 * @param {string} doc - Document number
 * @returns {object|null} Client data or null
 */
async function findByDocument(doc) {
    if (!doc) {
        logger.warn('SQL', 'findByDocument llamado sin documento');
        return null;
    }

    try {
        logger.info('SQL', '═══════════════════════════════════════════════');
        logger.info('SQL', `🔍 BUSCANDO DOCUMENTO: ${doc}`);

        const tableName = process.env.SQL_TABLE || 'BotHuancayo.Base';
        const queryStr = `
            SELECT TOP 1 * 
            FROM [${tableName.replace('.', '].[')}]
            WHERE ESTADO = ${ESTADO_FILTRO}
            AND DOCUMENTO = @p0
        `;

        logger.debug('SQL', `Query: DOCUMENTO = ${doc}, ESTADO = ${ESTADO_FILTRO}`);
        const result = await query(queryStr, [doc]);

        if (result.length > 0) {
            logger.success('SQL', `✅ CLIENTE ENCONTRADO POR DOCUMENTO`);
            logger.info('SQL', `   NOMBRE: ${result[0].NOMBRE_CLIENTE}`);
            logger.info('SQL', `   CUENTA: ${result[0].CUENTA_CREDITO}`);
            logger.info('SQL', '═══════════════════════════════════════════════');
            return result[0];
        }

        logger.warn('SQL', `❌ DOCUMENTO NO ENCONTRADO: ${doc}`);
        logger.info('SQL', '═══════════════════════════════════════════════');
        return null;

    } catch (err) {
        logger.error('SQL', `Error buscando por documento: ${err.message}`);
        return null;
    }
}

/**
 * Cache operations
 */
async function upsertCache(jid, dni, clientData) {
    const p = await getPool();
    const escapedJid = escape(jid);
    const escapedDni = escape(dni);
    const escapedData = escape(typeof clientData === 'string' ? clientData : JSON.stringify(clientData));

    const updateResult = await p.request().query(`
        UPDATE BotCache 
        SET dni = ${escapedDni}, clientData = ${escapedData}, lastUpdated = GETDATE() 
        WHERE jid = ${escapedJid}
    `);

    if (updateResult.rowsAffected[0] === 0) {
        await p.request().query(`
            INSERT INTO BotCache (jid, dni, clientData) 
            VALUES (${escapedJid}, ${escapedDni}, ${escapedData})
        `);
    }

    return true;
}

async function getCache(jid) {
    const p = await getPool();
    const escapedJid = escape(jid);
    const result = await p.request().query(`SELECT clientData, dni FROM BotCache WHERE jid = ${escapedJid}`);
    return result.recordset.length > 0 ? result.recordset[0] : null;
}

async function deleteCache(jid) {
    const p = await getPool();
    const escapedJid = escape(jid);
    await p.request().query(`DELETE FROM BotCache WHERE jid = ${escapedJid}`);
    return true;
}

// ==================== FAQ OPERATIONS ====================

/**
 * Search for FAQ matching keywords in user query
 * @param {string} query - User's question
 * @returns {object|null} FAQ entry or null
 */
async function searchFAQ(query) {
    if (!query || query.length < 3) return null;

    try {
        const p = await getPool();

        // Clean and extract words from query
        const words = query.toLowerCase()
            .replace(/[¿?¡!.,;:'"]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2);

        if (words.length === 0) return null;

        // Build dynamic LIKE conditions for each word
        const request = p.request();
        const conditions = words.map((word, i) => {
            request.input(`word${i}`, sql.NVarChar, `%${word}%`);
            return `LOWER(palabras_clave) LIKE @word${i}`;
        }).join(' OR ');

        const result = await request.query(`
            SELECT TOP 1 * FROM FAQ_RESPUESTAS 
            WHERE activo = 1 AND (${conditions})
            ORDER BY veces_usado DESC
        `);

        if (result.recordset.length > 0) {
            // Increment usage counter
            const faq = result.recordset[0];
            await p.request().query(`
                UPDATE FAQ_RESPUESTAS 
                SET veces_usado = veces_usado + 1, ultima_actualizacion = GETDATE() 
                WHERE ID = ${faq.ID}
            `);
            logger.debug('SQL', `FAQ encontrado: "${faq.pregunta}"`);
            return faq;
        }

        logger.debug('SQL', 'No se encontró FAQ para la consulta');
        return null;

    } catch (err) {
        logger.error('SQL', 'Error buscando FAQ', err);
        return null;
    }
}

/**
 * Get all FAQs for admin panel
 */
async function getAllFAQs() {
    try {
        const p = await getPool();
        const result = await p.request().query(
            'SELECT * FROM FAQ_RESPUESTAS ORDER BY categoria, veces_usado DESC'
        );
        return result.recordset;
    } catch (err) {
        logger.error('SQL', 'Error obteniendo FAQs', err);
        return [];
    }
}

/**
 * Add new FAQ
 */
async function addFAQ(pregunta, palabrasClave, respuesta, categoria = 'general') {
    try {
        const p = await getPool();
        await p.request()
            .input('pregunta', sql.NVarChar, pregunta)
            .input('palabras', sql.NVarChar, palabrasClave)
            .input('respuesta', sql.NVarChar, respuesta)
            .input('categoria', sql.NVarChar, categoria)
            .query(`INSERT INTO FAQ_RESPUESTAS (pregunta, palabras_clave, respuesta, categoria) 
                    VALUES (@pregunta, @palabras, @respuesta, @categoria)`);
        logger.info('SQL', `FAQ agregado: "${pregunta}"`);
        return true;
    } catch (err) {
        logger.error('SQL', 'Error agregando FAQ', err);
        return false;
    }
}

/**
 * Update FAQ
 */
async function updateFAQ(id, pregunta, palabrasClave, respuesta, categoria, activo) {
    try {
        const p = await getPool();
        await p.request()
            .input('id', sql.Int, id)
            .input('pregunta', sql.NVarChar, pregunta)
            .input('palabras', sql.NVarChar, palabrasClave)
            .input('respuesta', sql.NVarChar, respuesta)
            .input('categoria', sql.NVarChar, categoria)
            .input('activo', sql.Bit, activo ? 1 : 0)
            .query(`UPDATE FAQ_RESPUESTAS SET 
                    pregunta=@pregunta, palabras_clave=@palabras, 
                    respuesta=@respuesta, categoria=@categoria, activo=@activo, 
                    ultima_actualizacion=GETDATE() WHERE ID=@id`);
        return true;
    } catch (err) {
        logger.error('SQL', 'Error actualizando FAQ', err);
        return false;
    }
}

/**
 * Delete FAQ
 */
async function deleteFAQ(id) {
    try {
        const p = await getPool();
        await p.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM FAQ_RESPUESTAS WHERE ID=@id');
        return true;
    } catch (err) {
        logger.error('SQL', 'Error eliminando FAQ', err);
        return false;
    }
}

module.exports = {
    connect,
    getConnectionStatus,
    isConnected,
    query,
    escape,
    getPool,
    findByPhone,
    findByAccount,
    findByDocument,
    upsertCache,
    getCache,
    deleteCache,
    searchFAQ,
    getAllFAQs,
    addFAQ,
    updateFAQ,
    deleteFAQ,
    PHONE_FIELDS,
    ESTADO_FILTRO
};

