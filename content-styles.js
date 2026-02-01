/**
 * ClassMate - Content Script Styles
 * These styles are injected dynamically to avoid conflicts with Google Classroom
 */

const CONTENT_STYLES = `
/* ============================================================================
   FLOATING DOWNLOAD BUTTON - Completely Isolated
   ============================================================================ */

.gcr-download-button {
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
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    overflow: hidden !important;
    width: auto !important;
    height: 48px !important;
    min-width: 48px !important;
    max-width: 160px !important;
    all: initial;
    box-sizing: border-box !important;
}

.gcr-download-button * {
    all: unset;
    box-sizing: border-box !important;
}

.gcr-download-button:hover {
    transform: translateY(-3px) scale(1.02) !important;
    box-shadow: 0 12px 40px rgba(102, 126, 234, 0.5), 0 6px 16px rgba(0, 0, 0, 0.25) !important;
}

.gcr-download-button:active {
    transform: translateY(-1px) scale(0.98) !important;
}

.gcr-download-button.gcr-loading {
    pointer-events: none !important;
    width: 48px !important;
    min-width: 48px !important;
    max-width: 48px !important;
    padding: 12px !important;
    border-radius: 50% !important;
}

.gcr-download-button.gcr-loading .gcr-button-content {
    display: none !important;
}

.gcr-download-button.gcr-loading .gcr-loading-spinner {
    display: flex !important;
}

.gcr-button-content {
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
    color: white !important;
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
    white-space: nowrap !important;
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
    background: linear-gradient(135deg, #ef4444 0%, #f87171 100%) !important;
    color: white !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    border-radius: 50px !important;
    border: 2px solid white !important;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4) !important;
}

.gcr-badge-hidden {
    display: none !important;
}

.gcr-loading-spinner {
    display: none !important;
    align-items: center !important;
    justify-content: center !important;
}

.gcr-loading-spinner .gcr-spinner {
    width: 22px !important;
    height: 22px !important;
    border: 3px solid rgba(255, 255, 255, 0.3) !important;
    border-top-color: white !important;
    border-radius: 50% !important;
    animation: gcr-spin 0.7s linear infinite !important;
}

@keyframes gcr-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.gcr-hidden {
    display: none !important;
}

/* ============================================================================
   POPUP MODAL - Injected into page
   ============================================================================ */

.gcr-popup-overlay {
    position: fixed !important;
    inset: 0 !important;
    background: rgba(0, 0, 0, 0.7) !important;
    backdrop-filter: blur(8px) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 2147483646 !important;
    animation: gcr-fadeIn 0.2s ease !important;
}

@keyframes gcr-fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes gcr-fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.gcr-popup {
    width: 90% !important;
    max-width: 480px !important;
    max-height: 80vh !important;
    background: #1e293b !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 20px !important;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    animation: gcr-fadeInUp 0.3s ease !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}

.gcr-popup * {
    box-sizing: border-box !important;
    font-family: inherit !important;
}

.gcr-popup-header {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 20px 24px !important;
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%) !important;
    color: white !important;
}

.gcr-popup-title {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
}

.gcr-popup-title h2 {
    font-size: 18px !important;
    font-weight: 700 !important;
    margin: 0 !important;
    color: white !important;
}

.gcr-popup-count {
    font-size: 13px !important;
    opacity: 0.8 !important;
    color: white !important;
}

.gcr-popup-close {
    width: 36px !important;
    height: 36px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(255, 255, 255, 0.1) !important;
    border: none !important;
    border-radius: 50% !important;
    color: white !important;
    font-size: 24px !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    line-height: 1 !important;
}

.gcr-popup-close:hover {
    background: rgba(255, 255, 255, 0.2) !important;
    transform: scale(1.1) !important;
}

.gcr-popup-toolbar {
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
    padding: 16px 24px !important;
    background: rgba(15, 23, 42, 0.5) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
}

.gcr-select-buttons {
    display: flex !important;
    gap: 8px !important;
}

.gcr-search-container {
    width: 100% !important;
}

.gcr-search-input {
    width: 100% !important;
    padding: 10px 16px !important;
    background: rgba(30, 41, 59, 0.8) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 10px !important;
    color: #f1f5f9 !important;
    font-size: 14px !important;
    outline: none !important;
}

.gcr-search-input::placeholder {
    color: #64748b !important;
}

.gcr-search-input:focus {
    border-color: #8b5cf6 !important;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.2) !important;
}

.gcr-popup-content {
    flex: 1 !important;
    overflow-y: auto !important;
    padding: 20px 24px !important;
    max-height: 300px !important;
}

.gcr-popup-content::-webkit-scrollbar {
    width: 6px !important;
}

.gcr-popup-content::-webkit-scrollbar-track {
    background: transparent !important;
}

.gcr-popup-content::-webkit-scrollbar-thumb {
    background: #334155 !important;
    border-radius: 3px !important;
}

/* Categories */
.gcr-category {
    margin-bottom: 16px !important;
}

.gcr-category-header {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 8px 0 !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
    margin-bottom: 8px !important;
}

.gcr-category-title {
    font-size: 14px !important;
    font-weight: 600 !important;
    color: #f1f5f9 !important;
}

.gcr-category-count {
    font-size: 12px !important;
    color: #64748b !important;
}

.gcr-category-items {
    display: flex !important;
    flex-direction: column !important;
    gap: 4px !important;
}

/* File Items */
.gcr-item-group {
    margin-bottom: 8px !important;
}

.gcr-item-title {
    font-size: 12px !important;
    font-weight: 500 !important;
    color: #94a3b8 !important;
    margin-bottom: 4px !important;
    padding-left: 4px !important;
}

.gcr-file-item {
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    padding: 8px 12px !important;
    background: rgba(30, 41, 59, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
    border-radius: 8px !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
}

.gcr-file-item:hover {
    background: rgba(51, 65, 85, 0.5) !important;
    border-color: rgba(255, 255, 255, 0.1) !important;
}

.gcr-file-item.selected {
    background: rgba(139, 92, 246, 0.15) !important;
    border-color: #8b5cf6 !important;
}

.gcr-file-checkbox {
    width: 18px !important;
    height: 18px !important;
    accent-color: #8b5cf6 !important;
    cursor: pointer !important;
    flex-shrink: 0 !important;
}

.gcr-file-icon {
    font-size: 16px !important;
    flex-shrink: 0 !important;
}

.gcr-file-name {
    flex: 1 !important;
    font-size: 13px !important;
    color: #f1f5f9 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
}

/* Footer */
.gcr-popup-footer {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    padding: 16px 24px !important;
    background: rgba(15, 23, 42, 0.8) !important;
    border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.gcr-selected-count {
    font-size: 14px !important;
    color: #94a3b8 !important;
}

.gcr-selected-count span {
    color: #8b5cf6 !important;
    font-weight: 600 !important;
}

.gcr-popup-actions {
    display: flex !important;
    gap: 10px !important;
}

/* Buttons */
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
    transition: all 0.15s ease !important;
}

.gcr-btn:active {
    transform: scale(0.96) !important;
}

.gcr-btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f953c6 100%) !important;
    color: white !important;
    box-shadow: 0 0 20px rgba(139, 92, 246, 0.4) !important;
}

.gcr-btn-primary:hover {
    box-shadow: 0 0 30px rgba(139, 92, 246, 0.5) !important;
}

.gcr-btn-primary:disabled {
    opacity: 0.5 !important;
    cursor: not-allowed !important;
}

.gcr-btn-secondary {
    background: #334155 !important;
    color: #f1f5f9 !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
}

.gcr-btn-secondary:hover {
    background: #475569 !important;
}

.gcr-btn-danger {
    background: linear-gradient(135deg, #ef4444 0%, #f87171 100%) !important;
    color: white !important;
}

.gcr-btn-small {
    padding: 8px 12px !important;
    font-size: 12px !important;
}

/* Progress */
.gcr-progress-container {
    padding: 20px 24px !important;
    text-align: center !important;
}

.gcr-progress-text {
    font-size: 14px !important;
    color: #f1f5f9 !important;
    margin-bottom: 12px !important;
}

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
    background: linear-gradient(90deg, #667eea 0%, #764ba2 50%, #f953c6 100%) !important;
    border-radius: 4px !important;
    transition: width 0.3s ease !important;
    position: relative !important;
}

.gcr-progress-fill::after {
    content: '' !important;
    position: absolute !important;
    inset: 0 !important;
    background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.4) 50%, transparent 100%) !important;
    animation: gcr-shimmer 1.2s ease-in-out infinite !important;
    background-size: 200% 100% !important;
}

@keyframes gcr-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}

/* Empty State */
.gcr-empty-state {
    text-align: center !important;
    padding: 40px 20px !important;
    color: #94a3b8 !important;
}

.gcr-empty-icon {
    font-size: 48px !important;
    margin-bottom: 12px !important;
    opacity: 0.5 !important;
}

/* Notifications */
.gcr-notification {
    position: fixed !important;
    bottom: 90px !important;
    right: 24px !important;
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    padding: 14px 20px !important;
    background: #1e293b !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 14px !important;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3) !important;
    z-index: 2147483647 !important;
    max-width: 320px !important;
    animation: gcr-slideIn 0.3s ease forwards !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
}

@keyframes gcr-slideIn {
    from { opacity: 0; transform: translateX(20px); }
    to { opacity: 1; transform: translateX(0); }
}

.gcr-notification-hide {
    animation: gcr-fadeOut 0.3s ease forwards !important;
}

@keyframes gcr-fadeOut {
    to { opacity: 0; transform: translateX(20px); }
}

.gcr-notification-success { border-left: 4px solid #10b981 !important; }
.gcr-notification-error { border-left: 4px solid #ef4444 !important; }
.gcr-notification-warning { border-left: 4px solid #f59e0b !important; }
.gcr-notification-info { border-left: 4px solid #8b5cf6 !important; }

.gcr-notification-icon { font-size: 20px !important; }
.gcr-notification-message { 
    font-size: 14px !important; 
    color: #f1f5f9 !important; 
    line-height: 1.4 !important; 
}
`;

// Export for use in content.js
if (typeof module !== 'undefined') {
    module.exports = CONTENT_STYLES;
}
