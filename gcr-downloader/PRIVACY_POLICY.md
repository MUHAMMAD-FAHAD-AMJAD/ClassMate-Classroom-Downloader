# Privacy Policy for ClassMate Extension

**Last Updated:** January 26, 2026

## Overview

ClassMate is a Chrome extension that helps students download their Google Classroom materials. We are committed to protecting your privacy and being transparent about our data practices.

## Data Collection

### What We Collect (Locally Only)

All data is stored **locally on your device** and never transmitted to external servers:

- **Course Information**: Course names and IDs from your Google Classroom (cached for performance)
- **File Metadata**: Names, types, and sizes of materials (for display purposes only)
- **User Preferences**: Your theme choice (light/dark) and last selected course
- **Download State**: Temporary tracking of download progress (cleared after completion)

### What We DO NOT Collect

- ❌ Your actual files or document contents
- ❌ Your login credentials or passwords
- ❌ Personal information (name, email, student ID)
- ❌ Usage analytics or telemetry
- ❌ Browsing history outside Google Classroom
- ❌ Any data for advertising purposes

## Data Storage

All data is stored **exclusively on your device** using Chrome's built-in storage APIs:

| Storage Type | Purpose | Retention |
|--------------|---------|-----------|
| `chrome.storage.local` | Course cache, theme preference | Until manually cleared or cache expires (30 days) |
| `chrome.storage.session` | Temporary download state | Cleared when browser closes |

### No External Servers

ClassMate operates entirely client-side:
- We do NOT have backend servers
- We do NOT collect or store your data remotely
- All API calls go **directly** from your browser to Google's servers
- Your OAuth tokens are managed by Chrome, not by us

## Third-Party Access

### Google APIs

ClassMate uses the following Google APIs with **read-only** access:

| API | Permission | Purpose |
|-----|------------|---------|
| Classroom API | `classroom.courses.readonly` | List your enrolled courses |
| Classroom API | `classroom.coursework.me.readonly` | View coursework materials |
| Classroom API | `classroom.announcements.readonly` | View course announcements |
| Drive API | `drive.readonly` | Download attached files |

**Important**: We request only `.readonly` permissions. ClassMate **cannot** modify, delete, or create any content in your Classroom or Drive.

### No Third-Party Data Sharing

- We do NOT share data with third parties
- We do NOT use analytics services (Google Analytics, Mixpanel, etc.)
- We do NOT use advertising networks
- We do NOT sell or monetize your data in any way

## Data Security

### Protection Measures

1. **Minimal Permissions**: We only request permissions necessary for functionality
2. **HTTPS Only**: All communication with Google APIs uses encrypted HTTPS
3. **No External Dependencies**: Zero third-party libraries that could leak data
4. **Token Security**: OAuth tokens are stored securely by Chrome, not accessible to websites
5. **Input Sanitization**: All user inputs and filenames are sanitized to prevent security issues

### OAuth Security

Your Google sign-in is handled by Chrome's built-in OAuth system:
- We never see or store your Google password
- Tokens are managed by Chrome, not the extension
- You can revoke access anytime at [Google Account Permissions](https://myaccount.google.com/permissions)

## Data Retention

| Data Type | Retention Period | How to Delete |
|-----------|------------------|---------------|
| Course cache | 30 days auto-expire | Settings → Clear Cache |
| Theme preference | Until changed | Settings → Change theme |
| Download history | Session only | Closes with browser |
| All extension data | Until uninstall | Remove extension |

## Your Rights

### View Your Data

You can inspect all stored data:
1. Open Chrome DevTools (F12)
2. Go to Application → Storage → Local Storage
3. Look for keys starting with `gcr_`

### Delete Your Data

- **Clear cache**: Use the "Clear Cache" option in extension settings
- **Complete removal**: Uninstall the extension to remove all data
- **Revoke access**: Visit [Google Account Permissions](https://myaccount.google.com/permissions) to revoke OAuth access

### Export Your Data

Since all data is stored locally, you can view it directly in Chrome DevTools.

## Children's Privacy

ClassMate may be used by students of all ages. We comply with COPPA (Children's Online Privacy Protection Act) by:
- Not collecting any personal information
- Not tracking user behavior
- Not displaying advertisements
- Storing all data locally on the device

## Changes to This Policy

We may update this privacy policy occasionally. Changes will be reflected in the "Last Updated" date at the top of this document. For significant changes, we will update the extension version and changelog.

## Contact

If you have questions about this privacy policy or ClassMate's data practices:

- **GitHub Issues**: [Report an issue or ask a question](https://github.com/YOUR_USERNAME/classmate-extension/issues)
- **Email**: [Your contact email]

## Summary

| Question | Answer |
|----------|--------|
| Do you collect my data? | No, all data stays on your device |
| Do you share my data? | No, never |
| Do you sell my data? | No, absolutely not |
| Can you see my files? | No, we only see metadata |
| Can you modify my Classroom? | No, we have read-only access |
| How do I delete my data? | Uninstall the extension or clear cache |

---

**TL;DR**: ClassMate stores everything locally on your device. We don't have servers, we don't collect data, and we don't share anything with anyone. Your privacy is protected by design.
