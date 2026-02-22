import './style.css';
import 'github-markdown-css/github-markdown.css';
import hljs from 'highlight.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { decompressFromEncodedURIComponent } from 'lz-string';
import QRCode from 'qrcode';

// ===== Visitor ID (persisted in localStorage) =====
const VISITOR_KEY = 'md-viewer-visitor-id';

function getVisitorId() {
  return localStorage.getItem(VISITOR_KEY);
}

function setVisitorId(id) {
  if (id) localStorage.setItem(VISITOR_KEY, id);
}

function visitorHeaders() {
  const id = getVisitorId();
  return id ? { 'x-visitor-id': id } : {};
}

function captureVisitorId(res) {
  const id = res.headers.get('x-visitor-id');
  if (id) setVisitorId(id);
}

// ===== API Client =====
const api = {
  async get(path) {
    const res = await fetch(path, { credentials: 'include', headers: visitorHeaders() });
    captureVisitorId(res);
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...visitorHeaders() },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    captureVisitorId(res);
    if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
    return res.json();
  },
  async patch(path, body) {
    const res = await fetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...visitorHeaders() },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    captureVisitorId(res);
    if (!res.ok) throw new Error(`PATCH ${path}: ${res.status}`);
    return res.json();
  },
  async del(path) {
    const res = await fetch(path, { method: 'DELETE', credentials: 'include', headers: visitorHeaders() });
    captureVisitorId(res);
    if (!res.ok) throw new Error(`DELETE ${path}: ${res.status}`);
    return res.json();
  },
};

// ===== Constants =====
const THEME_KEY = 'md-viewer-theme';
const THEMES = ['light', 'dark', 'dracula', 'monokai', 'one-dark', 'solarized', 'nord'];
const DARK_THEMES = ['dark', 'dracula', 'monokai', 'one-dark', 'solarized', 'nord'];

// ===== Highlight.js Theme =====
function loadHighlightTheme() {
  const existingLink = document.querySelector('link[data-hljs-theme]');
  if (existingLink) existingLink.remove();

  const theme = document.documentElement.getAttribute('data-theme');
  const themeFile = DARK_THEMES.includes(theme) ? 'github-dark' : 'github';

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${themeFile}.min.css`;
  link.setAttribute('data-hljs-theme', '');
  document.head.appendChild(link);
}

// ===== Marked Configuration =====
marked.setOptions({
  gfm: true,
  breaks: true,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
});

const renderer = new marked.Renderer();
let tocEntries = [];

renderer.heading = function ({ text, depth }) {
  const slug = text.replace(/<[^>]*>/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  tocEntries.push({ text: text.replace(/<[^>]*>/g, ''), depth, slug });
  return `<h${depth} id="${slug}">${text}</h${depth}>`;
};

renderer.image = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<img src="${href}" alt="${text}"${titleAttr} style="max-width:100%;height:auto;" loading="lazy" />`;
};

marked.use({ renderer });

// ===== State =====
let history = []; // Array of { _id, title, can_edit, created_at, updated_at } (no content in list)
let activeEntry = null; // Full entry with content when viewing
let activeId = null;
let activeCanEdit = true;
let isEditMode = false;
let savePending = null; // debounce timer

// ===== DOM References =====
const $ = (sel) => document.querySelector(sel);
const sidebarEl = $('#sidebar');
const sidebarToggle = $('#sidebarToggle');
const themeSelect = $('#themeSelect');
const newBtn = $('#newBtn');
const historyList = $('#historyList');
const sidebarEmpty = $('#sidebarEmpty');
const inputView = $('#inputView');
const renderedView = $('#renderedView');
const fileInput = $('#fileInput');
const renderBtn = $('#renderBtn');
const markdownOutput = $('#markdownOutput');
const markdownInput = $('#markdownInput');
let currentTitle = 'Preview';
const editTextarea = $('#editTextarea');
const editToggle = $('#editToggle');
const previewToggle = $('#previewToggle');
const editArea = $('#editArea');
const alignLeft = $('#alignLeft');
const alignCenter = $('#alignCenter');
const alignRight = $('#alignRight');
const downloadBtn = $('#downloadBtn');
const ALIGN_KEY = 'md-viewer-align';

