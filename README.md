<p align="center">
  <img src="icons/icon128.png" alt="ClassMate Logo" width="128"/>
</p>

<h1 align="center">🎓 ClassMate</h1>
<h3 align="center">Google Classroom Bulk Downloader</h3>

<p align="center">
  <strong>The ultimate Chrome Extension to download ALL your Google Classroom materials with one click!</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-1.0.6-6366f1?style=for-the-badge" alt="Version"/>
  <img src="https://img.shields.io/badge/Manifest-V3-10b981?style=for-the-badge" alt="Manifest V3"/>
  <img src="https://img.shields.io/badge/License-MIT-f59e0b?style=for-the-badge" alt="License"/>
  <img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome"/>
</p>

<p align="center">
  <a href="https://classmateextension.dev">🌐 Website</a> •
  <a href="https://classmateextension.dev/privacy.html">🔒 Privacy Policy</a> •
  <a href="#-quick-install">📦 Install</a> •
  <a href="#-features">✨ Features</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/MUHAMMAD-FAHAD-AMJAD/ClassMate-Classroom-Downloader?style=social" alt="Stars"/>
  <img src="https://img.shields.io/github/forks/MUHAMMAD-FAHAD-AMJAD/ClassMate-Classroom-Downloader?style=social" alt="Forks"/>
  <img src="https://img.shields.io/github/watchers/MUHAMMAD-FAHAD-AMJAD/ClassMate-Classroom-Downloader?style=social" alt="Watchers"/>
</p>

---

## 🚀 Why ClassMate?

Tired of downloading course materials **one by one** from Google Classroom? 😩

**ClassMate** lets you download **ALL** your PDFs, slides, docs, and attachments with a **single click**. Save hours of time and keep your files organized automatically!

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 📥 **One-Click Bulk Downloads**
Download all course materials, assignments, and announcements instantly

### 📁 **Smart Organization**
Files automatically organized by course name and category

### 🔄 **Auto-Convert Google Files**
- Google Docs → PDF
- Google Sheets → Excel
- Google Slides → PDF

</td>
<td width="50%">

### 🔍 **Search & Filter**
Find files by name, type, or uploader in seconds

### 🌙 **Beautiful Dark Mode**
Modern, eye-friendly interface for late-night study sessions

### 🔒 **Privacy First**
100% local processing. No data collection, no tracking, no external servers

</td>
</tr>
</table>

---

## 📦 Quick Install

### Method 1: Download ZIP (Recommended)

1. **Download** → Click green `Code` button → `Download ZIP`
2. **Extract** the ZIP file to a folder
3. **Open Chrome** → Navigate to `chrome://extensions/`
4. **Enable** "Developer Mode" (toggle in top-right)
5. **Click** "Load unpacked" → Select the **extracted folder** (e.g., `ClassMate-Classroom-Downloader-main`)
6. **Done!** 🎉 Visit Google Classroom and look for the green download button

> ⚠️ **Important:** Load the main folder directly, NOT any subfolder!

### Method 2: Git Clone

```bash
git clone https://github.com/MUHAMMAD-FAHAD-AMJAD/ClassMate-Classroom-Downloader.git
# Then load the ClassMate-Classroom-Downloader folder in Chrome
```

---

## 🎯 How to Use

### Option A: Floating Button
1. Go to any Google Classroom course
2. Click the **green download button** (bottom-right corner)
3. Select files → Click **Download**

### Option B: Extension Popup
1. Click the **ClassMate icon** in Chrome toolbar
2. Browse your course files
3. Select and download!

---

## 📁 Project Structure

```
ClassMate-Classroom-Downloader/
├── 📁 icons/               # Extension icons
├── 📁 utils/               # Utility modules
├── 📁 docs/                # Website (GitHub Pages)
├── 📄 manifest.json        # Extension manifest (V3)
├── 📄 background.js        # Service worker
├── 📄 content.js           # Content script
├── 📄 popup.html           # Extension popup
├── 📄 popup.js             # Popup logic
├── 📄 styles.css           # Styles
├── 📄 README.md            # This file
├── 📄 LICENSE              # MIT License
├── 📄 CHANGELOG.md         # Version history
└── 📄 PRIVACY_POLICY.md    # Privacy policy
```

---

## 🔒 Privacy & Security

**Your data stays on YOUR device:**

| ✅ What We Do | ❌ What We DON'T Do |
|--------------|---------------------|
| Process everything locally | Collect personal information |
| Read-only access to Classroom | Store files on any server |
| OAuth 2.0 secure authentication | Track usage or behavior |
| Open source - verify yourself | Share data with third parties |

📖 [Read Full Privacy Policy](https://classmateextension.dev/privacy.html)

---

## 📋 Permissions Explained

| Permission | Why We Need It |
|------------|----------------|
| `identity` | Sign in with your Google account |
| `storage` | Remember your preferences locally |
| `downloads` | Save files to your computer |
| `activeTab` | Interact with Google Classroom page |
| `tabs` | Sync download state across tabs |
| `alarms` | Refresh authentication tokens |

---

## 🛠️ Technical Details

| Spec | Details |
|------|---------|
| **Manifest Version** | 3 (Latest) |
| **Minimum Chrome** | 102+ |
| **Architecture** | Service Worker + Content Script |
| **APIs Used** | Google Classroom API, Google Drive API |
| **Languages** | JavaScript, HTML, CSS |

---

## ⚠️ Known Limitations

- Files download sequentially (not parallel) to respect API limits
- Google Docs export to PDF only
- Single course download at a time
- Shared API quota across all users

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

- 🐛 **Report Bugs** → [Open an Issue](https://github.com/MUHAMMAD-FAHAD-AMJAD/ClassMate-Classroom-Downloader/issues)
- 💡 **Suggest Features** → [Feature Request](https://github.com/MUHAMMAD-FAHAD-AMJAD/ClassMate-Classroom-Downloader/issues/new)
- 🔧 **Submit PRs** → Fork, make changes, submit pull request

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 📞 Contact

- **Developer**: Muhammad Fahad Amjad
- **Email**: f240005@cfd.nu.edu.pk
- **Website**: [classmateextension.dev](https://classmateextension.dev)

---

<p align="center">
  <strong>⭐ Star this repo if ClassMate saved you time! ⭐</strong>
</p>

<p align="center">
  Made with ❤️ for students everywhere<br/>
  <sub>Not affiliated with Google Inc.</sub>
</p>
