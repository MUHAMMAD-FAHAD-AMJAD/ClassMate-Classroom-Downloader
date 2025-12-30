/**
 * GCR Downloader - Cache Management Module
 * Handles course data caching with LRU (Least Recently Used) eviction
 * 
 * Key Features:
 * - Multi-course LRU caching (up to 5 courses)
 * - Automatic cache eviction when limit reached
 * - Persistence across page refreshes and browser sessions
 * - Cache size management (max 4.5MB for data + 0.5MB buffer)
 * - Access frequency and recency tracking
 * 
 * @module cache
 * @version 2.0.0 - Updated to LRU multi-course caching
 */

import { getStorage, setStorage, removeStorage } from './helpers.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Storage keys for cache data
 */
const KEYS = {
    LAST_COURSE_ID: 'gcr_last_course_id',           // Currently active course ID
    LAST_COURSE_NAME: 'gcr_last_course_name',       // Active course name
    COURSE_DATA_PREFIX: 'gcr_course_data_',         // Prefix for course data
    CACHE_METADATA: 'gcr_cache_metadata',           // LRU metadata
    CACHE_TIMESTAMP: 'gcr_cache_timestamp',         // When cache was created
    FETCH_IN_PROGRESS: 'gcr_fetch_in_progress'      // Flag for in-progress fetch
};

/**
 * Maximum cache age in milliseconds (30 days)
 */
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Maximum cache size in bytes (4.5MB for data, 0.5MB buffer for metadata)
 */
const MAX_CACHE_SIZE_BYTES = 4.5 * 1024 * 1024;

/**
 * Maximum number of courses to cache (LRU limit)
 */
const MAX_CACHED_COURSES = 5;

// ============================================================================
// LRU CACHE METADATA MANAGEMENT
// ============================================================================

/**
 * Default cache metadata structure
 */
const DEFAULT_METADATA = {
    courses: {},       // { courseId: { accessTime, accessCount, sizeBytes, name } }
    totalSize: 0,      // Total size of all cached courses
    version: 2         // Metadata schema version
};

/**
 * Gets cache metadata (LRU tracking data)
 * @returns {Promise<Object>} Metadata object
 */
export async function getCacheMetadata() {
    try {
        const data = await getStorage(KEYS.CACHE_METADATA);
        const metadata = data[KEYS.CACHE_METADATA];

        if (!metadata || metadata.version !== 2) {
            console.log('[GCR Cache] Initializing LRU metadata');
            return { ...DEFAULT_METADATA };
        }

        return metadata;
    } catch (e) {
        console.error('[GCR Cache] Error getting metadata:', e);
        return { ...DEFAULT_METADATA };
    }
}

/**
 * Saves cache metadata
 * @param {Object} metadata - Metadata to save
 */
async function saveCacheMetadata(metadata) {
    try {
        await setStorage({ [KEYS.CACHE_METADATA]: metadata });
    } catch (e) {
        console.error('[GCR Cache] Error saving metadata:', e);
    }
}

/**
 * Updates access time and count for a course (marks as recently used)
 * @param {string} courseId - Course ID
 */
export async function updateCacheAccess(courseId) {
    const metadata = await getCacheMetadata();

    if (metadata.courses[courseId]) {
        metadata.courses[courseId].accessTime = Date.now();
        metadata.courses[courseId].accessCount = (metadata.courses[courseId].accessCount || 0) + 1;
        await saveCacheMetadata(metadata);
        console.log('[GCR Cache] Updated access for course:', courseId);
    }
}

/**
 * Gets LRU course (least recently used)
 * @returns {Promise<string|null>} Course ID of LRU course or null
 */
export async function getLRUCourse() {
    const metadata = await getCacheMetadata();
    const courses = Object.entries(metadata.courses);

    if (courses.length === 0) return null;

    // Sort by access time (oldest first)
    courses.sort((a, b) => (a[1].accessTime || 0) - (b[1].accessTime || 0));

    return courses[0][0]; // Return course ID
}

/**
 * Evicts the LRU course to make room for new data
 * @returns {Promise<boolean>} True if a course was evicted
 */
export async function evictLRUCourse() {
    const lruCourseId = await getLRUCourse();

    if (!lruCourseId) {
        console.log('[GCR Cache] No courses to evict');
        return false;
    }

    console.log('[GCR Cache] Evicting LRU course:', lruCourseId);

    // Get metadata before clearing
    const metadata = await getCacheMetadata();
    const courseInfo = metadata.courses[lruCourseId];

    // Clear the course data
    await clearCourseData(lruCourseId);

    // Update metadata
    if (courseInfo) {
        metadata.totalSize = Math.max(0, metadata.totalSize - (courseInfo.sizeBytes || 0));
    }
    delete metadata.courses[lruCourseId];
    await saveCacheMetadata(metadata);

    console.log('[GCR Cache] Evicted course:', lruCourseId, 'Remaining size:', metadata.totalSize);
    return true;
}