// ===== Theme =====
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = THEMES.includes(saved) ? saved : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(theme);
}

const THEME_COLORS = {
  light: '#f6f8fa',
  dark: '#161b22',
  dracula: '#21222c',
  monokai: '#1e1f1c',
  'one-dark': '#21252b',
  solarized: '#073642',
  nord: '#3b4252',
};

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  if (themeSelect) themeSelect.value = theme;
  loadHighlightTheme();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme] || '#ffffff');
}

// ===== Editor Helpers =====
function getCmContent() {
  return markdownInput ? markdownInput.value : '';
}

function setCmContent(text) {
  if (markdownInput) markdownInput.value = text;
}

// ===== Default Welcome Doc =====
const WELCOME_MD = `# Getting Started

**Your instant markdown renderer.** Paste it, drop it, edit it, share it — no sign-up required.

---

## ✨ Features

- **Drag & drop** any \`.md\` file or **paste** raw markdown
- **Live edit** — switch to Edit mode and see changes instantly on Preview
- **7 beautiful themes** — Light, Dark, Dracula, Monokai, One Dark, Solarized, Nord
- **Shareable links** — every document gets a unique URL you can send to anyone
- **History sidebar** — your docs are saved and always accessible
- **GitHub-flavored markdown** — tables, task lists, syntax highlighting, the works
- **Alignment control** — left, center, or right align your content

## 🚀 How to Use

1. **Paste or drop** your markdown on the home screen
2. Click **Render** (or hit \`Ctrl+Enter\`)
3. Use the **Edit / Preview** toggle to switch between raw markdown and rendered output
4. **Share** — just copy the URL from your browser!
5. Your docs are saved in the **History sidebar** — click any to reload it

## 🎨 Themes

Pick your vibe from the dropdown in the top bar:

| Theme | Style |
|-------|-------|
| Light | Clean GitHub-style |
| Dark | Easy on the eyes |
| Dracula | Purple & pink vibes |
| Monokai | Classic code editor |
| One Dark | Atom-inspired |
| Solarized | Ethan Schoonover's classic |
| Nord | Arctic, minimal |

---

*Try editing this document — click **Edit** above and start typing!*
`;

const WELCOME_ENTRY = {
  _id: 'welcome',
  title: 'Getting Started',
  content: WELCOME_MD,
  can_edit: true,
  created_at: '2026-01-01T00:00:00.000Z',
  permanent: true,
};

// ===== API-backed History =====
async function loadHistoryFromAPI() {
  try {
    const data = await api.get('/api/markdowns');
    history = data.markdowns || [];
    renderHistoryList();
  } catch (err) {
    console.error('Failed to load history:', err);
    history = [];
    renderHistoryList();
  }
}

async function createMarkdown(content, title, canEdit) {
  try {
    const data = await api.post('/api/markdowns', { content, title, can_edit: canEdit });
    const md = data.markdown;
    // Add to local history (without content for consistency)
    history.unshift({ _id: md._id, title: md.title, can_edit: md.can_edit, created_at: md.created_at, updated_at: md.updated_at });
    renderHistoryList();
    return md;
  } catch (err) {
    console.error('Failed to create markdown:', err);
    showToast('Failed to save — try again');
    return null;
  }
}

async function patchMarkdown(id, updates) {
  try {
    const data = await api.patch(`/api/markdowns/${id}`, updates);
    // Update local history entry
    const idx = history.findIndex(e => e._id === id);
    if (idx !== -1) {
      if (updates.title !== undefined) history[idx].title = updates.title;
      if (updates.can_edit !== undefined) history[idx].can_edit = updates.can_edit;
      history[idx].updated_at = data.markdown.updated_at;
    }
    return data.markdown;
  } catch (err) {
    console.error('Failed to update markdown:', err);
    if (err.message.includes('403')) {
      showToast('Document is read-only');
    } else {
      showToast('Failed to save');
    }
    return null;
  }
}

