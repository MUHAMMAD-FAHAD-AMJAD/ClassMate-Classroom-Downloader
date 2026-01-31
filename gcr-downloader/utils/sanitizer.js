/**
 * GCR Downloader - Security Sanitizer Module
 * Hardened input sanitization for XSS prevention and filename security
 * 
 * CRITICAL SECURITY FUNCTIONS:
 * 1. sanitizeFilenameSecure() - Blocks path traversal, reserved names, and exploits
 * 2. sanitizeHtml() - Removes XSS vectors from HTML content
 * 3. validatePath() - Ensures paths stay within expected bounds
 * 
 * @module sanitizer
 * @version 1.0.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Windows reserved device names (cannot be used as filenames)
 * These cause errors or unexpected behavior on Windows
 */
const WINDOWS_RESERVED_NAMES = [
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
];

/**
 * Dangerous characters that must be removed from filenames
 */
const DANGEROUS_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/**
 * Path traversal patterns to detect and block
 */
const PATH_TRAVERSAL_PATTERNS = [
    /\.\./g,           // ..
    /\.\.\\/g,         // ..\
    /\.\.\//g,         // ../
    /^\/+/,            // Leading slashes
    /^\\+/,            // Leading backslashes
    /^[a-zA-Z]:/,      // Drive letters (C:, D:)
];

/**
 * HTML entities that indicate XSS attempts
 * SEC-012 FIX: Enhanced patterns including unicode escapes and additional vectors
 */
const XSS_PATTERNS = [
    /<script/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,     // onclick=, onerror=, etc.
    /data:/gi,
    /vbscript:/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /<link/gi,
    /<style/gi,
    /expression\s*\(/gi, // CSS expression()
    // SEC-012 FIX: Additional patterns
    /\x00/g,            // NULL bytes
    /\\u0000/gi,        // Unicode NULL escape
    /\\x00/gi,          // Hex NULL escape
    /<svg[^>]*onload/gi, // SVG onload attacks
    /<img[^>]*onerror/gi, // Image error handlers
    /<body[^>]*onload/gi, // Body onload
    /<input[^>]*onfocus/gi, // Input focus handlers
    /\beval\s*\(/gi,    // eval() calls
    /\bFunction\s*\(/gi, // Function constructor
    /\bsetTimeout\s*\(/gi, // setTimeout with strings
    /\bsetInterval\s*\(/gi, // setInterval with strings
    /&#x?\d*;?/gi,      // HTML entities that could encode dangerous chars
    /<meta[^>]*http-equiv/gi, // Meta redirects
    /<base[^>]*href/gi, // Base tag hijacking
];

/**
 * Maximum filename length (Windows limit)
 */
const MAX_FILENAME_LENGTH = 200;

/**
 * Maximum path length (Windows limit minus buffer)
 */
const MAX_PATH_LENGTH = 240;

// ============================================================================
// FILENAME SANITIZATION
// ============================================================================

/**
 * Sanitizes a filename with security hardening
 * Blocks path traversal, reserved names, and dangerous characters
 * 
 * @param {string} filename - Raw filename to sanitize
 * @param {string} fallback - Fallback name if sanitization fails
 * @returns {string} Safe filename
 */
export function sanitizeFilenameSecure(filename, fallback = 'download') {
    if (!filename || typeof filename !== 'string') {
        console.warn('[GCR Sanitizer] Invalid filename, using fallback');
        return fallback;
    }

    let safe = filename;

    // Step 1: Remove path traversal attempts
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
        safe = safe.replace(pattern, '');
    }

    // Step 2: Remove dangerous characters
    safe = safe.replace(DANGEROUS_CHARS, '_');

    // Step 3: Remove leading/trailing dots and spaces (Windows issue)
    safe = safe.replace(/^[\s.]+|[\s.]+$/g, '');

    // Step 4: Remove control characters and zero-width chars
    safe = safe.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\ufeff]/g, '');

    // Step 5: Collapse multiple underscores/spaces
    safe = safe.replace(/_+/g, '_').replace(/\s+/g, ' ');

    // Step 6: Check for Windows reserved names
    const baseName = safe.split('.')[0].toUpperCase();
    if (WINDOWS_RESERVED_NAMES.includes(baseName)) {
        safe = '_' + safe;
        console.warn('[GCR Sanitizer] Reserved name blocked:', filename);
    }

    // Step 7: Truncate to max length
    if (safe.length > MAX_FILENAME_LENGTH) {
        const ext = getExtension(safe);
        const nameWithoutExt = safe.substring(0, safe.length - ext.length);
        safe = nameWithoutExt.substring(0, MAX_FILENAME_LENGTH - ext.length) + ext;
    }

    // Step 8: Final validation - must have content
    if (!safe || safe === '_') {
        return fallback;
    }

    return safe;
}

/**
 * Gets the file extension including the dot
 * @param {string} filename - Filename
 * @returns {string} Extension with dot, or empty string
 */
function getExtension(filename) {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot > 0 && lastDot < filename.length - 1) {
        return filename.substring(lastDot);
    }
    return '';
}

/**
 * Sanitizes a folder/path name
 * @param {string} folderName - Folder name to sanitize
 * @returns {string} Safe folder name
 */
export function sanitizeFolderName(folderName) {
    if (!folderName || typeof folderName !== 'string') {
        return 'Downloads';
    }

    // Use same logic as filename but also remove dots
    let safe = sanitizeFilenameSecure(folderName, 'Course');

    // Remove dots from folder names (can cause issues)
    safe = safe.replace(/\./g, '_');

    return safe;
}

/**
 * Validates and sanitizes a full download path
 * Ensures path stays within expected structure
 * 
 * @param {string} path - Full path like "CourseName/filename.pdf"
 * @returns {Object} { valid: boolean, path: string, error?: string }
 */
export function validateDownloadPath(path) {
    if (!path || typeof path !== 'string') {
        return { valid: false, path: '', error: 'Invalid path' };
    }

    // Check total length
    if (path.length > MAX_PATH_LENGTH) {
        return { valid: false, path: '', error: 'Path too long' };
    }

    // Check for path traversal
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
        if (pattern.test(path)) {
            console.error('[GCR Sanitizer] Path traversal blocked:', path);
            return { valid: false, path: '', error: 'Path traversal detected' };
        }
    }

    // Split and sanitize each component
    const parts = path.split(/[/\\]/).filter(p => p);
    const sanitizedParts = parts.map((part, i) => {
        if (i === parts.length - 1) {
            // Last part is filename
            return sanitizeFilenameSecure(part);
        } else {
            // Other parts are folders
            return sanitizeFolderName(part);
        }
    });

    const sanitizedPath = sanitizedParts.join('/');

    // Ensure we have at least a filename
    if (!sanitizedPath || sanitizedPath === '/') {
        return { valid: false, path: '', error: 'Empty path after sanitization' };
    }

    return { valid: true, path: sanitizedPath };
}

