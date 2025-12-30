# 🧪 Critical Test Checklist for ClassMate Extension

## 🔧 BUGS FIXED (Latest Session)

### Fixed Bug 1: Links Have No ID
- **Problem**: YouTube links, external links, and Google Forms had no `id` property
- **Result**: When selecting links in popup, background.js couldn't match them
- **Fix**: Added unique IDs: `yt-{videoId}`, `link-{hash}`, `form-{hash}`

### Fixed Bug 2: Links in Announcement Text Not Detected
- **Problem**: URLs embedded in announcement body text were ignored
- **Result**: Google Drive links shared in text weren't downloadable
- **Fix**: Added `extractUrlsFromText()` function to find all URLs

### Fixed Bug 3: Undefined Variable in Progress Monitor
- **Problem**: `filesToDownload.length` was undefined in popup.js
- **Fix**: Changed to `selectedIds.length`

### Fixed Bug 4: getFileType Wrong Structure Check
- **Problem**: Checked `att.youtubeVideo` instead of `att.type === 'youtube'`
- **Fix**: Check processed type first, then fallback to raw API structure

### Fixed Bug 5: Progress Doesn't Show Current File
- **Problem**: Progress bar didn't show which file was being downloaded
- **Fix**: Added `currentFile` to downloadState and progress response

### Fixed Bug 6: Extension Context Invalidated Error
- **Problem**: Generic error message confused users
- **Fix**: Added specific message: "Extension reloaded. Please refresh this page."

### UI Improvements
- Popup width: 420px → 540px
- Popup height: 600px → 820px
- File card padding: 12px → 8px (more compact)
- File card gap: 8px → 5px
- Toolbar padding: 16px → 10px
- Content min-height: added 300px

---

## ✅ What's Already Working (Based on Logs)
- [x] Service worker starts correctly
- [x] OAuth authentication works
- [x] Course detection works
- [x] Single file download works
- [x] Message passing works
- [x] Worker heartbeat active
- [x] Rate limiter initialized

---

## 🔴 CRITICAL TESTS - Must Pass

### Test 1: Links/Resources File Creation (Fixed Bug C1)
**This tests the `createResourcesFile` fix we made**

1. Find a course that has **YouTube links** or **external URLs** (not just PDF files)
2. Select those items and click Download
3. **Expected**: A file named `_Links_and_Resources.txt` should be created in the course folder
4. **If it fails**: Check console for `FileReader` or `createObjectURL` errors

**How to find a course with links:**
- Go to any course → Look for announcements with YouTube videos
- Or materials with Google Form links

### Test 2: Multiple File Selection (Fixed Bug C2)
**This tests the `downloadSelected` fix we made**

1. Go to any course with multiple files
2. Select **3-5 files** using checkboxes
3. Click "Download Selected"
4. **Expected**: ALL selected files should download
5. **If only 1 downloads**: The fix didn't work

### Test 3: "Download All" from Floating Button
**This tests the content.js floating button**

1. Go to Google Classroom course page
2. Click the **floating download button** (bottom-right)
3. In the popup, click "Download All"
4. **Expected**: All course materials should download
5. **Check console for errors**

---

## 🟡 MEDIUM PRIORITY TESTS

### Test 4: Google Docs/Slides Export
**Tests the export functionality**

1. Find a course with **Google Docs** or **Google Slides** (not PDF)
2. Select and download them
3. **Expected**: Should be exported and downloaded as PDF
4. **Check**: File should not be empty/corrupt

### Test 5: Large File Download (>25MB)
**Tests chunked download in largeFileHandler.js**

1. Find a large video or ZIP file in any course
2. Try to download it
3. **Expected**: Should download in chunks without timeout
4. **Watch console** for chunk progress messages

### Test 6: Format Filters
**Tests filtering functionality**

1. Open extension popup
2. Select a format filter (e.g., "PDF only" or "PPT only")
3. **Expected**: Only matching files should appear in list
4. **Test both**: 
   - PDF filter (should show .pdf files)
   - PPT filter (should show .ppt AND .pptx files)

### Test 7: Batch Download with Mixed Content
**Tests complex scenario**

1. Find a course with:
   - PDF files
   - Google Docs
   - YouTube links
   - External URLs
2. Select ALL items
3. Download
4. **Expected**:
   - PDFs download directly
   - Google Docs export to PDF
   - Links collected in `_Links_and_Resources.txt`

---

## 🟢 LOW PRIORITY TESTS

### Test 8: Token Refresh (Wait 50+ minutes)
1. Keep extension open for 50+ minutes
2. Then try to download
3. **Expected**: Should still work (token auto-refreshes)
4. **Check console** for "Proactive refresh" messages

### Test 9: Rate Limiting
1. Try to download 100+ files rapidly
2. **Expected**: Should queue and download without hitting API limits
3. **Check console** for rate limiter messages

### Test 10: Course Switch While Downloading
1. Start downloading from Course A
2. While downloading, switch to Course B tab
3. **Expected**: Course A downloads should complete
4. **Check**: No orphaned downloads

---

## 🛠️ How to Debug Failures

### Open Service Worker Console:
1. Go to `chrome://extensions`
2. Find "ClassMate - Classroom Downloader"
3. Click "Service Worker" link
4. This opens the background script console

### Check for Specific Errors:
```
// Look for these error patterns:
- "createObjectURL is not a function" → Bug C1 not fixed
- "includes is not a function" → Bug C2 not fixed
- "Network error" → API/Auth issue
- "Rate limit exceeded" → Too many requests
- "Export failed" → Google Docs export issue
```

### Enable Verbose Logging:
The extension already has detailed logging. Watch for:
- `[GCR Background]` messages
- `[GCR RateLimiter]` messages
- `[GCR WorkerState]` messages

---

## 📊 Test Results Template

| Test | Status | Notes |
|------|--------|-------|
| T1: Links File | ⬜ | |
| T2: Multiple Select | ⬜ | |
| T3: Floating Button | ⬜ | |
| T4: Docs Export | ⬜ | |
| T5: Large File | ⬜ | |
| T6: Format Filters | ⬜ | |
| T7: Mixed Content | ⬜ | |
| T8: Token Refresh | ⬜ | |
| T9: Rate Limiting | ⬜ | |
| T10: Course Switch | ⬜ | |

**Legend:** ✅ Pass | ❌ Fail | ⬜ Not Tested

---

## 🎯 Priority Order for Testing

1. **Test 1** (Links File) - Tests our C1 fix
2. **Test 2** (Multiple Select) - Tests our C2 fix  
3. **Test 3** (Floating Button) - Tests content.js integration
4. **Test 7** (Mixed Content) - Comprehensive test

If these 4 pass, the critical fixes are working!

---

## 📝 Report Template

If you find a failure, provide:
1. Which test failed
2. Console error message (copy/paste)
3. What you expected vs what happened
4. Course name (helps reproduce)
