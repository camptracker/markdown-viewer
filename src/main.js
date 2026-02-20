import './style.css';
import 'github-markdown-css/github-markdown.css';
import hljs from 'highlight.js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Dynamically load highlight.js theme based on current theme
function loadHighlightTheme() {
  const existingLink = document.querySelector('link[data-hljs-theme]');
  if (existingLink) existingLink.remove();

  const theme = document.documentElement.getAttribute('data-theme');
  const themeFile = theme === 'dark' ? 'github-dark' : 'github';

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${themeFile}.min.css`;
  link.setAttribute('data-hljs-theme', '');
  document.head.appendChild(link);
}

loadHighlightTheme();

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

// Custom renderer for heading anchors and responsive images
const renderer = new marked.Renderer();

renderer.heading = function ({ text, depth }) {
  const slug = String(text)
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();
  return `<h${depth} id="${slug}"><a class="anchor" href="#${slug}">#</a>${text}</h${depth}>`;
};

renderer.image = function ({ href, title, text }) {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<img src="${href}" alt="${text}"${titleAttr} style="max-width:100%;height:auto;" loading="lazy" />`;
};

marked.use({ renderer });

// ===== State =====
const STORAGE_KEY = 'md-viewer-history';
const THEME_KEY = 'md-viewer-theme';
let history = loadHistory();
let activeId = null;

// ===== DOM References =====
const $ = (sel) => document.querySelector(sel);
const sidebarEl = $('#sidebar');
const sidebarToggle = $('#sidebarToggle');
const themeToggle = $('#themeToggle');
const newBtn = $('#newBtn');
const historyList = $('#historyList');
const sidebarEmpty = $('#sidebarEmpty');
const inputView = $('#inputView');
const renderedView = $('#renderedView');
const dropZone = $('#dropZone');
const fileInput = $('#fileInput');
const markdownInput = $('#markdownInput');
const renderBtn = $('#renderBtn');
const backBtn = $('#backBtn');
const markdownOutput = $('#markdownOutput');
const renderedTitle = $('#renderedTitle');
const editToggle = $('#editToggle');
const previewToggle = $('#previewToggle');
const editArea = $('#editArea');
const editTextarea = $('#editTextarea');
let isEditMode = false;

// ===== Theme =====
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  loadHighlightTheme();
}

// ===== History (localStorage) =====
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function addToHistory(name, content) {
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    content,
    date: new Date().toISOString(),
  };
  history.unshift(entry);
  saveHistory();
  renderHistoryList();
  return entry;
}

function deleteFromHistory(id) {
  history = history.filter((e) => e.id !== id);
  saveHistory();
  if (activeId === id) {
    activeId = null;
    showInputView();
  }
  renderHistoryList();
}

// ===== Render Markdown =====
function renderMarkdown(content, title) {
  const raw = marked.parse(content);
  const clean = DOMPurify.sanitize(raw, {
    ADD_TAGS: ['input'],
    ADD_ATTR: ['type', 'checked', 'disabled', 'class'],
  });
  markdownOutput.innerHTML = clean;
  renderedTitle.textContent = title || 'Preview';
  inputView.classList.add('hidden');
  renderedView.classList.remove('hidden');

  // Fix checkboxes for task lists
  markdownOutput.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.setAttribute('disabled', '');
  });
}

// ===== Views =====
function showInputView() {
  activeId = null;
  isEditMode = false;
  renderedView.classList.add('hidden');
  inputView.classList.remove('hidden');
  markdownInput.value = '';
  resetEditMode();
  updateActiveState();
}

function resetEditMode() {
  isEditMode = false;
  editArea.classList.add('hidden');
  markdownOutput.classList.remove('hidden');
  previewToggle.classList.add('active');
  editToggle.classList.remove('active');
}

function showEntry(id) {
  const entry = history.find((e) => e.id === id);
  if (!entry) return;
  activeId = id;
  resetEditMode();
  renderMarkdown(entry.content, entry.name);
  updateActiveState();

  // On mobile, close sidebar after selecting
  if (window.innerWidth <= 768) {
    sidebarEl.classList.add('collapsed');
    removeOverlay();
  }
}

// ===== History List Rendering =====
function renderHistoryList() {
  historyList.innerHTML = '';

  if (history.length === 0) {
    sidebarEmpty.classList.remove('hidden');
    return;
  }
  sidebarEmpty.classList.add('hidden');

  history.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'history-item' + (entry.id === activeId ? ' active' : '');
    li.innerHTML = `
      <div class="history-item-info">
        <div class="history-item-name">${escapeHtml(entry.name)}</div>
        <div class="history-item-date">${formatDate(entry.date)}</div>
      </div>
      <button class="history-item-delete" aria-label="Delete" data-id="${entry.id}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
      </button>
    `;

    li.querySelector('.history-item-info').addEventListener('click', () => showEntry(entry.id));
    li.querySelector('.history-item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFromHistory(entry.id);
    });

    historyList.appendChild(li);
  });
}

function updateActiveState() {
  historyList.querySelectorAll('.history-item').forEach((item) => {
    const id = item.querySelector('[data-id]')?.dataset.id;
    item.classList.toggle('active', id === activeId);
  });
}

// ===== File Handling =====
function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const entry = addToHistory(file.name, content);
    activeId = entry.id;
    renderMarkdown(content, file.name);
    updateActiveState();
  };
  reader.readAsText(file);
}

function handlePaste() {
  const content = markdownInput.value.trim();
  if (!content) return;
  const name = 'Untitled Paste ' + formatDate(new Date().toISOString());
  const entry = addToHistory(name, content);
  activeId = entry.id;
  renderMarkdown(content, name);
  updateActiveState();
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
// Theme
themeToggle.addEventListener('click', toggleTheme);

// Sidebar toggle
sidebarToggle.addEventListener('click', () => {
  const isCollapsed = sidebarEl.classList.toggle('collapsed');
  if (!isCollapsed && window.innerWidth <= 768) {
    createOverlay();
  } else {
    removeOverlay();
  }
});

// New button
newBtn.addEventListener('click', showInputView);

// File input
fileInput.addEventListener('change', (e) => {
  handleFile(e.target.files[0]);
  fileInput.value = '';
});

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// Render button
renderBtn.addEventListener('click', handlePaste);

// Ctrl+Enter to render
markdownInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    handlePaste();
  }
});

// Back button
backBtn.addEventListener('click', showInputView);

// Edit/Preview toggle
editToggle.addEventListener('click', () => {
  if (isEditMode) return;
  isEditMode = true;
  const entry = history.find((e) => e.id === activeId);
  if (entry) editTextarea.value = entry.content;
  markdownOutput.classList.add('hidden');
  editArea.classList.remove('hidden');
  editToggle.classList.add('active');
  previewToggle.classList.remove('active');
  editTextarea.focus();
});

previewToggle.addEventListener('click', () => {
  if (!isEditMode) return;
  isEditMode = false;
  // Save edits back to history
  const entry = history.find((e) => e.id === activeId);
  if (entry) {
    entry.content = editTextarea.value;
    saveHistory();
  }
  renderMarkdown(editTextarea.value, renderedTitle.textContent);
  editArea.classList.add('hidden');
  markdownOutput.classList.remove('hidden');
  previewToggle.classList.add('active');
  editToggle.classList.remove('active');
});

// ===== Init =====
initTheme();
renderHistoryList();
