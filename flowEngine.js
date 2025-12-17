const axios = require('axios');
const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const { sendMessage } = require('./utils/whatsapp');

/**
 * Simple flow runner that applies the strict interaction rules.
 * @param {string} incomingText - Text received from the user.
 * @param {string} fromJid - WhatsApp JID of the sender.
 * @returns {Promise<string|null>} - Reply text to send back, or null if no reply.
 */
async function runFlow(incomingText, fromJid) {
    // Trim and normalize
    const text = incomingText.trim();

    // Check for advisor request pattern
    const advisorPattern = /asesor|human|hablar con un asesor/i;
    if (advisorPattern.test(text)) {
        // Try to extract DNI and query from the message
        const dniMatch = text.match(/\b\d{8,}\b/);
        const dni = dniMatch ? dniMatch[0] : null;
        const query = text.replace(/asesor|human|hablar con un asesor/gi, '').trim();
        if (dni && query) {
            // Send email via Gmail
            await sendAdvisorEmail(dni, query);
            return 'Listo. Se te está derivando con un asesor personalizado. Te contactaremos pronto.';
        } else {
            return 'Para derivarte, necesito tu DNI y tu consulta en un solo mensaje. Ejemplo: "DNI 12345678, quiero reprogramar mi deuda"';
        }
    }

    // If no special rule, forward to Deepseek for a response using the provided context
    const deepseekPrompt = `
${process.env.BOT_CONTEXT}\nUser: ${text}\nAssistant:`;
    const aiResponse = await getDeepseekResponse(deepseekPrompt);

    // Apply interaction rules (e.g., limit to 2-3 sentences)
    const limited = aiResponse.split('.').slice(0, 3).join('.').trim();
    return limited;
}

module.exports = { runFlow };
