/**
 * ClassMate - Premium Popup Script
 * UI REDESIGN: Dark-mode-first, Gen-Z SaaS aesthetic
 * Backend logic UNCHANGED
 */

// ============================================================================
// STATE
// ============================================================================

let currentState = 'loading';
let courseData = null;
let allFiles = [];
let filteredFiles = [];
let selectedFiles = new Set();

// UI REDESIGN: Enhanced state
let currentSort = 'name-asc';
let currentTypeFilter = 'all';
let currentFormatFilter = null;
let currentUploaderTab = 'all';
let searchQuery = '';
let searchScope = 'name';

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
    // Container
    container: document.getElementById('popup-container'),
    header: document.getElementById('header'),

    // Header
    courseBadge: document.getElementById('course-badge'),
    courseName: document.getElementById('course-name'),
    settingsBtn: document.getElementById('settings-btn'),
    closeBtn: document.getElementById('close-btn'),
    settingsPanel: document.getElementById('settings-panel'),

    // Toolbar - Search
    searchInput: document.getElementById('search-input'),
    searchClear: document.getElementById('search-clear'),
    scopeBtn: document.getElementById('scope-btn'),
    scopeLabel: document.getElementById('scope-label'),
    scopeMenu: document.getElementById('scope-menu'),

    // Toolbar - Sort
    sortBtn: document.getElementById('sort-btn'),
    sortMenu: document.getElementById('sort-menu'),
    sortLabel: document.getElementById('sort-label'),

    // Toolbar - Tabs
    uploaderTabs: document.getElementById('uploader-tabs'),
    tabIndicator: document.getElementById('tab-indicator'),
    countAll: document.getElementById('count-all'),
    countTeacher: document.getElementById('count-teacher'),
    countStudent: document.getElementById('count-student'),

    // Toolbar - Filters Panel
    filtersPanel: document.getElementById('filters-panel'),
    filtersHeader: document.getElementById('filters-header'),
    typeFilters: document.getElementById('type-filters'),
    formatFilters: document.getElementById('format-filters'),

    // Toolbar - Bulk Actions
    selectAllBtn: document.getElementById('select-all-btn'),
    deselectAllBtn: document.getElementById('deselect-all-btn'),
    selectedInfo: document.getElementById('selected-info'),

    // Content
    contentArea: document.getElementById('content-area'),
    stateLoading: document.getElementById('state-loading'),
    stateEmpty: document.getElementById('state-empty'),
    stateError: document.getElementById('state-error'),
    stateAuth: document.getElementById('state-auth'),
    stateData: document.getElementById('state-data'),
    errorMessage: document.getElementById('error-message'),
    searchEmpty: document.getElementById('search-empty'),
    searchEmptyText: document.getElementById('search-empty-text'),

    // Categories
    categoryMaterials: document.getElementById('category-materials'),
    categoryAnnouncements: document.getElementById('category-announcements'),
    categoryAssignments: document.getElementById('category-assignments'),
    categoryLinks: document.getElementById('category-links'),
    materialsList: document.getElementById('materials-list'),
    announcementsList: document.getElementById('announcements-list'),
    assignmentsList: document.getElementById('assignments-list'),
    linksList: document.getElementById('links-list'),
    materialsCount: document.getElementById('materials-count'),
    announcementsCount: document.getElementById('announcements-count'),
    assignmentsCount: document.getElementById('assignments-count'),
    linksCount: document.getElementById('links-count'),

    // Filter counts
    filterCountAll: document.getElementById('filter-count-all'),
    filterCountMaterials: document.getElementById('filter-count-materials'),
    filterCountAnnouncements: document.getElementById('filter-count-announcements'),
    filterCountLinks: document.getElementById('filter-count-links'),
    filterCountPdf: document.getElementById('filter-count-pdf'),
    filterCountSlides: document.getElementById('filter-count-slides'),
    filterCountDocs: document.getElementById('filter-count-docs'),

    // Footer
    selectedCount: document.getElementById('selected-count'),
    selectedSize: document.getElementById('selected-size'),
    refreshBtn: document.getElementById('refresh-btn'),
    refreshIcon: document.getElementById('refresh-icon'),
    downloadBtn: document.getElementById('download-btn'),
    downloadBadge: document.getElementById('download-badge'),

    // Progress
    progressOverlay: document.getElementById('progress-overlay'),
    progressFile: document.getElementById('progress-file'),
    progressFill: document.getElementById('progress-fill'),
    progressStats: document.getElementById('progress-stats'),
    cancelDownloadBtn: document.getElementById('cancel-download-btn'),

    // Auth
    signInBtn: document.getElementById('sign-in-btn'),
    retryBtn: document.getElementById('retry-btn')
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// UI REDESIGN: THEME MANAGEMENT
// ============================================================================

