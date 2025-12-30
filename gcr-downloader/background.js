/**
 * GCR Downloader - Background Service Worker
 * Handles message passing, authentication coordination, and download orchestration
 * 
 * This is the central hub that coordinates between:
 * - Content script (floating button)
 * - Popup (selection UI)
 * - APIs (Classroom, Drive)
 * 
 * @version 2.0.0 - Added persistent state management for MV3 service worker lifecycle
 */

// ============================================================================
// ES MODULE IMPORTS (Enabled via manifest type: "module")
// ============================================================================

import {
    initializeWorkerState,
    setupWorkerHeartbeat,
    getDownloadQueue,
    addDownloadJob,
    updateDownloadJob,
    getNextPendingJob,
    getJobCounts,
    clearDownloadQueue,
    resetActiveJobs,
    getDownloadProgress,
    updateDownloadProgress,
    resetDownloadProgress,
    isAbortRequested,
    requestAbort,
    clearAbort,
    setDownloadResults,
    getDownloadResults,
    keepAlive,
    DOWNLOAD_STATES
} from './utils/workerState.js';

import {
    acquire as acquireRateLimit,
    throttle,
    report429,
    clearBackoff,
    getStats as getRateLimitStats,
    initialize as initializeRateLimiter,
    PRIORITY
} from './utils/rateLimiter.js';

import {
    setupProactiveTokenRefresh,
    ensureValidTokenForBatch
} from './utils/auth.js';

// Import security sanitizer (Phase 4)
import {
    sanitizeFilenameSecure,
    sanitizeFolderName as sanitizeFolderNameSecure,
    validateDownloadPath,
    escapeHtml,
    containsXSS
} from './utils/sanitizer.js';

// ============================================================================
// WORKER STATE INITIALIZATION (Critical for MV3 Service Worker Survival)
// ============================================================================

/**
 * Initialize all systems on service worker startup
 * This MUST run at the top level to handle worker resurrection
 */
(async function initializeServiceWorker() {
    console.log('[GCR Background] Service worker starting (v2.0.0)...');

    try {
        // Initialize worker state (persistent queue, heartbeat)
        await initializeWorkerState();

        // Setup worker heartbeat for resurrection (every 1 minute)
        setupWorkerHeartbeat();

        // Initialize rate limiter
        await initializeRateLimiter();

        // Setup proactive token refresh (at 50 minutes)
        setupProactiveTokenRefresh();

        console.log('[GCR Background] All systems initialized successfully');
    } catch (error) {
        console.error('[GCR Background] Initialization error:', error);
    }
})();

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEYS = {
    LAST_COURSE_ID: 'gcr_last_course_id',
    LAST_COURSE_NAME: 'gcr_last_course_name',
    COURSE_DATA_PREFIX: 'gcr_course_data_',
    AUTH_TOKEN: 'gcr_auth_token',
    AUTH_TIMESTAMP: 'gcr_auth_timestamp'
};

const CLASSROOM_API_BASE = 'https://classroom.googleapis.com/v1';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a simple hash code from a string (for creating unique IDs)
 * @param {string} str - String to hash
 * @returns {string} Hash code
 */
function hashCode(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}

/**
 * Extract URLs from text content (for embedded links in announcement body)
 * @param {string} text - Text to search for URLs
 * @returns {Array} Array of link attachments
 */
function extractUrlsFromText(text) {
    if (!text) return [];
    
    const attachments = [];
    // Regex to match URLs (http, https, and common patterns)
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
    const matches = text.match(urlRegex) || [];
    
    // Track seen URLs to avoid duplicates
    const seenUrls = new Set();
    
    for (const url of matches) {
        // Clean trailing punctuation
        let cleanUrl = url.replace(/[.,;:!?)]+$/, '');
        
        if (seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);
        
        // Determine type based on URL
        let type = 'link';
        let title = cleanUrl;
        
        if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
            type = 'youtube';
            title = 'YouTube Video (from text)';
        } else if (cleanUrl.includes('drive.google.com')) {
            type = 'link';
            title = 'Google Drive Link';
        } else if (cleanUrl.includes('colab.research.google.com')) {
            type = 'link';
            title = 'Google Colab';
        } else if (cleanUrl.includes('docs.google.com')) {
            type = 'link';
            title = 'Google Docs Link';
        } else if (cleanUrl.includes('forms.google.com') || cleanUrl.includes('forms.gle')) {
            type = 'form';
            title = 'Google Form';
        }
        
        const linkId = `text-link-${hashCode(cleanUrl)}`;
        attachments.push({
            type,
            id: linkId,
            url: cleanUrl,
            title,
            alternateLink: cleanUrl,
            isLink: true,
            fromText: true // Flag to indicate this was extracted from text
        });
    }
    
    return attachments;
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

/**
 * Main message listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[GCR Background] Message received:', message.type);

    // Handle async responses
    handleMessage(message, sender)
        .then(response => {
            console.log('[GCR Background] Sending response for:', message.type);
            sendResponse(response);
        })
        .catch(error => {
            console.error('[GCR Background] Error handling message:', error);
            sendResponse({
                success: false,
                error: error.message || 'Unknown error occurred'
            });
        });

    // Return true to indicate async response
    return true;
});

/**
 * Handles incoming messages
 * @param {Object} message - Message object
 * @param {Object} sender - Sender info
 * @returns {Promise<Object>} Response
 */
