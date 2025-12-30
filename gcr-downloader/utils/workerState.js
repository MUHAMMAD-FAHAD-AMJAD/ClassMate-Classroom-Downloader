/**
 * GCR Downloader - Worker State Management
 * Persistent state for Manifest V3 service workers
 * 
 * PROBLEM: MV3 service workers terminate after 30 seconds of inactivity,
 * causing in-memory state (downloadQueue, activeDownloads) to be lost.
 * 
 * SOLUTION: Store all mutable state in chrome.storage.session (survives
 * worker termination but cleared on browser close) with atomic operations
 * to prevent race conditions.
 * 
 * @module workerState
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Schema version for state migration
 */
export const STATE_VERSION = 1;

/**
 * Storage keys for persistent state
 */
export const STATE_KEYS = {
    // Download queue and progress
    DOWNLOAD_QUEUE: 'gcr_worker_download_queue',
    ACTIVE_DOWNLOADS: 'gcr_worker_active_downloads',
    DOWNLOAD_PROGRESS: 'gcr_worker_download_progress',
    DOWNLOAD_RESULTS: 'gcr_worker_download_results',

    // Worker lifecycle
    WORKER_HEARTBEAT: 'gcr_worker_heartbeat',
    WORKER_LOCK: 'gcr_worker_lock',

    // Operation state
    CURRENT_OPERATION: 'gcr_worker_current_operation',
    OPERATION_ABORT: 'gcr_worker_operation_abort'
};

/**
 * Lock timeout in milliseconds (5 seconds)
 */
const LOCK_TIMEOUT_MS = 5000;

/**
 * Heartbeat interval (1 minute)
 */
const HEARTBEAT_INTERVAL_MINUTES = 1;

/**
 * Stale operation threshold (2 minutes)
 */
const STALE_OPERATION_MS = 2 * 60 * 1000;

// ============================================================================
// SESSION STORAGE HELPERS
// ============================================================================

/**
 * Gets value from session storage
 * @param {string} key - Storage key
 * @returns {Promise<any>} Stored value or null
 */
async function getSessionValue(key) {
    try {
        const result = await chrome.storage.session.get(key);
        return result[key] ?? null;
    } catch (error) {
        console.error('[GCR WorkerState] Error getting session value:', key, error);
        return null;
    }
}

/**
 * Sets value in session storage
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 * @returns {Promise<void>}
 */
async function setSessionValue(key, value) {
    try {
        await chrome.storage.session.set({ [key]: value });
    } catch (error) {
        console.error('[GCR WorkerState] Error setting session value:', key, error);
        throw error;
    }
}

/**
 * Removes value from session storage
 * @param {string} key - Storage key
 * @returns {Promise<void>}
 */
async function removeSessionValue(key) {
    try {
        await chrome.storage.session.remove(key);
    } catch (error) {
        console.error('[GCR WorkerState] Error removing session value:', key, error);
    }
}

// ============================================================================
// ATOMIC OPERATIONS WITH LOCKING
// ============================================================================

/**
 * Acquires a lock for atomic operations
 * @param {string} lockKey - Lock identifier
 * @param {number} timeout - Lock timeout in ms
 * @returns {Promise<string|null>} Lock token if acquired, null if failed
 */
async function acquireLock(lockKey, timeout = LOCK_TIMEOUT_MS) {
    const lockToken = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const fullLockKey = `${lockKey}_lock`;

    // Check existing lock
    const existingLock = await getSessionValue(fullLockKey);
    if (existingLock) {
        const [timestamp] = existingLock.split('_');
        if (Date.now() - parseInt(timestamp) < timeout) {
            // Lock still valid, cannot acquire
            return null;
        }
        // Lock expired, we can take over
    }

    // Attempt to acquire
    await setSessionValue(fullLockKey, lockToken);

    // Verify we got it (race condition check)
    const verifyLock = await getSessionValue(fullLockKey);
    if (verifyLock !== lockToken) {
        return null;
    }

    return lockToken;
}

/**
 * Releases a lock
 * @param {string} lockKey - Lock identifier
 * @param {string} lockToken - Token from acquireLock
 * @returns {Promise<void>}
 */
