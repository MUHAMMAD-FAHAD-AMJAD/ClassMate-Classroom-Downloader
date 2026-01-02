# 📚 ClassMate – Google Classroom Material Downloader

<div align="center">

![ClassMate Banner](icons/icon128.png)

### **Download all your Google Classroom materials with a single click!**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](#changelog)
[![Manifest](https://img.shields.io/badge/manifest-v3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://www.google.com/chrome/)

**Stop downloading files one-by-one. ClassMate lets you batch download PDFs, slides, docs, and more from any course.**

[📥 Install Now](#-quick-install-2-minutes) · [🐛 Report Bug](https://github.com/MUHAMMAD-FAHAD-AMJAD/SLIDE-DOWNLOADER-EXTENSION/issues) · [💡 Request Feature](https://github.com/MUHAMMAD-FAHAD-AMJAD/SLIDE-DOWNLOADER-EXTENSION/discussions)

</div>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔘 **Floating Download Button** | Always-visible button on every Google Classroom page |
| 🔍 **Smart Course Detection** | Automatically detects when you switch courses |
| 📦 **Batch Downloads** | Select and download multiple files at once |
| 📁 **15+ File Types** | PDFs, Docs, Slides, Sheets, Images, Videos, and more |
| 🔄 **Multi-Tab Sync** | Badge updates across all open Classroom tabs |
| 💾 **Smart Caching** | Remembers course data even when on dashboard |
| 🌐 **Offline Detection** | Graceful handling when network is unavailable |
| 🔒 **Security Hardened** | Path traversal & XSS prevention built-in |

---

## 📁 Supported File Types

| File Type | Action | Output |
|-----------|--------|--------|
| 📝 Google Docs | Export | PDF |
| 📊 Google Slides | Export | PDF |
| 📈 Google Sheets | Export | XLSX |
| 🎨 Google Drawings | Export | PNG |
| 📄 Regular PDFs | Download | PDF |
| 📽️ PowerPoint | Download | PPTX |
| 📃 Word Documents | Download | DOCX |
| 🖼️ Images | Download | Original |
| 📋 Google Forms | Save Link | TXT |
| ▶️ YouTube Videos | Save Link | TXT |
| 🔗 External Links | Save Link | TXT |

---

## 🚀 Quick Install (2 Minutes)

### Step 1: Download
📥 [**Download ZIP**](https://github.com/MUHAMMAD-FAHAD-AMJAD/SLIDE-DOWNLOADER-EXTENSION/archive/refs/heads/main.zip) and extract to any folder (e.g., Desktop)

### Step 2: Load in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the extracted folder

### Step 3: Start Using
1. Go to [Google Classroom](https://classroom.google.com)
2. Click **"Allow"** when Google asks for permission
3. Visit any course → Click the floating **Download** button
4. Select files → Click **Download** → Done! 🎉

<details>
<summary>📸 <b>See Installation Screenshots</b></summary>

1. **Enable Developer Mode**
   - Go to `chrome://extensions/`
   - Toggle "Developer mode" ON (top-right)

2. **Load the Extension**
   - Click "Load unpacked"
   - Select the extracted folder

3. **Authorize with Google**
   - Use your university/school Google account
   - Allow the requested permissions

</details>

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| "OAuth error" | Sign into your university Google account in Chrome first |
| Button not visible | Refresh the page (`Ctrl+R` / `Cmd+R`) |
| Can't see courses | You must be enrolled in at least one Google Classroom course |
| Downloads failing | Check internet connection and try again |
| "Extension ID error" | Re-download and reinstall the extension |

---

## 🔐 Privacy & Security

| Aspect | Details |
|--------|---------|
| 📊 **Data Collection** | None – all processing is 100% local |
| 🌐 **External Servers** | None – only official Google APIs |
| 🔑 **Credentials** | OAuth tokens only, never passwords |
| 🛡️ **Security** | Path traversal blocking, XSS prevention, rate limiting |

### Why These Permissions?

| Permission | Reason |
|------------|--------|
| `identity` | Sign in with Google OAuth |
| `storage` | Cache course data locally |
| `downloads` | Save files to your computer |
| `classroom.google.com` | Access Classroom pages |
| `googleapis.com` | Fetch files from Google APIs |

---

## 🏗️ Project Structure

```
SLIDE-DOWNLOADER-EXTENSION/
├── manifest.json           # Extension configuration (MV3)
├── background.js           # Service worker (API, auth, downloads)
├── content.js              # Floating button & course detection
├── popup.html/js           # Extension popup UI
├── styles.css              # Styling
├── utils/
│   ├── auth.js             # OAuth 2.0 authentication
│   ├── rateLimiter.js      # API rate limiting (90 req/min)
│   ├── sanitizer.js        # Security sanitization
│   ├── workerState.js      # Service worker persistence
│   ├── largeFileHandler.js # File size validation
│   ├── helpers.js          # Utility functions
│   └── download.js         # Download manager
└── icons/                  # Extension icons
```

---

## 📜 Changelog

### v2.0.0 (Latest)
- 🔒 **Security**: Path traversal & XSS protection
- ⚡ **Performance**: Token bucket rate limiting
- 💾 **Reliability**: Persistent download queue
- 🔐 **Auth**: Proactive token refresh
- 📦 **Downloads**: Large file validation (warn 500MB+, block 2GB+)
- 🛡️ **UX**: Duplicate download prevention

### v1.0.0
- 🎉 Initial release with smart course detection, caching, and batch downloads

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Make your changes and test thoroughly
4. Submit a pull request

---

## 📄 License

This project is licensed under the **MIT License** – see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Made with ❤️ for students everywhere**

⭐ **Star this repo** if ClassMate helped you save time!

[![GitHub](https://img.shields.io/badge/GitHub-MUHAMMAD--FAHAD--AMJAD-181717?logo=github)](https://github.com/MUHAMMAD-FAHAD-AMJAD)

</div>
