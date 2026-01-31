/**
 * GCR Downloader - Download Manager Module
 * Handles file downloads with concurrent limiting and progress tracking
 * 
 * Features:
 * - Concurrent download limiting (max 5 simultaneous)
 * - File type detection and Google Workspace exports
 * - Filename sanitization (emojis, special chars)
 * - Resources file generation for links/YouTube/Forms
 * - Progress tracking and cancellation
 * - Retry on failure
 * - **NEW v2.0** Persistent queue (survives service worker restart)
 * - **NEW v2.0** Large file validation (blocks 2GB+, warns 500MB+)
 */

import { getAuthToken } from './auth.js';
import {
    makeUniqueFilename,
    ensureExtension,
    GOOGLE_EXPORT_FORMATS,
    isGoogleWorkspaceFile,
    getFileIcon,
    delay
} from './helpers.js';

// Import persistent state management
import {
    addDownloadJob,
    updateDownloadJob,
    getNextPendingJob,
    getJobCounts,
    clearDownloadQueue,
    resetActiveJobs,
    getDownloadProgress as getPersistedProgress,
    updateDownloadProgress as updatePersistedProgress,
    resetDownloadProgress,
    isAbortRequested,
    keepAlive,
    DOWNLOAD_STATES
} from './workerState.js';

// Import large file handler
import {
    validateFileSize,
    validateBatch,
    formatBytes,
    VALIDATION_CODES
} from './largeFileHandler.js';

// Import security sanitizer (Phase 4)
import {
    sanitizeFilenameSecure,
    sanitizeFolderName,
    validateDownloadPath
} from './sanitizer.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum concurrent downloads
 */
const MAX_CONCURRENT_DOWNLOADS = 5;

/**
 * Maximum retry attempts for failed downloads
 */
const MAX_DOWNLOAD_RETRIES = 3;

/**
 * Delay between retries (ms)
 */
const RETRY_DELAY_MS = 2000;

/**
 * Drive API base URL
 */
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * HIGH-002 FIX: Offline retry queue storage key
 */
const OFFLINE_QUEUE_KEY = 'gcr_offline_queue';

/**
 * HIGH-002 FIX: Max offline queue size to prevent unbounded growth
 */
const MAX_OFFLINE_QUEUE_SIZE = 100;

// ============================================================================
// STATE
// ============================================================================

/**
 * Current download queue
 */
let downloadQueue = [];

/**
 * Active downloads count
 */
let activeDownloads = 0;

/**
 * Download progress tracking
 */
let downloadProgress = {
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0
};

/**
 * Progress callback
 */
let progressCallback = null;

/**
 * Set of used filenames (for uniqueness)
 */
let usedFilenames = new Set();

/**
 * Download abort flag
 */
let abortDownloads = false;

// ============================================================================
// HIGH-002 FIX: OFFLINE RETRY QUEUE
// ============================================================================

/**
 * Adds failed download to offline queue for later retry
 * @param {Object} job - Download job that failed
 * @param {string} reason - Failure reason
 * @returns {Promise<boolean>} Success status
 */
async function addToOfflineQueue(job, reason) {
    try {
        const result = await chrome.storage.local.get(OFFLINE_QUEUE_KEY);
        const queue = result[OFFLINE_QUEUE_KEY] || [];
        
        // Prevent unbounded growth
        if (queue.length >= MAX_OFFLINE_QUEUE_SIZE) {
            console.warn('[GCR Download] Offline queue full, dropping oldest item');
            queue.shift();
        }
        
        // Check for duplicates by file ID
        const exists = queue.some(item => item.fileId === job.fileId);
        if (exists) {
            console.log('[GCR Download] File already in offline queue:', job.title);
            return false;
        }
        
        queue.push({
            fileId: job.fileId,
            title: job.title,
            mimeType: job.mimeType,
            size: job.size,
            courseFolderName: job.courseFolderName,
            reason,
            timestamp: Date.now(),
            retryCount: 0
        });
        
        await chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: queue });
        console.log('[GCR Download] Added to offline queue:', job.title);
        return true;
    } catch (e) {
        console.error('[GCR Download] Failed to add to offline queue:', e);
        return false;
    }
}

