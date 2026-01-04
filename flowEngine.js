/**
 * Flow Engine - Main Chatbot Logic
 * Handles all incoming messages and conversation flow
 */
require('dotenv').config();
const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const sql = require('./utils/sqlServer');
const redis = require('./utils/redis');
const excel = require('./utils/excel');
const templates = require('./utils/templates');
const logger = require('./utils/logger');

// ==================== BOT PAUSE CONTROL ====================
const pausedChats = new Set();

function isBotPaused(jid) {
    return pausedChats.has(jid);
}

function toggleBotPause(jid) {
    if (pausedChats.has(jid)) {
        pausedChats.delete(jid);
        return false;
    } else {
        pausedChats.add(jid);
        return true;
    }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Extract phone number from WhatsApp JID
 * @param {string} jid - WhatsApp JID (format: 51999999999@s.whatsapp.net)
 * @returns {string} Phone number without country code
 */
function extractPhone(jid) {
    const full = jid.split('@')[0];
    // Remove Peru country code (51) if present
    if (full.startsWith('51') && full.length === 11) {
        return full.substring(2);
    }
    return full;
}

/**
 * Check if message is from a group
 * @param {string} jid - WhatsApp JID
 * @returns {boolean} True if from group
 */
function isGroup(jid) {
    return jid.endsWith('@g.us');
}

/**
 * Validate input and determine type
 * @param {string} input - User input
 * @returns {object} { type: 'phone'|'account'|'invalid'|'text', value, error }
 */
function validateInput(input) {
    const cleaned = input.replace(/\D/g, ''); // Remove non-digits

    if (cleaned.length === 9) {
        return { type: 'phone', value: cleaned, error: null };
    }

    if (cleaned.length === 18) {
        return { type: 'account', value: cleaned, error: null };
    }

    if (cleaned.length > 0 && cleaned.length < 9) {
        return { type: 'invalid', value: cleaned, error: templates.invalidPhoneLength() };
    }

    if (cleaned.length > 9 && cleaned.length < 18) {
        return { type: 'invalid', value: cleaned, error: templates.invalidAccountLength() };
    }

    if (cleaned.length > 18) {
        return { type: 'invalid', value: cleaned, error: templates.invalidAccountLength() };
    }

    return { type: 'text', value: input, error: null };
}

/**
 * Get first name from NOMBRE_CLIENTE
 * @param {string} fullName - Full client name
 * @returns {string} First name or full name
 */
function getFirstName(fullName) {
    if (!fullName) return 'Cliente';
    const parts = fullName.split(' ');
    return parts[0] || fullName;
}

// ==================== MAIN FLOW ====================

/**
 * Process incoming message
 * @param {string} incomingText - Message text
 * @param {string} fromJid - WhatsApp JID
 * @returns {string|null} Response or null
 */
async function runFlow(incomingText, fromJid) {
    const text = incomingText.trim();
    const lowText = text.toLowerCase();

    // ========== 1. IGNORE GROUPS ==========
    if (isGroup(fromJid)) {
        logger.debug('BOT', `Mensaje de grupo ignorado: ${fromJid}`);
        return null;
    }

    // Extract phone from JID
    const clientPhone = extractPhone(fromJid);

    // Log incoming message
    logger.info('BOT', `📩 Mensaje de ${clientPhone}: "${text}"`);

    // ========== 2. CHECK REDIS CACHE ==========
    let session = await redis.getSession(fromJid);
    let client = session?.client || null;

    if (session) {
        logger.debug('REDIS', `Sesión activa encontrada para ${clientPhone}`);
        // Extend session on activity
        await redis.extendSession(fromJid);
    }

    // ========== 3. FIRST CONTACT - SEARCH BY PHONE ==========
    if (!client) {
        logger.phone(clientPhone, false);

        // Search phone in database
        client = await sql.findByPhone(clientPhone);

        if (client) {
            // Found by phone - save session and greet with name
            logger.phone(clientPhone, true);
            logger.success('BOT', `Cliente identificado: ${client.NOMBRE_CLIENTE}`);

            await redis.setSession(fromJid, {
                client,
                identified: true,
                identifiedBy: 'phone'
            });

            return templates.greetingWithName(client.NOMBRE_CLIENTE);
        } else {
            // Phone not found - save to Excel and ask for ID
            excel.appendNewPhone({
                CUENTA_CREDITO: '',
                NOMBRE_CLIENTE: '',
                telefono_nuevo: clientPhone
            });

            // Save partial session
            await redis.setSession(fromJid, {
                client: null,
                identified: false,
                waitingFor: 'document'
            });

            return templates.greetingNeutral();
        }
    }

    // ========== 4. IF WAITING FOR DOCUMENT/ACCOUNT ==========
    if (session && !session.identified && session.waitingFor === 'document') {
        const validation = validateInput(text);

        if (validation.type === 'invalid') {
            return validation.error;
        }

        if (validation.type === 'phone') {
            // Search by phone
            client = await sql.findByPhone(validation.value);
        } else if (validation.type === 'account') {
            // Search by account
            client = await sql.findByAccount(validation.value);
        }

        if (client) {
            // Client found - update session
            await redis.setSession(fromJid, {
                client,
                identified: true,
                identifiedBy: validation.type
            });

            logger.success('BOT', `Cliente identificado por ${validation.type}: ${client.NOMBRE_CLIENTE}`);
            return templates.menuOptions(getFirstName(client.NOMBRE_CLIENTE));
        } else {
            // Still not found
            if (validation.type === 'phone') {
                // Save new phone and ask for account
                excel.appendNewPhone({
                    CUENTA_CREDITO: '',
                    NOMBRE_CLIENTE: '',
                    telefono_nuevo: validation.value
                });
                return templates.askForAccount();
            }
            // Account not found = no debt
            return templates.noDebtFound();
        }
    }

    // ========== 5. MENU OPTIONS (1-4) ==========
    if (/^[1-4]$/.test(text) && client) {
        const option = parseInt(text);

        switch (option) {
            case 1: // Detalles deuda
                return templates.debtDetails(client);
            case 2: // Oficinas
                return templates.officesInfo();
            case 3: // Actualizar teléfono
                return templates.updatePhoneRequest();
            case 4: // Asesor
                const doc = client.DOCUMENTO || 'Sin documento';
                await sendAdvisorEmail(doc, `Solicitud de contacto - ${client.NOMBRE_CLIENTE}`);
                return templates.advisorTransfer();
        }
    }

    // ========== 6. ADVISOR REQUEST ==========
    const advisorRegex = /(asesor|humano|hablar con|agente|comunicarme|ayuda personal)/i;
    if (advisorRegex.test(lowText)) {
        const doc = client?.DOCUMENTO || 'Sin documento';
        await sendAdvisorEmail(doc, text);
        return templates.advisorTransfer();
    }

    // ========== 7. OFF-TOPIC DETECTION ==========
    const offTopicRegex = /(clima|fútbol|soccer|película|receta|chiste|música|juego)/i;
    if (offTopicRegex.test(lowText)) {
        return templates.onlyDebtInfo();
    }

    // ========== 8. GREETING WITHOUT SESSION ==========
    const greetingRegex = /^(hola|buen[ao]s?\s*(d[ií]as?|tardes?|noches?)|hey|saludos?)$/i;
    if (greetingRegex.test(lowText)) {
        if (client) {
            return templates.menuOptions(getFirstName(client.NOMBRE_CLIENTE));
        }
        return templates.greetingNeutral();
    }

    // ========== 9. DEBT-RELATED QUESTIONS ==========
    const debtRegex = /(cuanto debo|mi deuda|saldo|pagar|mora|atraso|cuota)/i;
    if (debtRegex.test(lowText)) {
        if (client) {
            return templates.debtDetails(client);
        }
        return templates.askForDocument();
    }

    // ========== 10. AI FALLBACK ==========
    logger.info('AI', 'Usando IA para respuesta');

    const botContext = (process.env.BOT_CONTEXT || 'Eres Max, asistente de cobranzas de InformaPeru.').replace(/\\n/g, '\n');

    let clientContext = '';
    if (client) {
        clientContext = `
DATOS DEL CLIENTE:
- Nombre: ${client.NOMBRE_CLIENTE}
- Cuenta: ${client.CUENTA_CREDITO}
- Saldo Capital: S/ ${client.SALDO_CAPITAL || 0}
- Saldo Cuota: S/ ${client.SALDO_CUOTA || 0}
- Días Atraso: ${client.DIAS_ATRASO || 0}`;
    } else {
        clientContext = '\nCLIENTE NO IDENTIFICADO. Pedir DNI o número de cuenta.';
    }

    const messages = [
        {
            role: 'system',
            content: `${botContext}

REGLAS:
1. Responde SOLO sobre deudas y cobranzas
2. NO inventes montos, usa datos del cliente
3. Sé breve y profesional
4. Si preguntan otra cosa, indica que solo ayudas con deudas
${clientContext}`
        },
        { role: 'user', content: text }
    ];

    try {
        const aiResponse = await getDeepseekResponse(messages);
        return aiResponse;
    } catch (err) {
        logger.error('AI', 'Error en respuesta AI', err);
        return templates.errorFallback();
    }
}

module.exports = { runFlow, isBotPaused, toggleBotPause };
