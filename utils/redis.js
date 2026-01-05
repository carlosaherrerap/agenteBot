/**
 * Redis Cache Client for Session Management
 * TTL: 4 minutes for inactive sessions
 * FALLBACK: Uses in-memory cache if Redis is not available
 */
require('dotenv').config();
const logger = require('./logger');

const SESSION_TTL = 4 * 60; // 4 minutes in seconds
const SESSION_TTL_MS = SESSION_TTL * 1000;

let redis = null;
let isConnected = false;
let useMemoryFallback = false;

// In-memory fallback cache
const memoryCache = new Map();
const memoryCacheTimers = new Map();

/**
 * Initialize Redis connection
 */
async function connect() {
    if (redis && isConnected) return redis;

    // Check if Redis is disabled
    if (process.env.REDIS_ENABLED === 'false') {
        useMemoryFallback = true;
        logger.warn('REDIS', 'Redis deshabilitado - usando caché en memoria');
        return null;
    }

    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || 6379;

    try {
        const Redis = require('ioredis');

        redis = new Redis({
            host,
            port,
            retryStrategy: (times) => {
                if (times > 2) {
                    logger.warn('REDIS', 'No disponible - usando caché en memoria como fallback');
                    useMemoryFallback = true;
                    return null; // Stop retrying
                }
                return Math.min(times * 200, 1000);
            },
            maxRetriesPerRequest: 2,
            connectTimeout: 3000
        });

        redis.on('connect', () => {
            isConnected = true;
            useMemoryFallback = false;
            logger.connection('REDIS', true, `${host}:${port}`);
        });

        redis.on('error', (err) => {
            if (!useMemoryFallback) {
                isConnected = false;
            }
        });

        redis.on('close', () => {
            isConnected = false;
        });

        // Test connection with short timeout
        await Promise.race([
            redis.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
        ]);

        return redis;

    } catch (err) {
        useMemoryFallback = true;
        logger.warn('REDIS', 'No disponible - usando caché en memoria');
        return null;
    }
}

/**
 * Get session data for a JID
 * @param {string} jid - WhatsApp JID
 * @returns {object|null} Session data or null
 */
async function getSession(jid) {
    // Use memory fallback
    if (useMemoryFallback) {
        const data = memoryCache.get(jid);
        if (data) {
            // Extend TTL on read
            resetMemoryTimer(jid);
            return data;
        }
        return null;
    }

    // Use Redis
    if (!redis || !isConnected) {
        await connect();
        if (useMemoryFallback) return getSession(jid); // Retry with memory
    }

    try {
        const data = await redis.get(`session:${jid}`);
        if (data) {
            logger.debug('REDIS', `📦 Sesión encontrada: ${jid}`);
            await redis.expire(`session:${jid}`, SESSION_TTL);
            return JSON.parse(data);
        }
        return null;
    } catch (err) {
        // Fallback to memory on error
        useMemoryFallback = true;
        return memoryCache.get(jid) || null;
    }
}

/**
 * Callback function for session expiration
 * Set from server.js to send WhatsApp message
 */
let onSessionExpiredCallback = null;

/**
 * Set callback for session expiration
 * @param {function} callback - function(jid) called when session expires
 */
function setOnSessionExpired(callback) {
    onSessionExpiredCallback = callback;
}

/**
 * Reset memory cache timer for TTL
 */
function resetMemoryTimer(jid) {
    if (memoryCacheTimers.has(jid)) {
        clearTimeout(memoryCacheTimers.get(jid));
    }
    const timer = setTimeout(async () => {
        memoryCache.delete(jid);
        memoryCacheTimers.delete(jid);
        logger.sessionExpired(jid);

        // Call the callback to send WhatsApp message
        if (onSessionExpiredCallback) {
            try {
                await onSessionExpiredCallback(jid);
            } catch (err) {
                logger.error('REDIS', 'Error en callback de sesión expirada', err);
            }
        }
    }, SESSION_TTL_MS);
    memoryCacheTimers.set(jid, timer);
}

