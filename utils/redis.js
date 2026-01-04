/**
 * Redis Cache Client for Session Management
 * TTL: 4 minutes for inactive sessions
 */
require('dotenv').config();
const Redis = require('ioredis');
const logger = require('./logger');

const SESSION_TTL = 4 * 60; // 4 minutes in seconds

let redis = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
async function connect() {
    if (redis && isConnected) return redis;

    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || 6379;

    try {
        redis = new Redis({
            host,
            port,
            retryStrategy: (times) => {
                if (times > 3) {
                    logger.error('REDIS', `No se pudo conectar después de ${times} intentos`);
                    return null;
                }
                return Math.min(times * 200, 2000);
            },
            maxRetriesPerRequest: 3
        });

        redis.on('connect', () => {
            isConnected = true;
            logger.connection('REDIS', true, `${host}:${port}`);
        });

        redis.on('error', (err) => {
            isConnected = false;
            logger.error('REDIS', 'Error de conexión', err);
        });

        redis.on('close', () => {
            isConnected = false;
            logger.warn('REDIS', 'Conexión cerrada');
        });

        // Test connection
        await redis.ping();
        return redis;

    } catch (err) {
        logger.error('REDIS', 'Error al conectar', err);
        isConnected = false;
        return null;
    }
}

/**
 * Get session data for a JID
 * @param {string} jid - WhatsApp JID
 * @returns {object|null} Session data or null
 */
async function getSession(jid) {
    if (!redis || !isConnected) {
        await connect();
    }

    try {
        const data = await redis.get(`session:${jid}`);
        if (data) {
            logger.debug('REDIS', `📦 Sesión encontrada: ${jid}`);
            // Extend TTL on read (keep session alive)
            await redis.expire(`session:${jid}`, SESSION_TTL);
            return JSON.parse(data);
        }
        logger.debug('REDIS', `📭 Sin sesión para: ${jid}`);
        return null;
    } catch (err) {
        logger.error('REDIS', 'Error al obtener sesión', err);
        return null;
    }
}

/**
 * Save session data for a JID
 * @param {string} jid - WhatsApp JID
 * @param {object} data - Session data to store
 */
async function setSession(jid, data) {
    if (!redis || !isConnected) {
        await connect();
    }

    try {
        await redis.setex(`session:${jid}`, SESSION_TTL, JSON.stringify(data));
        logger.debug('REDIS', `💾 Sesión guardada: ${jid} (TTL: ${SESSION_TTL / 60}min)`);
        return true;
    } catch (err) {
        logger.error('REDIS', 'Error al guardar sesión', err);
        return false;
    }
}

/**
 * Delete session for a JID
 * @param {string} jid - WhatsApp JID
 */
async function deleteSession(jid) {
    if (!redis || !isConnected) return false;

    try {
        await redis.del(`session:${jid}`);
        logger.sessionExpired(jid);
        return true;
    } catch (err) {
        logger.error('REDIS', 'Error al eliminar sesión', err);
        return false;
    }
}

/**
 * Extend session TTL
 * @param {string} jid - WhatsApp JID
 */
async function extendSession(jid) {
    if (!redis || !isConnected) return false;

    try {
        const exists = await redis.exists(`session:${jid}`);
        if (exists) {
            await redis.expire(`session:${jid}`, SESSION_TTL);
            logger.debug('REDIS', `⏰ TTL extendido: ${jid}`);
            return true;
        }
        return false;
    } catch (err) {
        logger.error('REDIS', 'Error al extender TTL', err);
        return false;
    }
}

/**
 * Check if Redis is connected
 */
function isRedisConnected() {
    return isConnected;
}

/**
 * Get connection status object
 */
function getStatus() {
    return {
        connected: isConnected,
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
    };
}

module.exports = {
    connect,
    getSession,
    setSession,
    deleteSession,
    extendSession,
    isRedisConnected,
    getStatus
};
