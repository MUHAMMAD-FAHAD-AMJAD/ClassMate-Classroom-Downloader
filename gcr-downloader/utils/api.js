/**
 * GCR Downloader - Google Classroom & Drive API Module
 * Handles all API communications with Google services
 * 
 * Features:
 * - Fetch courses, coursework, materials, announcements
 * - Pagination handling for large datasets
 * - Exponential backoff for rate limiting
 * - Comprehensive error handling
 * - Abort signal support for request cancellation
 */

import { getAuthToken, refreshToken, isAuthError } from './auth.js';
import {
    retryWithBackoff,
    withTimeout,
    GOOGLE_EXPORT_FORMATS,
    isGoogleWorkspaceFile
} from './helpers.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Base URLs for Google APIs
 */
const CLASSROOM_API_BASE = 'https://classroom.googleapis.com/v1';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

/**
 * Default page size for paginated requests
 */
const DEFAULT_PAGE_SIZE = 50;

/**
 * Request timeout in milliseconds
 */
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Maximum retry attempts for failed requests
 */
const MAX_RETRIES = 3;

// ============================================================================
// REQUEST HELPER
// ============================================================================

/**
 * Makes an authenticated API request with error handling
 * @param {string} url - Full URL to request
 * @param {Object} options - Fetch options
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Object>} Response data
 */
async function apiRequest(url, options = {}, signal = null) {
    // Get auth token
    let token;
    try {
        token = await getAuthToken(true);
    } catch (e) {
        console.error('[GCR API] Failed to get auth token:', e);
        throw new Error('Authentication required. Please sign in.');
    }

    // Build request options
    const fetchOptions = {
        method: options.method || 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        },
        signal: signal || options.signal
    };

    if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
    }

    console.log('[GCR API] Request:', url.substring(0, 100) + (url.length > 100 ? '...' : ''));

    try {
        // Make request with timeout
        const response = await withTimeout(
            fetch(url, fetchOptions),
            REQUEST_TIMEOUT_MS
        );

        // Check for errors
        if (!response.ok) {
            const error = new Error(`API request failed: ${response.status} ${response.statusText}`);
            error.status = response.status;
            error.response = response;

            // Try to get error details from response
            try {
                const errorData = await response.json();
                error.details = errorData.error?.message || errorData.message;
                console.error('[GCR API] Error details:', errorData);
            } catch (parseError) {
                // ERR-002 FIX: Log JSON parse failure and try to get text
                console.warn('[GCR API] Could not parse error response as JSON:', parseError.message);
                try {
                    error.details = await response.text();
                } catch (textError) {
                    error.details = 'Could not read error response';
                }
            }

            throw error;
        }

        // Parse response
        const data = await response.json();
        return data;

    } catch (error) {
        // Handle abort
        if (error.name === 'AbortError') {
            console.log('[GCR API] Request aborted');
            throw error;
        }

        // Handle timeout
        if (error.message?.includes('timed out')) {
            console.error('[GCR API] Request timed out');
            throw new Error('Request timed out. Please try again.');
        }

        // Handle auth errors - try refresh and retry once
        if (isAuthError(error)) {
            console.log('[GCR API] Auth error, attempting refresh...');
            try {
                token = await refreshToken(true);
                fetchOptions.headers['Authorization'] = `Bearer ${token}`;

                const response = await fetch(url, fetchOptions);
                if (response.ok) {
                    return await response.json();
                }
            } catch (refreshError) {
                console.error('[GCR API] Refresh failed:', refreshError);
            }
        }

        throw error;
    }
}

/**
 * Makes an API request with automatic retry on failure
 * @param {string} url - Full URL to request
 * @param {Object} options - Fetch options
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Object>} Response data
 */
async function apiRequestWithRetry(url, options = {}, signal = null) {
    return retryWithBackoff(
        () => apiRequest(url, options, signal),
        MAX_RETRIES
    );
}

// ============================================================================
// CLASSROOM API - COURSES
// ============================================================================

/**
 * Fetches all courses for the authenticated user
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Array>} Array of course objects
 */