async function deleteMarkdown(id) {
  try {
    await api.del(`/api/markdowns/${id}`);
    history = history.filter(e => e._id !== id);
    if (activeId === id) {
      activeId = null;
      activeEntry = null;
      showInputView();
    }
    renderHistoryList();
  } catch (err) {
    console.error('Failed to delete:', err);
    showToast('Failed to delete');
  }
}

async function fetchMarkdown(id) {
  try {
    const data = await api.get(`/api/markdowns/${id}`);
    return data.markdown;
  } catch (err) {
    console.error('Failed to fetch markdown:', err);
    return null;
  }
}

// ===== Debounced Auto-save =====
function debounceSave() {
  if (!activeId || activeId === 'welcome' || !activeCanEdit) return;
  if (savePending) clearTimeout(savePending);
  savePending = setTimeout(async () => {
    const content = editTextarea.value;
    await patchMarkdown(activeId, { content });
    if (activeEntry) activeEntry.content = content;
  }, 2000);
}

// ===== Confirm Modal =====
function showConfirmModal(title, message, onConfirm, confirmLabel = 'Delete') {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-modal">
      <h3 class="confirm-title">${title}</h3>
      <p class="confirm-message">${message}</p>
      <div class="confirm-actions">
        <button class="confirm-btn cancel">Cancel</button>
        <button class="confirm-btn delete">${confirmLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('.cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.delete').addEventListener('click', () => { overlay.remove(); onConfirm(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ===== Edit Permission Modal =====
function showEditPermissionModal(content, title) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-modal">
        <h3 class="confirm-title">Allow Editing?</h3>
        <p class="confirm-message">Should anyone with the link be able to edit this document?</p>
        <div class="confirm-actions">
          <button class="confirm-btn cancel" data-choice="no">No — Read Only</button>
          <button class="confirm-btn delete" data-choice="yes" style="background: var(--accent, #2ea043);">Yes — Editable</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-choice="no"]').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.querySelector('[data-choice="yes"]').addEventListener('click', () => { overlay.remove(); resolve(true); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(true); } });
  });
}

// ===== URL Helpers =====
function navigateTo(id, push = true) {
  const url = '/' + id;
  if (push) {
    window.history.pushState({ markdownId: id }, '', url);
  } else {
    window.history.replaceState({ markdownId: id }, '', url);
  }
}

function clearUrl(push = false) {
  if (push) {
    window.history.pushState({ home: true }, '', '/');
  } else {
    window.history.replaceState({ home: true }, '', '/');
  }
}

// Legacy hash URL support
function hashToContent() {
  const hash = window.location.hash;
  try {
    if (hash.startsWith('#mdt=')) {
      const payload = JSON.parse(decompressFromEncodedURIComponent(hash.slice(5)));
      const content = decompressFromEncodedURIComponent(payload.c);
      return content ? { content, title: payload.t || null } : null;
    }
    if (hash.startsWith('#md=')) {
      const content = decompressFromEncodedURIComponent(hash.slice(4));
      return content ? { content, title: null } : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ===== Meta Tags =====
function updateMetaTags(title, content) {
  const pageTitle = title ? `${title} — sharemd.org` : 'sharemd.org';
  document.title = pageTitle;

  const desc = content
    ? content
        .replace(/^#{1,6}\s+.*$/gm, '')
        .replace(/[*_`~\[\]()>!|-]/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 160) || 'Shared via sharemd.org'
    : 'Instant markdown rendering. Paste, drop, edit, and share — no sign-up, no server.';

  const setMeta = (attr, key, value) => {
    let el = document.querySelector(`meta[${attr}="${key}"]`);
    if (el) el.setAttribute('content', value);
  };

  setMeta('property', 'og:title', title || 'sharemd.org');
  setMeta('property', 'og:description', desc);
  setMeta('name', 'description', desc);
  setMeta('name', 'twitter:title', title || 'sharemd.org');
  setMeta('name', 'twitter:description', desc);
}

// ===== Render Markdown =====
function renderMarkdownContent(content, title) {
  tocEntries = [];
  const raw = marked.parse(content);
  const clean = DOMPurify.sanitize(raw, {
    ADD_TAGS: ['input'],
    ADD_ATTR: ['type', 'checked', 'disabled', 'class', 'id'],
  });
  markdownOutput.innerHTML = clean;
  currentTitle = title || 'Preview';
  inputView.classList.add('hidden');
  renderedView.classList.remove('hidden');
  newBtn.classList.remove('hidden');

  markdownOutput.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.setAttribute('disabled', '');
  });

  buildToc();
  updateMetaTags(title, content);
}

function buildToc() {
  document.querySelectorAll('.sidebar-toc').forEach(el => el.remove());
  if (tocEntries.length <= 1 || !activeId) return;

  const activeItem = historyList.querySelector(`.history-item[data-entry-id="${activeId}"]`);
  if (!activeItem) return;

  const tocNav = document.createElement('nav');
  tocNav.className = 'sidebar-toc';

  const minDepth = Math.min(...tocEntries.map(e => e.depth));
  tocEntries.forEach(({ text, depth, slug }) => {
    const a = document.createElement('a');
    a.className = 'toc-item toc-depth-' + (depth - minDepth);
    a.textContent = text;
    a.href = '#' + slug;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(slug);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (window.innerWidth <= 768) {
        sidebarEl.classList.add('collapsed');
        removeOverlay();
      }
    });
    tocNav.appendChild(a);
  });

  activeItem.appendChild(tocNav);
}

// ===== Views =====
function updateEditToggleVisibility() {
  if (activeCanEdit) {
    editToggle.classList.remove('hidden');
  } else {
    editToggle.classList.add('hidden');
  }
}

function resetEditMode() {
  isEditMode = false;
  editArea.classList.add('hidden');
  markdownOutput.classList.remove('hidden');
  previewToggle.classList.add('active');
  editToggle.classList.remove('active');
}

function showInputView() {
  activeId = null;
  activeEntry = null;
  activeCanEdit = true;
  resetEditMode();
  document.querySelectorAll('.sidebar-toc').forEach(el => el.remove());
  tocEntries = [];
  renderedView.classList.add('hidden');
  inputView.classList.remove('hidden');
  setCmContent('');
  editTextarea.value = '';
  newBtn.classList.add('hidden');
  updateActiveState();
  clearUrl(true);
  updateMetaTags(null, null);
  updateEditToggleVisibility();
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 1800);
}

async function showEntry(id) {
  if (id === 'welcome') {
    activeId = 'welcome';
    activeEntry = WELCOME_ENTRY;
    activeCanEdit = true;
    resetEditMode();
    updateEditToggleVisibility();
    editTextarea.value = WELCOME_ENTRY.content;
    renderMarkdownContent(WELCOME_ENTRY.content, WELCOME_ENTRY.title);
    updateActiveState();
    navigateTo('welcome', true);
    if (mainContent) mainContent.scrollTop = 0;
    if (window.innerWidth <= 768) { sidebarEl.classList.add('collapsed'); removeOverlay(); }
    return;
  }

  // Fetch full content from API
  const md = await fetchMarkdown(id);
  if (!md) {
    showToast('Document not found');
    return;
  }

  activeId = md._id;
  activeEntry = md;
  activeCanEdit = md.can_edit;
  resetEditMode();
  updateEditToggleVisibility();
  editTextarea.value = md.content;
  renderMarkdownContent(md.content, md.title);
  updateActiveState();
  navigateTo(md._id, true);

  if (mainContent) mainContent.scrollTop = 0;
  markdownOutput.scrollTop = 0;
  renderedView.scrollTop = 0;

  if (window.innerWidth <= 768) { sidebarEl.classList.add('collapsed'); removeOverlay(); }
}

// ===== History List Rendering =====
function findEntry(id) {
  if (id === 'welcome') return WELCOME_ENTRY;
  if (activeEntry && activeEntry._id === id) return activeEntry;
  return history.find((e) => e._id === id);
}

function startRename(li, entry) {
  if (!entry.can_edit) {
    showToast('Document is read-only');
    return;
  }
  const nameEl = li.querySelector('.history-item-name');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'history-rename-input';
  input.value = entry.title;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = async () => {
    const newName = input.value.trim() || entry.title;
    await patchMarkdown(entry._id, { title: newName });
    entry.title = newName;
    if (activeId === entry._id) {
      currentTitle = newName;
      if (activeEntry) activeEntry.title = newName;
      updateMetaTags(newName, activeEntry?.content);
    }
    renderHistoryList();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') input.blur();
    if (ev.key === 'Escape') { input.value = entry.title; input.blur(); }
  });
}

function renderHistoryList() {
  historyList.innerHTML = '';
  const allEntries = [...history, WELCOME_ENTRY];
  sidebarEmpty.classList.toggle('hidden', allEntries.length > 0);

  allEntries.forEach((entry) => {
    const id = entry._id;
    const title = entry.title || entry.name || 'Untitled';
    const li = document.createElement('li');
    li.className = 'history-item' + (id === activeId ? ' active' : '');

    if (entry.permanent) {
      li.innerHTML = `
        <div class="history-item-info">
          <div class="history-item-name">${escapeHtml(title)}</div>
        </div>
      `;
    } else {
      const dateStr = entry.updated_at || entry.created_at;
      li.innerHTML = `
        <div class="history-item-info">
          <div class="history-item-name">${escapeHtml(title)}${!entry.can_edit ? ' <span style="opacity:0.5;font-size:0.75em;">🔒</span>' : ''}</div>
          <div class="history-item-date">${dateStr ? formatDate(dateStr) : ''}</div>
        </div>
        <div class="history-item-actions">
          ${entry.can_edit ? `<button class="history-item-rename" aria-label="Rename" data-id="${id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
          </button>` : ''}
          <button class="history-item-delete" aria-label="Delete" data-id="${id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      `;
      li.querySelector('.history-item-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        const t = entry.title || 'this document';
        showConfirmModal('Delete Document', `Are you sure you want to delete "${escapeHtml(t)}"?`, () => deleteMarkdown(id));
      });
      const renameBtn = li.querySelector('.history-item-rename');
      if (renameBtn) {
        renameBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          startRename(li, entry);
        });
      }
    }

    li.dataset.entryId = id;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.history-item-actions') || e.target.closest('.history-rename-input') || e.target.closest('.sidebar-toc')) return;
      showEntry(id);
    });
    historyList.appendChild(li);
  });

  if (activeId && tocEntries.length > 1) buildToc();
}

