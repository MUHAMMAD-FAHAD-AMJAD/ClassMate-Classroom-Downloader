# 📚 ClassMate - Google Classroom Material Downloader

<div align="center">

![ClassMate Banner](icons/icon128.png)

**A powerful Chrome Extension to download all materials from your Google Classroom courses with a single click!**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/MUHAMMAD-FAHAD-AMJAD/SLIDE-DOWNLOADER-EXTENSION)
[![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)

</div>

---

## ✨ Features

### 🎯 Core Features
| Feature | Description |
|---------|-------------|
| 🔘 **Always-Visible Button** | Floating download button on every Google Classroom page |
| 🔍 **Smart Course Detection** | Automatically detects when you switch courses |
| 💾 **Intelligent Caching** | Remembers last visited course data on dashboard |
| 📦 **Batch Downloads** | Download multiple files with one click |
| 📁 **File Type Support** | PDFs, Docs, Slides, Sheets, Images, Videos, and more |
| 🔄 **Multi-Tab Sync** | All tabs update when you switch courses |
| 🌐 **Offline Detection** | Graceful handling when network is unavailable |
| 🔒 **Security Hardened** | Path traversal & XSS prevention built-in |

### 🛡️ Security Features (v2.0.0)
- ✅ **Path Traversal Protection** - Blocks `../` attacks
- ✅ **Windows Reserved Names** - Blocks `CON`, `NUL`, `PRN` exploits
- ✅ **XSS Prevention** - Sanitizes HTML and validates URLs
- ✅ **Rate Limiting** - 90 requests/minute with token bucket
- ✅ **Persistent Queue** - Downloads survive service worker restarts
- ✅ **Duplicate Protection** - Multiple clicks won't create duplicate downloads

---

## 📁 Supported File Types

| File Type | Action | Output Format |
|-----------|--------|---------------|
| 📝 Google Docs | Export | PDF |
| 📊 Google Slides | Export | PDF |
| 📈 Google Sheets | Export | XLSX |
| 🎨 Google Drawings | Export | PNG |
| 📋 Google Forms | Save Link | .txt |
| 📄 Regular PDFs | Download | PDF |
| 📽️ PowerPoint | Download | PPTX |
| 📃 Word Docs | Download | DOCX |
| 🖼️ Images | Download | Original |
| ▶️ YouTube Videos | Save Link | .txt |
| 🔗 External Links | Save Link | .txt |

---

## 🔄 Smart Caching Behavior

```
Fresh Install → Button shows "Download" (no badge)
    ↓
Visit Course A → Loading... → Badge shows "[24]"
    ↓
Return to Dashboard → Badge still shows "[24]" (retained!)
    ↓
Visit Course B → Badge resets → Loading... → Badge shows "[18]"
    ↓
Return to Dashboard → Badge shows "[18]" (Course B data)
```

---

## 🎓 Student Installation Guide

### Quick Install (2 Minutes!)

1. 📥 Download the extension ZIP file
2. 📂 Extract the ZIP to any folder (e.g., Desktop)
3. 🌐 Open Chrome and go to `chrome://extensions/`
4. 🔧 Enable **Developer Mode** (toggle in top-right corner)
5. 📁 Click **"Load unpacked"** and select the extracted folder
6. ✅ Done! Go to [Google Classroom](https://classroom.google.com)
7. 🔓 Click **"Allow"** when Google asks for permission
8. 🚀 Start downloading! Click the floating button on any course

### First-Time Login

- Click **"Sign in with Google"** when prompted
- Use your **university Google account**
- Allow the requested permissions
- You'll see **YOUR courses** (not your instructor's!)

---

## 🔧 Student Troubleshooting

| Problem | Solution |
|---------|----------|
| "OAuth error" | Make sure you're signed into your university Google account |
| Button not visible | Refresh the page (Ctrl+R) |
| "Extension ID error" | Re-download and reinstall the extension |
| Can't see courses | You must be enrolled in at least one Google Classroom course |
| Downloads failing | Check your internet connection and try again |
| Duplicate downloads | Update to v2.0.0 - fixed with download lock |

---

## 🛠️ For Developers

### 📦 Project Structure

```
classmate-extension/
├── 📄 manifest.json           # Extension configuration (MV3)
├── 📄 background.js           # Service worker (API, auth, downloads)
├── 📄 content.js              # Floating button & course detection
├── 📄 popup.html              # Extension popup UI
├── 📄 popup.js                # Popup logic
├── 📄 styles.css              # Button & modal styles
├── 📂 utils/
│   ├── 🔐 auth.js             # OAuth 2.0 + proactive token refresh
│   ├── 💾 cache.js            # LRU multi-course caching (5 courses)
│   ├── 📥 download.js         # Download manager with persistent queue
│   ├── ⚡ rateLimiter.js      # Token bucket rate limiting
│   ├── 🔒 sanitizer.js        # Security: filename/path/XSS sanitization
│   ├── 🔄 workerState.js      # Service worker state persistence
│   ├── 📊 largeFileHandler.js # Large file validation (2GB limit)
│   └── 🛠️ helpers.js          # Utility functions
├── 📂 icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── 📄 README.md
```

### 🚀 Developer Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/MUHAMMAD-FAHAD-AMJAD/SLIDE-DOWNLOADER-EXTENSION.git
   cd SLIDE-DOWNLOADER-EXTENSION
   ```

2. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project named "ClassMate"
   - Enable **Google Classroom API**
   - Enable **Google Drive API**

3. **Create OAuth Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth Client ID"
   - Select **Chrome Extension** as application type
   - Enter your Extension ID

4. **Configure the Extension**
   ```json
   "oauth2": {
     "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
     "scopes": [
       "https://www.googleapis.com/auth/classroom.courses.readonly",
       "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
       "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
       "https://www.googleapis.com/auth/classroom.announcements.readonly",
       "https://www.googleapis.com/auth/drive.readonly"
     ]
   }
   ```

5. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → Select folder
   - Copy Extension ID → Update in Google Cloud Console

---

## 🔧 Technical Details

### ⚡ Rate Limiting
```javascript
// Token Bucket Algorithm
const RATE_LIMIT = {
  maxTokens: 90,           // Max requests in bucket
  refillRate: 1.5,         // Tokens added per second
  refillInterval: 1000ms   // Refill check interval
};
```

### 📥 Download Management
| Setting | Value |
|---------|-------|
| Concurrent Downloads | 5 files max |
| Queue Size | Unlimited |
| Retry Attempts | 3 with exponential backoff |
| Large File Warning | 500MB+ |
| Large File Block | 2GB+ |
| Filename Sanitization | Removes emojis, special chars, truncates to 200 chars |

### 🔄 Service Worker Persistence
- **Heartbeat**: Every 60 seconds via `chrome.alarms`
- **State Storage**: `chrome.storage.session` for queue
- **Token Refresh**: Proactive at 50 minutes (before 60-min expiry)
- **Crash Recovery**: Jobs auto-resume on worker restart

### 🛡️ Security Sanitization
```javascript
// Path Traversal - BLOCKED
"../../../etc/passwd" → "etc_passwd"

// Windows Reserved - PREFIXED  
"CON.pdf" → "_CON.pdf"

// XSS Prevention
"<script>alert(1)</script>" → "scriptalert1script"
```

---

## 📊 API Rate Limits

| API | Limit |
|-----|-------|
| Classroom API | 10,000 requests/day (per project) |
| Drive API | 1,000 requests/100 seconds/user |

**What this means:**
- ~100+ students can use simultaneously
- Each course fetch = ~3-5 API calls
- Automatic exponential backoff on 429 errors

---

## 🔐 Privacy & Security

| Aspect | Status |
|--------|--------|
| Data Collection | ❌ None - all processing local |
| External Servers | ❌ None - only Google APIs |
| Credentials Storage | ✅ Only OAuth tokens, never passwords |
| Secure Storage | ✅ Chrome's encrypted storage |
| XSS Prevention | ✅ Built-in sanitization |
| Path Traversal | ✅ Blocked |

---

## 📝 Permissions Explained

| Permission | Why Needed |
|------------|-----------|
| `identity` | OAuth authentication with Google |
| `storage` | Cache course data locally |
| `downloads` | Save files to your computer |
| `alarms` | Keep service worker alive |
| `classroom.google.com` | Access Classroom pages |
| `googleapis.com` | Call Google APIs |

---

## 📜 Changelog

### Version 2.0.0 (2024-12-28) - Security Hardening
- 🔒 **Security**: Path traversal blocking
- 🔒 **Security**: Windows reserved name protection
- 🔒 **Security**: XSS prevention for filenames/URLs
- ⚡ **Performance**: Token bucket rate limiting (90 req/min)
- 💾 **Reliability**: Persistent download queue
- 🔄 **Reliability**: Service worker heartbeat
- 🔐 **Auth**: Proactive token refresh at 50 minutes
- 📦 **Downloads**: Large file validation (warn 500MB+, block 2GB+)
- 🛡️ **UX**: Duplicate download prevention

### Version 1.0.0 (2024-12-20)
- 🎉 Initial release
- ✅ Smart course detection
- ✅ Intelligent caching
- ✅ Batch downloads
- ✅ 15+ file types supported

---

## 💬 Support & Feedback

- 🐛 **Bug Reports**: [Open an issue](https://github.com/MUHAMMAD-FAHAD-AMJAD/SLIDE-DOWNLOADER-EXTENSION/issues)
- 💡 **Feature Requests**: [Start a discussion](https://github.com/MUHAMMAD-FAHAD-AMJAD/SLIDE-DOWNLOADER-EXTENSION/discussions)
- ❓ **Questions**: Check the troubleshooting section above

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📃 License

MIT License - feel free to use and modify!

---

## 🙏 Acknowledgments

- [Google Classroom API](https://developers.google.com/classroom)
- [Google Drive API](https://developers.google.com/drive)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)

---

<div align="center">

**Made with ❤️ for students everywhere**

[![GitHub](https://img.shields.io/badge/GitHub-MUHAMMAD--FAHAD--AMJAD-181717?logo=github)](https://github.com/MUHAMMAD-FAHAD-AMJAD)

</div>
