/**
 * GCR Downloader - Authentication Module
 * Handles OAuth 2.0 flow with Google using chrome.identity API
 * 
 * Features:
 * - Token acquisition via chrome.identity.getAuthToken
 * - Token caching and refresh with MUTEX LOCKING (prevents race conditions)
 * - Proactive refresh via ALARMS (refreshes at 50 minutes)
 * - Automatic expiration handling (2-3 hour university sessions)
 * - Sign out / token revocation
 * - Batch operation pre-validation
 * 
 * @module auth
 * @version 2.0.0 - Added mutex locking and proactive refresh
 */

import { getStorage, setStorage, removeStorage } from './helpers.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Storage keys for auth data
 * SEC-002 FIX: Use dedicated keys for session storage (tokens)
 */
const AUTH_TOKEN_KEY = 'gcr_auth_token';
const AUTH_TIMESTAMP_KEY = 'gcr_auth_timestamp';
const TOKEN_REFRESH_LOCK_KEY = 'gcr_token_refresh_lock';
const PROACTIVE_REFRESH_ALARM = 'gcr-proactive-token-refresh';

/**
 * SEC-002 FIX: Token TTL - tokens should be treated as expired after this time
 * even if not explicitly invalidated (defense in depth)
 */
const TOKEN_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 hours max

/**
 * Token expiry buffer - refresh 5 minutes before actual expiry
 * University accounts typically expire every 2-3 hours
 */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Default token lifetime assumption (1 hour, but may be shorter for university accounts)
 */
const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

/**
 * Proactive refresh interval - refresh before expiry (50 minutes)
 */
const PROACTIVE_REFRESH_MINUTES = 50;

/**
 * Lock timeout for mutex - prevents deadlocks
 */
const LOCK_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Maximum wait time for lock acquisition
 */
const LOCK_MAX_WAIT_MS = 15000; // 15 seconds

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Gets the current auth token, refreshing if necessary
 * @param {boolean} interactive - Whether to show login popup if needed
 * @returns {Promise<string>} Access token
 * @throws {Error} If authentication fails
 */
export async function getAuthToken(interactive = true) {
    console.log('[GCR Auth] Getting auth token, interactive:', interactive);

    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive }, async (token) => {
            if (chrome.runtime.lastError) {
                const error = chrome.runtime.lastError;
                console.error('[GCR Auth] Error getting token:', error.message);

                // Handle specific error cases
                if (error.message.includes('canceled')) {
                    reject(new Error('Authentication canceled by user'));
                } else if (error.message.includes('network')) {
                    reject(new Error('Network error during authentication'));
                } else if (error.message.includes('OAuth2')) {
                    reject(new Error('OAuth configuration error. Please check manifest.json'));
                } else {
                    reject(new Error(error.message));
                }
                return;
            }

            if (!token) {
                console.error('[GCR Auth] No token returned');
                reject(new Error('No authentication token received'));
                return;
            }

            console.log('[GCR Auth] Token obtained successfully');

            // Store token timestamp for expiry tracking
            try {
                await setStorage({
                    [AUTH_TOKEN_KEY]: token,
                    [AUTH_TIMESTAMP_KEY]: Date.now()
                });
                
                // AUTH-002 FIX: Fetch and store actual expiry from Google
                updateTokenExpiry(token).catch(e => {
                    console.warn('[GCR Auth] Background expiry check failed:', e);
                });
            } catch (e) {
                console.warn('[GCR Auth] Failed to store token timestamp:', e);
            }

            resolve(token);
        });
    });
}

/**
 * Checks if user is currently authenticated (has valid token)
 * @returns {Promise<boolean>} True if authenticated
 */
export async function isAuthenticated() {
    try {
        // Try to get token non-interactively
        const token = await getAuthToken(false);
        return !!token;
    } catch (e) {
        console.log('[GCR Auth] Not authenticated:', e.message);
        return false;
    }
}