function initTheme() {
    chrome.storage.local.get(['gcr_theme'], (result) => {
        const theme = result.gcr_theme || 'dark'; // UI REDESIGN: Default to dark
        applyTheme(theme);
        updateThemeUI(theme);
    });
}

function applyTheme(theme) {
    let effectiveTheme = theme;
    if (theme === 'system') {
        effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effectiveTheme);
}

function updateThemeUI(theme) {
    document.querySelectorAll('.gcr-theme-option').forEach(el => {
        el.classList.toggle('active', el.dataset.theme === theme);
    });
}

function setTheme(theme) {
    chrome.storage.local.set({ gcr_theme: theme });
    applyTheme(theme);
    updateThemeUI(theme);
}

// ============================================================================
// UI REDESIGN: SEARCH WITH SCOPE
// ============================================================================

function handleSearch(query) {
    searchQuery = query.toLowerCase().trim();
    elements.searchClear?.classList.toggle('visible', query.length > 0);
    applyFiltersAndSort();
}

const debouncedSearch = debounce(handleSearch, 300);

function setSearchScope(scope) {
    searchScope = scope;
    const labels = { 'name': 'Name', 'type': 'Type', 'uploader': 'Uploader' };
    if (elements.scopeLabel) elements.scopeLabel.textContent = labels[scope];

    document.querySelectorAll('.gcr-search-scope-option').forEach(el => {
        el.classList.toggle('active', el.dataset.scope === scope);
    });

    elements.scopeMenu?.classList.remove('open');

    // Re-apply search with new scope
    if (searchQuery) applyFiltersAndSort();
}

function highlightMatch(text, query) {
    if (!query || !text) return escapeHtml(text || '');
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, '<span class="gcr-highlight">$1</span>');
}

// ============================================================================
// UI REDESIGN: TAB NAVIGATION (Teacher/Student)
// ============================================================================

