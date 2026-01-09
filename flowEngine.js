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
const SESSION_TIMEOUT = 120000; // 2 minutos en milisegundos
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
            menuLevel: 'main',           // main, deuda_submenu, oficinas, etc.
            pendingQuery: null,          // Consulta en cola de FASE 1
            failedAttempts: 0,           // Intentos fallidos de identificación
            blockedUntil: null,          // Timestamp de desbloqueo
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

// Cleanup inactive sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [jid, session] of sessions.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            clearSession(jid);
        }
    }
}, 60000);

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
    // Extraer primer nombre de formato "APELLIDO, NOMBRE"
    const parts = fullName.split(',');
    if (parts.length > 1) {
        return parts[1].trim().split(' ')[0];
    }
    return fullName.split(' ')[0];
}

// ==================== REGEX PATTERNS ====================

// Saludo simple: hola, buenas noches, informaperu, caja huancayo, hola + nombre
const GREETING_REGEX = /^(hola|buen(as?|os)?\s*(noches?|tardes?|d[ií]as?)?|hey|informaper[uú]|caja\s*huancayo|hola\s+\w{1,15})$/i;

// Consulta: palabras clave que indican una pregunta
const QUERY_REGEX = /(pagar|quiero|deseo|como|puedo|podr[ií]a|debo|con\s*quien|que|horario|oficina|atencion|cuanto|deuda|saldo|reprogramar|cuando|donde)/i;

// Número puro (solo dígitos)
const PURE_NUMBER_REGEX = /^\d+$/;

// Documento válido: 8 (DNI), 11 (RUC), 18 (Cuenta)
const VALID_DOCUMENT_REGEX = /^(\d{8}|\d{11}|\d{18})$/;

// Carnet de extranjería keywords
const FOREIGN_DOC_REGEX = /(carnet|extranjero|extranjeria|no\s*soy\s*de|soy\s*extranjero)/i;

// No es consulta - respuestas cortas/negativas
const NOT_QUERY_REGEX = /^(no|no\s*gracias|ah[ií]\s*n[o]?m[as]?s?|voy\s*a?\s*dar\s*despu[eé]s|luego|ya|ok|bueno)$/i;

// Extractor de números de texto alfanumérico
const EXTRACT_NUMBERS_REGEX = /\d+/g;

// Referencia a entregar documento
const DOC_REFERENCE_REGEX = /(este\s*es\s*mi|mi\s*(dni|ruc|carnet|documento)|es\s*de\s*mi|no\s*es\s*mio|no\s*es\s*m[ií]o)/i;

// Asesor keywords
const ADVISOR_REGEX = /(asesor|humano|hablar\s*con|agente|comunicarme|ayuda|persona\s*real)/i;

// ==================== MENU TEMPLATES ====================

function getMainMenu(name) {
    const messages = templates.mainMenuWithName(name);
    return Array.isArray(messages) ? messages.join('\n\n') : messages;
}

function getMenuOnly(name) {
    const messages = templates.menuOptions(name);
    return Array.isArray(messages) ? messages.join('\n\n') : messages;
}

function getDeudaSubmenu() {
    const messages = templates.debtDetailsMenu();
    return Array.isArray(messages) ? messages.join('\n\n') : messages;
}

// ==================== PHASE HANDLERS ====================

/**
 * Verificar si el usuario está bloqueado
 */
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

/**
 * Detectar si un texto es una consulta
 */
function isQuery(text) {
    if (NOT_QUERY_REGEX.test(text)) return false;
    return QUERY_REGEX.test(text);
}

/**
 * Extraer números de un texto alfanumérico
 */
function extractNumbers(text) {
    const matches = text.match(EXTRACT_NUMBERS_REGEX);
    return matches || [];
}

/**
 * Validar y buscar cliente por documento
 */
