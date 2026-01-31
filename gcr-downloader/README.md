<p align="center">
  <img src="icons/icon128.png" alt="ClassMate Logo" width="120"/>
</p>

<h1 align="center">🎓 ClassMate</h1>
<h3 align="center">Google Classroom Bulk Downloader</h3>

<p align="center">
  <strong>Download all your course materials with one click!</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.2-purple?style=flat-square" alt="Version"/>
  <img src="https://img.shields.io/badge/Manifest-V3-green?style=flat-square" alt="Manifest V3"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License"/>
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome"/>
</p>

<p align="center">
  <a href="https://classmateextension.dev">🌐 Website</a> •
  <a href="https://classmateextension.dev/privacy.html">🔒 Privacy Policy</a> •
  <a href="#-installation">📦 Install</a>
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🚀 **One-Click Downloads** | Download all course materials instantly |
| 📁 **Smart Organization** | Files organized by course automatically |
| 🔄 **Google Docs Export** | Docs → PDF, Sheets → XLSX, Slides → PDF |
| 🔍 **Search & Filter** | Find files by name, type, or uploader |
| 🌙 **Dark Mode** | Modern, eye-friendly interface |
| 🔒 **Privacy First** | No data collection, read-only access |
| ⚡ **Rate Limiting** | Built-in protection against API throttling |

---

## 📦 Installation

### Quick Install (2 minutes)

1. **Download** this repository (Code → Download ZIP)
2. **Extract** the ZIP file
3. **Open Chrome** → Go to `chrome://extensions/`
4. **Enable** "Developer Mode" (top-right toggle)
5. **Click** "Load unpacked" → Select the `gcr-downloader` folder
6. **Done!** Visit Google Classroom and look for the download button

---

## 🎯 How to Use

### Method 1: Floating Button
1. Go to any Google Classroom course
2. Click the **green download button** (bottom-right)
3. Select files → Click Download

### Method 2: Extension Popup
1. Click the ClassMate icon in Chrome toolbar
2. Browse your course files
3. Select and download

---

## 🔒 Privacy & Security

**Your data stays private:**
- ✅ All processing happens locally on your device
- ✅ No external servers or data collection
- ✅ Read-only access to your Classroom
- ✅ OAuth 2.0 secure authentication
- ✅ Open source - verify the code yourself

[Read our full Privacy Policy](https://classmateextension.dev/privacy.html)

---

## 📋 Permissions Explained

| Permission | Why We Need It |
|------------|----------------|
| `identity` | Sign in with Google |
| `storage` | Remember your preferences |
| `downloads` | Save files to your computer |
| `activeTab` | Interact with Classroom page |
| `tabs` | Sync state across tabs |
| `alarms` | Background token refresh |

---

## 🛠️ Technical Details

- **Manifest Version:** 3 (latest)
- **Minimum Chrome:** 100+
- **Architecture:** Service Worker + Content Script
- **APIs Used:** Google Classroom API, Google Drive API

---

## ⚠️ Known Limitations

- Files download one at a time (sequential, not parallel)
- Google Docs export to PDF only (not DOCX)
- Single course at a time
- Shared API quota (10,000 requests/day for all users)

---

## 🤝 Contributing

Contributions welcome! Feel free to:
- 🐛 Report bugs via [Issues](https://github.com/MUHAMMAD-FAHAD-AMJAD/ClassMate-Classroom-Downloader/issues)
- 💡 Suggest features
- 🔧 Submit pull requests

---

## 📄 License

[MIT License](LICENSE) - Feel free to use and modify!

---

<p align="center">
  <strong>Made with ❤️ for students everywhere</strong><br>
  <sub>Not affiliated with Google Inc.</sub>
</p>
