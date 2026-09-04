import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const translated = '[[PDFT_SEG:S0001]]這是一個簡短的句子。';
const source = 'This is a short sentence.';

async function prepare(page: Page) {
  await page.goto('/');
  await page.getByTestId('api-key-button').click();
  await page.getByLabel('OpenAI API Key（選填）：').fill('sk-synthetic-never-sent-to-provider');
  await page.getByRole('button', { name: '儲存並套用' }).click();
  await page.getByRole('combobox', { name: '翻譯模型', exact: true }).selectOption('gpt-5.6-luna');
  await page.getByRole('combobox', { name: '文件類型', exact: true }).selectOption('general');
  await page.getByRole('checkbox', { name: /章節一致性校稿/ }).uncheck();
  await page.getByTestId('file-input').setInputFiles({
    name: 'recovery.md', mimeType: 'text/markdown', buffer: Buffer.from(source),
  });
  await expect(page.getByRole('button', { name: '確認翻譯', exact: true })).toBeEnabled();
}

async function mockProvider(context: BrowserContext, options: { expensiveDraft?: boolean; expensiveChapter?: boolean; holdCorrection?: boolean } = {}) {
  const calls = { analysis: 0, draft: 0, correction: 0 };
  let chapterCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await context.route('https://api.openai.com/**', async route => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }); return;
    }
    const body = route.request().postDataJSON();
    const headers = { 'access-control-allow-origin': '*' };
    if (body.stream) {
      calls.draft++;
      const event = {
        id: 'synthetic', object: 'chat.completion.chunk', created: 1, model: body.model,
        choices: [{ index: 0, delta: { content: translated }, finish_reason: 'stop' }],
        usage: { prompt_tokens: options.expensiveDraft ? 1_000_000 : 10, completion_tokens: 10, total_tokens: 20 },
      };
      await route.fulfill({ headers, contentType: 'text/event-stream', body: 'data: ' + JSON.stringify(event) + '\n\ndata: [DONE]\n\n' });
      return;
    }
    const schema = body.response_format?.json_schema?.name;
    let value: object;
    if (schema === 'document_analysis') {
      calls.analysis++;
      value = { glossary: '無', characterMap: '無', styleGuide: '一般', globalSummary: '', documentType: 'general' };
    } else if (schema === 'translation_correction') {
      calls.correction++;
      if (options.holdCorrection && calls.correction === 1) await gate;
      value = { correctedTranslation: translated, newTerms: [], newCharacters: [], chunkSummary: '簡短句子',
        foundHallucinations: false, missingContentDetected: false, missingSentenceIds: [] };
    } else if (schema === 'chapter_consistency_proofreading') {
      chapterCalls++;
      value = { correctedChapter: '這是一個簡短的句子。', consistencyIssues: [], newTerms: [], newCharacters: [] };
    } else {
      throw new Error('Unexpected mock stage: ' + schema);
    }
    await route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({
      id: 'synthetic', object: 'chat.completion', created: 1, model: body.model,
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(value) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: options.expensiveChapter && schema === 'chapter_consistency_proofreading' ? 1_000_000 : 10,
        completion_tokens: 10, total_tokens: 20 },
    }) }).catch(() => {}); // Reload may close the obsolete request.
  });
  return { calls, release, chapterCalls: () => chapterCalls };
}

async function loadHistory(page: Page) {
  await page.getByTestId('history-button').click();
  await page.getByRole('button', { name: '載入 recovery.md', exact: true }).click();
}

