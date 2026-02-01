/**
 * GCR Downloader - Debug Logging Module
 * Controlled logging that can be disabled in production
 * SECURITY: Never log sensitive data like tokens
 * 
 * MED-001 FIX: All logging is controlled by PRODUCTION_MODE flag
 * Set PRODUCTION_MODE = true to disable all non-error logging
 * 
 * @module debug
 * @version 2.0.0
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * PRODUCTION MODE - Set to true to disable all non-essential logging
 * This addresses MED-001: Too many console.log statements
 * 
 * In production:
 * - Only errors are logged
 * - All debug/info/trace logs are silenced
 * - Token/sensitive data is never logged regardless
 */
export const PRODUCTION_MODE = false; // Set to true for production builds

/**
 * Debug mode flag - set to false for production
 * Can also be toggled via chrome.storage.local.set({ gcr_debug: true })
 */
let DEBUG_ENABLED = !PRODUCTION_MODE && false;

/**
 * Log levels
 */
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

/**
 * Current log level (errors and warnings always shown)
 */
let currentLogLevel = LOG_LEVELS.WARN;

/**
 * Sensitive field names that should never be logged
 */
const SENSITIVE_FIELDS = [
    'token',
    'accessToken',
    'access_token',
    'refreshToken',
    'refresh_token',
    'password',
    'secret',
    'key',
    'authorization',
    'auth',
    'bearer',
    'credential',
    'apiKey',
    'api_key',
    'client_secret',
    'clientSecret'
];

/**
 * Maximum length for logged strings
 */
const MAX_STRING_LENGTH = 200;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes debug mode from storage
 */
async function initDebugMode() {
    try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const result = await chrome.storage.local.get('gcr_debug');
            DEBUG_ENABLED = result.gcr_debug === true;
            if (DEBUG_ENABLED) {
                currentLogLevel = LOG_LEVELS.DEBUG;
            }
        }
    } catch (e) {
        // ERR-002 FIX: Log debug initialization failures (non-fatal, use defaults)
        // This helps diagnose issues in restricted contexts
        if (typeof console !== 'undefined') {
            console.debug('[GCR Debug] Debug mode init failed, using defaults:', e.message || e);
        }
    }
}

// Initialize on load
initDebugMode();

// ============================================================================
// SANITIZATION
// ============================================================================

/**
 * Sanitizes a value for logging, removing sensitive data
 * @param {any} value - Value to sanitize
 * @param {Set} seen - Set of seen objects (for circular reference detection)
 * @returns {any} Sanitized value
 */
function sanitizeValue(value, seen = new Set()) {
    if (value === null || value === undefined) {
        return value;
    }

    // Handle primitives
    if (typeof value !== 'object') {
        if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
            return value.substring(0, MAX_STRING_LENGTH) + '... [truncated]';
        }
        return value;
    }

    // Detect circular references
    if (seen.has(value)) {
        return '[Circular Reference]';
    }
    seen.add(value);

    // Handle arrays
    if (Array.isArray(value)) {
        return value.slice(0, 10).map(v => sanitizeValue(v, seen));
    }

    // Handle objects
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
        // Check if key is sensitive
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field.toLowerCase()))) {
            sanitized[key] = '[REDACTED]';
        } else {
            sanitized[key] = sanitizeValue(val, seen);
        }
    }

    return sanitized;
}

/**
 * Formats arguments for logging
 * @param {Array} args - Arguments to format
 * @returns {Array} Formatted arguments
 */
function formatArgs(args) {
    return args.map(arg => {
        if (arg instanceof Error) {
            return {
                name: arg.name,
                message: arg.message,
                code: arg.code,
                // Don't include stack in production
                ...(DEBUG_ENABLED && { stack: arg.stack })
            };
        }
        return sanitizeValue(arg);
    });
}

// ============================================================================
// LOGGING FUNCTIONS
// ============================================================================

/**
 * Creates a logger function for a specific context
 * MED-001 FIX: All logging respects PRODUCTION_MODE
 * @param {string} context - Logger context (e.g., 'Auth', 'API', 'Download')
 * @returns {Object} Logger object with log methods
 */
