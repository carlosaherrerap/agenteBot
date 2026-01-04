/**
 * WhatsApp Chatbot Server - InformaPeru Cobranza
 * Main entry point for the application
 */
require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const { runFlow, isBotPaused, toggleBotPause } = require('./flowEngine');
const logger = require('./utils/logger');
const sql = require('./utils/sqlServer');
const redis = require('./utils/redis');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sock = null;
let server = null;
let whatsappConnected = false;
let connectionState = 'disconnected'; // disconnected, connecting, connected

// ==================== CHAT STORAGE ====================
const activeChats = new Map();

function getChat(jid) {
    if (!activeChats.has(jid)) {
        const phoneNumber = jid.split('@')[0];
        activeChats.set(jid, {
            messages: [],
            lastActivity: Date.now(),
            phoneNumber: phoneNumber,
            name: phoneNumber
        });
    }
    return activeChats.get(jid);
}

function addMessageToChat(jid, from, text, msgId = null) {
    const chat = getChat(jid);
    chat.messages.push({
        id: msgId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: from,
        text: text,
        timestamp: Date.now()
    });
    chat.lastActivity = Date.now();

    if (chat.messages.length > 100) {
        chat.messages = chat.messages.slice(-100);
    }
}

// ==================== AUTH FUNCTIONS ====================
function clearAuth() {
    logger.warn('WHATSAPP', 'Limpiando carpeta de autenticación...');
    try {
        if (fs.existsSync(path.resolve(__dirname, 'auth'))) {
            fs.rmSync(path.resolve(__dirname, 'auth'), { recursive: true, force: true });
        }
        fs.mkdirSync(path.resolve(__dirname, 'auth'));
        logger.success('WHATSAPP', 'Carpeta auth limpiada');
    } catch (err) {
        logger.error('WHATSAPP', 'Error limpiando auth', err);
    }
}

// ==================== WHATSAPP CONNECTION ====================
async function startWhatsApp() {
    // Show banner
    logger.banner();

    // Connect to SQL Server first
    logger.info('SYSTEM', 'Verificando conexiones...');
    const sqlStatus = await sql.connect();

    if (!sql.isConnected()) {
        logger.error('SYSTEM', 'CRÍTICO: SQL Server no conectado. El bot no puede iniciar.');
        console.log('\n' + JSON.stringify(sqlStatus, null, 2) + '\n');
        process.exit(1);
    }

    // Connect to Redis
    await redis.connect();

    // Start WhatsApp
    connectionState = 'connecting';
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

        // Log all connection updates for debugging
        logger.info('WHATSAPP', `Estado de conexión: ${connection || 'actualizando...'}`);

        if (qr) {
            connectionState = 'qr';
            logger.success('WHATSAPP', '📱 QR generado - Escanea con WhatsApp');
            logger.info('WHATSAPP', '⏳ El QR expira en 60 segundos, escanea rápido');
            const qrPath = path.resolve(__dirname, 'public', 'qr.png');
            const QRCode = require('qrcode');
            QRCode.toFile(qrPath, qr, { width: 300 }, (err) => {
                if (err) logger.error('WHATSAPP', 'Error generando QR', err);
            });
        }

        if (connection === 'close') {
            connectionState = 'disconnected';
            whatsappConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || 'Sin mensaje';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            logger.warn('WHATSAPP', `Conexión cerrada. Código: ${statusCode}`);
            logger.warn('WHATSAPP', `Motivo: ${errorMessage}`);

            // Show full error details
            if (lastDisconnect?.error) {
                console.log('\n[WHATSAPP ERROR DETAILS]:', JSON.stringify({
                    statusCode,
                    message: errorMessage,
                    shouldReconnect
                }, null, 2), '\n');
            }

            if (statusCode === 401) {
                logger.info('WHATSAPP', 'Sesión inválida (401) - Limpiando auth y reiniciando...');
                clearAuth();
                setTimeout(() => startWhatsApp(), 2000);
            } else if (shouldReconnect) {
                logger.info('WHATSAPP', `Reconectando en 3 segundos...`);
                setTimeout(() => startWhatsApp(), 3000);
            }
        } else if (connection === 'open') {
            connectionState = 'connected';
            whatsappConnected = true;
            logger.success('WHATSAPP', 'Conexión establecida correctamente');
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

            // Check if bot is paused
            if (isBotPaused(from)) {
                logger.debug('BOT', `Bot pausado para ${from}`);
                continue;
            }

            try {
                const response = await runFlow(text, from);
                if (response) {
                    await sock.sendMessage(from, { text: response });
                    addMessageToChat(from, 'bot', response);
                }
            } catch (err) {
                logger.error('BOT', 'Error en runFlow', err);
            }
        }
    });
}

// ==================== API ENDPOINTS ====================

// Get system status
app.get('/api/status', (req, res) => {
    res.json({
        ...sql.getConnectionStatus(),
        CONEXION_REDIS: redis.isRedisConnected(),
        WHATSAPP_CONNECTED: whatsappConnected,
        ESTADO_FILTRO: sql.ESTADO_FILTRO,
        DEBUG_LOGS: process.env.DEBUG_LOGS === 'true'
    });
});

// Get connection state for frontend
app.get('/api/connection-status', (req, res) => {
    res.json({
        state: connectionState, // 'disconnected', 'qr', 'connecting', 'connected'
        whatsapp: whatsappConnected,
        sql: sql.isConnected(),
        redis: redis.isRedisConnected()
    });
});

// Logout WhatsApp session
app.post('/api/logout', async (req, res) => {
    try {
        if (sock) {
            await sock.logout();
        }
        clearAuth();
        connectionState = 'disconnected';
        whatsappConnected = false;
        logger.info('WHATSAPP', 'Sesión cerrada por usuario');
        res.json({ success: true, message: 'Sesión cerrada' });
    } catch (err) {
        logger.error('WHATSAPP', 'Error al cerrar sesión', err);
        res.status(500).json({ error: err.message });
    }
});

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

    if (!sock || !whatsappConnected) {
        return res.status(500).json({ error: 'WhatsApp not connected' });
    }

    try {
        await sock.sendMessage(jid, { text: message });
        addMessageToChat(jid, 'human', message);
        res.json({ success: true });
    } catch (err) {
        logger.error('WHATSAPP', 'Error enviando mensaje', err);
        res.status(500).json({ error: err.message });
    }
});

// Toggle bot pause status
app.post('/api/chats/:jid/toggle-bot', (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const isPaused = toggleBotPause(jid);
    logger.info('BOT', `Bot ${isPaused ? 'PAUSADO' : 'ACTIVADO'} para ${jid}`);
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
server = app.listen(PORT, () => {
    logger.success('SYSTEM', `Servidor iniciado en puerto ${PORT}`);
    logger.info('SYSTEM', `Dashboard: http://localhost:${PORT}/dashboard.html`);
});

startWhatsApp().catch(err => {
    logger.error('SYSTEM', 'Error fatal al iniciar', err);
    if (err.message.includes('401')) {
        clearAuth();
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n');
    logger.info('SYSTEM', 'Cerrando servidor...');
    if (sock) {
        sock.logout().catch(() => { });
        sock.end();
    }
    server.close(() => {
        logger.success('SYSTEM', 'Servidor cerrado. ¡Hasta luego! 👋');
        process.exit(0);
    });
});

module.exports = {
    getSock: () => sock
};