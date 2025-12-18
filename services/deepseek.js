const axios = require('axios');
require('dotenv').config();

/**
 * Call AI chat completion endpoint with structured messages.
 * @param {Array} messages - Message objects [{role: 'system', content: '...'}, {role: 'user', content: '...'}]
 * @returns {Promise<string>} - AI response text.
 */
async function getDeepseekResponse(messages) {
    const apiKey = process.env.DEEPSEEK_API_KEY;

    // ==================== CONFIGURACIÓN DE API ====================
    // Para DEEPSEEK (Cloud):
    const url = 'https://api.deepseek.com/v1/chat/completions';

    // Para OLLAMA (Local - necesitas tener OLLAMA ejecutándose):
    // const url = 'http://localhost:11434/api/chat';

    // ==================== MODELOS DISPONIBLES ====================
    const payload = {
        // DEEPSEEK MODELS:
        model: 'deepseek-chat',          // Recomendado para conversaciones
        // model: 'deepseek-coder',       // Para código y programación

        // OLLAMA MODELS (descomentar si usas OLLAMA):
        // model: 'llama3.2',             // LLaMA 3.2 (Meta)
        // model: 'mistral',              // Mistral 7B
        // model: 'phi3',                 // Microsoft Phi-3
        // model: 'qwen2.5',              // Alibaba Qwen 2.5
        // model: 'gemma2',               // Google Gemma 2

        messages: messages,
        temperature: 0.5,
        max_tokens: 512,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0.1
    };

    // ==================== HEADERS ====================
    // Para DEEPSEEK (requiere Authorization):
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
    };

    // Para OLLAMA (no requiere Authorization, comentar línea de Authorization):
    // const headers = {
    //     'Content-Type': 'application/json'
    // };

    const response = await axios.post(url, payload, { headers });

    // DEEPSEEK response format:
    const result = response.data?.choices?.[0]?.message?.content || '';

    // OLLAMA response format (descomentar si usas OLLAMA):
    // const result = response.data?.message?.content || '';

    return result.trim();
}

module.exports = { getDeepseekResponse };