/**
 * Save session data for a JID
 * @param {string} jid - WhatsApp JID
 * @param {object} data - Session data to store
 */
async function setSession(jid, data) {
    // Use memory fallback
    if (useMemoryFallback) {
        memoryCache.set(jid, data);
        resetMemoryTimer(jid);
        logger.debug('REDIS', `💾 Sesión guardada en memoria: ${jid}`);
        return true;
    }

    // Use Redis
    if (!redis || !isConnected) {
        await connect();
        if (useMemoryFallback) return setSession(jid, data);
    }

    try {
        await redis.setex(`session:${jid}`, SESSION_TTL, JSON.stringify(data));
        logger.debug('REDIS', `💾 Sesión guardada: ${jid} (TTL: ${SESSION_TTL / 60}min)`);
        return true;
    } catch (err) {
        // Fallback to memory
        useMemoryFallback = true;
        memoryCache.set(jid, data);
        resetMemoryTimer(jid);
        return true;
    }
}

/**
 * Delete session for a JID
 * @param {string} jid - WhatsApp JID
 */
async function deleteSession(jid) {
    // Memory fallback
    if (useMemoryFallback) {
        if (memoryCacheTimers.has(jid)) {
            clearTimeout(memoryCacheTimers.get(jid));
            memoryCacheTimers.delete(jid);
        }
        memoryCache.delete(jid);
        logger.sessionExpired(jid);
        return true;
    }

    if (!redis || !isConnected) return false;

    try {
        await redis.del(`session:${jid}`);
        logger.sessionExpired(jid);
        return true;
    } catch (err) {
        return false;
    }
}

/**
 * Extend session TTL
 * @param {string} jid - WhatsApp JID
 */
async function extendSession(jid) {
    // Memory fallback
    if (useMemoryFallback) {
        if (memoryCache.has(jid)) {
            resetMemoryTimer(jid);
            return true;
        }
        return false;
    }

    if (!redis || !isConnected) return false;

    try {
        const exists = await redis.exists(`session:${jid}`);
        if (exists) {
            await redis.expire(`session:${jid}`, SESSION_TTL);
            return true;
        }
        return false;
    } catch (err) {
        return false;
    }
}

/**
 * Check if Redis is connected (or using memory fallback)
 */
function isRedisConnected() {
    return isConnected || useMemoryFallback;
}

/**
 * Get connection status object
 */
function getStatus() {
    return {
        connected: isConnected,
        usingMemoryFallback: useMemoryFallback,
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
    };
}

/**
 * Persistent LID to Phone mapping (30 days TTL)
 * @param {string} lid - Linked ID JID
 * @param {string} phone - Real phone number
 */
async function setLidMapping(lid, phone) {
    if (useMemoryFallback) {
        memoryCache.set(`lid:${lid}`, phone);
        return true;
    }
    if (!redis || !isConnected) await connect();
    try {
        await redis.setex(`lid:${lid}`, 30 * 24 * 60 * 60, phone);
        return true;
    } catch (err) {
        memoryCache.set(`lid:${lid}`, phone);
        return true;
    }
}

/**
 * Get phone number for a LID
 * @param {string} lid - Linked ID JID
 * @returns {string|null} Phone number or null
 */
async function getLidMapping(lid) {
    if (useMemoryFallback) return memoryCache.get(`lid:${lid}`) || null;
    if (!redis || !isConnected) await connect();
    try {
        return await redis.get(`lid:${lid}`);
    } catch (err) {
        return memoryCache.get(`lid:${lid}`) || null;
    }
}

module.exports = {
    connect,
    getSession,
    setSession,
    deleteSession,
    extendSession,
    isRedisConnected,
    getStatus,
    setOnSessionExpired,
    setLidMapping,
    getLidMapping
};
