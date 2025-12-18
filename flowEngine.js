const axios = require('axios');
const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const { sendMessage } = require('./utils/whatsapp');

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

    const messages = [
        {
            role: 'system',
            content: `${botContext}\n\nREGLA ADICIONAL: Si el cliente proporciona su DNI pero no ha elegido una opción, SIEMPRE muestra el menú de opciones completo (1, 2, 3, 4). No resumas el menú. Mantén el formato original con saltos de línea.`
        },
        { role: 'user', content: text }
    ];

    try {
        let aiResponse = await getDeepseekResponse(messages);

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