/**
 * Gets items from offline queue
 * @returns {Promise<Array>} Offline queue items
 */
export async function getOfflineQueue() {
    try {
        const result = await chrome.storage.local.get(OFFLINE_QUEUE_KEY);
        return result[OFFLINE_QUEUE_KEY] || [];
    } catch (e) {
        console.error('[GCR Download] Failed to get offline queue:', e);
        return [];
    }
}

/**
 * Removes an item from the offline queue
 * @param {string} fileId - File ID to remove
 * @returns {Promise<boolean>} Success status
 */
export async function removeFromOfflineQueue(fileId) {
    try {
        const result = await chrome.storage.local.get(OFFLINE_QUEUE_KEY);
        const queue = result[OFFLINE_QUEUE_KEY] || [];
        const filtered = queue.filter(item => item.fileId !== fileId);
        await chrome.storage.local.set({ [OFFLINE_QUEUE_KEY]: filtered });
        return true;
    } catch (e) {
        console.error('[GCR Download] Failed to remove from offline queue:', e);
        return false;
    }
}

/**
 * Clears the offline queue
 * @returns {Promise<boolean>} Success status
 */
export async function clearOfflineQueue() {
    try {
        await chrome.storage.local.remove(OFFLINE_QUEUE_KEY);
        return true;
    } catch (e) {
        console.error('[GCR Download] Failed to clear offline queue:', e);
        return false;
    }
}

/**
 * Retries all items in offline queue
 * Should be called when network connection is restored
 * @param {string} courseFolderName - Folder name for downloads
 * @returns {Promise<Object>} Retry results
 */
