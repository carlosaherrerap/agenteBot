const sql = require('../utils/sqlServer');

/**
 * Get client information by DNI (from HuancayoBase)
 * @param {string} dni - Client's DNI number
 * @returns {Promise<{success: boolean, cliente?: object, mensaje?: string}>}
 */
async function getClienteByDNI(dni) {
    try {
        const rows = await sql.query(
            `SELECT * FROM [dbo].[HuancayoBase] WHERE NRO_DNI = @p0`,
            [dni]
        );

        if (rows.length === 0) {
            return {
                success: false,
                mensaje: 'No encontramos información con ese DNI en nuestro sistema.'
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
 * Get client debts by DNI (from HuancayoBase - as it seems to contain all info)
 */
async function getDeudasByDNI(dni) {
    // In this specific setup, HuancayoBase seems to be a flat table with all info.
    // If it's a normalized DB, this would query a 'deudas' table.
    return getClienteByDNI(dni);
}

/**
 * Get office information (Dummy or from DB if available)
 */
async function getOficinas() {
    try {
        // Checking if there's an oficinas table, otherwise returning a default
        // The user didn't mention an Oficinas table in SQL Server, so we use a fallback
        return {
            success: true,
            oficinas: [
                { nombre: 'Agencia Principal Huancayo', direccion: 'Calle Real 123', telefono: '064-123456', horario: '8am-6pm' }
            ]
        };
    } catch (error) {
        return { success: false, oficinas: [] };
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
        await sql.query(
            `INSERT INTO Conversaciones 
             (cliente_id, telefono_whatsapp, dni_proporcionado, mensaje_cliente, respuesta_bot, intent, derivado_asesor)
             VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6)`,
            [clienteId, telefonoWhatsapp, dniProporcionado, mensajeCliente, respuestaBot, intent, derivadoAsesor ? 1 : 0]
        );
        console.log('💾 Conversation saved to SQL Server');
    } catch (error) {
        console.error('❌ Error saving conversation to SQL Server:', error.message);
    }
}

function formatDeudaInfo(client) {
    if (!client) return 'No hay información disponible.';

    // Using fields mentioned by user and common ones in SQL Server
    const saldoTotal = client.SALDO_TOTAL || '0.00';
    const diasAtraso = client.DIAS_ATRASO || '0';
    const fechaVenc = client.FECHA_VENCIMIENTO || 'No disp.';

    return `
📋 Información de tu deuda:
💰 Monto total: S/ ${saldoTotal}
📅 Vencimiento: ${fechaVenc}
⏰ Días de atraso: ${diasAtraso}
🏦 Entidad: Caja Huancayo
`.trim();
}

module.exports = {
    getClienteByDNI,
    getDeudasByDNI,
    getOficinas,
    saveConversacion,
    formatDeudaInfo
};
