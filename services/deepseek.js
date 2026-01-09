/**
 * AI Service - Deepseek/Ollama Integration
 * With timeout handling and detailed logging
 */
const axios = require('axios');
require('dotenv').config();
const logger = require('../utils/logger');
// AI_PARTICIPATION controla el nivel de participación de la IA:
//   - 'full': la IA responde a todas las consultas.
//   - 'fallback': la IA solo se usa como respaldo cuando no hay respuesta directa o ocurre un error.
const AI_PARTICIPATION = process.env.AI_PARTICIPATION || 'fallback';

// Timeout for AI requests (15 seconds for cloud, 30 for local)
const CLOUD_TIMEOUT = 15000;
const LOCAL_TIMEOUT = 30000;

/**
 * Call AI chat completion endpoint with structured messages.
 * Supports both Ollama (local) and Deepseek (cloud)
 * @param {Array} messages - Message objects [{role: 'system', content: '...'}, {role: 'user', content: '...'}]
 * @returns {Promise<string>} - AI response text.
 */
async function getDeepseekResponse(messages) {
    const provider = process.env.AI_PROVIDER || 'ollama';
    const startTime = Date.now();

    try {
        if (provider === 'ollama') {
            // ==================== OLLAMA (LOCAL) ====================
            const url = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
            const model = process.env.OLLAMA_MODEL || 'llama3.2';

            logger.info('AI', `🤖 Usando Ollama (${model})`);
            logger.debug('AI', `URL: ${url}`);

            const payload = {
                model: model,
                messages: messages,
                stream: false,
                options: {
                    temperature: 0.5,
                    num_predict: 256 // Reduced for faster response
                }
            };

            const response = await axios.post(url, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: LOCAL_TIMEOUT
            });

            const result = response.data?.message?.content || '';
            const elapsed = Date.now() - startTime;
            logger.success('AI', `Respuesta en ${elapsed}ms: "${result.substring(0, 50)}..."`);
            return result.trim();

        } else {
            // ==================== DEEPSEEK (CLOUD) ====================
            const apiKey = process.env.DEEPSEEK_API_KEY;

            if (!apiKey || apiKey === 'your_api_key_here') {
                logger.error('AI', 'DEEPSEEK_API_KEY no configurada');
                return 'Lo siento, hay un problema de configuración. Por favor contacta a un asesor.';
            }

            const url = 'https://api.deepseek.com/v1/chat/completions';

            logger.info('AI', '🌐 Usando Deepseek API');

            const payload = {
                model: 'deepseek-chat',
                messages: messages,
                temperature: 0.5,
                max_tokens: 256,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0.1
            };

            const headers = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            };

            const response = await axios.post(url, payload, {
                headers,
                timeout: CLOUD_TIMEOUT
            });

            const result = response.data?.choices?.[0]?.message?.content || '';
            const elapsed = Date.now() - startTime;
            logger.success('AI', `Respuesta en ${elapsed}ms: "${result.substring(0, 50)}..."`);
            return result.trim();
        }
    } catch (err) {
        const elapsed = Date.now() - startTime;

        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
            logger.error('AI', `TIMEOUT después de ${elapsed}ms`);
            return 'Lo siento, el servicio está tardando mucho. Por favor intenta de nuevo o escribe "asesor" para hablar con una persona.';
        }

        if (err.code === 'ECONNREFUSED') {
            logger.error('AI', `Servicio no disponible (${provider === 'ollama' ? 'Ollama no está corriendo' : 'Deepseek no accesible'})`);
            return 'El servicio de IA no está disponible. Escribe "asesor" para hablar con una persona.';
        }

        if (err.response) {
            logger.error('AI', `Error HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`);
        } else {
            logger.error('AI', `Error: ${err.message}`);
        }

        return 'Lo siento, tuve un problema procesando tu mensaje. ¿Puedes intentar de nuevo?';
    }
}

module.exports = { getDeepseekResponse };
