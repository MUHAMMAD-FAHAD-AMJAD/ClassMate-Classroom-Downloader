/**
 * GCR Downloader - Helper Utilities
 * Common utility functions used across the extension
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum filename length to prevent filesystem errors
 */
export const MAX_FILENAME_LENGTH = 100;

/**
 * Characters not allowed in filenames (Windows/Mac/Linux compatible)
 */
export const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Emoji and special character regex for filename sanitization
 */
export const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]/gu;

/**
 * MIME type to export format mapping for Google Workspace files
 */
export const GOOGLE_EXPORT_FORMATS = {
    'application/vnd.google-apps.document': {
        mimeType: 'application/pdf',
        extension: '.pdf',
        name: 'PDF'
    },
    'application/vnd.google-apps.spreadsheet': {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: '.xlsx',
        name: 'Excel'
    },
    'application/vnd.google-apps.presentation': {
        mimeType: 'application/pdf',
        extension: '.pdf',
        name: 'PDF'
    },
    'application/vnd.google-apps.drawing': {
        mimeType: 'image/png',
        extension: '.png',
        name: 'PNG'
    },
    'application/vnd.google-apps.form': {
        mimeType: 'text/plain',
        extension: '.txt',
        name: 'Link'
    }
};

/**
 * Common MIME type to extension mapping
 */
export const MIME_TO_EXTENSION = {
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
    'application/msword': '.doc',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.ms-powerpoint': '.ppt',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'application/zip': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/x-7z-compressed': '.7z',
    'text/plain': '.txt',
    'text/html': '.html',
    'text/css': '.css',
    'application/javascript': '.js',
    'application/json': '.json'
};

// ============================================================================
// DEBOUNCE FUNCTION
// ============================================================================

/**
 * Creates a debounced version of a function that delays execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Delay in milliseconds
 * @param {boolean} immediate - Execute immediately on first call
 * @returns {Function} Debounced function with cancel method
 */
export function debounce(func, wait, immediate = false) {
    let timeout;
    let lastArgs;
    let lastThis;

    function debounced(...args) {
        lastArgs = args;
        lastThis = this;

        const callNow = immediate && !timeout;

        clearTimeout(timeout);

        timeout = setTimeout(() => {
            timeout = null;
            if (!immediate) {
                func.apply(lastThis, lastArgs);
            }
        }, wait);

        if (callNow) {
            func.apply(lastThis, lastArgs);
        }
    }

    // Allow canceling pending execution
    debounced.cancel = function () {
        clearTimeout(timeout);
        timeout = null;
    };

    return debounced;
}

// ============================================================================
// FILENAME UTILITIES
// ============================================================================

/**
 * Sanitizes a filename by removing invalid characters, emojis, and truncating
 * @param {string} filename - Original filename
 * @param {string} defaultName - Fallback name if filename becomes empty
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename, defaultName = 'download') {
    if (!filename || typeof filename !== 'string') {
        return defaultName;
    }

    let sanitized = filename
        // Remove emojis
        .replace(EMOJI_REGEX, '')
        // Remove invalid filesystem characters
        .replace(INVALID_FILENAME_CHARS, '_')
        // Replace multiple spaces/underscores with single
        .replace(/[\s_]+/g, '_')
        // Remove leading/trailing underscores and spaces
        .trim()
        .replace(/^_+|_+$/g, '');

    // If filename is now empty, use default
    if (!sanitized) {
        return defaultName;
    }

    // Truncate if too long (preserve extension)
    if (sanitized.length > MAX_FILENAME_LENGTH) {
        const lastDot = sanitized.lastIndexOf('.');
        if (lastDot > 0 && lastDot > sanitized.length - 10) {
            // Has extension, preserve it
            const ext = sanitized.substring(lastDot);
            const name = sanitized.substring(0, lastDot);
            sanitized = name.substring(0, MAX_FILENAME_LENGTH - ext.length) + ext;
        } else {
            sanitized = sanitized.substring(0, MAX_FILENAME_LENGTH);
        }
    }

    return sanitized;
}

/**
 * Gets the file extension from a MIME type
 * @param {string} mimeType - MIME type string
 * @returns {string} File extension including dot, or empty string
 */
export function getExtensionFromMimeType(mimeType) {
    if (!mimeType) return '';

    // Check known mappings first
    if (MIME_TO_EXTENSION[mimeType]) {
        return MIME_TO_EXTENSION[mimeType];
    }

    // Try to extract from MIME type
    const parts = mimeType.split('/');
    if (parts.length === 2) {
        const subtype = parts[1].split(';')[0].trim();
        // Handle common patterns
        if (subtype && !subtype.includes('.') && subtype.length < 10) {
            return '.' + subtype;
        }
    }

    return '';
}

/**
 * Ensures a filename has the correct extension
 * @param {string} filename - Original filename
 * @param {string} mimeType - Expected MIME type
 * @returns {string} Filename with correct extension
 */
