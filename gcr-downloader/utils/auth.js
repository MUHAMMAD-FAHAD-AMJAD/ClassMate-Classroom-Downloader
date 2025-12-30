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
 */
const AUTH_TOKEN_KEY = 'gcr_auth_token';
const AUTH_TIMESTAMP_KEY = 'gcr_auth_timestamp';
const TOKEN_REFRESH_LOCK_KEY = 'gcr_token_refresh_lock';
const PROACTIVE_REFRESH_ALARM = 'gcr-proactive-token-refresh';

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
 * Checks if the current token might be expired
 * Based on stored timestamp and configured lifetime
 * @returns {Promise<boolean>} True if token might be expired
 */
export async function isTokenExpired() {
    try {
        const data = await getStorage([AUTH_TIMESTAMP_KEY]);
        const timestamp = data[AUTH_TIMESTAMP_KEY];

        if (!timestamp) {
            // No timestamp stored, assume not expired but get fresh token
            return true;
        }

        const elapsed = Date.now() - timestamp;
        // Consider expired if older than lifetime minus buffer
        return elapsed > (DEFAULT_TOKEN_LIFETIME_MS - TOKEN_EXPIRY_BUFFER_MS);
    } catch (e) {
        console.warn('[GCR Auth] Error checking token expiry:', e);
        return true; // Assume expired on error
    }
}

// ============================================================================
// TOKEN REFRESH MUTEX (Prevents Race Conditions)
// ============================================================================

/**
 * Attempts to acquire the token refresh lock
 * Implements distributed mutex using chrome.storage.local
 * @returns {Promise<{acquired: boolean, lockId: string|null}>}
 */
async function acquireRefreshLock() {
    const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const startTime = Date.now();

    while (Date.now() - startTime < LOCK_MAX_WAIT_MS) {
        const data = await getStorage([TOKEN_REFRESH_LOCK_KEY]);
        const existingLock = data[TOKEN_REFRESH_LOCK_KEY];

        if (existingLock) {
            // Check if lock is stale (older than timeout)
            const lockAge = Date.now() - existingLock.timestamp;
            if (lockAge < LOCK_TIMEOUT_MS) {
                // Lock is held by another operation, wait
                console.log('[GCR Auth] Waiting for refresh lock...');
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }
            // Lock is stale, we can take it
            console.log('[GCR Auth] Taking over stale lock');
        }

        // Attempt to acquire lock
        await setStorage({
            [TOKEN_REFRESH_LOCK_KEY]: {
                lockId,
                timestamp: Date.now()
            }
        });

        // Verify we got it (double-check for race condition)
        const verifyData = await getStorage([TOKEN_REFRESH_LOCK_KEY]);
        if (verifyData[TOKEN_REFRESH_LOCK_KEY]?.lockId === lockId) {
            console.log('[GCR Auth] Acquired refresh lock:', lockId);
            return { acquired: true, lockId };
        }

        // Another process beat us, retry
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.warn('[GCR Auth] Failed to acquire refresh lock after timeout');
    return { acquired: false, lockId: null };
}

/**
 * Releases the token refresh lock
 * @param {string} lockId - The lock ID from acquireRefreshLock
 */
async function releaseRefreshLock(lockId) {
    if (!lockId) return;

    const data = await getStorage([TOKEN_REFRESH_LOCK_KEY]);
    const existingLock = data[TOKEN_REFRESH_LOCK_KEY];

    // Only release if we still own it
    if (existingLock?.lockId === lockId) {
        await removeStorage([TOKEN_REFRESH_LOCK_KEY]);
        console.log('[GCR Auth] Released refresh lock:', lockId);
    }
}

/**
 * Forces a token refresh by removing cached token and getting new one
 * Uses mutex locking to prevent race conditions during concurrent refreshes
 * @param {boolean} interactive - Whether to show login popup
 * @returns {Promise<string>} New access token
 */
export async function refreshToken(interactive = true) {
    console.log('[GCR Auth] Forcing token refresh');

    // Acquire lock to prevent multiple simultaneous refreshes
    const { acquired, lockId } = await acquireRefreshLock();

    if (!acquired) {
        // Another refresh is in progress, just get the current token
        console.log('[GCR Auth] Another refresh in progress, waiting...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        return getAuthToken(interactive);
    }

    try {
        // First, revoke the cached token
        try {
            await revokeTokenInternal(false);
        } catch (e) {
            console.warn('[GCR Auth] Error revoking old token:', e);
        }

        // Get new token
        const newToken = await getAuthToken(interactive);

        // Schedule next proactive refresh
        scheduleProactiveRefresh();

        return newToken;
    } finally {
        await releaseRefreshLock(lockId);
    }
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

        // Validate against tokeninfo endpoint (lightweight check)
        const response = await fetch(
            'https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token
        );

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
                        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
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
        const response = await fetch(
            'https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + token
        );

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

        const response = await fetch(
            'https://www.googleapis.com/oauth2/v1/userinfo?access_token=' + token
        );

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