async function handleMessage(message, sender) {
    switch (message.type) {
        case 'GET_AUTH_TOKEN':
            return handleGetAuthToken(message.interactive);

        case 'SIGN_OUT':
            return handleSignOut();

        case 'GET_CACHED_DATA':
            return handleGetCachedData();

        case 'FETCH_COURSE_DATA':
            return handleFetchCourseData(message.courseId, message.courseName);

        case 'GET_LAST_COURSE':
            return handleGetLastCourse();

        case 'SET_LAST_COURSE':
            return handleSetLastCourse(message.courseId, message.courseName);

        case 'GET_ITEM_COUNT':
            return handleGetItemCount();

        case 'DOWNLOAD_FILES':
            return handleDownloadFiles(message.selectedItems);

        case 'GET_DOWNLOAD_PROGRESS':
            return handleGetDownloadProgress();

        case 'CANCEL_DOWNLOADS':
            return handleCancelDownloads();

        case 'CLEAR_CACHE':
            return handleClearCache();

        case 'RESUME_DOWNLOADS':
            return { success: true, message: 'Resume triggered' };

        default:
            console.warn('[GCR Background] Unknown message type:', message.type);
            return { success: false, error: 'Unknown message type' };
    }
}

// ============================================================================
// AUTHENTICATION HANDLERS
// ============================================================================

/**
 * Gets auth token using chrome.identity.getAuthToken
 * This is the standard method for Chrome Extensions
 * @param {boolean} interactive - Show login UI if needed
 * @returns {Promise<Object>} Token response
 */
async function handleGetAuthToken(interactive = true) {
    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2?.client_id;
    const scopes = manifest.oauth2?.scopes || [];

    console.log('[GCR Background] ========== OAuth Debug Info ==========');
    console.log('[GCR Background] Extension ID:', chrome.runtime.id);
    console.log('[GCR Background] OAuth Client ID:', clientId);
    console.log('[GCR Background] Has key in manifest:', !!manifest.key);
    console.log('[GCR Background] Interactive mode:', interactive);
    console.log('[GCR Background] ======================================');

    // First, try the standard getAuthToken method
    return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive }, async (token) => {
            if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message || '';
                console.warn('[GCR Background] getAuthToken failed:', errorMsg);

                // If "Authorization page could not be loaded", try launchWebAuthFlow
                if (errorMsg.includes('Authorization page could not be loaded') && interactive) {
                    console.log('[GCR Background] Trying launchWebAuthFlow fallback...');
                    try {
                        const fallbackResult = await tryLaunchWebAuthFlow(clientId, scopes);
                        resolve(fallbackResult);
                    } catch (e) {
                        console.error('[GCR Background] Fallback also failed:', e);
                        resolve({ success: false, error: errorMsg });
                    }
                    return;
                }

                resolve({ success: false, error: errorMsg });
                return;
            }

            if (!token) {
                resolve({ success: false, error: 'No token received' });
                return;
            }

            console.log('[GCR Background] Token obtained successfully!');
            chrome.storage.local.set({
                [STORAGE_KEYS.AUTH_TOKEN]: token,
                [STORAGE_KEYS.AUTH_TIMESTAMP]: Date.now()
            });
            resolve({ success: true, token });
        });
    });
}

/**
 * Fallback authentication using chrome.windows.create
 * This bypasses Chrome's identity API which has issues with consumer accounts
 * Uses Web Application OAuth client with redirect URI configured
 */
