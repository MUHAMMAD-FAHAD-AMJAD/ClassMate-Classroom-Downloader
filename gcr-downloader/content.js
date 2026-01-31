/**
 * GCR Downloader - Content Script
 * Injects floating download button and handles course detection
 * 
 * Features:
 * - Always-visible floating button (bottom-right)
 * - Course detection from URL
 * - Badge showing downloadable item count
 * - State management for course switching
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const BUTTON_ID = 'gcr-downloader-button';
const BADGE_ID = 'gcr-downloader-badge';
const STYLE_ID = 'gcr-downloader-styles';
const DETECTION_DEBOUNCE_MS = 500;

// HIGH-014 FIX: Increased polling interval from 1s to 3s
const POLLING_INTERVAL_MS = 3000;

// HIGH-013 FIX: Throttle timeout for MutationObserver
const MUTATION_THROTTLE_MS = 250;

// HIGH-026 FIX: Namespace for all global variables to prevent pollution
const GCR_NAMESPACE = '__classmate_gcr__';

// Initialize namespace if not exists
if (!window[GCR_NAMESPACE]) {
    window[GCR_NAMESPACE] = {
        courseData: null,
        currentFilter: 'all',
        currentFormat: null,
        initialized: false
    };
}

// ============================================================================
// CSS INJECTION - Isolated from page styles
// ============================================================================

function injectStyles() {
    // Check if already injected
    if (document.getElementById(STYLE_ID)) return;

    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
/* ClassMate Content Script Styles - Completely Isolated */

.gcr-download-button {
    all: initial !important;
    position: fixed !important;
    bottom: 24px !important;
    right: 24px !important;
    z-index: 2147483647 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 12px 20px !important;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f953c6 100%) !important;
    border: none !important;
    border-radius: 50px !important;
    cursor: pointer !important;
    box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4), 0 4px 12px rgba(0, 0, 0, 0.2) !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    box-sizing: border-box !important;
    height: 48px !important;
    min-width: 48px !important;
}

.gcr-download-button:hover {
    transform: translateY(-3px) scale(1.02) !important;
    box-shadow: 0 12px 40px rgba(102, 126, 234, 0.5) !important;
}

.gcr-download-button:active {
    transform: translateY(-1px) scale(0.98) !important;
}

.gcr-download-button.gcr-loading {
    width: 48px !important;
    padding: 12px !important;
    border-radius: 50% !important;
    pointer-events: none !important;
}

.gcr-download-button.gcr-loading .gcr-button-content { display: none !important; }
.gcr-download-button.gcr-loading .gcr-loading-spinner { display: flex !important; }

.gcr-button-content {
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
}

.gcr-download-icon {
    width: 18px !important;
    height: 18px !important;
    stroke: white !important;
    fill: none !important;
}

.gcr-button-text {
    font-size: 13px !important;
    font-weight: 600 !important;
    color: white !important;
}

.gcr-badge {
    position: absolute !important;
    top: -6px !important;
    right: -6px !important;
    min-width: 20px !important;
    height: 20px !important;
    padding: 0 6px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: #ef4444 !important;
    color: white !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    border-radius: 50px !important;
    border: 2px solid white !important;
}

.gcr-badge-hidden { display: none !important; }

.gcr-loading-spinner {
    display: none !important;
    align-items: center !important;
    justify-content: center !important;
}

.gcr-spinner {
    width: 22px !important;
    height: 22px !important;
    border: 3px solid rgba(255,255,255,0.3) !important;
    border-top-color: white !important;
    border-radius: 50% !important;
    animation: gcr-spin 0.7s linear infinite !important;
}

@keyframes gcr-spin { to { transform: rotate(360deg); } }

.gcr-hidden { display: none !important; }

/* Popup Modal */
.gcr-popup-overlay {
    all: initial !important;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0, 0, 0, 0.7) !important;
    backdrop-filter: blur(8px) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 2147483646 !important;
    animation: gcr-fadeIn 0.2s ease !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    color: #f1f5f9 !important;
}

.gcr-popup-overlay * {
    box-sizing: border-box !important;
    font-family: inherit !important;
    color: inherit !important;
}

@keyframes gcr-fadeIn { from { opacity: 0; } to { opacity: 1; } }

.gcr-popup {
    position: relative !important;
    width: 90% !important;
    max-width: 520px !important;
    height: 85vh !important;
    max-height: 700px !important;
    background: #1e293b !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 20px !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    animation: gcr-fadeInUp 0.3s ease !important;
    color: #f1f5f9 !important;
}

@keyframes gcr-fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

.gcr-popup-header {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 8px 12px !important;
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%) !important;
    flex-shrink: 0 !important;
}

.gcr-popup-title h2 {
    margin: 0 !important;
    font-size: 18px !important;
    font-weight: 700 !important;
    color: white !important;
}

.gcr-popup-count {
    font-size: 13px !important;
    color: rgba(255,255,255,0.8) !important;
}

.gcr-popup-close {
    width: 36px !important;
    height: 36px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(255,255,255,0.1) !important;
    border: none !important;
    border-radius: 50% !important;
    color: white !important;
    font-size: 24px !important;
    cursor: pointer !important;
}

.gcr-popup-close:hover { background: rgba(255,255,255,0.2) !important; }

.gcr-popup-toolbar {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
    padding: 6px 12px !important;
    background: rgba(15, 23, 42, 0.5) !important;
    flex-shrink: 0 !important;
}

.gcr-select-buttons { display: flex !important; gap: 8px !important; }

.gcr-search-input {
    width: 100% !important;
    padding: 8px 12px !important;
    background: rgba(30, 41, 59, 0.8) !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 8px !important;
    color: #f1f5f9 !important;
    font-size: 13px !important;
    outline: none !important;
}

