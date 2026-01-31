/**
 * GCR Downloader - Error Handling Module
 * Standardized error classes and utilities for consistent error handling
 * 
 * @module errors
 * @version 1.0.0
 */

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Error codes for categorizing errors
 */
export const ERROR_CODES = {
    // Authentication errors (1xxx)
    AUTH_REQUIRED: 1001,
    AUTH_FAILED: 1002,
    AUTH_CANCELED: 1003,
    AUTH_TOKEN_EXPIRED: 1004,
    AUTH_TOKEN_INVALID: 1005,
    AUTH_REFRESH_FAILED: 1006,
    AUTH_NETWORK_ERROR: 1007,

    // API errors (2xxx)
    API_REQUEST_FAILED: 2001,
    API_RATE_LIMITED: 2002,
    API_NOT_FOUND: 2003,
    API_FORBIDDEN: 2004,
    API_SERVER_ERROR: 2005,
    API_TIMEOUT: 2006,
    API_NETWORK_ERROR: 2007,

    // Download errors (3xxx)
    DOWNLOAD_FAILED: 3001,
    DOWNLOAD_CANCELED: 3002,
    DOWNLOAD_TIMEOUT: 3003,
    DOWNLOAD_FILE_NOT_FOUND: 3004,
    DOWNLOAD_PERMISSION_DENIED: 3005,
    DOWNLOAD_DISK_FULL: 3006,
    DOWNLOAD_MEMORY_EXCEEDED: 3007,

    // Validation errors (4xxx)
    VALIDATION_INVALID_INPUT: 4001,
    VALIDATION_MISSING_REQUIRED: 4002,
    VALIDATION_INVALID_COURSE_ID: 4003,
    VALIDATION_INVALID_FILE_ID: 4004,
    VALIDATION_PATH_TRAVERSAL: 4005,
    VALIDATION_XSS_DETECTED: 4006,
    VALIDATION_INVALID_MIME_TYPE: 4007,

    // Storage errors (5xxx)
    STORAGE_QUOTA_EXCEEDED: 5001,
    STORAGE_READ_FAILED: 5002,
    STORAGE_WRITE_FAILED: 5003,
    STORAGE_LOCK_TIMEOUT: 5004,

    // Extension errors (6xxx)
    EXTENSION_CONTEXT_INVALID: 6001,
    EXTENSION_MESSAGE_FAILED: 6002,
    EXTENSION_PERMISSION_DENIED: 6003,

    // Unknown
    UNKNOWN: 9999
};

// ============================================================================
// CUSTOM ERROR CLASS
// ============================================================================

/**
 * Custom error class for GCR Downloader
 * Provides structured error information for better handling and reporting
 */
export class GCRError extends Error {
    /**
     * Creates a GCRError instance
     * @param {number} code - Error code from ERROR_CODES
     * @param {string} message - Human-readable error message
     * @param {Object} context - Additional context about the error
     * @param {Error} cause - Original error that caused this error
     */
    constructor(code, message, context = {}, cause = null) {
        super(message);
        this.name = 'GCRError';
        this.code = code;
        this.context = context;
        this.cause = cause;
        this.timestamp = Date.now();
        this.retryable = this._isRetryable(code);

        // Capture stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, GCRError);
        }
    }

    /**
     * Determines if an error is retryable based on its code
     * @param {number} code - Error code
     * @returns {boolean} True if retryable
     */
    _isRetryable(code) {
        const retryableCodes = [
            ERROR_CODES.API_RATE_LIMITED,
            ERROR_CODES.API_SERVER_ERROR,
            ERROR_CODES.API_TIMEOUT,
            ERROR_CODES.API_NETWORK_ERROR,
            ERROR_CODES.AUTH_NETWORK_ERROR,
            ERROR_CODES.DOWNLOAD_TIMEOUT,
            ERROR_CODES.STORAGE_LOCK_TIMEOUT
        ];
        return retryableCodes.includes(code);
    }

    /**
     * Gets a user-friendly error message
     * @returns {string} User-friendly message
     */
    getUserMessage() {
        const userMessages = {
            [ERROR_CODES.AUTH_REQUIRED]: 'Please sign in to continue.',
            [ERROR_CODES.AUTH_FAILED]: 'Authentication failed. Please try signing in again.',
            [ERROR_CODES.AUTH_CANCELED]: 'Sign in was canceled.',
            [ERROR_CODES.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please sign in again.',
            [ERROR_CODES.AUTH_TOKEN_INVALID]: 'Your session is invalid. Please sign in again.',
            [ERROR_CODES.API_RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
            [ERROR_CODES.API_NOT_FOUND]: 'The requested resource was not found.',
            [ERROR_CODES.API_FORBIDDEN]: 'You don\'t have permission to access this resource.',
            [ERROR_CODES.API_SERVER_ERROR]: 'Google\'s servers encountered an error. Please try again.',
            [ERROR_CODES.API_TIMEOUT]: 'The request timed out. Please check your connection.',
            [ERROR_CODES.API_NETWORK_ERROR]: 'Network error. Please check your internet connection.',
            [ERROR_CODES.DOWNLOAD_FAILED]: 'Download failed. Please try again.',
            [ERROR_CODES.DOWNLOAD_CANCELED]: 'Download was canceled.',
            [ERROR_CODES.DOWNLOAD_PERMISSION_DENIED]: 'Permission denied to save the file.',
            [ERROR_CODES.DOWNLOAD_MEMORY_EXCEEDED]: 'File is too large to download.',
            [ERROR_CODES.VALIDATION_INVALID_INPUT]: 'Invalid input provided.',
            [ERROR_CODES.VALIDATION_PATH_TRAVERSAL]: 'Invalid path detected.',
            [ERROR_CODES.VALIDATION_XSS_DETECTED]: 'Invalid content detected.',
            [ERROR_CODES.EXTENSION_CONTEXT_INVALID]: 'Extension was reloaded. Please refresh the page.'
        };

        return userMessages[this.code] || this.message;
    }

    /**
     * Serializes the error for logging/storage
     * @returns {Object} Serialized error
     */
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            context: this.context,
            timestamp: this.timestamp,
            retryable: this.retryable,
            stack: this.stack
        };
    }

    /**
     * Creates a GCRError from a standard Error
     * @param {Error} error - Standard error
     * @param {number} code - Error code to use
     * @param {Object} context - Additional context
     * @returns {GCRError} GCRError instance
     */
    static fromError(error, code = ERROR_CODES.UNKNOWN, context = {}) {
        if (error instanceof GCRError) {
            return error;
        }

        // Try to determine error code from message
        const inferredCode = GCRError._inferCode(error);
        
        return new GCRError(
            inferredCode || code,
            error.message || 'An unknown error occurred',
            context,
            error
        );
    }

    /**
     * Infers error code from error message or properties
     * @param {Error} error - Error to analyze
     * @returns {number|null} Inferred error code or null
     */
    static _inferCode(error) {
        const message = (error.message || '').toLowerCase();
        const status = error.status || error.code;

        // HTTP status codes
        if (status === 401) return ERROR_CODES.AUTH_TOKEN_INVALID;
        if (status === 403) return ERROR_CODES.API_FORBIDDEN;
        if (status === 404) return ERROR_CODES.API_NOT_FOUND;
        if (status === 429) return ERROR_CODES.API_RATE_LIMITED;
        if (status >= 500) return ERROR_CODES.API_SERVER_ERROR;

        // Message patterns
        if (message.includes('timeout')) return ERROR_CODES.API_TIMEOUT;
        if (message.includes('network') || message.includes('fetch')) return ERROR_CODES.API_NETWORK_ERROR;
        if (message.includes('cancel')) return ERROR_CODES.DOWNLOAD_CANCELED;
        if (message.includes('abort')) return ERROR_CODES.DOWNLOAD_CANCELED;
        if (message.includes('extension context')) return ERROR_CODES.EXTENSION_CONTEXT_INVALID;
        if (message.includes('token')) return ERROR_CODES.AUTH_TOKEN_INVALID;
        if (message.includes('auth')) return ERROR_CODES.AUTH_FAILED;

        return null;
    }
}

