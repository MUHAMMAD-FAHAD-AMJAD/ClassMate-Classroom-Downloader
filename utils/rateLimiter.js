/**
 * GCR Downloader - Token Bucket Rate Limiter
 * Implements client-side throttling to prevent 429 rate limit errors
 * 
 * PROBLEM: Google APIs have ~100 requests/minute limit but the extension
 * made unlimited concurrent requests, causing 429 errors on large courses.
 * 
 * SOLUTION: Token bucket algorithm with:
 * - 90 requests/minute (10% safety buffer)
 * - Request queue with priority levels
 * - State persistence across service worker restarts
 * - Exponential backoff on 429 responses
 * 
 * @module rateLimiter
 * @version 1.0.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Rate limiter configuration
 */
const RATE_LIMIT_CONFIG = {
    // Token bucket settings
    MAX_TOKENS: 90,              // Maximum tokens (requests) in bucket
    REFILL_RATE: 1.5,            // Tokens added per second (90/minute)
    REFILL_INTERVAL_MS: 1000,    // Check refill every second

    // Priority levels (lower number = higher priority)
    PRIORITY: {
        CRITICAL: 0,   // Auth, course metadata
        HIGH: 1,       // File metadata, downloads
        NORMAL: 2,     // Coursework, materials
        LOW: 3         // Background sync
    },

    // Storage key for persistence
    STORAGE_KEY: 'gcr_rate_limit_state',

    // Backoff settings
    INITIAL_BACKOFF_MS: 2000,
    MAX_BACKOFF_MS: 64000,
    BACKOFF_MULTIPLIER: 2
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * HIGH-004 FIX: Per-user rate limit buckets
 * Maps user ID to their own token bucket state
 */
const perUserBuckets = new Map();

/**
 * Current user ID for rate limiting (set via setCurrentUser)
 */
let currentUserId = 'default';

/**
 * Sets the current user for per-user rate limiting
 * @param {string} userId - User identifier (e.g., email hash)
 */
export function setCurrentUser(userId) {
    currentUserId = userId || 'default';
    // Initialize bucket for this user if not exists
    if (!perUserBuckets.has(currentUserId)) {
        perUserBuckets.set(currentUserId, {
            tokens: RATE_LIMIT_CONFIG.MAX_TOKENS,
            lastRefill: Date.now(),
            backoffUntil: 0
        });
    }
}

/**
 * Gets the current user's bucket state
 * @returns {Object} User's bucket state
 */
function getUserBucket() {
    if (!perUserBuckets.has(currentUserId)) {
        perUserBuckets.set(currentUserId, {
            tokens: RATE_LIMIT_CONFIG.MAX_TOKENS,
            lastRefill: Date.now(),
            backoffUntil: 0
        });
    }
    return perUserBuckets.get(currentUserId);
}

/**
 * Rate limiter state (in-memory with persistence)
 */
let rateLimiterState = {
    tokens: RATE_LIMIT_CONFIG.MAX_TOKENS,
    lastRefill: Date.now(),
    requestQueue: [],
    isProcessing: false,
    backoffUntil: 0
};

/**
 * Gets rate limiter state from session storage
 * @returns {Promise<Object>} Current state
 */
async function loadState() {
    try {
        const result = await chrome.storage.session.get(RATE_LIMIT_CONFIG.STORAGE_KEY);
        if (result[RATE_LIMIT_CONFIG.STORAGE_KEY]) {
            rateLimiterState = {
                ...rateLimiterState,
                ...result[RATE_LIMIT_CONFIG.STORAGE_KEY]
            };
        }
    } catch (e) {
        console.warn('[GCR RateLimiter] Error loading state:', e);
    }
    return rateLimiterState;
}

/**
 * Saves rate limiter state to session storage
 * @returns {Promise<void>}
 */
async function saveState() {
    try {
        // Don't persist the request queue (functions can't be serialized)
        const stateToSave = {
            tokens: rateLimiterState.tokens,
            lastRefill: rateLimiterState.lastRefill,
            backoffUntil: rateLimiterState.backoffUntil
        };
        await chrome.storage.session.set({
            [RATE_LIMIT_CONFIG.STORAGE_KEY]: stateToSave
        });
    } catch (e) {
        console.warn('[GCR RateLimiter] Error saving state:', e);
    }
}

// ============================================================================
// TOKEN BUCKET IMPLEMENTATION
// ============================================================================

/**
 * Refills tokens based on elapsed time
 * @returns {number} Current token count
 */
function refillTokens() {
    const now = Date.now();
    const elapsedSeconds = (now - rateLimiterState.lastRefill) / 1000;

    if (elapsedSeconds > 0) {
        const tokensToAdd = elapsedSeconds * RATE_LIMIT_CONFIG.REFILL_RATE;
        rateLimiterState.tokens = Math.min(
            RATE_LIMIT_CONFIG.MAX_TOKENS,
            rateLimiterState.tokens + tokensToAdd
        );
        rateLimiterState.lastRefill = now;
    }

    return rateLimiterState.tokens;
}

/**
 * Attempts to consume a token
 * @returns {boolean} True if token consumed, false if bucket empty
 */
function consumeToken() {
    refillTokens();

    if (rateLimiterState.tokens >= 1) {
        rateLimiterState.tokens -= 1;
        return true;
    }

    return false;
}

/**
 * Calculates wait time until a token is available
 * @returns {number} Milliseconds to wait
 */
function getWaitTime() {
    refillTokens();

    if (rateLimiterState.tokens >= 1) {
        return 0;
    }

    // Calculate time until 1 token is available
    const tokensNeeded = 1 - rateLimiterState.tokens;
    const secondsToWait = tokensNeeded / RATE_LIMIT_CONFIG.REFILL_RATE;

    return Math.ceil(secondsToWait * 1000);
}

/**
 * Checks if we're in backoff period
 * @returns {boolean} True if in backoff
 */
function isInBackoff() {
    return Date.now() < rateLimiterState.backoffUntil;
}

/**
 * Gets remaining backoff time
 * @returns {number} Milliseconds remaining
 */
function getBackoffRemaining() {
    return Math.max(0, rateLimiterState.backoffUntil - Date.now());
}

// ============================================================================
// REQUEST QUEUE MANAGEMENT
// ============================================================================

/**
 * Request object in the queue
 * @typedef {Object} QueuedRequest
 * @property {string} id - Unique request ID
 * @property {Function} resolve - Promise resolve function
 * @property {Function} reject - Promise reject function
 * @property {number} priority - Priority level
 * @property {number} timestamp - Queue time
 */

/**
 * Queues a request with priority
 * @param {number} priority - Priority level
 * @returns {Promise<void>} Resolves when token is acquired
 */
function queueRequest(priority = RATE_LIMIT_CONFIG.PRIORITY.NORMAL) {
    return new Promise((resolve, reject) => {
        const request = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
            resolve,
            reject,
            priority,
            timestamp: Date.now()
        };

        // Insert by priority (lower number = higher priority)
        let inserted = false;
        for (let i = 0; i < rateLimiterState.requestQueue.length; i++) {
            if (priority < rateLimiterState.requestQueue[i].priority) {
                rateLimiterState.requestQueue.splice(i, 0, request);
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            rateLimiterState.requestQueue.push(request);
        }

        // Start processing if not already
        processQueue();
    });
}

/**
 * Processes the request queue
 */
async function processQueue() {
    if (rateLimiterState.isProcessing) return;
    rateLimiterState.isProcessing = true;

    while (rateLimiterState.requestQueue.length > 0) {
        // Check backoff
        if (isInBackoff()) {
            const backoffTime = getBackoffRemaining();
            console.log(`[GCR RateLimiter] In backoff, waiting ${backoffTime}ms`);
            await delay(backoffTime);
        }

        // Check token availability
        const waitTime = getWaitTime();
        if (waitTime > 0) {
            await delay(waitTime);
        }

        // Consume token and process request
        if (consumeToken()) {
            const request = rateLimiterState.requestQueue.shift();
            if (request) {
                request.resolve();
            }
        }

        // Save state periodically
        await saveState();
    }

    rateLimiterState.isProcessing = false;
}

/**
 * Simple delay function
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Acquires a rate limit token (queues if necessary)
 * @param {number} priority - Priority level (default: NORMAL)
 * @returns {Promise<void>} Resolves when token is acquired
 */
export async function acquire(priority = RATE_LIMIT_CONFIG.PRIORITY.NORMAL) {
    // Fast path: token available immediately
    if (!isInBackoff() && consumeToken()) {
        return;
    }

    // Slow path: queue the request
    return queueRequest(priority);
}

/**
 * Wraps a request function with rate limiting
 * @param {Function} requestFn - Function that makes the request
 * @param {number} priority - Priority level
 * @returns {Promise<any>} Result of requestFn
 */
export async function throttle(requestFn, priority = RATE_LIMIT_CONFIG.PRIORITY.NORMAL) {
    await acquire(priority);
    return requestFn();
}

/**
 * Reports a 429 response, triggering backoff
 * HIGH-010 FIX: Properly parse Retry-After header (can be seconds or HTTP-date)
 * @param {number|string} retryAfter - Retry-After header value (optional)
 */
export function report429(retryAfter = null) {
    let backoffTime;
    
    if (retryAfter !== null && retryAfter !== undefined) {
        // HIGH-010 FIX: Handle both numeric seconds and HTTP-date formats
        if (typeof retryAfter === 'string') {
            // Try to parse as number first
            const seconds = parseInt(retryAfter, 10);
            if (!isNaN(seconds) && seconds > 0) {
                backoffTime = seconds * 1000;
            } else {
                // Try to parse as HTTP-date
                const dateMs = Date.parse(retryAfter);
                if (!isNaN(dateMs)) {
                    backoffTime = Math.max(0, dateMs - Date.now());
                }
            }
        } else if (typeof retryAfter === 'number' && retryAfter > 0) {
            backoffTime = retryAfter * 1000;
        }
    }
    
    // Fall back to calculated backoff if Retry-After not valid
    if (!backoffTime || backoffTime <= 0) {
        backoffTime = calculateBackoff();
    }
    
    // Cap at maximum backoff
    backoffTime = Math.min(backoffTime, RATE_LIMIT_CONFIG.MAX_BACKOFF_MS);

    rateLimiterState.backoffUntil = Date.now() + backoffTime;
    console.log(`[GCR RateLimiter] 429 received, backing off for ${backoffTime}ms`);

    saveState();
}

/**
 * Calculates exponential backoff time
 * @returns {number} Backoff time in milliseconds
 */
function calculateBackoff() {
    // Get current backoff level from consecutive 429s
    const currentBackoff = rateLimiterState.backoffUntil > Date.now()
        ? getBackoffRemaining()
        : RATE_LIMIT_CONFIG.INITIAL_BACKOFF_MS;

    // Double the backoff (exponential) with jitter
    const nextBackoff = Math.min(
        currentBackoff * RATE_LIMIT_CONFIG.BACKOFF_MULTIPLIER,
        RATE_LIMIT_CONFIG.MAX_BACKOFF_MS
    );

    // Add jitter (±20%)
    const jitter = nextBackoff * 0.2 * (Math.random() * 2 - 1);

    return Math.round(nextBackoff + jitter);
}

/**
 * Clears backoff (e.g., after successful request)
 */
export function clearBackoff() {
    if (rateLimiterState.backoffUntil > 0) {
        rateLimiterState.backoffUntil = 0;
        saveState();
    }
}

/**
 * Gets rate limiter statistics
 * @returns {Object} Current stats
 */
export function getStats() {
    refillTokens();

    return {
        availableTokens: Math.floor(rateLimiterState.tokens),
        maxTokens: RATE_LIMIT_CONFIG.MAX_TOKENS,
        queueLength: rateLimiterState.requestQueue.length,
        isInBackoff: isInBackoff(),
        backoffRemaining: getBackoffRemaining(),
        refillRate: `${RATE_LIMIT_CONFIG.REFILL_RATE}/sec`
    };
}

/**
 * Resets the rate limiter to initial state
 */
export async function reset() {
    rateLimiterState = {
        tokens: RATE_LIMIT_CONFIG.MAX_TOKENS,
        lastRefill: Date.now(),
        requestQueue: [],
        isProcessing: false,
        backoffUntil: 0
    };

    await saveState();
    console.log('[GCR RateLimiter] State reset');
}

/**
 * Initializes the rate limiter
 * Call this on service worker startup
 */
export async function initialize() {
    await loadState();
    console.log('[GCR RateLimiter] Initialized with', Math.floor(rateLimiterState.tokens), 'tokens');
}

// ============================================================================
// PRIORITY CONSTANTS EXPORT
// ============================================================================

export const PRIORITY = RATE_LIMIT_CONFIG.PRIORITY;

console.log('[GCR] RateLimiter module loaded');