export async function getCourses(signal = null) {
    console.log('[GCR API] Fetching courses...');

    const courses = [];
    let pageToken = null;

    do {
        const url = new URL(`${CLASSROOM_API_BASE}/courses`);
        url.searchParams.set('pageSize', DEFAULT_PAGE_SIZE.toString());
        url.searchParams.set('courseStates', 'ACTIVE');
        if (pageToken) {
            url.searchParams.set('pageToken', pageToken);
        }

        const data = await apiRequestWithRetry(url.toString(), {}, signal);

        if (data.courses) {
            courses.push(...data.courses);
        }

        pageToken = data.nextPageToken;

    } while (pageToken);

    console.log('[GCR API] Fetched', courses.length, 'courses');
    return courses;
}

/**
 * Gets details for a specific course
 * @param {string} courseId - Course ID
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Object>} Course object
 */
export async function getCourse(courseId, signal = null) {
    console.log('[GCR API] Fetching course:', courseId);

    const url = `${CLASSROOM_API_BASE}/courses/${courseId}`;
    return apiRequestWithRetry(url, {}, signal);
}

// ============================================================================
// CLASSROOM API - COURSEWORK (ASSIGNMENTS)
// ============================================================================

/**
 * Fetches all coursework (assignments) for a course
 * @param {string} courseId - Course ID
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Array>} Array of coursework objects with attachments
 */
export async function getCourseWork(courseId, signal = null) {
    console.log('[GCR API] Fetching coursework for course:', courseId);

    const coursework = [];
    let pageToken = null;

    do {
        const url = new URL(`${CLASSROOM_API_BASE}/courses/${courseId}/courseWork`);
        url.searchParams.set('pageSize', DEFAULT_PAGE_SIZE.toString());
        if (pageToken) {
            url.searchParams.set('pageToken', pageToken);
        }

        try {
            const data = await apiRequestWithRetry(url.toString(), {}, signal);

            if (data.courseWork) {
                // Process each coursework item
                for (const work of data.courseWork) {
                    const processed = {
                        id: work.id,
                        title: work.title || 'Untitled Assignment',
                        description: work.description || '',
                        type: 'courseWork',
                        creationTime: work.creationTime,
                        updateTime: work.updateTime,
                        dueDate: work.dueDate,
                        materials: [],
                        attachments: []
                    };

                    // Extract materials/attachments
                    if (work.materials) {
                        for (const material of work.materials) {
                            const attachment = processMaterial(material);
                            if (attachment) {
                                processed.attachments.push(attachment);
                            }
                        }
                    }

                    coursework.push(processed);
                }
            }

            pageToken = data.nextPageToken;

        } catch (error) {
            // 404 means no coursework - that's okay
            if (error.status === 404) {
                console.log('[GCR API] No coursework found for course');
                break;
            }
            throw error;
        }

    } while (pageToken);

    console.log('[GCR API] Fetched', coursework.length, 'coursework items');
    return coursework;
}

// ============================================================================
// CLASSROOM API - COURSE MATERIALS
// ============================================================================

/**
 * Fetches all course materials (slides, resources) for a course
 * @param {string} courseId - Course ID
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Array>} Array of material objects
 */
export async function getCourseMaterials(courseId, signal = null) {
    console.log('[GCR API] Fetching course materials for course:', courseId);

    const materials = [];
    let pageToken = null;

    do {
        const url = new URL(`${CLASSROOM_API_BASE}/courses/${courseId}/courseWorkMaterials`);
        url.searchParams.set('pageSize', DEFAULT_PAGE_SIZE.toString());
        if (pageToken) {
            url.searchParams.set('pageToken', pageToken);
        }

        try {
            const data = await apiRequestWithRetry(url.toString(), {}, signal);

            if (data.courseWorkMaterial) {
                for (const material of data.courseWorkMaterial) {
                    const processed = {
                        id: material.id,
                        title: material.title || 'Untitled Material',
                        description: material.description || '',
                        type: 'courseWorkMaterial',
                        creationTime: material.creationTime,
                        updateTime: material.updateTime,
                        attachments: []
                    };

                    // Extract materials/attachments
                    if (material.materials) {
                        for (const mat of material.materials) {
                            const attachment = processMaterial(mat);
                            if (attachment) {
                                processed.attachments.push(attachment);
                            }
                        }
                    }

                    materials.push(processed);
                }
            }

            pageToken = data.nextPageToken;

        } catch (error) {
            // 404 means no materials - that's okay
            if (error.status === 404) {
                console.log('[GCR API] No course materials found');
                break;
            }
            throw error;
        }

    } while (pageToken);

    console.log('[GCR API] Fetched', materials.length, 'course materials');
    return materials;
}