/**
 * AUTH-002 FIX: Storage key for actual token expiry time from Google
 */
const TOKEN_EXPIRY_KEY = 'gcr_token_expiry';

/**
 * Checks if the current token might be expired
 * AUTH-002 FIX: Now uses actual expiry from Google tokeninfo when available
 * @returns {Promise<boolean>} True if token might be expired
 */
export async function isTokenExpired() {
    try {
        const data = await getStorage([AUTH_TIMESTAMP_KEY, TOKEN_EXPIRY_KEY]);
        const timestamp = data[AUTH_TIMESTAMP_KEY];
        const actualExpiry = data[TOKEN_EXPIRY_KEY];

        // AUTH-002: Use actual expiry time if available
        if (actualExpiry) {
            const now = Date.now();
            // Consider expired if within buffer of actual expiry
            if (now >= actualExpiry - TOKEN_EXPIRY_BUFFER_MS) {
                console.log('[GCR Auth] Token expired based on actual expiry');
                return true;
            }
            return false;
        }

        // Fallback to timestamp-based check
        if (!timestamp) {
            return true;
        }

        const elapsed = Date.now() - timestamp;
        return elapsed > (DEFAULT_TOKEN_LIFETIME_MS - TOKEN_EXPIRY_BUFFER_MS);
    } catch (e) {
        console.warn('[GCR Auth] Error checking token expiry:', e);
        return true;
    }
}

/**
 * AUTH-002 FIX: Fetches and stores actual token expiry from Google tokeninfo
 * SEC-001 FIX: Uses POST body instead of URL query params to prevent token leakage
 * @param {string} token - The access token to check
 * @returns {Promise<number|null>} Seconds until expiry, or null on error
 */
async function updateTokenExpiry(token) {
    if (!token) return null;
    
    try {
        // SEC-001 FIX: Send token in POST body instead of URL query string
        // This prevents token leakage via server logs, browser history, and Referer headers
        const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `access_token=${encodeURIComponent(token)}`
        });
        
        if (!response.ok) {
            console.warn('[GCR Auth] Token info request failed:', response.status);
            return null;
        }
        
        const data = await response.json();
        const expiresIn = parseInt(data.expires_in, 10);
        
        if (expiresIn > 0) {
            const expiryTime = Date.now() + (expiresIn * 1000);
            await setStorage({ [TOKEN_EXPIRY_KEY]: expiryTime });
            console.log(`[GCR Auth] Token expires in ${expiresIn}s (stored actual expiry)`);
            return expiresIn;
        }
        
        return null;
    } catch (e) {
        console.warn('[GCR Auth] Failed to get token expiry:', e);
        return null;
    }
}

// ============================================================================
// TOKEN REFRESH MUTEX (RACE-001 FIX: Uses Web Locks API for atomic operations)
// ============================================================================

/**
 * Executes a callback with an exclusive lock using the Web Locks API
 * This provides TRUE atomic locking that eliminates TOCTOU race conditions
 * 
 * CRITICAL FIX: The previous storage-based mutex had a race window between
 * reading the lock state and writing the new lock, allowing multiple processes
 * to acquire the lock simultaneously. The Web Locks API provides browser-native
 * atomic locking.
 * 
 * @param {Function} callback - Async callback to execute while holding the lock
 * @returns {Promise<any>} Result of the callback
 */
async function withRefreshLock(callback) {
    // Check if Web Locks API is available (Chrome 69+)
    if (typeof navigator !== 'undefined' && navigator.locks) {
        return navigator.locks.request(
            'gcr_token_refresh_lock',
            { mode: 'exclusive', ifAvailable: false },
            async (lock) => {
                if (!lock) {
                    console.warn('[GCR Auth] Failed to acquire Web Lock, falling back');
                    return callback();
                }
                console.log('[GCR Auth] Acquired Web Lock for token refresh');
                try {
                    return await callback();
                } finally {
                    console.log('[GCR Auth] Released Web Lock');
                }
            }
        );
    }

    // Fallback for environments without Web Locks (shouldn't happen in Chrome extensions)
    console.warn('[GCR Auth] Web Locks API not available, using storage-based fallback');
    return withStorageLock(callback);
}

