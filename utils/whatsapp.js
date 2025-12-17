/**
 * Send a text message via Baileys (uses getter to avoid circular require)
 * @param {string} jid - WhatsApp JID (e.g., '123456789@s.whatsapp.net')
 * @param {string} text - Message text
 */
async function sendMessage(jid, text) {
    const { getSock } = require('../server');
    const sock = getSock();
    if (!sock) throw new Error('WhatsApp socket not initialized');
    await sock.sendMessage(jid, { text });
}

module.exports = { sendMessage };