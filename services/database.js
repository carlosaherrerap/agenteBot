const sql = require('../utils/sqlServer');

/**
 * Get client by DNI/RUC from HuancayoBase using raw query
 */
async function getClienteByDNI(identifier) {
    try {
        const escapedId = sql.escape(identifier);
        const rows = await sql.rawQuery(
            `SELECT TOP 1 * FROM [dbo].[HuancayoBase] 
             WHERE NRO_DNI = ${escapedId} 
             OR NRO_RUC = ${escapedId} 
             OR CUENTA_CREDITO = ${escapedId}`
        );

        if (rows.length === 0) {
            return {
                success: false,
                mensaje: 'No encontramos información con ese número.'
            };
        }

        return {
            success: true,
            cliente: rows[0]
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
 * Save conversation to SQL Server using raw query
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

        await sql.rawQuery(
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
