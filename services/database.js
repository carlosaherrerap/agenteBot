const db = require('../utils/db');

/**
 * Get client information by DNI
 * @param {string} dni - Client's DNI number
 * @returns {Promise<{success: boolean, cliente?: object, mensaje?: string}>}
 */
async function getClienteByDNI(dni) {
    try {
        const result = await db.query(
            `SELECT 
                c.id,
                c.cuenta,
                c.dni,
                c.nombre_completo,
                c.telefono,
                c.departamento,
                c.provincia,
                c.distrito
             FROM clientes c
             WHERE c.dni = $1
             LIMIT 1`,
            [dni]
        );

        if (result.rows.length === 0) {
            return {
                success: false,
                mensaje: 'No encontramos información con ese DNI en nuestro sistema.'
            };
        }

        const cliente = result.rows[0];

        // Extract last name from full name
        // Example: "VILCA GUILLERMO, ILMA" -> "ILMA"
        const nombreCompleto = cliente.nombre_completo;
        const partes = nombreCompleto.split(',');
        const ultimoNombre = partes.length > 1 ? partes[1].trim() : nombreCompleto.split(' ').pop();

        return {
            success: true,
            cliente: {
                ...cliente,
                ultimo_nombre: ultimoNombre
            }
        };

    } catch (error) {
        console.error('❌ Error getting cliente by DNI:', error.message);
        return {
            success: false,
            mensaje: 'Error al consultar la base de datos. Por favor intenta más tarde.'
        };
    }
}

/**
 * Get client debts by DNI
 * @param {string} dni - Client's DNI number
 * @returns {Promise<{success: boolean, deudas?: array, mensaje?: string}>}
 */
async function getDeudasByDNI(dni) {
    try {
        const result = await db.query(
            `SELECT 
                d.id,
                d.cuenta,
                d.tipo_credito,
                d.monto_original,
                d.monto_actual,
                d.monto_mora,
                d.interes_acumulado,
                d.dias_mora,
                d.fecha_vencimiento,
                d.estado_deuda,
                d.cuotas_totales,
                d.cuotas_pagadas,
                d.cuotas_vencidas,
                d.descuento_disponible,
                ef.nombre as entidad_financiera
             FROM deudas d
             JOIN clientes c ON d.cliente_id = c.id
             JOIN entidades_financieras ef ON d.entidad_id = ef.id
             WHERE c.dni = $1
             ORDER BY d.fecha_vencimiento DESC`,
            [dni]
        );

        if (result.rows.length === 0) {
            return {
                success: false,
                mensaje: 'No encontramos deudas registradas para este DNI.'
            };
        }

        return {
            success: true,
            deudas: result.rows
        };

    } catch (error) {
        console.error('❌ Error getting deudas by DNI:', error.message);
        return {
            success: false,
            mensaje: 'Error al consultar las deudas. Por favor intenta más tarde.'
        };
    }
}

/**
 * Get financial entity offices
 * @param {string} entidadNombre - Optional entity name filter
 * @returns {Promise<{success: boolean, oficinas?: array}>}
 */
async function getOficinas(entidadNombre = 'Caja Huancayo') {
    try {
        const result = await db.query(
            `SELECT 
                o.nombre,
                o.departamento,
                o.provincia,
                o.direccion,
                o.telefono,
                o.horario,
                ef.nombre as entidad
             FROM oficinas o
             JOIN entidades_financieras ef ON o.entidad_id = ef.id
             WHERE ef.nombre ILIKE $1
             ORDER BY o.departamento, o.nombre`,
            [`%${entidadNombre}%`]
        );

        return {
            success: true,
            oficinas: result.rows
        };

    } catch (error) {
        console.error('❌ Error getting oficinas:', error.message);
        return {
            success: false,
            oficinas: []
        };
    }
}

/**
 * Save conversation to database
 * @param {object} conversationData
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
        await db.query(
            `INSERT INTO conversaciones 
             (cliente_id, telefono_whatsapp, dni_proporcionado, mensaje_cliente, respuesta_bot, intent, derivado_asesor)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [clienteId, telefonoWhatsapp, dniProporcionado, mensajeCliente, respuestaBot, intent, derivadoAsesor]
        );

        console.log('💾 Conversation saved to database');
    } catch (error) {
        console.error('❌ Error saving conversation:', error.message);
    }
}

/**
 * Format debt information for bot response
 * @param {object} deuda - Debt object from database
 * @returns {string}
 */
function formatDeudaInfo(deuda) {
    const descuento = deuda.descuento_disponible > 0
        ? `\nDescuento disponible: ${deuda.descuento_disponible}%`
        : '';

    return `
📋 Información de tu deuda:

💰 Monto total: S/ ${deuda.monto_actual.toFixed(2)}
   - Deuda capital: S/ ${(deuda.monto_actual - deuda.monto_mora - deuda.interes_acumulado).toFixed(2)}
   - Mora: S/ ${deuda.monto_mora.toFixed(2)}
   - Intereses: S/ ${deuda.interes_acumulado.toFixed(2)}

📅 Estado: ${deuda.estado_deuda}
📆 Días de mora: ${deuda.dias_mora}
💳 Cuotas: ${deuda.cuotas_pagadas}/${deuda.cuotas_totales} pagadas${descuento}

🏦 Entidad: ${deuda.entidad_financiera}
`.trim();
}

module.exports = {
    getClienteByDNI,
    getDeudasByDNI,
    getOficinas,
    saveConversacion,
    formatDeudaInfo
};