function setUploaderTab(tab) {
    currentUploaderTab = tab;

    // Update tab UI
    document.querySelectorAll('.gcr-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });

    // Move indicator
    updateTabIndicator();

    applyFiltersAndSort();
}

function updateTabIndicator() {
    const activeTab = document.querySelector('.gcr-tab.active');
    if (activeTab && elements.tabIndicator) {
        elements.tabIndicator.style.left = `${activeTab.offsetLeft}px`;
        elements.tabIndicator.style.width = `${activeTab.offsetWidth}px`;
    }
}

// ============================================================================
// UI REDESIGN: SMART FILTERS
// ============================================================================

function setTypeFilter(filter) {
    currentTypeFilter = filter;
    document.querySelectorAll('#type-filters .gcr-filter-pill').forEach(el => {
        el.classList.toggle('active', el.dataset.filter === filter);
    });
    applyFiltersAndSort();
}

function setFormatFilter(format) {
    // Toggle format filter
    if (currentFormatFilter === format) {
        currentFormatFilter = null;
    } else {
        currentFormatFilter = format;
    }

    document.querySelectorAll('#format-filters .gcr-filter-pill').forEach(el => {
        el.classList.toggle('active', el.dataset.format === currentFormatFilter);
    });
    applyFiltersAndSort();
}

function toggleFiltersPanel() {
    elements.filtersPanel?.classList.toggle('collapsed');
}

// ============================================================================
// UI REDESIGN: SORT
// ============================================================================

function setSort(sortBy) {
    currentSort = sortBy;
    const labels = {
        'name-asc': 'A-Z',
        'name-desc': 'Z-A',
        'date-desc': 'Newest',
        'date-asc': 'Oldest',
        'size-desc': 'Largest',
        'size-asc': 'Smallest',
        'type': 'Type',
        'category': 'Category'
    };
    if (elements.sortLabel) elements.sortLabel.textContent = labels[sortBy] || 'Sort';

    document.querySelectorAll('.gcr-sort-option').forEach(el => {
        el.classList.toggle('active', el.dataset.sort === sortBy);
    });

    elements.sortMenu?.classList.remove('open');
    elements.sortBtn?.classList.remove('open');
    applyFiltersAndSort();
}

function sortFiles(files) {
    const sorted = [...files];

    switch (currentSort) {
        case 'name-asc':
            sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        case 'name-desc':
            sorted.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            break;
        case 'date-desc':
            sorted.sort((a, b) => (b.date || 0) - (a.date || 0));
            break;
        case 'date-asc':
            sorted.sort((a, b) => (a.date || 0) - (b.date || 0));
            break;
        case 'size-desc':
            sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
            break;
        case 'size-asc':
            sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
            break;
        case 'type':
            sorted.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
            break;
        case 'category':
            sorted.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
            break;
    }

    return sorted;
}

// ============================================================================
// UI REDESIGN: APPLY ALL FILTERS AND SORT
// ============================================================================

function applyFiltersAndSort() {
    let filtered = [...allFiles];

    // Search filter with scope
    if (searchQuery) {
        filtered = filtered.filter(f => {
            switch (searchScope) {
                case 'name':
                    return f.name?.toLowerCase().includes(searchQuery);
                case 'type':
                    return f.type?.toLowerCase().includes(searchQuery);
                case 'uploader':
                    return f.uploader?.toLowerCase().includes(searchQuery);
                default:
                    return f.name?.toLowerCase().includes(searchQuery);
            }
        });
    }

    // Uploader tab filter
    if (currentUploaderTab !== 'all') {
        filtered = filtered.filter(f => f.uploader === currentUploaderTab);
    }

    // Type filter (links is special - filter by type not category)
    if (currentTypeFilter !== 'all') {
        if (currentTypeFilter === 'links') {
            // Links filter shows all link-type files (youtube, link, form)
            filtered = filtered.filter(f => f.isLink || f.type === 'link' || f.type === 'youtube');
        } else {
            filtered = filtered.filter(f => f.category === currentTypeFilter);
        }
    }

    // Format filter
    if (currentFormatFilter) {
        const formatTypes = {
            'pdf': ['pdf'],
            'slides': ['ppt', 'pptx'],
            'docs': ['doc', 'docx']
        };
        const types = formatTypes[currentFormatFilter] || [];
        filtered = filtered.filter(f => types.includes(f.type?.toLowerCase()));
    }

    // Sort
    filteredFiles = sortFiles(filtered);

    // Render
    renderFileList();

    // Show/hide search empty state
    const hasFiles = filteredFiles.length > 0;
    if (!hasFiles && (searchQuery || currentTypeFilter !== 'all' || currentFormatFilter || currentUploaderTab !== 'all')) {
        elements.searchEmpty?.classList.remove('hidden');
        if (elements.searchEmptyText) {
            if (searchQuery) {
                elements.searchEmptyText.textContent = `No files match "${searchQuery}"`;
            } else {
                elements.searchEmptyText.textContent = 'No files match your filters';
            }
        }
        elements.stateData?.classList.add('hidden');
    } else {
        elements.searchEmpty?.classList.add('hidden');
        if (hasFiles) {
            elements.stateData?.classList.remove('hidden');
        }
    }
}

// ============================================================================
// UI REDESIGN: RENDER FILE LIST
// ============================================================================

function renderFileList() {
    // Separate files from links
    const materials = filteredFiles.filter(f => f.category === 'materials' && !f.isLink);
    const announcements = filteredFiles.filter(f => f.category === 'announcements' && !f.isLink);
    const assignments = filteredFiles.filter(f => f.category === 'assignments' && !f.isLink);
    const links = filteredFiles.filter(f => f.isLink);

    renderCategory('materials', materials, elements.materialsList, elements.materialsCount);
    renderCategory('announcements', announcements, elements.announcementsList, elements.announcementsCount);
    renderCategory('assignments', assignments, elements.assignmentsList, elements.assignmentsCount);
    renderCategory('links', links, elements.linksList, elements.linksCount, true);

    // Hide empty categories
    elements.categoryMaterials?.classList.toggle('hidden', materials.length === 0);
    elements.categoryAnnouncements?.classList.toggle('hidden', announcements.length === 0);
    elements.categoryAssignments?.classList.toggle('hidden', assignments.length === 0);
    elements.categoryLinks?.classList.toggle('hidden', links.length === 0);

    updateSelectionUI();
}

function renderCategory(category, files, listEl, countEl, isLinks = false) {
    if (!listEl || !countEl) return;

    const label = isLinks ? 'link' : 'file';
    countEl.textContent = `${files.length} ${label}${files.length !== 1 ? 's' : ''}`;
    listEl.innerHTML = '';

    files.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'gcr-file-card';
        div.dataset.fileId = file.id;
        div.style.animationDelay = `${Math.min(index * 0.05, 0.3)}s`;

        if (selectedFiles.has(file.id)) {
            div.classList.add('selected');
        }

        const icon = getFileIcon(file.type);
        const iconClass = getFileIconClass(file.type);
        const name = searchScope === 'name' && searchQuery
            ? highlightMatch(file.name, searchQuery)
            : escapeHtml(file.name || 'Untitled');

        // Build metadata string
        const metaParts = [];
        if (file.type) metaParts.push(`<span>${escapeHtml(file.type.toUpperCase())}</span>`);
        if (file.size) metaParts.push(`<span>${formatSize(file.size)}</span>`);
        if (file.uploader) {
            const badge = file.uploader === 'teacher'
                ? '<span class="gcr-uploader-badge teacher">👨‍🏫</span>'
                : '<span class="gcr-uploader-badge student">👨‍🎓</span>';
            metaParts.push(badge);
        }
        if (file.dateStr) metaParts.push(`<span>${file.dateStr}</span>`);

        div.innerHTML = `
            <input type="checkbox" class="gcr-file-checkbox" ${selectedFiles.has(file.id) ? 'checked' : ''} aria-label="Select ${escapeHtml(file.name)}">
            <div class="gcr-file-icon ${iconClass}">${icon}</div>
            <div class="gcr-file-info">
                <div class="gcr-file-name" title="${escapeHtml(file.name || '')}">${name}</div>
                <div class="gcr-file-meta">${metaParts.join('')}</div>
            </div>
            <div class="gcr-file-actions">
                <button class="gcr-file-action" title="Download" data-action="download" aria-label="Download file">⬇️</button>
            </div>
        `;

        // Event listeners
        const checkbox = div.querySelector('.gcr-file-checkbox');
        checkbox?.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleFileSelection(file.id);
        });

        div.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    toggleFileSelection(file.id);
                }
            }
        });

        const downloadBtn = div.querySelector('[data-action="download"]');
        downloadBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            quickDownload(file, downloadBtn);
        });

        listEl.appendChild(div);
    });
}

