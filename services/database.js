const sql = require('../utils/sqlServer');

/**
 * Get client by DNI/RUC/CUENTA from HuancayoBase
 * Now handles any length identifier
 */
async function getClienteByDNI(identifier) {
    try {
        let cliente = null;

        // Try different lookup strategies based on identifier length
        if (identifier.length === 18) {
            // Account number (CUENTA_CREDITO)
            cliente = await sql.findByAccount(identifier);
        } else if (identifier.length === 9) {
            // Phone number
            cliente = await sql.findByPhone(identifier);
        } else {
            // For any other length (8-digit DNI, 11-digit RUC, or any DOCUMENTO), search by DOCUMENTO
            cliente = await sql.findByDocument(identifier);
        }

        if (!cliente) {
            return {
                success: false,
                mensaje: 'No encontramos información con ese número. 😔'
            };
        }

        return {
            success: true,
            cliente: cliente
        };

    } catch (error) {
        console.error('❌ Error getting cliente from SQL Server:', error.message);
        return {
            success: false,
            mensaje: 'Error al consultar la base de datos.'
        };
    }
}

/**
 * Save conversation to SQL Server
 */
async function saveConversacion({
    clienteId = null,
    telefonoWhatsapp,
    dniProporcionado = null,
    mensajeCliente,
    respuestaBot,
    intent = null,
    derivadoAsesor = false
}) {
    try {
        const escapedTel = sql.escape(telefonoWhatsapp);
        const escapedDni = dniProporcionado ? sql.escape(dniProporcionado) : 'NULL';
        const escapedMsg = sql.escape(mensajeCliente);
        const escapedResp = sql.escape(respuestaBot);
        const escapedIntent = intent ? sql.escape(intent) : 'NULL';
        const derivado = derivadoAsesor ? 1 : 0;

        const pool = await sql.getPool();
        await pool.request().query(
            `INSERT INTO Conversaciones 
             (telefono_whatsapp, dni_proporcionado, mensaje_cliente, respuesta_bot, intent, derivado_asesor)
             VALUES (${escapedTel}, ${escapedDni}, ${escapedMsg}, ${escapedResp}, ${escapedIntent}, ${derivado})`
        );
        console.log('💾 Conversation saved');
    } catch (error) {
        console.error('❌ Error saving conversation:', error.message);
    }
}

module.exports = {
    getClienteByDNI,
    saveConversacion
};