export function ensureExtension(filename, mimeType) {
    if (!filename) return filename;

    const expectedExt = getExtensionFromMimeType(mimeType);
    if (!expectedExt) return filename;

    const currentExt = filename.substring(filename.lastIndexOf('.')).toLowerCase();

    // If already has correct extension, return as-is
    if (currentExt === expectedExt.toLowerCase()) {
        return filename;
    }

    // If has no extension or wrong extension, add correct one
    const hasExtension = filename.lastIndexOf('.') > 0;
    if (!hasExtension) {
        return filename + expectedExt;
    }

    return filename;
}

/**
 * Generates a unique filename by appending a number if duplicate exists
 * @param {string} filename - Original filename
 * @param {Set<string>} existingNames - Set of existing filenames
 * @returns {string} Unique filename
 */
export function makeUniqueFilename(filename, existingNames) {
    if (!existingNames.has(filename)) {
        existingNames.add(filename);
        return filename;
    }

    const lastDot = filename.lastIndexOf('.');
    let baseName, extension;

    if (lastDot > 0) {
        baseName = filename.substring(0, lastDot);
        extension = filename.substring(lastDot);
    } else {
        baseName = filename;
        extension = '';
    }

    let counter = 1;
    let newName;

    do {
        newName = `${baseName}(${counter})${extension}`;
        counter++;
    } while (existingNames.has(newName) && counter < 1000);

    existingNames.add(newName);
    return newName;
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Formats file size to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes || isNaN(bytes)) return 'Unknown size';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/**
 * Formats a timestamp to a readable date string
 * @param {string|number} timestamp - ISO string or Unix timestamp
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp) {
    if (!timestamp) return 'Unknown date';

    try {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return 'Unknown date';
    }
}

/**
 * Truncates a string to specified length with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
export function truncateString(str, maxLength = 50) {
    if (!str || str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Maps API error codes to user-friendly messages
 */
export const ERROR_MESSAGES = {
    401: {
        title: 'Session Expired',
        message: 'Your session has expired. Click to sign in again.',
        action: 'reauth'
    },
    403: {
        title: 'Access Denied',
        message: 'You don\'t have permission to access this resource.',
        action: 'skip'
    },
    404: {
        title: 'Not Found',
        message: 'This file no longer exists or has been moved.',
        action: 'skip'
    },
    429: {
        title: 'Rate Limited',
        message: 'Too many requests. Please wait a moment and try again.',
        action: 'retry'
    },
    500: {
        title: 'Server Error',
        message: 'Google servers are experiencing issues. Please try again later.',
        action: 'retry'
    },
    network: {
        title: 'No Connection',
        message: 'Please check your internet connection and try again.',
        action: 'retry'
    },
    unknown: {
        title: 'Something Went Wrong',
        message: 'An unexpected error occurred. Please try again.',
        action: 'retry'
    }
};

/**
 * Gets user-friendly error info from an error or status code
 * @param {Error|number} error - Error object or HTTP status code
 * @returns {Object} Error info with title, message, and suggested action
 */
export function getErrorInfo(error) {
    // Handle numeric status codes
    if (typeof error === 'number') {
        if (error >= 500) {
            return ERROR_MESSAGES[500];
        }
        return ERROR_MESSAGES[error] || ERROR_MESSAGES.unknown;
    }

    // Handle Error objects
    if (error instanceof Error) {
        // Network errors
        if (error.message.includes('Failed to fetch') ||
            error.message.includes('NetworkError') ||
            error.message.includes('network')) {
            return ERROR_MESSAGES.network;
        }

        // Try to extract status code from message
        const statusMatch = error.message.match(/(\d{3})/);
        if (statusMatch) {
            const status = parseInt(statusMatch[1], 10);
            return getErrorInfo(status);
        }
    }

    return ERROR_MESSAGES.unknown;
}

// ============================================================================
// URL UTILITIES
// ============================================================================

/**
 * Extracts course ID from Google Classroom URL
 * @param {string} url - Full URL string
 * @returns {string|null} Course ID or null if not found
 */
export function extractCourseId(url) {
    if (!url) return null;

    try {
        const urlObj = new URL(url);

        // Check if it's a classroom URL
        if (!urlObj.hostname.includes('classroom.google.com')) {
            return null;
        }

        // Pattern: /c/COURSE_ID or /c/COURSE_ID/...
        const courseMatch = urlObj.pathname.match(/\/c\/([^\/]+)/);
        if (courseMatch) {
            return courseMatch[1];
        }

        // Pattern: /u/0/c/COURSE_ID (multi-account)
        const multiAccountMatch = urlObj.pathname.match(/\/u\/\d+\/c\/([^\/]+)/);
        if (multiAccountMatch) {
            return multiAccountMatch[1];
        }

        return null;
    } catch (e) {
        console.error('[GCR] Error extracting course ID:', e);
        return null;
    }
}