function getFileIcon(type) {
    const icons = {
        'pdf': '📄',
        'doc': '📝',
        'docx': '📝',
        'ppt': '📊',
        'pptx': '📊',
        'xls': '📊',
        'xlsx': '📊',
        'jpg': '📸',
        'jpeg': '📸',
        'png': '📸',
        'gif': '📸',
        'mp4': '🎥',
        'mov': '🎥',
        'mp3': '🎵',
        'zip': '📦',
        'link': '🔗',
        'youtube': '▶️',
        'drive': '📁'
    };
    return icons[type?.toLowerCase()] || '📄';
}

function getFileIconClass(type) {
    const classes = {
        'pdf': 'pdf',
        'doc': 'docs',
        'docx': 'docs',
        'ppt': 'slides',
        'pptx': 'slides',
        'xls': 'sheets',
        'xlsx': 'sheets',
        'jpg': 'images',
        'jpeg': 'images',
        'png': 'images',
        'gif': 'images',
        'mp4': 'videos',
        'mov': 'videos',
        'link': 'links',
        'youtube': 'videos'
    };
    return classes[type?.toLowerCase()] || '';
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================================
// UI REDESIGN: SELECTION MANAGEMENT
// ============================================================================

function toggleFileSelection(fileId) {
    if (selectedFiles.has(fileId)) {
        selectedFiles.delete(fileId);
    } else {
        selectedFiles.add(fileId);
    }
    updateSelectionUI();
    updateFileUI(fileId);
}

function selectAll() {
    filteredFiles.forEach(f => selectedFiles.add(f.id));
    updateSelectionUI();
    document.querySelectorAll('.gcr-file-card').forEach(el => {
        el.classList.add('selected');
        const checkbox = el.querySelector('.gcr-file-checkbox');
        if (checkbox) checkbox.checked = true;
    });
}

function deselectAll() {
    selectedFiles.clear();
    updateSelectionUI();
    document.querySelectorAll('.gcr-file-card').forEach(el => {
        el.classList.remove('selected');
        const checkbox = el.querySelector('.gcr-file-checkbox');
        if (checkbox) checkbox.checked = false;
    });
}

function updateFileUI(fileId) {
    const el = document.querySelector(`[data-file-id="${fileId}"]`);
    if (el) {
        el.classList.toggle('selected', selectedFiles.has(fileId));
        const checkbox = el.querySelector('.gcr-file-checkbox');
        if (checkbox) checkbox.checked = selectedFiles.has(fileId);
    }
}

function updateSelectionUI() {
    const count = selectedFiles.size;
    if (elements.selectedCount) elements.selectedCount.textContent = count;

    // Calculate total size
    let totalSize = 0;
    let hasUnknownSize = false;
    selectedFiles.forEach(id => {
        const file = allFiles.find(f => f.id === id);
        if (file?.size) {
            totalSize += file.size;
        } else {
            hasUnknownSize = true;
        }
    });

    if (elements.selectedSize) {
        if (count === 0) {
            elements.selectedSize.textContent = 'Select files to download';
        } else if (hasUnknownSize && totalSize > 0) {
            elements.selectedSize.textContent = `~${formatSize(totalSize)}+`;
        } else if (totalSize > 0) {
            elements.selectedSize.textContent = formatSize(totalSize);
        } else {
            elements.selectedSize.textContent = `${count} files`;
        }
    }

    // Update info in toolbar
    if (elements.selectedInfo) {
        elements.selectedInfo.textContent = count > 0 ? `${count} files • ${formatSize(totalSize) || 'unknown size'}` : '0 files selected';
    }

    // Update download button
    if (elements.downloadBtn) elements.downloadBtn.disabled = count === 0;
    if (elements.downloadBadge) {
        elements.downloadBadge.textContent = count;
        elements.downloadBadge.classList.toggle('hidden', count === 0);
    }
}

// ============================================================================
// UI REDESIGN: CATEGORY COLLAPSE
// ============================================================================

function toggleCategory(categoryEl) {
    categoryEl?.classList.toggle('collapsed');
}

// ============================================================================
// UI REDESIGN: QUICK DOWNLOAD
// ============================================================================

async function quickDownload(file, btnEl) {
    if (!btnEl) return;

    btnEl.classList.add('downloading');
    btnEl.innerHTML = '<span class="animate-spin">⏳</span>';

    try {
        const response = await sendMessage({
            type: 'DOWNLOAD_FILES',
            selectedItems: [file.original || file]
        });

        if (response.success) {
            btnEl.classList.remove('downloading');
            btnEl.classList.add('success');
            btnEl.innerHTML = '✅';
        } else {
            btnEl.classList.remove('downloading');
            btnEl.classList.add('error');
            btnEl.innerHTML = '❌';
        }
    } catch (e) {
        btnEl.classList.remove('downloading');
        btnEl.classList.add('error');
        btnEl.innerHTML = '❌';
    }

    setTimeout(() => {
        btnEl.classList.remove('downloading', 'success', 'error');
        btnEl.innerHTML = '⬇️';
    }, 2000);
}

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

function showState(stateName) {
    currentState = stateName;

    elements.stateLoading?.classList.add('hidden');
    elements.stateEmpty?.classList.add('hidden');
    elements.stateError?.classList.add('hidden');
    elements.stateAuth?.classList.add('hidden');
    elements.stateData?.classList.add('hidden');
    elements.searchEmpty?.classList.add('hidden');

    const stateEl = document.getElementById(`state-${stateName}`);
    if (stateEl) {
        stateEl.classList.remove('hidden');
    }
}

function showError(message) {
    if (elements.errorMessage) elements.errorMessage.textContent = message;
    showState('error');
}

// ============================================================================
// DATA LOADING (UNCHANGED BACKEND LOGIC)
// ============================================================================

async function loadCachedData() {
    showState('loading');

    try {
        const response = await sendMessage({ type: 'GET_CACHED_DATA' });

        if (!response.success) {
            showError(response.error || 'Failed to load data');
            return;
        }

        if (!response.data) {
            showState('empty');
            return;
        }

        courseData = response.data;
        processAndDisplayData(courseData);
        showState('data');

    } catch (error) {
        console.error('[GCR Popup] Load error:', error);
        showError(error.message);
    }
}

function processAndDisplayData(data) {
    // Update header
    if (elements.courseName) {
        elements.courseName.textContent = data.courseName || 'Course';
    }

    // Process all files into flat array
    allFiles = [];

    // Materials
    if (data.materials) {
        data.materials.forEach(item => {
            if (item.attachments) {
                item.attachments.forEach(att => {
                    const fileType = getFileType(att);
                    const isLink = att.isLink || fileType === 'link' || fileType === 'youtube';
                    allFiles.push({
                        id: att.id || `mat-${Math.random().toString(36).substr(2, 9)}`,
                        name: att.title || att.name || 'Untitled',
                        type: fileType,
                        isLink: isLink,
                        size: att.size || null,
                        date: item.creationTime ? new Date(item.creationTime).getTime() : null,
                        dateStr: item.creationTime ? formatDate(item.creationTime) : null,
                        category: 'materials',
                        uploader: item.creatorUserId ? 'teacher' : null,
                        url: att.url || att.alternateLink,
                        original: att
                    });
                });
            }
        });
    }

    // Announcements
    if (data.announcements) {
        data.announcements.forEach(item => {
            if (item.attachments) {
                item.attachments.forEach(att => {
                    const fileType = getFileType(att);
                    const isLink = att.isLink || fileType === 'link' || fileType === 'youtube';
                    allFiles.push({
                        id: att.id || `ann-${Math.random().toString(36).substr(2, 9)}`,
                        name: att.title || att.name || 'Untitled',
                        type: fileType,
                        isLink: isLink,
                        size: att.size || null,
                        date: item.creationTime ? new Date(item.creationTime).getTime() : null,
                        dateStr: item.creationTime ? formatDate(item.creationTime) : null,
                        category: 'announcements',
                        uploader: item.creatorUserId ? 'teacher' : null,
                        url: att.url || att.alternateLink,
                        original: att
                    });
                });
            }
        });
    }

    // Assignments
    if (data.assignments) {
        data.assignments.forEach(item => {
            if (item.attachments) {
                item.attachments.forEach(att => {
                    const fileType = getFileType(att);
                    const isLink = att.isLink || fileType === 'link' || fileType === 'youtube';
                    allFiles.push({
                        id: att.id || `asg-${Math.random().toString(36).substr(2, 9)}`,
                        name: att.title || att.name || 'Untitled',
                        type: fileType,
                        isLink: isLink,
                        size: att.size || null,
                        date: item.creationTime ? new Date(item.creationTime).getTime() : null,
                        dateStr: item.creationTime ? formatDate(item.creationTime) : null,
                        category: 'assignments',
                        uploader: item.creatorUserId ? 'teacher' : null,
                        url: att.url || att.alternateLink,
                        original: att
                    });
                });
            }
        });
    }

    // Update counts
    updateFilterCounts();

    // Select all by default
    allFiles.forEach(f => selectedFiles.add(f.id));

    // Apply filters and render
    applyFiltersAndSort();

    // Update tab indicator position
    setTimeout(updateTabIndicator, 100);
}

function updateFilterCounts() {
    const total = allFiles.length;
    // Count materials/announcements/assignments WITHOUT links (links have their own category)
    const materials = allFiles.filter(f => f.category === 'materials' && !f.isLink).length;
    const announcements = allFiles.filter(f => f.category === 'announcements' && !f.isLink).length;
    const links = allFiles.filter(f => f.isLink).length;
    const pdfs = allFiles.filter(f => f.type === 'pdf').length;
    const slides = allFiles.filter(f => ['ppt', 'pptx', 'xlsx'].includes(f.type?.toLowerCase())).length;
    const docs = allFiles.filter(f => ['doc', 'docx'].includes(f.type?.toLowerCase())).length;
    const teachers = allFiles.filter(f => f.uploader === 'teacher').length;
    const students = allFiles.filter(f => f.uploader === 'student').length;

    // Tab counts
    if (elements.countAll) elements.countAll.textContent = total;
    if (elements.countTeacher) elements.countTeacher.textContent = teachers;
    if (elements.countStudent) elements.countStudent.textContent = students;

    // Filter counts
    if (elements.filterCountAll) elements.filterCountAll.textContent = total;
    if (elements.filterCountMaterials) elements.filterCountMaterials.textContent = materials;
    if (elements.filterCountAnnouncements) elements.filterCountAnnouncements.textContent = announcements;
    if (elements.filterCountLinks) elements.filterCountLinks.textContent = links;
    if (elements.filterCountPdf) elements.filterCountPdf.textContent = pdfs;
    if (elements.filterCountSlides) elements.filterCountSlides.textContent = slides;
    if (elements.filterCountDocs) elements.filterCountDocs.textContent = docs;
}

function getFileType(att) {
    // Check processed attachment type first (from background.js processMaterials)
    if (att.type === 'youtube') return 'youtube';
    if (att.type === 'link') return 'link';
    if (att.type === 'form') return 'link';
    
    // Check if it's a link (isLink flag)
    if (att.isLink) return 'link';
    
    // Check mimeType directly on attachment (for driveFile type)
    const mime = att.mimeType || '';
    if (mime) {
        if (mime.includes('pdf')) return 'pdf';
        if (mime.includes('spreadsheet')) return 'xlsx';
        if (mime.includes('presentation')) return 'pptx';
        if (mime.includes('document')) return 'docx';
        if (mime.includes('image')) return 'jpg';
        if (mime.includes('video')) return 'mp4';
        // Google Workspace files
        if (mime === 'application/vnd.google-apps.spreadsheet') return 'xlsx';
        if (mime === 'application/vnd.google-apps.presentation') return 'pptx';
        if (mime === 'application/vnd.google-apps.document') return 'docx';
    }
    
    // Legacy checks for raw API response structure
    if (att.youtubeVideo) return 'youtube';
    if (att.link) return 'link';
    if (att.driveFile) {
        const driveMime = att.driveFile.driveFile?.mimeType || att.driveFile?.mimeType || '';
        if (driveMime.includes('pdf')) return 'pdf';
        if (driveMime.includes('spreadsheet')) return 'xlsx';
        if (driveMime.includes('presentation')) return 'pptx';
        if (driveMime.includes('document')) return 'docx';
        if (driveMime.includes('image')) return 'jpg';
        if (driveMime.includes('video')) return 'mp4';
        return 'drive';
    }
    return 'file';
}

function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        if (diff < 24 * 60 * 60 * 1000) {
            const hours = Math.floor(diff / (60 * 60 * 1000));
            if (hours < 1) return 'Just now';
            return `${hours}h ago`;
        }
        if (diff < 7 * 24 * 60 * 60 * 1000) {
            const days = Math.floor(diff / (24 * 60 * 60 * 1000));
            return `${days}d ago`;
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return null;
    }
}