async function tryLaunchWebAuthFlow(clientId, scopes) {
    return new Promise((resolve, reject) => {
        const redirectUrl = chrome.identity.getRedirectURL();
        const scopeString = scopes.join(' ');

        // Use Web Application client ID for fallback flow
        const webClientId = '70759750296-vsjo76s29ua1evabsvgop1lrebhctpgo.apps.googleusercontent.com';

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${encodeURIComponent(webClientId)}&` +
            `response_type=token&` +
            `redirect_uri=${encodeURIComponent(redirectUrl)}&` +
            `scope=${encodeURIComponent(scopeString)}&` +
            `prompt=consent`;

        console.log('[GCR Background] Opening auth window with URL:', authUrl);
        console.log('[GCR Background] Expected redirect:', redirectUrl);

        // Create a popup window for OAuth
        chrome.windows.create({
            url: authUrl,
            type: 'popup',
            width: 500,
            height: 600
        }, (authWindow) => {
            if (chrome.runtime.lastError) {
                console.error('[GCR Background] Window create error:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }

            const windowId = authWindow.id;
            console.log('[GCR Background] Auth window created:', windowId);

            // Listen for URL changes in the popup
            const handleUpdated = (tabId, changeInfo, tab) => {
                if (tab.windowId !== windowId || !changeInfo.url) return;

                console.log('[GCR Background] Tab URL changed:', changeInfo.url);

                // Check if redirected to our redirect URL
                if (changeInfo.url.startsWith(redirectUrl)) {
                    // Extract token from URL
                    try {
                        const url = new URL(changeInfo.url);
                        const hashParams = new URLSearchParams(url.hash.substring(1));
                        const token = hashParams.get('access_token');
                        const error = hashParams.get('error');

                        // Clean up listeners and close window
                        chrome.tabs.onUpdated.removeListener(handleUpdated);
                        chrome.windows.onRemoved.removeListener(handleRemoved);
                        chrome.windows.remove(windowId);

                        if (token) {
                            console.log('[GCR Background] Token obtained via popup window!');
                            chrome.storage.local.set({
                                [STORAGE_KEYS.AUTH_TOKEN]: token,
                                [STORAGE_KEYS.AUTH_TIMESTAMP]: Date.now()
                            });
                            resolve({ success: true, token });
                        } else if (error) {
                            reject(new Error(`OAuth error: ${error}`));
                        } else {
                            reject(new Error('No token in response'));
                        }
                    } catch (e) {
                        reject(e);
                    }
                }
            };

            // Listen for window close (user cancelled)
            const handleRemoved = (closedWindowId) => {
                if (closedWindowId === windowId) {
                    chrome.tabs.onUpdated.removeListener(handleUpdated);
                    chrome.windows.onRemoved.removeListener(handleRemoved);
                    reject(new Error('User closed auth window'));
                }
            };

            chrome.tabs.onUpdated.addListener(handleUpdated);
            chrome.windows.onRemoved.addListener(handleRemoved);
        });
    });
}

/**
 * Signs out the user
 * BEHAVIOR: Revokes token, clears auth state, but KEEPS cached course data
 * User can still view cache (read-only) but downloads require re-auth
 * @returns {Promise<Object>} Result
 */
async function handleSignOut() {
    return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, async (token) => {
            if (token) {
                // Remove cached token from Chrome
                chrome.identity.removeCachedAuthToken({ token }, async () => {
                    // Revoke on Google's servers
                    try {
                        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
                    } catch (e) {
                        console.warn('[GCR Background] Revoke failed:', e);
                    }

                    // Clear auth data only, KEEP course cache for viewing
                    // This allows offline viewing of cached data
                    chrome.storage.local.remove([
                        STORAGE_KEYS.AUTH_TOKEN,
                        STORAGE_KEYS.AUTH_TIMESTAMP
                    ]);

                    console.log('[GCR Background] Sign out complete - kept cached data');
                    resolve({ success: true, message: 'Signed out. Cached data retained for viewing.' });
                });
            } else {
                resolve({ success: true });
            }
        });
    });
}

// ============================================================================
// CACHE HANDLERS
// ============================================================================

/**
 * Gets cached course data
 * @returns {Promise<Object>} Cached data or null
 */
async function handleGetCachedData() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            STORAGE_KEYS.LAST_COURSE_ID,
            STORAGE_KEYS.LAST_COURSE_NAME
        ], (result) => {
            const courseId = result[STORAGE_KEYS.LAST_COURSE_ID];
            const courseName = result[STORAGE_KEYS.LAST_COURSE_NAME];

            if (!courseId) {
                resolve({ success: true, data: null });
                return;
            }

            // Get course data
            const dataKey = STORAGE_KEYS.COURSE_DATA_PREFIX + courseId;
            chrome.storage.local.get(dataKey, (dataResult) => {
                const courseData = dataResult[dataKey];

                if (courseData) {
                    // IMPORTANT: Use courseName from courseData (always correct for this courseId)
                    // rather than LAST_COURSE_NAME which may be stale from a different course
                    resolve({
                        success: true,
                        data: {
                            ...courseData,
                            courseId,
                            courseName: courseData.courseName || courseName
                        }
                    });
                } else {
                    resolve({
                        success: true,
                        data: null,
                        courseId,
                        courseName
                    });
                }
            });
        });
    });
}

/**
 * Gets last visited course info
 * @returns {Promise<Object>} Course info
 */
async function handleGetLastCourse() {
    return new Promise((resolve) => {
        chrome.storage.local.get([
            STORAGE_KEYS.LAST_COURSE_ID,
            STORAGE_KEYS.LAST_COURSE_NAME
        ], (result) => {
            resolve({
                success: true,
                courseId: result[STORAGE_KEYS.LAST_COURSE_ID] || null,
                courseName: result[STORAGE_KEYS.LAST_COURSE_NAME] || null
            });
        });
    });
}

/**
 * Sets last visited course
 * @param {string} courseId - Course ID
 * @param {string} courseName - Course name
 * @returns {Promise<Object>} Result
 */
async function handleSetLastCourse(courseId, courseName) {
    return new Promise((resolve) => {
        // Get previous course ID
        chrome.storage.local.get(STORAGE_KEYS.LAST_COURSE_ID, (result) => {
            const previousCourseId = result[STORAGE_KEYS.LAST_COURSE_ID];

            // If different course, clear old data
            if (previousCourseId && previousCourseId !== courseId) {
                const oldDataKey = STORAGE_KEYS.COURSE_DATA_PREFIX + previousCourseId;
                chrome.storage.local.remove(oldDataKey);
                console.log('[GCR Background] Cleared old course data:', previousCourseId);
            }

            // Set new course
            chrome.storage.local.set({
                [STORAGE_KEYS.LAST_COURSE_ID]: courseId,
                [STORAGE_KEYS.LAST_COURSE_NAME]: courseName
            }, () => {
                resolve({ success: true });
            });
        });
    });
}

/**
 * Clears all cached course data
 * @returns {Promise<Object>} Result
 */
async function handleClearCache() {
    return new Promise((resolve) => {
        chrome.storage.local.get(null, (allData) => {
            const keysToRemove = Object.keys(allData).filter(key =>
                key.startsWith(STORAGE_KEYS.COURSE_DATA_PREFIX) ||
                key === STORAGE_KEYS.LAST_COURSE_ID ||
                key === STORAGE_KEYS.LAST_COURSE_NAME
            );

            if (keysToRemove.length === 0) {
                resolve({ success: true, message: 'No cache to clear' });
                return;
            }

            chrome.storage.local.remove(keysToRemove, () => {
                console.log('[GCR Background] Cache cleared:', keysToRemove);
                resolve({ success: true, message: `Cleared ${keysToRemove.length} items` });
            });
        });
    });
}

/**
 * Gets total item count from cached data
 * @returns {Promise<Object>} Count
 */
async function handleGetItemCount() {
    const cached = await handleGetCachedData();

    if (!cached.success || !cached.data) {
        return { success: true, count: 0 };
    }

    let count = 0;
    const data = cached.data;

    // Count all attachments (excluding links which go into resources file)
    const countAttachments = (items) => {
        for (const item of items || []) {
            for (const attachment of item.attachments || []) {
                if (!attachment.isLink) {
                    count++;
                }
            }
        }
    };

    countAttachments(data.assignments);
    countAttachments(data.materials);
    countAttachments(data.announcements);

    // Add 1 for resources file if there are links
    if (data.links && data.links.length > 0) {
        count++;
    }

    return { success: true, count };
}

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * Fetches course data from API
 * @param {string} courseId - Course ID
 * @param {string} courseName - Course name (optional, will be fetched if not provided)
 * @returns {Promise<Object>} Course data
 */
async function handleFetchCourseData(courseId, courseName) {
    console.log('[GCR Background] Fetching course data:', courseId);

    try {
        // Get auth token
        const authResult = await handleGetAuthToken(true);
        if (!authResult.success) {
            return { success: false, error: authResult.error };
        }
        const token = authResult.token;

        // DEBUG: First, list ALL courses to see what we have access to
        console.log('[GCR Background] DEBUG: Listing all courses...');
        try {
            const allCourses = await apiRequest(`${CLASSROOM_API_BASE}/courses?studentId=me&courseStates=ACTIVE`, token);
            console.log('[GCR Background] DEBUG: All courses response:', allCourses);
            if (allCourses.courses) {
                console.log('[GCR Background] DEBUG: Found', allCourses.courses.length, 'courses');
                allCourses.courses.forEach(c => {
                    console.log('[GCR Background] DEBUG: Course:', c.id, '-', c.name);
                });

                // Check if our target course is in the list
                const foundCourse = allCourses.courses.find(c => c.id === courseId);
                if (foundCourse) {
                    console.log('[GCR Background] DEBUG: Target course FOUND in list!', foundCourse.name);
                    courseName = foundCourse.name;
                } else {
                    console.log('[GCR Background] DEBUG: Target course NOT in list. courseId:', courseId);
                    console.log('[GCR Background] DEBUG: Available course IDs:', allCourses.courses.map(c => c.id));
                }
            } else {
                console.log('[GCR Background] DEBUG: No courses returned');
            }
        } catch (listError) {
            console.error('[GCR Background] DEBUG: Failed to list courses:', listError);
        }

        // Fetch course info if name not provided
        if (!courseName) {
            const courseInfo = await apiRequest(`${CLASSROOM_API_BASE}/courses/${courseId}`, token);
            courseName = courseInfo.name || 'Unknown Course';
        }

        // Fetch all data in parallel
        const [coursework, materials, announcements] = await Promise.all([
            fetchCoursework(courseId, token).catch(e => {
                console.warn('[GCR Background] Coursework error:', e);
                return [];
            }),
            fetchMaterials(courseId, token).catch(e => {
                console.warn('[GCR Background] Materials error:', e);
                return [];
            }),
            fetchAnnouncements(courseId, token).catch(e => {
                console.warn('[GCR Background] Announcements error:', e);
                return [];
            })
        ]);

        // Collect links
        const links = [];
        const collectLinks = (items) => {
            for (const item of items) {
                for (const attachment of item.attachments || []) {
                    if (attachment.isLink) {
                        links.push({
                            ...attachment,
                            parentTitle: item.title,
                            parentType: item.type
                        });
                    }
                }
            }
        };
        collectLinks(coursework);
        collectLinks(materials);
        collectLinks(announcements);

        // Count total items WITH DEDUPLICATION
        // Same file appearing in multiple categories is counted only once
        const seenFileIds = new Set();
        const seenLinkIds = new Set();
        let totalFiles = 0;
        let uniqueLinks = 0;
        
        const countItems = (items) => {
            for (const item of items) {
                for (const att of item.attachments || []) {
                    if (att.isLink) {
                        if (att.id && !seenLinkIds.has(att.id)) {
                            seenLinkIds.add(att.id);
                            uniqueLinks++;
                        }
                    } else {
                        if (att.id && !seenFileIds.has(att.id)) {
                            seenFileIds.add(att.id);
                            totalFiles++;
                        }
                    }
                }
            }
        };
        countItems(coursework);
        countItems(materials);
        countItems(announcements);
        
        // Total = files + links (count each link individually to match popup)
        const totalItems = totalFiles + uniqueLinks;

        const courseData = {
            courseId,
            courseName,
            timestamp: Date.now(),
            assignments: coursework,
            materials,
            announcements,
            links,
            totalItems
        };

        // Cache the data
        const dataKey = STORAGE_KEYS.COURSE_DATA_PREFIX + courseId;

        // First, clear any OLD course data to prevent stale data issues
        await new Promise(resolve => {
            chrome.storage.local.get(STORAGE_KEYS.LAST_COURSE_ID, (result) => {
                const previousCourseId = result[STORAGE_KEYS.LAST_COURSE_ID];
                if (previousCourseId && previousCourseId !== courseId) {
                    const oldDataKey = STORAGE_KEYS.COURSE_DATA_PREFIX + previousCourseId;
                    chrome.storage.local.remove(oldDataKey, () => {
                        console.log('[GCR Background] Cleared old course data:', previousCourseId);
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        });

        // Now cache the new course data
        await new Promise(resolve => {
            chrome.storage.local.set({
                [dataKey]: courseData,
                [STORAGE_KEYS.LAST_COURSE_ID]: courseId,
                [STORAGE_KEYS.LAST_COURSE_NAME]: courseName
            }, resolve);
        });

        console.log('[GCR Background] Course data cached:', totalItems, 'items');

        return { success: true, data: courseData };

    } catch (error) {
        console.error('[GCR Background] Fetch error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Makes an API request with rate limiting
 * @param {string} url - URL to request
 * @param {string} token - Auth token
 * @param {number} priority - Request priority (default: NORMAL)
 * @returns {Promise<Object>} Response data
 */
async function apiRequest(url, token, priority = PRIORITY.NORMAL) {
    // Acquire rate limit token before making request
    await acquireRateLimit(priority);

    console.log('[GCR Background] API Request:', url);

    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
        // Handle rate limiting (429)
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            report429(retryAfter ? parseInt(retryAfter) : null);

            const error = new Error('Rate limited - too many requests');
            error.status = 429;
            error.retryable = true;
            throw error;
        }

        // Try to get more error details
        let errorBody = '';
        try {
            const errorJson = await response.json();
            errorBody = JSON.stringify(errorJson);
            console.error('[GCR Background] API Error Body:', errorJson);
        } catch (e) {
            errorBody = await response.text().catch(() => '');
        }

        console.error('[GCR Background] API Error:', response.status, 'URL:', url, 'Body:', errorBody);

        const error = new Error(`API error: ${response.status}`);
        error.status = response.status;
        error.body = errorBody;
        throw error;
    }

    // Clear any backoff on successful request
    clearBackoff();

    return response.json();
}

/**
 * Fetches coursework for a course
 * @param {string} courseId - Course ID
 * @param {string} token - Auth token
 * @returns {Promise<Array>} Coursework items
 */
async function fetchCoursework(courseId, token) {
    const items = [];
    let pageToken = null;

    do {
        const url = new URL(`${CLASSROOM_API_BASE}/courses/${courseId}/courseWork`);
        url.searchParams.set('pageSize', '50');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        try {
            const data = await apiRequest(url.toString(), token);

            if (data.courseWork) {
                for (const work of data.courseWork) {
                    items.push({
                        id: work.id,
                        title: work.title || 'Untitled Assignment',
                        type: 'courseWork',
                        attachments: processMaterials(work.materials)
                    });
                }
            }

            pageToken = data.nextPageToken;
        } catch (e) {
            if (e.status === 404) break;
            throw e;
        }
    } while (pageToken);

    return items;
}

/**
 * Fetches course materials
 * @param {string} courseId - Course ID
 * @param {string} token - Auth token
 * @returns {Promise<Array>} Material items
 */
async function fetchMaterials(courseId, token) {
    const items = [];
    let pageToken = null;

    do {
        const url = new URL(`${CLASSROOM_API_BASE}/courses/${courseId}/courseWorkMaterials`);
        url.searchParams.set('pageSize', '50');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        try {
            const data = await apiRequest(url.toString(), token);

            if (data.courseWorkMaterial) {
                for (const material of data.courseWorkMaterial) {
                    items.push({
                        id: material.id,
                        title: material.title || 'Untitled Material',
                        type: 'courseWorkMaterial',
                        attachments: processMaterials(material.materials)
                    });
                }
            }

            pageToken = data.nextPageToken;
        } catch (e) {
            if (e.status === 404) break;
            throw e;
        }
    } while (pageToken);

    return items;
}

/**
 * Fetches announcements
 * @param {string} courseId - Course ID
 * @param {string} token - Auth token
 * @returns {Promise<Array>} Announcement items
 */
async function fetchAnnouncements(courseId, token) {
    const items = [];
    let pageToken = null;

    do {
        const url = new URL(`${CLASSROOM_API_BASE}/courses/${courseId}/announcements`);
        url.searchParams.set('pageSize', '50');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        try {
            const data = await apiRequest(url.toString(), token);

            if (data.announcements) {
                for (const announcement of data.announcements) {
                    // Process official attachments
                    const attachments = processMaterials(announcement.materials);
                    
                    // Also extract URLs from announcement text body
                    if (announcement.text) {
                        const textLinks = extractUrlsFromText(announcement.text);
                        attachments.push(...textLinks);
                    }
                    
                    items.push({
                        id: announcement.id,
                        title: announcement.text?.substring(0, 50) || 'Announcement',
                        type: 'announcement',
                        attachments
                    });
                }
            }

            pageToken = data.nextPageToken;
        } catch (e) {
            if (e.status === 404) break;
            throw e;
        }
    } while (pageToken);

    return items;
}

/**
 * Processes material attachments
 * @param {Array} materials - Materials array from API
 * @returns {Array} Processed attachments
 */
function processMaterials(materials) {
    if (!materials) return [];

    const attachments = [];

    for (const material of materials) {
        if (material.driveFile) {
            const file = material.driveFile.driveFile || material.driveFile;
            attachments.push({
                type: 'driveFile',
                id: file.id,
                title: file.title || 'Untitled File',
                mimeType: file.mimeType,
                alternateLink: file.alternateLink,
                isGoogleFile: file.mimeType?.startsWith('application/vnd.google-apps.'),
                isLink: false
            });
        } else if (material.youtubeVideo) {
            attachments.push({
                type: 'youtube',
                // Use videoId as unique identifier for YouTube links
                id: `yt-${material.youtubeVideo.id}`,
                videoId: material.youtubeVideo.id,
                title: material.youtubeVideo.title || 'YouTube Video',
                url: material.youtubeVideo.alternateLink,
                alternateLink: material.youtubeVideo.alternateLink,
                isLink: true
            });
        } else if (material.link) {
            // Generate unique ID from URL hash for links
            const linkId = `link-${hashCode(material.link.url)}`;
            attachments.push({
                type: 'link',
                id: linkId,
                url: material.link.url,
                title: material.link.title || material.link.url,
                isLink: true
            });
        } else if (material.form) {
            // Generate unique ID from form URL hash
            const formId = `form-${hashCode(material.form.formUrl)}`;
            attachments.push({
                type: 'form',
                id: formId,
                title: material.form.title || 'Google Form',
                url: material.form.formUrl,
                formUrl: material.form.formUrl,
                isLink: true
            });
        }
    }

    return attachments;
}

// ============================================================================
// DOWNLOAD HANDLERS
// ============================================================================

// Download state
let downloadState = {
    active: false,
    total: 0,
    completed: 0,
    failed: 0,
    currentFile: '',
    results: { success: [], failed: [] }
};

/**
 * Download lock to prevent duplicate downloads from multiple clicks
 */
let isDownloadInProgress = false;

/**
 * Handles file downloads
 * @param {Array} selectedItems - Selected item IDs (or null for all)
 * @returns {Promise<Object>} Download results
 */
async function handleDownloadFiles(selectedItems) {
    // Check if download is already in progress
    if (isDownloadInProgress) {
        console.log('[GCR Background] Download already in progress, ignoring duplicate request');
        return { success: false, error: 'Download already in progress' };
    }

    isDownloadInProgress = true;
    console.log('[GCR Background] Starting downloads');

    try {
        // Get cached data
        const cached = await handleGetCachedData();
        if (!cached.success || !cached.data) {
            return { success: false, error: 'No course data cached' };
        }

        const courseData = cached.data;

        // DEBUG: Log which course we're using
        console.log('[GCR Background] Download from course:', {
            courseId: courseData.courseId,
            courseName: courseData.courseName,
            selectedItems: selectedItems?.length || 'all'
        });

        // Reset state
        downloadState = {
            active: true,
            total: 0,
            completed: 0,
            failed: 0,
            currentFile: '',
            results: { success: [], failed: [] }
        };

        // Get auth token
        const authResult = await handleGetAuthToken(true);
        if (!authResult.success) {
            return { success: false, error: 'Authentication required' };
        }
        const token = authResult.token;

        // Collect files to download WITH DEDUPLICATION
        // Files are uniquely identified by Drive file ID
        // Same file appearing in multiple categories is downloaded only once
        const filesToDownload = [];
        const links = [];
        const seenFileIds = new Set(); // Track seen file IDs for deduplication
        const seenLinkIds = new Set(); // Track seen link IDs for deduplication

        console.log('[GCR Background] Selected items to download:', selectedItems);

        const collectFiles = (items, categoryName) => {
            console.log(`[GCR Background] Checking ${items?.length || 0} ${categoryName}...`);
            for (const item of items || []) {
                for (const attachment of item.attachments || []) {
                    console.log(`[GCR Background] Attachment: id="${attachment.id}", title="${attachment.title}", isLink=${attachment.isLink}`);

                    if (selectedItems && !selectedItems.includes(attachment.id)) {
                        console.log(`[GCR Background] Skipping - not in selectedItems`);
                        continue;
                    }

                    if (attachment.isLink) {
                        // DEDUPLICATION: Skip if we've already seen this link ID
                        if (attachment.id && seenLinkIds.has(attachment.id)) {
                            console.log('[GCR Background] Skipping duplicate link:', attachment.title);
                            continue;
                        }
                        seenLinkIds.add(attachment.id);
                        links.push({ ...attachment, parentTitle: item.title });
                    } else {
                        // DEDUPLICATION: Skip if we've already seen this file ID
                        if (attachment.id && seenFileIds.has(attachment.id)) {
                            console.log('[GCR Background] Skipping duplicate file:', attachment.title);
                            continue;
                        }
                        seenFileIds.add(attachment.id);
                        const fileToAdd = { ...attachment, parentTitle: item.title };
                        console.log(`[GCR Background] Added file: ${attachment.title}, mimeType: ${attachment.mimeType}, isGoogleFile: ${attachment.isGoogleFile}`);
                        filesToDownload.push(fileToAdd);
                    }
                }
            }
        };

        collectFiles(courseData.assignments, 'assignments');
        collectFiles(courseData.materials, 'materials');
        collectFiles(courseData.announcements, 'announcements');

        // Check for offline before starting
        if (!isOnline()) {
            downloadState.active = false;
            return {
                success: false,
                error: 'No internet connection. Downloads require network access.',
                offline: true
            };
        }

        downloadState.total = filesToDownload.length + (links.length > 0 ? 1 : 0);

        // Check if any files matched
        if (filesToDownload.length === 0 && links.length === 0) {
            console.error('[GCR Background] No files matched! Selected IDs:', selectedItems);
            downloadState.active = false;
            return {
                success: false,
                error: `No files matched the selected IDs. Selected: ${selectedItems?.length || 0}, Available attachments checked but none matched.`,
                debugInfo: { selectedItems, attachmentsChecked: true }
            };
        }

        // Download files
        const courseFolderName = sanitizeFolderNameSecure(courseData.courseName || 'Downloads');
        const usedNames = new Set();

        console.log('[GCR Background] ===== DOWNLOAD DEBUG =====');
        console.log('[GCR Background] courseData.courseName:', courseData.courseName);
        console.log('[GCR Background] courseFolderName after sanitize:', courseFolderName);
        console.log('[GCR Background] Files to download:', filesToDownload.length);
        console.log('[GCR Background] Links found:', links.length);
        console.log('[GCR Background] Course folder:', courseFolderName);

        // START DOWNLOADS IN BACKGROUND - Don't await, return immediately
        // This allows the progress monitor to track real-time progress
        executeDownloads(filesToDownload, links, token, courseFolderName, usedNames, courseData.courseName);

        // Return immediately with total count so UI can start monitoring
        return {
            success: true,
            total: downloadState.total,
            started: true,
            message: 'Downloads started'
        };

    } catch (error) {
        console.error('[GCR Background] Download setup error:', error);
        downloadState.active = false;
        isDownloadInProgress = false;
        return { success: false, error: error.message };
    }
}

/**
 * Executes downloads in background (called without await)
 */
async function executeDownloads(filesToDownload, links, token, courseFolderName, usedNames, courseName) {
    try {
        for (const file of filesToDownload) {
            if (!downloadState.active) break;

            // Update current file being downloaded
            downloadState.currentFile = file.title;
            console.log('[GCR Background] Downloading file:', file.title, 'ID:', file.id, 'MIME:', file.mimeType);

            try {
                await downloadFile(file, token, courseFolderName, usedNames);
                downloadState.completed++;
                downloadState.results.success.push(file.title);
                console.log('[GCR Background] Download SUCCESS:', file.title);
            } catch (error) {
                downloadState.failed++;
                downloadState.results.failed.push({ title: file.title, error: error.message });
                console.error('[GCR Background] Download FAILED:', file.title, 'Error:', error.message);
            }
        }

        // Create resources file
        if (links.length > 0 && downloadState.active) {
            try {
                downloadState.currentFile = '_Links_and_Resources.txt';
                await createResourcesFile(links, courseName, courseFolderName);
                downloadState.completed++;
                downloadState.results.success.push('_Links_and_Resources.txt');
            } catch (error) {
                downloadState.failed++;
                downloadState.results.failed.push({ title: 'Resources', error: error.message });
            }
        }

        downloadState.active = false;
        downloadState.currentFile = '';
        console.log('[GCR Background] All downloads finished:', downloadState.completed, '/', downloadState.total);
    } finally {
        isDownloadInProgress = false;
    }
}

/**
 * Downloads a single file
 * @param {Object} file - File object
 * @param {string} token - Auth token
 * @param {string} folderName - Folder name
 * @param {Set} usedNames - Set of used filenames
 */
async function downloadFile(file, token, folderName, usedNames) {
    const { id, title, mimeType } = file;
    
    console.log('[GCR Background] downloadFile called:', { id, title, mimeType, isGoogleFile: file.isGoogleFile });

    let url;
    let extension = '';

    // Check if Google Workspace file needing export
    if (mimeType?.startsWith('application/vnd.google-apps.')) {
        const exportFormats = {
            'application/vnd.google-apps.document': { mime: 'application/pdf', ext: '.pdf' },
            'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
            'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' },
            'application/vnd.google-apps.drawing': { mime: 'image/png', ext: '.png' }
        };

        const format = exportFormats[mimeType];
        if (!format) {
            throw new Error('Cannot export this file type');
        }

        url = `${DRIVE_API_BASE}/files/${id}/export?mimeType=${encodeURIComponent(format.mime)}`;
        extension = format.ext;
    } else {
        // For regular files, use alt=media to get direct download
        url = `${DRIVE_API_BASE}/files/${id}?alt=media`;
    }

    // Build filename
    let filename = sanitizeFilenameSecure(title);
    if (extension && !filename.toLowerCase().endsWith(extension)) {
        const lastDot = filename.lastIndexOf('.');
        if (lastDot > 0) filename = filename.substring(0, lastDot);
        filename += extension;
    }

    // Make unique
    let counter = 0;
    let uniqueName = filename;
    while (usedNames.has(uniqueName)) {
        counter++;
        const dot = filename.lastIndexOf('.');
        if (dot > 0) {
            uniqueName = `${filename.substring(0, dot)}(${counter})${filename.substring(dot)}`;
        } else {
            uniqueName = `${filename}(${counter})`;
        }
    }
    usedNames.add(uniqueName);

    console.log('[GCR Background] Download URL:', url);
    console.log('[GCR Background] Saving as:', `${folderName}/${uniqueName}`);

    // Use chrome.downloads.download with authorization header
    // Since service workers can't use URL.createObjectURL, we fetch and convert to data URL
    console.log('[GCR Background] Fetching file from:', url);
    
    const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details');
        console.error('[GCR Background] Download HTTP error:', response.status, errorText);
        console.error('[GCR Background] Failed file details:', { id, title, mimeType, url });
        throw new Error(`Download failed: ${response.status} - ${response.statusText}. ${errorText.substring(0, 200)}`);
    }

    // Convert response to base64 data URL (works in service workers)
    const blob = await response.blob();
    const reader = new FileReader();

    const dataUrl = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    // Download using data URL
    const downloadPath = `${folderName}/${uniqueName}`;
    console.log('[GCR Background] EXACT download path:', downloadPath);

    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url: dataUrl,
            filename: downloadPath,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (downloadId === undefined) {
                reject(new Error('Download failed to start'));
            } else {
                console.log('[GCR Background] Download started, ID:', downloadId);
                resolve(downloadId);
            }
        });
    });
}

/**
 * Creates resources file
 * @param {Array} links - Links array
 * @param {string} courseName - Course name
 * @param {string} folderName - Folder name
 */
async function createResourcesFile(links, courseName, folderName) {
    let content = `# Resources and Links\n`;
    content += `# Course: ${courseName}\n`;
    content += `# Generated: ${new Date().toLocaleString()}\n\n`;

    for (const link of links) {
        content += `[${link.type}] ${link.title}\n`;
        content += `  URL: ${link.alternateLink || link.url || link.formUrl}\n`;
        if (link.parentTitle) content += `  From: ${link.parentTitle}\n`;
        content += `\n`;
    }

    // Convert to data URL (URL.createObjectURL not available in MV3 service workers)
    const blob = new Blob([content], { type: 'text/plain' });
    const reader = new FileReader();

    const dataUrl = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    return new Promise((resolve, reject) => {
        chrome.downloads.download({
            url: dataUrl,
            filename: `${folderName}/_Links_and_Resources.txt`,
            saveAs: false
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(downloadId);
            }
        });
    });
}

/**
 * Gets download progress
 * @returns {Object} Progress info
 */
function handleGetDownloadProgress() {
    return {
        success: true,
        active: downloadState.active,
        total: downloadState.total,
        completed: downloadState.completed,
        failed: downloadState.failed,
        currentFile: downloadState.currentFile || '',
        percent: downloadState.total > 0
            ? Math.round((downloadState.completed / downloadState.total) * 100)
            : 0
    };
}

/**
 * Cancels downloads
 * @returns {Object} Result
 */
function handleCancelDownloads() {
    downloadState.active = false;
    return { success: true };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// NOTE: sanitizeFilename and sanitizeFolderName have been moved to utils/sanitizer.js
// with enhanced security (path traversal blocking, XSS prevention, Windows reserved names)

// ============================================================================
// MULTI-TAB SYNCHRONIZATION
// ============================================================================

/**
 * Listen for storage changes to sync across tabs
 * When course data changes in one tab, other tabs get notified
 */
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    // If last course changed, notify all tabs
    if (changes[STORAGE_KEYS.LAST_COURSE_ID] || changes[STORAGE_KEYS.LAST_COURSE_NAME]) {
        const newCourseId = changes[STORAGE_KEYS.LAST_COURSE_ID]?.newValue;
        const newCourseName = changes[STORAGE_KEYS.LAST_COURSE_NAME]?.newValue;

        console.log('[GCR Background] Course changed in storage, syncing tabs:', newCourseId);

        // Notify all classroom tabs
        chrome.tabs.query({ url: '*://classroom.google.com/*' }, (tabs) => {
            for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'COURSE_DATA_UPDATED',
                    courseId: newCourseId,
                    courseName: newCourseName
                }).catch(() => { });
            }
        });
    }
});

// ============================================================================
// OFFLINE DETECTION
// ============================================================================

/**
 * Checks if the browser is online
 * @returns {boolean} True if online
 */
function isOnline() {
    return navigator.onLine !== false;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('[GCR Background] Service worker started');

// Handle installation
chrome.runtime.onInstalled.addListener((details) => {
    console.log('[GCR Background] Extension installed:', details.reason);

    if (details.reason === 'install') {
        // First install - could show welcome page
        console.log('[GCR Background] First install complete');
    }
});

// Keep service worker alive for downloads
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state?.current === 'complete' || delta.state?.current === 'interrupted') {
        console.log('[GCR Background] Download state changed:', delta);
    }
});
