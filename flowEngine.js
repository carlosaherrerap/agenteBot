/**
 * Flow Engine - Max Bot de InformaPeru/Caja Huancayo
 * 
 * Sistema de 3 FASES:
 * - FASE 1: Saludo + Solicitud de documento (DNI/RUC/Cuenta)
 * - FASE 2: Validación e identificación (8/11/18 dígitos)
 * - FASE 3: Menú contextual con opciones
 */
const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const { getClienteByDNI, saveConversacion } = require('./services/database');
const sql = require('./utils/sqlServer');
const templates = require('./utils/templates');

// ==================== SESSION MANAGEMENT ====================
const sessions = new Map(); // jid -> session data
const SESSION_TIMEOUT = 300000; // 5 minutos en milisegundos
const MAX_FAILED_ATTEMPTS = 4;
const BLOCK_DURATION = 30 * 60 * 1000; // 30 minutos en milisegundos

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

// ==================== SESSION FUNCTIONS ====================
/**
 * Obtener o crear sesión para un JID
 */
function getSession(jid) {
    if (!sessions.has(jid)) {
        sessions.set(jid, {
            phase: 1,                    // FASE 1, 2 o 3
            menuLevel: 'main',           // main, asesor_inicio
            pendingQuery: null,          // Consulta en cola de FASE 1
            failedAttempts: 0,           // Intentos fallidos de identificación
            blockedUntil: null,           // Timestamp de desbloqueo
            cachedClient: null,          // Datos del cliente de BD
            lastActivity: Date.now(),
            conversationHistory: []
        });
    }
    const session = sessions.get(jid);
    session.lastActivity = Date.now();
    return session;
}

function clearSession(jid) {
    sessions.delete(jid);
    console.log(`🗑️ Session cleared for ${jid}`);
}

function checkSessionTimeout(jid) {
    const session = sessions.get(jid);
    if (!session) return false;

    const elapsed = Date.now() - session.lastActivity;
    if (elapsed > SESSION_TIMEOUT) {
        clearSession(jid);
        return true; // Session expired
    }
    return false;
}

// Callback for session expiration notification
let onSessionExpiredCallback = null;

/**
 * Set callback for session expiration
 * @param {function} callback - async function(jid) called when session expires
 */
function setOnSessionExpired(callback) {
    onSessionExpiredCallback = callback;
}

// Cleanup inactive sessions every 30 seconds and notify users
setInterval(() => {
    const now = Date.now();
    for (const [jid, session] of sessions.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            console.log(`⏰ Sesión expirada para ${jid}`);

            // Notify user proactively before clearing session
            if (onSessionExpiredCallback) {
                onSessionExpiredCallback(jid).catch(err => {
                    console.log(`⚠️ No se pudo notificar expiración: ${err.message}`);
                });
            }

            clearSession(jid);
        }
    }
}, 30000); // Check every 30 seconds for faster detection

// ==================== CACHE FUNCTIONS ====================
async function getFromCache(jid) {
    try {
        const cached = await sql.getCache(jid);
        if (cached && cached.clientData) {
            console.log(`📦 Cache HIT for ${jid}`);
            return JSON.parse(cached.clientData);
        }
        console.log(`📭 Cache MISS for ${jid}`);
        return null;
    } catch (err) {
        console.error('Error fetching from BotCache:', err.message);
        return null;
    }
}

async function saveToCache(jid, dni, data) {
    try {
        await sql.upsertCache(jid, dni, data);
        console.log(`💾 SAVED to cache for ${jid} (DNI: ${dni})`);
        return true;
    } catch (err) {
        console.error('❌ Error saving to BotCache:', err.message);
        return false;
    }
}

// ==================== UTILITY FUNCTIONS ====================
/**
 * Calcular saldo de cuota sumando componentes
 */
function calculateSaldoCuota(client) {
    if (!client) return '0.00';
    const capital = parseFloat(client.SALDO_CAPITAL_PROXIMA_CUOTA || 0);
    const interes = parseFloat(client.SALDO_INTERES_PROXIMA_CUOTA || 0);
    const mora = parseFloat(client.SALDO_MORA_PROXIMA_CUOTA || 0);
    const gasto = parseFloat(client.SALDO_GASTO_PROXIMA_CUOTA || 0);
    const congelado = parseFloat(client.SALDO_CAP_INT_CONGELADO_PROXIMA_CUOTA || 0);
    return (capital + interes + mora + gasto + congelado).toFixed(2);
}

/**
 * Obtener nombre del cliente (primer nombre)
 */
