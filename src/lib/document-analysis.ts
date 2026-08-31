export type DocumentAnalysis = {
  glossary: string;
  characterMap: string;
  styleGuide: string;
};

const DEFAULT_ANALYSIS: DocumentAnalysis = {
  glossary: '無',
  characterMap: '無',
  styleGuide: '一般/通用',
};

export const buildDocumentAnalysisPrompt = (markdown: string) => `你是一位世界級的專業翻譯專家與資深編譯專家。請深度閱讀文本，一次完成翻譯前分析：
1. 建立核心術語表，為關鍵技術術語與專有名詞選定一致的繁體中文譯名。
2. 建立角色圖譜，包含角色名稱、性別、性格、語氣與關係。
3. 制定精簡的翻譯風格指南，涵蓋文本類型、敘事語氣、目標受眾與特殊規範。

請只回傳下列 JSON，不要加入解釋或 Markdown code fence：
{
  "glossary": "- [英文]: [中文]，每筆一行；沒有則填無",
  "characterMap": "- [角色名]: [性別/性格/關係描述]，每筆一行；沒有則填無",
  "styleGuide": "精簡但足以指導全文翻譯的風格指南"
}

文本內容：
${markdown.slice(0, 50_000)}`;

const asUsefulString = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

export const parseDocumentAnalysis = (responseText: string): DocumentAnalysis => {
  try {
    const normalized = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    return {
      glossary: asUsefulString(parsed.glossary, DEFAULT_ANALYSIS.glossary),
      characterMap: asUsefulString(parsed.characterMap, DEFAULT_ANALYSIS.characterMap),
      styleGuide: asUsefulString(parsed.styleGuide, DEFAULT_ANALYSIS.styleGuide),
    };
  } catch {
    return DEFAULT_ANALYSIS;
  }
};
