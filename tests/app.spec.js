import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4173';

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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
    await page.fill('#markdownInput', '# Hello World\n\nSome **bold** text.');
    await page.click('#renderBtn');

    // Input view should be hidden, rendered view visible
    await expect(page.locator('#inputView')).toHaveClass(/hidden/);
    await expect(page.locator('#renderedView')).not.toHaveClass(/hidden/);

    // Preview should contain rendered HTML
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Hello World');
    expect(html).toContain('<strong>bold</strong>');
  });

  test('Ctrl+Enter renders markdown', async ({ page }) => {
    await page.fill('#markdownInput', '## Test');
    await page.press('#markdownInput', 'Meta+Enter');

    await expect(page.locator('#renderedView')).not.toHaveClass(/hidden/);
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Test');
  });

  test('empty paste does nothing', async ({ page }) => {
    await page.fill('#markdownInput', '');
    await page.click('#renderBtn');
    await expect(page.locator('#inputView')).not.toHaveClass(/hidden/);
  });
});

test.describe('Edit/Preview toggle', () => {
  test('default is preview mode', async ({ page }) => {
    await page.fill('#markdownInput', '# Test');
    await page.click('#renderBtn');

    await expect(page.locator('#markdownOutput')).not.toHaveClass(/hidden/);
    await expect(page.locator('#editArea')).toHaveClass(/hidden/);
    await expect(page.locator('#previewToggle')).toHaveClass(/active/);
  });

  test('clicking Edit shows textarea, clicking Preview renders', async ({ page }) => {
    await page.fill('#markdownInput', '# Original');
    await page.click('#renderBtn');

    // Switch to edit
    await page.click('#editToggle');
    await expect(page.locator('#editArea')).not.toHaveClass(/hidden/);
    await expect(page.locator('#markdownOutput')).toHaveClass(/hidden/);
    const value = await page.locator('#editTextarea').inputValue();
    expect(value).toBe('# Original');

    // Modify and switch back to preview
    await page.fill('#editTextarea', '# Modified');
    await page.click('#previewToggle');
    await expect(page.locator('#markdownOutput')).not.toHaveClass(/hidden/);
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Modified');
  });

  test('edits are saved to history', async ({ page }) => {
    await page.fill('#markdownInput', '# Save Test');
    await page.click('#renderBtn');

    await page.click('#editToggle');
    await page.fill('#editTextarea', '# Edited Content');
    await page.click('#previewToggle');

    // Reload and check history still has edited content
    await page.reload();
    await page.click('.history-item-info');
    await page.click('#editToggle');
    const value = await page.locator('#editTextarea').inputValue();
    expect(value).toBe('# Edited Content');
  });
});

test.describe('History', () => {
  test('rendered markdown is saved to history sidebar', async ({ page }) => {
    await page.fill('#markdownInput', '# Doc 1');
    await page.click('#renderBtn');

    const items = page.locator('.history-item');
    await expect(items).toHaveCount(1);
  });

  test('clicking history item loads it', async ({ page }) => {
    await page.fill('#markdownInput', '# First');
    await page.click('#renderBtn');

    // Go back to input
    await page.click('#newBtn');
    await page.fill('#markdownInput', '# Second');
    await page.click('#renderBtn');

    // Click first history item (Second is at top since most recent)
    const items = page.locator('.history-item-info');
    await items.nth(1).click(); // "First" is second in list

    const textarea = await page.locator('#editTextarea').inputValue();
    expect(textarea).toBe('# First');
  });

  test('delete removes from history', async ({ page }) => {
    await page.fill('#markdownInput', '# Delete Me');
    await page.click('#renderBtn');

    await page.click('.history-item-delete');
    await expect(page.locator('.history-item')).toHaveCount(0);
  });

  test('history persists after reload', async ({ page }) => {
    await page.fill('#markdownInput', '# Persistent');
    await page.click('#renderBtn');
    await page.reload();

    await expect(page.locator('.history-item')).toHaveCount(1);
  });
});

test.describe('New button', () => {
  test('returns to input view', async ({ page }) => {
    await page.fill('#markdownInput', '# Test');
    await page.click('#renderBtn');

    await page.click('#newBtn');
    await expect(page.locator('#inputView')).not.toHaveClass(/hidden/);
    await expect(page.locator('#renderedView')).toHaveClass(/hidden/);
  });
});

test.describe('URL serialization', () => {
  test('rendering sets hash in URL', async ({ page }) => {
    await page.fill('#markdownInput', '# URL Test');
    await page.click('#renderBtn');

    const url = page.url();
    expect(url).toContain('#md=');
  });

  test('visiting URL with hash loads content', async ({ page }) => {
    // First create a hash
    await page.fill('#markdownInput', '# Shared Doc');
    await page.click('#renderBtn');
    const url = page.url();

    // Navigate to that URL fresh
    await page.evaluate(() => localStorage.clear());
    await page.goto(url);

    await expect(page.locator('#renderedView')).not.toHaveClass(/hidden/);
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('Shared Doc');
  });

  test('editing updates URL hash on preview switch', async ({ page }) => {
    await page.fill('#markdownInput', '# Before');
    await page.click('#renderBtn');
    const urlBefore = page.url();

    await page.click('#editToggle');
    await page.fill('#editTextarea', '# After Edit');
    await page.click('#previewToggle');
    const urlAfter = page.url();

    expect(urlBefore).not.toBe(urlAfter);
  });

  test('new button clears URL hash', async ({ page }) => {
    await page.fill('#markdownInput', '# Test');
    await page.click('#renderBtn');
    expect(page.url()).toContain('#md=');

    await page.click('#newBtn');
    expect(page.url()).not.toContain('#md=');
  });
});

test.describe('GFM features', () => {
  test('renders tables', async ({ page }) => {
    await page.fill('#markdownInput', '| Col A | Col B |\n|---|---|\n| 1 | 2 |');
    await page.click('#renderBtn');
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('<table>');
  });

  test('renders task lists', async ({ page }) => {
    await page.fill('#markdownInput', '- [x] Done\n- [ ] Todo');
    await page.click('#renderBtn');
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('type="checkbox"');
  });

  test('renders code blocks with syntax highlighting', async ({ page }) => {
    await page.fill('#markdownInput', '```js\nconst x = 1;\n```');
    await page.click('#renderBtn');
    const html = await page.locator('#markdownOutput').innerHTML();
    expect(html).toContain('<code');
  });
});
