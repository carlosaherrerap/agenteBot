const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const { getClienteByDNI, saveConversacion } = require('./services/database');
const sql = require('./utils/sqlServer');
const fs = require('fs');
const path = require('path');

// ==================== SESSION MANAGEMENT ====================
const sessions = new Map(); // jid -> { cachedClient, menuLevel, lastActivity, state }
const SESSION_TIMEOUT = 150000; // 2.5 minutes in milliseconds

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

// ==================== SESSION FUNCTIONS ====================

function getSession(jid) {
    if (!sessions.has(jid)) {
        sessions.set(jid, {
            cachedClient: null,
            menuLevel: 'root', // 'root', 'main', 'deuda_submenu', 'descuento', etc.
            lastActivity: Date.now(),
            state: 'initial', // 'initial', 'waiting_dni', 'identified', etc.
            conversationHistory: []
        });
    }
    const session = sessions.get(jid);
    session.lastActivity = Date.now();
    return session;
}

function clearSession(jid) {
    sessions.delete(jid);
    console.log(`🗑️ Session cleared for ${jid}`);
}

function checkSessionTimeout(jid) {
    const session = sessions.get(jid);
    if (!session) return false;

    const elapsed = Date.now() - session.lastActivity;
    if (elapsed > SESSION_TIMEOUT) {
        clearSession(jid);
        return true; // Session expired
    }
    return false;
}

// Cleanup inactive sessions every minute
setInterval(() => {
    const now = Date.now();
    for (const [jid, session] of sessions.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            clearSession(jid);
        }
    }
}, 60000);

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

// ==================== MENU TEMPLATES ====================

function getMainMenu(name) {
    return `Hola, *${name}*. Te saludamos de *InformaPeru*\n\nSelecciona un número para realizar tu consulta:\n1️⃣ Detalles deuda\n2️⃣ Descuento\n3️⃣ Oficinas\n4️⃣ Otros`;
}

function getDeudaSubmenu(name) {
    return `*Detalles de Deuda - ${name}*\n\nSelecciona qué información deseas consultar:\n\n1️⃣ Saldo total y cuotas\n2️⃣ Próxima cuota a pagar\n3️⃣ Días de atraso\n4️⃣ Último pago registrado\n\n0️⃣ Regresar al menú anterior`;
}

function getDeudaOption1(client) {
    const name = getClientName(client);
    const saldoTotal = parseFloat(client.SALDO_TOTAL || 0).toFixed(2);
    const cuotasPagadas = client.CUOTAS_PAGADAS || 0;
    const cuotasTotales = client.CUOTAS_TOTALES || 0;
    const cuotasPendientes = cuotasTotales - cuotasPagadas;

    return `*${name} - Saldo y Cuotas*\n\n💰 Saldo Total: S/ ${saldoTotal}\n📊 Cuotas Pagadas: ${cuotasPagadas}/${cuotasTotales}\n📋 Cuotas Pendientes: ${cuotasPendientes}\n\n0️⃣ Regresar al menú anterior`;
}

function getDeudaOption2(client) {
    const name = getClientName(client);
    const capital = parseFloat(client.SALDO_CAPITAL_PROXIMA_CUOTA || 0).toFixed(2);
    const interes = parseFloat(client.SALDO_INTERES_PROXIMA_CUOTA || 0).toFixed(2);
    const mora = parseFloat(client.SALDO_MORA_PROXIMA_CUOTA || 0).toFixed(2);
    const gasto = parseFloat(client.SALDO_GASTO_PROXIMA_CUOTA || 0).toFixed(2);
    const totalCuota = calculateSaldoCuota(client);

    return `*${name} - Próxima Cuota*\n\n📌 Capital: S/ ${capital}\n📈 Intereses: S/ ${interes}\n⚠️ Mora: S/ ${mora}\n💼 Gastos: S/ ${gasto}\n\n🧾 *Total a Pagar: S/ ${totalCuota}*\n\n0️⃣ Regresar al menú anterior`;
}

