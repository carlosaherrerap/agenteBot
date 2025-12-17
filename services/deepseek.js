const axios = require('axios');
require('dotenv').config();

/**
 * Call Deepseek chat completion endpoint.
 * @param {string} prompt - Full prompt including context and user message.
 * @returns {Promise<string>} - AI response text.
 */
async function getDeepseekResponse(prompt) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const url = 'https://api.deepseek.com/v1/chat/completions'; // Adjust if different endpoint
    const payload = {
        model: 'deepseek-coder', // or appropriate model name
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
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

module.exports = { getDeepseekResponse };