export function createLogger(context) {
    const prefix = `[GCR ${context}]`;

    return {
        /**
         * Logs an error (always shown, even in production)
         * @param {...any} args - Arguments to log
         */
        error(...args) {
            console.error(prefix, ...formatArgs(args));
        },

        /**
         * Logs a warning (shown unless in strict production mode)
         * @param {...any} args - Arguments to log
         */
        warn(...args) {
            if (!PRODUCTION_MODE) {
                console.warn(prefix, ...formatArgs(args));
            }
        },

        /**
         * Logs info (shown if log level >= INFO and not production)
         * @param {...any} args - Arguments to log
         */
        info(...args) {
            if (!PRODUCTION_MODE && currentLogLevel >= LOG_LEVELS.INFO) {
                console.log(prefix, ...formatArgs(args));
            }
        },

        /**
         * Logs debug info (shown only in debug mode, never in production)
         * @param {...any} args - Arguments to log
         */
        debug(...args) {
            if (!PRODUCTION_MODE && DEBUG_ENABLED && currentLogLevel >= LOG_LEVELS.DEBUG) {
                console.log(prefix, '[DEBUG]', ...formatArgs(args));
            }
        },

        /**
         * Logs trace info (shown only in debug mode with trace level, never in production)
         * @param {...any} args - Arguments to log
         */
        trace(...args) {
            if (!PRODUCTION_MODE && DEBUG_ENABLED && currentLogLevel >= LOG_LEVELS.TRACE) {
                console.log(prefix, '[TRACE]', ...formatArgs(args));
            }
        },

        /**
         * Logs a success message (not shown in production)
         * @param {...any} args - Arguments to log
         */
        success(...args) {
            if (!PRODUCTION_MODE && currentLogLevel >= LOG_LEVELS.INFO) {
                console.log(prefix, '✓', ...formatArgs(args));
            }
        },

        /**
         * Logs a timing measurement (not shown in production)
         * @param {string} label - Timing label
         * @param {number} startTime - Start timestamp from Date.now()
         */
        timing(label, startTime) {
            if (!PRODUCTION_MODE && DEBUG_ENABLED) {
                const duration = Date.now() - startTime;
                console.log(prefix, `[TIMING] ${label}: ${duration}ms`);
            }
        }
    };
}

// ============================================================================
// CONTROL FUNCTIONS
// ============================================================================

/**
 * Enables debug mode
 */
export async function enableDebug() {
    DEBUG_ENABLED = true;
    currentLogLevel = LOG_LEVELS.DEBUG;
    try {
        await chrome.storage.local.set({ gcr_debug: true });
        console.log('[GCR Debug] Debug mode enabled');
    } catch (e) {
        console.log('[GCR Debug] Debug mode enabled (storage unavailable)');
    }
}

/**
 * Disables debug mode
 */
export async function disableDebug() {
    DEBUG_ENABLED = false;
    currentLogLevel = LOG_LEVELS.WARN;
    try {
        await chrome.storage.local.set({ gcr_debug: false });
        console.log('[GCR Debug] Debug mode disabled');
    } catch (e) {
        console.log('[GCR Debug] Debug mode disabled (storage unavailable)');
    }
}

/**
 * Sets the log level
 * @param {number} level - Log level from LOG_LEVELS
 */
export function setLogLevel(level) {
    currentLogLevel = level;
}

/**
 * Gets the current debug status
 * @returns {Object} Debug status
 */
export function getDebugStatus() {
    return {
        enabled: DEBUG_ENABLED,
        level: currentLogLevel,
        levelName: Object.keys(LOG_LEVELS).find(k => LOG_LEVELS[k] === currentLogLevel)
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { LOG_LEVELS };

// Create default loggers for common contexts
export const authLogger = createLogger('Auth');
export const apiLogger = createLogger('API');
export const downloadLogger = createLogger('Download');
export const contentLogger = createLogger('Content');
export const backgroundLogger = createLogger('Background');
export const storageLogger = createLogger('Storage');
export const cacheLogger = createLogger('Cache');

// Simple global log function (for backward compatibility)
// MED-001 FIX: Respects PRODUCTION_MODE
export function log(...args) {
    if (!PRODUCTION_MODE && DEBUG_ENABLED) {
        console.log('[GCR]', ...formatArgs(args));
    }
}

// Only show module loaded message if not in production
if (!PRODUCTION_MODE) {
    console.log('[GCR] Debug module loaded');
}
