const axios = require('axios');
const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const { sendMessage } = require('./utils/whatsapp');
const { getClienteByDNI, getDeudasByDNI, getOficinas, saveConversacion, formatDeudaInfo } = require('./services/database');
const sql = require('./utils/sqlServer');
const fs = require('fs');
const path = require('path');
const cache = new Map(); // simple in‑memory cache

// ==================== CONVERSATION MEMORY ====================
// Store conversation history per user (key = fromJid)
const conversationHistory = new Map();

// ==================== BOT PAUSE CONTROL ====================
// Set of JIDs where bot is paused (human takes over)
const pausedChats = new Set();

/**
 * Check if bot is paused for a specific chat
 */
function isBotPaused(jid) {
    return pausedChats.has(jid);
}

/**
 * Toggle bot pause status for a chat
 * @returns {boolean} New pause status (true = paused)
 */
function toggleBotPause(jid) {
    if (pausedChats.has(jid)) {
        pausedChats.delete(jid);
        return false;
    } else {
        pausedChats.add(jid);
        return true;
    }
}

// Load infoDb.txt once at startup
const infoDbPath = path.resolve(__dirname, 'infoDb.txt');
let infoDbContent = '';
if (fs.existsSync(infoDbPath)) {
    infoDbContent = fs.readFileSync(infoDbPath, 'utf8');
}

/**
 * Parse the infoDb.txt content into a key/value object.
 * Expected format: each line "FIELD: value"
 */
function parseInfoDb(content) {
    const obj = {};
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx > -1) {
            const key = line.slice(0, idx).trim();
            const value = line.slice(idx + 1).trim();
            obj[key] = value;
        }
    }
    return obj;
}

const infoDb = parseInfoDb(infoDbContent);

/**
 * Generate answers based on infoDb fields for common queries.
 */
function answerFromInfoDb(question, info) {
    const q = question.toLowerCase();
    // Greeting with name
    if (q.includes('hola') || q.includes('buenas')) {
        const fullName = info['CLIENTE_PREMIUM'] || '';
        const firstPart = fullName.split(',')[0].trim();
        const secondPart = fullName.split(',')[1] ? fullName.split(',')[1].trim() : '';
        const nameToUse = secondPart ? secondPart.split(' ')[0] : firstPart.split(' ')[0];
        return `Hola ${nameToUse}! 👋`;
    }
    // Saldo cuota
    if (q.includes('saldo')) {
        return `El saldo de la cuota es S/ ${info['SALDO_CUOTA'] || '0'}.`;
    }
    // Cuotas pendientes
    if (q.includes('cuotas') && q.includes('pendientes')) {
        return `Le quedan ${info['CUOTAS_PENDIENTES'] || '0'} cuotas por pagar.`;
    }
    // Cuotas pagadas
    if (q.includes('cuotas') && q.includes('pagadas')) {
        return `Ha pagado ${info['CUOTAS_PAGADAS'] || '0'} cuotas.`;
    }
    // Último pago
    if (q.includes('último') && q.includes('pago')) {
        return `Su último pago fue el ${info['UTLIMO_PAGO'] || 'desconocido'}.`;
    }
    // Días de atraso
    if (q.includes('atraso')) {
        return `Tiene ${info['DIAS_ATRASO'] || '0'} días de atraso.`;
    }
    // Vencimiento próximo
    if (q.includes('vence') || q.includes('plazo')) {
        const max = parseInt(info['ATRASO_MAXIMO'] || '0', 10);
        const atraso = parseInt(info['DIAS_ATRASO'] || '0', 10);
        const remaining = Math.max(max - atraso, 0);
        const today = new Date();
        const vencDate = new Date(today.getTime() + remaining * 24 * 60 * 60 * 1000);
        const dd = String(vencDate.getDate()).padStart(2, '0');
        const mm = String(vencDate.getMonth() + 1).padStart(2, '0');
        const yy = vencDate.getFullYear();
        return `Le quedan ${remaining} día(s) de plazo. Vence el ${dd}/${mm}/${yy}.`;
    }
    // Oficina cercana
    if (q.includes('oficina') || q.includes('cerca')) {
        const dept = info['DEPARTAMENTO_CLIENTE'];
        const agencia = info['AGENCIA'];
        if (dept && agencia) {
            return `La oficina más cercana en ${dept}-${agencia} es la de Caja Huancayo en esa zona.`;
        }
    }
    return null;
}


const infoDbGuide = infoDbContent; // Store the raw guide for the AI

/**
 * Fetch client data from SQL Server by DNI, RUC or Account
 */
