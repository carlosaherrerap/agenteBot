const axios = require('axios');
const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const { sendMessage } = require('./utils/whatsapp');

/**
 * Simple flow runner that applies the strict interaction rules and leverages AI.
 * @param {string} incomingText - Text received from the user.
 * @param {string} fromJid - WhatsApp JID of the sender.
 * @returns {Promise<string|null>} - Reply text to send back, or null if no reply.
 */
async function runFlow(incomingText, fromJid) {
    const text = incomingText.trim();

    // Check for advisor request pattern
    const advisorPattern = /asesor|human|hablar con un asesor/i;
    if (advisorPattern.test(text)) {
        const dniMatch = text.match(/\b\d{8,}\b/);
        const dni = dniMatch ? dniMatch[0] : null;
        const query = text.replace(/asesor|human|hablar con un asesor/gi, '').trim();

        if (dni && query) {
            await sendAdvisorEmail(dni, query);
            return 'Listo. Se te está derivando con un asesor personalizado. Te contactaremos pronto.';
        } else if (advisorPattern.test(text)) {
            return 'Para derivarte, necesito tu DNI y tu consulta en un solo mensaje. Ejemplo: "DNI 12345678, quiero reprogramar mi deuda"';
        }
    }

    // Forward to Deepseek with structured prompt
    const messages = [
        { role: 'system', content: process.env.BOT_CONTEXT },
        { role: 'user', content: text }
    ];

    try {
        const aiResponse = await getDeepseekResponse(messages);

        // Ensure compliance with "2-3 sentences" rule if AI drifts
        const sentences = aiResponse.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const limited = sentences.slice(0, 3).join('. ').trim() + (sentences.length > 0 ? '.' : '');

        return limited || 'Disculpa, no pude procesar tu solicitud. ¿Podrías repetirla?';
    } catch (err) {
        console.error('Error calling Deepseek API:', err.message);
        return 'Lo siento, estoy experimentando dificultades técnicas. Por favor intenta más tarde.';
    }
}

module.exports = { runFlow };
