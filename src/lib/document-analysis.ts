export type DocumentAnalysis = {
  glossary: string;
  characterMap: string;
  styleGuide: string;
  globalSummary: string;
  documentType: 'novel' | 'technical' | 'academic' | 'business_legal' | 'general';
};

const DEFAULT_ANALYSIS: DocumentAnalysis = {
  glossary: '無',
  characterMap: '無',
  styleGuide: '一般/通用',
  globalSummary: '',
  documentType: 'general',
};

export const DOCUMENT_ANALYSIS_SCHEMA = {
  name: 'document_analysis',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      glossary: { type: 'string' },
      characterMap: { type: 'string' },
      styleGuide: { type: 'string' },
      globalSummary: { type: 'string' },
      documentType: { type: 'string', enum: ['novel', 'technical', 'academic', 'business_legal', 'general'] },
    },
    required: ['glossary', 'characterMap', 'styleGuide', 'globalSummary', 'documentType'],
  },
} as const;

export function sampleDocumentForAnalysis(markdown: string, maxCharacters = 50_000, windows = 8): string {
  const normalized = markdown.trim();
  if (normalized.length <= maxCharacters) return normalized;
  const windowCount = Math.max(2, Math.min(windows, Math.floor(maxCharacters / 1_000)));
  const windowSize = Math.floor(maxCharacters / windowCount);
  const maxStart = normalized.length - windowSize;
  return Array.from({ length: windowCount }, (_, index) => {
    const start = Math.round((maxStart * index) / (windowCount - 1));
    return `[文件取樣 ${index + 1}/${windowCount}]\n${normalized.slice(start, start + windowSize)}`;
  }).join('\n\n');
}

export const buildDocumentAnalysisPrompt = (markdown: string) => `請閱讀分布於全文的代表性取樣，一次完成翻譯前分析：
1. 建立核心術語表，為關鍵技術術語與專有名詞選定一致的繁體中文譯名。
2. 建立角色圖譜，包含角色名稱、性別、性格、語氣與關係。
3. 制定精簡的翻譯風格指南，涵蓋文本類型、敘事語氣、目標受眾與特殊規範。
4. 建立全書摘要，保留跨章節的重要主題、角色關係與發展，控制在 300 字內。
5. 將文件分類為 novel、technical、academic、business_legal 或 general。

回傳內容必須符合 API 提供的 JSON Schema；沒有術語或角色時對應欄位填「無」。不要猜測取樣中沒有的資訊。

全文分散取樣：
${sampleDocumentForAnalysis(markdown)}`;

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
      globalSummary: asUsefulString(parsed.globalSummary, DEFAULT_ANALYSIS.globalSummary),
      documentType: ['novel', 'technical', 'academic', 'business_legal', 'general'].includes(String(parsed.documentType))
        ? parsed.documentType as DocumentAnalysis['documentType']
        : DEFAULT_ANALYSIS.documentType,
    };
  } catch {
    return DEFAULT_ANALYSIS;
  }
};