function getDeudaOption3(client) {
    const name = getClientName(client);
    const diasAtraso = client.DIAS_ATRASO || 0;
    const atrasoMax = client.ATRASO_MAXIMO || 0;
    const diasRestantes = Math.max(0, atrasoMax - diasAtraso);

    return `*${name} - Días de Atraso*\n\n⏰ Días de atraso actual: ${diasAtraso}\n📅 Máximo permitido: ${atrasoMax}\n✅ Días restantes: ${diasRestantes}\n\n0️⃣ Regresar al menú anterior`;
}

function getDeudaOption4(client) {
    const name = getClientName(client);
    const ultimoPago = client.ULTIMO_PAGO || 'No hay registros';
    const montoUltimoPago = client.MONTO_ULTIMO_PAGO ? `S/ ${parseFloat(client.MONTO_ULTIMO_PAGO).toFixed(2)}` : 'N/A';

    return `*${name} - Último Pago*\n\n💳 Fecha: ${ultimoPago}\n💵 Monto: ${montoUltimoPago}\n\n0️⃣ Regresar al menú anterior`;
}

// ==================== REGEX PATTERNS ====================
const DEBT_INQUIRY_REGEX = /(cuanto debo|cuanto pago|cual es mi deuda|quiero pagar|pagar|deuda|saldo|monto)/i;
const GREETING_ONLY_REGEX = /^(hola|buen(as)? (noches|tardes|dias)|buenos dias|hey|buenas)$/i;
const IDENTIFIER_REGEX = /\b(\d{8,})\b/;
const ADVISOR_REGEX = /(asesor|human|hablar con|agente|comunicarme|ayuda)/i;

// ==================== MAIN FLOW ====================