function updateActiveState() {
  historyList.querySelectorAll('.history-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.entryId === activeId);
  });
}

// ===== File Handling =====
async function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target.result;
    const canEdit = await showEditPermissionModal();
    const md = await createMarkdown(content, file.name, canEdit);
    if (!md) return;
    activeId = md._id;
    activeEntry = md;
    activeCanEdit = md.can_edit;
    updateEditToggleVisibility();
    editTextarea.value = content;
    renderMarkdownContent(content, md.title);
    updateActiveState();
    navigateTo(md._id, true);
  };
  reader.readAsText(file);
}

async function handlePaste() {
  const content = getCmContent().trim();
  if (!content) return;
  const headerMatch = content.match(/^#{1,6}\s+(.+)$/m);
  const name = (headerMatch ? headerMatch[1].trim() : null) || 'Untitled Paste ' + formatDate(new Date().toISOString());

  const canEdit = await showEditPermissionModal();
  const md = await createMarkdown(content, name, canEdit);
  if (!md) return;

  activeId = md._id;
  activeEntry = md;
  activeCanEdit = md.can_edit;
  updateEditToggleVisibility();
  editTextarea.value = content;
  renderMarkdownContent(content, md.title);
  updateActiveState();
  navigateTo(md._id, true);
}

// ===== Legacy Hash Migration =====
async function handleLegacyHash() {
  const result = hashToContent();
  if (!result || !result.content) return false;
  const { content, title } = result;

  // Check welcome
  if (content.trim() === WELCOME_MD.trim()) {
    activeId = 'welcome';
    activeEntry = WELCOME_ENTRY;
    activeCanEdit = true;
    editTextarea.value = WELCOME_ENTRY.content;
    renderMarkdownContent(WELCOME_ENTRY.content, WELCOME_ENTRY.title);
    updateActiveState();
    updateEditToggleVisibility();
    return true;
  }

  // Create a new markdown from hash content (editable by default for legacy)
  const name = title || 'Migrated ' + formatDate(new Date().toISOString());
  const md = await createMarkdown(content, name, true);
  if (!md) return false;

  activeId = md._id;
  activeEntry = md;
  activeCanEdit = md.can_edit;
  updateEditToggleVisibility();
  editTextarea.value = content;
  renderMarkdownContent(content, md.title);
  updateActiveState();
  // Replace hash URL with clean URL
  navigateTo(md._id, false);
  return true;
}

// ===== Route Handling =====
function getMarkdownIdFromPath() {
  const path = window.location.pathname;
  // Match /<id> where id is a MongoDB ObjectId (24 hex chars) or 'welcome'
  const match = path.match(/^\/([a-f0-9]{24})$/);
  if (match) return match[1];
  if (path === '/welcome') return 'welcome';
  return null;
}

async function handleRoute() {
  // Check for legacy hash URLs first
  if (window.location.hash && (window.location.hash.startsWith('#md=') || window.location.hash.startsWith('#mdt='))) {
    return await handleLegacyHash();
  }

  const id = getMarkdownIdFromPath();
  if (id) {
    await showEntry(id);
    return true;
  }

  return false;
}

// ===== Sidebar Mobile Overlay =====
function createOverlay() {
  removeOverlay();
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.addEventListener('click', () => {
    sidebarEl.classList.add('collapsed');
    removeOverlay();
  });
  document.querySelector('.layout').appendChild(overlay);
}

function removeOverlay() {
  document.querySelector('.sidebar-overlay')?.remove();
}

// ===== Helpers =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ===== Event Listeners =====
themeSelect.addEventListener('change', (e) => setTheme(e.target.value));

sidebarToggle.addEventListener('click', () => {
  const isCollapsed = sidebarEl.classList.toggle('collapsed');
  if (!isCollapsed && window.innerWidth <= 768) createOverlay();
  else removeOverlay();
});

newBtn.addEventListener('click', showInputView);

fileInput.addEventListener('change', (e) => {
  handleFile(e.target.files[0]);
  fileInput.value = '';
});

const dropZone = $('#dropZone');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

renderBtn.addEventListener('click', handlePaste);

markdownInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    handlePaste();
  }
});