export async function retryOfflineQueue(courseFolderName) {
    if (!navigator.onLine) {
        return { success: false, error: 'Still offline' };
    }
    
    const queue = await getOfflineQueue();
    if (queue.length === 0) {
        return { success: true, retried: 0, failed: 0 };
    }
    
    console.log('[GCR Download] Retrying offline queue:', queue.length, 'items');
    
    let retried = 0;
    let failed = 0;
    
    for (const item of queue) {
        const attachment = {
            id: item.fileId,
            title: item.title,
            mimeType: item.mimeType,
            size: item.size
        };
        
        const result = await downloadWithRetry(attachment, courseFolderName || item.courseFolderName);
        
        if (result.success) {
            await removeFromOfflineQueue(item.fileId);
            retried++;
        } else {
            // Update retry count
            item.retryCount = (item.retryCount || 0) + 1;
            if (item.retryCount >= MAX_DOWNLOAD_RETRIES) {
                // Remove from queue after max retries
                await removeFromOfflineQueue(item.fileId);
                failed++;
            }
        }
    }
    
    return { success: true, retried, failed };
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Resets download progress
 */
function resetProgress() {
    downloadProgress = {
        total: 0,
        completed: 0,
        failed: 0,
        inProgress: 0
    };
    usedFilenames.clear();
    abortDownloads = false;
}

/**
 * Updates and notifies progress
 */
function updateProgress() {
    if (progressCallback) {
        progressCallback({
            ...downloadProgress,
            percent: downloadProgress.total > 0
                ? Math.round((downloadProgress.completed / downloadProgress.total) * 100)
                : 0
        });
    }
}

/**
 * Sets the progress callback
 * @param {Function} callback - Callback function
 */
export function setProgressCallback(callback) {
    progressCallback = callback;
}

/**
 * Gets current download progress
 * @returns {Object} Progress object
 */
export function getProgress() {
    return { ...downloadProgress };
}

// ============================================================================
// DOWNLOAD FUNCTIONS
// ============================================================================

/**
 * Downloads a single Drive file
 * @param {Object} attachment - Attachment object
 * @param {string} courseFolderName - Folder name for organization
 * @returns {Promise<Object>} Download result
 */
async function downloadDriveFile(attachment, courseFolderName) {
    const { id, title, mimeType, size } = attachment;

    console.log('[GCR Download] Downloading:', title, mimeType, size ? formatBytes(size) : 'size unknown');

    // Keep service worker alive during download
    await keepAlive();

    // Validate file size before downloading
    const sizeValidation = validateFileSize(size);
    if (!sizeValidation.allowed) {
        console.warn('[GCR Download] File blocked:', title, sizeValidation.message);
        return {
            success: false,
            error: sizeValidation.message,
            blocked: true,
            code: sizeValidation.code
        };
    }

    if (sizeValidation.code === VALIDATION_CODES.WARN_HUGE) {
        console.log('[GCR Download] Large file warning:', title, sizeValidation.sizeFormatted);
        // Continue but log the warning - UI should have already confirmed
    }

    // Get auth token
    const token = await getAuthToken(true);

    let downloadUrl;
    let finalExtension = '';

    // Determine download URL based on file type
    if (isGoogleWorkspaceFile(mimeType)) {
        const exportFormat = GOOGLE_EXPORT_FORMATS[mimeType];

        if (!exportFormat) {
            // Cannot export (e.g., Forms) - skip
            console.log('[GCR Download] Cannot export:', mimeType);
            return {
                success: false,
                error: 'Cannot download this file type',
                skipped: true
            };
        }

        downloadUrl = `${DRIVE_API_BASE}/files/${id}/export?mimeType=${encodeURIComponent(exportFormat.mimeType)}`;
        finalExtension = exportFormat.extension;
    } else {
        downloadUrl = `${DRIVE_API_BASE}/files/${id}?alt=media`;
    }

    // Build filename
    let filename = sanitizeFilenameSecure(title, 'download');
    filename = ensureExtension(filename, mimeType);

    // Add export extension if needed
    if (finalExtension && !filename.toLowerCase().endsWith(finalExtension)) {
        // Remove any existing extension that doesn't match
        const lastDot = filename.lastIndexOf('.');
        if (lastDot > 0) {
            filename = filename.substring(0, lastDot);
        }
        filename += finalExtension;
    }

    // Make unique
    filename = makeUniqueFilename(filename, usedFilenames);

    // Add course folder prefix if provided
    if (courseFolderName) {
        filename = `${sanitizeFilenameSecure(courseFolderName)}/${filename}`;
    }

    try {
        // Fetch the file
        const response = await fetch(downloadUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }

        // Get blob
        const blob = await response.blob();

        // Create object URL
        const objectUrl = URL.createObjectURL(blob);

        // Trigger download via chrome.downloads API
        return new Promise((resolve, reject) => {
            chrome.downloads.download({
                url: objectUrl,
                filename: filename,
                saveAs: false
            }, (downloadId) => {
                // Clean up object URL after a delay
                setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve({
                        success: true,
                        downloadId,
                        filename
                    });
                }
            });
        });

    } catch (error) {
        console.error('[GCR Download] Error downloading:', title, error);
        throw error;
    }
}

/**
 * Downloads a file with retry logic and CORS handling
 * @param {Object} attachment - Attachment object
 * @param {string} courseFolderName - Folder name
 * @returns {Promise<Object>} Download result
 */