/**
 * Storage-based lock fallback (only used if Web Locks unavailable)
 * SEC-003 FIX: Improved atomic acquisition using lock version check
 * @param {Function} callback - Callback to execute
 * @returns {Promise<any>}
 */
async function withStorageLock(callback) {
    const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const startTime = Date.now();
    let acquired = false;
    let lockVersion = 0;

    // Attempt to acquire lock with timeout
    while (Date.now() - startTime < LOCK_MAX_WAIT_MS) {
        const data = await getStorage([TOKEN_REFRESH_LOCK_KEY]);
        const existingLock = data[TOKEN_REFRESH_LOCK_KEY];

        if (existingLock) {
            const lockAge = Date.now() - existingLock.timestamp;
            if (lockAge < LOCK_TIMEOUT_MS) {
                await new Promise(resolve => setTimeout(resolve, 200));
                continue;
            }
            // Lock expired, record its version to detect concurrent override
            lockVersion = existingLock.version || 0;
        }

        // SEC-003 FIX: Include version for optimistic concurrency control
        const newLock = {
            lockId,
            timestamp: Date.now(),
            version: lockVersion + 1
        };
        await setStorage({ [TOKEN_REFRESH_LOCK_KEY]: newLock });

        // SEC-003 FIX: Double-check acquisition with version verification
        await new Promise(resolve => setTimeout(resolve, 50));
        const verifyData = await getStorage([TOKEN_REFRESH_LOCK_KEY]);
        const verifiedLock = verifyData[TOKEN_REFRESH_LOCK_KEY];

        if (verifiedLock?.lockId === lockId && verifiedLock?.version === newLock.version) {
            acquired = true;
            break;
        }

        // Lost race, backoff and retry
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
    }

    if (!acquired) {
        console.warn('[GCR Auth] Storage lock timeout, proceeding with caution');
    }

    try {
        return await callback();
    } finally {
        if (acquired) {
            const data = await getStorage([TOKEN_REFRESH_LOCK_KEY]);
            if (data[TOKEN_REFRESH_LOCK_KEY]?.lockId === lockId) {
                await removeStorage([TOKEN_REFRESH_LOCK_KEY]);
            }
        }
    }
}

// Legacy function stubs for compatibility (deprecated, use withRefreshLock)
async function acquireRefreshLock() {
    console.warn('[GCR Auth] acquireRefreshLock is deprecated, use withRefreshLock');
    return { acquired: true, lockId: 'legacy' };
}

async function releaseRefreshLock(lockId) {
    console.warn('[GCR Auth] releaseRefreshLock is deprecated');
}

/**
 * Forces a token refresh by removing cached token and getting new one
 * Uses Web Locks API mutex to prevent race conditions during concurrent refreshes
 * 
 * RACE-001 FIX: Now uses withRefreshLock for true atomic operations
 * 
 * @param {boolean} interactive - Whether to show login popup
 * @returns {Promise<string>} New access token
 */
export async function refreshToken(interactive = true) {
    console.log('[GCR Auth] Forcing token refresh');

    return withRefreshLock(async () => {
        // AUTH-001 FIX: Get new token FIRST, THEN revoke old token
        // This prevents auth gap if new token acquisition fails
        let newToken;
        
        try {
            // First, get a new token (old token is still valid as fallback)
            newToken = await getAuthToken(interactive);
            
            if (!newToken) {
                throw new Error('Failed to obtain new token');
            }
        } catch (tokenError) {
            console.error('[GCR Auth] Failed to get new token, keeping old token:', tokenError.message);
            // Don't revoke old token - user still has some authentication
            throw tokenError;
        }

        // Only revoke old cached token AFTER we have a new one
        try {
            await revokeTokenInternal(false);
        } catch (e) {
            console.warn('[GCR Auth] Error revoking old token (non-fatal):', e);
            // Continue - we already have the new token
        }

        // Schedule next proactive refresh
        scheduleProactiveRefresh();

        return newToken;
    });
}