async function releaseLock(lockKey, lockToken) {
    const fullLockKey = `${lockKey}_lock`;
    const currentLock = await getSessionValue(fullLockKey);

    // Only release if we still own it
    if (currentLock === lockToken) {
        await removeSessionValue(fullLockKey);
    }
}

/**
 * Performs an atomic read-modify-write operation on a state key
 * @param {string} key - State key to update
 * @param {Function} updateFn - Function that receives current value and returns new value
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<any>} Updated value
 */
export async function atomicUpdate(key, updateFn, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const lockToken = await acquireLock(key);

        if (!lockToken) {
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
            continue;
        }

        try {
            const currentValue = await getSessionValue(key);
            const newValue = await updateFn(currentValue);
            await setSessionValue(key, newValue);
            return newValue;
        } finally {
            await releaseLock(key, lockToken);
        }
    }

    throw new Error(`[GCR WorkerState] Failed to acquire lock for ${key} after ${maxRetries} attempts`);
}

// ============================================================================
// DOWNLOAD QUEUE MANAGEMENT
// ============================================================================

/**
 * Download job states
 */
export const DOWNLOAD_STATES = {
    PENDING: 'pending',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
};

/**
 * Gets all download jobs
 * @returns {Promise<Array>} Array of download jobs
 */
export async function getDownloadQueue() {
    return (await getSessionValue(STATE_KEYS.DOWNLOAD_QUEUE)) || [];
}

/**
 * Adds a download job to the queue
 * @param {Object} attachment - File attachment object
 * @param {string} courseFolderName - Course folder name
 * @returns {Promise<Object>} Created job
 */
export async function addDownloadJob(attachment, courseFolderName) {
    const job = {
        id: `${attachment.id}_${Date.now()}`,
        fileId: attachment.id,
        attachment,
        courseFolderName,
        state: DOWNLOAD_STATES.PENDING,
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        error: null,
        bytesDownloaded: 0,
        totalBytes: attachment.size || 0,
        chromeDownloadId: null
    };

    await atomicUpdate(STATE_KEYS.DOWNLOAD_QUEUE, (queue) => {
        const updated = queue || [];
        updated.push(job);
        return updated;
    });

    console.log('[GCR WorkerState] Added download job:', job.id);
    return job;
}

/**
 * Updates a download job by ID
 * @param {string} jobId - Job ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} Updated job or null if not found
 */
export async function updateDownloadJob(jobId, updates) {
    let updatedJob = null;

    await atomicUpdate(STATE_KEYS.DOWNLOAD_QUEUE, (queue) => {
        const updated = queue || [];
        const index = updated.findIndex(j => j.id === jobId);

        if (index >= 0) {
            updated[index] = { ...updated[index], ...updates };
            updatedJob = updated[index];
        }

        return updated;
    });

    return updatedJob;
}

/**
 * Gets the next pending job from the queue
 * @returns {Promise<Object|null>} Next pending job or null
 */
export async function getNextPendingJob() {
    const queue = await getDownloadQueue();
    return queue.find(j => j.state === DOWNLOAD_STATES.PENDING) || null;
}

/**
 * Counts jobs by state
 * @returns {Promise<Object>} Count by state
 */
export async function getJobCounts() {
    const queue = await getDownloadQueue();

    return {
        pending: queue.filter(j => j.state === DOWNLOAD_STATES.PENDING).length,
        active: queue.filter(j => j.state === DOWNLOAD_STATES.ACTIVE).length,
        completed: queue.filter(j => j.state === DOWNLOAD_STATES.COMPLETED).length,
        failed: queue.filter(j => j.state === DOWNLOAD_STATES.FAILED).length,
        cancelled: queue.filter(j => j.state === DOWNLOAD_STATES.CANCELLED).length,
        total: queue.length
    };
}

/**
 * Clears the download queue
 * @param {boolean} onlyCompleted - If true, only clear completed/failed/cancelled
 * @returns {Promise<void>}
 */
export async function clearDownloadQueue(onlyCompleted = false) {
    if (onlyCompleted) {
        await atomicUpdate(STATE_KEYS.DOWNLOAD_QUEUE, (queue) => {
            return (queue || []).filter(j =>
                j.state === DOWNLOAD_STATES.PENDING ||
                j.state === DOWNLOAD_STATES.ACTIVE
            );
        });
    } else {
        await setSessionValue(STATE_KEYS.DOWNLOAD_QUEUE, []);
    }

    console.log('[GCR WorkerState] Download queue cleared');
}