// ============================================================================
// ACTIONS (UNCHANGED BACKEND LOGIC)
// ============================================================================

async function refreshData() {
    if (elements.refreshIcon) elements.refreshIcon.classList.add('animate-spin');

    try {
        const lastCourse = await sendMessage({ type: 'GET_LAST_COURSE' });

        if (!lastCourse.success || !lastCourse.courseId) {
            showState('empty');
            return;
        }

        const response = await sendMessage({
            type: 'FETCH_COURSE_DATA',
            courseId: lastCourse.courseId,
            courseName: lastCourse.courseName
        });

        if (response.success && response.data) {
            courseData = response.data;
            selectedFiles.clear();
            processAndDisplayData(courseData);
            showState('data');
        } else {
            showError(response.error || 'Failed to refresh data');
        }
    } catch (error) {
        console.error('[GCR Popup] Refresh error:', error);
        showError(error.message);
    } finally {
        if (elements.refreshIcon) elements.refreshIcon.classList.remove('animate-spin');
    }
}

async function downloadSelected() {
    if (selectedFiles.size === 0) return;

    // Get selected file IDs (background.js expects array of ID strings)
    const selectedIds = Array.from(selectedFiles);

    // Show progress overlay
    elements.progressOverlay?.classList.add('visible');
    if (elements.progressFile) elements.progressFile.textContent = 'Starting...';
    if (elements.progressFill) elements.progressFill.style.width = '0%';
    if (elements.progressStats) elements.progressStats.textContent = `0 / ${selectedIds.length} files`;

    try {
        const response = await sendMessage({
            type: 'DOWNLOAD_FILES',
            selectedItems: selectedIds
        });

        if (!response.success) {
            showError(response.error || 'Download failed');
            return;
        }

        await monitorProgress(selectedIds.length);

    } catch (error) {
        console.error('[GCR Popup] Download error:', error);
        showError(error.message);
    } finally {
        elements.progressOverlay?.classList.remove('visible');
    }
}