async function downloadWithRetry(attachment, courseFolderName) {
    let lastError;

    for (let attempt = 0; attempt < MAX_DOWNLOAD_RETRIES; attempt++) {
        if (abortDownloads) {
            return { success: false, error: 'Download cancelled', cancelled: true };
        }

        try {
            return await downloadDriveFile(attachment, courseFolderName);
        } catch (error) {
            lastError = error;

            // Categorize error for better handling
            const isCORSError =
                error.message?.includes('CORS') ||
                error.message?.includes('NetworkError') ||
                error.message?.includes('Failed to fetch') ||
                error.message?.includes('net::ERR');

            const isAuthError =
                error.message?.includes('401') ||
                error.message?.includes('403');

            const isNotFoundError = error.message?.includes('404');

            // Don't retry on permission or not found errors
            if (isAuthError || isNotFoundError) {
                console.log('[GCR Download] Non-retryable error:', error.message);
                return {
                    success: false,
                    error: isAuthError ? 'Access denied' : 'File not found',
                    skipped: true
                };
            }

            // Log CORS errors specifically
            if (isCORSError) {
                console.warn('[GCR Download] CORS/Network error:', error.message);
                // Will retry - CORS errors can be transient
            }

            if (attempt < MAX_DOWNLOAD_RETRIES - 1) {
                console.log(`[GCR Download] Retry ${attempt + 1}/${MAX_DOWNLOAD_RETRIES} for:`, attachment.title);
                await delay(RETRY_DELAY_MS * (attempt + 1)); // Exponential backoff
            }
        }
    }

    // HIGH-002 FIX: If offline, add to offline queue for later retry
    const isNetworkError = !navigator.onLine || 
        lastError?.message?.includes('NetworkError') ||
        lastError?.message?.includes('Failed to fetch') ||
        lastError?.message?.includes('net::ERR');
    
    if (isNetworkError) {
        const job = {
            fileId: attachment.id,
            title: attachment.title,
            mimeType: attachment.mimeType,
            size: attachment.size,
            courseFolderName
        };
        await addToOfflineQueue(job, lastError?.message || 'Network error');
        return {
            success: false,
            error: 'Added to offline queue for later retry',
            queued: true
        };
    }

    return {
        success: false,
        error: lastError?.message || 'Download failed after retries'
    };
}

// ============================================================================
// QUEUE PROCESSING (v2.0 - Persistent Queue)
// ============================================================================

/**
 * Whether queue processing is currently running
 */
let isProcessingQueue = false;

/**
 * Processes the persistent download queue
 * Uses workerState.js for crash-resistant job tracking
 */
async function processQueue() {
    if (isProcessingQueue) {
        console.log('[GCR Download] Queue already processing, skipping');
        return;
    }

    isProcessingQueue = true;
    console.log('[GCR Download] Starting queue processing');

    try {
        while (!abortDownloads) {
            // Check abort flag from persistent state
            if (await isAbortRequested()) {
                console.log('[GCR Download] Abort requested, stopping queue');
                break;
            }

            // Wait if at max concurrent downloads
            const counts = await getJobCounts();
            if (counts.active >= MAX_CONCURRENT_DOWNLOADS) {
                await delay(100);
                continue;
            }

            // Get next pending job from persistent queue
            const job = await getNextPendingJob();
            if (!job) {
                console.log('[GCR Download] No more pending jobs');
                break;
            }

            // Mark job as active
            await updateDownloadJob(job.id, {
                state: DOWNLOAD_STATES.ACTIVE,
                startedAt: Date.now()
            });

            activeDownloads++;
            downloadProgress.inProgress++;

            // Keep worker alive
            await keepAlive();

            // Update persisted progress
            await updatePersistedProgress({
                inProgress: downloadProgress.inProgress,
                currentFile: job.attachment.title
            });

            updateProgress();

            // Process the download
            try {
                const result = await downloadWithRetry(job.attachment, job.courseFolderName);

                if (result.success || result.skipped) {
                    downloadProgress.completed++;
                    await updateDownloadJob(job.id, {
                        state: DOWNLOAD_STATES.COMPLETED,
                        completedAt: Date.now()
                    });

                    // Resolve any waiting promise
                    if (inFlightPromises.has(job.id)) {
                        inFlightPromises.get(job.id).resolve(result);
                        inFlightPromises.delete(job.id);
                    }
                } else {
                    downloadProgress.failed++;
                    await updateDownloadJob(job.id, {
                        state: DOWNLOAD_STATES.FAILED,
                        completedAt: Date.now(),
                        error: result.error
                    });

                    if (inFlightPromises.has(job.id)) {
                        inFlightPromises.get(job.id).reject(new Error(result.error));
                        inFlightPromises.delete(job.id);
                    }
                }
            } catch (error) {
                downloadProgress.failed++;
                await updateDownloadJob(job.id, {
                    state: DOWNLOAD_STATES.FAILED,
                    completedAt: Date.now(),
                    error: error.message
                });

                if (inFlightPromises.has(job.id)) {
                    inFlightPromises.get(job.id).reject(error);
                    inFlightPromises.delete(job.id);
                }
            } finally {
                activeDownloads--;
                downloadProgress.inProgress--;

                await updatePersistedProgress({
                    completed: downloadProgress.completed,
                    failed: downloadProgress.failed,
                    inProgress: downloadProgress.inProgress
                });

                updateProgress();
            }
        }
    } finally {
        isProcessingQueue = false;
        console.log('[GCR Download] Queue processing complete');
    }
}