function getClientName(client) {
    if (!client) return 'Cliente';
    const fullName = client.NOMBRE_CLIENTE || client.CLIENTE_PREMIUM || client.nombre_completo || 'Cliente';
    const parts = fullName.split(',');
    if (parts.length > 1) {
        return parts[1].trim().split(' ')[0];
    }
    return fullName.split(' ')[0];
}

// ==================== REGEX PATTERNS ====================
const GREETING_REGEX = /^(hola|buen(as?|os)?\s*(noches?|tardes?|d[ií]as?)?|hey|informaper[uú]|caja\s*huancayo|hola\s+\w{1,15})$/i;
const QUERY_REGEX = /(pagar|quiero|deseo|como|puedo|podr[ií]a|debo|con\s*quien|que|horario|oficina|atencion|cuanto|deuda|saldo|reprogramar|cuando|donde)/i;
const PURE_NUMBER_REGEX = /^\d+$/;
const VALID_DOCUMENT_REGEX = /^(\d{8}|\d{11}|\d{18})$/;
const FOREIGN_DOC_REGEX = /(carnet|extranjero|extranjeria|no\s*soy\s*de|soy\s*extranjero)/i;
const NOT_QUERY_REGEX = /^(no|no\s*gracias|ah[ií]\s*n[o]?m[as]?s?|voy\s*a?\s*dar\s*despu[eé]s|luego|ya|ok|bueno)$/i;
const EXTRACT_NUMBERS_REGEX = /\d+/g;
const DOC_REFERENCE_REGEX = /(este\s*es\s*mi|mi\s*(dni|ruc|carnet|documento)|es\s*de\s*mi|no\s*es\s*mio|no\s*es\s*m[ií]o)/i;
const PROFANITY_REGEX = /(mierda|chucha|carajo|puta|idiota|estupid[oa]|imbecil|imbécil|pendej[oa]|huevon|huevón|cojud[oa]|maric[oó]n|cabr[oó]n|chinga|verga|cagar|concha|cojones|maldito|maldita|inutil|inútil|basura|porquer[ií]a|asquer[oa]|odio|muere|morir|hijo\s*de|hdp|ctm|ptm|csm|webón|webada|csmr|conchatumadre|malparido|gonorrea|hp)/i;
const GRATITUDE_REGEX = /(gracias|agradezco|agradecido|muy\s*amable|excelente|perfecto|entendido|ya\s*entend[ií]|vale|listo)/i;

const DEUDA_INTENT = /(detalle|ver|saber|informaci[oó]n).*(deuda|saldo|cuota|atraso|prestamo)/i;
const OFICINAS_INTENT = /(oficina|sucursal|atencion|atenci[oó]n|direccion|direcci[oó]n|donde|ir|cercana)/i;
const ASESOR_INTENT = /(asesor|humano|hablar|agente|comunicar|contactar|persona|ayuda)/i;

// ==================== MENU TEMPLATES ====================
function getMainMenu(name) {
    const messages = templates.mainMenuWithName(name);
    return Array.isArray(messages) ? messages.join('\n\n') : messages;
}
function getMenuOnly(name) {
    const messages = templates.menuOptions(name);
    return Array.isArray(messages) ? messages.join('\n\n') : messages;
}

// ==================== PHASE HANDLERS ====================
function isBlocked(session) {
    if (session.blockedUntil && Date.now() < session.blockedUntil) {
        return true;
    }
    if (session.blockedUntil && Date.now() >= session.blockedUntil) {
        session.blockedUntil = null;
        session.failedAttempts = 0;
    }
    return false;
}
function isQuery(text) {
    if (NOT_QUERY_REGEX.test(text)) return false;
    return QUERY_REGEX.test(text);
}
function extractNumbers(text) {
    const matches = text.match(EXTRACT_NUMBERS_REGEX);
    return matches || [];
}
async function validateAndFindClient(identifier, session, fromJid) {
    console.log(`🔍 Buscando cliente: ${identifier} (${identifier.length} dígitos)`);
    const result = await getClienteByDNI(identifier);
    if (result.success && result.cliente) {
        await saveToCache(fromJid, identifier, result.cliente);
        session.cachedClient = result.cliente;
        session.phase = 3;
        session.menuLevel = 'main';
        session.failedAttempts = 0;
        return { success: true, client: result.cliente };
    } else {
        session.failedAttempts++;
        console.log(`❌ Intento fallido ${session.failedAttempts}/${MAX_FAILED_ATTEMPTS}`);
        if (session.failedAttempts >= MAX_FAILED_ATTEMPTS) {
            session.blockedUntil = Date.now() + BLOCK_DURATION;
            return { success: false, blocked: true };
        }
        return { success: false, blocked: false };
    }
}