async function monitorProgress(total) {
    while (true) {
        const response = await sendMessage({ type: 'GET_DOWNLOAD_PROGRESS' });

        if (!response.success || !response.active) {
            if (elements.progressFill) elements.progressFill.style.width = '100%';
            if (elements.progressFile) elements.progressFile.textContent = 'Complete!';
            await new Promise(r => setTimeout(r, 1000));
            break;
        }

        const percent = Math.round((response.completed / total) * 100);
        if (elements.progressFill) elements.progressFill.style.width = `${percent}%`;
        if (elements.progressFile) elements.progressFile.textContent = response.currentFile || 'Downloading...';
        if (elements.progressStats) elements.progressStats.textContent = `${response.completed} / ${total} files`;

        await new Promise(r => setTimeout(r, 500));
    }
}

async function cancelDownload() {
    await sendMessage({ type: 'CANCEL_DOWNLOADS' });
    elements.progressOverlay?.classList.remove('visible');
}

async function signIn() {
    try {
        const response = await sendMessage({ type: 'GET_AUTH_TOKEN', interactive: true });
        if (response.success) {
            loadCachedData();
        } else {
            showError(response.error || 'Sign in failed');
        }
    } catch (error) {
        console.error('[GCR Popup] Sign in error:', error);
        showError(error.message);
    }
}