/**
 * Marks all active jobs as pending (for resume after worker restart)
 * Uses direct storage access (no lock) since this only runs during init
 * @returns {Promise<number>} Number of jobs reset
 */
export async function resetActiveJobs() {
    let resetCount = 0;

    try {
        // Get current queue directly (no lock needed - we're the only instance at init)
        const queue = (await getSessionValue(STATE_KEYS.DOWNLOAD_QUEUE)) || [];

        if (queue.length === 0) {
            return 0; // No jobs to reset
        }

        const updated = queue.map(job => {
            if (job.state === DOWNLOAD_STATES.ACTIVE) {
                resetCount++;
                return {
                    ...job,
                    state: DOWNLOAD_STATES.PENDING,
                    startedAt: null,
                    retryCount: job.retryCount + 1
                };
            }
            return job;
        });

        if (resetCount > 0) {
            await setSessionValue(STATE_KEYS.DOWNLOAD_QUEUE, updated);
            console.log(`[GCR WorkerState] Reset ${resetCount} active jobs to pending`);
        }
    } catch (error) {
        console.warn('[GCR WorkerState] Error resetting active jobs:', error.message);
        // Non-fatal - continue initialization
    }

    return resetCount;
}

// ============================================================================
// DOWNLOAD PROGRESS
// ============================================================================

/**
 * Gets current download progress
 * @returns {Promise<Object>} Progress object
 */
export async function getDownloadProgress() {
    return (await getSessionValue(STATE_KEYS.DOWNLOAD_PROGRESS)) || {
        total: 0,
        completed: 0,
        failed: 0,
        inProgress: 0,
        percent: 0,
        currentFile: null,
        startTime: null
    };
}

/**
 * Updates download progress
 * @param {Object} updates - Progress updates
 * @returns {Promise<Object>} Updated progress
 */
export async function updateDownloadProgress(updates) {
    return await atomicUpdate(STATE_KEYS.DOWNLOAD_PROGRESS, (progress) => {
        const updated = {
            ...(progress || {}),
            ...updates
        };

        // Calculate percent
        if (updated.total > 0) {
            updated.percent = Math.round((updated.completed / updated.total) * 100);
        }

        return updated;
    });
}

/**
 * Resets download progress
 * @returns {Promise<void>}
 */
export async function resetDownloadProgress() {
    await setSessionValue(STATE_KEYS.DOWNLOAD_PROGRESS, {
        total: 0,
        completed: 0,
        failed: 0,
        inProgress: 0,
        percent: 0,
        currentFile: null,
        startTime: null
    });
}

// ============================================================================
// WORKER HEARTBEAT & RESURRECTION
// ============================================================================

/**
 * Sets up the worker heartbeat alarm
 * This keeps the worker alive during downloads and handles resurrection
 */
export function setupWorkerHeartbeat() {
    // Create heartbeat alarm
    chrome.alarms.create('gcr-worker-heartbeat', {
        periodInMinutes: HEARTBEAT_INTERVAL_MINUTES
    });

    // Listen for alarm
    chrome.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === 'gcr-worker-heartbeat') {
            await handleHeartbeat();
        }
    });

    // Record initial heartbeat
    setSessionValue(STATE_KEYS.WORKER_HEARTBEAT, Date.now());

    console.log('[GCR WorkerState] Worker heartbeat initialized');
}

/**
 * Handles the heartbeat tick
 * Checks for interrupted downloads and resumes them
 */
async function handleHeartbeat() {
    console.log('[GCR WorkerState] Heartbeat tick');

    // Update heartbeat timestamp
    await setSessionValue(STATE_KEYS.WORKER_HEARTBEAT, Date.now());

    // Check for stale active operations
    const currentOp = await getSessionValue(STATE_KEYS.CURRENT_OPERATION);
    if (currentOp && Date.now() - currentOp.startTime > STALE_OPERATION_MS) {
        console.log('[GCR WorkerState] Detected stale operation, cleaning up');
        await removeSessionValue(STATE_KEYS.CURRENT_OPERATION);
    }

    // Check for interrupted downloads
    const counts = await getJobCounts();
    if (counts.pending > 0 || counts.active > 0) {
        console.log(`[GCR WorkerState] Found ${counts.pending} pending, ${counts.active} active jobs`);

        // Reset any stuck active jobs
        if (counts.active > 0) {
            await resetActiveJobs();
        }

        // Trigger resume (will be handled by download manager)
        chrome.runtime.sendMessage({ type: 'RESUME_DOWNLOADS' }).catch(() => {
            // Message may fail if no listener, that's OK
        });
    }
}