// ============================================================================
// CLASSROOM API - ANNOUNCEMENTS
// ============================================================================

/**
 * Fetches all announcements for a course
 * @param {string} courseId - Course ID
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Array>} Array of announcement objects
 */
export async function getAnnouncements(courseId, signal = null) {
    console.log('[GCR API] Fetching announcements for course:', courseId);

    const announcements = [];
    let pageToken = null;

    do {
        const url = new URL(`${CLASSROOM_API_BASE}/courses/${courseId}/announcements`);
        url.searchParams.set('pageSize', DEFAULT_PAGE_SIZE.toString());
        if (pageToken) {
            url.searchParams.set('pageToken', pageToken);
        }

        try {
            const data = await apiRequestWithRetry(url.toString(), {}, signal);

            if (data.announcements) {
                for (const announcement of data.announcements) {
                    const processed = {
                        id: announcement.id,
                        title: announcement.text?.substring(0, 50) + (announcement.text?.length > 50 ? '...' : '') || 'Announcement',
                        description: announcement.text || '',
                        type: 'announcement',
                        creationTime: announcement.creationTime,
                        updateTime: announcement.updateTime,
                        attachments: []
                    };

                    // Extract materials/attachments
                    if (announcement.materials) {
                        for (const material of announcement.materials) {
                            const attachment = processMaterial(material);
                            if (attachment) {
                                processed.attachments.push(attachment);
                            }
                        }
                    }

                    announcements.push(processed);
                }
            }

            pageToken = data.nextPageToken;

        } catch (error) {
            // 404 means no announcements - that's okay
            if (error.status === 404) {
                console.log('[GCR API] No announcements found');
                break;
            }
            throw error;
        }

    } while (pageToken);

    console.log('[GCR API] Fetched', announcements.length, 'announcements');
    return announcements;
}

// ============================================================================
// MATERIAL PROCESSING
// ============================================================================

/**
 * Processes a material object from the API into our standard format
 * @param {Object} material - Material from API
 * @returns {Object|null} Processed attachment or null
 */
function processMaterial(material) {
    // Drive file
    if (material.driveFile) {
        const file = material.driveFile.driveFile || material.driveFile;
        return {
            type: 'driveFile',
            id: file.id,
            title: file.title || 'Untitled File',
            mimeType: file.mimeType || 'application/octet-stream',
            alternateLink: file.alternateLink,
            thumbnailUrl: file.thumbnailUrl,
            isGoogleFile: isGoogleWorkspaceFile(file.mimeType),
            exportFormat: GOOGLE_EXPORT_FORMATS[file.mimeType] || null
        };
    }

    // YouTube video
    if (material.youtubeVideo) {
        const video = material.youtubeVideo;
        return {
            type: 'youtube',
            id: video.id,
            title: video.title || 'YouTube Video',
            alternateLink: video.alternateLink,
            thumbnailUrl: video.thumbnailUrl,
            isLink: true
        };
    }

    // Link
    if (material.link) {
        const link = material.link;
        return {
            type: 'link',
            url: link.url,
            title: link.title || link.url,
            thumbnailUrl: link.thumbnailUrl,
            isLink: true
        };
    }

    // Form
    if (material.form) {
        const form = material.form;
        return {
            type: 'form',
            title: form.title || 'Google Form',
            formUrl: form.formUrl,
            responseUrl: form.responseUrl,
            isLink: true
        };
    }

    return null;
}

// ============================================================================
// DRIVE API - FILE OPERATIONS
// ============================================================================

/**
 * Gets file metadata from Google Drive
 * @param {string} fileId - Drive file ID
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Object>} File metadata
 */
export async function getFileMetadata(fileId, signal = null) {
    console.log('[GCR API] Getting file metadata:', fileId);

    const url = new URL(`${DRIVE_API_BASE}/files/${fileId}`);
    url.searchParams.set('fields', 'id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink');

    return apiRequestWithRetry(url.toString(), {}, signal);
}

