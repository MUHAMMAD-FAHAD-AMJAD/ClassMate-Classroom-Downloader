/**
 * GCR Downloader - Constants Module
 * Centralized configuration and magic numbers
 * 
 * @module constants
 * @version 1.0.0
 */

// ============================================================================
// API CONFIGURATION
// ============================================================================

/**
 * Google API base URLs
 */
export const API_URLS = {
    CLASSROOM_BASE: 'https://classroom.googleapis.com/v1',
    DRIVE_BASE: 'https://www.googleapis.com/drive/v3',
    TOKEN_INFO: 'https://www.googleapis.com/oauth2/v1/tokeninfo',
    USER_INFO: 'https://www.googleapis.com/oauth2/v1/userinfo',
    REVOKE_TOKEN: 'https://accounts.google.com/o/oauth2/revoke'
};

/**
 * API rate limits and timeouts
 */
export const API_LIMITS = {
    // Google Classroom API quota: ~100 requests/minute
    GOOGLE_API_RATE_LIMIT: 100,
    RATE_LIMIT_SAFETY_BUFFER: 0.1, // 10% buffer
    MAX_TOKENS: 90, // 100 * (1 - 0.1)
    TOKEN_REFILL_RATE: 1.5, // tokens per second (90/60)
    
    // Request configuration
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 100,
    REQUEST_TIMEOUT_MS: 30000, // 30 seconds
    
    // Retry configuration
    MAX_RETRIES: 3,
    MAX_GLOBAL_RETRIES_PER_MINUTE: 50,
    INITIAL_BACKOFF_MS: 2000,
    MAX_BACKOFF_MS: 64000,
    BACKOFF_MULTIPLIER: 2
};

// ============================================================================
// AUTHENTICATION CONFIGURATION
// ============================================================================

/**
 * OAuth and token settings
 */
export const AUTH_CONFIG = {
    // Token lifetime (Google default is 1 hour, universities may be shorter)
    DEFAULT_TOKEN_LIFETIME_MS: 60 * 60 * 1000, // 1 hour
    TOKEN_EXPIRY_BUFFER_MS: 5 * 60 * 1000, // 5 minutes before expiry
    PROACTIVE_REFRESH_MINUTES: 50, // Refresh at 50 minutes
    
    // Lock settings for mutex
    LOCK_TIMEOUT_MS: 10000, // 10 seconds
    LOCK_MAX_WAIT_MS: 15000, // 15 seconds
    
    // Token validation
    MIN_TOKEN_VALIDITY_SECONDS: 600 // 10 minutes for batch operations
};

// ============================================================================
// STORAGE KEYS
// ============================================================================

/**
 * Chrome storage keys
 */
export const STORAGE_KEYS = {
    // Authentication
    AUTH_TOKEN: 'gcr_auth_token',
    AUTH_TIMESTAMP: 'gcr_auth_timestamp',
    TOKEN_REFRESH_LOCK: 'gcr_token_refresh_lock',
    
    // Course data
    LAST_COURSE_ID: 'gcr_last_course_id',
    LAST_COURSE_NAME: 'gcr_last_course_name',
    COURSE_DATA_PREFIX: 'gcr_course_data_',
    CACHE_INDEX: 'gcr_cache_index',
    
    // User preferences
    THEME: 'gcr_theme',
    SETTINGS: 'gcr_settings',
    
    // Rate limiter
    RATE_LIMIT_STATE: 'gcr_rate_limit_state',
    
    // Worker state (session storage)
    WORKER_DOWNLOAD_QUEUE: 'gcr_worker_download_queue',
    WORKER_ACTIVE_DOWNLOADS: 'gcr_worker_active_downloads',
    WORKER_DOWNLOAD_PROGRESS: 'gcr_worker_download_progress',
    WORKER_DOWNLOAD_RESULTS: 'gcr_worker_download_results',
    WORKER_HEARTBEAT: 'gcr_worker_heartbeat',
    WORKER_LOCK: 'gcr_worker_lock',
    WORKER_OPERATION: 'gcr_worker_current_operation',
    WORKER_ABORT: 'gcr_worker_operation_abort'
};

// ============================================================================
// DOWNLOAD CONFIGURATION
// ============================================================================

/**
 * Download settings
 */
export const DOWNLOAD_CONFIG = {
    // File size limits
    MAX_DATA_URL_SIZE_BYTES: 5 * 1024 * 1024, // 5MB - use data URL
    MAX_SINGLE_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100MB - warn user
    MAX_TOTAL_DOWNLOAD_SIZE_BYTES: 500 * 1024 * 1024, // 500MB total
    
    // Chunked download
    CHUNK_SIZE_BYTES: 10 * 1024 * 1024, // 10MB chunks for large files
    
    // Progress monitoring
    PROGRESS_POLL_INTERVAL_MS: 300,
    MAX_MONITOR_TIME_MS: 30 * 60 * 1000, // 30 minutes
    
    // Concurrent downloads
    MAX_CONCURRENT_DOWNLOADS: 3,
    
    // Service worker keepalive
    KEEPALIVE_INTERVAL_MS: 25000 // 25 seconds
};

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

