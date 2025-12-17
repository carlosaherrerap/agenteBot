require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@adiwajshing/baileys');
const path = require('path');
const fs = require('fs');
const { runFlow } = require('./flowEngine');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let sock;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(__dirname, 'auth'));

    const versionInfo = await fetchLatestBaileysVersion();
    const version = Array.isArray(versionInfo) ? versionInfo[0] : (versionInfo.version || versionInfo);
    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        qrTimeout: 60 * 1000,
        logger: require('pino')({ level: 'debug' })
        //logger: require('pino')({ level: 'silent' })

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
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('connection closed due to', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            if (shouldReconnect) startWhatsApp();
        } else if (connection === 'open') {
            console.log('WhatsApp connection opened');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
            if (!msg.message) continue;
            const from = msg.key.remoteJid;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
            if (!text) continue;
            try {
                const response = await runFlow(text, from);
                if (response) {
                    await sock.sendMessage(from, { text: response });
                }
            } catch (err) {
                console.error('Error running flow:', err);
            }
        }
    });
}

startWhatsApp().catch(console.error);

app.get('/qr', (req, res) => {
    const qrPath = path.resolve(__dirname, 'public', 'qr.png');
    if (fs.existsSync(qrPath)) {
        res.sendFile(qrPath);
    } else {
        res.status(404).send('QR not generated yet');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// Export a getter so other modules can access the runtime socket without circular require issues
module.exports = {
    getSock: () => sock
};