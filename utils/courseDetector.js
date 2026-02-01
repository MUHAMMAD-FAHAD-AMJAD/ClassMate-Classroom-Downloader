/**
 * GCR Downloader - Course Detection Module
 * Detects course changes from URL and triggers data refresh
 * 
 * Detection Strategy:
 * 1. URL parsing for course ID extraction
 * 2. MutationObserver for SPA navigation (Google Classroom is SPA)
 * 3. webNavigation API for full page loads
 * 4. Debouncing to prevent rapid-fire fetches
 * 
 * CRITICAL: Cancels in-flight requests when course changes quickly
 */

import { extractCourseId, isCoursePage, isMainPage, debounce } from './helpers.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Debounce delay for course detection (ms)
 * Prevents excessive fetches during rapid navigation
 */
const DETECTION_DEBOUNCE_MS = 500;

/**
 * Polling interval for URL changes (fallback)
 */
const POLLING_INTERVAL_MS = 1000;

// ============================================================================
// STATE
// ============================================================================

/**
 * Current abort controller for canceling in-flight requests
 */
let currentAbortController = null;

/**
 * Last detected course ID
 */
let lastDetectedCourseId = null;

/**
 * Callback function when course changes
 */
let onCourseChangeCallback = null;

/**
 * Last URL checked (for polling comparison)
 */
let lastCheckedUrl = null;

/**
 * Polling interval ID
 */
let pollingIntervalId = null;

/**
 * MutationObserver instance
 */
let observer = null;

// ============================================================================
// CORE DETECTION FUNCTIONS
// ============================================================================

/**
 * Gets the current course ID from the URL
 * @returns {string|null} Course ID or null if not on a course page
 */
export function getCurrentCourseId() {
    return extractCourseId(window.location.href);
}

/**
 * Checks if currently on a course page
 * @returns {boolean} True if on a course page
 */
export function isOnCoursePage() {
    return isCoursePage(window.location.href);
}

/**
 * Checks if currently on the main/dashboard page
 * @returns {boolean} True if on main page
 */
export function isOnMainPage() {
    return isMainPage(window.location.href);
}

/**
 * Gets the current page type
 * @returns {'course'|'main'|'other'} Page type
 */
export function getPageType() {
    if (isOnCoursePage()) return 'course';
    if (isOnMainPage()) return 'main';
    return 'other';
}

// ============================================================================
// ABORT CONTROLLER MANAGEMENT
// ============================================================================

/**
 * Creates a new abort controller, canceling any previous one
 * Use this when starting a new fetch operation
 * @returns {AbortController} New abort controller
 */
export function createAbortController() {
    // Cancel any in-flight request
    if (currentAbortController) {
        console.log('[GCR Detector] Aborting previous request');
        currentAbortController.abort();
    }

    currentAbortController = new AbortController();
    return currentAbortController;
}

/**
 * Gets the current abort signal
 * @returns {AbortSignal|null} Current signal or null
 */
export function getAbortSignal() {
    return currentAbortController?.signal || null;
}

/**
 * Clears the current abort controller after successful completion
 */
export function clearAbortController() {
    currentAbortController = null;
}

/**
 * Checks if the current operation was aborted
 * @returns {boolean} True if aborted
 */
export function isAborted() {
    return currentAbortController?.signal?.aborted || false;
}

// ============================================================================
// COURSE CHANGE HANDLING
// ============================================================================

/**
 * Debounced course change handler
 * Waits for navigation to settle before triggering fetch
 */
const debouncedCourseChange = debounce((courseId, url) => {
    console.log('[GCR Detector] Debounced course change detected:', courseId);

    if (onCourseChangeCallback) {
        onCourseChangeCallback({
            courseId,
            url,
            pageType: getPageType(),
            timestamp: Date.now()
        });
    }
}, DETECTION_DEBOUNCE_MS);

/**
 * Handles URL change detection
 * Called by observer, popstate, or polling
 * @param {string} newUrl - New URL
 */