/**
 * Cache settings with LRU eviction
 */
export const CACHE_CONFIG = {
    MAX_COURSES: 10,
    MAX_CACHE_AGE_MS: 24 * 60 * 60 * 1000, // 24 hours
    MAX_CACHE_SIZE_BYTES: 10 * 1024 * 1024 // 10MB total
};

// ============================================================================
// UI CONFIGURATION
// ============================================================================

/**
 * UI constants
 */
export const UI_CONFIG = {
    // Z-index (maximum safe value)
    Z_INDEX_BUTTON: 2147483647,
    Z_INDEX_OVERLAY: 2147483646,
    Z_INDEX_MODAL: 2147483645,
    Z_INDEX_NOTIFICATION: 2147483647,
    
    // Debounce timings
    SEARCH_DEBOUNCE_MS: 300,
    DETECTION_DEBOUNCE_MS: 500,
    STATE_PERSIST_DEBOUNCE_MS: 500,
    
    // Animation timings
    NOTIFICATION_DURATION_MS: 5000,
    NOTIFICATION_FADE_MS: 300,
    
    // Content limits
    MAX_DISPLAYED_FILES: 500,
    MAX_FILENAME_DISPLAY_LENGTH: 35,
    
    // Button states
    BUTTON_ID: 'gcr-downloader-button',
    BADGE_ID: 'gcr-downloader-badge',
    STYLE_ID: 'gcr-downloader-styles'
};

// ============================================================================
// FILE HANDLING
// ============================================================================

/**
 * Filename and path constants
 */
export const FILE_CONFIG = {
    MAX_FILENAME_LENGTH: 200,
    MAX_PATH_LENGTH: 240,
    MAX_FOLDER_NAME_LENGTH: 100,
    
    // Windows reserved names
    WINDOWS_RESERVED: [
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
    ],
    
    // Default names
    DEFAULT_FOLDER_NAME: 'Downloads',
    DEFAULT_FILE_NAME: 'download',
    RESOURCES_FILE_NAME: '_Links_and_Resources.txt'
};

// ============================================================================
// MIME TYPES
// ============================================================================

/**
 * Allowed export MIME types (whitelist for security)
 */
export const ALLOWED_EXPORT_MIMES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'text/plain',
    'text/csv',
    'text/html'
];

/**
 * Google Workspace file export formats
 */
export const GOOGLE_EXPORT_FORMATS = {
    'application/vnd.google-apps.document': {
        mimeType: 'application/pdf',
        extension: '.pdf'
    },
    'application/vnd.google-apps.spreadsheet': {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        extension: '.xlsx'
    },
    'application/vnd.google-apps.presentation': {
        mimeType: 'application/pdf',
        extension: '.pdf'
    },
    'application/vnd.google-apps.drawing': {
        mimeType: 'image/png',
        extension: '.png'
    }
};

// ============================================================================
// VALIDATION PATTERNS
// ============================================================================

/**
 * Validation regex patterns
 */
export const VALIDATION_PATTERNS = {
    // Course ID: numeric string, 10+ digits
    COURSE_ID: /^[0-9]{10,}$/,
    
    // File ID: alphanumeric with dashes/underscores
    FILE_ID: /^[a-zA-Z0-9_-]{10,}$/,
    
    // Path traversal detection
    PATH_TRAVERSAL: [
        /\.\./g,
        /\.\.\\/g,
        /\.\.\//g,
        /^\/+/,
        /^\\+/,
        /^[a-zA-Z]:/
    ],
    
    // Dangerous filename characters
    DANGEROUS_CHARS: /[<>:"/\\|?*\x00-\x1f]/g,
    
    // XSS patterns
    XSS_PATTERNS: [
        /<script/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /data:/gi,
        /vbscript:/gi,
        /<iframe/gi,
        /<object/gi,
        /<embed/gi,
        /<link/gi,
        /<style/gi,
        /expression\s*\(/gi
    ]
};

// ============================================================================
// MESSAGE RATE LIMITING
// ============================================================================

/**
 * Message passing rate limits
 */
export const MESSAGE_CONFIG = {
    MIN_INTERVAL_MS: 100, // Minimum 100ms between same message type
    MAX_PENDING_MESSAGES: 50, // Maximum pending messages
    THROTTLE_CLEANUP_INTERVAL_MS: 60000 // Clean throttle map every minute
};

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

/**
 * Debug logging settings
 */
export const LOG_CONFIG = {
    // Set to true for development, false for production
    DEBUG_ENABLED: false,
    
    // Log prefixes
    PREFIX: '[GCR]',
    
    // Maximum log message length
    MAX_MESSAGE_LENGTH: 500
};

console.log('[GCR] Constants module loaded');
