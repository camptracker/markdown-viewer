import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4173';

async function typeInEditor(page, text) {
  // Set content in CodeMirror via the exposed API
  await page.evaluate((t) => {
    const cmView = document.querySelector('.cm-editor')?.cmView?.view
      || document.querySelector('#codemirrorHost .cm-editor')?.__view;
    // Fallback: dispatch through the CM instance on window
    if (window.__cmEditor) {
      const cm = window.__cmEditor;
      cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: t } });
    }
  }, text);
}

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // Default is input/create view
  await page.waitForSelector('#inputView:not(.hidden)', { timeout: 3000 }).catch(() => {});
});

test.describe('Theme', () => {
  test('default theme is light or dark based on preference', async ({ page }) => {
    const theme = await page.getAttribute('html', 'data-theme');
    expect(['light', 'dark']).toContain(theme);
  });

  test('can switch to all 7 themes', async ({ page }) => {
    const themes = ['light', 'dark', 'dracula', 'monokai', 'one-dark', 'solarized', 'nord'];
    for (const t of themes) {
      await page.selectOption('#themeSelect', t);
      const actual = await page.getAttribute('html', 'data-theme');
      expect(actual).toBe(t);
    }
  });

  test('theme persists after reload', async ({ page }) => {
    await page.selectOption('#themeSelect', 'dracula');
    await page.reload();
    const theme = await page.getAttribute('html', 'data-theme');
    expect(theme).toBe('dracula');
  });
});

test.describe('Paste & Render', () => {
  test('pasting markdown and clicking render shows split pane', async ({ page }) => {
    await typeInEditor(page, '# Hello World\n\nSome **bold** text.');
    await page.click('#renderBtn');

    await expect(page.locator('#inputView')).toHaveClass(/hidden/);
    await expect(page.locator('#renderedView')).not.toHaveClass(/hidden/);

    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Hello World');
    expect(html).toContain('<strong>bold</strong>');
  });

  test('empty content does nothing on save', async ({ page }) => {
    await page.click('#renderBtn');
    await expect(page.locator('#inputView')).not.toHaveClass(/hidden/);
  });
});

test.describe('Edit/Preview toggle', () => {
  test('default is preview mode', async ({ page }) => {
    await typeInEditor(page, '# Test');
    await page.click('#renderBtn');

    await expect(page.locator('#markdownOutput')).not.toHaveClass(/hidden/);
    await expect(page.locator('#editArea')).toHaveClass(/hidden/);
    await expect(page.locator('#previewToggle')).toHaveClass(/active/);
  });

  test('clicking Edit shows textarea, clicking Preview renders', async ({ page }) => {
    await typeInEditor(page, '# Original');
    await page.click('#renderBtn');

    await page.click('#editToggle');
    await expect(page.locator('#editArea')).not.toHaveClass(/hidden/);
    await expect(page.locator('#markdownOutput')).toHaveClass(/hidden/);
    const value = await page.locator('#editTextarea').inputValue();
    expect(value).toBe('# Original');

    await page.fill('#editTextarea', '# Modified');
    await page.click('#previewToggle');
    await expect(page.locator('#markdownOutput')).not.toHaveClass(/hidden/);
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Modified');
  });

  test('edits are saved to history', async ({ page }) => {
    await typeInEditor(page, '# Save Test');
    await page.click('#renderBtn');

    await page.click('#editToggle');
    await page.fill('#editTextarea', '# Edited Content');
    await page.click('#previewToggle');

    await page.reload();
    await page.click('.history-item-info');
    await page.click('#editToggle');
    const value = await page.locator('#editTextarea').inputValue();
    expect(value).toBe('# Edited Content');
  });
});

