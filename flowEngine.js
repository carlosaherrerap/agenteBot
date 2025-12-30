const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const { getClienteByDNI, saveConversacion } = require('./services/database');
const sql = require('./utils/sqlServer');
const fs = require('fs');
const path = require('path');

// ==================== CONVERSATION MEMORY ====================
const conversationHistory = new Map();
const MAX_MESSAGES_PER_USER = 20;
const INACTIVITY_TIMEOUT = 60 * 60 * 1000;

// ==================== BOT PAUSE CONTROL ====================
const pausedChats = new Set();

function isBotPaused(jid) {
    return pausedChats.has(jid);
}

function toggleBotPause(jid) {
    if (pausedChats.has(jid)) {
        pausedChats.delete(jid);
        return false;
    } else {
        pausedChats.add(jid);
        return true;
    }
}

// ==================== INITIALIZATION ====================
(async () => {
    try {
        console.log('--- Verificando SQL Server al iniciar ---');
        await sql.query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BotCache')
            CREATE TABLE BotCache (
                jid NVARCHAR(100) PRIMARY KEY,
                dni NVARCHAR(20),
                clientData NVARCHAR(MAX),
                lastUpdated DATETIME DEFAULT GETDATE()
            )
        `);
        const cacheCount = await sql.query('SELECT COUNT(*) as total FROM BotCache');
        console.log('✅ SQL Server & BotCache OK. Records in cache:', cacheCount[0]?.total || 0);
    } catch (err) {
        console.error('❌ Error inicial SQL:', err.message);
    }
})();

// Load infoDb.txt for AI context
const infoDbPath = path.resolve(__dirname, 'infoDb.txt');
let infoDbGuide = '';
if (fs.existsSync(infoDbPath)) {
    infoDbGuide = fs.readFileSync(infoDbPath, 'utf8');
}

// ==================== CACHE FUNCTIONS ====================

async function getFromCache(jid) {
    try {
        const cached = await sql.getCache(jid);
        if (cached && cached.clientData) {
            console.log(`📦 Cache HIT for ${jid}`);
            return JSON.parse(cached.clientData);
        }
        console.log(`📭 Cache MISS for ${jid}`);
        return null;
    } catch (err) {
        console.error('Error fetching from BotCache:', err.message);
        return null;
    }
}

async function saveToCache(jid, dni, data) {
    try {
        await sql.upsertCache(jid, dni, data);
        console.log(`💾 SAVED to cache for ${jid} (DNI: ${dni})`);
        return true;
    } catch (err) {
        console.error('❌ Error saving to BotCache:', err.message);
        return false;
    }
}

// ==================== CALCULATION FUNCTIONS ====================

function calculateSaldoCuota(client) {
    if (!client) return '0.00';
    const capital = parseFloat(client.SALDO_CAPITAL_PROXIMA_CUOTA || 0);
    const interes = parseFloat(client.SALDO_INTERES_PROXIMA_CUOTA || 0);
    const mora = parseFloat(client.SALDO_MORA_PROXIMA_CUOTA || 0);
    const gasto = parseFloat(client.SALDO_GASTO_PROXIMA_CUOTA || 0);
    const congelado = parseFloat(client.SALDO_CAP_INT_CONGELADO_PROXIMA_CUOTA || 0);
    return (capital + interes + mora + gasto + congelado).toFixed(2);
}

function getClientName(client) {
    if (!client) return 'Cliente';
    const fullName = client.CLIENTE_PREMIUM || client.nombre_completo || 'Cliente';
    const parts = fullName.split(',');
    if (parts.length > 1) {
        return parts[1].trim().split(' ')[0];
    }
    return fullName.split(' ')[0];
}

// ==================== CONVERSATION FUNCTIONS ====================

function getConversation(fromJid) {
    if (!conversationHistory.has(fromJid)) {
        conversationHistory.set(fromJid, {
            messages: [],
            lastActivity: Date.now()
        });
    }
    return conversationHistory.get(fromJid);
}

function addMessage(fromJid, role, content) {
    const conversation = getConversation(fromJid);
    conversation.messages.push({ role, content });
    conversation.lastActivity = Date.now();
    if (conversation.messages.length > MAX_MESSAGES_PER_USER) {
        conversation.messages = conversation.messages.slice(-MAX_MESSAGES_PER_USER);
    }
}

function cleanupInactiveConversations() {
    const now = Date.now();
    for (const [jid, conversation] of conversationHistory.entries()) {
        if (now - conversation.lastActivity > INACTIVITY_TIMEOUT) {
            conversationHistory.delete(jid);
        }
    }
}
setInterval(cleanupInactiveConversations, 10 * 60 * 1000);

// ==================== RESPONSE TEMPLATES ====================

function getPersonalizedMenu(name) {
    return `Hola, *${name}*. Te saludamos de *InformaPeru*\n\nSelecciona un número para realizar tu consulta:\n1. Detalles deuda\n2. Descuento\n3. Oficinas\n4. Otros`;
}

function getDebtDetails(client) {
    const name = getClientName(client);
    const saldoTotal = parseFloat(client.SALDO_TOTAL || 0).toFixed(2);
    const saldoCuota = calculateSaldoCuota(client);
    const capital = parseFloat(client.SALDO_CAPITAL_PROXIMA_CUOTA || 0).toFixed(2);
    const mora = parseFloat(client.SALDO_MORA_PROXIMA_CUOTA || 0).toFixed(2);
    const interes = parseFloat(client.SALDO_INTERES_PROXIMA_CUOTA || 0).toFixed(2);
    const gasto = parseFloat(client.SALDO_GASTO_PROXIMA_CUOTA || 0).toFixed(2);
    const ultimoPago = client.ULTIMO_PAGO || 'Sin registros';
    const diasAtraso = client.DIAS_ATRASO || 0;
    const atrasoMax = client.ATRASO_MAXIMO || 0;

    return `*Detalles de Deuda para ${name}:*\n\n💰 Saldo Total del Crédito: S/ ${saldoTotal}\n📅 Cuota Pendiente (Capital): S/ ${capital}\n📈 Intereses: S/ ${interes}\n⚠️ Mora: S/ ${mora}\n💼 Gastos: S/ ${gasto}\n\n🧾 *Total Cuota a Pagar: S/ ${saldoCuota}*\n\n⏰ Días de atraso: ${diasAtraso} (Máx: ${atrasoMax})\n💳 Último Pago: ${ultimoPago}`;
}

// ==================== REGEX PATTERNS ====================
const DEBT_INQUIRY_REGEX = /(cuanto debo|cuanto pago|cual es mi deuda|quiero pagar|pagar|deuda|saldo|monto)/i;
const GREETING_ONLY_REGEX = /^(hola|buen(as)? (noches|tardes|dias)|buenos dias|hey|buenas)$/i;
const IDENTIFIER_REGEX = /\b(\d{8,})\b/;
const COMPLEX_DEBT_REGEX = /(cuota|pendiente|mora|total|pagar|adicional|capital|interes|debo)/i;
const ADVISOR_REGEX = /(asesor|human|hablar con|agente|comunicarme|ayuda)/i;

// ==================== MAIN FLOW ====================

async function runFlow(incomingText, fromJid) {
    const text = incomingText.trim();
    const lowText = text.toLowerCase();

    console.log(`\n📩 [${fromJid}] Mensaje: "${text}"`);

    // 1. CHECK CACHE FIRST
    let cachedClient = await getFromCache(fromJid);

    // 2. GREETING ONLY (short messages like "hola", "buenas tardes")
    if (GREETING_ONLY_REGEX.test(lowText) && !cachedClient) {
        return 'Hola, te saluda InformaPeru. 👋 Si tienes alguna duda o consulta házmela saber adjuntando tu DNI, RUC o CUENTA (p. ejem: 75747335)';
    }

    // 3. DEBT INQUIRY WITHOUT IDENTIFIER
    if (DEBT_INQUIRY_REGEX.test(lowText) && !cachedClient && !IDENTIFIER_REGEX.test(text)) {
        const responses = [
            'Por favor, bríndame tu DNI para verificar en el sistema. 🔍',
            'Hola, te saluda InformaPeru. Necesito tu DNI, RUC o CUENTA.',
            'Hola, te saluda InformaPeru, bríndame tu DNI para verificar en el sistema.'
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    // 4. IDENTIFIER DETECTION (DNI/RUC/CUENTA)
    const idMatch = text.match(IDENTIFIER_REGEX);
    if (idMatch) {
        const identifier = idMatch[1];
        console.log(`🔍 Identifier detected: ${identifier}`);

        // If client is already cached with same DNI, return menu directly
        if (cachedClient && (cachedClient.NRO_DNI === identifier || cachedClient.NRO_RUC === identifier)) {
            console.log('⚡ Using cached data - returning menu');
            return getPersonalizedMenu(getClientName(cachedClient));
        }

        // Fetch from HuancayoBase
        const result = await getClienteByDNI(identifier);
        if (result.success && result.cliente) {
            const saved = await saveToCache(fromJid, identifier, result.cliente);
            if (saved) {
                cachedClient = result.cliente; // Update local reference
                return getPersonalizedMenu(getClientName(result.cliente));
            }
        }

        return 'Lo siento, no encontré información asociada a ese número. Por favor verifica que esté correcto.';
    }

    // 5. OPTION SELECTION (1-4) - ONLY if client is identified
    if (/^[1-4]$/.test(text) && cachedClient) {
        const option = parseInt(text);
        const name = getClientName(cachedClient);

        switch (option) {
            case 1: // Detalles deuda
                return getDebtDetails(cachedClient);
            case 2: // Descuento
                return `Hola ${name}, cuento con una campaña de descuento para ti. Escríbeme "Asesor" si deseas que un representante te brinde el porcentaje exacto de condonación.`;
            case 3: // Oficinas
                return `📍 *Agencias Caja Huancayo*\nTu agencia asignada es ${cachedClient.AGENCIA || 'la más cercana'}. Puedes acercarte a cualquier oficina a nivel nacional.`;
            case 4: // Otros
                return `Entiendo ${name}. Por favor, describe tu consulta detalladamente para derivarte con un asesor especializado.`;
        }
    }

    // 6. COMPLEX DEBT QUESTIONS (when client IS identified)
    if (cachedClient && COMPLEX_DEBT_REGEX.test(lowText)) {
        console.log('🧠 Complex debt question detected - using cached data');

        const name = getClientName(cachedClient);
        const capital = parseFloat(cachedClient.SALDO_CAPITAL_PROXIMA_CUOTA || 0).toFixed(2);
        const mora = parseFloat(cachedClient.SALDO_MORA_PROXIMA_CUOTA || 0).toFixed(2);
        const interes = parseFloat(cachedClient.SALDO_INTERES_PROXIMA_CUOTA || 0).toFixed(2);
        const gasto = parseFloat(cachedClient.SALDO_GASTO_PROXIMA_CUOTA || 0).toFixed(2);
        const totalCuota = calculateSaldoCuota(cachedClient);

        // Check specific question patterns
        if (lowText.includes('cuota') && lowText.includes('pendiente')) {
            return `Hola ${name}, tu cuota pendiente (capital) es: S/ ${capital}`;
        }
        if (lowText.includes('mora') && (lowText.includes('adicional') || lowText.includes('total'))) {
            return `Hola ${name}, el adicional por mora es: S/ ${mora}\n\nEl total de tu cuota incluyendo mora es: S/ ${totalCuota}`;
        }
        if ((lowText.includes('cuota') || lowText.includes('total')) && lowText.includes('pagar')) {
            return `Hola ${name}, aquí está el desglose:\n\n📌 Cuota pendiente (Capital): S/ ${capital}\n⚠️ Mora: S/ ${mora}\n📈 Intereses: S/ ${interes}\n💼 Gastos: S/ ${gasto}\n\n🧾 *Total a Pagar: S/ ${totalCuota}*`;
        }

        // Default: return full debt details
        return getDebtDetails(cachedClient);
    }

    // 7. ADVISOR REQUEST
    if (ADVISOR_REGEX.test(lowText)) {
        const dni = cachedClient?.NRO_DNI || cachedClient?.NRO_RUC || 'Sin ID';
        await sendAdvisorEmail(dni, text);
        return `Listo. Un asesor de *InformaPeru* ha sido notificado y se pondrá en contacto contigo a la brevedad.`;
    }

    // 8. AI FALLBACK (only when no pattern matched)
    console.log('🤖 AI Fallback - calling LLM');
    const botContext = (process.env.BOT_CONTEXT || '').replace(/\\n/g, '\n');
    const conversation = getConversation(fromJid);

    // Build rich context for AI
    let clientContext = '';
    if (cachedClient) {
        clientContext = `\n\n=== DATOS DEL CLIENTE (USAR ESTOS DATOS PARA RESPONDER) ===
DNI: ${cachedClient.NRO_DNI || 'N/A'}
Nombre: ${cachedClient.CLIENTE_PREMIUM || 'N/A'}
Cuota Pendiente (Capital): S/ ${cachedClient.SALDO_CAPITAL_PROXIMA_CUOTA || 0}
Intereses: S/ ${cachedClient.SALDO_INTERES_PROXIMA_CUOTA || 0}
Mora: S/ ${cachedClient.SALDO_MORA_PROXIMA_CUOTA || 0}
Gastos: S/ ${cachedClient.SALDO_GASTO_PROXIMA_CUOTA || 0}
TOTAL CUOTA A PAGAR: S/ ${calculateSaldoCuota(cachedClient)}
Saldo Total Crédito: S/ ${cachedClient.SALDO_TOTAL || 0}
Días Atraso: ${cachedClient.DIAS_ATRASO || 0}
Último Pago: ${cachedClient.ULTIMO_PAGO || 'Sin registros'}
=== FIN DATOS CLIENTE ===`;
    } else {
        clientContext = '\n\nCLIENTE NO IDENTIFICADO. SOLICITAR DNI ANTES DE DAR INFORMACIÓN DE DEUDA.';
    }

    const messages = [
        {
            role: 'system',
            content: `${botContext}\n\nREGLAS ESTRICTAS:\n1. NUNCA inventes montos. USA SOLO los datos del cliente proporcionados.\n2. Si el cliente pregunta sobre cuota/mora/total, USA los campos exactos.\n3. Sé breve y profesional.\n4. Si no hay DNI identificado, pídelo cordialmente.${clientContext}`
        },
        ...conversation.messages,
        { role: 'user', content: text }
    ];

    try {
        let aiResponse = await getDeepseekResponse(messages);
        addMessage(fromJid, 'user', text);
        addMessage(fromJid, 'assistant', aiResponse);

        await saveConversacion({
            telefonoWhatsapp: fromJid,
            dniProporcionado: cachedClient?.NRO_DNI || null,
            mensajeCliente: text,
            respuestaBot: aiResponse,
            intent: 'AI_RESPONSE'
        });

        return aiResponse;
    } catch (err) {
        console.error('Error calling AI:', err.message);
        return 'Lo siento, estoy experimentando una alta demanda. Por favor intenta de nuevo o escribe "asesor".';
    }
}

module.exports = { runFlow, isBotPaused, toggleBotPause };