/**
 * Gets number of cached courses
 * @returns {Promise<number>} Number of cached courses
 */
export async function getCachedCourseCount() {
    const metadata = await getCacheMetadata();
    return Object.keys(metadata.courses).length;
}

/**
 * Gets cache statistics
 * @returns {Promise<Object>} Cache stats
 */
export async function getCacheStats() {
    const metadata = await getCacheMetadata();
    const courseCount = Object.keys(metadata.courses).length;

    return {
        courseCount,
        maxCourses: MAX_CACHED_COURSES,
        totalSizeBytes: metadata.totalSize,
        maxSizeBytes: MAX_CACHE_SIZE_BYTES,
        utilizationPercent: Math.round((metadata.totalSize / MAX_CACHE_SIZE_BYTES) * 100),
        courses: Object.entries(metadata.courses).map(([id, info]) => ({
            id,
            name: info.name,
            sizeBytes: info.sizeBytes,
            accessCount: info.accessCount,
            lastAccess: new Date(info.accessTime).toISOString()
        }))
    };
}

// ============================================================================
// CORE CACHE OPERATIONS
// ============================================================================

/**
 * Gets the ID of the last visited/cached course
 * @returns {Promise<string|null>} Course ID or null if no course cached
 */
export async function getLastCourseId() {
    try {
        const data = await getStorage(KEYS.LAST_COURSE_ID);
        return data[KEYS.LAST_COURSE_ID] || null;
    } catch (e) {
        console.error('[GCR Cache] Error getting last course ID:', e);
        return null;
    }
}

/**
 * Gets the name of the last visited/cached course
 * @returns {Promise<string|null>} Course name or null
 */
export async function getLastCourseName() {
    try {
        const data = await getStorage(KEYS.LAST_COURSE_NAME);
        return data[KEYS.LAST_COURSE_NAME] || null;
    } catch (e) {
        console.error('[GCR Cache] Error getting last course name:', e);
        return null;
    }
}

/**
 * Sets the current course as the last visited course
 * LRU Update: No longer clears other courses, just marks this as most recent
 * @param {string} courseId - Course ID
 * @param {string} courseName - Course name
 * @returns {Promise<void>}
 */
export async function setLastCourse(courseId, courseName) {
    if (!courseId) {
        console.warn('[GCR Cache] Attempted to set null course ID');
        return;
    }

    console.log('[GCR Cache] Setting last course:', courseId, courseName);

    try {
        // Update LRU access time for this course if it exists in cache
        await updateCacheAccess(courseId);

        // Set the new course as current (for UI purposes)
        await setStorage({
            [KEYS.LAST_COURSE_ID]: courseId,
            [KEYS.LAST_COURSE_NAME]: courseName || 'Unknown Course',
            [KEYS.CACHE_TIMESTAMP]: Date.now()
        });

        console.log('[GCR Cache] Last course updated successfully');
    } catch (e) {
        console.error('[GCR Cache] Error setting last course:', e);
        throw e;
    }
}

/**
 * Gets cached course data for a specific course
 * @param {string} courseId - Course ID to get data for
 * @returns {Promise<Object|null>} Course data or null if not cached
 */
export async function getCourseData(courseId) {
    if (!courseId) return null;

    const key = KEYS.COURSE_DATA_PREFIX + courseId;

    try {
        const data = await getStorage(key);
        const courseData = data[key];

        if (!courseData) {
            console.log('[GCR Cache] No cached data for course:', courseId);
            return null;
        }

        // Check if cache is too old
        if (courseData.timestamp && Date.now() - courseData.timestamp > MAX_CACHE_AGE_MS) {
            console.log('[GCR Cache] Cache expired for course:', courseId);
            await clearCourseData(courseId);
            return null;
        }

        console.log('[GCR Cache] Retrieved cached data for course:', courseId);
        return courseData;
    } catch (e) {
        console.error('[GCR Cache] Error getting course data:', e);
        return null;
    }
}

/**
 * Gets cached data for the last visited course
 * @returns {Promise<Object|null>} Course data or null
 */
export async function getLastCourseData() {
    const courseId = await getLastCourseId();
    if (!courseId) return null;
    return getCourseData(courseId);
}