// ============================================================================
// MESSAGE PASSING (UNCHANGED)
// ============================================================================

function sendMessage(message) {
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response || { success: false, error: 'No response' });
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

// Header scroll shadow
elements.contentArea?.addEventListener('scroll', () => {
    elements.header?.classList.toggle('scrolled', elements.contentArea.scrollTop > 10);
});

// Settings
elements.settingsBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.settingsPanel?.classList.toggle('open');
});

elements.closeBtn?.addEventListener('click', () => {
    window.close();
});

// Theme options
document.querySelectorAll('.gcr-theme-option').forEach(el => {
    el.addEventListener('click', () => {
        setTheme(el.dataset.theme);
        elements.settingsPanel?.classList.remove('open');
    });
});

// Search
elements.searchInput?.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
});

elements.searchClear?.addEventListener('click', () => {
    if (elements.searchInput) elements.searchInput.value = '';
    handleSearch('');
});

// Search scope
elements.scopeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.scopeMenu?.classList.toggle('open');
});

document.querySelectorAll('.gcr-search-scope-option').forEach(el => {
    el.addEventListener('click', () => {
        setSearchScope(el.dataset.scope);
    });
});

// Sort
elements.sortBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.sortMenu?.classList.toggle('open');
    elements.sortBtn?.classList.toggle('open');
});

