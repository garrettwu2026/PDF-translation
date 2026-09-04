import { expect, test } from '@playwright/test';
import { encodeProject } from '../../src/lib/project-backup';

const source = Array.from({length: 800}, (_, i) => '# Chapter ' + i + '\n\n' + 'Synthetic paragraph. '.repeat(15) + '\n\n').join('');
const record = {id: 'portable-book', title: 'portable.md', author: '', coverImage: null, extractedText: source,
  translatedText: source + '\n\nFINAL-EXPORT-MARKER', currentChunk: 1, totalChunks: 1, status: 'completed' as const, timestamp: 1, model: 'gpt-5.6-luna'};
const backup = () => encodeProject({record, requests: [{id: record.id + ':' + 'a'.repeat(64), documentId: record.id, state: 'complete', response: {text: 'paid intermediate', finishReason: 'stop'}}]});

test('portable import, searchable history, bounded reading and explicit cache cleanup', async ({page, context}) => {
  let paidCalls = 0;
  await context.route('https://api.openai.com/**', route => { paidCalls++; return route.abort(); });
  await context.route('https://generativelanguage.googleapis.com/**', route => { paidCalls++; return route.abort(); });
  await page.goto('/');
  await page.getByTestId('history-button').click();
  await page.getByLabel('匯入專案備份檔案').setInputFiles({name: 'portable.json', mimeType: 'application/json', buffer: Buffer.from(await backup())});
  await expect(page.getByRole('button', {name: '確認匯入副本'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', {name: '歷史紀錄', exact: true})).toBeVisible();
  await page.getByLabel('匯入專案備份檔案').setInputFiles({name: 'portable.json', mimeType: 'application/json', buffer: Buffer.from(await backup())});
  await page.getByRole('button', {name: '確認匯入副本'}).click();
  await page.getByLabel('搜尋歷史紀錄').fill('no-match');
  await expect(page.getByText('找不到符合的專案。')).toBeVisible();
  await page.getByLabel('搜尋歷史紀錄').fill('portable');
  await page.getByRole('button', {name: '載入 portable.md', exact: true}).click();
  const article = page.locator('#translation-result-content');
  await expect(page.getByLabel('閱讀頁碼')).toBeVisible();
  expect((await article.innerText()).length).toBeLessThan(25000);
  await expect(page.locator('.canonical-document')).toHaveCount(0);
  const options = page.getByLabel('閱讀頁碼').locator('option');
  await page.getByLabel('閱讀頁碼').selectOption(String(await options.count() - 1));
  await expect(article).toContainText('FINAL-EXPORT-MARKER');
  await page.getByLabel('閱讀頁碼').selectOption('0');
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
  await expect(page.frameLocator('iframe').locator('body')).toContainText('FINAL-EXPORT-MARKER');
  await expect(article).not.toContainText('FINAL-EXPORT-MARKER');
  await page.getByTestId('history-button').click();
  await page.setViewportSize({width: 320, height: 800});
  await expect(page.getByRole('button', {name: '刪除 portable.md', exact: true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: 'test-results/history-mobile.png'});
  await page.setViewportSize({width: 1280, height: 900});
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', {name: '備份 portable.md', exact: true}).click();
  expect((await downloadEvent).suggestedFilename()).toContain('translation-project');
  await page.getByRole('button', {name: '清理中間結果 portable.md', exact: true}).click();
  await page.getByRole('button', {name: '確認清理中間結果', exact: true}).click();
  await expect(page.getByRole('button', {name: '清理中間結果 portable.md', exact: true})).toBeDisabled();
  await page.getByRole('button', {name: '載入 portable.md', exact: true}).click();
  await expect(page.getByLabel('閱讀頁碼')).toBeVisible();
  expect(paidCalls).toBe(0);
});