/**
 * Sets/updates cached course data with LRU eviction
 * Evicts least recently used courses when limit is reached
 * @param {string} courseId - Course ID
 * @param {Object} data - Data to cache (materials, assignments, etc.)
 * @returns {Promise<void>}
 */
export async function setCourseData(courseId, data) {
    if (!courseId) {
        console.warn('[GCR Cache] Attempted to set data for null course ID');
        return;
    }

    const key = KEYS.COURSE_DATA_PREFIX + courseId;

    // Add metadata
    const cacheData = {
        ...data,
        courseId,
        timestamp: Date.now(),
        version: 2
    };

    // Calculate data size
    const dataString = JSON.stringify(cacheData);
    const dataSize = dataString.length;

    // Get current cache metadata
    let metadata = await getCacheMetadata();
    const isUpdate = !!metadata.courses[courseId];
    const existingSize = metadata.courses[courseId]?.sizeBytes || 0;
    const netNewSize = dataSize - existingSize;

    // Check if data is too large for cache
    if (dataSize > MAX_CACHE_SIZE_BYTES * 0.9) {
        console.warn('[GCR Cache] Data too large to cache:', dataSize, 'bytes');
        // Try to store a trimmed version
        cacheData.materials = cacheData.materials?.slice(0, 100);
        cacheData.assignments = cacheData.assignments?.slice(0, 100);
        cacheData.announcements = cacheData.announcements?.slice(0, 50);
        cacheData.trimmed = true;
    }

    // Evict courses if needed (space or count limit)
    while (
        ((metadata.totalSize + netNewSize > MAX_CACHE_SIZE_BYTES) ||
            (!isUpdate && Object.keys(metadata.courses).length >= MAX_CACHED_COURSES)) &&
        Object.keys(metadata.courses).length > 0
    ) {
        console.log('[GCR Cache] Cache limit reached, evicting LRU course');
        await evictLRUCourse();
        metadata = await getCacheMetadata(); // Refresh metadata after eviction
    }

    try {
        await setStorage({ [key]: cacheData });

        // Update metadata
        metadata.courses[courseId] = {
            name: data.courseName || 'Unknown Course',
            sizeBytes: dataSize,
            accessTime: Date.now(),
            accessCount: isUpdate ? (metadata.courses[courseId]?.accessCount || 0) + 1 : 1
        };

        if (isUpdate) {
            metadata.totalSize = metadata.totalSize - existingSize + dataSize;
        } else {
            metadata.totalSize += dataSize;
        }

        await saveCacheMetadata(metadata);

        console.log('[GCR Cache] Course data cached for:', courseId,
            `(${dataSize} bytes, ${Object.keys(metadata.courses).length}/${MAX_CACHED_COURSES} courses)`);
    } catch (e) {
        console.error('[GCR Cache] Error caching course data:', e);

        // If quota exceeded, evict more courses and retry
        if (e.message?.includes('QUOTA_BYTES')) {
            console.log('[GCR Cache] Storage quota exceeded, evicting courses');
            while (Object.keys(metadata.courses).length > 1) {
                await evictLRUCourse();
                metadata = await getCacheMetadata();
            }
            // Retry once
            try {
                await setStorage({ [key]: cacheData });
            } catch (retryError) {
                console.error('[GCR Cache] Still failed after clearing:', retryError);
                throw retryError;
            }
        } else {
            throw e;
        }
    }
}

/**
 * Clears cached data for a specific course
 * @param {string} courseId - Course ID to clear
 * @returns {Promise<void>}
 */
export async function clearCourseData(courseId) {
    if (!courseId) return;

    const key = KEYS.COURSE_DATA_PREFIX + courseId;

    try {
        await removeStorage(key);
        console.log('[GCR Cache] Cleared data for course:', courseId);
    } catch (e) {
        console.error('[GCR Cache] Error clearing course data:', e);
    }
}

/**
 * Clears all cached course data and resets to fresh state
 * @returns {Promise<void>}
 */
export async function clearAllCourseData() {
    console.log('[GCR Cache] Clearing all cached data');

    try {
        // Get all storage to find course data keys
        const allData = await getStorage(null);
        const keysToRemove = Object.keys(allData).filter(key =>
            key.startsWith(KEYS.COURSE_DATA_PREFIX)
        );

        if (keysToRemove.length > 0) {
            await removeStorage(keysToRemove);
        }

        console.log('[GCR Cache] All course data cleared');
    } catch (e) {
        console.error('[GCR Cache] Error clearing all data:', e);
    }
}

/**
 * Completely resets the cache (including last course info)
 * @returns {Promise<void>}
 */
