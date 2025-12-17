const axios = require('axios');
require('dotenv').config();

/**
 * Call Deepseek chat completion endpoint with structured messages.
 * @param {Array} messages - Message objects [{role: 'system', content: '...'}, {role: 'user', content: '...'}]
 * @returns {Promise<string>} - AI response text.
 */
async function getDeepseekResponse(messages) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const url = 'https://api.deepseek.com/v1/chat/completions';

    const payload = {
        model: 'deepseek-chat',
        messages: messages,
        temperature: 0.5, // Lowered for more consistent collection agency behavior
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