/**
 * Map of job IDs to their resolve/reject functions
 * Allows waiting for specific job completion
 */
const inFlightPromises = new Map();

/**
 * Adds a file to the persistent download queue
 * @param {Object} attachment - Attachment to download
 * @param {string} courseFolderName - Course folder name
 * @returns {Promise<Object>} Download result
 */
async function queueDownload(attachment, courseFolderName) {
    // Add to persistent queue
    const job = await addDownloadJob(attachment, courseFolderName);
    console.log('[GCR Download] Queued job:', job.id, attachment.title);

    // Create promise for this job's completion
    const promise = new Promise((resolve, reject) => {
        inFlightPromises.set(job.id, { resolve, reject });
    });

    // Start processing if not already running
    processQueue();

    return promise;
}

// ============================================================================
// RESOURCES FILE GENERATION
// ============================================================================

/**
 * Creates a resources file containing links, YouTube videos, and forms
 * @param {Array} links - Array of link objects
 * @param {string} courseName - Course name
 * @returns {Promise<Object>} Download result
 */
async function createResourcesFile(links, courseName) {
    if (!links || links.length === 0) {
        return { success: true, skipped: true };
    }

    console.log('[GCR Download] Creating resources file with', links.length, 'items');

    // Group by type
    const youtube = links.filter(l => l.type === 'youtube');
    const forms = links.filter(l => l.type === 'form');
    const otherLinks = links.filter(l => l.type === 'link');

    // Build file content
    let content = `# Resources and Links\n`;
    content += `# Course: ${courseName}\n`;
    content += `# Generated: ${new Date().toLocaleString()}\n`;
    content += `# Total: ${links.length} items\n`;
    content += `\n${'='.repeat(60)}\n\n`;

    if (youtube.length > 0) {
        content += `## YouTube Videos (${youtube.length})\n\n`;
        for (const item of youtube) {
            content += `${getFileIcon(null, 'youtube')} ${item.title}\n`;
            content += `   URL: ${item.alternateLink}\n`;
            if (item.parentTitle) {
                content += `   From: ${item.parentTitle}\n`;
            }
            content += `\n`;
        }
        content += `\n`;
    }

    if (forms.length > 0) {
        content += `## Google Forms (${forms.length})\n\n`;
        for (const item of forms) {
            content += `${getFileIcon(null, 'form')} ${item.title}\n`;
            content += `   Form URL: ${item.formUrl}\n`;
            if (item.responseUrl) {
                content += `   Response URL: ${item.responseUrl}\n`;
            }
            if (item.parentTitle) {
                content += `   From: ${item.parentTitle}\n`;
            }
            content += `\n`;
        }
        content += `\n`;
    }

    if (otherLinks.length > 0) {
        content += `## External Links (${otherLinks.length})\n\n`;
        for (const item of otherLinks) {
            content += `${getFileIcon(null, 'link')} ${item.title}\n`;
            content += `   URL: ${item.url}\n`;
            if (item.parentTitle) {
                content += `   From: ${item.parentTitle}\n`;
            }
            content += `\n`;
        }
    }

    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain' });
    const objectUrl = URL.createObjectURL(blob);

    const filename = `${sanitizeFilenameSecure(courseName)}/_Links_and_Resources.txt`;

    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url: objectUrl,
            filename: filename,
            saveAs: false
        }, (downloadId) => {
            setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve({
                    success: true,
                    downloadId,
                    filename
                });
            }
        });
    });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Downloads multiple files from course data
 * @param {Object} courseData - Course data object
 * @param {Array} selectedItems - Array of selected item IDs (or null for all)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Download results
 */