/**
 * Gets the download URL and headers for a Drive file
 * @param {string} fileId - Drive file ID
 * @param {string} mimeType - File MIME type (for export format)
 * @returns {Promise<Object>} Download info with url and headers
 */
export async function getDownloadInfo(fileId, mimeType) {
    const token = await getAuthToken(true);

    // Check if this is a Google Workspace file that needs export
    if (isGoogleWorkspaceFile(mimeType)) {
        const exportFormat = GOOGLE_EXPORT_FORMATS[mimeType];

        if (!exportFormat) {
            // Can't export (e.g., Google Forms) - return null
            return null;
        }

        return {
            url: `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(exportFormat.mimeType)}`,
            headers: {
                'Authorization': `Bearer ${token}`
            },
            exportMimeType: exportFormat.mimeType,
            extension: exportFormat.extension
        };
    }

    // Regular file - direct download
    return {
        url: `${DRIVE_API_BASE}/files/${fileId}?alt=media`,
        headers: {
            'Authorization': `Bearer ${token}`
        },
        extension: null
    };
}

/**
 * Downloads a file's content as blob
 * @param {string} fileId - Drive file ID
 * @param {string} mimeType - File MIME type
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Blob>} File content as blob
 */
export async function downloadFileContent(fileId, mimeType, signal = null) {
    const downloadInfo = await getDownloadInfo(fileId, mimeType);

    if (!downloadInfo) {
        throw new Error('This file type cannot be downloaded');
    }

    console.log('[GCR API] Downloading file:', fileId);

    const response = await fetch(downloadInfo.url, {
        headers: downloadInfo.headers,
        signal
    });

    if (!response.ok) {
        const error = new Error(`Download failed: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return {
        blob: await response.blob(),
        extension: downloadInfo.extension
    };
}

// ============================================================================
// AGGREGATE DATA FETCHING
// ============================================================================

/**
 * Fetches all course data (coursework, materials, announcements)
 * @param {string} courseId - Course ID
 * @param {AbortSignal} signal - Optional abort signal
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} Complete course data
 */
export async function getAllCourseData(courseId, signal = null, onProgress = null) {
    console.log('[GCR API] Fetching all data for course:', courseId);

    const startTime = Date.now();
    let progress = 0;

    const updateProgress = (step, total) => {
        progress = Math.round((step / total) * 100);
        if (onProgress) {
            onProgress(progress);
        }
    };

    try {
        // Step 1: Get course info
        updateProgress(0, 5);
        const courseInfo = await getCourse(courseId, signal);

        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        // Step 2: Fetch all data in parallel for speed
        updateProgress(1, 5);

        const [coursework, materials, announcements] = await Promise.all([
            getCourseWork(courseId, signal).catch(e => {
                console.warn('[GCR API] Error fetching coursework:', e);
                return [];
            }),
            getCourseMaterials(courseId, signal).catch(e => {
                console.warn('[GCR API] Error fetching materials:', e);
                return [];
            }),
            getAnnouncements(courseId, signal).catch(e => {
                console.warn('[GCR API] Error fetching announcements:', e);
                return [];
            })
        ]);

        if (signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
        }

        updateProgress(4, 5);

        // Collect all links (YouTube, forms, external links)
        const links = [];
        const processAttachments = (items) => {
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

        processAttachments(coursework);
        processAttachments(materials);
        processAttachments(announcements);

        updateProgress(5, 5);

        const elapsed = Date.now() - startTime;
        console.log(`[GCR API] Fetched all data in ${elapsed}ms`);

        // Count total downloadable items
        let totalItems = links.length;
        const countAttachments = (items) => {
            for (const item of items) {
                totalItems += (item.attachments || []).filter(a => !a.isLink).length;
            }
        };
        countAttachments(coursework);
        countAttachments(materials);
        countAttachments(announcements);

        return {
            courseId,
            courseName: courseInfo.name || 'Unknown Course',
            courseSection: courseInfo.section || '',
            timestamp: Date.now(),
            assignments: coursework,
            materials,
            announcements,
            links,
            totalItems,
            fetchDuration: elapsed
        };

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('[GCR API] Data fetch aborted');
            throw error;
        }
        console.error('[GCR API] Error fetching course data:', error);
        throw error;
    }
}

console.log('[GCR] API module loaded');