async function getClientData(identifier) {
    if (!identifier) return null;
    try {
        // Try DNI (8 digits), RUC (11 digits) or Account (various)
        const rows = await sql.query(
            `SELECT * FROM Huancayo.Base 
             WHERE NRO_DNI = @p0 
             OR NRO_RUC = @p0 
             OR CUENTA_CREDITO = @p0`,
            [identifier]
        );
        return rows.length ? rows[0] : null;
    } catch (err) {
        console.error('Error fetching client data from SQL:', err.message);
        return null;
    }
}

/**
 * Generate answers based on infoDb fields for common queries.
 */
function answerFromInfoDb(question, client) {
    if (!client) return null;
    const q = question.toLowerCase();

    // Greeting with name
    if (q.includes('hola') || q.includes('buenas')) {
        const fullName = client['CLIENTE_PREMIUM'] || '';
        // Format: URETA VALERIO, VIVIAN CAROLAY
        const parts = fullName.split(',');
        if (parts.length < 2) return `Hola ${fullName.split(' ')[0]}! 👋`;

        const namesPart = parts[1].trim();
        const names = namesPart.split(' ');
        // Use first name or both if second exists
        const nameToUse = names.length >= 2 ? `${names[0]} ${names[1]}` : names[0];
        return `Hola ${nameToUse}! 👋`;
    }

    // Debt balance
    if (q.includes('saldo') || q.includes('cuanto debo') || q.includes('monto')) {
        return `El saldo de tu cuota es S/ ${client['SALDO_CUOTA'] || '0'}.`;
    }

    // Pending installments
    if (q.includes('cuotas') && (q.includes('falta') || q.includes('pendiente'))) {
        return `Te faltan pagar ${client['CUOTAS_PENDIENTES'] || '0'} cuotas.`;
    }

    // Paid installments
    if (q.includes('cuotas') && (q.includes('pagué') || q.includes('pagó') || q.includes('pagadas'))) {
        return `Ya has pagado ${client['CUOTAS_PAGADAS'] || '0'} cuotas.`;
    }

    // Last payment
    if (q.includes('último pago') || q.includes('ultima fecha')) {
        return `Tu último pago fue el ${client['UTLIMO_PAGO'] || 'desconocido'}.`;
    }

    // Days late
    if (q.includes('atraso') || q.includes('días tarde')) {
        return `Tienes ${client['DIAS_ATRASO'] || '0'} días de atraso.`;
    }

    // Next due date / remaining days
    if (q.includes('vence') || q.includes('plazo') || q.includes('cuando tengo que pagar')) {
        const max = parseInt(client['ATRASO_MAXIMO'] || '0', 10);
        const atraso = parseInt(client['DIAS_ATRASO'] || '0', 10);
        const remaining = max - atraso;

        const today = new Date();
        const vencDate = new Date(today.getTime() + remaining * 24 * 60 * 60 * 1000);

        const dd = String(vencDate.getDate()).padStart(2, '0');
        const mm = String(vencDate.getMonth() + 1).padStart(2, '0');
        const yyyy = vencDate.getFullYear();

        const dateStr = `${dd}/${mm}/${yyyy}`;

        if (remaining > 0) {
            return `Te quedan ${remaining} día(s) de plazo. Vence el ${dateStr}.`;
        } else if (remaining === 0) {
            return `Tu cuota vence hoy, ${dateStr}.`;
        } else {
            return `Tu cuota ya venció el ${dateStr}.`;
        }
    }

    // Nearby office
    if (q.includes('oficina') || q.includes('agencia') || q.includes('cerca')) {
        const dept = client['DEPARTAMENTO_CLIENTE'];
        const agencia = client['AGENCIA'];
        if (dept && agencia) {
            return `Tu agencia asignada es ${agencia} en el departamento de ${dept}. Puedes acercarte a cualquier oficina de Caja Huancayo en esa zona.`;
        }
    }

    return null;
}

/**
 * Simple cache‑aware query helper.
 */
async function handleDatabaseQuery(question, client) {
    const lowered = question.toLowerCase();
    if (cache.has(lowered)) {
        return cache.get(lowered);
    }

    // The main logic is now in answerFromInfoDb
    const answer = answerFromInfoDb(question, client);
    if (answer) {
        cache.set(lowered, answer);
        setTimeout(() => cache.delete(lowered), 5 * 60 * 1000);
    }
    return answer;
}

// Configuration
const MAX_MESSAGES_PER_USER = 20; // 10 intercambios (user + bot)
const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hora en milisegundos

/**
 * Get or create conversation history for a user
 */
function getConversation(fromJid) {
    if (!conversationHistory.has(fromJid)) {
        conversationHistory.set(fromJid, {
            messages: [],
            lastActivity: Date.now()
        });
    }
    return conversationHistory.get(fromJid);
}