async function validateAndFindClient(identifier, session, fromJid) {
    console.log(`🔍 Buscando cliente: ${identifier} (${identifier.length} dígitos)`);

    const result = await getClienteByDNI(identifier);

    if (result.success && result.cliente) {
        // Cliente encontrado
        await saveToCache(fromJid, identifier, result.cliente);
        session.cachedClient = result.cliente;
        session.phase = 3;
        session.menuLevel = 'main';
        session.failedAttempts = 0;
        return { success: true, client: result.cliente };
    } else {
        // Cliente no encontrado
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

    console.log(`\n📩 [${fromJid}] Mensaje: "${text}"`);

    // Check session timeout
    if (checkSessionTimeout(fromJid)) {
        return templates.sessionExpired();
    }

    const session = getSession(fromJid);

    // Verificar si está bloqueado
    if (isBlocked(session)) {
        return templates.tooManyAttempts();
    }

    // ==================== FASE 1: SALUDO ====================
    if (session.phase === 1 && !session.cachedClient) {

        // Si es un saludo simple
        if (GREETING_REGEX.test(lowText)) {
            session.phase = 2;
            const messages = templates.greetingPhase1();
            return Array.isArray(messages) ? messages.join('\n\n') : messages;
        }

        // Si es una consulta (guardar en cola)
        if (isQuery(text)) {
            session.pendingQuery = text;
            session.phase = 2;
            const greetings = templates.greetingPhase1();
            return Array.isArray(greetings) ? greetings.join('\n\n') : greetings;
        }

        // Cualquier otro mensaje inicial -> pasar a FASE 2 pidiendo documento
        session.phase = 2;
        const messages = templates.greetingPhase1();
        return Array.isArray(messages) ? messages.join('\n\n') : messages;
    }

    // ==================== FASE 2: VALIDACIÓN ====================
    if (session.phase === 2 || (session.phase === 1 && !session.cachedClient)) {
        session.phase = 2; // Asegurar que estamos en FASE 2

        // CONDICIÓN 1: VALIDACIÓN NUMÉRICA (solo dígitos)
        if (PURE_NUMBER_REGEX.test(text)) {

            // Verificar longitud válida (8, 11 o 18 dígitos)
            if (VALID_DOCUMENT_REGEX.test(text)) {
                const result = await validateAndFindClient(text, session, fromJid);

                if (result.blocked) {
                    return templates.tooManyAttempts();
                }

                if (result.success) {
                    const name = getClientName(result.client);

                    // Si hay consulta pendiente, responderla primero
                    if (session.pendingQuery) {
                        const query = session.pendingQuery;
                        session.pendingQuery = null;
                        // Por ahora, mostrar menú. En futuro, procesar consulta con IA
                        return getMainMenu(name);
                    }

                    return getMainMenu(name);
                } else {
                    return templates.clientNotFound();
                }
            } else {
                // Número con longitud inválida
                return templates.invalidDocumentLength();
            }
        }

        // CONDICIÓN 2: VALIDACIÓN TEXTO
        if (!PURE_NUMBER_REGEX.test(text)) {

            // Verificar si menciona carnet de extranjería
            if (FOREIGN_DOC_REGEX.test(text)) {
                return templates.foreignDocumentSuggestion();
            }

            // Si es una consulta sin documento
            if (isQuery(text) && !DOC_REFERENCE_REGEX.test(text)) {
                // Consulta de nivel 3 (sin riesgo) - responder si hay info
                return templates.noInfoAvailable();
            }

            // Si no es consulta (respuesta negativa/inválida)
            if (NOT_QUERY_REGEX.test(text)) {
                return templates.invalidDataNotQuery();
            }

            // Texto que no es ni consulta ni respuesta clara
            return templates.invalidDataNotQuery();
        }

        // CONDICIÓN 3: VALIDACIÓN ALFANUMÉRICA
        const extractedNumbers = extractNumbers(text);

        if (extractedNumbers.length > 0) {
            // Buscar números con longitud válida
            const validNumbers = extractedNumbers.filter(num =>
                num.length === 8 || num.length === 11 || num.length === 18
            );

            if (validNumbers.length > 0) {
                // Usar el primer número válido encontrado
                const identifier = validNumbers[0];
                const result = await validateAndFindClient(identifier, session, fromJid);

                if (result.blocked) {
                    return templates.tooManyAttempts();
                }

                if (result.success) {
                    const name = getClientName(result.client);
                    return getMainMenu(name);
                } else {
                    return templates.clientNotFound();
                }
            } else {
                // Hay números pero ninguno con longitud válida
                return templates.invalidDocumentLength();
            }
        }

        // Sin números encontrados
        return templates.invalidDataNotQuery();
    }

    // ==================== FASE 3: MENÚ CONTEXTUAL ====================
    if (session.phase === 3 && session.cachedClient) {
        const name = getClientName(session.cachedClient);
        const client = session.cachedClient;

        // SEGURIDAD: Si intenta ingresar otro documento (8, 11 o 18 dígitos)
        if (PURE_NUMBER_REGEX.test(text) && VALID_DOCUMENT_REGEX.test(text)) {
            return templates.securityBlockOtherDocument();
        }

        // MENÚ PRINCIPAL
        if (session.menuLevel === 'main') {
            const option = parseInt(text);

            if (option === 1) {
                session.menuLevel = 'deuda_submenu';
                return getDeudaSubmenu();
            }
            if (option === 2) {
                session.menuLevel = 'oficinas';
                const officeMessages = templates.officesInfo();
                return Array.isArray(officeMessages) ? officeMessages.join('\n\n') : officeMessages;
            }
            if (option === 3) {
                session.menuLevel = 'telefono';
                const msg = templates.updatePhoneUnavailable();
                return msg;
            }
            if (option === 4) {
                session.menuLevel = 'asesor_inicio';
                const advisorMessages = templates.advisorRequest();
                return Array.isArray(advisorMessages) ? advisorMessages.join('\n\n') : advisorMessages;
            }

            // Si es texto, evaluar si es consulta
            if (isNaN(option)) {
                // Es texto, verificar si menciona opciones como "opción 4"
                const optionMatch = text.match(/opci[oó]n\s*(\d)/i);
                if (optionMatch) {
                    const extractedOption = parseInt(optionMatch[1]);
                    if (extractedOption >= 1 && extractedOption <= 4) {
                        // Simular que escribió el número
                        if (extractedOption === 1) {
                            session.menuLevel = 'deuda_submenu';
                            return getDeudaSubmenu();
                        }
                        if (extractedOption === 2) {
                            session.menuLevel = 'oficinas';
                            const officeMessages = templates.officesInfo();
                            return Array.isArray(officeMessages) ? officeMessages.join('\n\n') : officeMessages;
                        }
                        if (extractedOption === 3) {
                            return templates.updatePhoneUnavailable();
                        }
                        if (extractedOption === 4) {
                            session.menuLevel = 'asesor_inicio';
                            const advisorMessages = templates.advisorRequest();
                            return Array.isArray(advisorMessages) ? advisorMessages.join('\n\n') : advisorMessages;
                        }
                    }
                }

                // Es una consulta en texto libre
                if (isQuery(text)) {
                    // Por ahora usar IA para responder
                    // Futuro: buscar en tabla de consultas predeterminadas
                }

                return templates.invalidMenuOption();
            }

            // Número fuera de rango 1-4
            return templates.invalidMenuOption();
        }

        // SUBMENÚ DEUDA
        if (session.menuLevel === 'deuda_submenu') {
            const option = parseInt(text);

            if (option === 1) {
                const saldoCapital = parseFloat(client.SALDO_CAPITAL || client.SALDO_CUOTA || client.SALDO_TOTAL || 0).toFixed(2);
                return templates.debtSaldoCapital(saldoCapital);
            }
            if (option === 2) {
                const totalCuota = calculateSaldoCuota(client);
                return templates.debtCuotaPendiente(totalCuota);
            }
            if (option === 3) {
                const diasAtraso = client.DIAS_ATRASO || 0;
                return templates.debtDiasAtraso(diasAtraso);
            }
            if (option === 4 || option === 0) {
                // Regresar al menú principal
                session.menuLevel = 'main';
                return getMenuOnly(name);
            }

            return templates.invalidDebtOption();
        }

        // VOLVER AL MENÚ (0 desde cualquier submenú)
        if (text === '0') {
            if (['oficinas', 'telefono', 'asesor_inicio', 'asesor_esperando'].includes(session.menuLevel)) {
                session.menuLevel = 'main';
                return getMenuOnly(name);
            }
        }

        // MENÚ OFICINAS
        if (session.menuLevel === 'oficinas') {
            if (text === '0') {
                session.menuLevel = 'main';
                return getMenuOnly(name);
            }
            // Cualquier otra respuesta, volver a mostrar oficinas
            const officeMessages = templates.officesInfo();
            return Array.isArray(officeMessages) ? officeMessages.join('\n\n') : officeMessages;
        }

        // ASESOR - Esperando DNI + Consulta
        if (session.menuLevel === 'asesor_inicio') {
            if (text === '0') {
                session.menuLevel = 'main';
                return getMenuOnly(name);
            }

            // Verificar si contiene documento válido + consulta
            const numbers = extractNumbers(text);
            const validDoc = numbers.find(n => n.length === 8 || n.length === 11 || n.length === 18);

            if (validDoc) {
                // Tiene documento válido, enviar a asesor
                const dni = validDoc;
                const query = text.replace(validDoc, '').replace(/,/g, '').trim();

                if (query.length > 5) {
                    await sendAdvisorEmail(dni, query);
                    session.menuLevel = 'main';
                    const confirmMessages = templates.advisorTransferConfirm();
                    return Array.isArray(confirmMessages) ? confirmMessages.join('\n\n') : confirmMessages;
                }
            }

            return templates.invalidDocumentForAdvisor();
        }

        // SOLICITUD DE ASESOR (keyword en cualquier momento)
        if (ADVISOR_REGEX.test(lowText)) {
            session.menuLevel = 'asesor_inicio';
            const advisorMessages = templates.advisorRequest();
            return Array.isArray(advisorMessages) ? advisorMessages.join('\n\n') : advisorMessages;
        }
    }

    // ==================== AI FALLBACK ====================
    console.log('🤖 AI Fallback');

    const botContext = (process.env.BOT_CONTEXT || 'Eres Max, asistente virtual de InformaPeru para Caja Huancayo.').replace(/\\n/g, '\n');

    let clientContext = '';
    if (session.cachedClient) {
        clientContext = `\n\nDATOS DEL CLIENTE:
DNI: ${session.cachedClient.NRO_DNI || session.cachedClient.DOCUMENTO || 'N/A'}
Nombre: ${session.cachedClient.NOMBRE_CLIENTE || session.cachedClient.CLIENTE_PREMIUM || 'N/A'}
Saldo Total: S/ ${session.cachedClient.SALDO_TOTAL || 0}
Cuota a Pagar: S/ ${calculateSaldoCuota(session.cachedClient)}
Días Atraso: ${session.cachedClient.DIAS_ATRASO || 0}`;
    }

    const messages = [
        {
            role: 'system',
            content: `${botContext}\n\nREGLAS:\n1. Usa SOLO los datos proporcionados.\n2. Si no hay DNI, solicítalo.\n3. Sé amable y formal.${clientContext}`
        },
        ...session.conversationHistory,
        { role: 'user', content: text }
    ];

    try {
        let aiResponse = await getDeepseekResponse(messages);

        session.conversationHistory.push({ role: 'user', content: text });
        session.conversationHistory.push({ role: 'assistant', content: aiResponse });

        if (session.conversationHistory.length > 10) {
            session.conversationHistory = session.conversationHistory.slice(-10);
        }

        await saveConversacion({
            telefonoWhatsapp: fromJid,
            dniProporcionado: session.cachedClient?.NRO_DNI || session.cachedClient?.DOCUMENTO || null,
            mensajeCliente: text,
            respuestaBot: aiResponse,
            intent: 'AI_RESPONSE'
        });

        return aiResponse;
    } catch (err) {
        console.error('Error calling AI:', err.message);
        return templates.errorFallback();
    }
}

module.exports = { runFlow, isBotPaused, toggleBotPause };
