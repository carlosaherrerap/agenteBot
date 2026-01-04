/**
 * Centralized Logging System for InformaPeru Chatbot
 * DEBUG_LOGS controls verbose/debug messages only
 * Connection, success, warning, and error logs are ALWAYS visible
 */
require('dotenv').config();

// DEBUG controls only verbose messages - important logs are always shown
const DEBUG = process.env.DEBUG_LOGS !== 'false'; // Default TRUE unless explicitly false

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

const PREFIXES = {
    SQL: `${COLORS.cyan}[SQL]${COLORS.reset}`,
    REDIS: `${COLORS.magenta}[REDIS]${COLORS.reset}`,
    WHATSAPP: `${COLORS.green}[WHATSAPP]${COLORS.reset}`,
    EXCEL: `${COLORS.yellow}[EXCEL]${COLORS.reset}`,
    BOT: `${COLORS.blue}[BOT]${COLORS.reset}`,
    AI: `${COLORS.cyan}[AI]${COLORS.reset}`,
    SYSTEM: `${COLORS.white}[SYSTEM]${COLORS.reset}`
};

function getTimestamp() {
    return new Date().toLocaleTimeString('es-PE', { hour12: false });
}

function formatMessage(prefix, emoji, message) {
    return `${COLORS.gray}[${getTimestamp()}]${COLORS.reset} ${prefix} ${emoji} ${message}`;
}

const logger = {
    /**
     * Info log - always visible
     */
    info(category, message) {
        const prefix = PREFIXES[category] || PREFIXES.SYSTEM;
        console.log(formatMessage(prefix, 'ℹ️', message));
    },

    /**
     * Success log - always visible
     */
    success(category, message) {
        const prefix = PREFIXES[category] || PREFIXES.SYSTEM;
        console.log(formatMessage(prefix, '✅', `${COLORS.green}${message}${COLORS.reset}`));
    },

    /**
     * Warning log - always visible
     */
    warn(category, message) {
        const prefix = PREFIXES[category] || PREFIXES.SYSTEM;
        console.log(formatMessage(prefix, '⚠️', `${COLORS.yellow}${message}${COLORS.reset}`));
    },

    /**
     * Error log - always visible
     */
    error(category, message, error = null) {
        const prefix = PREFIXES[category] || PREFIXES.SYSTEM;
        console.error(formatMessage(prefix, '❌', `${COLORS.red}${message}${COLORS.reset}`));
        if (error && DEBUG) {
            console.error(`${COLORS.gray}   └─ ${error.message || error}${COLORS.reset}`);
        }
    },

    /**
     * Debug log - only visible when DEBUG_LOGS=true
     */
    debug(category, message) {
        if (!DEBUG) return;
        const prefix = PREFIXES[category] || PREFIXES.SYSTEM;
        console.log(formatMessage(prefix, '🔍', `${COLORS.gray}${message}${COLORS.reset}`));
    },

    /**
     * Connection status log
     */
    connection(type, connected, details = '') {
        const prefix = PREFIXES[type] || PREFIXES.SYSTEM;
        const status = connected ? `${COLORS.green}CONECTADO${COLORS.reset}` : `${COLORS.red}DESCONECTADO${COLORS.reset}`;
        const detailStr = details ? ` - ${details}` : '';
        console.log(formatMessage(prefix, connected ? '🔌' : '🔴', `${status}${detailStr}`));
    },

    /**
     * Phone/Client log - formatted prominently
     */
    phone(phone, found, extraData = null) {
        console.log('\n' + '═'.repeat(50));
        console.log(`${COLORS.bright}${COLORS.cyan}->TELEFONO_CLIENTE: ${phone}${COLORS.reset}`);
        console.log(`${COLORS.bright}->TELEFONO_ENCONTRADO: ${found ? `${COLORS.green}TRUE` : `${COLORS.red}FALSE`}${COLORS.reset}`);
        if (!found && extraData) {
            console.log(`${COLORS.bright}->TELEFONO_AGREGADO_EXCEL:{${COLORS.reset}`);
            console.log(`   CUENTA_CREDITO: ${extraData.CUENTA_CREDITO || 'N/A'}`);
            console.log(`   NOMBRE_CLIENTE: ${extraData.NOMBRE_CLIENTE || 'N/A'}`);
            console.log(`   telefono_nuevo: ${extraData.telefono_nuevo}`);
            console.log('}');
        }
        console.log('═'.repeat(50) + '\n');
    },

    /**
     * Session expired log
     */
    sessionExpired(jid) {
        console.log('\n' + '─'.repeat(40));
        console.log(`${COLORS.yellow}>>SE HA AGOTADO EL TIEMPO DE RESPUESTA...${COLORS.reset}`);
        console.log(`${COLORS.yellow}>>CERRANDO SESIÓN DEL USUARIO. 👋${COLORS.reset}`);
        console.log(`   JID: ${jid}`);
        console.log('─'.repeat(40) + '\n');
    },

    /**
     * Startup banner
     */
    banner() {
        console.log('\n');
        console.log(`${COLORS.cyan}╔════════════════════════════════════════════════════════╗${COLORS.reset}`);
        console.log(`${COLORS.cyan}║${COLORS.reset}  ${COLORS.bright}🤖 CHATBOT COBRANZA - INFORMAPERU v2.0${COLORS.reset}              ${COLORS.cyan}║${COLORS.reset}`);
        console.log(`${COLORS.cyan}║${COLORS.reset}  ${COLORS.gray}Max, tu asistente virtual de cobranzas${COLORS.reset}              ${COLORS.cyan}║${COLORS.reset}`);
        console.log(`${COLORS.cyan}╚════════════════════════════════════════════════════════╝${COLORS.reset}`);
        console.log(`${COLORS.gray}   DEBUG_LOGS: ${DEBUG ? `${COLORS.green}ACTIVADO` : `${COLORS.yellow}SOLO CRÍTICOS`}${COLORS.reset}`);
        console.log(`${COLORS.gray}   (Logs de conexión y errores siempre visibles)${COLORS.reset}`);
        console.log('\n');
    }
};

module.exports = logger;