/**
 * Extends worker lifetime during critical operations
 * Call this periodically during long operations
 */
export async function keepAlive() {
    // This API call keeps the service worker alive
    try {
        await chrome.runtime.getPlatformInfo();
    } catch (e) {
        // Ignore errors
    }
}

// ============================================================================
// OPERATION TRACKING
// ============================================================================

/**
 * Marks the start of a long-running operation
 * @param {string} operationType - Type of operation
 * @param {Object} metadata - Additional operation data
 * @returns {Promise<string>} Operation ID
 */
export async function startOperation(operationType, metadata = {}) {
    const operationId = `${operationType}_${Date.now()}`;

    await setSessionValue(STATE_KEYS.CURRENT_OPERATION, {
        id: operationId,
        type: operationType,
        startTime: Date.now(),
        ...metadata
    });

    return operationId;
}

/**
 * Marks the end of an operation
 * @returns {Promise<void>}
 */
export async function endOperation() {
    await removeSessionValue(STATE_KEYS.CURRENT_OPERATION);
}

/**
 * Checks if an abort has been requested
 * @returns {Promise<boolean>} True if abort requested
 */
export async function isAbortRequested() {
    return (await getSessionValue(STATE_KEYS.OPERATION_ABORT)) === true;
}

/**
 * Requests abort of current operation
 * @returns {Promise<void>}
 */
export async function requestAbort() {
    await setSessionValue(STATE_KEYS.OPERATION_ABORT, true);
}

/**
 * Clears the abort flag
 * @returns {Promise<void>}
 */
export async function clearAbort() {
    await removeSessionValue(STATE_KEYS.OPERATION_ABORT);
}

// ============================================================================
// DOWNLOAD RESULTS
// ============================================================================

/**
 * Stores download results for retrieval by UI
 * @param {Object} results - Download results
 * @returns {Promise<void>}
 */
export async function setDownloadResults(results) {
    await setSessionValue(STATE_KEYS.DOWNLOAD_RESULTS, {
        ...results,
        timestamp: Date.now()
    });
}

/**
 * Gets stored download results
 * @returns {Promise<Object|null>} Results or null
 */
export async function getDownloadResults() {
    return await getSessionValue(STATE_KEYS.DOWNLOAD_RESULTS);
}

/**
 * Clears download results
 * @returns {Promise<void>}
 */
export async function clearDownloadResults() {
    await removeSessionValue(STATE_KEYS.DOWNLOAD_RESULTS);
}

// ============================================================================
// STATE CLEANUP
// ============================================================================

/**
 * Cleans up all worker state
 * Call this on extension unload or when resetting
 * @returns {Promise<void>}
 */
export async function cleanupAllState() {
    const keys = Object.values(STATE_KEYS);

    for (const key of keys) {
        await removeSessionValue(key);
        await removeSessionValue(`${key}_lock`);
    }

    console.log('[GCR WorkerState] All state cleaned up');
}

/**
 * Gets a full state dump for debugging
 * @returns {Promise<Object>} Complete state
 */
export async function getStateSnapshot() {
    const snapshot = {};

    for (const [name, key] of Object.entries(STATE_KEYS)) {
        snapshot[name] = await getSessionValue(key);
    }

    return {
        version: STATE_VERSION,
        timestamp: Date.now(),
        state: snapshot
    };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes worker state on service worker startup
 * Call this at the top of background.js
 */
export async function initializeWorkerState() {
    console.log('[GCR WorkerState] Initializing worker state');

    // Setup heartbeat
    setupWorkerHeartbeat();

    // Reset any stale active jobs from previous worker instance
    await resetActiveJobs();

    // Clear abort flag
    await clearAbort();

    console.log('[GCR WorkerState] Worker state initialized');
}

console.log('[GCR] WorkerState module loaded');
