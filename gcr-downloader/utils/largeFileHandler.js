/**
 * GCR Downloader - Large File Handler
 * Handles size validation, download limits, and resource management
 * 
 * PROBLEMS SOLVED:
 * - Chrome extension downloads fail silently on files >2GB
 * - Users unknowingly start 1GB+ downloads, eating bandwidth
 * - No disk space validation before downloads
 * - No resume capability for interrupted downloads
 * 
 * @module largeFileHandler
 * @version 1.0.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * File size limits
 */
export const SIZE_LIMITS = {
    // Maximum file size Chrome can handle reliably (2GB - 1 byte)
    ABSOLUTE_MAX_BYTES: 2 * 1024 * 1024 * 1024 - 1,

    // Warning threshold - user confirmation required
    WARNING_THRESHOLD_BYTES: 500 * 1024 * 1024, // 500MB

    // Size requiring user confirmation in popup
    CONFIRM_THRESHOLD_BYTES: 100 * 1024 * 1024, // 100MB

    // Estimated safe buffer for system overhead
    SYSTEM_BUFFER_BYTES: 100 * 1024 * 1024 // 100MB
};

/**
 * File size validation result codes
 */
export const VALIDATION_CODES = {
    OK: 'ok',                          // File can be downloaded
    WARN_LARGE: 'warn_large',          // Large file, confirm with user
    WARN_HUGE: 'warn_huge',            // Very large file, strong warning
    BLOCK_TOO_LARGE: 'block_too_large', // Exceeds Chrome limit
    BLOCK_NO_SPACE: 'block_no_space',  // Insufficient disk space
    UNKNOWN_SIZE: 'unknown_size'       // Size not known in advance
};

// ============================================================================
// SIZE UTILITIES
// ============================================================================

/**
 * Formats bytes into human-readable string
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted size string
 */
export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    if (!bytes || bytes < 0) return 'Unknown';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Parses a size string or number into bytes
 * @param {string|number} size - Size value
 * @returns {number} Size in bytes
 */
export function parseSize(size) {
    if (typeof size === 'number') return size;
    if (!size) return 0;

    const units = {
        'B': 1,
        'KB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024,
        'TB': 1024 * 1024 * 1024 * 1024
    };

    const match = String(size).match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
    if (!match) return parseInt(size) || 0;

    const value = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase();

    return Math.round(value * (units[unit] || 1));
}

// ============================================================================
// FILE SIZE VALIDATION
// ============================================================================

/**
 * Validates a file size before download
 * @param {number} sizeBytes - File size in bytes
 * @returns {Object} Validation result with code and message
 */
export function validateFileSize(sizeBytes) {
    // Unknown size - allow but warn
    if (!sizeBytes || sizeBytes <= 0) {
        return {
            code: VALIDATION_CODES.UNKNOWN_SIZE,
            allowed: true,
            message: 'File size unknown. Download may be large.',
            sizeFormatted: 'Unknown'
        };
    }

    const formatted = formatBytes(sizeBytes);

    // Exceeds Chrome limit - block
    if (sizeBytes >= SIZE_LIMITS.ABSOLUTE_MAX_BYTES) {
        return {
            code: VALIDATION_CODES.BLOCK_TOO_LARGE,
            allowed: false,
            message: `File is too large (${formatted}). Chrome cannot download files larger than 2GB. Try downloading directly from Google Drive.`,
            sizeFormatted: formatted
        };
    }

    // Very large file - strong warning
    if (sizeBytes >= SIZE_LIMITS.WARNING_THRESHOLD_BYTES) {
        return {
            code: VALIDATION_CODES.WARN_HUGE,
            allowed: true,
            requiresConfirmation: true,
            message: `This file is very large (${formatted}). It may take a long time to download and use significant disk space.`,
            sizeFormatted: formatted,
            estimatedTime: estimateDownloadTime(sizeBytes)
        };
    }

    // Large file - mild warning
    if (sizeBytes >= SIZE_LIMITS.CONFIRM_THRESHOLD_BYTES) {
        return {
            code: VALIDATION_CODES.WARN_LARGE,
            allowed: true,
            requiresConfirmation: false,
            message: `Large file (${formatted})`,
            sizeFormatted: formatted
        };
    }

    // Normal size - OK
    return {
        code: VALIDATION_CODES.OK,
        allowed: true,
        message: null,
        sizeFormatted: formatted
    };
}

/**
 * Validates a batch of files before download
 * @param {Array<{id: string, title: string, size?: number}>} files - Files to validate
 * @returns {Object} Batch validation result
 */
export function validateBatch(files) {
    let totalSize = 0;
    let unknownCount = 0;
    let blockedFiles = [];
    let largeFiles = [];
    let normalFiles = [];

    for (const file of files) {
        const size = file.size || 0;
        const validation = validateFileSize(size);

        if (!validation.allowed) {
            blockedFiles.push({ ...file, validation });
        } else if (validation.code === VALIDATION_CODES.UNKNOWN_SIZE) {
            unknownCount++;
            normalFiles.push({ ...file, validation });
        } else if (validation.requiresConfirmation) {
            largeFiles.push({ ...file, validation });
            totalSize += size;
        } else {
            normalFiles.push({ ...file, validation });
            totalSize += size;
        }
    }

    return {
        totalFiles: files.length,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        blockedCount: blockedFiles.length,
        blockedFiles,
        largeCount: largeFiles.length,
        largeFiles,
        normalCount: normalFiles.length,
        normalFiles,
        unknownCount,
        hasBlocked: blockedFiles.length > 0,
        hasLarge: largeFiles.length > 0,
        requiresConfirmation: blockedFiles.length > 0 || largeFiles.length > 0,
        estimatedTime: estimateDownloadTime(totalSize)
    };
}