/**
 * Add a message to conversation history
 */
function addMessage(fromJid, role, content) {
    const conversation = getConversation(fromJid);
    conversation.messages.push({ role, content });
    conversation.lastActivity = Date.now();

    // Limit history size (keep only last MAX_MESSAGES_PER_USER)
    if (conversation.messages.length > MAX_MESSAGES_PER_USER) {
        conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_USER);
    }
}

/**
 * Clean up inactive conversations
 */
function cleanupInactiveConversations() {
    const now = Date.now();
    for (const [jid, conversation] of conversationHistory.entries()) {
        if (now - conversation.lastActivity > INACTIVITY_TIMEOUT) {
            conversationHistory.delete(jid);
            console.log(`Cleaned up conversation for ${jid} due to inactivity`);
        }
    }
}

// Run cleanup every 10 minutes
setInterval(cleanupInactiveConversations, 10 * 60 * 1000);

// ==================== FLOW LOGIC ====================

/**
 * Simple flow runner that applies the strict interaction rules and leverages AI.
 */
async function runFlow(incomingText, fromJid) {
    const text = incomingText.trim();
    let clienteInfo = null;
    let intent = null;

    // ==================== DNI DETECTION ====================
    // Detect if message contains DNI (8 digits)
    const dniMatch = text.match(/\b\d{8}\b/);
    const dni = dniMatch ? dniMatch[0] : null;

    // If DNI is provided, get client info
    if (dni) {
        const clienteResult = await getClienteByDNI(dni);

        if (clienteResult.success) {
            clienteInfo = clienteResult.cliente;
            intent = 'DNI_PROVIDED';

            // Check if user is asking about debt
            const deudaPattern = /deuda|debe|cuanto debo|saldo|pagar|cuenta|monto|adeudo/i;

            if (deudaPattern.test(text)) {
                // User is asking about their debt
                const deudasResult = await getDeudasByDNI(dni);

                if (deudasResult.success && deudasResult.deudas.length > 0) {
                    const deuda = deudasResult.deudas[0]; // Get first debt
                    const response = `Hola ${clienteInfo.ultimo_nombre}! 👋\n\n${formatDeudaInfo(deuda)}\n\n¿En qué más puedo ayudarte?`;

                    // Save conversation
                    await saveConversacion({
                        clienteId: clienteInfo.id,
                        telefonoWhatsapp: fromJid,
                        dniProporcionado: dni,
                        mensajeCliente: text,
                        respuestaBot: response,
                        intent: 'CONSULTA_DEUDA'
                    });

                    return response;
                } else {
                    const response = `Hola ${clienteInfo.ultimo_nombre}! 👋\n\nNo encontramos deudas pendientes con tu DNI. Si tienes alguna consulta, puedes pedir hablar con un asesor.`;

                    await saveConversacion({
                        clienteId: clienteInfo.id,
                        telefonoWhatsapp: fromJid,
                        dniProporcionado: dni,
                        mensajeCliente: text,
                        respuestaBot: response,
                        intent: 'SIN_DEUDA'
                    });

                    return response;
                }
            } else {
                // Just greeting with DNI, no debt query
                const response = `Hola ${clienteInfo.ultimo_nombre}! 👋\n\nBienvenido a InformaPeru. ¿En qué puedo ayudarte?\n\n1. Consultar deuda\n2. Opciones de pago y descuentos\n3. Ubicación de oficinas\n4. Hablar con un asesor`;

                await saveConversacion({
                    clienteId: clienteInfo.id,
                    telefonoWhatsapp: fromJid,
                    dniProporcionado: dni,
                    mensajeCliente: text,
                    respuestaBot: response,
                    intent: 'SALUDO_CON_DNI'
                });

                return response;
            }
        }
    }

    // ==================== OPTION SELECTION ====================
    // Check if user selected an option (1-4)
    if (/^[1-4]$/.test(text.trim())) {
        const option = parseInt(text.trim());

        switch (option) {
            case 1:
                intent = 'OPCION_DETALLES_DEUDA';
                return 'Para consultar tu deuda, por favor proporciona tu DNI (8 dígitos).';

            case 2:
                intent = 'OPCION_DESCUENTOS';
                return 'Tenemos descuentos de hasta 15% en pagos al contado. Para más detalles específicos, proporciona tu DNI.';

            case 3:
                intent = 'OPCION_OFICINAS';
                const oficinasResult = await getOficinas();
                if (oficinasResult.success && oficinasResult.oficinas.length > 0) {
                    let response = '📍 Nuestras oficinas:\n\n';
                    oficinasResult.oficinas.forEach((ofi, index) => {
                        response += `${index + 1}. ${ofi.nombre}\n`;
                        response += `   📍 ${ofi.direccion}\n`;
                        response += `   📞 ${ofi.telefono}\n`;
                        response += `   🕐 ${ofi.horario}\n\n`;
                    });
                    return response.trim();
                }
                return 'Lo siento, no pude obtener información de las oficinas en este momento.';

            case 4:
                intent = 'SOLICITA_ASESOR';
                return 'Para conectarte con un asesor, proporciona tu DNI y tu consulta en un mensaje.\nEjemplo: "DNI 12345678, quiero reprogramar mi deuda"';

            default:
                return 'Opción no válida. Por favor elige del 1 al 4.';
        }
    }

    // ==================== ADVISOR REQUEST ====================
    const advisorPattern = /asesor|human|hablar con un asesor|agente|comunicarme con/i;

    if (advisorPattern.test(text) || (text.length > 20 && /\b\d{8,}\b/.test(text))) {
        const dniMatch = text.match(/\b\d{8,}\b/);
        const dni = dniMatch ? dniMatch[0] : null;

        if (dni && (advisorPattern.test(text) || text.length > 15)) {
            await sendAdvisorEmail(dni, text);
            intent = 'DERIVADO_ASESOR';

            await saveConversacion({
                telefonoWhatsapp: fromJid,
                dniProporcionado: dni,
                mensajeCliente: text,
                respuestaBot: 'Derivado a asesor',
                intent,
                derivadoAsesor: true
            });

            return 'Listo. Se te está derivando con un asesor personalizado. Te contactaremos pronto.';
        } else if (advisorPattern.test(text)) {
            return 'Para derivarte, necesito tu DNI y tu consulta en un solo mensaje. Ejemplo: "DNI 12345678, quiero reprogramar mi deuda"';
        }
    }

    // ==================== AI RESPONSE ====================
    const botContext = (process.env.BOT_CONTEXT || '').replace(/\\n/g, '\n');

    // 1. Detect if we have a client identifier (DNI, RUC, Account)
    const identifierMatch = text.match(/\b\d{8,}\b/);
    const identifier = identifierMatch ? identifierMatch[0] : null;

    let clientData = null;
    if (identifier) {
        clientData = await getClientData(identifier);
    }

    // 2. Try to answer using infoDb logic (shortcut)
    const infoAnswer = answerFromInfoDb(text, clientData);
    if (infoAnswer) {
        addMessage(fromJid, 'assistant', infoAnswer);
        return infoAnswer;
    }

    // 3. Try cache/local DB handler
    const localAnswer = await handleDatabaseQuery(text, clientData);
    if (localAnswer) {
        addMessage(fromJid, 'assistant', localAnswer);
        return localAnswer;
    }

    const conversation = getConversation(fromJid);
    const clientContext = clientData ? `\n\nDATOS DEL CLIENTE ACTUAL:\n${JSON.stringify(clientData, null, 2)}` : '';

    const messages = [
        {
            role: 'system',
            content: `${botContext}\n\nLOGICA DE BASE DE DATOS (infoDb.txt):\n${infoDbGuide}${clientContext}\n\nREGLA ADICIONAL: Si el cliente proporciona su DNI pero no ha elegido una opción, SIEMPRE muestra el menú de opciones completo (1, 2, 3, 4). No resumas el menú. Mantén el formato original con saltos de línea.`
        },
        ...conversation.messages,
        { role: 'user', content: text }
    ];

    try {
        let aiResponse = await getDeepseekResponse(messages);

        addMessage(fromJid, 'user', text);
        addMessage(fromJid, 'assistant', aiResponse);

        // Save conversation to database
        await saveConversacion({
            clienteId: clientData?.id || null,
            telefonoWhatsapp: fromJid,
            dniProporcionado: identifier || null,
            mensajeCliente: text,
            respuestaBot: aiResponse,
            intent: intent || 'CONVERSACION_GENERAL'
        });

        if (/\d+\.\s/.test(aiResponse) || aiResponse.includes('\n')) {
            return aiResponse;
        }

        const sentences = aiResponse.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
        const limited = sentences.slice(0, 3).join(' ').trim();

        return limited || 'Disculpa, no pude procesar tu solicitud. ¿Podrías repetirla?';
    } catch (err) {
        console.error('Error calling Deepseek API:', err.message);
        return 'Lo siento, estoy experimentando dificultades técnicas. Por favor intenta más tarde.';
    }
}

module.exports = { runFlow, isBotPaused, toggleBotPause };
