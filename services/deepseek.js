const axios = require('axios');
require('dotenv').config();

/**
 * Call AI chat completion endpoint with structured messages.
 * Supports both Ollama (local) and Deepseek (cloud)
 * @param {Array} messages - Message objects [{role: 'system', content: '...'}, {role: 'user', content: '...'}]
 * @returns {Promise<string>} - AI response text.
 */
async function getDeepseekResponse(messages) {
    // ==================== CONFIGURACIÓN ====================
    // Cambiar a 'deepseek' si quieres usar la API de Deepseek Cloud
    const provider = process.env.AI_PROVIDER || 'ollama';

    if (provider === 'ollama') {
        // ==================== OLLAMA (LOCAL) ====================
        const url = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
        const model = process.env.OLLAMA_MODEL || 'llama3.2';

        console.log(`🤖 Using Ollama: ${model}`);

        const payload = {
            model: model,
            messages: messages,
            stream: false,
            options: {
                temperature: 0.5,
                num_predict: 512
            }
        };

        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000 // 60 segundos timeout para modelos locales
        });

        const result = response.data?.message?.content || '';
        return result.trim();

    } else {
        // ==================== DEEPSEEK (CLOUD) ====================
        const apiKey = process.env.DEEPSEEK_API_KEY;
        const url = 'https://api.deepseek.com/v1/chat/completions';

        console.log('🌐 Using Deepseek API');

        const payload = {
            model: 'deepseek-chat',
            messages: messages,
            temperature: 0.5,
            max_tokens: 512,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0.1
        };

        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        };

        const response = await axios.post(url, payload, { headers });
        const result = response.data?.choices?.[0]?.message?.content || '';
        return result.trim();
    }
}

module.exports = { getDeepseekResponse };