// ============================================================================
// ERROR FACTORY FUNCTIONS
// ============================================================================

/**
 * Creates an authentication error
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 * @returns {GCRError} GCRError instance
 */
export function authError(message, context = {}) {
    return new GCRError(ERROR_CODES.AUTH_FAILED, message, context);
}

/**
 * Creates an API error
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 * @returns {GCRError} GCRError instance
 */
export function apiError(status, message, context = {}) {
    let code = ERROR_CODES.API_REQUEST_FAILED;
    if (status === 401) code = ERROR_CODES.AUTH_TOKEN_INVALID;
    else if (status === 403) code = ERROR_CODES.API_FORBIDDEN;
    else if (status === 404) code = ERROR_CODES.API_NOT_FOUND;
    else if (status === 429) code = ERROR_CODES.API_RATE_LIMITED;
    else if (status >= 500) code = ERROR_CODES.API_SERVER_ERROR;

    return new GCRError(code, message, { status, ...context });
}

/**
 * Creates a validation error
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 * @returns {GCRError} GCRError instance
 */
export function validationError(message, context = {}) {
    return new GCRError(ERROR_CODES.VALIDATION_INVALID_INPUT, message, context);
}

/**
 * Creates a download error
 * @param {string} message - Error message
 * @param {Object} context - Additional context
 * @returns {GCRError} GCRError instance
 */
export function downloadError(message, context = {}) {
    return new GCRError(ERROR_CODES.DOWNLOAD_FAILED, message, context);
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Safely executes an async function and returns a result tuple
 * @param {Function} fn - Async function to execute
 * @returns {Promise<[Error|null, any]>} Tuple of [error, result]
 */
export async function safeAsync(fn) {
    try {
        const result = await fn();
        return [null, result];
    } catch (error) {
        return [GCRError.fromError(error), null];
    }
}

/**
 * Wraps a function to handle errors consistently
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Options
 * @param {Function} options.onError - Error handler
 * @param {any} options.fallback - Fallback value on error
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, options = {}) {
    const { onError, fallback } = options;

    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (error) {
            const gcrError = GCRError.fromError(error);
            
            if (onError) {
                onError(gcrError);
            }

            if (fallback !== undefined) {
                return fallback;
            }

            throw gcrError;
        }
    };
}

/**
 * Logs an error without exposing sensitive data
 * @param {string} context - Context description
 * @param {Error} error - Error to log
 * @param {Object} additionalInfo - Additional info to log
 */
export function logError(context, error, additionalInfo = {}) {
    const safeInfo = { ...additionalInfo };
    
    // Remove sensitive fields
    delete safeInfo.token;
    delete safeInfo.accessToken;
    delete safeInfo.password;
    delete safeInfo.authorization;

    const gcrError = error instanceof GCRError ? error : GCRError.fromError(error);
    
    console.error(`[GCR ${context}]`, {
        code: gcrError.code,
        message: gcrError.message,
        retryable: gcrError.retryable,
        ...safeInfo
    });
}

console.log('[GCR] Errors module loaded');