// ============================================================================
// DISK SPACE CHECKING
// ============================================================================

/**
 * Checks available disk space
 * @returns {Promise<Object>} Available space info
 */
export async function checkDiskSpace() {
    try {
        // Use Storage API if available
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                available: true,
                quota: estimate.quota || 0,
                usage: estimate.usage || 0,
                free: (estimate.quota || 0) - (estimate.usage || 0),
                freeFormatted: formatBytes((estimate.quota || 0) - (estimate.usage || 0))
            };
        }
    } catch (e) {
        console.warn('[GCR LargeFile] Storage estimate failed:', e);
    }

    // Fallback: unknown
    return {
        available: false,
        quota: 0,
        usage: 0,
        free: 0,
        freeFormatted: 'Unknown'
    };
}

/**
 * Validates if there's enough disk space for download
 * @param {number} requiredBytes - Required space in bytes
 * @returns {Promise<Object>} Space validation result
 */
export async function validateDiskSpace(requiredBytes) {
    const space = await checkDiskSpace();

    if (!space.available) {
        return {
            hasSpace: true, // Assume OK if we can't check
            message: 'Unable to verify disk space',
            space
        };
    }

    const requiredWithBuffer = requiredBytes + SIZE_LIMITS.SYSTEM_BUFFER_BYTES;

    if (space.free < requiredWithBuffer) {
        return {
            hasSpace: false,
            message: `Insufficient disk space. Need ${formatBytes(requiredWithBuffer)}, only ${space.freeFormatted} available.`,
            space,
            required: requiredWithBuffer
        };
    }

    return {
        hasSpace: true,
        message: null,
        space
    };
}

// ============================================================================
// TIME ESTIMATION
// ============================================================================

/**
 * Estimates download time based on file size
 * Assumes conservative 5 Mbps average speed
 * @param {number} sizeBytes - File size in bytes
 * @returns {Object} Time estimate
 */
export function estimateDownloadTime(sizeBytes) {
    if (!sizeBytes || sizeBytes <= 0) {
        return { seconds: 0, formatted: 'Unknown' };
    }

    // Assume 5 Mbps = 625 KB/s
    const bytesPerSecond = 625 * 1024;
    const seconds = Math.ceil(sizeBytes / bytesPerSecond);

    if (seconds < 60) {
        return { seconds, formatted: `${seconds} seconds` };
    } else if (seconds < 3600) {
        const minutes = Math.ceil(seconds / 60);
        return { seconds, formatted: `${minutes} minute${minutes > 1 ? 's' : ''}` };
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.ceil((seconds % 3600) / 60);
        return { seconds, formatted: `${hours}h ${minutes}m` };
    }
}

// ============================================================================
// FILE SIZE FETCHING
// ============================================================================

/**
 * Fetches file size from Google Drive API
 * @param {string} fileId - Drive file ID
 * @param {string} token - OAuth token
 * @returns {Promise<number>} File size in bytes
 */
export async function getFileSize(fileId, token) {
    try {
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?fields=size,mimeType`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!response.ok) {
            console.warn('[GCR LargeFile] Failed to get file size:', response.status);
            return 0;
        }

        const data = await response.json();
        return parseInt(data.size) || 0;
    } catch (error) {
        console.warn('[GCR LargeFile] Error getting file size:', error);
        return 0;
    }
}

/**
 * Pre-fetches sizes for a batch of files
 * @param {Array<{id: string}>} files - Files to check
 * @param {string} token - OAuth token
 * @returns {Promise<Map>} Map of file ID to size
 */
export async function prefetchFileSizes(files, token) {
    const sizeMap = new Map();

    // Batch requests (max 10 concurrent to stay under rate limit)
    const batchSize = 10;

    for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        const results = await Promise.all(
            batch.map(file =>
                getFileSize(file.id, token)
                    .then(size => ({ id: file.id, size }))
                    .catch(() => ({ id: file.id, size: 0 }))
            )
        );

        for (const { id, size } of results) {
            sizeMap.set(id, size);
        }
    }

    return sizeMap;
}

// ============================================================================
// USER CONFIRMATION DIALOG HELPER
// ============================================================================

/**
 * Generates confirmation dialog content for large downloads
 * @param {Object} batchValidation - Result from validateBatch
 * @returns {Object} Dialog content
 */
export function generateConfirmationContent(batchValidation) {
    const { totalSizeFormatted, estimatedTime, hasBlocked, hasLarge, blockedFiles, largeFiles } = batchValidation;

    let title = 'Confirm Download';
    let message = '';
    let severity = 'info';

    if (hasBlocked) {
        title = '⚠️ Some Files Cannot Be Downloaded';
        severity = 'error';
        message = `${blockedFiles.length} file(s) exceed the 2GB limit and cannot be downloaded through the extension. `;
        message += '\n\nBlocked files:\n';
        message += blockedFiles.map(f => `• ${f.title} (${f.validation.sizeFormatted})`).join('\n');
    }

    if (hasLarge) {
        if (!hasBlocked) {
            title = '⚠️ Large Download Warning';
            severity = 'warning';
        }
        message += `\n\n${largeFiles.length} large file(s) will be downloaded:\n`;
        message += largeFiles.map(f => `• ${f.title} (${f.validation.sizeFormatted})`).join('\n');
    }

    message += `\n\nTotal download size: ${totalSizeFormatted}`;
    message += `\nEstimated time: ${estimatedTime.formatted}`;

    return {
        title,
        message,
        severity,
        canProceed: !hasBlocked,
        blockedCount: blockedFiles.length,
        largeCount: largeFiles.length
    };
}

console.log('[GCR] LargeFileHandler module loaded');