// ============================================================================
// PROACTIVE TOKEN REFRESH (via Alarms)
// ============================================================================

/**
 * Sets up proactive token refresh using chrome.alarms
 * This prevents token expiration during long operations
 * Call this once during extension initialization
 */
export function setupProactiveTokenRefresh() {
    // Create alarm for proactive refresh
    chrome.alarms.create(PROACTIVE_REFRESH_ALARM, {
        delayInMinutes: PROACTIVE_REFRESH_MINUTES,
        periodInMinutes: PROACTIVE_REFRESH_MINUTES
    });

    // Listen for alarm
    chrome.alarms.onAlarm.addListener(async (alarm) => {
        if (alarm.name === PROACTIVE_REFRESH_ALARM) {
            await handleProactiveRefresh();
        }
    });

    console.log(`[GCR Auth] Proactive refresh scheduled every ${PROACTIVE_REFRESH_MINUTES} minutes`);
}

/**
 * Schedules the next proactive refresh
 * Called after successful token acquisition
 */
function scheduleProactiveRefresh() {
    chrome.alarms.create(PROACTIVE_REFRESH_ALARM, {
        delayInMinutes: PROACTIVE_REFRESH_MINUTES
    });
}

/**
 * Handles the proactive refresh alarm
 * Silently refreshes token in background
 */
async function handleProactiveRefresh() {
    console.log('[GCR Auth] Proactive refresh triggered');

    try {
        // Check if we have a token to refresh
        const isAuth = await isAuthenticated();
        if (!isAuth) {
            console.log('[GCR Auth] Not authenticated, skipping proactive refresh');
            return;
        }

        // Refresh non-interactively (silent)
        await refreshToken(false);
        console.log('[GCR Auth] Proactive refresh successful');
    } catch (error) {
        console.warn('[GCR Auth] Proactive refresh failed:', error.message);
        // Don't throw - this is a background operation
    }
}

// ============================================================================
// BATCH OPERATION PRE-VALIDATION
// ============================================================================

/**
 * Ensures we have a valid token before starting batch operations
 * This prevents authentication failures mid-operation
 * @returns {Promise<boolean>} True if token is valid
 */
export async function ensureValidTokenForBatch() {
    console.log('[GCR Auth] Pre-validating token for batch operation');

    try {
        const token = await getAuthToken(false);
        if (!token) {
            console.log('[GCR Auth] No token available for batch validation');
            return false;
        }

        // SEC-001 FIX: Validate using POST body instead of URL query string
        const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `access_token=${encodeURIComponent(token)}`
        });

        if (!response.ok) {
            console.log('[GCR Auth] Token invalid, refreshing for batch...');
            await refreshToken(true);
            return true;
        }

        const data = await response.json();
        const expiresIn = parseInt(data.expires_in) || 0;

        // If token expires in less than 10 minutes, refresh proactively
        if (expiresIn < 600) {
            console.log(`[GCR Auth] Token expires in ${expiresIn}s, refreshing for batch...`);
            await refreshToken(true);
        } else {
            console.log(`[GCR Auth] Token valid for ${expiresIn}s, proceeding with batch`);
        }

        return true;
    } catch (error) {
        console.error('[GCR Auth] Batch token validation failed:', error);
        return false;
    }
}

/**
 * Internal token revocation without clearing all storage
 * @param {boolean} revokeOnGoogle - Whether to revoke on Google's servers
 */
