require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const { runFlow, isBotPaused, toggleBotPause } = require('./flowEngine');

// Check context expansion on startup
if (process.env.BOT_CONTEXT) {
    console.log('BOT_CONTEXT detected. Length:', process.env.BOT_CONTEXT.length);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sock;
let server;

// ==================== CHAT STORAGE ====================
const activeChats = new Map(); // jid -> { messages: [], lastActivity, phoneNumber, name }

function getChat(jid) {
    if (!activeChats.has(jid)) {
        // Extract phone number from jid (format: 51999999999@s.whatsapp.net)
        const phoneNumber = jid.split('@')[0];
        activeChats.set(jid, {
            messages: [],
            lastActivity: Date.now(),
            phoneNumber: phoneNumber,
            name: phoneNumber // Initially just the number
        });
    }
    return activeChats.get(jid);
}

function addMessageToChat(jid, from, text, msgId = null) {
    const chat = getChat(jid);
    chat.messages.push({
        id: msgId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: from, // 'client', 'bot', 'human'
        text: text,
        timestamp: Date.now()
    });
    chat.lastActivity = Date.now();

    // Limit messages per chat
    if (chat.messages.length > 100) {
        chat.messages = chat.messages.slice(-100);
    }
}

// ==================== AUTH FUNCTIONS ====================
function clearAuth() {
    console.log('Clearing auth folder for a fresh session...');
    try {
        if (fs.existsSync(path.resolve(__dirname, 'auth'))) {
            fs.rmSync(path.resolve(__dirname, 'auth'), { recursive: true, force: true });
        }
        fs.mkdirSync(path.resolve(__dirname, 'auth'));
    } catch (err) {
        console.error('Error clearing auth folder:', err.message);
    }
}

// ==================== WHATSAPP CONNECTION ====================
async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(__dirname, 'auth'));

    const versionInfo = await fetchLatestBaileysVersion();
    const version = versionInfo?.version || [2, 3000, 1015901307];

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        qrTimeout: 60 * 1000,
        logger: require('pino')({ level: 'error' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            const qrPath = path.resolve(__dirname, 'public', 'qr.png');
            const QRCode = require('qrcode');
            QRCode.toFile(qrPath, qr, { width: 300 }, (err) => {
                if (err) console.error('QR generation error', err);
            });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log('Connection closed. Status code:', statusCode, '| Reconnecting:', shouldReconnect);

            if (statusCode === 401) {
                console.log('Detected 401 Unauthorized. Clearing session for reset.');
                clearAuth();
                startWhatsApp();
            } else if (shouldReconnect) {
                startWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp connection opened successfully');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (!text) continue;

            // Store incoming message
            addMessageToChat(from, 'client', text, msg.key.id);

            // Check if bot is paused for this chat
            if (isBotPaused(from)) {
                console.log(`🔴 Bot paused for ${from}, skipping auto-response`);
                continue;
            }

            try {
                const response = await runFlow(text, from);
                if (response) {
                    await sock.sendMessage(from, { text: response });
                    // Store bot response
                    addMessageToChat(from, 'bot', response);
                }
            } catch (err) {
                console.error('Error running flow:', err.message);
            }
        }
    });
}

// ==================== API ENDPOINTS ====================

// Get all active chats
app.get('/api/chats', (req, res) => {
    const chats = [];
    for (const [jid, chat] of activeChats.entries()) {
        const lastMessage = chat.messages[chat.messages.length - 1];
        chats.push({
            jid: jid,
            phoneNumber: chat.phoneNumber,
            name: chat.name,
            lastMessage: lastMessage?.text?.substring(0, 50) || '',
            lastActivity: chat.lastActivity,
            messageCount: chat.messages.length,
            isPaused: isBotPaused(jid)
        });
    }
    // Sort by last activity (most recent first)
    chats.sort((a, b) => b.lastActivity - a.lastActivity);
    res.json(chats);
});

// Get messages for a specific chat
app.get('/api/chats/:jid/messages', (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const chat = activeChats.get(jid);

    if (!chat) {
        return res.json({ messages: [], isPaused: false });
    }

    res.json({
        messages: chat.messages,
        isPaused: isBotPaused(jid),
        phoneNumber: chat.phoneNumber
    });
});

// Send a manual message
app.post('/api/chats/:jid/send', async (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const { message } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }

    if (!sock) {
        return res.status(500).json({ error: 'WhatsApp not connected' });
    }

    try {
        await sock.sendMessage(jid, { text: message });
        addMessageToChat(jid, 'human', message);
        res.json({ success: true });
    } catch (err) {
        console.error('Error sending message:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Toggle bot pause status for a chat
app.post('/api/chats/:jid/toggle-bot', (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const isPaused = toggleBotPause(jid);
    console.log(`🔄 Bot ${isPaused ? 'PAUSED' : 'ACTIVATED'} for ${jid}`);
    res.json({ isPaused });
});

// Get bot status for a chat
app.get('/api/chats/:jid/status', (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    res.json({ isPaused: isBotPaused(jid) });
});

// Get QR code
app.get('/qr', (req, res) => {
    const qrPath = path.resolve(__dirname, 'public', 'qr.png');
    if (fs.existsSync(qrPath)) {
        res.sendFile(qrPath);
    } else {
        res.status(404).send('QR not generated yet');
    }
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 3000;
server = app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

startWhatsApp().catch(err => {
    console.error('Fatal startup error:', err.message);
    if (err.message.includes('401')) {
        clearAuth();
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    if (sock) {
        sock.logout().catch(() => { });
        sock.end();
    }
    server.close(() => {
        console.log('Server port closed. Goodbye!');
        process.exit(0);
    });
});

module.exports = {
    getSock: () => sock
};