// ==================== MAIN FLOW ====================
async function runFlow(incomingText, fromJid) {
    const text = incomingText.trim();
    const lowText = text.toLowerCase();
    const session = getSession(fromJid);

    console.log(`\n📩 [${fromJid}] Mensaje: "${text}"`);

    // Check session timeout
    if (checkSessionTimeout(fromJid)) {
        return templates.sessionExpired();
    }

    // Verificar si está bloqueado
    if (isBlocked(session)) {
        return templates.tooManyAttempts();
    }

    // ==================== DETECCIÓN DE GROSERÍAS ====================
    if (PROFANITY_REGEX.test(lowText)) {
        console.log(`⚠️ [${fromJid}] Groserías detectadas`);
        return templates.profanityDetected();
    }

    // ==================== DETECCIÓN DE GRATITUD ====================
    if (GRATITUDE_REGEX.test(lowText)) {
        const name = session.cachedClient ? getClientName(session.cachedClient) : 'Cliente';
        console.log(`✨ [${fromJid}] Gratitud detectada`);
        return templates.gratitudeResponse(name);
    }

    // ==================== FASE 1 & 2: IDENTIFICACIÓN ====================
    if (session.phase < 3) {
        // Saludo o consulta inicial
        if (session.phase === 1 && (GREETING_REGEX.test(lowText) || isQuery(text))) {
            session.phase = 2;
            if (isQuery(text)) session.pendingQuery = text;
            return templates.greetingPhase1();
        }

        // Intento de identificación (números)
        const extractedNumbers = extractNumbers(text);
        const validIdentifier = extractedNumbers.find(num => num.length === 8 || num.length === 11 || num.length === 18);

        if (validIdentifier) {
            const result = await validateAndFindClient(validIdentifier, session, fromJid);
            if (result.blocked) return templates.tooManyAttempts();

            if (result.success) {
                const name = getClientName(result.client);
                const securityMessage = templates.securityInfo();
                const menuMessages = getMainMenu(name);

                return [
                    securityMessage,
                    ...(Array.isArray(menuMessages) ? menuMessages : [menuMessages])
                ];
            } else {
                return templates.clientNotFound();
            }
        }

        // Casos especiales en identificación
        if (FOREIGN_DOC_REGEX.test(text)) return templates.foreignDocumentSuggestion();
        if (NOT_QUERY_REGEX.test(text)) return templates.invalidDataNotQuery();

        // Formato DNI, Consulta
        const dniQueryMatch = text.match(/(\d{8})[,\s]+(.{5,})/);
        if (dniQueryMatch) {
            // Try to get client data if available
            const clientResult = await getClienteByDNI(dniQueryMatch[1]);
            const clientData = clientResult.success ? clientResult.cliente : null;
            await sendAdvisorEmail(dniQueryMatch[1], dniQueryMatch[2].trim(), clientData);
            return templates.advisorTransferConfirmVariant();
        }

        return templates.askForDocument();
    }

    // ==================== FASE 3: MENÚ CONTEXTUAL ====================
    if (session.phase === 3 && session.cachedClient) {
        const name = getClientName(session.cachedClient);
        const client = session.cachedClient;
        const cachedDni = client.DOCUMENTO || client.NRO_DNI || '';

        // Retorno al menú principal (0)
        if (text === '0') {
            session.menuLevel = 'main';
            return getMainMenu(name);
        }

        // Bloqueo por intentar ingresar otro DNI
        if (PURE_NUMBER_REGEX.test(text) && VALID_DOCUMENT_REGEX.test(text) && text !== cachedDni) {
            return templates.securityBlockOtherDocument();
        }

        // Lógica de Menú Principal
        if (session.menuLevel === 'main') {
            const option = parseInt(text);

            // Opción 1: Agencias y Deuda
            if (option === 1 || DEUDA_INTENT.test(lowText) || OFICINAS_INTENT.test(lowText)) {
                const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
                const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
                const diasAtraso = parseInt(client.DIAS_ATRASO || 0);
                const debtResponse = templates.debtSummary(name, saldoCapital, saldoCuota, diasAtraso);
                return Array.isArray(debtResponse) ? debtResponse : [debtResponse];
            }

            // Opción 2: Asesor
            if (option === 2 || ASESOR_INTENT.test(lowText)) {
                session.menuLevel = 'asesor_inicio';
                const messages = templates.advisorRequest();
                return Array.isArray(messages) ? messages.join('\n\n') : messages;
            }

            // Detección de opciones por texto ("opción 1", etc.)
            const optionMatch = text.match(/opci[oó]n\s*(\d)/i);
            if (optionMatch) {
                const extOpt = parseInt(optionMatch[1]);
                if (extOpt === 1) {
                    const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
                    const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
                    const diasAtraso = parseInt(client.DIAS_ATRASO || 0);
                    const debtResponse = templates.debtSummary(name, saldoCapital, saldoCuota, diasAtraso);
                    return Array.isArray(debtResponse) ? debtResponse : [debtResponse];
                }
                if (extOpt === 2) {
                    session.menuLevel = 'asesor_inicio';
                    return templates.advisorRequest();
                }
            }

            // Respuesta Directa (Consultas específicas sobre deuda sin menú)
            const CUOTA_REGEX = /(cuota|proxim[oa]\s*cuota|pago|fecha\s*pago|cuanto\s*debo\s*pagar)/i;
            const CAPITAL_REGEX = /(saldo\s*capital|total\s*deuda|monto\s*total)/i;
            const ATRASO_REGEX = /(dias?\s*atraso|mora|deuda\s*vencida)/i;

            if (CUOTA_REGEX.test(lowText) || CAPITAL_REGEX.test(lowText) || ATRASO_REGEX.test(lowText)) {
                const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
                const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
                const diasAtraso = parseInt(client.DIAS_ATRASO || 0);
                const debtResponse = templates.debtSummary(name, saldoCapital, saldoCuota, diasAtraso);
                return Array.isArray(debtResponse) ? debtResponse : [debtResponse];
            }

            // Búsqueda en FAQs
            if (isQuery(text)) {
                const faq = await sql.searchFAQ(text);
                if (faq) {
                    try {
                        const aiMsg = await getDeepseekResponse([
                            { role: 'system', content: `Eres Max, asistente de InformaPeru. Reformula amable para ${name}. Máx 2 oraciones.` },
                            { role: 'user', content: `Consulta: "${text}". Respuesta: "${faq.respuesta}"` }
                        ]);
                        return [aiMsg || faq.respuesta, "Escribe *0* para volver al menú principal 👈"];
                    } catch {
                        return [faq.respuesta, "Escribe *0* para volver al menú principal 👈"];
                    }
                }
            }

            return templates.outOfContextQuery();
        }

        // Lógica de Asesor
        if (session.menuLevel === 'asesor_inicio') {
            const numbers = extractNumbers(text);
            const dni = numbers.find(n => n.length === 8 || n.length === 11 || n.length === 18);
            if (dni) {
                const query = text.replace(dni, '').replace(/,/g, '').trim();
                if (query.length > 5) {
                    await sendAdvisorEmail(dni, query, session.cachedClient);
                    session.menuLevel = 'main';
                    return templates.advisorTransferConfirm();
                }
            }
            return templates.invalidDocumentForAdvisor();
        }
    }

    // ==================== AI FALLBACK ====================
    console.log('🤖 AI Fallback');
    const botContext = (process.env.BOT_CONTEXT || 'Eres Max, asistente de InformaPeru para Caja Huancayo.').replace(/\\n/g, '\n');
    let clientContext = '';
    if (session.cachedClient) {
        clientContext = `\n\nDATOS CLIENTE:\nDNI: ${session.cachedClient.NRO_DNI || 'N/A'}\nNombre: ${session.cachedClient.NOMBRE_CLIENTE || 'N/A'}\nSaldo: S/ ${session.cachedClient.SALDO_TOTAL || 0}`;
    }

    const messages = [
        { role: 'system', content: `${botContext}\n\nReglas:\n1. Solo datos propistos.\n2. Sé amable.${clientContext}` },
        ...session.conversationHistory,
        { role: 'user', content: text }
    ];

    try {
        const aiResponse = await getDeepseekResponse(messages);
        session.conversationHistory.push({ role: 'user', content: text }, { role: 'assistant', content: aiResponse });
        if (session.conversationHistory.length > 10) session.conversationHistory = session.conversationHistory.slice(-10);

        await saveConversacion({
            telefonoWhatsapp: fromJid,
            dniProporcionado: session.cachedClient?.NRO_DNI || null,
            mensajeCliente: text,
            respuestaBot: aiResponse,
            intent: 'AI_RESPONSE'
        });
        return aiResponse;
    } catch (err) {
        console.error('AI Error:', err.message);
        return templates.errorFallback();
    }
}

module.exports = { runFlow, isBotPaused, toggleBotPause, setOnSessionExpired };