test('budget stop -> reload -> raise cap -> reuse paid stages -> export', async ({ page, context }) => {
  const mock = await mockProvider(context, { expensiveDraft: true });
  await prepare(page);
  await page.getByLabel('翻譯費用上限').fill('0.05');
  await page.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect(page.getByRole('heading', { name: '文件預算不足' })).toBeVisible();
  await page.getByRole('button', {name: '調整上限', exact: true}).click();
  await expect(page.getByLabel('翻譯費用上限')).toBeFocused();
  expect(mock.calls).toEqual({ analysis: 1, draft: 1, correction: 0 });
  await page.reload();
  await loadHistory(page);
  await page.getByLabel('翻譯費用上限').fill('5');
  await page.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect(page.getByTestId('translation-status')).toHaveAttribute('data-stage', 'completed');
  await page.locator('.export-menu > summary').click();
  await expect(page.getByRole('button', { name: '下載 MD', exact: true })).toBeEnabled();
  expect(mock.calls).toEqual({ analysis: 1, draft: 1, correction: 1 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載 MD', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
});

test('portable backup resumes on an isolated device without repaying analysis or draft', async ({page, context, browser}) => {
  const original = await mockProvider(context, {expensiveDraft: true});
  await prepare(page);
  await page.getByLabel('翻譯費用上限').fill('0.05');
  await page.getByRole('button', {name: '確認翻譯', exact: true}).click();
  await expect(page.getByRole('heading', {name: '文件預算不足'})).toBeVisible();
  await page.getByTestId('history-button').click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', {name: '備份 recovery.md', exact: true}).click();
  const stream = await (await downloadEvent).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = Buffer.concat(chunks);
  expect(backup.toString()).not.toContain('sk-synthetic');
  const nextContext = await browser.newContext({baseURL: 'http://127.0.0.1:4173'});
  try {
    const next = await nextContext.newPage();
    const resumed = await mockProvider(nextContext);
    await next.goto('/');
    await next.getByTestId('history-button').click();
    await next.getByLabel('匯入專案備份檔案').setInputFiles({name: 'backup.json', mimeType: 'application/json', buffer: backup});
    await next.getByRole('button', {name: '確認匯入副本'}).click();
    await next.getByRole('button', {name: '載入 recovery.md', exact: true}).click();
    await expect(next.getByText(/下一段依目前設定驗證命中 2 筆/)).toBeVisible();
    await next.getByTestId('api-key-button').click();
    await next.getByLabel('OpenAI API Key（選填）：').fill('sk-synthetic-second-device');
    await next.getByRole('button', {name: '儲存並套用'}).click();
    await next.getByLabel('翻譯費用上限').fill('5');
    await next.getByRole('button', {name: '確認翻譯', exact: true}).click();
    await expect(next.getByTestId('translation-status')).toHaveAttribute('data-stage', 'completed');
    expect(original.calls).toEqual({analysis: 1, draft: 1, correction: 0});
    expect(resumed.calls).toEqual({analysis: 0, draft: 0, correction: 1});
  } finally { await nextContext.close(); }
});

test('reload during correction preserves draft and reports unresolved request', async ({ page, context }) => {
  const mock = await mockProvider(context, { holdCorrection: true });
  await prepare(page);
  await page.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect.poll(() => mock.calls.correction).toBe(1);
  await page.reload();
  mock.release();
  await loadHistory(page);
  await page.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect(page.getByTestId('translation-status')).toHaveAttribute('data-stage', 'completed');
  await page.locator('.export-menu > summary').click();
  await expect(page.getByRole('button', { name: '下載 MD', exact: true })).toBeEnabled();
  expect(mock.calls.analysis).toBe(1);
  expect(mock.calls.draft).toBe(1);
  expect(mock.calls.correction).toBe(2);
  await page.getByTestId('history-button').click();
  await expect(page.getByText(/筆請求用量待確認/)).toBeVisible();
});

test('two tabs cannot translate identical file concurrently; stop releases the lock', async ({ page, context }) => {
  const mock = await mockProvider(context, { holdCorrection: true });
  await prepare(page);
  await page.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect.poll(() => mock.calls.correction).toBe(1);
  const second = await context.newPage();
  await prepare(second);
  await second.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect(second.getByRole('heading', { name: '文件正在其他分頁使用' })).toBeVisible();
  expect(mock.calls.analysis).toBe(1);
  await page.getByRole('button', { name: '停止並保留進度' }).click();
  mock.release();
  await expect(page.getByRole('button', { name: '停止並保留進度' })).toBeHidden();
  await second.reload();
  await loadHistory(second);
  await second.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect(second.getByTestId('translation-status')).toHaveAttribute('data-stage', 'completed');
  await second.locator('.export-menu > summary').click();
  await expect(second.getByRole('button', { name: '下載 MD', exact: true })).toBeEnabled();
});

test('mixed PDF sends only scanned page to OCR, retries truncation and persists complete source', async ({ page, context }) => {
  let ocrCalls = 0, analysisCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await context.route('https://generativelanguage.googleapis.com/**', async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204 }); return; }
    const body = route.request().postDataJSON();
    const parts = body.contents.flatMap((content: { parts: unknown[] }) => content.parts);
    const inline = parts.find((part: { inlineData?: unknown }) => part.inlineData)?.inlineData;
    let text: string, finishReason = 'STOP';
    if (inline) {
      ocrCalls++;
      const pdf = await PDFDocument.load(Buffer.from(inline.data, 'base64'));
      expect(pdf.getPageCount()).toBe(1);
      text = 'Scanned page text.';
      if (ocrCalls === 1) finishReason = 'MAX_TOKENS';
    } else {
      analysisCalls++;
      await gate;
      text = JSON.stringify({ glossary: '無', characterMap: '無', styleGuide: '一般', globalSummary: '', documentType: 'general' });
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
    }) }).catch(() => {});
  });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText('Native readable source page.', { x: 40, y: 700, font, size: 16 });
  pdf.addPage().drawRectangle({ x: 40, y: 600, width: 200, height: 60, color: rgb(0, 0, 0) });
  await page.goto('/');
  await page.getByTestId('api-key-button').click();
  await page.getByLabel('Google Gemini API Key：').fill('AIzaSyntheticNeverSentToProvider');
  await page.getByRole('button', { name: '儲存並套用' }).click();
  await page.getByTestId('file-input').setInputFiles({
    name: 'mixed.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()),
  });
  await page.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect.poll(() => analysisCalls).toBe(1);
  expect(ocrCalls).toBe(2);
  await page.getByRole('button', { name: '停止並保留進度' }).click();
  release();
  await expect(page.getByTestId('translation-status')).toHaveAttribute('data-stage', 'paused');
  await page.reload();
  await page.getByTestId('history-button').click();
  await page.getByRole('button', { name: '載入 mixed.pdf', exact: true }).click();
  await page.getByTestId('tab-converter').click();
  await expect(page.getByText(/Native readable source page/)).toBeVisible();
  await expect(page.getByText(/Scanned page text/)).toBeVisible();
});

test('paid chapter review survives a budget stop without repeating correction or review', async ({ page, context }) => {
  const mock = await mockProvider(context, { expensiveChapter: true });
  await prepare(page);
  await page.getByRole('combobox', { name: '文件類型', exact: true }).selectOption('novel');
  await page.getByRole('checkbox', { name: /章節一致性校稿/ }).check();
  await page.getByLabel('翻譯費用上限').fill('0.05');
  await page.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect(page.getByTestId('translation-status')).toHaveAttribute('data-stage', 'paused');
  expect(mock.chapterCalls()).toBe(1);
  await page.reload();
  await loadHistory(page);
  await page.getByLabel('翻譯費用上限').fill('5');
  await page.getByRole('button', { name: '確認翻譯', exact: true }).click();
  await expect(page.getByTestId('translation-status')).toHaveAttribute('data-stage', 'completed');
  expect(mock.calls).toEqual({ analysis: 1, draft: 1, correction: 1 });
  expect(mock.chapterCalls()).toBe(1);
});
