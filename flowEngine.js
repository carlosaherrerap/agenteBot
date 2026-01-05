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
 * @returns {string} Phone number (last 9 digits for Peru)
 */
function extractPhone(jid) {
    const full = jid.split('@')[0];

    // Log full JID for debugging
    logger.debug('BOT', `JID completo: ${jid}`);
    logger.debug('BOT', `Número extraído raw: ${full}`);

    // For Peru, phone numbers are 9 digits starting with 9
    // The JID might have country code (51) or other prefixes

    // If it's already 9 digits and starts with 9, it's a Peru mobile
    if (full.length === 9 && full.startsWith('9')) {
        return full;
    }

    // If starts with 51 (Peru code), remove it
    if (full.startsWith('51') && full.length === 11) {
        return full.substring(2);
    }

    // For other formats, try to get the last 9 digits if they start with 9
    if (full.length > 9) {
        const last9 = full.slice(-9);
        if (last9.startsWith('9')) {
            logger.debug('BOT', `Usando últimos 9 dígitos: ${last9}`);
            return last9;
        }
    }

    // Return the full number if we can't normalize it
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
 * Check if JID is a Linked ID (not a phone number)
 * @param {string} jid - WhatsApp JID
 * @returns {boolean} True if LID format
 */
function isLinkedId(jid) {
    return jid.endsWith('@lid');
}

/**
 * Validate input and determine type
 * When bot asks for DNI/cuenta, client can provide:
 * - 8 digits = DNI (search in DOCUMENTO field)
 * - 11 digits = RUC (search in DOCUMENTO field)  
 * - 18 digits = Cuenta (search in CUENTA_CREDITO field)
 * @param {string} input - User input
 * @returns {object} { type: 'account'|'dni'|'ruc'|'invalid'|'text', value, error }
 */
function validateInput(input) {
    const cleaned = input.replace(/\D/g, ''); // Remove non-digits

    // If no digits, treat as text
    if (cleaned.length === 0) {
        return { type: 'text', value: input, error: null };
    }

    // DNI: exactly 8 digits
    if (cleaned.length === 8) {
        logger.info('BOT', `Detectado DNI: ${cleaned}`);
        return { type: 'dni', value: cleaned, error: null };
    }

    // Phone: exactly 9 digits
    if (cleaned.length === 9) {
        logger.info('BOT', `Detectado teléfono: ${cleaned}`);
        return { type: 'phone', value: cleaned, error: null };
    }

    // RUC: exactly 11 digits (should start with 10 or 20)
    if (cleaned.length === 11) {
        if (cleaned.startsWith('10') || cleaned.startsWith('20')) {
            logger.info('BOT', `Detectado RUC: ${cleaned}`);
            return { type: 'ruc', value: cleaned, error: null };
        } else {
            logger.warn('BOT', `RUC con formato inválido: ${cleaned}`);
            return { type: 'invalid', value: cleaned, error: templates.invalidRucFormat() };
        }
    }

    // Account: exactly 18 digits
    if (cleaned.length === 18) {
        logger.info('BOT', `Detectada cuenta: ${cleaned}`);
        return { type: 'account', value: cleaned, error: null };
    }

    // Any other number of digits is invalid
    logger.warn('BOT', `Longitud de número inválida: ${cleaned.length} dígitos`);
    return { type: 'invalid', value: cleaned, error: templates.invalidDocumentLength() };
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
 * @param {string} resolvedPhone - Resolved phone number (if available)
 * @returns {string|null} Response or null
 */
async function runFlow(incomingText, fromJid, resolvedPhone = null) {
    const text = incomingText.trim();
    const lowText = text.toLowerCase();

    // ========== 1. IGNORE GROUPS ==========
    if (isGroup(fromJid)) {
        logger.debug('BOT', `Mensaje de grupo ignorado: ${fromJid}`);
        return null;
    }

    // Extract phone info
    // Use resolvedPhone if provided and not starting with LID:, otherwise try to extract from JID
    let clientPhone = resolvedPhone || extractPhone(fromJid);
    const isLid = isLinkedId(fromJid) && (!clientPhone || clientPhone.startsWith('LID:'));

    // If it's still a LID string, we don't have the real phone
    const hasRealPhone = !isLid && clientPhone && !clientPhone.startsWith('LID:');

    // Log incoming message with special format
    logger.info('BOT', `────────────────────────────────────────`);
    logger.info('BOT', `-> TELEFONO_CLIENTE: ${hasRealPhone ? clientPhone : 'DESCONOCIDO (LID)'}`);

    if (isLid) {
        logger.warn('BOT', `⚠️  JID: ${fromJid} (Linked ID sin número real resuelto aún)`);
    } else {
        logger.info('BOT', `🔍 JID real: ${fromJid}`);
    }

    // ========== 2. CHECK REDIS CACHE ==========
    let session = await redis.getSession(fromJid);
    let client = session?.client || null;

    if (session) {
        logger.info('REDIS', `📦 Sesión encontrada - identified: ${session.identified}, waitingFor: ${session.waitingFor}`);
        // Extend session on activity
        await redis.extendSession(fromJid);
    } else {
        logger.info('REDIS', '📭 Sin sesión previa');
    }

    // ========== 3. IF WAITING FOR DOCUMENT/ACCOUNT (CHECK THIS FIRST!) ==========
    // This MUST come before first contact check to avoid re-greeting
    if (session && !session.identified && session.waitingFor === 'document') {
        logger.info('BOT', '═══════════════════════════════════════════════');
        logger.info('BOT', 'PASO 3: Cliente esperando identificación');
        logger.info('BOT', `Texto recibido: "${text}"`);

        const validation = validateInput(text);
        logger.info('BOT', `Tipo detectado: ${validation.type}, valor: ${validation.value}`);

        if (validation.type === 'invalid') {
            logger.warn('BOT', `Input inválido: ${validation.error}`);
            return validation.error;
        }

        // Search based on input type
        if (validation.type === 'dni' || validation.type === 'ruc') {
            // Search by document (DNI or RUC)
            logger.info('SQL', `🔍 Buscando por DOCUMENTO: ${validation.value}`);
            client = await sql.findByDocument(validation.value);
            if (client) {
                logger.success('SQL', `✅ Cliente encontrado: ${client.NOMBRE_CLIENTE}`);
            } else {
                logger.warn('SQL', `❌ No se encontró cliente con documento: ${validation.value}`);
            }
        } else if (validation.type === 'phone') {
            // Search by phone provided in text
            logger.info('SQL', `🔍 Buscando por TELÉFONO (texto): ${validation.value}`);
            client = await sql.findByPhone(validation.value);
        } else if (validation.type === 'account') {
            // Search by account
            logger.info('SQL', `🔍 Buscando por CUENTA: ${validation.value}`);
            client = await sql.findByAccount(validation.value);
        } else {
            // Text input - might be trying to chat, ask again for identification
            logger.debug('BOT', 'Input no es número, pidiendo identificación de nuevo');
            return templates.askForDocument();
        }

        if (client) {
            // Client found - update session
            await redis.setSession(fromJid, {
                client,
                identified: true,
                identifiedBy: validation.type
            });

            // Update Excel record with client info (only if not @lid)
            if (!isLinkedId(fromJid)) {
                excel.updatePhoneRecord(clientPhone, {
                    CUENTA_CREDITO: client.CUENTA_CREDITO || '',
                    NOMBRE_CLIENTE: client.NOMBRE_CLIENTE || ''
                });
            }

            logger.success('BOT', `✅ Cliente identificado por ${validation.type}: ${client.NOMBRE_CLIENTE}`);
            logger.info('BOT', '═══════════════════════════════════════════════');
            return templates.menuOptions(getFirstName(client.NOMBRE_CLIENTE));
        } else {
            // Not found
            logger.warn('BOT', `❌ No se encontró cliente con ${validation.type}: ${validation.value}`);

            if (validation.type === 'dni' || validation.type === 'ruc' || validation.type === 'phone') {
                if (validation.type === 'phone') {
                    // It was a phone typed as text but not found in DB
                    // Log to Excel as a new phone
                    excel.appendNewPhone({
                        CUENTA_CREDITO: '',
                        NOMBRE_CLIENTE: '',
                        telefono_nuevo: validation.value
                    });

                    logger.phone(validation.value, false, { telefono_nuevo: validation.value });
                }

                // Document or Phone typed not found - ask for identification again
                return templates.clientNotFound();
            }

            // Account not found = no debt
            logger.info('BOT', '═══════════════════════════════════════════════');
            return templates.noDebtFound();
        }
    }

    // ========== 4. FIRST CONTACT (no session or already identified) ==========
    if (!client && !session) {
        logger.info('BOT', '═══════════════════════════════════════════════');
        logger.info('BOT', 'PASO 4: Primer contacto - nuevo cliente');

        // If we don't have a real phone number yet (Linked ID @lid)
        if (!hasRealPhone) {
            logger.info('BOT', 'Cliente con Linked ID - pidiendo DNI/RUC/Cuenta para identificar');

            // Log status prominently
            logger.phone('DESCONOCIDO (LID)', false);

            // Save partial session
            await redis.setSession(fromJid, {
                client: null,
                identified: false,
                waitingFor: 'document',
                isLid: true
            });

            logger.info('BOT', '═══════════════════════════════════════════════');
            return templates.greetingNeutral();
        }

        // For real phone numbers, search in database
        logger.info('SQL', `🔍 Buscando teléfono en BD: ${clientPhone}`);
        client = await sql.findByPhone(clientPhone);

        if (client) {
            // Found by phone - log status prominently and greet with name
            logger.phone(clientPhone, true);
            logger.success('BOT', `Cliente identificado por teléfono: ${client.NOMBRE_CLIENTE}`);

            await redis.setSession(fromJid, {
                client,
                identified: true,
                identifiedBy: 'phone'
            });

            logger.info('BOT', '═══════════════════════════════════════════════');
            return templates.greetingWithName(client.NOMBRE_CLIENTE);
        } else {
            // Phone not found - log status prominently, save to Excel and ask for ID
            const excelData = {
                CUENTA_CREDITO: '',
                NOMBRE_CLIENTE: '',
                telefono_nuevo: clientPhone
            };

            logger.phone(clientPhone, false, excelData);

            excel.appendNewPhone(excelData);

            // Save partial session
            await redis.setSession(fromJid, {
                client: null,
                identified: false,
                waitingFor: 'document'
            });

            logger.info('BOT', '═══════════════════════════════════════════════');
            return templates.greetingNeutral();
        }
    }

    // ========== 5. GLOBAL RETURN TO MENU (Option 0) ==========
    if (text === '0' && client) {
        logger.info('BOT', 'Regresando al menú principal (opción 0)');
        await redis.setSession(fromJid, {
            ...session,
            client,
            subMenu: 'main',
            waitingFor: null
        });
        return templates.menuOptions(getFirstName(client.NOMBRE_CLIENTE));
    }

    // ========== 5. MAIN MENU OPTIONS (1-4) ==========
    if (/^[1-4]$/.test(text) && client && (!session?.subMenu || session?.subMenu === 'main')) {
        const option = parseInt(text);
        logger.info('BOT', `Opción de menú principal: ${option}`);

        switch (option) {
            case 1: // Detalles deuda - show sub-menu
                await redis.setSession(fromJid, {
                    ...session,
                    client,
                    subMenu: 'debt'
                });
                return templates.debtDetailsMenu();
            case 2: // Oficinas
                return templates.officesInfo();
            case 3: // Actualizar teléfono - servicio no disponible
                return templates.updatePhoneRequest();
            case 4: // Asesor - pedir DNI + consulta
                await redis.setSession(fromJid, {
                    ...session,
                    client,
                    waitingFor: 'advisor_request'
                });
                return templates.advisorRequest();
        }
    }

    // ========== 5.1 DEBT SUB-MENU OPTIONS (1-4) ==========
    if (/^[1-4]$/.test(text) && client && session?.subMenu === 'debt') {
        const option = parseInt(text);
        logger.info('BOT', `Opción de sub-menú deuda: ${option}`);

        const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
        const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
        const diasAtraso = client.DIAS_ATRASO || 0;

        switch (option) {
            case 1: // Saldo Capital
                return templates.debtSaldoCapital(saldoCapital);
            case 2: // Cuota Pendiente
                return templates.debtCuotaPendiente(saldoCuota);
            case 3: // Días de Atraso
                return templates.debtDiasAtraso(diasAtraso);
            case 4: // Regresar al menú anterior
                await redis.setSession(fromJid, {
                    ...session,
                    client,
                    subMenu: 'main'
                });
                return templates.menuOptions(getFirstName(client.NOMBRE_CLIENTE));
        }
    }

    // ========== 5.2 WAITING FOR ADVISOR REQUEST (DNI + consulta) ==========
    if (session?.waitingFor === 'advisor_request') {
        // Check if message contains 8-digit DNI (with or without "DNI" prefix)
        // Pattern: Optional "DNI" word, then 8 digits
        const dniWithPrefixMatch = text.match(/(?:dni|documento)\s*[:\-]?\s*(\d{8})/i);
        const dniWithoutPrefixMatch = text.match(/^\s*(\d{8})(?:\b|[\s,])/);

        const dniMatch = dniWithPrefixMatch || dniWithoutPrefixMatch;

        if (dniMatch) {
            const dni = dniMatch[1];
            // Extract query: remove DNI prefix and number
            let query = text
                .replace(/(?:dni|documento)\s*[:\-]?\s*\d{8}[,\s]*/i, '')
                .replace(/^\d{8}[,\s]*/, '')
                .trim();

            if (!query) query = 'Solicitud de contacto';

            logger.info('BOT', `Solicitud de asesor - DNI: ${dni}, Consulta: ${query}`);

            await sendAdvisorEmail(dni, query);

            // Reset session state
            await redis.setSession(fromJid, {
                ...session,
                waitingFor: null,
                subMenu: 'main'
            });

            return templates.advisorTransferConfirm();
        } else {
            // No 8-digit DNI found, ask again
            return templates.advisorRequest();
        }
    }

    // ========== 6. ADVISOR REQUEST BY KEYWORD ==========
    const advisorRegex = /(asesor|humano|hablar con|agente|comunicarme|ayuda personal)/i;
    if (advisorRegex.test(lowText)) {
        await redis.setSession(fromJid, {
            ...session,
            client,
            waitingFor: 'advisor_request'
        });
        return templates.advisorRequest();
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
    logger.debug('BOT', 'Paso 9: Verificando si es pregunta de deuda...');
    const debtRegex = /(cuanto debo|mi deuda|saldo|pagar|mora|atraso|cuota)/i;
    if (debtRegex.test(lowText)) {
        logger.info('BOT', 'Detectada pregunta sobre deuda');
        if (client) {
            return templates.debtDetails(client);
        }
        return templates.askForDocument();
    }

    // ========== 10. AI FALLBACK ==========
    logger.info('BOT', '═══════════════════════════════════════');
    logger.info('BOT', 'Paso 10: Ningún patrón coincidió, usando IA...');
    logger.info('AI', `Procesando mensaje: "${text}"`);

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
        logger.debug('AI', `Cliente identificado: ${client.NOMBRE_CLIENTE}`);
    } else {
        clientContext = '\nCLIENTE NO IDENTIFICADO. Pedir DNI o número de cuenta.';
        logger.debug('AI', 'Cliente NO identificado');
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
        logger.info('AI', 'Enviando solicitud a IA...');
        const startTime = Date.now();
        const aiResponse = await getDeepseekResponse(messages);
        const elapsed = Date.now() - startTime;

        logger.success('BOT', `Respuesta IA (${elapsed}ms): "${aiResponse.substring(0, 80)}..."`);
        logger.info('BOT', '═══════════════════════════════════════');
        return aiResponse;
    } catch (err) {
        logger.error('AI', 'Error en respuesta AI', err);
        logger.info('BOT', '═══════════════════════════════════════');
        return templates.errorFallback();
    }
}

module.exports = { runFlow, isBotPaused, toggleBotPause };
