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
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'API Key 設定' })).toBeHidden();
  await expect(page.getByTestId('api-key-button')).toBeFocused();

  await page.getByTestId('history-button').click();
  await expect(page.getByRole('heading', { name: '歷史紀錄' })).toBeVisible();
  await page.getByRole('button', { name: '關閉歷史紀錄' }).click();

  const dropzone = page.getByRole('button', { name: '上傳 PDF 或 Markdown 文件' });
  await dropzone.evaluate((element) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(['# Drag and drop\n\nLocal browser test.'], 'dragged.md', { type: 'text/markdown' }));
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
  });
  await expect(page.getByText('dragged.md')).toBeVisible();

  await page.getByTestId('tab-converter').click();
  await page.getByTestId('file-input').setInputFiles({
    name: 'browser-smoke.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Browser smoke test\n\nThis document stays in the browser.'),
  });
  await expect(page.getByText('browser-smoke.md')).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Browser smoke test', exact: true})).toBeVisible();
});
