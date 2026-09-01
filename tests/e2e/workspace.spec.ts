import { expect, test } from '@playwright/test';

test('核心工作台可切換、設定限制並讀取 Markdown', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'PDF 翻譯工作台' })).toBeVisible();
  await expect(page.getByTestId('translation-limits')).toBeVisible();

  await page.getByLabel('翻譯費用上限').fill('2.5');
  await page.getByLabel('每段重試上限').fill('2');
  await expect(page.getByLabel('翻譯費用上限')).toHaveValue('2.5');

  await page.getByTestId('api-key-button').click();
  await expect(page.getByRole('heading', { name: 'API Key 設定' })).toBeVisible();
  await page.getByRole('button', { name: '關閉 API Key 設定' }).click();

  await page.getByTestId('history-button').click();
  await expect(page.getByRole('heading', { name: '歷史紀錄' })).toBeVisible();
  await page.getByRole('button', { name: '關閉歷史紀錄' }).click();

  await page.getByTestId('tab-converter').click();
  await page.getByTestId('file-input').setInputFiles({
    name: 'browser-smoke.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Browser smoke test\n\nThis document stays in the browser.'),
  });
  await expect(page.getByText('browser-smoke.md')).toBeVisible();
  await expect(page.getByText('Browser smoke test')).toBeVisible();
});