export async function downloadFiles(courseData, selectedItems = null, onProgress = null) {
    console.log('[GCR Download] Starting batch download');

    // Reset state
    resetProgress();
    setProgressCallback(onProgress);

    const courseFolderName = sanitizeFilenameSecure(courseData.courseName || 'Downloads');
    const results = {
        success: [],
        failed: [],
        skipped: []
    };

    // Collect all downloadable attachments
    const allAttachments = [];
    const links = [];
    
    // HIGH-018 FIX: Track file IDs to detect duplicates within batch
    const seenFileIds = new Set();

    const collectAttachments = (items, sourceType) => {
        for (const item of items || []) {
            for (const attachment of item.attachments || []) {
                // Skip if selection is provided and item is not selected
                if (selectedItems && !selectedItems.includes(attachment.id)) {
                    continue;
                }
                
                // HIGH-018 FIX: Skip duplicate file IDs within same batch
                if (attachment.id && seenFileIds.has(attachment.id)) {
                    console.log('[GCR Download] Skipping duplicate file:', attachment.title, attachment.id);
                    continue;
                }
                if (attachment.id) {
                    seenFileIds.add(attachment.id);
                }

                if (attachment.isLink) {
                    links.push({
                        ...attachment,
                        parentTitle: item.title,
                        sourceType
                    });
                } else {
                    allAttachments.push({
                        ...attachment,
                        parentTitle: item.title,
                        sourceType
                    });
                }
            }
        }
    };

    collectAttachments(courseData.assignments, 'assignment');
    collectAttachments(courseData.materials, 'material');
    collectAttachments(courseData.announcements, 'announcement');

    // Add standalone links if any
    if (courseData.links) {
        for (const link of courseData.links) {
            if (!selectedItems || selectedItems.includes(link.id || link.url)) {
                links.push(link);
            }
        }
    }

    // Set total count
    downloadProgress.total = allAttachments.length + (links.length > 0 ? 1 : 0);
    updateProgress();

    console.log('[GCR Download] Files to download:', allAttachments.length);
    console.log('[GCR Download] Links to save:', links.length);

    // Download all files
    const downloadPromises = allAttachments.map(attachment =>
        queueDownload(attachment, courseFolderName)
            .then(result => {
                if (result.success) {
                    results.success.push({ ...attachment, ...result });
                } else if (result.skipped) {
                    results.skipped.push({ ...attachment, reason: result.error });
                }
                return result;
            })
            .catch(error => {
                results.failed.push({ ...attachment, error: error.message });
                return { success: false, error: error.message };
            })
    );

    // Wait for all downloads
    await Promise.all(downloadPromises);

    // Create resources file if there are links
    if (links.length > 0) {
        try {
            const resourcesResult = await createResourcesFile(links, courseData.courseName);
            if (resourcesResult.success && !resourcesResult.skipped) {
                results.success.push({
                    title: '_Links_and_Resources.txt',
                    type: 'resources',
                    ...resourcesResult
                });
            }
            downloadProgress.completed++;
            updateProgress();
        } catch (error) {
            console.error('[GCR Download] Error creating resources file:', error);
            results.failed.push({
                title: '_Links_and_Resources.txt',
                type: 'resources',
                error: error.message
            });
            downloadProgress.failed++;
            updateProgress();
        }
    }

    console.log('[GCR Download] Download complete:', {
        success: results.success.length,
        failed: results.failed.length,
        skipped: results.skipped.length
    });

    return results;
}

/**
 * Cancels all pending downloads
 */
export function cancelDownloads() {
    console.log('[GCR Download] Cancelling downloads');
    abortDownloads = true;
    downloadQueue = [];
}

/**
 * Gets download statistics
 * @returns {Object} Download stats
 */
export function getDownloadStats() {
    return {
        ...downloadProgress,
        queueLength: downloadQueue.length,
        activeDownloads
    };
}

console.log('[GCR] Download module loaded');
