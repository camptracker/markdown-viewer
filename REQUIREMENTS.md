# Markdown Viewer Website

## Overview
A single-page web app where users can upload `.md` files or paste markdown text, and see a beautifully rendered preview — styled like GitHub's markdown rendering.

## Requirements

### Core Features
1. **Upload .md files** — drag-and-drop or file picker
2. **Paste markdown** — textarea input with a "Render" button
3. **GitHub-flavored rendering** — use `marked` (or `markdown-it`) + `highlight.js` for code blocks, tables, task lists, etc.
4. **GitHub-style CSS** — use `github-markdown-css` package for styling
5. **File history sidebar** — list of previously uploaded/pasted files, stored in localStorage
   - Each entry: filename (or "Untitled Paste" + timestamp), date added
   - Click to re-render
   - Delete individual entries
6. **Clean, minimal UI** — dark/light mode toggle

### Tech Stack
- **Vite + vanilla HTML/CSS/JS** (no framework needed, keep it simple)
- `marked` for markdown parsing
- `github-markdown-css` for GitHub-style rendering
- `highlight.js` for syntax highlighting
- localStorage for file history persistence

### Layout
- Left sidebar (collapsible): file history list
- Main area: input mode (upload/paste) or rendered view
- Top bar: app name, dark/light toggle, "New" button

### Best Practices for MD Rendering (GitHub-like)
- Sanitize HTML output (DOMPurify)
- Support GFM: tables, strikethrough, task lists, autolinks
- Syntax highlighting for fenced code blocks with language detection
- Responsive images
- Anchor links for headings
- Line breaks: treat newlines as `<br>` (GFM behavior)

Build it production-ready with `npm run build` outputting to `dist/`. Make it deployable to GitHub Pages.