async function revokeTokenInternal(revokeOnGoogle = true) {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, async (token) => {
            if (chrome.runtime.lastError || !token) {
                // No token to revoke
                resolve();
                return;
            }

            // Remove cached token from Chrome
            chrome.identity.removeCachedAuthToken({ token }, async () => {
                if (chrome.runtime.lastError) {
                    console.warn('[GCR Auth] Error removing cached token:', chrome.runtime.lastError);
                }

                // Optionally revoke on Google's servers
                if (revokeOnGoogle) {
                    try {
                        await fetch('https://accounts.google.com/o/oauth2/revoke', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            },
                            body: `token=${token}`
                        });
                        console.log('[GCR Auth] Token revoked on Google servers');
                    } catch (e) {
                        console.warn('[GCR Auth] Failed to revoke token on Google:', e);
                    }
                }

                resolve();
            });
        });
    });
}

/**
 * Signs out the user by revoking token and clearing auth storage
 * @returns {Promise<void>}
 */
export async function signOut() {
    console.log('[GCR Auth] Signing out user');

    try {
        // Revoke token
        await revokeTokenInternal(true);

        // Clear stored auth data
        await removeStorage([AUTH_TOKEN_KEY, AUTH_TIMESTAMP_KEY]);

        console.log('[GCR Auth] Sign out complete');
    } catch (e) {
        console.error('[GCR Auth] Error during sign out:', e);
        throw e;
    }
}

// ============================================================================
// TOKEN VALIDATION
// ============================================================================

/**
 * Validates a token by making a test API request
 * @param {string} token - Token to validate
 * @returns {Promise<boolean>} True if token is valid
 */
export async function validateToken(token) {
    if (!token) return false;

    try {
        // SEC-001 FIX: Use POST body instead of URL query string
        const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `access_token=${encodeURIComponent(token)}`
        });

        if (response.ok) {
            const data = await response.json();
            console.log('[GCR Auth] Token valid, expires in:', data.expires_in, 'seconds');
            return true;
        }

        console.log('[GCR Auth] Token validation failed:', response.status);
        return false;
    } catch (e) {
        console.error('[GCR Auth] Token validation error:', e);
        return false;
    }
}

/**
 * Gets auth token with automatic validation and refresh if needed
 * @param {boolean} interactive - Whether to show login popup
 * @returns {Promise<string>} Valid access token
 */
export async function getValidToken(interactive = true) {
    // Check if token might be expired
    const mightBeExpired = await isTokenExpired();

    if (mightBeExpired) {
        console.log('[GCR Auth] Token might be expired, refreshing...');
        return refreshToken(interactive);
    }

    // Get current token
    const token = await getAuthToken(interactive);

    // Validate it
    const isValid = await validateToken(token);

    if (!isValid) {
        console.log('[GCR Auth] Token invalid, refreshing...');
        return refreshToken(interactive);
    }

    return token;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Checks if an error indicates authentication is needed
 * @param {Error|Response} error - Error or response to check
 * @returns {boolean} True if re-authentication is needed
 */
export function isAuthError(error) {
    if (error instanceof Response) {
        return error.status === 401;
    }

    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes('401') ||
            msg.includes('unauthorized') ||
            msg.includes('token') ||
            msg.includes('auth');
    }

    return false;
}

/**
 * Handles an authentication error by prompting for re-auth
 * @param {boolean} interactive - Whether to show login popup
 * @returns {Promise<string>} New token after re-auth
 */
export async function handleAuthError(interactive = true) {
    console.log('[GCR Auth] Handling auth error, attempting re-authentication');
    return refreshToken(interactive);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Gets the user's email from the current session
 * @returns {Promise<string|null>} User email or null
 */
export async function getUserEmail() {
    try {
        const token = await getAuthToken(false);
        if (!token) return null;

        // SEC-001 FIX: Use Authorization header instead of URL query string
        const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data.email;
        }

        return null;
    } catch (e) {
        console.error('[GCR Auth] Error getting user email:', e);
        return null;
    }
}

console.log('[GCR] Auth module loaded');