test.describe('History', () => {
  test('rendered markdown is saved to history sidebar', async ({ page }) => {
    await typeInEditor(page, '# Doc 1');
    await page.click('#renderBtn');

    const userDoc = page.locator('.history-item-info', { hasText: 'Doc 1' });
    await expect(userDoc).toBeVisible();
  });

  test('clicking history item loads it', async ({ page }) => {
    await typeInEditor(page, '# First');
    await page.click('#renderBtn');

    await page.click('#newBtn');
    await typeInEditor(page, '# Second');
    await page.click('#renderBtn');

    const items = page.locator('.history-item-info');
    await items.nth(1).click();

    const textarea = await page.locator('#editTextarea').inputValue();
    expect(textarea).toBe('# First');
  });

  test('delete removes from history', async ({ page }) => {
    await typeInEditor(page, '# Delete Me');
    await page.click('#renderBtn');

    const deleteBtn = page.locator('.history-item', { hasText: 'Delete Me' }).locator('.history-item-delete');
    await deleteBtn.click();
    await page.click('.confirm-btn.delete');
    await expect(page.locator('.history-item-info', { hasText: 'Delete Me' })).toHaveCount(0);
  });

  test('history persists after reload', async ({ page }) => {
    await typeInEditor(page, '# Persistent');
    await page.click('#renderBtn');
    await page.reload();

    const userDoc = page.locator('.history-item-info', { hasText: 'Persistent' });
    await expect(userDoc).toBeVisible();
  });
});

test.describe('New button', () => {
  test('returns to input view', async ({ page }) => {
    await typeInEditor(page, '# Test');
    await page.click('#renderBtn');

    await page.click('#newBtn');
    await expect(page.locator('#inputView')).not.toHaveClass(/hidden/);
    await expect(page.locator('#renderedView')).toHaveClass(/hidden/);
  });
});

