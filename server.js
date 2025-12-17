require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const { runFlow } = require('./flowEngine');

// Check context expansion on startup
if (process.env.BOT_CONTEXT) {
    console.log('BOT_CONTEXT detected. Length:', process.env.BOT_CONTEXT.length);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sock;
let server;

/**
 * Clean up the auth folder to ensure a fresh session.
 */
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

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(__dirname, 'auth'));

    const versionInfo = await fetchLatestBaileysVersion();
    const version = versionInfo?.version || [2, 3000, 1015901307]; // Updated fallback

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true, // Also print in terminal for easier debugging
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

            try {
                const response = await runFlow(text, from);
                if (response) {
                    await sock.sendMessage(from, { text: response });
                }
            } catch (err) {
                console.error('Error running flow:', err.message);
            }
        }
    });
}

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

app.get('/qr', (req, res) => {
    const qrPath = path.resolve(__dirname, 'public', 'qr.png');
    if (fs.existsSync(qrPath)) {
        res.sendFile(qrPath);
    } else {
        res.status(404).send('QR not generated yet');
    }
});

module.exports = {
    getSock: () => sock
};