async function runFlow(incomingText, fromJid) {
    const text = incomingText.trim();
    const lowText = text.toLowerCase();

    console.log(`\n📩 [${fromJid}] Mensaje: "${text}"`);

    // Check session timeout
    if (checkSessionTimeout(fromJid)) {
        const responses = [
            'Tu sesión ha expirado por inactividad. Por favor, envía tu DNI nuevamente para continuar.',
            'Hola, tu sesión venció. Por favor proporciona tu DNI para reiniciar.'
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    const session = getSession(fromJid);

    // 1. GREETING ONLY
    if (GREETING_ONLY_REGEX.test(lowText) && !session.cachedClient) {
        session.state = 'waiting_dni';
        return 'Hola, te saluda InformaPeru. 👋 Si tienes alguna duda o consulta házmela saber adjuntando tu DNI, RUC o CUENTA (p. ejem: 12345678)';
    }

    // 2. DEBT INQUIRY WITHOUT IDENTIFIER
    if (DEBT_INQUIRY_REGEX.test(lowText) && !session.cachedClient && !IDENTIFIER_REGEX.test(text)) {
        session.state = 'waiting_dni';
        const responses = [
            'Por favor, bríndame tu DNI para verificar en el sistema. 🔍',
            'Hola, te saluda InformaPeru. Necesito tu DNI, RUC o CUENTA.',
            'Hola, te saluda InformaPeru, bríndame tu DNI para verificar en el sistema.'
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    // 3. IDENTIFIER DETECTION
    const idMatch = text.match(IDENTIFIER_REGEX);
    if (idMatch && session.menuLevel === 'root') {
        const identifier = idMatch[1];
        console.log(`🔍 Identifier detected: ${identifier}`);

        const result = await getClienteByDNI(identifier);
        if (result.success && result.cliente) {
            // ONLY save to cache if found
            await saveToCache(fromJid, identifier, result.cliente);
            session.cachedClient = result.cliente;
            session.state = 'identified';
            session.menuLevel = 'main';
            return getMainMenu(getClientName(result.cliente));
        } else {
            // DO NOT save anything if not found - allow retry
            session.cachedClient = null;
            session.state = 'waiting_dni';
            session.menuLevel = 'root';
            return 'Lo siento, no encontré información con ese número. Por favor verifica y vuelve a intentar.';
        }
    }

    // 4. MAIN MENU NAVIGATION
    if (session.menuLevel === 'main' && /^[1-4]$/.test(text) && session.cachedClient) {
        const option = parseInt(text);
        const name = getClientName(session.cachedClient);

        switch (option) {
            case 1: // Detalles deuda -> Show submenu
                session.menuLevel = 'deuda_submenu';
                return getDeudaSubmenu(name);
            case 2: // Descuento
                session.menuLevel = 'descuento';
                return `Hola ${name}, cuento con una campaña de descuento para ti. Escríbeme "Asesor" si deseas detalles.\n\n0️⃣ Regresar al menú anterior`;
            case 3: // Oficinas
                session.menuLevel = 'oficinas';
                return `📍 *Agencias Caja Huancayo*\nTu agencia asignada es ${session.cachedClient.AGENCIA || 'la más cercana'}. Puedes acercarte a cualquier oficina a nivel nacional.\n\n0️⃣ Regresar al menú anterior`;
            case 4: // Otros
                session.menuLevel = 'otros';
                return `Entiendo ${name}. Descríbeme tu consulta para derivarte con un asesor.\n\n0️⃣ Regresar al menú anterior`;
        }
    }

    // 5. DEUDA SUBMENU NAVIGATION
    if (session.menuLevel === 'deuda_submenu' && /^[0-4]$/.test(text) && session.cachedClient) {
        const option = parseInt(text);

        if (option === 0) {
            session.menuLevel = 'main';
            return getMainMenu(getClientName(session.cachedClient));
        }

        switch (option) {
            case 1:
                return getDeudaOption1(session.cachedClient);
            case 2:
                return getDeudaOption2(session.cachedClient);
            case 3:
                return getDeudaOption3(session.cachedClient);
            case 4:
                return getDeudaOption4(session.cachedClient);
        }
    }

    // 6. RETURN TO PREVIOUS LEVEL (0 from any submenu)
    if (text === '0' && session.cachedClient) {
        if (session.menuLevel === 'descuento' || session.menuLevel === 'oficinas' || session.menuLevel === 'otros') {
            session.menuLevel = 'main';
            return getMainMenu(getClientName(session.cachedClient));
        }
        if (session.menuLevel === 'deuda_submenu') {
            session.menuLevel = 'main';
            return getMainMenu(getClientName(session.cachedClient));
        }
    }

    // 7. ADVISOR REQUEST
    if (ADVISOR_REGEX.test(lowText)) {
        const dni = session.cachedClient?.NRO_DNI || session.cachedClient?.NRO_RUC || 'Sin ID';
        await sendAdvisorEmail(dni, text);
        return `Listo. Un asesor de *InformaPeru* te contactará pronto.\n\n${session.cachedClient ? '0️⃣ Regresar al menú anterior' : ''}`;
    }

    // 8. AI FALLBACK
    console.log('🤖 AI Fallback');
    const botContext = (process.env.BOT_CONTEXT || '').replace(/\\n/g, '\n');

    let clientContext = '';
    if (session.cachedClient) {
        clientContext = `\n\nDATOS DEL CLIENTE:
DNI: ${session.cachedClient.NRO_DNI || 'N/A'}
Nombre: ${session.cachedClient.CLIENTE_PREMIUM || 'N/A'}
Saldo Total: S/ ${session.cachedClient.SALDO_TOTAL || 0}
Cuota a Pagar: S/ ${calculateSaldoCuota(session.cachedClient)}
Días Atraso: ${session.cachedClient.DIAS_ATRASO || 0}`;
    }

    const messages = [
        {
            role: 'system',
            content: `${botContext}\n\nREGLAS:\n1. Usa SOLO los datos proporcionados.\n2. Si no hay DNI, solicítalo.${clientContext}`
        },
        ...session.conversationHistory,
        { role: 'user', content: text }
    ];

    try {
        let aiResponse = await getDeepseekResponse(messages);

        session.conversationHistory.push({ role: 'user', content: text });
        session.conversationHistory.push({ role: 'assistant', content: aiResponse });

        if (session.conversationHistory.length > 10) {
            session.conversationHistory = session.conversationHistory.slice(-10);
        }

        await saveConversacion({
            telefonoWhatsapp: fromJid,
            dniProporcionado: session.cachedClient?.NRO_DNI || null,
            mensajeCliente: text,
            respuestaBot: aiResponse,
            intent: 'AI_RESPONSE'
        });

        return aiResponse;
    } catch (err) {
        console.error('Error calling AI:', err.message);
        return 'Lo siento, error técnico. Intenta más tarde o escribe "asesor".';
    }
}

module.exports = { runFlow, isBotPaused, toggleBotPause };
