const axios = require('axios');
const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const { sendMessage } = require('./utils/whatsapp');

// ==================== CONVERSATION MEMORY ====================
// Store conversation history per user (key = fromJid)
const conversationHistory = new Map();

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

    // Broadened advisor/human agent detection
    const advisorPattern = /asesor|human|hablar con un asesor|agente|comunicarme con/i;

    // Check if the user is providing a DNI + request for an advisor
    if (advisorPattern.test(text) || (text.length > 20 && /\b\d{8,}\b/.test(text))) {
        const dniMatch = text.match(/\b\d{8,}\b/);
        const dni = dniMatch ? dniMatch[0] : null;

        // If they ask for advisor OR if it looks like a follow-up with DNI and query
        if (dni && (advisorPattern.test(text) || text.length > 15)) {
            await sendAdvisorEmail(dni, text);
            return 'Listo. Se te está derivando con un asesor personalizado. Te contactaremos pronto.';
        } else if (advisorPattern.test(text)) {
            return 'Para derivarte, necesito tu DNI y tu consulta en un solo mensaje. Ejemplo: "DNI 12345678, quiero reprogramar mi deuda"';
        }
    }

    // Expand \n if it's literal in the env string
    const botContext = (process.env.BOT_CONTEXT || '').replace(/\\n/g, '\n');

    // Get conversation history
    const conversation = getConversation(fromJid);

    // Build messages array with system + history + current message
    const messages = [
        {
            role: 'system',
            content: `${botContext}\n\nREGLA ADICIONAL: Si el cliente proporciona su DNI pero no ha elegido una opción, SIEMPRE muestra el menú de opciones completo (1, 2, 3, 4). No resumas el menú. Mantén el formato original con saltos de línea.\n\nRECUERDA: Mantén coherencia con la conversación previa. Si ya mostraste el menú y el usuario elige un número (1-4), proporciona la información correspondiente a esa opción.`
        },
        ...conversation.messages, // Add conversation history
        { role: 'user', content: text } // Add current message
    ];

    try {
        let aiResponse = await getDeepseekResponse(messages);

        // Store the exchange in history
        addMessage(fromJid, 'user', text);
        addMessage(fromJid, 'assistant', aiResponse);

        // If AI includes numbered lists or newlines, preserve it entirely
        if (/\d+\.\s/.test(aiResponse) || aiResponse.includes('\n')) {
            return aiResponse;
        }

        // For conversational responses, limit to 2-3 sentences
        const sentences = aiResponse.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
        const limited = sentences.slice(0, 3).join(' ').trim();

        return limited || 'Disculpa, no pude procesar tu solicitud. ¿Podrías repetirla?';
    } catch (err) {
        console.error('Error calling Deepseek API:', err.message);
        return 'Lo siento, estoy experimentando dificultades técnicas. Por favor intenta más tarde.';
    }
}

module.exports = { runFlow };