// Alignment
function setAlign(align) {
  renderedView.classList.remove('align-left', 'align-center', 'align-right');
  renderedView.classList.add('align-' + align);
  [alignLeft, alignCenter, alignRight].forEach(b => b.classList.remove('active'));
  if (align === 'left') alignLeft.classList.add('active');
  else if (align === 'center') alignCenter.classList.add('active');
  else alignRight.classList.add('active');
  localStorage.setItem(ALIGN_KEY, align);
}

function initAlign() {
  const saved = localStorage.getItem(ALIGN_KEY) || 'left';
  setAlign(saved);
}

alignLeft.addEventListener('click', () => setAlign('left'));
alignCenter.addEventListener('click', () => setAlign('center'));
alignRight.addEventListener('click', () => setAlign('right'));

// Copy URL button
const copyUrlBtn = $('#copyUrlBtn');
copyUrlBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    copyUrlBtn.classList.add('copied');
    copyUrlBtn.setAttribute('title', 'Copied!');
    showToast('Link copied!');
    setTimeout(() => {
      copyUrlBtn.classList.remove('copied');
      copyUrlBtn.setAttribute('title', 'Copy URL');
    }, 2000);
  });
});

// QR Code button
const qrBtn = $('#qrBtn');
const qrModal = $('#qrModal');
const qrCanvas = $('#qrCanvas');
const qrCopyBtn = $('#qrCopyBtn');
const qrCloseBtn = $('#qrCloseBtn');

