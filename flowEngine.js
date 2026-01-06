const { getDeepseekResponse } = require('./services/deepseek');
const { sendAdvisorEmail } = require('./services/email');
const { getClienteByDNI, saveConversacion } = require('./services/database');
const sql = require('./utils/sqlServer');
const templates = require('./utils/templates');
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
    // Try multiple possible column names
    const fullName = client.NOMBRE_CLIENTE || client.CLIENTE_PREMIUM || client.nombre_completo || 'Cliente';
    // Extract first name from "APELLIDO, NOMBRE" format
    const parts = fullName.split(',');
    if (parts.length > 1) {
        return parts[1].trim().split(' ')[0];
    }
    return fullName.split(' ')[0];
}

// ==================== MENU TEMPLATES ====================

function getMainMenu(name) {
    // Use templates.js for consistent messaging with full greeting format
    const messages = templates.greetingWithName(name);
    return messages.join('\n\n');
}

function getMenuOnly(name) {
    // Just the menu options without full greeting (for returning to menu)
    const messages = templates.menuOptions(name);
    return messages.join('\n\n');
}

function getDeudaSubmenu(name) {
    const messages = templates.debtDetailsMenu();
    return messages.join('\n\n');
}

function getDeudaOption1(client) {
    const saldoCapital = parseFloat(client.SALDO_CAPITAL || client.SALDO_CUOTA || client.SALDO_TOTAL || 0).toFixed(2);
    const messages = templates.debtSaldoCapital(saldoCapital);
    return messages.join('\n\n');
}

function getDeudaOption2(client) {
    const totalCuota = calculateSaldoCuota(client);
    const messages = templates.debtCuotaPendiente(totalCuota);
    return messages.join('\n\n');
}

function getDeudaOption3(client) {
    const diasAtraso = client.DIAS_ATRASO || 0;
    const messages = templates.debtDiasAtraso(diasAtraso);
    return messages.join('\n\n');
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

    // Get bot context/persona
    const botContext = (process.env.BOT_CONTEXT || 'Eres Max, asistente virtual de InformaPeru para cobranzas.').replace(/\\n/g, '\n');
    const botName = botContext.match(/(?:Eres|soy|me llamo)\s+(\w+)/i)?.[1] || 'Max';

    // 1. GREETING ONLY
    if (GREETING_ONLY_REGEX.test(lowText) && !session.cachedClient) {
        session.state = 'waiting_dni';
        const greetingMessages = templates.greetingNeutral();
        return greetingMessages.join('\n\n');
    }

    // 2. DEBT INQUIRY WITHOUT IDENTIFIER
    if (DEBT_INQUIRY_REGEX.test(lowText) && !session.cachedClient && !IDENTIFIER_REGEX.test(text)) {
        session.state = 'waiting_dni';
        return templates.askForDocument();
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
            return templates.clientNotFound();
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
            case 2: // Oficinas
                session.menuLevel = 'oficinas';
                const officeMessages = templates.officesInfo();
                return officeMessages.join('\n\n');
            case 3: // Actualizar teléfono
                session.menuLevel = 'telefono';
                const phoneMessages = templates.updatePhoneRequest();
                return phoneMessages.join('\n\n');
            case 4: // Asesor
                session.menuLevel = 'asesor_inicio';
                const advisorMessages = templates.advisorRequest();
                return advisorMessages.join('\n\n');
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
        if (['descuento', 'oficinas', 'otros', 'telefono', 'asesor_inicio', 'deuda_submenu'].includes(session.menuLevel)) {
            session.menuLevel = 'main';
            return getMenuOnly(getClientName(session.cachedClient));
        }
    }

    // 7. ADVISOR REQUEST
    if (ADVISOR_REGEX.test(lowText)) {
        // If not identified, ask for DNI first
        if (!session.cachedClient) {
            session.state = 'waiting_dni';
            return templates.askForDocument();
        }

        // If in asesor_inicio state, capture the query and send email
        if (session.menuLevel === 'asesor_inicio') {
            const dni = session.cachedClient.DOCUMENTO || session.cachedClient.CUENTA_CREDITO || 'Sin ID';
            await sendAdvisorEmail(dni, text);
            session.menuLevel = 'main';
            const confirmMessages = templates.advisorTransferConfirm();
            return confirmMessages.join('\n\n');
        }

        // Otherwise, show advisor request template
        session.menuLevel = 'asesor_inicio';
        const advisorMessages = templates.advisorRequest();
        return advisorMessages.join('\n\n');
    }

    // 8. AI FALLBACK
    console.log('🤖 AI Fallback');

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
