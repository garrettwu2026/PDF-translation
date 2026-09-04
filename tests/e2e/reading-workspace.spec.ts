import { expect, test, type Page } from '@playwright/test';

const source = '# Source chapter\n\nSource paragraph only.\n\n## Second chapter\n\n' + Array.from({length: 25}, (_, i) => 'Source ' + i).join('\n\n');
const translation = '# 第一章\n\n這是已完成的譯文。\n\n## 第二章\n\n' + Array.from({length: 25}, (_, i) => '譯文段落 ' + i).join('\n\n');
async function loadSyntheticHistory(page: Page) {
  await page.goto('/');
  await page.evaluate(async ({source, translation}) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pdf-translator-db', 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('history', 'readwrite');
        tx.objectStore('history').put({ id: 'synthetic-ui', title: 'reading.md', author: '', coverImage: null,
          extractedText: source, translatedText: translation, extractionComplete: true, currentChunk: 2, totalChunks: 2,
          status: 'completed', timestamp: Date.now(), model: 'gemini-3.7-flash' });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, { source, translation });
  await page.reload();
  await page.getByTestId('history-button').click();
  await page.getByRole('button', {name: '載入 reading.md', exact: true}).click();
}

test('reader settings, chapter links, comparison pagination and canonical PDF export', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await loadSyntheticHistory(page);
  await expect(page.getByTestId('translation-status')).toHaveAttribute('data-stage', 'completed');
  await expect(page.getByText('最近保存：', {exact: false})).toBeVisible();
  await page.getByLabel('章節導覽').selectOption('reading-line-5');
  await expect(page.locator('#reading-line-5')).toBeFocused();
  await page.getByText('閱讀設定', { exact: true }).click();
  await page.getByLabel('閱讀字級').selectOption('24');
  await page.getByLabel('閱讀行距').selectOption('2.2');
  await page.getByLabel('閱讀紙張').selectOption('mint');
  await expect(page.locator('#translation-result-content')).toHaveCSS('font-size', '24px');
  await page.getByRole('button', {name: '段落對照', exact: true}).click();
  await expect(page.locator('.comparison-row')).toHaveCount(20);
  await page.getByRole('button', {name: '下一頁', exact: true}).click();
  await expect(page.locator('.comparison-row')).toHaveCount(8);
  await page.getByRole('button', {name: '原文', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Source chapter', exact: true})).toBeVisible();
  await page.getByRole('button', {name: '專注閱讀', exact: true}).click();
  await expect(page.locator('.control-rail')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.control-rail')).toBeVisible();
  // Intercept only the isolated test window's print call, not real user printing.
  await page.evaluate(() => {
    const original = Document.prototype.createElement;
    Document.prototype.createElement = function(this: Document, tag: string, options?: ElementCreationOptions) {
      const element = original.call(this, tag, options);
      if (tag === 'iframe') queueMicrotask(() => { (element as HTMLIFrameElement).contentWindow!.print = () => {}; });
      return element;
    } as typeof document.createElement;
  });
  await page.locator('.export-menu > summary').click();
  await page.getByRole('button', {name: '下載 PDF', exact: true}).click();
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('body')).toContainText('這是已完成的譯文。');
  await expect(frame.locator('body')).not.toContainText('Source paragraph only.');
  await expect(frame.locator('body')).not.toContainText('段落對照');
  await expect(frame.locator('article')).not.toHaveAttribute('style');
  let exportedMarkdown = '';
  await page.route('**/api/generate-epub', async route => {
    exportedMarkdown = route.request().postDataJSON().markdown;
    await route.fulfill({contentType: 'application/epub+zip', body: 'synthetic export'});
  });
  await page.getByRole('button', {name: '段落對照', exact: true}).click();
  await page.locator('.export-menu > summary').click();
  await page.getByRole('button', {name: '下載 EPUB', exact: true}).click();
  await expect.poll(() => exportedMarkdown).toBe(translation);
  expect(errors).toEqual([]);
});

test('mobile workspace, budget shortcut and export menu remain usable without overflow', async ({ page }) => {
  await page.setViewportSize({width: 390, height: 844});
  await loadSyntheticHistory(page);
  await page.getByRole('button', {name: '結果', exact: true}).click();
  await expect(page.locator('.result-column')).toBeVisible();
  await expect(page.locator('.control-rail')).toBeHidden();
  await expect(page.locator('.result-panel')).toHaveCSS('position', 'static');
  await page.locator('.budget-shortcut').click();
  await expect(page.getByLabel('翻譯費用上限')).toBeFocused();
  await page.getByLabel('翻譯費用上限').fill('10');
  await expect(page.locator('.budget-shortcut')).toContainText('$10.00');
  await page.getByRole('button', {name: '結果', exact: true}).click();
  await page.getByRole('button', {name: '段落對照', exact: true}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (await page.getByRole('button', {name: '關閉通知'}).isVisible()) await page.getByRole('button', {name: '關閉通知'}).click();
  await page.screenshot({path: 'test-results/ui-mobile.png', fullPage: false});
  await page.setViewportSize({width: 1440, height: 1000});
  await page.getByRole('button', {name: '譯文', exact: true}).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({path: 'test-results/ui-desktop.png', fullPage: false});
  await page.setViewportSize({width: 320, height: 700});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('storage failure never claims that the latest progress was saved', async ({ page, context }) => {
  let paidCalls = 0;
  await context.route('https://generativelanguage.googleapis.com/**', route => { paidCalls++; return route.abort(); });
  await page.goto('/');
  await page.getByTestId('api-key-button').click();
  await page.getByLabel('Google Gemini API Key：').fill('AIzaSyntheticNeverSentToProvider');
  await page.getByRole('button', {name: '儲存並套用'}).click();
  await page.getByTestId('file-input').setInputFiles({name: 'storage.md', mimeType: 'text/markdown', buffer: Buffer.from('Synthetic source.')});
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(this: IDBObjectStore, ...args: Parameters<typeof original>) {
      if (this.name === 'history') throw new DOMException('synthetic storage failure', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', {name: '確認翻譯', exact: true}).click();
  await expect(page.locator('.save-status')).toContainText('最新進度儲存失敗');
  await expect(page.getByRole('heading', {name: '本機儲存需要處理'})).toBeVisible();
  expect(paidCalls).toBe(0);
});

test('missing key error offers a direct settings action without paid requests', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles({ name: 'synthetic.md', mimeType: 'text/markdown', buffer: Buffer.from('A short synthetic sentence.') });
  await page.getByRole('button', {name: '確認翻譯', exact: true}).click();
  await expect(page.getByRole('heading', {name: '請檢查 API 金鑰'})).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: '開啟金鑰設定'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
