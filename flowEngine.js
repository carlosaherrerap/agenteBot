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
const ADVISOR_REGEX = /(asesor|humano|hablar\s*con|agente|comunicarme|ayuda|persona\s*real)/i;

// Profanity and insult detection - common Spanish insults and profanity
const PROFANITY_REGEX = /(mierda|chucha|carajo|puta|idiota|estupid[oa]|imbecil|imbécil|pendej[oa]|huevon|huevón|cojud[oa]|maric[oó]n|cabr[oó]n|chinga|verga|cagar|concha|cojones|maldito|maldita|inutil|inútil|basura|porquer[ií]a|asquer[oa]|odio|muere|morir|hijo\s*de|hdp|ctm|ptm|csm|webón|webada|csmr|conchatumadre|malparido|gonorrea|hp)/i;
const GRATITUDE_REGEX = /^(gracias|muchas\s*gracias|agradezco|ok\s*gracias|entendido|ya\s*entend[ií]|vale\s*gracias|listo\s*gracias|excelente|perfecto|muy\s*amable)$/i;

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
    const messages = templates.debtSubmenu();
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

    // ==================== DETECCIÓN DE GROSERÍAS ====================
    if (PROFANITY_REGEX.test(lowText)) {
        console.log(`⚠️ [${fromJid}] Groserías detectadas en: "${text}"`);
        return templates.profanityDetected();
    }

    // ==================== DETECCIÓN DE GRATITUD ====================
    if (GRATITUDE_REGEX.test(lowText)) {
        const name = session.cachedClient ? getClientName(session.cachedClient) : 'Cliente';
        console.log(`✨ [${fromJid}] Gratitud detectada`);
        return templates.gratitudeResponse(name);
    }

    // ==================== FASE 1: SALUDO ====================
    if (session.phase === 1 && !session.cachedClient) {
        if (GREETING_REGEX.test(lowText)) {
            session.phase = 2;
            const messages = templates.greetingPhase1();
            return Array.isArray(messages) ? messages.join('\n\n') : messages;
        }
        if (isQuery(text)) {
            session.pendingQuery = text;
            session.phase = 2;
            const greetings = templates.greetingPhase1();
            return Array.isArray(greetings) ? greetings.join('\n\n') : greetings;
        }
        session.phase = 2;
        const messages = templates.greetingPhase1();
        return Array.isArray(messages) ? messages.join('\n\n') : messages;
    }
    // ==================== FASE 2: VALIDACIÓN ====================
    if (session.phase === 2 || (session.phase === 1 && !session.cachedClient)) {
        session.phase = 2;
        if (PURE_NUMBER_REGEX.test(text)) {
            if (VALID_DOCUMENT_REGEX.test(text)) {
                const result = await validateAndFindClient(text, session, fromJid);
                // Log client object for debugging
                if (result.success && result.client) {
                    console.log('🔎 Cliente encontrado:', result.client);
                }
                if (result.blocked) {
                    return templates.tooManyAttempts();
                }
                // Security check: prevent querying another document in phase 2
                if (session.phase === 2 && /otro\s+dni/i.test(text)) {
                    return templates.securityBlockOtherDocumentPhase2();
                }
                if (result.success) {
                    const name = getClientName(result.client);
                    if (session.pendingQuery) {
                        const query = session.pendingQuery;
                        session.pendingQuery = null;
                        return getMainMenu(name);
                    }
                    return getMainMenu(name);
                } else {
                    return templates.clientNotFound();
                }
            } else {
                return templates.invalidDocumentLength();
            }
        }
        // Si no es un número puro, intentar extraer números del texto
        // Ej: "mi dni es 73321164" o "si mi numero de dni es 73321164"
        const extractedNumbers = extractNumbers(text);
        if (extractedNumbers.length > 0) {
            const validNumbers = extractedNumbers.filter(num => num.length === 8 || num.length === 11 || num.length === 18);
            if (validNumbers.length > 0) {
                const identifier = validNumbers[0];
                console.log(`🔍 Número extraído del texto: ${identifier}`);
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
            }
        }
        // Si no hay números válidos, verificar otros casos
        if (!PURE_NUMBER_REGEX.test(text)) {
            // ==================== DETECCIÓN DE FORMATO "DNI, CONSULTA" ====================
            // Ejemplo: "12345678, quiero pagar mi deuda" o "75747335 necesito reprogramar"
            const dniQueryMatch = text.match(/(\d{8})[,\s]+(.{5,})/);
            if (dniQueryMatch) {
                const dni = dniQueryMatch[1];
                const query = dniQueryMatch[2].trim();
                console.log(`📧 DNI + Consulta detectado: DNI=${dni}, Query="${query}"`);

                // Enviar correo al asesor
                await sendAdvisorEmail(dni, query);

                // Retornar confirmación
                return templates.advisorTransferConfirmVariant();
            }

            if (FOREIGN_DOC_REGEX.test(text)) {
                return templates.foreignDocumentSuggestion();
            }
            if (isQuery(text) && !DOC_REFERENCE_REGEX.test(text)) {
                return templates.noInfoAvailable();
            }
            if (NOT_QUERY_REGEX.test(text)) {
                return templates.invalidDataNotQuery();
            }
            return templates.askForDocument();
        }
        return templates.askForDocument();
    }
    // ==================== FASE 3: MENÚ CONTEXTUAL ====================
    if (session.phase === 3 && session.cachedClient) {
        const name = getClientName(session.cachedClient);
        const client = session.cachedClient;
        const cachedDni = client.DOCUMENTO || client.NRO_DNI || '';

        // ==================== RETORNO AL MENÚ PRINCIPAL (0) ====================
        // Desde cualquier submenú, el "0" siempre regresa al menú principal
        if (text === '0') {
            session.menuLevel = 'main';
            return getMainMenu(name);
        }

        // SEGURIDAD: Si intenta ingresar OTRO documento (diferente al que está en caché)
        if (PURE_NUMBER_REGEX.test(text) && VALID_DOCUMENT_REGEX.test(text)) {
            // Permitir si es el mismo DNI que está en caché
            if (text === cachedDni) {
                // Es el mismo DNI, simplemente mostrar el menú nuevamente
                return getMainMenu(name);
            }
            // Es otro DNI, bloquear por seguridad
            return templates.securityBlockOtherDocument();
        }
        // MENÚ PRINCIPAL
        if (session.menuLevel === 'main') {
            const option = parseInt(text);
            if (option === 1) {
                const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
                const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
                const diasAtraso = parseInt(client.DIAS_ATRASO || 0);
                return templates.debtSummary(saldoCapital, saldoCuota, diasAtraso);
            }
            if (option === 2) {
                session.menuLevel = 'oficinas';
                const officeMessages = templates.officesInfo();
                return Array.isArray(officeMessages) ? officeMessages.join('\n\n') : officeMessages;
            }
            if (option === 3) {
                session.menuLevel = 'telefono';
                const phoneMessages = templates.updatePhoneRequest();
                return Array.isArray(phoneMessages) ? phoneMessages : [phoneMessages];
            }
            if (option === 4) {
                session.menuLevel = 'asesor_inicio';
                const advisorMessages = templates.advisorRequest();
                return Array.isArray(advisorMessages) ? advisorMessages.join('\n\n') : advisorMessages;
            }
            if (isNaN(option)) {
                const optionMatch = text.match(/opci[oó]n\s*(\d)/i);
                if (optionMatch) {
                    const extractedOption = parseInt(optionMatch[1]);
                    if (extractedOption >= 1 && extractedOption <= 4) {
                        if (extractedOption === 1) {
                            const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
                            const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
                            const diasAtraso = parseInt(client.DIAS_ATRASO || 0);
                            return templates.debtSummary(saldoCapital, saldoCuota, diasAtraso);
                        }
                        if (extractedOption === 2) {
                            session.menuLevel = 'oficinas';
                            const officeMessages = templates.officesInfo();
                            return Array.isArray(officeMessages) ? officeMessages.join('\n\n') : officeMessages;
                        }
                        if (extractedOption === 3) {
                            session.menuLevel = 'telefono';
                            const phoneMessages = templates.updatePhoneRequest();
                            return Array.isArray(phoneMessages) ? phoneMessages : [phoneMessages];
                        }
                        if (extractedOption === 4) {
                            session.menuLevel = 'asesor_inicio';
                            const advisorMessages = templates.advisorRequest();
                            return Array.isArray(advisorMessages) ? advisorMessages.join('\n\n') : advisorMessages;
                        }
                    }
                }

                // ==================== DETECCIÓN DE INTENCIÓN POR TEXTO ====================
                // Si el usuario escribe texto que corresponde a opciones del menú
                const DEUDA_INTENT = /(detalle|ver|saber|informaci[oó]n).*(deuda|saldo|cuota|atraso|prestamo)/i;
                const OFICINAS_INTENT = /(oficina|sucursal|atencion|atenci[oó]n|direccion|direcci[oó]n|donde|ir|cercana)/i;
                const TELEFONO_INTENT = /(actualizar|cambiar|modificar).*(tel[eé]fono|celular|n[uú]mero)/i;
                const ASESOR_INTENT = /(asesor|humano|hablar|agente|comunicar|contactar|persona|ayuda)/i;

                // Opción 4: Asesor
                if (ASESOR_INTENT.test(lowText)) {
                    session.menuLevel = 'asesor_inicio';
                    return templates.advisorRequest();
                }

                // Opción 2: Oficinas
                if (OFICINAS_INTENT.test(lowText)) {
                    session.menuLevel = 'oficinas';
                    return templates.officesInfo();
                }

                // Opción 3: Teléfono
                if (TELEFONO_INTENT.test(lowText)) {
                    session.menuLevel = 'telefono';
                    return templates.updatePhoneRequest();
                }

                // Opción 1: Deuda (detectar antes de datos específicos)
                if (DEUDA_INTENT.test(lowText)) {
                    const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
                    const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
                    const diasAtraso = parseInt(client.DIAS_ATRASO || 0);
                    return templates.debtSummary(saldoCapital, saldoCuota, diasAtraso);
                }

                // ==================== RESPUESTA DIRECTA CON DATOS DEL CLIENTE ====================
                // IMPORTANTE: CUOTA se evalúa PRIMERO porque "cuanto debo pagar" se refiere a cuota, no saldo capital

                // Detectar consultas sobre cuota pendiente / próximo pago
                // Palabras clave: pagar, siguiente pago, próxima cuota, fecha de pago
                const CUOTA_REGEX = /(cuota|proxim[oa]\s*(cuota|pago|fecha)|siguiente\s*(pago|cuota)|fecha\s*(de\s*)?pago|debo\s*(de\s*)?pagar|cuanto\s*(debo\s*)?(de\s*)?pagar|pago\s*mensual)/i;

                // Detectar consultas sobre saldo capital/préstamo total
                // Palabras clave: saldo capital, préstamo total, deuda total, cuanto debo (sin "pagar")
                const SALDO_CAPITAL_REGEX = /(saldo\s*capital|capital|prestamo|pr[eé]stamo\s*(total|inicial)?|deuda\s*total|monto\s*(total|prestamo)|cuanto\s*es\s*mi\s*deuda)/i;

                // Detectar consultas sobre días de atraso/mora
                const ATRASO_REGEX = /(dias?\s*(de\s*)?(atraso|mora)|atrasad[oa]|morosidad|a\s*tiempo|cuando\s*(deb[ií]|ten[ií]a\s*que)\s*pagar|cuantos?\s*dias?)/i;

                // CUOTA se evalúa primero (cuando hay intención de pagar)
                if (CUOTA_REGEX.test(lowText)) {
                    const cuotaPendiente = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
                    return [
                        `${name}, tu *Cuota Pendiente* a pagar es: *S/ ${cuotaPendiente}* 📅`,
                        `Escribe *0* para volver al menú principal 👈`
                    ];
                }

                // SALDO CAPITAL (préstamo total)
                if (SALDO_CAPITAL_REGEX.test(lowText)) {
                    const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
                    return [
                        `${name}, tu *Saldo Capital* (préstamo total) es: *S/ ${saldoCapital}* 💰`,
                        `Escribe *0* para volver al menú principal 👈`
                    ];
                }


                if (ATRASO_REGEX.test(lowText)) {
                    const diasAtraso = parseInt(client.DIAS_ATRASO || 0);
                    if (diasAtraso > 0) {
                        // Calcular fecha que debió pagar
                        const hoy = new Date();
                        const fechaPago = new Date(hoy);
                        fechaPago.setDate(hoy.getDate() - diasAtraso);
                        const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                        const fechaFormateada = fechaPago.toLocaleDateString('es-PE', opciones);
                        return [
                            `${name}, tienes *${diasAtraso} días de atraso* ⏰`,
                            `Tu fecha de pago fue el *${fechaFormateada}*. Te recomendamos regularizar tu situación lo antes posible.`,
                            `Escribe *0* para volver al menú principal 👈`
                        ];
                    } else {
                        return [
                            `${name}, ¡estás al día! 🎉 No tienes días de atraso.`,
                            `Escribe *0* para volver al menú principal 👈`
                        ];
                    }
                }

                // Buscar en FAQs cuando el usuario escribe una consulta
                if (isQuery(text)) {
                    const faq = await sql.searchFAQ(text);

                    if (faq) {
                        // FAQ encontrado - mejorar respuesta con IA
                        try {
                            const improvedResponse = await getDeepseekResponse([
                                {
                                    role: 'system',
                                    content: `Eres Max, asistente virtual de InformaPeru. Reformula esta respuesta de forma amable y personalizada para el cliente ${name}. Mantén el contenido pero hazlo conversacional. Máximo 2 oraciones.`
                                },
                                { role: 'user', content: `Consulta: "${text}". Respuesta base: "${faq.respuesta}"` }
                            ]);
                            return [
                                improvedResponse || faq.respuesta,
                                `Escribe *0* para volver al menú principal 🔙`
                            ];
                        } catch (err) {
                            // Si falla la IA, usar respuesta base
                            return [
                                faq.respuesta,
                                `Escribe *0* para volver al menú principal 🔙`
                            ];
                        }
                    } else {
                        // No hay FAQ - derivar a asesor
                        session.menuLevel = 'asesor_inicio';
                        return [
                            `Entiendo tu consulta 🤔 Para darte una respuesta más precisa, te voy a derivar con un asesor personalizado.`,
                            `Por favor, escribe tu *DNI* y tu *consulta breve* en un solo mensaje.`,
                            `Ejemplo: *12345678, quiero reprogramar mi cuota*`,
                            `Escribe *0* para volver al menú principal 👈`
                        ];
                    }
                }
                // Preguntas fuera de contexto - mostrar menú
                return templates.outOfContextQuery();
            }
            return templates.outOfContextQuery();
        }
        // SUBMENÚ DEUDA
        if (session.menuLevel === 'deuda_submenu') {
            const option = parseInt(text);
            if (option === 1) {
                const saldoCapital = parseFloat(client.SALDO_CAPITAL || client.SALDO_CUOTA || client.SALDO_TOTAL || 0).toFixed(2);
                return templates.debtSaldoCapital(saldoCapital);
            }
            if (option === 2) {
                const saldoCuota = client.SALDO_CUOTA || 0;
                return templates.debtCuotaPendiente(saldoCuota);
            }
            if (option === 3) {
                const diasAtraso = client.DIAS_ATRASO || 0;
                return templates.debtDiasAtraso(diasAtraso);
            }
            if (option === 4 || option === 0) {
                session.menuLevel = 'main';
                return getMenuOnly(name);
            }

            // Si no es un número, buscar en FAQs
            if (isNaN(option) && isQuery(text)) {
                const faq = await sql.searchFAQ(text);

                if (faq) {
                    // FAQ encontrado - responder con FAQ + opción de asesor
                    return [
                        faq.respuesta,
                        `Si deseas puedes ponerte en contacto con un asesor escribiendo tu DNI y una consulta breve.`,
                        `Ejemplo: *"12345678, necesito saber como pagar"* 📝`,
                        `Escribe *0* para volver al menú principal 👈`
                    ];
                } else {
                    // No hay FAQ - ofrecer asesor
                    session.menuLevel = 'asesor_inicio';
                    return [
                        `Entiendo tu consulta 🤔 Para darte una respuesta más precisa, te voy a derivar con un asesor.`,
                        `Escribe tu *DNI* y *consulta breve* en un solo mensaje.`,
                        `Ejemplo: *"12345678, quiero reprogramar mi deuda"*`,
                        `Escribe *0* para volver al menú principal 👈`
                    ];
                }
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
        // MENÚ OFICINAS - Permite seleccionar opciones del menú principal directamente
        if (session.menuLevel === 'oficinas') {
            if (text === '0') {
                session.menuLevel = 'main';
                return getMenuOnly(name);
            }
            // Permitir seleccionar opciones del menú principal desde aquí
            const menuOption = parseInt(text);
            if (menuOption >= 1 && menuOption <= 4) {
                session.menuLevel = 'main';
                // Re-procesar como si estuviera en menú principal
                if (menuOption === 1) {
                    const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
                    const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
                    const diasAtraso = parseInt(client.DIAS_ATRASO || 0);
                    return templates.debtSummary(saldoCapital, saldoCuota, diasAtraso);
                }
                if (menuOption === 2) {
                    const officeMessages = templates.officesInfo();
                    return Array.isArray(officeMessages) ? officeMessages : [officeMessages];
                }
                if (menuOption === 3) {
                    session.menuLevel = 'telefono';
                    const phoneMessages = templates.updatePhoneRequest();
                    return Array.isArray(phoneMessages) ? phoneMessages : [phoneMessages];
                }
                if (menuOption === 4) {
                    session.menuLevel = 'asesor_inicio';
                    const advisorMessages = templates.advisorRequest();
                    return Array.isArray(advisorMessages) ? advisorMessages : [advisorMessages];
                }
            }
            // Si no es opción válida, repetir info de oficinas
            const officeMessages = templates.officesInfo();
            return Array.isArray(officeMessages) ? officeMessages : [officeMessages];
        }
        // MENÚ TELÉFONO - Permite seleccionar opciones del menú principal directamente
        if (session.menuLevel === 'telefono') {
            if (text === '0') {
                session.menuLevel = 'main';
                return getMenuOnly(name);
            }
            // Permitir seleccionar opciones del menú principal desde aquí
            const menuOption = parseInt(text);
            if (menuOption >= 1 && menuOption <= 4) {
                session.menuLevel = 'main';
                if (menuOption === 1) {
                    const saldoCapital = parseFloat(client.SALDO_CAPITAL || 0).toFixed(2);
                    const saldoCuota = parseFloat(client.SALDO_CUOTA || 0).toFixed(2);
                    const diasAtraso = parseInt(client.DIAS_ATRASO || 0);
                    return templates.debtSummary(saldoCapital, saldoCuota, diasAtraso);
                }
                if (menuOption === 2) {
                    session.menuLevel = 'oficinas';
                    const officeMessages = templates.officesInfo();
                    return Array.isArray(officeMessages) ? officeMessages : [officeMessages];
                }
                if (menuOption === 3) {
                    const phoneMessages = templates.updatePhoneRequest();
                    return Array.isArray(phoneMessages) ? phoneMessages : [phoneMessages];
                }
                if (menuOption === 4) {
                    session.menuLevel = 'asesor_inicio';
                    const advisorMessages = templates.advisorRequest();
                    return Array.isArray(advisorMessages) ? advisorMessages : [advisorMessages];
                }
            }
            // Si no es opción válida, sugerir volver al menú
            return templates.invalidOptionGoBack();
        }
        // ASESOR - Esperando DNI + Consulta
        if (session.menuLevel === 'asesor_inicio') {
            if (text === '0') {
                session.menuLevel = 'main';
                return getMenuOnly(name);
            }
            const numbers = extractNumbers(text);
            const validDoc = numbers.find(n => n.length === 8 || n.length === 11 || n.length === 18);
            if (validDoc) {
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
        clientContext = `\n\nDATOS DEL CLIENTE:\nDNI: ${session.cachedClient.NRO_DNI || session.cachedClient.DOCUMENTO || 'N/A'}\nNombre: ${session.cachedClient.NOMBRE_CLIENTE || session.cachedClient.CLIENTE_PREMIUM || 'N/A'}\nSaldo Total: S/ ${session.cachedClient.SALDO_TOTAL || 0}\nCuota a Pagar: S/ ${calculateSaldoCuota(session.cachedClient)}\nDías Atraso: ${session.cachedClient.DIAS_ATRASO || 0}`;
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

module.exports = { runFlow, isBotPaused, toggleBotPause, setOnSessionExpired };