test.describe('URL serialization', () => {
  test('rendering sets hash in URL', async ({ page }) => {
    await typeInEditor(page, '# URL Test');
    await page.click('#renderBtn');

    const url = page.url();
    expect(url).toMatch(/#mdt?=/);
  });

  test('visiting URL with hash loads content', async ({ page }) => {
    await typeInEditor(page, '# Shared Doc');
    await page.click('#renderBtn');
    const url = page.url();

    await page.evaluate(() => localStorage.clear());
    await page.goto(url);

    await expect(page.locator('#renderedView')).not.toHaveClass(/hidden/);
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Shared Doc');
  });

  test('editing updates URL hash on preview switch', async ({ page }) => {
    await typeInEditor(page, '# Before');
    await page.click('#renderBtn');
    const urlBefore = page.url();

    await page.click('#editToggle');
    await page.fill('#editTextarea', '# After Edit');
    await page.click('#previewToggle');
    const urlAfter = page.url();

    expect(urlBefore).not.toBe(urlAfter);
  });

  test('new button clears URL hash', async ({ page }) => {
    await typeInEditor(page, '# Test');
    await page.click('#renderBtn');
    expect(page.url()).toMatch(/#mdt?=/);

    await page.click('#newBtn');
    expect(page.url()).not.toMatch(/#mdt?=/);
  });
});

test.describe('Welcome doc', () => {
  test('welcome doc is always visible in sidebar', async ({ page }) => {
    const welcomeItem = page.locator('.history-item-info', { hasText: 'Getting Started' });
    await expect(welcomeItem).toBeVisible();
  });

  test('welcome doc has no delete button', async ({ page }) => {
    const welcomeRow = page.locator('.history-item', { hasText: 'Getting Started' });
    await expect(welcomeRow.locator('.history-item-delete')).toHaveCount(0);
  });

  test('clicking welcome doc renders it', async ({ page }) => {
    const welcomeItem = page.locator('.history-item-info', { hasText: 'Getting Started' });
    await welcomeItem.click();
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Getting Started');
  });

  test('welcome doc persists even after clearing history', async ({ page }) => {
    await typeInEditor(page, '# Temp');
    await page.click('#renderBtn');
    const deleteBtn = page.locator('.history-item', { hasText: 'Temp' }).locator('.history-item-delete');
    await deleteBtn.click();
    await page.click('.confirm-btn.delete');

    const welcomeItem = page.locator('.history-item-info', { hasText: 'Getting Started' });
    await expect(welcomeItem).toBeVisible();
  });
});

test.describe('GFM features', () => {
  test('renders tables', async ({ page }) => {
    await typeInEditor(page, '| Col A | Col B |\n|---|---|\n| 1 | 2 |');
    await page.click('#renderBtn');
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('<table>');
  });

  test('renders task lists', async ({ page }) => {
    await typeInEditor(page, '- [x] Done\n- [ ] Todo');
    await page.click('#renderBtn');
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('type="checkbox"');
  });

  test('renders code blocks with syntax highlighting', async ({ page }) => {
    await typeInEditor(page, '```js\nconst x = 1;\n```');
    await page.click('#renderBtn');
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('<code');
  });
});

test.describe('localStorage persistence', () => {
  test('history entries survive page reload', async ({ page }) => {
    await typeInEditor(page, '# Persist Test');
    await page.click('#renderBtn');

    const count = await page.evaluate(() => {
      const h = JSON.parse(localStorage.getItem('md-viewer-history'));
      return h ? h.length : 0;
    });
    expect(count).toBe(1);

    await page.reload();
    const userDoc = page.locator('.history-item-info', { hasText: 'Persist Test' });
    await expect(userDoc).toBeVisible();

    await userDoc.click();
    await expect(page.locator('#renderedView')).not.toHaveClass(/hidden/);
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Persist Test');
  });

  test('multiple history entries persist and load correctly', async ({ page }) => {
    await typeInEditor(page, '# Doc Alpha');
    await page.click('#renderBtn');
    await page.click('#newBtn');
    await typeInEditor(page, '# Doc Beta');
    await page.click('#renderBtn');

    await page.reload();

    const count = await page.evaluate(() => {
      const h = JSON.parse(localStorage.getItem('md-viewer-history'));
      return h ? h.length : 0;
    });
    expect(count).toBe(2);

    const items = page.locator('.history-item-info');
    await items.nth(1).click();
    await page.click('#editToggle');
    const value = await page.locator('#editTextarea').inputValue();
    expect(value).toBe('# Doc Alpha');
  });

  test('edited content persists after reload', async ({ page }) => {
    await typeInEditor(page, '# Original');
    await page.click('#renderBtn');

    await page.click('#editToggle');
    await page.fill('#editTextarea', '# Updated Content');
    await page.click('#previewToggle');

    await page.reload();
    await page.click('.history-item-info');
    await page.click('#editToggle');
    const value = await page.locator('#editTextarea').inputValue();
    expect(value).toBe('# Updated Content');
  });

  test('renamed title persists after reload', async ({ page }) => {
    await typeInEditor(page, '# Test');
    await page.click('#renderBtn');

    await page.click('.history-item-rename');
    await page.fill('.history-rename-input', 'My Custom Title');
    await page.press('.history-rename-input', 'Enter');

    await page.reload();
    const renamedDoc = page.locator('.history-item-info', { hasText: 'My Custom Title' });
    await expect(renamedDoc).toBeVisible();
  });

  test('localStorage is not corrupted by special characters', async ({ page }) => {
    await typeInEditor(page, '# Test with "quotes" & <tags> & émojis 🎉');
    await page.click('#renderBtn');

    await page.reload();
    await page.click('.history-item-info');
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('émojis');
  });
});

test.describe('URL title serialization', () => {
  test('URL includes title after rename', async ({ page }) => {
    await typeInEditor(page, '# Test');
    await page.click('#renderBtn');

    await page.click('.history-item-rename');
    await page.fill('.history-rename-input', 'Named Doc');
    await page.press('.history-rename-input', 'Enter');

    const url = page.url();
    expect(url).toContain('#mdt=');
  });

  test('opening URL with title shows correct title', async ({ page }) => {
    await typeInEditor(page, '# Hello Title');
    await page.click('#renderBtn');

    await page.click('.history-item-rename');
    await page.fill('.history-rename-input', 'My Titled Doc');
    await page.press('.history-rename-input', 'Enter');

    const url = page.url();

    await page.evaluate(() => localStorage.clear());
    await page.goto(url);

    await expect(page.locator('#renderedView')).not.toHaveClass(/hidden/);
    // Verify the entry was created with the title from the URL
    const entryName = await page.locator('.history-item-name').first().textContent();
    expect(entryName).toBe('My Titled Doc');
  });

  test('legacy #md= URLs still work', async ({ page }) => {
    const legacyHash = await page.evaluate(() => window.__lzCompress('# Legacy Content'));

    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/#md=' + legacyHash);

    await expect(page.locator('#renderedView')).not.toHaveClass(/hidden/);
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Legacy Content');
  });
});
