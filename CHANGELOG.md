# Changelog

All notable changes to ClassMate - Classroom Downloader will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-01-31

### Security Fixes
- **SEC-001**: Fixed token exposure in URL query parameters - now uses POST body for tokeninfo API calls
- **SEC-002/SEC-010**: Added token TTL tracking and improved session storage handling for sensitive data
- **SEC-003/SEC-011**: Improved race condition handling in authentication locks using Web Locks API
- **SEC-006**: Added Content Security Policy meta tag to popup.html
- **SEC-007**: Added crossorigin attribute for Google Fonts to improve CORS security
- **SEC-008**: Added file size limits and warnings for large downloads to prevent memory exhaustion
- **SEC-009**: Added path validation before downloads to prevent path traversal attacks
- **SEC-012**: Enhanced HTML escaping to handle unicode, NULL bytes, and control characters

### High Priority Fixes
- **HIGH-001**: Improved token revocation with retry logic on sign out
- **HIGH-002**: Added offline retry queue for failed network downloads
- **HIGH-003**: Changed OAuth scope from drive.readonly to drive.file (more restrictive)
- **HIGH-004**: Added per-user rate limiting buckets for multi-account support
- **HIGH-005**: Added debug mode flag for conditional logging in production
- **HIGH-006**: Added global error boundary to prevent UI crashes
- **HIGH-007**: Added prominent privacy policy link in popup footer
- **HIGH-008**: Added debounce (500ms) to tab sync to prevent infinite loops
- **HIGH-009**: Added maximum file count limit (500 files) per download
- **HIGH-010**: Fixed Retry-After header parsing for both seconds and HTTP-date formats
- **HIGH-011**: Increased keepAlive frequency during downloads to prevent service worker termination
- **HIGH-012**: Added TTL cleanup for orphaned download queue items
- **HIGH-013**: Throttled MutationObserver callbacks to improve performance
- **HIGH-014**: Increased polling interval from 1s to 3s to reduce CPU usage
- **HIGH-015**: Added confirmation dialog for large downloads (50+ files)
- **HIGH-016**: Added warning for files with unknown sizes before download
- **HIGH-017**: Added download completion verification tracking
- **HIGH-018**: Added duplicate file detection within batch downloads
- **HIGH-019**: Fixed base64 course ID decoding with format validation
- **HIGH-020**: Added progress state persistence for recovery after browser close
- **HIGH-021**: Added ARIA live region announcements for screen readers
- **HIGH-022**: Added keyboard navigation (arrow keys) in file list
- **HIGH-023**: Added focus trap for modal accessibility
- **HIGH-024**: Replaced silent catch blocks with debug logging
- **HIGH-025**: Added version migration logic for extension updates

### Accessibility Improvements
- Added ARIA live regions for progress updates (25%, 50%, 75%, complete)
- Added progressbar role with aria-valuenow attributes
- Added focus trap in popup modal
- Added reduced motion support via prefers-reduced-motion media query
- Added screen reader announcements for download progress

### Added
- Privacy Policy link in popup footer (visible and accessible)
- Version badge display in popup (v1.0.5)
- Minimum Chrome version requirement (102+) in manifest
- Debug mode toggle via storage setting
- Confirmation dialogs for large batch downloads
- Progress recovery on popup reopen

### Changed
- Bumped version to 1.0.5
- Changed OAuth scope to drive.file (more restrictive than drive.readonly)
- Improved error messages with more context
- Enhanced sanitizer with additional XSS pattern detection

### Fixed
- Removed dead code (duplicate return statement) in workerState.js

## [1.0.4] - 2026-01-15

### Added
- Initial public release
- Bulk download support for Google Classroom materials
- Support for PDFs, slides, docs, and other attachments
- Rate limiting to prevent API quota issues
- Multi-tab synchronization
- Dark mode UI

### Security
- Input validation for course IDs
- Filename sanitization with path traversal prevention
- Token bucket rate limiting

## [1.0.0] - 2026-01-01

### Added
- Initial development version
- Basic Google Classroom integration
- OAuth2 authentication
- File download functionality

---

## Migration Notes

### Upgrading to 1.0.5

No manual migration required. The extension will automatically:
1. Preserve existing cached course data
2. Update stored version information
3. Apply new security settings

If you experience any issues after updating:
1. Clear extension cache (Settings → Clear Cache)
2. Re-authenticate if prompted
3. Refresh the Google Classroom page

### Known Issues

- Very large files (>50MB) may cause memory warnings but will still download
- Some university Google accounts may require re-authentication every 2-3 hours