/**
 * Checks if URL is a Google Classroom course page
 * @param {string} url - URL to check
 * @returns {boolean} True if on a course page
 */
export function isCoursePage(url) {
    return extractCourseId(url) !== null;
}

/**
 * Checks if URL is the Google Classroom main/home page
 * @param {string} url - URL to check
 * @returns {boolean} True if on main page
 */
export function isMainPage(url) {
    if (!url) return false;

    try {
        const urlObj = new URL(url);
        if (!urlObj.hostname.includes('classroom.google.com')) {
            return false;
        }

        // Main page patterns
        const path = urlObj.pathname;
        return path === '/' ||
            path === '/u/0/' ||
            path === '/u/1/' ||
            path === '/h' ||
            path.match(/^\/u\/\d+\/?$/);
    } catch (e) {
        return false;
    }
}

// ============================================================================
// FILE TYPE UTILITIES
// ============================================================================

/**
 * Determines the category for a file based on its type/source
 * @param {Object} item - Material/attachment object
 * @returns {string} Category: 'assignment', 'material', 'announcement', 'link'
 */
export function categorizeItem(item) {
    if (item.type === 'announcement') return 'announcement';
    if (item.type === 'courseWork') return 'assignment';
    if (item.type === 'courseWorkMaterial') return 'material';
    if (item.isLink || item.type === 'link') return 'link';
    return 'material';
}

/**
 * Gets an icon emoji for a file type
 * @param {string} mimeType - MIME type
 * @param {string} type - Item type
 * @returns {string} Emoji icon
 */
export function getFileIcon(mimeType, type) {
    if (!mimeType && type === 'link') return '🔗';
    if (!mimeType && type === 'youtube') return '▶️';
    if (!mimeType && type === 'form') return '📋';

    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('document') || mimeType?.includes('word')) return '📝';
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return '📊';
    if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint')) return '📽️';
    if (mimeType?.includes('image')) return '🖼️';
    if (mimeType?.includes('video')) return '🎬';
    if (mimeType?.includes('audio')) return '🎵';
    if (mimeType?.includes('zip') || mimeType?.includes('compressed')) return '📦';

    return '📁';
}

/**
 * Checks if a file is a Google Workspace file that needs export
 * @param {string} mimeType - MIME type string
 * @returns {boolean} True if needs export
 */
export function isGoogleWorkspaceFile(mimeType) {
    return mimeType?.startsWith('application/vnd.google-apps.');
}

/**
 * Checks if a file is downloadable or should be saved as link
 * @param {string} mimeType - MIME type string
 * @returns {boolean} True if directly downloadable
 */
export function isDownloadable(mimeType) {
    if (!mimeType) return false;

    // Google Workspace files need export, not direct download
    if (isGoogleWorkspaceFile(mimeType)) {
        // Forms cannot be exported, only linked
        if (mimeType === 'application/vnd.google-apps.form') {
            return false;
        }
        return true; // Other Google files can be exported
    }

    // Regular files are downloadable
    return true;
}

// ============================================================================
// PROMISE UTILITIES
// ============================================================================

/**
 * Creates a promise that rejects after a timeout
 * @param {number} ms - Timeout in milliseconds
 * @param {string} message - Error message
 * @returns {Promise} Promise that rejects after timeout
 */
export function timeout(ms, message = 'Operation timed out') {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message)), ms);
    });
}

/**
 * Wraps a promise with a timeout
 * @param {Promise} promise - Promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise} Promise that rejects if timeout exceeded
 */
export function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        timeout(ms)
    ]);
}

/**
 * Delays execution for specified milliseconds
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise} Promise that resolves after delay
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in ms (doubles each retry)
 * @returns {Promise} Result of successful function call
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on auth errors or not found
            if (error.status === 401 || error.status === 403 || error.status === 404) {
                throw error;
            }

            // Don't retry if we've exhausted attempts
            if (attempt === maxRetries) {
                throw error;
            }

            // Calculate delay with exponential backoff and jitter
            const delayMs = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
            console.log(`[GCR] Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms`);
            await delay(delayMs);
        }
    }

    throw lastError;
}

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

/**
 * Safely gets a value from chrome.storage.local
 * @param {string|string[]} keys - Key(s) to retrieve
 * @returns {Promise<Object>} Storage data
 */
export async function getStorage(keys) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Safely sets a value in chrome.storage.local
 * @param {Object} data - Data to store
 * @returns {Promise<void>}
 */
export async function setStorage(data) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Safely removes a value from chrome.storage.local
 * @param {string|string[]} keys - Key(s) to remove
 * @returns {Promise<void>}
 */
export async function removeStorage(keys) {
    return new Promise((resolve, reject) => {
        try {
            chrome.storage.local.remove(keys, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        } catch (e) {
            reject(e);
        }
    });
}

console.log('[GCR] Helpers module loaded');
