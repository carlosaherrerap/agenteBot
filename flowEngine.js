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
 * Simple cache‑aware query helper for common questions.
 * Returns a string answer.
 */
async function handleDatabaseQuery(question) {
    const lowered = question.toLowerCase();
    if (cache.has(lowered)) {
        return cache.get(lowered);
    }
    // Example heuristic: balance query
    const match = lowered.match(/(saldo|saldo_capital).*?(\d{12,})/);
    if (match) {
        const account = match[2];
        const rows = await sql.query(`SELECT SALDO_CAPITAL FROM Huancayo.Base WHERE CUENTA_CREDITO = @p0`, [account]);
        const answer = rows.length ? `El saldo del cliente es S/ ${rows[0].SALDO_CAPITAL}` : 'No se encontró la cuenta.';
        cache.set(lowered, answer);
        setTimeout(() => cache.delete(lowered), 5 * 60 * 1000);
        return answer;
    }
    // Fallback: return infoDb content (truncated)
    const answer = infoDbContent.slice(0, 2000);
    cache.set(lowered, answer);
    setTimeout(() => cache.delete(lowered), 5 * 60 * 1000);
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
    // Try local DB/cache first
    const localAnswer = await handleDatabaseQuery(text);
    if (localAnswer) {
        addMessage(fromJid, 'assistant', localAnswer);
        return localAnswer;
    }
    const conversation = getConversation(fromJid);

    const messages = [
        {
            role: 'system',
            content: `${botContext}\n\nREGLA ADICIONAL: Si el cliente proporciona su DNI pero no ha elegido una opción, SIEMPRE muestra el menú de opciones completo (1, 2, 3, 4). No resumas el menú. Mantén el formato original con saltos de línea.\n\nRECUERDA: Mantén coherencia con la conversación previa. Si ya mostraste el menú y el usuario elige un número (1-4), proporciona la información correspondiente a esa opción.`
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
            clienteId: clienteInfo?.id || null,
            telefonoWhatsapp: fromJid,
            dniProporcionado: dni,
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