.gcr-search-input:focus { border-color: #8b5cf6 !important; }

.gcr-popup-content {
    flex: 1 1 0 !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    padding: 8px 12px !important;
    min-height: 0 !important;
    scrollbar-width: thin !important;
    scrollbar-color: rgba(139, 92, 246, 0.5) transparent !important;
}

.gcr-popup-content::-webkit-scrollbar {
    width: 6px !important;
}

.gcr-popup-content::-webkit-scrollbar-track {
    background: transparent !important;
}

.gcr-popup-content::-webkit-scrollbar-thumb {
    background: rgba(139, 92, 246, 0.5) !important;
    border-radius: 3px !important;
}

.gcr-popup-content::-webkit-scrollbar-thumb:hover {
    background: rgba(139, 92, 246, 0.7) !important;
}

.gcr-category { margin-bottom: 16px !important; }

.gcr-category-header {
    display: flex !important;
    justify-content: space-between !important;
    padding: 8px 0 !important;
    border-bottom: 1px solid rgba(255,255,255,0.1) !important;
    margin-bottom: 8px !important;
}

.gcr-category-title { font-size: 14px !important; font-weight: 600 !important; color: #f1f5f9 !important; }
.gcr-category-count { font-size: 12px !important; color: #64748b !important; }

.gcr-item-group { margin-bottom: 8px !important; }
.gcr-item-title { font-size: 12px !important; color: #94a3b8 !important; margin-bottom: 4px !important; padding-left: 4px !important; }

/* Item headers and attachments */
.gcr-item { margin-bottom: 12px !important; }

.gcr-item-header {
    font-size: 12px !important;
    font-weight: 500 !important;
    color: #cbd5e1 !important;
    padding: 4px 0 !important;
    margin-bottom: 4px !important;
}

.gcr-attachments { 
    display: flex !important; 
    flex-wrap: wrap !important; 
    gap: 6px !important; 
}

.gcr-attachment {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 6px 10px !important;
    background: rgba(30, 41, 59, 0.6) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
    color: #f1f5f9 !important;
}

.gcr-attachment:hover {
    background: rgba(51, 65, 85, 0.6) !important;
    border-color: rgba(255, 255, 255, 0.15) !important;
}

.gcr-checkbox {
    width: 16px !important;
    height: 16px !important;
    accent-color: #8b5cf6 !important;
    cursor: pointer !important;
}

.gcr-attachment-icon {
    font-size: 14px !important;
}

.gcr-attachment-title {
    font-size: 12px !important;
    color: #f1f5f9 !important;
    max-width: 180px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
}


.gcr-file-item {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 8px 12px !important;
    background: rgba(30, 41, 59, 0.4) !important;
    border: 1px solid rgba(255,255,255,0.05) !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    margin-bottom: 4px !important;
}

.gcr-file-item:hover { background: rgba(51, 65, 85, 0.5) !important; }
.gcr-file-item.selected { background: rgba(139, 92, 246, 0.15) !important; border-color: #8b5cf6 !important; }

.gcr-file-checkbox { width: 18px !important; height: 18px !important; accent-color: #8b5cf6 !important; }
.gcr-file-icon { font-size: 16px !important; }
.gcr-file-name { flex: 1 !important; font-size: 13px !important; color: #f1f5f9 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }

.gcr-popup-footer {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 8px 12px !important;
    background: rgba(15, 23, 42, 0.95) !important;
    border-top: 1px solid rgba(255,255,255,0.1) !important;
    flex-shrink: 0 !important;
}

.gcr-selected-count { font-size: 14px !important; color: #94a3b8 !important; }
.gcr-popup-actions { display: flex !important; gap: 10px !important; }

.gcr-btn {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    padding: 10px 16px !important;
    border: none !important;
    border-radius: 10px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    cursor: pointer !important;
}

.gcr-btn:active { transform: scale(0.96) !important; }

.gcr-btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f953c6 100%) !important;
    color: white !important;
}

.gcr-btn-secondary {
    background: #334155 !important;
    color: #f1f5f9 !important;
}

.gcr-btn-danger { background: #ef4444 !important; color: white !important; }
.gcr-btn-small { padding: 8px 12px !important; font-size: 12px !important; }

/* Progress Overlay - MUST cover popup content and allow button clicks */
.gcr-progress-overlay {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(15, 23, 42, 0.95) !important;
    display: flex;  /* NO !important - allows gcr-hidden to override */
    align-items: center !important;
    justify-content: center !important;
    z-index: 100 !important;
    border-radius: 16px !important;
}

/* When hidden class is applied, ALWAYS hide */
.gcr-progress-overlay.gcr-hidden {
    display: none !important;
}

.gcr-progress-content {
    text-align: center !important;
    padding: 30px !important;
}

.gcr-progress-title {
    font-size: 20px !important;
    font-weight: 600 !important;
    color: #f1f5f9 !important;
    margin-bottom: 8px !important;
}

.gcr-progress-container { padding: 20px 24px !important; text-align: center !important; }
.gcr-progress-text { font-size: 14px !important; color: #f1f5f9 !important; margin-bottom: 12px !important; }

.gcr-progress-bar {
    width: 100% !important;
    height: 8px !important;
    background: #334155 !important;
    border-radius: 4px !important;
    overflow: hidden !important;
    margin-bottom: 12px !important;
}

.gcr-progress-fill {
    height: 100% !important;
    background: linear-gradient(90deg, #667eea, #f953c6) !important;
    transition: width 0.3s ease !important;
}

.gcr-progress-buttons {
    display: flex !important;
    justify-content: center !important;
    gap: 12px !important;
    margin-top: 16px !important;
}

.gcr-progress-buttons .gcr-btn {
    min-width: 100px !important;
    height: 44px !important;
}

.gcr-empty-state { text-align: center !important; padding: 40px 20px !important; color: #94a3b8 !important; }
.gcr-empty-icon { font-size: 48px !important; margin-bottom: 12px !important; }

.gcr-notification {
    position: fixed !important;
    bottom: 90px !important;
    right: 24px !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 14px 20px !important;
    background: #1e293b !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 14px !important;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3) !important;
    z-index: 2147483647 !important;
    max-width: 320px !important;
    animation: gcr-slideIn 0.3s ease !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}

@keyframes gcr-slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

.gcr-notification-success { border-left: 4px solid #10b981 !important; }
.gcr-notification-error { border-left: 4px solid #ef4444 !important; }
.gcr-notification-info { border-left: 4px solid #8b5cf6 !important; }
.gcr-notification-warning { border-left: 4px solid #f59e0b !important; }

.gcr-notification-icon { font-size: 20px !important; }
.gcr-notification-message { font-size: 14px !important; color: #f1f5f9 !important; }

/* ========== ENHANCED POPUP STYLES ========== */

/* Header */
.gcr-popup-header-left {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
}

.gcr-popup-logo {
    width: 36px !important;
    height: 36px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(255, 255, 255, 0.15) !important;
    border-radius: 10px !important;
    font-size: 20px !important;
}

.gcr-popup-header-info {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
}

.gcr-popup-header-title {
    font-size: 16px !important;
    font-weight: 700 !important;
    color: white !important;
    margin: 0 !important;
}

.gcr-popup-header-subtitle {
    font-size: 11px !important;
    color: rgba(255, 255, 255, 0.7) !important;
}

.gcr-popup-header-right {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
}

.gcr-popup-course-badge {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 6px 12px !important;
    background: rgba(255, 255, 255, 0.15) !important;
    border-radius: 20px !important;
    font-size: 11px !important;
    color: white !important;
    max-width: 140px !important;
}

.gcr-pulse-dot {
    width: 6px !important;
    height: 6px !important;
    background: #34d399 !important;
    border-radius: 50% !important;
    animation: gcr-pulse 2s ease-in-out infinite !important;
}

@keyframes gcr-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.3); }
}

.gcr-course-name {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
}

/* Toolbar */
.gcr-toolbar-row {
    display: flex !important;
    gap: 10px !important;
}

.gcr-search-wrapper {
    flex: 1 !important;
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 0 14px !important;
    height: 40px !important;
    background: rgba(30, 41, 59, 0.8) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 20px !important;
}

.gcr-search-wrapper:focus-within {
    border-color: #8b5cf6 !important;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2) !important;
}

.gcr-search-icon { font-size: 14px !important; opacity: 0.5 !important; }

.gcr-search-clear {
    width: 20px !important;
    height: 20px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(255, 255, 255, 0.1) !important;
    border: none !important;
    border-radius: 50% !important;
    color: #94a3b8 !important;
    font-size: 12px !important;
    cursor: pointer !important;
}

.gcr-search-clear:hover { background: rgba(255, 255, 255, 0.2) !important; color: white !important; }

/* Tabs */
.gcr-tabs-container { margin-top: 2px !important; }

.gcr-tabs {
    display: flex !important;
    gap: 3px !important;
    background: rgba(30, 41, 59, 0.5) !important;
    padding: 3px !important;
    border-radius: 8px !important;
}

.gcr-tab {
    flex: 1 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 3px !important;
    padding: 5px 6px !important;
    background: transparent !important;
    border: none !important;
    border-radius: 6px !important;
    font-size: 10px !important;
    font-weight: 500 !important;
    color: #94a3b8 !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
}

.gcr-tab:hover { color: #f1f5f9 !important; background: rgba(255, 255, 255, 0.05) !important; }

.gcr-tab.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    color: white !important;
    font-weight: 600 !important;
}

.gcr-tab-count {
    padding: 2px 6px !important;
    background: rgba(255, 255, 255, 0.15) !important;
    border-radius: 10px !important;
    font-size: 10px !important;
}

.gcr-tab.active .gcr-tab-count { background: rgba(255, 255, 255, 0.25) !important; }

/* Filters Panel */
.gcr-filters-panel {
    margin-top: 8px !important;
    background: rgba(30, 41, 59, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 10px !important;
    overflow: hidden !important;
}

.gcr-filters-header {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 10px 14px !important;
    cursor: pointer !important;
}

.gcr-filters-header:hover { background: rgba(255, 255, 255, 0.03) !important; }

.gcr-filters-title { font-size: 12px !important; font-weight: 600 !important; color: #f1f5f9 !important; }

.gcr-filters-toggle {
    font-size: 10px !important;
    color: #64748b !important;
    transition: transform 0.2s ease !important;
}

.gcr-filters-panel.collapsed .gcr-filters-toggle { transform: rotate(-90deg) !important; }

.gcr-filters-content {
    padding: 0 14px 14px !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
}

.gcr-filters-panel.collapsed .gcr-filters-content { display: none !important; }

.gcr-filter-group { display: flex !important; flex-direction: column !important; gap: 8px !important; }

.gcr-filter-label {
    font-size: 10px !important;
    font-weight: 500 !important;
    color: #64748b !important;
    text-transform: uppercase !important;
    letter-spacing: 0.5px !important;
}

.gcr-filters { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }

.gcr-filter-pill {
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 6px 10px !important;
    background: rgba(30, 41, 59, 0.6) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 20px !important;
    font-size: 11px !important;
    color: #94a3b8 !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
}

.gcr-filter-pill:hover { background: rgba(51, 65, 85, 0.6) !important; color: #f1f5f9 !important; }

.gcr-filter-pill.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
    border-color: transparent !important;
    color: white !important;
}

.gcr-filter-count {
    padding: 1px 5px !important;
    background: rgba(255, 255, 255, 0.1) !important;
    border-radius: 8px !important;
    font-size: 10px !important;
}

.gcr-filter-pill.active .gcr-filter-count { background: rgba(255, 255, 255, 0.2) !important; }

/* Selection Row */
.gcr-selection-row {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    margin-top: 4px !important;
    padding-top: 6px !important;
    border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.gcr-selection-buttons { display: flex !important; gap: 8px !important; }

.gcr-btn-sm { padding: 6px 10px !important; font-size: 11px !important; }

.gcr-selection-info { font-size: 12px !important; color: #94a3b8 !important; }

/* Hidden class - MUST use !important to override other styles */
.gcr-hidden { display: none !important; }

/* File Cards - Single Column Horizontal Rows */
.gcr-files-list {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
    padding: 4px !important;
}

.gcr-file-card {
    display: flex;
    align-items: center !important;
    gap: 8px !important;
    padding: 6px 10px !important;
    background: rgba(30, 41, 59, 0.5) !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
    border-radius: 6px !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
    width: 100% !important;
}

.gcr-file-card:hover {
    background: rgba(51, 65, 85, 0.6) !important;
}

/* Selected state with purple highlight */
.gcr-file-card.selected,
.gcr-file-card:has(.gcr-file-checkbox:checked) {
    background: rgba(139, 92, 246, 0.2) !important;
    border-color: rgba(139, 92, 246, 0.5) !important;
}

.gcr-file-checkbox {
    width: 18px !important;
    height: 18px !important;
    accent-color: #8b5cf6 !important;
    cursor: pointer !important;
    flex-shrink: 0 !important;
}

.gcr-file-icon {
    width: 26px !important;
    height: 26px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(60, 70, 90, 0.5) !important;
    border-radius: 6px !important;
    font-size: 14px !important;
    flex-shrink: 0 !important;
}

.gcr-type-pdf { background: rgba(239, 68, 68, 0.15) !important; }
.gcr-type-doc { background: rgba(59, 130, 246, 0.15) !important; }
.gcr-type-slides { background: rgba(245, 158, 11, 0.15) !important; }
.gcr-type-sheets { background: rgba(34, 197, 94, 0.15) !important; }
.gcr-type-image { background: rgba(168, 85, 247, 0.15) !important; }
.gcr-type-video { background: rgba(236, 72, 153, 0.15) !important; }
.gcr-type-link { background: rgba(139, 92, 246, 0.15) !important; }

.gcr-file-info { flex: 1 !important; min-width: 0 !important; }

.gcr-file-title {
    font-size: 13px !important;
    font-weight: 500 !important;
    color: #f1f5f9 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    margin-bottom: 2px !important;
}

.gcr-file-meta {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    font-size: 11px !important;
    color: #64748b !important;
}

.gcr-file-type {
    padding: 2px 6px !important;
    background: rgba(100, 116, 139, 0.2) !important;
    border-radius: 4px !important;
    font-size: 10px !important;
    font-weight: 500 !important;
}

.gcr-file-parent {
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
}

/* Footer */
.gcr-footer-info { display: flex !important; flex-direction: column !important; gap: 2px !important; }
.gcr-footer-selected { font-size: 14px !important; color: #f1f5f9 !important; }
.gcr-footer-selected strong { color: #8b5cf6 !important; }
.gcr-footer-hint { font-size: 11px !important; color: #64748b !important; }
.gcr-footer-actions { display: flex !important; gap: 8px !important; }
.gcr-btn-icon { width: 40px !important; height: 40px !important; padding: 0 !important; font-size: 16px !important; }
.gcr-btn:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }

/* Progress Overlay */
.gcr-progress-overlay {
    position: absolute !important;
    inset: 0 !important;
    background: rgba(15, 23, 42, 0.95) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 10 !important;
}

.gcr-progress-content {
    text-align: center !important;
    padding: 30px !important;
}

.gcr-progress-title {
    font-size: 18px !important;
    font-weight: 700 !important;
    color: #f1f5f9 !important;
    margin-bottom: 8px !important;
}
    `;

    document.head.appendChild(styleEl);
    console.log('[GCR Content] Styles injected');
}

// Inject styles immediately
injectStyles();

// ============================================================================
// STATE
// ============================================================================

let lastCourseId = null;
let lastUrl = '';
let detectionTimeout = null;
let isLoading = false;
let currentItemCount = 0;

// Navigation detection resources (for cleanup to prevent memory leaks)
let navigationObserver = null;
let pollingInterval = null;

// MEM-001: Listener registry for popup to prevent memory leaks
const popupListenerRegistry = {
    handlers: new Map(),
    
    /**
     * Adds a tracked event listener
     * @param {string} key - Unique key for this listener
     * @param {EventTarget} target - Event target
     * @param {string} event - Event type
     * @param {Function} handler - Event handler
     * @param {Object} options - Event listener options
     */
    add(key, target, event, handler, options = {}) {
        if (!target) return;
        target.addEventListener(event, handler, options);
        this.handlers.set(key, { target, event, handler, options });
    },
    
    /**
     * Removes a specific listener by key
     * @param {string} key - Listener key
     */
    remove(key) {
        const entry = this.handlers.get(key);
        if (entry) {
            entry.target.removeEventListener(entry.event, entry.handler, entry.options);
            this.handlers.delete(key);
        }
    },
    
    /**
     * Removes all registered listeners (call on popup close)
     */
    cleanup() {
        for (const [key, entry] of this.handlers) {
            try {
                entry.target.removeEventListener(entry.event, entry.handler, entry.options);
            } catch (e) {
                // ERR-002 FIX: Log listener cleanup failures with context
                console.debug('[GCR Content] Listener cleanup failed for', key, '- target may have been removed:', e.message || e);
            }
        }
        this.handlers.clear();
        console.log('[GCR Content] Popup listener registry cleaned up');
    }
};

// ============================================================================
// BUTTON CREATION & MANAGEMENT
// ============================================================================

/**
 * Creates and injects the floating download button (UI-002: Accessibility)
 */
function createDownloadButton() {
    // Remove existing button if any
    const existing = document.getElementById(BUTTON_ID);
    if (existing) {
        existing.remove();
    }

    // Create button container
    const button = document.createElement('div');
    button.id = BUTTON_ID;
    button.className = 'gcr-download-button';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-label', 'Open ClassMate download panel');
    button.innerHTML = `
    <div class="gcr-button-content">
      <svg class="gcr-download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span class="gcr-button-text">Download</span>
      <span id="${BADGE_ID}" class="gcr-badge gcr-badge-hidden" aria-live="polite">0</span>
    </div>
    <div class="gcr-loading-spinner gcr-hidden" aria-hidden="true">
      <div class="gcr-spinner"></div>
    </div>
  `;

    // Add click handler
    button.addEventListener('click', handleButtonClick);
    
    // UI-002: Add keyboard support for accessibility
    button.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleButtonClick();
        }
    });

    // Inject into page
    document.body.appendChild(button);

    console.log('[GCR Content] Download button injected');
}

/**
 * Updates the badge count on the button
 * @param {number|string} count - Count to display
 * @param {boolean} loading - Whether to show loading state
 */
function updateBadge(count, loading = false) {
    const badge = document.getElementById(BADGE_ID);
    const button = document.getElementById(BUTTON_ID);

    if (!badge || !button) return;

    const spinner = button.querySelector('.gcr-loading-spinner');
    const content = button.querySelector('.gcr-button-content');

    if (loading) {
        isLoading = true;
        badge.classList.add('gcr-badge-hidden');
        spinner?.classList.remove('gcr-hidden');
        content?.classList.add('gcr-loading');
        button.classList.add('gcr-loading');
    } else {
        isLoading = false;
        spinner?.classList.add('gcr-hidden');
        content?.classList.remove('gcr-loading');
        button.classList.remove('gcr-loading');

        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count.toString();
            badge.classList.remove('gcr-badge-hidden');
            currentItemCount = typeof count === 'number' ? count : parseInt(count) || 0;
        } else {
            badge.classList.add('gcr-badge-hidden');
            currentItemCount = 0;
        }
    }
}

/**
 * Shows an error state on the button (temporary)
 * @param {string} message - Error message
 */
function showButtonError(message) {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;

    button.classList.add('gcr-error');

    setTimeout(() => {
        button?.classList.remove('gcr-error');
    }, 3000);
}

// ============================================================================
// BUTTON CLICK HANDLER
// ============================================================================

/**
 * Handles download button click
 */
async function handleButtonClick() {
    console.log('[GCR Content] Button clicked');

    if (isLoading) {
        console.log('[GCR Content] Loading in progress, ignoring click');
        return;
    }

    // Send message to open popup
    try {
        const response = await sendMessage({ type: 'GET_CACHED_DATA' });

        if (!response.success) {
            console.error('[GCR Content] Failed to get cached data:', response.error);
            showNotification('Error loading data. Please try again.', 'error');
            return;
        }

        if (!response.data) {
            // No data cached - show message
            showNotification('No course data yet. Visit a course to start!', 'info');
            return;
        }

        // Open the popup with course data
        openPopup(response.data);

    } catch (error) {
        console.error('[GCR Content] Error handling click:', error);

        // Check if it's the extension context invalidated error
        if (error.message?.includes('Extension context invalidated') ||
            error.message?.includes('disconnected') ||
            error.message?.includes('runtime.sendMessage')) {
            showNotification('Extension reloaded. Please refresh this page.', 'warning');
        } else {
            showNotification('Error: ' + error.message, 'error');
        }
    }
}

// ============================================================================
// POPUP MODAL
// ============================================================================

/**
 * Opens the download selection popup
 * @param {Object} courseData - Course data to display
 */
function openPopup(courseData) {
    // Remove existing popup
    closePopup();

    // Store course data for filtering
    window.gcrCourseData = courseData;
    window.gcrCurrentFilter = 'all';
    window.gcrCurrentFormat = null;

    // Create popup overlay (UI-002: ARIA attributes for accessibility)
    const overlay = document.createElement('div');
    overlay.id = 'gcr-popup-overlay';
    overlay.className = 'gcr-popup-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'gcr-popup-title');

    // Create popup content
    const popup = document.createElement('div');
    popup.className = 'gcr-popup';
    popup.setAttribute('role', 'document');

    // Count items
    const allFiles = getAllFiles(courseData);
    console.log('[GCR Content] Files extracted:', allFiles.length, allFiles);
    const totalItems = allFiles.length;

    // Helper to check if file is a link type
    const isLinkType = (f) => f.type === 'link' || f.type === 'youtube' || f.type === 'form';

    // Exclude links from category counts (links have their own tab)
    const materialsCount = allFiles.filter(f => f.category === 'materials' && !isLinkType(f)).length;
    const announcementsCount = allFiles.filter(f => f.category === 'announcements' && !isLinkType(f)).length;
    const assignmentsCount = allFiles.filter(f => f.category === 'assignments' && !isLinkType(f)).length;
    const linksCount = allFiles.filter(isLinkType).length;
    const pdfsCount = allFiles.filter(f => f.type === 'pdf').length;
    const slidesCount = allFiles.filter(f => f.type === 'pptx').length;
    const docsCount = allFiles.filter(f => f.type === 'document').length;

    popup.innerHTML = `
    <!-- Header -->
    <div class="gcr-popup-header" role="banner">
      <div class="gcr-popup-header-left">
        <div class="gcr-popup-logo" aria-hidden="true">📚</div>
        <div class="gcr-popup-header-info">
          <h2 class="gcr-popup-header-title" id="gcr-popup-title">ClassMate</h2>
          <span class="gcr-popup-header-subtitle">Classroom Downloader</span>
        </div>
      </div>
      <div class="gcr-popup-header-right">
        <div class="gcr-popup-course-badge" aria-label="Current course">
          <span class="gcr-pulse-dot" aria-hidden="true"></span>
          <span class="gcr-course-name">${escapeHtml(courseData.courseName || 'Course')}</span>
        </div>
        <button class="gcr-popup-close" id="gcr-popup-close" title="Close" aria-label="Close popup" tabindex="0">✕</button>
      </div>
    </div>
    
    <!-- Toolbar -->
    <div class="gcr-popup-toolbar" role="toolbar" aria-label="File selection toolbar">
      <!-- Search Row -->
      <div class="gcr-toolbar-row">
        <div class="gcr-search-wrapper">
          <span class="gcr-search-icon" aria-hidden="true">🔍</span>
          <input type="text" class="gcr-search-input" id="gcr-search" placeholder="Search files..." aria-label="Search files" tabindex="0">
          <button class="gcr-search-clear gcr-hidden" id="gcr-search-clear" aria-label="Clear search" tabindex="0">✕</button>
        </div>
      </div>
      
      <!-- Tabs Row -->
      <div class="gcr-tabs-container">
        <div class="gcr-tabs" id="gcr-tabs" role="tablist" aria-label="File categories">
          <button class="gcr-tab active" data-filter="all" role="tab" aria-selected="true" tabindex="0">
            <span aria-hidden="true">📁</span> All
            <span class="gcr-tab-count" aria-label="${totalItems} files">${totalItems}</span>
          </button>
          <button class="gcr-tab" data-filter="materials" role="tab" aria-selected="false" tabindex="0">
            <span aria-hidden="true">📖</span> Materials
            <span class="gcr-tab-count" aria-label="${materialsCount} materials">${materialsCount}</span>
          </button>
          <button class="gcr-tab" data-filter="announcements" role="tab" aria-selected="false" tabindex="0">
            <span aria-hidden="true">📢</span> Announce
            <span class="gcr-tab-count" aria-label="${announcementsCount} announcements">${announcementsCount}</span>
          </button>
          <button class="gcr-tab" data-filter="assignments" role="tab" aria-selected="false" tabindex="0">
            <span aria-hidden="true">📝</span> Assign
            <span class="gcr-tab-count" aria-label="${assignmentsCount} assignments">${assignmentsCount}</span>
          </button>
          <button class="gcr-tab" data-filter="links" role="tab" aria-selected="false" tabindex="0">
            <span aria-hidden="true">🔗</span> Links
            <span class="gcr-tab-count" aria-label="${linksCount} links">${linksCount}</span>
          </button>
        </div>
      </div>
      
      <!-- Selection Row -->
      <div class="gcr-selection-row">
        <div class="gcr-selection-buttons" role="group" aria-label="Selection controls">
          <button class="gcr-btn gcr-btn-sm gcr-btn-secondary" id="gcr-select-all" aria-label="Select all visible files" tabindex="0">
            <span aria-hidden="true">☑️</span> Select All
          </button>
          <button class="gcr-btn gcr-btn-sm gcr-btn-secondary" id="gcr-deselect-all" aria-label="Deselect all files" tabindex="0">
            <span aria-hidden="true">☐</span> Deselect
          </button>
        </div>
        <div class="gcr-selection-info" id="gcr-selection-info" aria-live="polite">
          <span id="gcr-selected-count">0</span> files selected
        </div>
      </div>
    </div>
    
    <!-- Content -->
    <div class="gcr-popup-content" id="gcr-popup-content" role="list" aria-label="Files list">
      ${renderEnhancedFiles(allFiles)}
    </div>
    
    <!-- Footer -->
    <div class="gcr-popup-footer" role="contentinfo">
      <div class="gcr-footer-info" aria-live="polite">
        <span class="gcr-footer-selected"><strong id="gcr-footer-count">0</strong> files selected</span>
        <span class="gcr-footer-hint">Select files to download</span>
      </div>
      <div class="gcr-footer-actions" role="group" aria-label="Download actions">
        <button class="gcr-btn gcr-btn-icon gcr-btn-secondary" id="gcr-refresh-btn" title="Refresh" aria-label="Refresh course data" tabindex="0">
          🔄
        </button>
        <button class="gcr-btn gcr-btn-primary" id="gcr-download-btn" disabled aria-label="Download selected files" aria-disabled="true" tabindex="0">
          <span aria-hidden="true">📥</span> Download
        </button>
      </div>
    </div>
    
    <!-- Progress Overlay -->
    <div class="gcr-progress-overlay gcr-hidden" id="gcr-progress-container" role="dialog" aria-labelledby="gcr-progress-title" aria-modal="true">
      <div class="gcr-progress-content">
        <div class="gcr-progress-title" id="gcr-progress-title">Downloading...</div>
        <div class="gcr-progress-text" id="gcr-progress-text" aria-live="polite">Preparing files...</div>
        <div class="gcr-progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
          <div class="gcr-progress-fill" id="gcr-progress-fill"></div>
        </div>
        <div class="gcr-progress-buttons" role="group">
          <button class="gcr-btn gcr-btn-secondary" id="gcr-cancel-download" aria-label="Cancel download" tabindex="0">Cancel</button>
          <button class="gcr-btn gcr-btn-primary gcr-hidden" id="gcr-done-download" aria-label="Close progress dialog" tabindex="0">Done</button>
        </div>
      </div>
    </div>
  `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    // Store files reference
    window.gcrAllFiles = allFiles;

    // Attach event listeners
    attachEnhancedPopupListeners(courseData);

    // Initialize filter state
    window.gcrFilterState = {
        category: 'all',
        format: null,
        searchQuery: ''
    };

    // Start with nothing selected - user must explicitly select
    updateSelectedCount();
}

/**
 * Gets all files from course data as flat array WITH DEDUPLICATION
 */
function getAllFiles(data) {
    const files = [];
    const seenIds = new Set(); // Track seen IDs to prevent duplicates

    const processItems = (items, category) => {
        for (const item of items || []) {
            for (const att of item.attachments || []) {
                const fileId = att.id || Math.random().toString(36).substr(2, 9);

                // Skip duplicates
                if (seenIds.has(fileId)) {
                    console.log('[GCR Content] Skipping duplicate file:', att.title, 'id:', fileId);
                    continue;
                }
                seenIds.add(fileId);

                files.push({
                    id: fileId,
                    title: att.title || 'Untitled',
                    type: getFileType(att),
                    mimeType: att.mimeType || '',
                    category: category,
                    parentTitle: item.title || '',
                    url: att.url,
                    isLink: att.isLink,
                    original: att
                });
            }
        }
    };

    processItems(data.materials, 'materials');
    processItems(data.announcements, 'announcements');
    processItems(data.assignments, 'assignments');

    return files;
}

/**
 * Gets file type from attachment
 */
function getFileType(att) {
    if (att.type === 'youtube') return 'youtube';
    if (att.type === 'form') return 'form';
    if (att.type === 'link' || att.isLink) return 'link';

    const mime = (att.mimeType || '').toLowerCase();
    const title = (att.title || '').toLowerCase();

    // Check MIME type first
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('document') || mime.includes('word')) return 'document';
    if (mime.includes('presentation') || mime.includes('powerpoint')) return 'pptx';
    if (mime.includes('spreadsheet') || mime.includes('excel')) return 'xlsx';
    if (mime.includes('image')) return 'image';
    if (mime.includes('video')) return 'video';

    // Fallback: check file extension in title
    if (title.endsWith('.pdf')) return 'pdf';
    if (title.endsWith('.doc') || title.endsWith('.docx')) return 'document';
    if (title.endsWith('.ppt') || title.endsWith('.pptx')) return 'pptx';
    if (title.endsWith('.xls') || title.endsWith('.xlsx')) return 'xlsx';
    if (title.endsWith('.jpg') || title.endsWith('.png') || title.endsWith('.gif')) return 'image';
    if (title.endsWith('.mp4') || title.endsWith('.mov')) return 'video';

    return 'file';
}

/**
 * Gets format group for filtering
 */
function getFormatGroup(type) {
    const mapping = {
        'pdf': 'pdf',
        'document': 'docs', 'doc': 'docs', 'docx': 'docs',
        'pptx': 'slides', 'ppt': 'slides', 'presentation': 'slides',
        'xlsx': 'sheets', 'xls': 'sheets', 'spreadsheet': 'sheets',
        'link': 'links', 'youtube': 'links', 'form': 'links',
        'image': 'images', 'video': 'videos'
    };
    return mapping[type?.toLowerCase()] || 'other';
}

/**
 * Renders enhanced file cards (UI-002: Accessibility improvements)
 */
function renderEnhancedFiles(files) {
    if (!files || files.length === 0) {
        return `
      <div class="gcr-empty-state" role="status" aria-label="No files found">
        <div class="gcr-empty-icon" aria-hidden="true">📭</div>
        <p>No downloadable files found.</p>
      </div>
    `;
    }

    let html = '<div class="gcr-files-list" id="gcr-files-grid" role="list">';

    for (const file of files) {
        const icon = getFileIcon(file.type);
        const typeClass = getTypeClass(file.type);
        const formatGroup = getFormatGroup(file.type);
        const truncatedTitle = file.title.length > 35 ? file.title.substring(0, 32) + '...' : file.title;

        html += `
      <label class="gcr-file-card" data-id="${escapeHtml(file.id)}" data-category="${file.category}" data-type="${file.type}" data-format="${formatGroup}" title="${escapeHtml(file.title)}" role="listitem" tabindex="0">
        <input type="checkbox" class="gcr-file-checkbox" value="${escapeHtml(file.id)}" aria-label="Select ${escapeHtml(file.title)}">
        <div class="gcr-file-icon ${typeClass}" aria-hidden="true">${icon}</div>
        <div class="gcr-file-info">
          <div class="gcr-file-title">${escapeHtml(truncatedTitle)}</div>
          <div class="gcr-file-meta">
            <span class="gcr-file-type">${file.type.toUpperCase()}</span>
            <span class="gcr-meta-dot" aria-hidden="true">·</span>
            <span class="gcr-file-category">${file.category}</span>
          </div>
        </div>
      </label>
    `;
    }

    html += '</div>';
    return html;
}

/**
 * Gets file icon
 */
function getFileIcon(type) {
    const icons = {
        'pdf': '📄',
        'document': '📝',
        'pptx': '📊',
        'xlsx': '📊',
        'image': '🖼️',
        'video': '🎬',
        'youtube': '▶️',
        'link': '🔗',
        'form': '📋'
    };
    return icons[type] || '📁';
}

/**
 * Gets type CSS class
 */
function getTypeClass(type) {
    const classes = {
        'pdf': 'gcr-type-pdf',
        'document': 'gcr-type-doc',
        'pptx': 'gcr-type-slides',
        'xlsx': 'gcr-type-sheets',
        'image': 'gcr-type-image',
        'video': 'gcr-type-video',
        'youtube': 'gcr-type-video',
        'link': 'gcr-type-link'
    };
    return classes[type] || '';
}

/**
 * Closes the popup and cleans up all event listeners (MEM-001)
 */
function closePopup() {
    // MEM-001: Clean up all registered popup listeners to prevent memory leaks
    popupListenerRegistry.cleanup();
    
    // Clear popup-related global state
    window.gcrCourseData = null;
    window.gcrAllFiles = null;
    window.gcrFilterState = null;
    
    const overlay = document.getElementById('gcr-popup-overlay');
    if (overlay) {
        overlay.remove();
    }
}

/**
 * Counts downloadable items in course data
 * @param {Object} data - Course data
 * @returns {number} Total count
 */
function countDownloadableItems(data) {
    const seenIds = new Set(); // Track seen IDs to prevent counting duplicates
    let count = 0;

    const countInItems = (items) => {
        for (const item of items || []) {
            for (const att of item.attachments || []) {
                const fileId = att.id;
                if (fileId && seenIds.has(fileId)) {
                    continue; // Skip duplicates
                }
                if (fileId) seenIds.add(fileId);
                count++;
            }
        }
    };

    countInItems(data.assignments);
    countInItems(data.materials);
    countInItems(data.announcements);

    return count;
}

/**
 * Categorizes items by type
 * @param {Object} data - Course data
 * @returns {Object} Categorized items
 */
function categorizeItems(data) {
    return {
        assignments: {
            title: '📝 Assignments',
            items: data.assignments || [],
            icon: '📝'
        },
        materials: {
            title: '📖 Materials & Slides',
            items: data.materials || [],
            icon: '📖'
        },
        announcements: {
            title: '📢 Announcements',
            items: data.announcements || [],
            icon: '📢'
        }
    };
}

/**
 * Renders category sections
 * @param {Object} categories - Categorized items
 * @returns {string} HTML string
 */
function renderCategories(categories) {
    let html = '';

    for (const [key, category] of Object.entries(categories)) {
        if (!category.items || category.items.length === 0) continue;

        const attachmentCount = category.items.reduce((sum, item) =>
            sum + (item.attachments?.length || 0), 0
        );

        if (attachmentCount === 0) continue;

        html += `
      <div class="gcr-category" data-category="${key}">
        <div class="gcr-category-header">
          <span class="gcr-category-title">${category.title}</span>
          <span class="gcr-category-count">${attachmentCount} files</span>
        </div>
        <div class="gcr-category-items">
          ${renderCategoryItems(category.items)}
        </div>
      </div>
    `;
    }

    if (!html) {
        html = `
      <div class="gcr-empty-state">
        <div class="gcr-empty-icon">📭</div>
        <p>No downloadable files found in this course.</p>
      </div>
    `;
    }

    return html;
}

/**
 * Renders items within a category
 * @param {Array} items - Items array
 * @returns {string} HTML string
 */
function renderCategoryItems(items) {
    let html = '';

    for (const item of items) {
        if (!item.attachments || item.attachments.length === 0) continue;

        html += `
      <div class="gcr-item">
        <div class="gcr-item-header">${escapeHtml(item.title)}</div>
        <div class="gcr-attachments">
          ${renderAttachments(item.attachments)}
        </div>
      </div>
    `;
    }

    return html;
}

/**
 * Renders attachment checkboxes
 * @param {Array} attachments - Attachments array
 * @returns {string} HTML string
 */
function renderAttachments(attachments) {
    let html = '';

    for (const attachment of attachments) {
        const icon = getAttachmentIcon(attachment);
        const id = attachment.id || attachment.url || Math.random().toString(36);
        const isLink = attachment.isLink;
        const typeLabel = isLink ? `(${attachment.type})` : '';

        html += `
      <label class="gcr-attachment" data-id="${escapeHtml(id)}" data-is-link="${isLink}">
        <input type="checkbox" class="gcr-checkbox" value="${escapeHtml(id)}" checked>
        <span class="gcr-attachment-icon">${icon}</span>
        <span class="gcr-attachment-title">${escapeHtml(attachment.title)} ${typeLabel}</span>
      </label>
    `;
    }

    return html;
}

/**
 * Gets icon for attachment type
 * @param {Object} attachment - Attachment object
 * @returns {string} Emoji icon
 */
function getAttachmentIcon(attachment) {
    if (attachment.type === 'youtube') return '▶️';
    if (attachment.type === 'form') return '📋';
    if (attachment.type === 'link') return '🔗';

    const mimeType = attachment.mimeType || '';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('video')) return '🎬';
    if (mimeType.includes('audio')) return '🎵';

    return '📁';
}

/**
 * @deprecated Since v1.0.4 - Use attachEnhancedPopupListeners() instead
 * Legacy popup listener attachment using .gcr-checkbox
 * Kept for potential rollback compatibility only
 * @param {Object} courseData - Course data
 * @see attachEnhancedPopupListeners
 */
function attachPopupListeners(courseData) {
    console.warn('[GCR Content] attachPopupListeners is deprecated, use attachEnhancedPopupListeners');
    // Close button
    document.getElementById('gcr-popup-close')?.addEventListener('click', closePopup);

    // Click outside to close
    document.getElementById('gcr-popup-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'gcr-popup-overlay') {
            closePopup();
        }
    });

    // Escape key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closePopup();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    // Select all
    document.getElementById('gcr-select-all')?.addEventListener('click', () => {
        document.querySelectorAll('.gcr-checkbox').forEach(cb => {
            cb.checked = true;
        });
        updateSelectedCount();
    });

    // Deselect all
    document.getElementById('gcr-deselect-all')?.addEventListener('click', () => {
        document.querySelectorAll('.gcr-checkbox').forEach(cb => {
            cb.checked = false;
        });
        updateSelectedCount();
    });

    // Search
    document.getElementById('gcr-search')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        // Filter attachments
        document.querySelectorAll('.gcr-attachment').forEach(el => {
            const title = el.querySelector('.gcr-attachment-title')?.textContent?.toLowerCase() || '';
            const matches = !query || title.includes(query);
            el.style.display = matches ? '' : 'none';
        });

        // Hide empty item containers (gcr-item)
        document.querySelectorAll('.gcr-item').forEach(item => {
            const header = item.querySelector('.gcr-item-header')?.textContent?.toLowerCase() || '';
            const visibleAttachments = item.querySelectorAll('.gcr-attachment:not([style*="display: none"])');

            // Show if header matches OR has visible attachments
            if (!query || header.includes(query) || visibleAttachments.length > 0) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });

        // Hide empty categories
        document.querySelectorAll('.gcr-category').forEach(category => {
            const visibleItems = category.querySelectorAll('.gcr-item:not([style*="display: none"])');
            const visibleAttachments = category.querySelectorAll('.gcr-attachment:not([style*="display: none"])');
            category.style.display = (visibleItems.length > 0 || visibleAttachments.length > 0) ? '' : 'none';
        });
    });

    // Checkbox changes
    document.querySelectorAll('.gcr-checkbox').forEach(cb => {
        cb.addEventListener('change', updateSelectedCount);
    });

    // Refresh button
    document.getElementById('gcr-refresh-btn')?.addEventListener('click', async () => {
        closePopup();
        const courseId = getCurrentCourseId();
        if (courseId) {
            await fetchCourseData(courseId);
        }
    });

    // Download button
    document.getElementById('gcr-download-btn')?.addEventListener('click', () => {
        startDownload();
    });

    // Cancel download
    document.getElementById('gcr-cancel-download')?.addEventListener('click', () => {
        cancelDownload();
    });
}

/**
 * Updates the selected count display (UI-002: Accessibility updates)
 */
function updateSelectedCount() {
    const checked = document.querySelectorAll('.gcr-file-checkbox:checked').length;
    const countEl = document.getElementById('gcr-selected-count');
    const footerCount = document.getElementById('gcr-footer-count');
    const downloadBtn = document.getElementById('gcr-download-btn');

    if (countEl) countEl.textContent = checked.toString();
    if (footerCount) footerCount.textContent = checked.toString();
    if (downloadBtn) {
        downloadBtn.disabled = checked === 0;
        // UI-002: Update ARIA disabled state
        downloadBtn.setAttribute('aria-disabled', String(checked === 0));
        downloadBtn.setAttribute('aria-label', `Download ${checked} selected files`);
    }
}

/**
 * Selects all visible files
 */
function selectAllFiles() {
    document.querySelectorAll('.gcr-file-checkbox').forEach(cb => {
        cb.checked = true;
    });
}

/**
 * Attaches enhanced event listeners for premium popup with proper cleanup (MEM-001)
 * Uses popupListenerRegistry to track all listeners for cleanup on close
 */
function attachEnhancedPopupListeners(courseData) {
    const closeBtn = document.getElementById('gcr-popup-close');
    const overlay = document.getElementById('gcr-popup-overlay');
    const selectAllBtn = document.getElementById('gcr-select-all');
    const deselectAllBtn = document.getElementById('gcr-deselect-all');
    const searchInput = document.getElementById('gcr-search');
    const searchClear = document.getElementById('gcr-search-clear');
    const refreshBtn = document.getElementById('gcr-refresh-btn');
    const downloadBtn = document.getElementById('gcr-download-btn');
    const cancelBtn = document.getElementById('gcr-cancel-download');
    const doneBtn = document.getElementById('gcr-done-download');
    
    // MEM-001: Use registry for all listeners
    
    // Close button
    popupListenerRegistry.add('closeBtn', closeBtn, 'click', closePopup);

    // Click outside to close
    const overlayClickHandler = (e) => {
        if (e.target.id === 'gcr-popup-overlay') {
            closePopup();
        }
    };
    popupListenerRegistry.add('overlayClick', overlay, 'click', overlayClickHandler);

    // Escape key (on document - must be tracked!)
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closePopup();
        }
    };
    popupListenerRegistry.add('escKey', document, 'keydown', escHandler);
    
    // HIGH-023 FIX: Focus trap for modal accessibility
    const focusTrapHandler = (e) => {
        if (e.key !== 'Tab') return;
        
        const popup = document.querySelector('.gcr-popup');
        if (!popup) return;
        
        const focusableElements = popup.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex=\"-1\"])'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];
        
        if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable?.focus();
            }
        } else {
            // Tab
            if (document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable?.focus();
            }
        }
    };
    popupListenerRegistry.add('focusTrap', document, 'keydown', focusTrapHandler);
    
    // Focus the close button when popup opens (accessibility)
    closeBtn?.focus();

    // Select all VISIBLE files only
    const selectAllHandler = () => {
        document.querySelectorAll('.gcr-file-checkbox').forEach(cb => {
            const card = cb.closest('.gcr-file-card');
            if (card && !card.classList.contains('gcr-hidden')) {
                cb.checked = true;
                card.classList.add('selected');
            }
        });
        updateSelectedCount();
    };
    popupListenerRegistry.add('selectAll', selectAllBtn, 'click', selectAllHandler);

    // Deselect all
    const deselectAllHandler = () => {
        document.querySelectorAll('.gcr-file-checkbox').forEach(cb => {
            cb.checked = false;
            const card = cb.closest('.gcr-file-card');
            if (card) card.classList.remove('selected');
        });
        updateSelectedCount();
    };
    popupListenerRegistry.add('deselectAll', deselectAllBtn, 'click', deselectAllHandler);

    // Search with clear button
    const searchHandler = (e) => {
        const query = e.target.value.toLowerCase().trim();

        // Show/hide clear button
        if (searchClear) {
            searchClear.classList.toggle('gcr-hidden', !query);
        }

        filterFiles();
    };
    popupListenerRegistry.add('searchInput', searchInput, 'input', searchHandler);

    const searchClearHandler = () => {
        if (searchInput) {
            searchInput.value = '';
            searchClear.classList.add('gcr-hidden');
            filterFiles();
        }
    };
    popupListenerRegistry.add('searchClear', searchClear, 'click', searchClearHandler);

    // Tab clicks (category filter) - MEM-001: track each tab listener
    document.querySelectorAll('.gcr-tab').forEach((tab, index) => {
        const tabHandler = () => {
            // Update active state and ARIA (UI-002)
            document.querySelectorAll('.gcr-tab').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');

            // CLEAR all selections when switching tabs (prevent accumulation)
            document.querySelectorAll('.gcr-file-checkbox').forEach(cb => {
                cb.checked = false;
                const card = cb.closest('.gcr-file-card');
                if (card) card.classList.remove('selected');
            });

            // Set filter state
            if (!window.gcrFilterState) window.gcrFilterState = { category: 'all', searchQuery: '' };
            window.gcrFilterState.category = tab.dataset.filter;
            filterFiles();
            updateSelectedCount();
        };
        popupListenerRegistry.add(`tab-${index}`, tab, 'click', tabHandler);
    });

    // File card checkbox changes - MEM-001: track each checkbox listener
    document.querySelectorAll('.gcr-file-checkbox').forEach((cb, index) => {
        const checkboxHandler = () => {
            const card = cb.closest('.gcr-file-card');
            if (card) {
                card.classList.toggle('selected', cb.checked);
            }
            updateSelectedCount();
        };
        popupListenerRegistry.add(`checkbox-${index}`, cb, 'change', checkboxHandler);
    });

    // Refresh button
    const refreshHandler = async () => {
        closePopup();
        const courseId = getCurrentCourseId();
        if (courseId) {
            await fetchCourseData(courseId);
        }
    };
    popupListenerRegistry.add('refreshBtn', refreshBtn, 'click', refreshHandler);

    // Download button
    const downloadHandler = () => {
        startEnhancedDownload();
    };
    popupListenerRegistry.add('downloadBtn', downloadBtn, 'click', downloadHandler);

    // Cancel download - stop download and close overlay
    const cancelHandler = () => {
        cancelDownload();
        closeProgressOverlay();
    };
    popupListenerRegistry.add('cancelBtn', cancelBtn, 'click', cancelHandler);

    // Done button - closes progress overlay and returns to file list
    const doneHandler = () => {
        closeProgressOverlay();
    };
    popupListenerRegistry.add('doneBtn', doneBtn, 'click', doneHandler);
}

/**
 * Filters files based on category tab and search query
 */
function filterFiles() {
    const state = window.gcrFilterState || { category: 'all', searchQuery: '' };
    const query = document.getElementById('gcr-search')?.value.toLowerCase().trim() || '';
    state.searchQuery = query;

    const cards = Array.from(document.querySelectorAll('.gcr-file-card'));
    const container = document.querySelector('.gcr-files-list');

    let visibleCount = 0;
    let totalInCategory = 0;
    const matchingCards = [];
    const nonMatchingCards = [];

    cards.forEach(card => {
        const cardCategory = card.dataset.category;
        const cardType = card.dataset.type;
        const cardTitle = card.querySelector('.gcr-file-title')?.textContent?.toLowerCase() || '';

        // Check category - 'links' is a special case that checks type instead
        const isLink = cardType === 'link' || cardType === 'youtube' || cardType === 'form';
        let inCategory;

        if (state.category === 'all') {
            inCategory = true;
        } else if (state.category === 'links') {
            // Links filter matches by TYPE, not parent category
            inCategory = isLink;
        } else {
            // For materials/announcements/assignments, exclude links (they go in Links tab)
            inCategory = cardCategory === state.category && !isLink;
        }

        if (!inCategory) {
            card.classList.add('gcr-hidden');
            return;
        }

        totalInCategory++;

        // Then check search
        const matchesSearch = !query || cardTitle.includes(query);

        if (!matchesSearch) {
            card.classList.add('gcr-hidden');
            return;
        }

        // Show this card
        card.classList.remove('gcr-hidden');
        visibleCount++;

        // For reordering: matches go first
        if (query && cardTitle.includes(query)) {
            matchingCards.push(card);
        } else {
            nonMatchingCards.push(card);
        }
    });

    // Reorder: search matches first
    if (container && query && matchingCards.length > 0) {
        matchingCards.forEach(card => container.prepend(card));
    }

    // Update counter
    const selectionInfo = document.getElementById('gcr-selection-info');
    if (selectionInfo) {
        if (query) {
            selectionInfo.textContent = `${visibleCount} of ${totalInCategory} match "${query}"`;
        } else if (state.category !== 'all') {
            selectionInfo.textContent = `${visibleCount} ${state.category} files`;
        } else {
            selectionInfo.textContent = `${visibleCount} files available`;
        }
    }

    updateSelectedCount();
}

/**
 * Updates the filter results UI indicator
 */
function updateFilterResultsUI(visible, total, query) {
    let indicator = document.getElementById('gcr-filter-results');
    const selectionInfo = document.getElementById('gcr-selection-info');

    if (selectionInfo) {
        if (visible === total && !query) {
            selectionInfo.textContent = `${total} files available`;
        } else if (query) {
            selectionInfo.textContent = `${visible} of ${total} match "${query}"`;
        } else {
            selectionInfo.textContent = `Showing ${visible} of ${total} files`;
        }
    }
}

/**
 * Download lock to prevent duplicate clicks
 */
let isDownloadPending = false;

/**
 * Starts enhanced download process
 */
async function startEnhancedDownload() {
    // Prevent duplicate clicks
    if (isDownloadPending) {
        console.log('[GCR Content] Download already pending, ignoring duplicate click');
        return;
    }
    isDownloadPending = true;

    // Collect file IDs (NOT full objects - background.js expects IDs)
    const selectedIds = [];

    document.querySelectorAll('.gcr-file-checkbox:checked').forEach(cb => {
        const card = cb.closest('.gcr-file-card');
        if (card) {
            const fileId = card.dataset.id;
            if (fileId) {
                selectedIds.push(fileId);
            }
        }
    });

    if (selectedIds.length === 0) {
        showNotification('No files selected! Please check some files first.', 'warning');
        isDownloadPending = false;
        return;
    }

    const progressContainer = document.getElementById('gcr-progress-container');
    const progressText = document.getElementById('gcr-progress-text');
    const progressFill = document.getElementById('gcr-progress-fill');
    const downloadBtn = document.getElementById('gcr-download-btn');
    const refreshBtn = document.getElementById('gcr-refresh-btn');
    const cancelBtn = document.getElementById('gcr-cancel-download');
    const doneBtn = document.getElementById('gcr-done-download');

    // Reset progress UI - use classList for gcr-hidden
    if (progressContainer) progressContainer.classList.remove('gcr-hidden');
    if (progressText) progressText.textContent = `Starting download of ${selectedIds.length} files...`;
    if (progressFill) progressFill.style.width = '0%';
    if (downloadBtn) downloadBtn.disabled = true;
    if (refreshBtn) refreshBtn.disabled = true;

    // Reset buttons: Cancel visible, Done hidden
    if (cancelBtn) cancelBtn.classList.remove('gcr-hidden');
    if (doneBtn) doneBtn.classList.add('gcr-hidden');

    try {
        console.log('[GCR Content] Sending download request for', selectedIds.length, 'files');
        console.log('[GCR Content] Selected IDs:', selectedIds);
        const response = await sendMessage({
            type: 'DOWNLOAD_FILES',
            selectedItems: selectedIds  // Array of IDs, not objects
        });

        console.log('[GCR Content] Download response:', response);

        if (response.success) {
            // Monitor progress and get final stats (not the initial response!)
            const finalStats = await monitorDownloadProgress(response.total || selectedIds.length);
            showNotification(
                `Download complete! ${finalStats.completed}/${finalStats.total} files downloaded.`,
                finalStats.failed > 0 ? 'warning' : 'success'
            );
            // Don't close overlay here - Done button will close it
        } else {
            showNotification('Download failed: ' + (response.error || 'Unknown error'), 'error');
            closeProgressOverlay();
        }
    } catch (error) {
        console.error('[GCR Content] Download error:', error);
        showNotification('Download error: ' + error.message, 'error');
        closeProgressOverlay();
    } finally {
        // Reset download lock after completion/error
        isDownloadPending = false;
    }
}

/**
 * @deprecated Since v1.0.4 - Use startEnhancedDownload() instead
 * Legacy download process using .gcr-checkbox selectors
 * Kept for potential rollback compatibility only
 * @see startEnhancedDownload
 */
async function startDownload() {
    console.warn('[GCR Content] startDownload is deprecated, use startEnhancedDownload');
    const selected = Array.from(document.querySelectorAll('.gcr-checkbox:checked'))
        .map(cb => cb.value);

    if (selected.length === 0) {
        showNotification('Please select at least one file to download.', 'warning');
        return;
    }

    // Show progress
    const progressContainer = document.getElementById('gcr-progress-container');
    const downloadBtn = document.getElementById('gcr-download-btn');
    const refreshBtn = document.getElementById('gcr-refresh-btn');

    progressContainer?.classList.remove('gcr-hidden');
    if (downloadBtn) downloadBtn.disabled = true;
    if (refreshBtn) refreshBtn.disabled = true;

    try {
        const response = await sendMessage({
            type: 'DOWNLOAD_FILES',
            selectedItems: selected
        });

        if (response.success) {
            // Monitor progress
            await monitorDownloadProgress();

            showNotification(
                `Download complete! ${response.completed}/${response.total} files downloaded.`,
                response.failed > 0 ? 'warning' : 'success'
            );
        } else {
            showNotification('Download failed: ' + response.error, 'error');
        }
    } catch (error) {
        showNotification('Download error: ' + error.message, 'error');
    } finally {
        progressContainer?.classList.add('gcr-hidden');
        if (downloadBtn) downloadBtn.disabled = false;
        if (refreshBtn) refreshBtn.disabled = false;
    }
}

/**
 * Monitors download progress with timeout protection
 * @param {number} totalFiles - Total number of files to download
 * @returns {Object} Final stats: { completed, failed, total }
 */
async function monitorDownloadProgress(totalFiles) {
    const MAX_MONITOR_TIME = 30 * 60 * 1000;  // 30 minutes max for large downloads
    const POLL_INTERVAL = 300;  // Poll more frequently (300ms instead of 500ms)
    const startTime = Date.now();

    const progressFill = document.getElementById('gcr-progress-fill');
    const progressText = document.getElementById('gcr-progress-text');
    const cancelBtn = document.getElementById('gcr-cancel-download');
    const doneBtn = document.getElementById('gcr-done-download');

    let lastCompleted = 0;
    let finalStats = { completed: 0, failed: 0, total: totalFiles };

    while (true) {
        // Timeout protection
        if (Date.now() - startTime > MAX_MONITOR_TIME) {
            if (progressText) progressText.textContent = 'Download timed out';
            showDoneButton(cancelBtn, doneBtn);
            return finalStats;  // Return whatever we have
        }

        try {
            const response = await Promise.race([
                sendMessage({ type: 'GET_DOWNLOAD_PROGRESS' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);

            if (!response.success) {
                console.warn('[GCR Content] Progress check failed:', response.error);
                await new Promise(r => setTimeout(r, POLL_INTERVAL));
                continue;
            }

            // Always update finalStats with latest data
            finalStats = {
                completed: response.completed || 0,
                failed: response.failed || 0,
                total: response.total || totalFiles
            };

            if (!response.active) {
                // Download complete - show Done button
                if (progressFill) {
                    progressFill.style.width = '100%';
                    // UI-002: Update ARIA progress
                    const progressBar = progressFill.parentElement;
                    if (progressBar) progressBar.setAttribute('aria-valuenow', '100');
                }
                if (progressText) progressText.textContent = `Download complete! ${finalStats.completed}/${finalStats.total} files`;
                showDoneButton(cancelBtn, doneBtn);
                return finalStats;  // Return final stats
            }

            // Update progress UI
            const completed = response.completed || 0;
            const total = response.total || totalFiles || 1;
            const percent = Math.round((completed / total) * 100);
            const currentFile = response.currentFile || '';

            // Force UI update
            if (progressFill) {
                progressFill.style.width = `${percent}%`;
                progressFill.style.transition = 'width 0.3s ease';
                // UI-002: Update ARIA progress value
                const progressBar = progressFill.parentElement;
                if (progressBar) progressBar.setAttribute('aria-valuenow', String(percent));
            }

            // Show current file being downloaded
            if (progressText) {
                const truncatedFile = currentFile.length > 30 ? currentFile.substring(0, 27) + '...' : currentFile;
                if (currentFile) {
                    progressText.textContent = `Downloading ${completed}/${total} - ${truncatedFile}`;
                } else {
                    progressText.textContent = `Downloading ${completed}/${total} files... (${percent}%)`;
                }
            }

            // Log progress for debugging
            if (completed !== lastCompleted) {
                console.log(`[GCR Content] Progress: ${completed}/${total} (${percent}%) - ${currentFile}`);
                lastCompleted = completed;
            }

        } catch (error) {
            console.warn('[GCR Content] Progress check failed:', error.message);
        }

        await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
}

/**
 * Shows Done button and hides Cancel button
 */
function showDoneButton(cancelBtn, doneBtn) {
    if (cancelBtn) cancelBtn.classList.add('gcr-hidden');
    if (doneBtn) doneBtn.classList.remove('gcr-hidden');
}

/**
 * Closes progress overlay and returns to file list
 */
function closeProgressOverlay() {
    const progressContainer = document.getElementById('gcr-progress-container');
    const downloadBtn = document.getElementById('gcr-download-btn');
    const refreshBtn = document.getElementById('gcr-refresh-btn');

    // Hide progress overlay using class
    if (progressContainer) progressContainer.classList.add('gcr-hidden');

    // Re-enable buttons
    if (downloadBtn) downloadBtn.disabled = false;
    if (refreshBtn) refreshBtn.disabled = false;
}

/**
 * Cancels the download
 */
async function cancelDownload() {
    await sendMessage({ type: 'CANCEL_DOWNLOADS' });
    showNotification('Download cancelled.', 'info');
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Shows a toast notification
 * @param {string} message - Message to show
 * @param {string} type - Type: success, error, warning, info
 */
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.gcr-notification');
    if (existing) {
        existing.remove();
    }

    const notification = document.createElement('div');
    notification.className = `gcr-notification gcr-notification-${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    notification.innerHTML = `
    <span class="gcr-notification-icon">${icons[type] || icons.info}</span>
    <span class="gcr-notification-message">${escapeHtml(message)}</span>
  `;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('gcr-notification-hide');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// ============================================================================
// COURSE DETECTION
// ============================================================================

/**
 * Decodes a base64-encoded course ID to numeric format
 * Google Classroom URLs use base64-encoded IDs, but the API needs numeric IDs
 * HIGH-019 FIX: Added base64 format validation before attempting decode
 * @param {string} encodedId - Base64 encoded course ID from URL
 * @returns {string} Numeric course ID for API
 */
function decodeCourseId(encodedId) {
    // VAL-003: Validate input before processing
    if (!encodedId || typeof encodedId !== 'string') {
        console.warn('[GCR Content] Invalid course ID input');
        return '';
    }
    
    // Sanitize: remove any potentially dangerous characters
    const sanitizedId = encodedId.replace(/[^a-zA-Z0-9_=-]/g, '');
    
    // Check for maximum reasonable length (course IDs shouldn't be huge)
    if (sanitizedId.length > 100) {
        console.warn('[GCR Content] Course ID too long, truncating');
        return '';
    }
    
    // HIGH-019 FIX: Validate base64 format before attempting decode
    // Valid base64 only contains A-Za-z0-9+/= (but URLs use _ and - instead of + and /)
    const base64Regex = /^[A-Za-z0-9_=-]+$/;
    if (!base64Regex.test(sanitizedId)) {
        console.log('[GCR Content] Course ID not valid base64 format, using as-is');
        return sanitizedId;
    }
    
    try {
        // HIGH-019 FIX: Replace URL-safe base64 chars before decoding
        const standardBase64 = sanitizedId.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        const paddedBase64 = standardBase64 + '=='.slice(0, (4 - standardBase64.length % 4) % 4);
        
        // Try to decode as base64
        const decoded = atob(paddedBase64);
        // Check if result is a valid number
        if (/^\d+$/.test(decoded)) {
            console.log('[GCR Content] Decoded course ID:', sanitizedId, '->', decoded);
            return decoded;
        }
    } catch (e) {
        // Not valid base64, might already be numeric
        console.log('[GCR Content] Course ID decode failed, using as-is:', sanitizedId, e.message);
    }

    // If already numeric or decoding failed, return sanitized version
    return sanitizedId;
}

/**
 * Gets current course ID from URL
 * @returns {string|null} Course ID or null
 */
function getCurrentCourseId() {
    const url = window.location.href;

    // Pattern: /c/COURSE_ID or /u/X/c/COURSE_ID
    const match = url.match(/\/c\/([^\/\?]+)/);
    if (match) {
        const rawId = match[1];
        // Decode base64 to numeric ID for API
        return decodeCourseId(rawId);
    }

    return null;
}

/**
 * Checks if on main/dashboard page
 * @returns {boolean} True if on main page
 */
function isOnMainPage() {
    const path = window.location.pathname;
    return path === '/' ||
        path === '/u/0/' ||
        path === '/u/1/' ||
        path === '/h' ||
        /^\/u\/\d+\/?$/.test(path);
}

/**
 * Handles URL/course change detection
 */
function handleUrlChange() {
    const currentUrl = window.location.href;

    // Skip if URL hasn't changed
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;

    // Clear any pending detection
    if (detectionTimeout) {
        clearTimeout(detectionTimeout);
    }

    // Debounce to handle rapid navigation
    detectionTimeout = setTimeout(async () => {
        const currentCourseId = getCurrentCourseId();

        console.log('[GCR Content] URL change detected:', {
            currentCourseId,
            lastCourseId,
            isMainPage: isOnMainPage()
        });

        if (currentCourseId) {
            // On a course page
            if (currentCourseId !== lastCourseId) {
                // New course - fetch data
                console.log('[GCR Content] New course detected, fetching data');
                lastCourseId = currentCourseId;
                await fetchCourseData(currentCourseId);
            }
        } else if (isOnMainPage()) {
            // On main page - keep last course data
            console.log('[GCR Content] On main page, retaining data');
            // Badge should still show last course's count
        }
    }, DETECTION_DEBOUNCE_MS);
}

/**
 * Fetches course data from API
 * @param {string} courseId - Course ID to fetch
 */
async function fetchCourseData(courseId) {
    console.log('[GCR Content] Fetching course data:', courseId);

    // Show loading state
    updateBadge(0, true);

    try {
        const response = await sendMessage({
            type: 'FETCH_COURSE_DATA',
            courseId
        });

        if (response.success && response.data) {
            console.log('[GCR Content] Course data fetched:', response.data.totalItems, 'items');
            updateBadge(response.data.totalItems);
        } else {
            console.error('[GCR Content] Fetch failed:', response.error);
            updateBadge(0);
            showNotification('Failed to load course data. ' + (response.error || ''), 'error');
        }
    } catch (error) {
        console.error('[GCR Content] Fetch error:', error);
        updateBadge(0);
        showNotification('Error loading course data.', 'error');
    }
}

// ============================================================================
// MESSAGE PASSING
// ============================================================================

/**
 * Sends a message to the background script with robust error handling
 * Includes timeout protection and graceful error recovery
 * @param {Object} message - Message to send
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30s)
 * @returns {Promise<Object>} Response
 */
function sendMessage(message, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        // Timeout protection for long operations
        const timeoutId = setTimeout(() => {
            reject(new Error('Message timeout - background script not responding'));
        }, timeoutMs);
        
        try {
            // Check if extension context is valid before sending
            if (!chrome.runtime?.id) {
                clearTimeout(timeoutId);
                reject(new Error('Extension context invalidated. Please refresh the page.'));
                return;
            }
            
            chrome.runtime.sendMessage(message, (response) => {
                clearTimeout(timeoutId);
                
                if (chrome.runtime.lastError) {
                    const errorMsg = chrome.runtime.lastError.message || 'Unknown error';
                    
                    // Provide user-friendly error messages
                    if (errorMsg.includes('Extension context invalidated')) {
                        reject(new Error('Extension was updated. Please refresh this page.'));
                    } else if (errorMsg.includes('Could not establish connection')) {
                        reject(new Error('Extension not ready. Please wait and try again.'));
                    } else {
                        reject(new Error(errorMsg));
                    }
                    return;
                }
                
                resolve(response || { success: false, error: 'No response from background' });
            });
        } catch (error) {
            clearTimeout(timeoutId);
            reject(error);
        }
    });
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Escapes HTML special characters to prevent XSS
 * Uses DOM-based escaping which is more secure than regex
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for innerHTML
 */
function escapeHtml(str) {
    if (!str) return '';
    if (typeof str !== 'string') {
        // Convert to string safely
        try {
            str = String(str);
        } catch (e) {
            return '';
        }
    }
    
    // Limit length to prevent DoS
    if (str.length > 10000) {
        str = str.substring(0, 10000) + '...';
    }
    
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Sets up navigation detection
 */
function setupNavigationDetection() {
    // Method 1: History API interception
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
        const result = originalPushState.apply(this, args);
        handleUrlChange();
        return result;
    };

    history.replaceState = function (...args) {
        const result = originalReplaceState.apply(this, args);
        handleUrlChange();
        return result;
    };

    // Method 2: popstate (back/forward)
    window.addEventListener('popstate', handleUrlChange);

    // Method 3: MutationObserver for SPA (stored globally for cleanup)
    // HIGH-013 FIX: Throttle MutationObserver callbacks to prevent performance issues
    let mutationThrottleTimeout = null;
    const throttledUrlChange = () => {
        if (mutationThrottleTimeout) return;
        mutationThrottleTimeout = setTimeout(() => {
            mutationThrottleTimeout = null;
            handleUrlChange();
        }, MUTATION_THROTTLE_MS);
    };
    
    navigationObserver = new MutationObserver(throttledUrlChange);
    // HIGH-013 FIX: Only observe specific navigation-related elements when possible
    const mainContent = document.querySelector('main, [role="main"], .main-content') || document.body;
    navigationObserver.observe(mainContent, { childList: true, subtree: true });

    // Method 4: Polling fallback (stored globally for cleanup)
    // HIGH-014 FIX: Increased from 1s to 3s to reduce CPU usage
    pollingInterval = setInterval(handleUrlChange, POLLING_INTERVAL_MS);

    console.log('[GCR Content] Navigation detection set up');
}

/**
 * Cleans up navigation detection resources to prevent memory leaks
 * Called on page unload/navigation away
 */
function cleanupNavigationDetection() {
    if (navigationObserver) {
        navigationObserver.disconnect();
        navigationObserver = null;
        console.log('[GCR Content] MutationObserver disconnected');
    }
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        console.log('[GCR Content] Polling interval cleared');
    }
    if (detectionTimeout) {
        clearTimeout(detectionTimeout);
        detectionTimeout = null;
    }
}

/**
 * Listen for messages from background (for multi-tab sync)
 */
function setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'COURSE_DATA_UPDATED') {
            console.log('[GCR Content] Received sync update:', message.courseId);

            // Update badge with new data
            if (message.courseId) {
                // Fetch the updated count
                sendMessage({ type: 'GET_ITEM_COUNT' }).then(response => {
                    if (response.success) {
                        updateBadge(response.count);
                    }
                }).catch((e) => {
                    // Background may not be ready - non-fatal for sync updates
                    console.debug('[GCR Content] Sync badge update failed:', e.message);
                });
            }
        }
        return true;
    });
}

/**
 * Sets up offline detection
 */
function setupOfflineDetection() {
    const updateOnlineStatus = () => {
        const button = document.getElementById(BUTTON_ID);
        if (!button) return;

        if (navigator.onLine) {
            button.classList.remove('gcr-offline');
            button.title = 'Download course materials';
        } else {
            button.classList.add('gcr-offline');
            button.title = 'Offline - downloads unavailable';
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}

/**
 * Initializes the content script
 */
async function init() {
    console.log('[GCR Content] Initializing...');

    // Inject button
    createDownloadButton();

    // Set up navigation detection
    setupNavigationDetection();

    // Set up multi-tab sync
    setupMessageListener();

    // Set up offline detection
    setupOfflineDetection();

    // Load cached data
    try {
        const response = await sendMessage({ type: 'GET_CACHED_DATA' });

        if (response.success && response.data) {
            console.log('[GCR Content] Loaded cached data:', response.data.totalItems, 'items');
            updateBadge(response.data.totalItems);
            lastCourseId = response.data.courseId;
        }
    } catch (error) {
        console.warn('[GCR Content] Failed to load cached data:', error);
    }

    // Initial course detection
    lastUrl = window.location.href;
    handleUrlChange();

    console.log('[GCR Content] Initialized');
}

// ============================================================================
// CLEANUP & LIFECYCLE
// ============================================================================

/**
 * Register cleanup handlers to prevent memory leaks
 * These fire when user navigates away or closes the tab
 */
window.addEventListener('beforeunload', cleanupNavigationDetection);
window.addEventListener('pagehide', cleanupNavigationDetection);

// Also cleanup if the extension context is invalidated (extension reload)
window.addEventListener('error', (event) => {
    if (event.message?.includes('Extension context invalidated')) {
        cleanupNavigationDetection();
    }
});

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

