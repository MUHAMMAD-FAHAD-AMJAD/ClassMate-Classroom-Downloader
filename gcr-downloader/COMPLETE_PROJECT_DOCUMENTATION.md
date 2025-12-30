# ClassMate (GCR Downloader) - Complete Project Documentation

> **Version:** 1.0.1  
> **Last Updated:** December 27, 2024  
> **Platform:** Chrome Extension (Manifest V3)  
> **Purpose:** Bulk download Google Classroom course materials

---

## TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [File Structure & Architecture](#3-file-structure--architecture)
4. [Detailed Module Documentation](#4-detailed-module-documentation)
5. [Data Flow & Message Passing](#5-data-flow--message-passing)
6. [UI/UX Structure](#6-uiux-structure)
7. [Google APIs Used](#7-google-apis-used)
8. [Authentication Flow](#8-authentication-flow)
9. [Caching Strategy](#9-caching-strategy)
10. [Download System](#10-download-system)
11. [Course Detection System](#11-course-detection-system)
12. [Error Handling](#12-error-handling)
13. [Current Limitations](#13-current-limitations)
14. [Planned Features](#14-planned-features)
15. [Enhancement Ideas](#15-enhancement-ideas)
16. [How to Add New Features](#16-how-to-add-new-features)
17. [Code Patterns & Conventions](#17-code-patterns--conventions)
18. [Testing & Debugging](#18-testing--debugging)

---

## 1. PROJECT OVERVIEW

### What It Does
ClassMate (internally called GCR Downloader) is a Chrome Extension that allows university students to:
- Bulk download ALL materials from Google Classroom courses
- Export Google Workspace files (Docs, Slides, Sheets) to standard formats
- Auto-detect course changes and refresh data
- Cache course data for offline viewing
- Generate a resource file containing all links, YouTube videos, and forms

### Core Value Proposition
1. **One-click downloads** - Select files and download in batches
2. **Smart detection** - Auto-detects when you switch courses
3. **Format conversion** - Exports Google Docs to PDF, Sheets to XLSX
4. **Link collection** - Saves YouTube, Forms, and external links to a text file
5. **Organized output** - Files saved to folders named after the course

### Target Users
- University/college students using Google Classroom
- Teachers who want to backup their course materials
- Anyone needing to archive Google Classroom content

---

## 2. TECHNOLOGY STACK

### Core Technologies
| Technology | Usage |
|------------|-------|
| **JavaScript (ES6+)** | All extension logic |
| **Chrome Extension APIs** | identity, storage, downloads, webNavigation, tabs |
| **Google APIs** | Classroom API v1, Drive API v3 |
| **OAuth 2.0** | Authentication via chrome.identity |
| **HTML5/CSS3** | Popup UI with modern styling |

### Key Chrome APIs Used
```javascript
// Authentication
chrome.identity.getAuthToken()
chrome.identity.removeCachedAuthToken()

// Storage
chrome.storage.local.get()
chrome.storage.local.set()
chrome.storage.local.remove()

// Downloads
chrome.downloads.download()

// Navigation
chrome.webNavigation.onCompleted
chrome.tabs.sendMessage()
chrome.runtime.sendMessage()

// Messaging
chrome.runtime.onMessage.addListener()
```

### External Dependencies
- **Google Fonts (Inter)** - Typography
- **No npm packages** - Pure vanilla JavaScript
- **No build tools** - Direct source files

---

## 3. FILE STRUCTURE & ARCHITECTURE

```
gcr-downloader/
├── manifest.json          # Extension configuration (Manifest V3)
├── background.js          # Service worker (1,268 lines)
├── content.js             # Content script for floating button (2,386 lines)
├── content-styles.js      # Injected CSS styles (dynamically generated)
├── popup.html             # Extension popup UI (289 lines)
├── popup.js               # Popup logic (1,167 lines)
├── styles.css             # Popup styles (1,293 lines)
├── README.md              # User documentation
├── UI_UX_DOCUMENTATION.md # UI/UX design docs
├── icons/
│   ├── icon16.png         # Toolbar icon
│   ├── icon48.png         # Extension management
│   └── icon128.png        # Chrome Web Store
└── utils/
    ├── auth.js            # OAuth handling (328 lines)
    ├── api.js             # Google API calls (692 lines)
    ├── cache.js           # Course data caching (429 lines)
    ├── download.js        # Download manager (601 lines)
    ├── courseDetector.js  # URL monitoring (426 lines)
    └── helpers.js         # Utility functions (687 lines)
```

### Architecture Pattern
The extension follows a **message-passing architecture**:

```
┌─────────────────┐     messages     ┌─────────────────┐
│  Content Script │ ◄──────────────► │ Background.js   │
│  (content.js)   │                  │ (Service Worker)│
└─────────────────┘                  └─────────────────┘
        │                                    │
        │                                    │
        ▼                                    ▼
┌─────────────────┐                  ┌─────────────────┐
│ Floating Button │                  │ Utils Modules   │
│ + Modal Popup   │                  │ (auth, api, etc)│
└─────────────────┘                  └─────────────────┘
        │
        │
        ▼
┌─────────────────┐
│  Extension      │
│  Popup (popup)  │
└─────────────────┘
```

---

## 4. DETAILED MODULE DOCUMENTATION

### 4.1 manifest.json

**Purpose:** Defines extension configuration, permissions, and OAuth settings.

**Key Sections:**
```json
{
  "manifest_version": 3,
  "name": "ClassMate - Classroom Downloader",
  "version": "1.0.1",
  
  "permissions": [
    "identity",           // OAuth authentication
    "storage",            // Local data caching
    "downloads",          // File downloads
    "webNavigation",      // URL change detection
    "activeTab",          // Current tab access
    "tabs"                // Tab management
  ],
  
  "host_permissions": [
    "https://classroom.google.com/*",   // Classroom access
    "https://www.googleapis.com/*",     // API access
    "https://drive.google.com/*"        // Drive downloads
  ],
  
  "oauth2": {
    "client_id": "XXX.apps.googleusercontent.com",
    "scopes": [
      "classroom.courses.readonly",
      "classroom.coursework.me.readonly",
      "classroom.courseworkmaterials.readonly",
      "classroom.student-submissions.me.readonly",
      "classroom.announcements.readonly",
      "drive.readonly"
    ]
  }
}
```

**Important:** The `key` field ensures consistent Extension ID for OAuth.

---

### 4.2 background.js (Service Worker)

**Purpose:** Central hub for message handling, API coordination, and download orchestration.

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `handleMessage()` | Routes incoming messages to handlers |
| `handleGetAuthToken()` | Gets OAuth token via chrome.identity |
| `handleSignOut()` | Revokes token, clears auth state |
| `handleGetCachedData()` | Retrieves cached course data |
| `handleSetLastCourse()` | Stores current course info |
| `handleFetchCourseData()` | Fetches all course data from APIs |
| `handleClearCache()` | Clears all cached data |
| `handleGetItemCount()` | Counts downloadable items |
| `apiRequest()` | Makes authenticated API requests |
| `fetchCoursework()` | Fetches assignments |
| `fetchMaterials()` | Fetches course materials |
| `fetchAnnouncements()` | Fetches announcements |

**Message Types Handled:**
```javascript
switch (message.type) {
  case 'GET_AUTH_TOKEN':      // Get OAuth token
  case 'SIGN_OUT':            // Sign out user
  case 'GET_CACHED_DATA':     // Get cached course data
  case 'GET_LAST_COURSE':     // Get last visited course info
  case 'SET_LAST_COURSE':     // Set current course
  case 'FETCH_COURSE_DATA':   // Fetch from APIs
  case 'CLEAR_CACHE':         // Clear all cache
  case 'GET_ITEM_COUNT':      // Count items
  case 'DOWNLOAD_FILES':      // Start downloads
  case 'CANCEL_DOWNLOADS':    // Cancel in-progress
}
```

---

### 4.3 content.js (Content Script)

**Purpose:** Injects floating download button and handles course detection on Google Classroom pages.

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `injectStyles()` | Injects CSS for floating button |
| `createDownloadButton()` | Creates the floating button element |
| `updateBadge()` | Updates file count badge |
| `handleButtonClick()` | Opens popup modal on click |
| `openPopup()` | Renders file selection modal |
| `getAllFiles()` | Flattens course data to file array |
| `getFileType()` | Determines file type from attachment |
| `renderEnhancedFiles()` | Renders file cards |
| `attachPopupListeners()` | Attaches event handlers |
| `filterFiles()` | Filters by category and search |

**State Variables:**
```javascript
let lastCourseId = null;           // Current course ID
let lastCourseName = null;         // Current course name
let currentCourseData = null;      // Cached course data
let isLoading = false;             // Loading state
let currentItemCount = 0;          // Badge count
```

---

### 4.4 popup.js (Extension Popup)

**Purpose:** UI logic for the extension popup (appears when clicking extension icon).

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `initTheme()` | Initializes light/dark/system theme |
| `handleSearch()` | Filters files by search query |
| `setSearchScope()` | Sets search scope (name/type/uploader) |
| `setUploaderTab()` | Switches Teacher/Student tabs |
| `setTypeFilter()` | Filters by content type |
| `setFormatFilter()` | Filters by file format |
| `setSort()` | Sets sort order |
| `applyFiltersAndSort()` | Applies all filters |
| `renderFileList()` | Renders filtered file list |
| `startDownload()` | Initiates batch download |
| `updateProgress()` | Updates download progress bar |

**UI States:**
```javascript
const STATES = {
  LOADING: 'state-loading',
  EMPTY: 'state-empty',
  ERROR: 'state-error',
  AUTH: 'state-auth',
  DATA: 'state-data'
};
```

---

### 4.5 utils/auth.js

**Purpose:** Handles OAuth 2.0 authentication with Google.

**Exports:**

| Function | Purpose |
|----------|---------|
| `getAuthToken(interactive)` | Gets token, optionally showing login |
| `isAuthenticated()` | Checks if user is authenticated |
| `isTokenExpired()` | Checks if token might be expired |
| `refreshToken(interactive)` | Forces token refresh |
| `signOut()` | Revokes token, clears storage |
| `validateToken(token)` | Validates token with Google |
| `getValidToken(interactive)` | Gets fresh, validated token |
| `isAuthError(error)` | Checks if error is auth-related |
| `handleAuthError(interactive)` | Re-authenticates on error |
| `getUserEmail()` | Gets user's email address |

**Token Configuration:**
```javascript
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;      // 5 minutes
const DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;  // 1 hour
```

---

### 4.6 utils/api.js

**Purpose:** Wraps Google Classroom and Drive API calls.

**Exports:**

| Function | Purpose |
|----------|---------|
| `getCourses(signal)` | Fetches all user courses |
| `getCourse(courseId, signal)` | Gets single course details |
| `getCourseWork(courseId, signal)` | Fetches assignments |
| `getCourseMaterials(courseId, signal)` | Fetches materials |
| `getAnnouncements(courseId, signal)` | Fetches announcements |
| `getFileMetadata(fileId, signal)` | Gets Drive file info |
| `getDownloadInfo(fileId, mimeType)` | Gets download URL |
| `downloadFileContent(fileId, mimeType, signal)` | Downloads file blob |
| `getAllCourseData(courseId, signal, onProgress)` | Fetches everything |

**API Endpoints:**
```javascript
const CLASSROOM_API_BASE = 'https://classroom.googleapis.com/v1';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
```

**Data Structure Returned:**
```javascript
{
  courseId: 'ABC123',
  courseName: 'Computer Science 101',
  courseSection: 'Section A',
  timestamp: 1703145600000,
  assignments: [...],      // Array of coursework items
  materials: [...],        // Array of material items
  announcements: [...],    // Array of announcement items
  links: [...],            // Extracted YouTube/Forms/links
  totalItems: 24,
  fetchDuration: 1234      // ms
}
```

---

### 4.7 utils/cache.js

**Purpose:** Manages course data caching with smart invalidation.

**Exports:**

| Function | Purpose |
|----------|---------|
| `getLastCourseId()` | Gets cached course ID |
| `getLastCourseName()` | Gets cached course name |
| `setLastCourse(courseId, courseName)` | Sets current course |
| `getCourseData(courseId)` | Gets cached course data |
| `getLastCourseData()` | Gets last course's data |
| `setCourseData(courseId, data)` | Caches course data |
| `clearCourseData(courseId)` | Clears specific course |
| `clearAllCourseData()` | Clears all course data |
| `resetCache()` | Full cache reset |
| `setFetchInProgress(courseId)` | Marks fetch in progress |
| `clearFetchInProgress()` | Clears fetch flag |
| `hasCourseChanged(currentCourseId)` | Checks if course changed |
| `getCachedItemCount()` | Counts cached items |

**Cache Configuration:**
```javascript
const MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days
const MAX_CACHE_SIZE_BYTES = 5 * 1024 * 1024;       // 5MB
```

**Storage Keys:**
```javascript
const KEYS = {
  LAST_COURSE_ID: 'gcr_last_course_id',
  LAST_COURSE_NAME: 'gcr_last_course_name',
  COURSE_DATA_PREFIX: 'gcr_course_data_',
  CACHE_TIMESTAMP: 'gcr_cache_timestamp',
  FETCH_IN_PROGRESS: 'gcr_fetch_in_progress'
};
```

---

### 4.8 utils/download.js

**Purpose:** Manages file downloads with queue and progress tracking.

**Exports:**

| Function | Purpose |
|----------|---------|
| `downloadFiles(courseData, selectedItems, onProgress)` | Main download function |
| `setProgressCallback(callback)` | Sets progress listener |
| `getProgress()` | Gets current progress |
| `cancelDownloads()` | Cancels all downloads |
| `getDownloadStats()` | Gets download statistics |

**Download Configuration:**
```javascript
const MAX_CONCURRENT_DOWNLOADS = 5;   // Simultaneous downloads
const MAX_DOWNLOAD_RETRIES = 3;       // Retry attempts
const RETRY_DELAY_MS = 2000;          // Delay between retries
```

**Progress Object:**
```javascript
{
  total: 100,
  completed: 45,
  failed: 2,
  inProgress: 5,
  percent: 45
}
```

---

### 4.9 utils/courseDetector.js

**Purpose:** Detects course changes via URL monitoring.

**Exports:**

| Function | Purpose |
|----------|---------|
| `getCurrentCourseId()` | Gets course ID from current URL |
| `isOnCoursePage()` | Checks if on a course page |
| `isOnMainPage()` | Checks if on dashboard |
| `getPageType()` | Returns 'course', 'main', or 'other' |
| `createAbortController()` | Creates new abort controller |
| `getAbortSignal()` | Gets current abort signal |
| `clearAbortController()` | Clears controller |
| `isAborted()` | Checks if operation aborted |
| `initCourseDetector(callback)` | Initializes detection |
| `destroyCourseDetector()` | Cleans up |
| `forceRecheck()` | Forces URL recheck |

**Detection Methods:**
1. **History API Interception** - Wraps `pushState` and `replaceState`
2. **MutationObserver** - Watches DOM for SPA navigation
3. **popstate Event** - Browser back/forward buttons
4. **Polling Fallback** - Checks URL every 1 second

---

### 4.10 utils/helpers.js

**Purpose:** Shared utility functions used across all modules.

**Key Exports:**

| Function | Purpose |
|----------|---------|
| `debounce(func, wait, immediate)` | Creates debounced function |
| `sanitizeFilename(filename, defaultName)` | Removes invalid chars/emojis |
| `getExtensionFromMimeType(mimeType)` | Gets file extension |
| `ensureExtension(filename, mimeType)` | Adds missing extension |
| `makeUniqueFilename(filename, existingNames)` | Adds (1), (2), etc. |
| `formatFileSize(bytes)` | Formats to "1.5 MB" |
| `formatDate(timestamp)` | Formats to readable date |
| `truncateString(str, maxLength)` | Truncates with ellipsis |
| `getErrorInfo(error)` | Gets user-friendly error info |
| `extractCourseId(url)` | Gets course ID from URL |
| `isCoursePage(url)` | Checks if URL is course |
| `isMainPage(url)` | Checks if URL is main page |
| `getFileIcon(mimeType, type)` | Gets emoji icon |
| `isGoogleWorkspaceFile(mimeType)` | Checks if needs export |
| `timeout(ms, message)` | Creates timeout promise |
| `withTimeout(promise, ms)` | Wraps with timeout |
| `delay(ms)` | Async delay |
| `retryWithBackoff(fn, maxRetries, baseDelay)` | Retry with exponential backoff |
| `getStorage(keys)` | Gets chrome.storage data |
| `setStorage(data)` | Sets chrome.storage data |
| `removeStorage(keys)` | Removes chrome.storage data |

**Google Export Formats:**
```javascript
const GOOGLE_EXPORT_FORMATS = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/pdf',
    extension: '.pdf',
    name: 'PDF'
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: '.xlsx',
    name: 'Excel'
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/pdf',
    extension: '.pdf',
    name: 'PDF'
  },
  'application/vnd.google-apps.drawing': {
    mimeType: 'image/png',
    extension: '.png',
    name: 'PNG'
  }
};
```

---

## 5. DATA FLOW & MESSAGE PASSING

### Content Script → Background Flow
```
Content Script                    Background Service Worker
     │                                     │
     ├── sendMessage({type: 'FETCH_COURSE_DATA'}) ──►│
     │                                     │
     │◄── response: {success, data} ───────┤
     │                                     │
     ├── sendMessage({type: 'DOWNLOAD_FILES'}) ────►│
     │                                     │
     │◄── progress updates ────────────────┤
```

### Popup → Background Flow
```
Popup Script                      Background Service Worker
     │                                     │
     ├── sendMessage({type: 'GET_CACHED_DATA'}) ───►│
     │                                     │
     │◄── response: {success, data} ───────┤
     │                                     │
     ├── sendMessage({type: 'DOWNLOAD_FILES'}) ────►│
     │                                     │
     │◄── sendMessage({type: 'DOWNLOAD_PROGRESS'}) ┤
```

### Message Format
```javascript
// Request
{
  type: 'MESSAGE_TYPE',    // Required: action identifier
  courseId: 'ABC123',      // Optional: course identifier
  courseName: 'CS101',     // Optional: course name
  selectedItems: [...]     // Optional: for downloads
}

// Response
{
  success: true,           // Required: success flag
  data: {...},             // Optional: response data
  error: 'Error message'   // Optional: error description
}
```

---

## 6. UI/UX STRUCTURE

### Extension Popup Layout
```
┌─────────────────────────────────────────┐
│ HEADER                                  │
│ ┌───┐ ClassMate      [Course] [⚙️] [✕] │
│ │📚│ Classroom Downloader              │
│ └───┘                                   │
├─────────────────────────────────────────┤
│ TOOLBAR                                 │
│ [🔍 Search...                    ][↕]   │
│ [All] [👨‍🏫 Teacher] [👨‍🎓 Student]      │
│ [️ Smart Filters ▾]                     │
│ [☑️ Select All] [☐ Deselect]   0 files │
├─────────────────────────────────────────┤
│ CONTENT                                 │
│ ┌─────────────────────────────────────┐ │
│ │ 📖 Materials & Slides          [24] │ │
│ │   ☑ Lecture 1 - Intro.pdf          │ │
│ │   ☑ Week 2 Slides.pptx             │ │
│ │   ...                              │ │
│ ├─────────────────────────────────────┤ │
│ │ 📢 Announcements               [5]  │ │
│ │   ...                              │ │
│ ├─────────────────────────────────────┤ │
│ │ 📝 Assignments                 [12] │ │
│ │   ...                              │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ FOOTER                                  │
│ 15 files selected        [🔄] [📥 Download] │
└─────────────────────────────────────────┘
```

### Floating Button (Content Script)
```
┌─────────────────────────────┐
│                             │
│   Google Classroom Page     │
│                             │
│                             │
│                   ┌───────┐ │
│                   │📥 [24]│ │  ← Floating button
│                   └───────┘ │     (bottom-right)
└─────────────────────────────┘
```

### Color Scheme
```css
/* Dark Mode (Default) */
--bg-primary: #0f172a;      /* Main background */
--bg-secondary: #1e293b;    /* Cards/panels */
--accent: #8b5cf6;          /* Purple accent */
--success: #10b981;         /* Green */
--warning: #f59e0b;         /* Orange */
--danger: #ef4444;          /* Red */

/* File Type Colors */
--color-pdf: #ef4444;       /* Red */
--color-slides: #f59e0b;    /* Orange */
--color-docs: #3b82f6;      /* Blue */
--color-sheets: #22c55e;    /* Green */
--color-links: #8b5cf6;     /* Purple */
```

---

## 7. GOOGLE APIs USED

### Classroom API v1

**Base URL:** `https://classroom.googleapis.com/v1`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/courses` | GET | List all courses |
| `/courses/{courseId}` | GET | Get course details |
| `/courses/{courseId}/courseWork` | GET | List assignments |
| `/courses/{courseId}/courseWorkMaterials` | GET | List materials |
| `/courses/{courseId}/announcements` | GET | List announcements |

**Required Scopes:**
- `classroom.courses.readonly`
- `classroom.coursework.me.readonly`
- `classroom.courseworkmaterials.readonly`
- `classroom.announcements.readonly`

### Drive API v3

**Base URL:** `https://www.googleapis.com/drive/v3`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/files/{fileId}` | GET | Get file metadata |
| `/files/{fileId}?alt=media` | GET | Download file content |
| `/files/{fileId}/export?mimeType=...` | GET | Export Google file |

**Required Scopes:**
- `drive.readonly`

---

## 8. AUTHENTICATION FLOW

### Initial Authentication
```
1. User clicks "Sign In" or triggers action
          │
          ▼
2. chrome.identity.getAuthToken({interactive: true})
          │
          ▼
3. Chrome shows Google OAuth login popup
          │
          ▼
4. User grants permissions
          │
          ▼
5. Token returned and stored
          │
          ▼
6. Token timestamp saved for expiry tracking
```

### Token Refresh Flow
```
1. API call made
          │
          ▼
2. Check if token might be expired
          │
     ┌────┴────┐
     │         │
    Yes       No
     │         │
     ▼         ▼
3. Refresh   Continue
   token     with call
     │         │
     └────┬────┘
          │
          ▼
4. If 401 error, try refresh once
          │
          ▼
5. If refresh fails, require re-auth
```

### Token Lifecycle
```javascript
// Token storage
{
  gcr_auth_token: 'ya29.xxx...',
  gcr_auth_timestamp: 1703145600000
}

// Expiry check (55 minutes)
const isExpired = Date.now() - timestamp > (60 - 5) * 60 * 1000;
```

---

## 9. CACHING STRATEGY

### What Gets Cached
```javascript
// Course info
{
  gcr_last_course_id: 'ABC123',
  gcr_last_course_name: 'CS101'
}

// Course data
{
  gcr_course_data_ABC123: {
    courseId: 'ABC123',
    courseName: 'CS101',
    timestamp: 1703145600000,
    assignments: [...],
    materials: [...],
    announcements: [...],
    links: [...],
    totalItems: 45
  }
}
```

### Single Course Cache
- Only ONE course is cached at a time
- Visiting new course clears previous cache
- Returning to dashboard keeps last course data

### Cache Invalidation
1. **Time-based:** Data older than 30 days is cleared
2. **Course change:** Old course data cleared when visiting new course
3. **Manual:** User can clear cache via UI
4. **Size limit:** Auto-trimmed if exceeds 5MB

---

## 10. DOWNLOAD SYSTEM

### Download Queue
```
Files to download: [A, B, C, D, E, F, G, H, I, J]
                                    
Active (5 max):    [A] [B] [C] [D] [E]
Queued:            [F, G, H, I, J]
Completed:         []

After A completes:
Active (5 max):    [B] [C] [D] [E] [F]
Queued:            [G, H, I, J]
Completed:         [A]
```

### File Export Logic
```
┌─────────────────────────────┐
│ Is it a Google Workspace    │
│ file (Docs/Slides/Sheets)?  │
└──────────────┬──────────────┘
               │
        ┌──────┴──────┐
       Yes           No
        │             │
        ▼             ▼
┌───────────────┐ ┌───────────────┐
│ Export API:   │ │ Direct:       │
│ /export?      │ │ ?alt=media    │
│ mimeType=...  │ │               │
└───────────────┘ └───────────────┘
```

### Filename Sanitization
```javascript
// Input: "🎓 Lecture #1: Intro/Overview.pdf"
// Output: "Lecture_1_Intro_Overview.pdf"

Steps:
1. Remove emojis: "Lecture #1: Intro/Overview.pdf"
2. Replace invalid chars: "Lecture _1_ Intro_Overview.pdf"
3. Collapse spaces: "Lecture_1_Intro_Overview.pdf"
4. Truncate to 100 chars if needed
5. Add (1), (2) if duplicate exists
```

### Resources File Generation
For non-downloadable items (YouTube, Forms, external links), a text file is generated:
```
# Resources and Links
# Course: Computer Science 101
# Generated: 12/27/2024, 11:30 PM
# Total: 15 items

============================================================

## YouTube Videos (5)

▶️ Introduction to Programming
   URL: https://youtube.com/watch?v=abc123
   From: Week 1 Materials

...

## Google Forms (3)

📋 Course Feedback Survey
   Form URL: https://docs.google.com/forms/...
   From: Announcements

...

## External Links (7)

🔗 Course Textbook
   URL: https://example.com/textbook
   From: Syllabus
```

---

## 11. COURSE DETECTION SYSTEM

### Detection Methods (Priority Order)

1. **History API Interception**
   ```javascript
   history.pushState = function(...args) {
     originalPushState.apply(this, args);
     handleUrlChange(window.location.href);
   };
   ```

2. **MutationObserver**
   ```javascript
   new MutationObserver((mutations) => {
     if (currentUrl !== lastUrl) {
       handleUrlChange(currentUrl);
     }
   }).observe(document.body, {childList: true, subtree: true});
   ```

3. **popstate Event**
   ```javascript
   window.addEventListener('popstate', () => {
     handleUrlChange(window.location.href);
   });
   ```

4. **Polling Fallback** (every 1 second)
   ```javascript
   setInterval(() => {
     if (currentUrl !== lastCheckedUrl) {
       handleUrlChange(currentUrl);
     }
   }, 1000);
   ```

### URL Patterns
```javascript
// Course page patterns
/c/COURSE_ID             // Standard
/c/COURSE_ID/details     // Course details
/c/COURSE_ID/a/...       // Assignments
/c/COURSE_ID/w/...       // Coursework
/u/0/c/COURSE_ID         // Multi-account

// Main page patterns
/                        // Root
/u/0/                    // Account 0
/h                       // Home
```

### Debouncing
All course change detections are debounced by **500ms** to prevent rapid-fire fetches during fast navigation.

---

## 12. ERROR HANDLING

### Error Categories
```javascript
const ERROR_MESSAGES = {
  401: {
    title: 'Session Expired',
    message: 'Your session has expired. Click to sign in again.',
    action: 'reauth'
  },
  403: {
    title: 'Access Denied',
    message: 'You don\'t have permission to access this resource.',
    action: 'skip'
  },
  404: {
    title: 'Not Found',
    message: 'This file no longer exists or has been moved.',
    action: 'skip'
  },
  429: {
    title: 'Rate Limited',
    message: 'Too many requests. Please wait a moment.',
    action: 'retry'
  },
  500: {
    title: 'Server Error',
    message: 'Google servers are experiencing issues.',
    action: 'retry'
  },
  network: {
    title: 'No Connection',
    message: 'Please check your internet connection.',
    action: 'retry'
  }
};
```

### Retry Strategy
```javascript
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Don't retry on auth/permission errors
      if (error.status === 401 || error.status === 403 || error.status === 404) {
        throw error;
      }
      
      // Calculate exponential delay with jitter
      const delayMs = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await delay(delayMs);
    }
  }
}
```

---

## 13. CURRENT LIMITATIONS

| Limitation | Details |
|------------|---------|
| **File size** | Chrome may fail downloads >2GB |
| **Concurrent limit** | Max 5 simultaneous downloads |
| **Rate limiting** | Google limits ~100 requests/minute |
| **Private files** | Cannot download files without permission |
| **Offline mode** | Requires internet for downloads (cache viewable) |
| **Mobile** | Chrome extensions are desktop-only |
| **Single course cache** | Only last visited course is cached |
| **No folder structure** | All files saved to single course folder |
| **No ZIP export** | Files downloaded individually |
| **No selective refresh** | Full refetch required |

---

## 14. PLANNED FEATURES

From the README.md v1.1.0 roadmap:

| Feature | Priority | Complexity |
|---------|----------|------------|
| Export as ZIP | High | Medium |
| Dark mode toggle | Done ✓ | Low |
| Download history | Medium | Medium |
| Keyboard shortcuts | Low | Low |
| Settings panel | Medium | Medium |

---

## 15. ENHANCEMENT IDEAS

### High Value Additions

1. **ZIP Archive Download**
   - Bundle all files into a single ZIP
   - Use JSZip library
   - Show compression progress

2. **Folder Structure Preservation**
   - Create subfolders for materials/assignments/announcements
   - Match Google Classroom organization

3. **Selective Sync**
   - Remember previously downloaded files
   - Only download new/changed files
   - Use file hash or modification date

4. **Multi-Course Management**
   - Cache multiple courses simultaneously
   - Course comparison view
   - Bulk download across courses

5. **Download Scheduling**
   - Schedule downloads for off-peak hours
   - Background downloads via service worker

6. **File Preview**
   - Preview PDFs/images before download
   - Quick view modal

7. **Search Enhancements**
   - Full-text search in file names
   - Search within file content (if available)
   - Regex support

8. **Export Options**
   - Choose export formats (PDF/DOCX for Docs)
   - Custom file naming patterns
   - Metadata preservation

### Medium Value Additions

9. **Download Statistics**
   - Track total downloaded size
   - Download history log
   - Usage analytics

10. **Notification System**
    - New materials notification
    - Download complete notifications
    - Error alerts with solutions

11. **Accessibility**
    - Screen reader support
    - Keyboard navigation
    - High contrast mode

12. **Internationalization**
    - Multi-language support
    - RTL layout support

13. **Cloud Integration**
    - Direct upload to Google Drive
    - Dropbox/OneDrive integration

14. **Collaboration Features**
    - Share course data with classmates
    - Sync download lists

### Low Priority/Nice to Have

15. **Theme Customization**
    - Custom accent colors
    - Custom CSS injection

16. **Backup & Restore**
    - Export extension settings
    - Import configurations

17. **Course Archiving**
    - Archive entire courses
    - Offline course viewer

---

## 16. HOW TO ADD NEW FEATURES

### Adding a New Message Type

1. **Define message type in background.js:**
   ```javascript
   case 'YOUR_NEW_MESSAGE':
     return handleYourNewMessage(message.param1, message.param2);
   ```

2. **Create handler function:**
   ```javascript
   async function handleYourNewMessage(param1, param2) {
     try {
       // Your logic here
       return { success: true, data: result };
     } catch (error) {
       return { success: false, error: error.message };
     }
   }
   ```

3. **Send message from content/popup:**
   ```javascript
   const response = await chrome.runtime.sendMessage({
     type: 'YOUR_NEW_MESSAGE',
     param1: value1,
     param2: value2
   });
   ```

### Adding a New Utility Function

1. **Add to helpers.js:**
   ```javascript
   /**
    * Description of what the function does
    * @param {Type} param - Parameter description
    * @returns {ReturnType} Return value description
    */
   export function yourNewFunction(param) {
     // Implementation
   }
   ```

2. **Import where needed:**
   ```javascript
   import { yourNewFunction } from './helpers.js';
   ```

### Adding a New UI Component

1. **Add HTML to popup.html:**
   ```html
   <div class="gcr-new-component" id="new-component">
     <!-- Component content -->
   </div>
   ```

2. **Add styles to styles.css:**
   ```css
   .gcr-new-component {
     /* Component styles */
   }
   ```

3. **Add logic to popup.js:**
   ```javascript
   const elements = {
     // ... existing elements
     newComponent: document.getElementById('new-component')
   };
   
   function handleNewComponent() {
     // Component logic
   }
   ```

### Adding a New API Endpoint

1. **Add to api.js:**
   ```javascript
   /**
    * Description
    * @param {string} param - Parameter description
    * @param {AbortSignal} signal - Optional abort signal
    * @returns {Promise<Object>} Return description
    */
   export async function getNewData(param, signal = null) {
     const url = `${CLASSROOM_API_BASE}/new/endpoint/${param}`;
     return apiRequestWithRetry(url, {}, signal);
   }
   ```

### Adding New Chrome Permissions

1. **Update manifest.json:**
   ```json
   {
     "permissions": [
       "existing_permission",
       "new_permission"
     ]
   }
   ```

2. **Note:** New permissions may require reinstalling the extension.

---

## 17. CODE PATTERNS & CONVENTIONS

### Naming Conventions
```javascript
// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_BASE_URL = 'https://...';

// Functions: camelCase, verb prefix
function handleButtonClick() {}
function fetchCourseData() {}
function isAuthenticated() {}
function getLastCourseId() {}

// Private functions: underscore prefix (not used, but convention)
function _internalHelper() {}

// CSS classes: gcr- prefix, kebab-case
.gcr-popup-container {}
.gcr-download-button {}
.gcr-file-card {}
```

### Error Handling Pattern
```javascript
async function riskyOperation() {
  try {
    const result = await someApiCall();
    return { success: true, data: result };
  } catch (error) {
    console.error('[GCR ModuleName] Error description:', error);
    return { success: false, error: error.message };
  }
}
```

### Logging Convention
```javascript
// Module-prefixed logging
console.log('[GCR Auth] Message');
console.log('[GCR API] Message');
console.log('[GCR Cache] Message');
console.log('[GCR Download] Message');
console.log('[GCR Detector] Message');
console.log('[GCR Background] Message');

// Log levels
console.log()   // Normal info
console.warn()  // Warnings
console.error() // Errors
```

### Promise Patterns
```javascript
// Async/await preferred
async function example() {
  const result = await someAsyncOp();
  return result;
}

// Promise wrapping for Chrome APIs
function chromeApiWrapper() {
  return new Promise((resolve, reject) => {
    chrome.something.doThing((result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}
```

---

## 18. TESTING & DEBUGGING

### Manual Testing Checklist

**Authentication:**
- [ ] Fresh install can authenticate
- [ ] Sign out works correctly
- [ ] Token refresh works after expiry
- [ ] Re-authentication after 401 error

**Course Detection:**
- [ ] Button appears on course pages
- [ ] Badge updates when entering course
- [ ] Dashboard retains last course data
- [ ] Multi-tab sync works

**Downloads:**
- [ ] Single file downloads work
- [ ] Batch downloads work
- [ ] Google Docs export to PDF
- [ ] Google Sheets export to XLSX
- [ ] Progress tracking accurate
- [ ] Cancel downloads works
- [ ] Retry on failure works

**UI/UX:**
- [ ] Theme switching works
- [ ] Search filters correctly
- [ ] Sort options work
- [ ] Select all/deselect works
- [ ] Category collapse/expand works

### Developer Console Logs

To debug, open Chrome DevTools (F12) on:
1. **Popup:** Right-click extension icon → Inspect popup
2. **Background:** chrome://extensions → Service Worker "Inspect"
3. **Content Script:** On classroom.google.com → Console

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| OAuth error | Check Extension ID matches in Google Cloud Console |
| Button not showing | Check content script is loaded (console) |
| Downloads failing | Check token validity, try re-auth |
| Cache not updating | Clear cache, force refresh |
| API rate limit | Wait 1-2 minutes, try again |

---

## APPENDIX A: Complete Message Type Reference

| Message Type | Sender | Handler | Purpose |
|--------------|--------|---------|---------|
| `GET_AUTH_TOKEN` | Popup/Content | Background | Get OAuth token |
| `SIGN_OUT` | Popup | Background | Sign out user |
| `GET_CACHED_DATA` | Popup/Content | Background | Get cached course data |
| `GET_LAST_COURSE` | Popup/Content | Background | Get last visited course info |
| `SET_LAST_COURSE` | Content | Background | Set current course |
| `FETCH_COURSE_DATA` | Popup/Content | Background | Fetch from Google APIs |
| `CLEAR_CACHE` | Popup | Background | Clear all cached data |
| `GET_ITEM_COUNT` | Content | Background | Get downloadable item count |
| `DOWNLOAD_FILES` | Popup/Content | Background | Start batch download |
| `CANCEL_DOWNLOADS` | Popup | Background | Cancel downloads |
| `DOWNLOAD_PROGRESS` | Background | Popup | Progress update |

---

## APPENDIX B: File Type Support Matrix

| File Type | MIME Type | Action | Output |
|-----------|-----------|--------|--------|
| Google Doc | `application/vnd.google-apps.document` | Export | PDF |
| Google Slides | `application/vnd.google-apps.presentation` | Export | PDF |
| Google Sheets | `application/vnd.google-apps.spreadsheet` | Export | XLSX |
| Google Drawing | `application/vnd.google-apps.drawing` | Export | PNG |
| Google Form | `application/vnd.google-apps.form` | Link | TXT file |
| PDF | `application/pdf` | Download | PDF |
| Word Doc | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Download | DOCX |
| PowerPoint | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | Download | PPTX |
| Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Download | XLSX |
| Image | `image/*` | Download | Original |
| Video | `video/*` | Download | Original |
| YouTube | N/A | Link | TXT file |
| External Link | N/A | Link | TXT file |

---

## APPENDIX C: Storage Schema

```javascript
// All keys stored in chrome.storage.local

{
  // Authentication
  "gcr_auth_token": "ya29.a0ARrdaM...",
  "gcr_auth_timestamp": 1703145600000,
  
  // Current course
  "gcr_last_course_id": "123456789",
  "gcr_last_course_name": "Computer Science 101",
  "gcr_cache_timestamp": 1703145600000,
  
  // Course data (prefixed by course ID)
  "gcr_course_data_123456789": {
    "courseId": "123456789",
    "courseName": "Computer Science 101",
    "courseSection": "Section A",
    "timestamp": 1703145600000,
    "version": 1,
    "assignments": [
      {
        "id": "abc123",
        "title": "Assignment 1",
        "description": "...",
        "type": "courseWork",
        "creationTime": "2024-01-01T00:00:00Z",
        "updateTime": "2024-01-02T00:00:00Z",
        "dueDate": {...},
        "attachments": [
          {
            "type": "driveFile",
            "id": "file123",
            "title": "Homework.pdf",
            "mimeType": "application/pdf",
            "alternateLink": "https://...",
            "isGoogleFile": false
          }
        ]
      }
    ],
    "materials": [...],
    "announcements": [...],
    "links": [
      {
        "type": "youtube",
        "id": "video123",
        "title": "Intro Video",
        "alternateLink": "https://youtube.com/...",
        "parentTitle": "Week 1",
        "parentType": "courseWorkMaterial"
      }
    ],
    "totalItems": 45,
    "fetchDuration": 1234
  },
  
  // Fetch state
  "gcr_fetch_in_progress": {
    "courseId": "123456789",
    "startTime": 1703145600000
  },
  
  // User preferences
  "gcr_theme": "dark",  // "light", "dark", "system"
}
```

---

**END OF DOCUMENTATION**

*This document contains everything needed to understand, maintain, and enhance the ClassMate (GCR Downloader) Chrome Extension. For questions or clarifications, refer to the source code comments.*