document.querySelectorAll('.gcr-sort-option').forEach(el => {
    el.addEventListener('click', () => {
        setSort(el.dataset.sort);
    });
});

// Tabs
document.querySelectorAll('.gcr-tab').forEach(el => {
    el.addEventListener('click', () => {
        setUploaderTab(el.dataset.tab);
    });
});

// Filters panel toggle
elements.filtersHeader?.addEventListener('click', toggleFiltersPanel);

// Type filters
document.querySelectorAll('#type-filters .gcr-filter-pill').forEach(el => {
    el.addEventListener('click', () => {
        setTypeFilter(el.dataset.filter);
    });
});

// Format filters
document.querySelectorAll('#format-filters .gcr-filter-pill').forEach(el => {
    el.addEventListener('click', () => {
        setFormatFilter(el.dataset.format);
    });
});

// Selection
elements.selectAllBtn?.addEventListener('click', selectAll);
elements.deselectAllBtn?.addEventListener('click', deselectAll);

// Category collapse
document.querySelectorAll('.gcr-category-header').forEach(el => {
    el.addEventListener('click', () => {
        toggleCategory(el.parentElement);
    });
});

// Footer actions
elements.refreshBtn?.addEventListener('click', refreshData);
elements.downloadBtn?.addEventListener('click', downloadSelected);
elements.cancelDownloadBtn?.addEventListener('click', cancelDownload);

// Auth
elements.signInBtn?.addEventListener('click', signIn);
elements.retryBtn?.addEventListener('click', loadCachedData);

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.gcr-sort')) {
        elements.sortMenu?.classList.remove('open');
        elements.sortBtn?.classList.remove('open');
    }
    if (!e.target.closest('.gcr-search-scope')) {
        elements.scopeMenu?.classList.remove('open');
    }
    if (!e.target.closest('.gcr-settings') && !e.target.closest('#settings-btn')) {
        elements.settingsPanel?.classList.remove('open');
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + F = Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        elements.searchInput?.focus();
    }
    // Escape = Clear search / Close dropdowns
    if (e.key === 'Escape') {
        if (elements.searchInput?.value) {
            elements.searchInput.value = '';
            handleSearch('');
        }
        elements.sortMenu?.classList.remove('open');
        elements.scopeMenu?.classList.remove('open');
        elements.settingsPanel?.classList.remove('open');
    }
    // Ctrl/Cmd + A = Select all (when not in input)
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        selectAll();
    }
});

// Window resize - update tab indicator
window.addEventListener('resize', updateTabIndicator);

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('[ClassMate] Initializing premium UI...');
    initTheme();
    loadCachedData();

    // Initial tab indicator position
    setTimeout(updateTabIndicator, 100);
});

console.log('[ClassMate] Premium popup script loaded');