qrBtn.addEventListener('click', async () => {
  try {
    const url = window.location.href;
    await QRCode.toCanvas(qrCanvas, url, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
    qrModal.classList.remove('hidden');
    qrCanvas.toBlob((blob) => {
      if (blob && navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
          showToast('QR code copied as image!');
        }).catch(() => {});
      }
    });
  } catch (e) {
    showToast('Failed to generate QR code');
  }
});

function copyQrImage() {
  qrCanvas.toBlob((blob) => {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
        showToast('QR code copied as image!');
        qrModal.classList.add('hidden');
      }).catch(() => downloadQrFallback());
    } else {
      downloadQrFallback();
    }
  });
}

function downloadQrFallback() {
  const link = document.createElement('a');
  link.download = 'qr-code.png';
  link.href = qrCanvas.toDataURL('image/png');
  link.click();
  showToast('QR code saved!');
  qrModal.classList.add('hidden');
}

qrCopyBtn.addEventListener('click', copyQrImage);
qrCloseBtn.addEventListener('click', () => qrModal.classList.add('hidden'));
qrModal.addEventListener('click', (e) => { if (e.target === qrModal) qrModal.classList.add('hidden'); });

// Download button
downloadBtn.addEventListener('click', () => {
  if (!activeEntry) return;
  const blob = new Blob([activeEntry.content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const name = (activeEntry.title || 'document').replace(/[^a-zA-Z0-9_\-. ]/g, '') || 'document';
  a.download = name + '.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// Edit/Preview toggle
editToggle.addEventListener('click', () => {
  if (isEditMode || !activeCanEdit) return;
  isEditMode = true;
  if (activeEntry) editTextarea.value = activeEntry.content;
  markdownOutput.classList.add('hidden');
  editArea.classList.remove('hidden');
  editToggle.classList.add('active');
  previewToggle.classList.remove('active');
});

previewToggle.addEventListener('click', async () => {
  if (!isEditMode) return;
  isEditMode = false;
  // Save to server
  if (activeEntry && activeId !== 'welcome' && activeCanEdit) {
    const content = editTextarea.value;
    activeEntry.content = content;
    if (savePending) { clearTimeout(savePending); savePending = null; }
    await patchMarkdown(activeId, { content });
  }
  renderMarkdownContent(editTextarea.value, currentTitle);
  editArea.classList.add('hidden');
  markdownOutput.classList.remove('hidden');
  previewToggle.classList.add('active');
  editToggle.classList.remove('active');
});

// Auto-save on typing in edit mode
editTextarea.addEventListener('input', () => {
  debounceSave();
});

// Handle back/forward
window.addEventListener('popstate', async () => {
  const id = getMarkdownIdFromPath();
  if (id) {
    await showEntry(id);
  } else {
    showInputViewSilent();
  }
});

function showInputViewSilent() {
  activeId = null;
  activeEntry = null;
  activeCanEdit = true;
  resetEditMode();
  document.querySelectorAll('.sidebar-toc').forEach(el => el.remove());
  tocEntries = [];
  renderedView.classList.add('hidden');
  inputView.classList.remove('hidden');
  setCmContent('');
  editTextarea.value = '';
  newBtn.classList.add('hidden');
  updateActiveState();
  updateMetaTags(null, null);
  updateEditToggleVisibility();
}

// ===== Init =====
async function init() {
  initTheme();
  initAlign();
  loadHighlightTheme();

  // Load history from API
  await loadHistoryFromAPI();

  // Handle current route
  const handled = await handleRoute();
  if (!handled) {
    showInputView();
  }

  // Collapse sidebar on mobile
  if (window.innerWidth <= 768) {
    sidebarEl.classList.add('collapsed');
  }
}

init();

// Floating toolbar scroll behavior
const floatingToolbar = $('#floatingToolbar');
const mainContent = document.querySelector('.main-content');
let lastScrollTop = 0;

if (mainContent && floatingToolbar) {
  mainContent.addEventListener('scroll', () => {
    if (window.innerWidth > 768) return;
    const st = mainContent.scrollTop;
    if (st > lastScrollTop && st > 50) {
      floatingToolbar.classList.add('toolbar-hidden');
    } else {
      floatingToolbar.classList.remove('toolbar-hidden');
    }
    lastScrollTop = st;
  });
}

// Dismiss loading screen
const loadingScreen = $('#loadingScreen');
if (loadingScreen) {
  loadingScreen.classList.add('fade-out');
  setTimeout(() => loadingScreen.classList.add('hidden'), 300);
}