function handleUrlChange(newUrl) {
    // Skip if URL hasn't actually changed
    if (newUrl === lastCheckedUrl) return;
    lastCheckedUrl = newUrl;

    const newCourseId = extractCourseId(newUrl);

    console.log('[GCR Detector] URL changed:', {
        newUrl: newUrl.substring(0, 80) + '...',
        newCourseId,
        lastCourseId: lastDetectedCourseId,
        pageType: isCoursePage(newUrl) ? 'course' : isMainPage(newUrl) ? 'main' : 'other'
    });

    // Case 1: Navigated to a course page
    if (newCourseId) {
        // If different course, trigger change
        if (newCourseId !== lastDetectedCourseId) {
            console.log('[GCR Detector] Course changed from', lastDetectedCourseId, 'to', newCourseId);

            // Cancel any in-flight request from previous course
            if (currentAbortController) {
                currentAbortController.abort();
                currentAbortController = null;
            }

            lastDetectedCourseId = newCourseId;
            debouncedCourseChange(newCourseId, newUrl);
        } else {
            console.log('[GCR Detector] Same course, no action needed');
        }
    }
    // Case 2: Navigated to main page
    else if (isMainPage(newUrl)) {
        console.log('[GCR Detector] On main page, retaining last course:', lastDetectedCourseId);
        // Don't change lastDetectedCourseId - keep it for retention
        // But notify that we're on main page
        if (onCourseChangeCallback) {
            onCourseChangeCallback({
                courseId: null,
                lastCourseId: lastDetectedCourseId,
                url: newUrl,
                pageType: 'main',
                timestamp: Date.now()
            });
        }
    }
    // Case 3: Other page (settings, calendar, etc.)
    else {
        console.log('[GCR Detector] On other page');
        if (onCourseChangeCallback) {
            onCourseChangeCallback({
                courseId: null,
                lastCourseId: lastDetectedCourseId,
                url: newUrl,
                pageType: 'other',
                timestamp: Date.now()
            });
        }
    }
}

// ============================================================================
// MUTATION OBSERVER SETUP
// ============================================================================

/**
 * Sets up MutationObserver to detect SPA navigation
 * Google Classroom is a SPA, so URL changes without full page reload
 */
function setupMutationObserver() {
    if (observer) {
        observer.disconnect();
    }

    // Watch for URL changes by observing History API modifications
    // The main content area changes when navigating
    const targetNode = document.body;

    const config = {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
    };

    let lastUrl = window.location.href;

    observer = new MutationObserver((mutations) => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            handleUrlChange(currentUrl);
        }
    });

    observer.observe(targetNode, config);
    console.log('[GCR Detector] MutationObserver set up');
}

// ============================================================================
// HISTORY API INTERCEPTION
// ============================================================================

/**
 * Intercepts pushState and replaceState to detect navigation
 */
function setupHistoryInterception() {
    // Wrap History API methods
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
        const result = originalPushState.apply(this, args);
        handleUrlChange(window.location.href);
        return result;
    };

    history.replaceState = function (...args) {
        const result = originalReplaceState.apply(this, args);
        handleUrlChange(window.location.href);
        return result;
    };

    // Handle back/forward button
    window.addEventListener('popstate', () => {
        handleUrlChange(window.location.href);
    });

    console.log('[GCR Detector] History interception set up');
}

// ============================================================================
// POLLING FALLBACK
// ============================================================================

/**
 * Sets up polling as a fallback for detection
 * In case MutationObserver or History interception miss something
 */
function setupPolling() {
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
    }

    pollingIntervalId = setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastCheckedUrl) {
            handleUrlChange(currentUrl);
        }
    }, POLLING_INTERVAL_MS);

    console.log('[GCR Detector] Polling set up');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes course detection with all strategies
 * @param {Function} callback - Called when course changes
 * @returns {void}
 */
export function initCourseDetector(callback) {
    console.log('[GCR Detector] Initializing course detector');

    onCourseChangeCallback = callback;
    lastCheckedUrl = window.location.href;
    lastDetectedCourseId = getCurrentCourseId();

    // Set up all detection methods
    setupHistoryInterception();
    setupMutationObserver();
    setupPolling();

    // Initial detection
    console.log('[GCR Detector] Initial state:', {
        url: window.location.href.substring(0, 80) + '...',
        courseId: lastDetectedCourseId,
        pageType: getPageType()
    });

    // Trigger initial callback
    if (callback) {
        callback({
            courseId: lastDetectedCourseId,
            url: window.location.href,
            pageType: getPageType(),
            timestamp: Date.now(),
            isInitial: true
        });
    }
}

/**
 * Cleans up course detector resources
 */
export function destroyCourseDetector() {
    console.log('[GCR Detector] Destroying course detector');

    // Cancel pending debounced calls
    debouncedCourseChange.cancel();

    // Cancel abort controller
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }

    // Disconnect observer
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    // Clear polling
    if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
        pollingIntervalId = null;
    }

    // Clear callbacks
    onCourseChangeCallback = null;
}

/**
 * Forces a re-check of the current URL
 * Useful after authentication or manual refresh
 */
export function forceRecheck() {
    console.log('[GCR Detector] Forcing recheck');
    lastCheckedUrl = null; // Reset to allow re-detection
    handleUrlChange(window.location.href);
}

/**
 * Gets the last detected course ID
 * @returns {string|null} Course ID or null
 */
export function getLastDetectedCourseId() {
    return lastDetectedCourseId;
}

/**
 * Sets the last detected course ID manually
 * Used when loading from cache
 * @param {string} courseId - Course ID to set
 */
export function setLastDetectedCourseId(courseId) {
    lastDetectedCourseId = courseId;
}

console.log('[GCR] Course detector module loaded');