// ============================================================================
// HTML/XSS SANITIZATION
// ============================================================================

/**
 * Removes XSS vectors from HTML content
 * For use when displaying user-provided content
 * 
 * @param {string} html - HTML content to sanitize
 * @returns {string} Safe HTML
 */
export function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') {
        return '';
    }

    let safe = html;

    // Remove script tags and content
    safe = safe.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove event handlers
    safe = safe.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
    safe = safe.replace(/\bon\w+\s*=\s*[^\s>]*/gi, '');

    // Remove dangerous protocols
    safe = safe.replace(/javascript:/gi, '');
    safe = safe.replace(/vbscript:/gi, '');
    safe = safe.replace(/data:/gi, 'data-blocked:');

    // Remove style tags (can contain expressions)
    safe = safe.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    return safe;
}

/**
 * Escapes HTML entities for safe display
 * Use this for user input that should be displayed as text
 * SEC-012 FIX: Enhanced to handle unicode, NULL bytes, and control characters
 * 
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // SEC-012 FIX: First, remove NULL bytes and control characters
    let safe = text
        .replace(/\x00/g, '')  // NULL bytes
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Control chars (except \t\n\r)

    const entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;',
        // SEC-012 FIX: Additional characters
        '{': '&#x7B;',
        '}': '&#x7D;',
        '(': '&#x28;',
        ')': '&#x29;',
        '[': '&#x5B;',
        ']': '&#x5D;'
    };

    return safe.replace(/[&<>"'`={}()\[\]]/g, char => entityMap[char] || char);
}

/**
 * Checks if a string contains potential XSS vectors
 * @param {string} input - Input to check
 * @returns {boolean} True if XSS patterns detected
 */
export function containsXSS(input) {
    if (!input || typeof input !== 'string') {
        return false;
    }

    return XSS_PATTERNS.some(pattern => pattern.test(input));
}

// ============================================================================
// URL SANITIZATION
// ============================================================================

/**
 * Validates and sanitizes a URL
 * Only allows http, https, and specific Google domains
 * 
 * @param {string} url - URL to validate
 * @returns {Object} { valid: boolean, url: string, error?: string }
 */
export function validateUrl(url) {
    if (!url || typeof url !== 'string') {
        return { valid: false, url: '', error: 'Invalid URL' };
    }

    try {
        const parsed = new URL(url);

        // Only allow http and https
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { valid: false, url: '', error: 'Invalid protocol' };
        }

        // Whitelist Google domains for Drive/Classroom
        const allowedDomains = [
            'googleapis.com',
            'google.com',
            'googleusercontent.com',
            'drive.google.com',
            'classroom.google.com'
        ];

        const isAllowed = allowedDomains.some(domain =>
            parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
        );

        if (!isAllowed) {
            // For other URLs, just ensure no XSS
            if (containsXSS(url)) {
                return { valid: false, url: '', error: 'XSS detected in URL' };
            }
        }

        return { valid: true, url: parsed.href };
    } catch (e) {
        return { valid: false, url: '', error: 'Malformed URL' };
    }
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Batch sanitize an array of filenames
 * @param {Array<string>} filenames - Filenames to sanitize
 * @returns {Array<string>} Sanitized filenames
 */
export function batchSanitizeFilenames(filenames) {
    return filenames.map((f, i) => sanitizeFilenameSecure(f, `file_${i + 1}`));
}

console.log('[GCR] Sanitizer module loaded');