export async function resetCache() {
    console.log('[GCR Cache] Resetting entire cache');

    try {
        await clearAllCourseData();
        await removeStorage([
            KEYS.LAST_COURSE_ID,
            KEYS.LAST_COURSE_NAME,
            KEYS.CACHE_TIMESTAMP,
            KEYS.FETCH_IN_PROGRESS
        ]);
        console.log('[GCR Cache] Cache reset complete');
    } catch (e) {
        console.error('[GCR Cache] Error resetting cache:', e);
    }
}

// ============================================================================
// FETCH STATE MANAGEMENT
// ============================================================================

/**
 * Marks that a fetch is in progress for a course
 * Used to prevent duplicate fetches
 * @param {string} courseId - Course being fetched
 * @returns {Promise<void>}
 */
export async function setFetchInProgress(courseId) {
    await setStorage({
        [KEYS.FETCH_IN_PROGRESS]: {
            courseId,
            startTime: Date.now()
        }
    });
}

/**
 * Clears the fetch in progress flag
 * @returns {Promise<void>}
 */
export async function clearFetchInProgress() {
    await removeStorage(KEYS.FETCH_IN_PROGRESS);
}

/**
 * Checks if a fetch is currently in progress
 * @returns {Promise<Object|null>} Fetch info or null
 */
export async function getFetchInProgress() {
    try {
        const data = await getStorage(KEYS.FETCH_IN_PROGRESS);
        const fetchInfo = data[KEYS.FETCH_IN_PROGRESS];

        if (!fetchInfo) return null;

        // Clear stale fetch flags (older than 2 minutes)
        if (Date.now() - fetchInfo.startTime > 2 * 60 * 1000) {
            await clearFetchInProgress();
            return null;
        }

        return fetchInfo;
    } catch (e) {
        return null;
    }
}

// ============================================================================
// CACHE STATISTICS
// ============================================================================

/**
 * Gets cache statistics for debugging/display
 * @returns {Promise<Object>} Cache stats
 */
export async function getCacheStats() {
    try {
        const allData = await getStorage(null);

        const courseDataKeys = Object.keys(allData).filter(key =>
            key.startsWith(KEYS.COURSE_DATA_PREFIX)
        );

        let totalSize = 0;
        for (const key of Object.keys(allData)) {
            totalSize += JSON.stringify(allData[key]).length;
        }

        return {
            lastCourseId: allData[KEYS.LAST_COURSE_ID] || null,
            lastCourseName: allData[KEYS.LAST_COURSE_NAME] || null,
            cacheTimestamp: allData[KEYS.CACHE_TIMESTAMP] || null,
            cachedCourses: courseDataKeys.length,
            totalSizeBytes: totalSize,
            totalSizeFormatted: formatBytes(totalSize),
            maxSize: MAX_CACHE_SIZE_BYTES,
            usagePercent: Math.round((totalSize / MAX_CACHE_SIZE_BYTES) * 100)
        };
    } catch (e) {
        console.error('[GCR Cache] Error getting stats:', e);
        return {
            error: e.message
        };
    }
}

/**
 * Formats bytes to human-readable string
 * @param {number} bytes - Bytes to format
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ============================================================================
// COURSE CHANGE DETECTION HELPERS
// ============================================================================

/**
 * Checks if current course is different from cached course
 * @param {string} currentCourseId - Current course ID from URL
 * @returns {Promise<boolean>} True if course changed
 */
export async function hasCourseChanged(currentCourseId) {
    const lastCourseId = await getLastCourseId();

    // No previous course = new course
    if (!lastCourseId) return true;

    // Same course = no change
    if (lastCourseId === currentCourseId) return false;

    // Different course = change
    return true;
}

/**
 * Handles a course change by clearing old data and setting new course
 * @param {string} newCourseId - New course ID
 * @param {string} newCourseName - New course name
 * @returns {Promise<void>}
 */
export async function handleCourseChange(newCourseId, newCourseName) {
    console.log('[GCR Cache] Handling course change to:', newCourseId);

    // This will clear old course data and set new course
    await setLastCourse(newCourseId, newCourseName);
}

/**
 * Gets the total count of downloadable items in cached data
 * @returns {Promise<number>} Total count
 */
export async function getCachedItemCount() {
    const data = await getLastCourseData();

    if (!data) return 0;

    let count = 0;
    if (data.materials) count += data.materials.length;
    if (data.assignments) count += data.assignments.length;
    if (data.announcements) count += data.announcements.length;
    if (data.links) count += data.links.length;

    return count;
}

console.log('[GCR] Cache module loaded');
