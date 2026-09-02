export type DocumentTypeId = 'auto' | 'novel' | 'technical' | 'academic' | 'business_legal' | 'general';
export type DetectedDocumentType = Exclude<DocumentTypeId, 'auto'>;

export const DOCUMENT_TYPES: Array<{ id: DocumentTypeId; label: string; description: string; instruction: string }> = [
  { id: 'auto', label: '自動判斷（建議）', description: '分析文件後自動選擇最適合的翻譯規則', instruction: '' },
  { id: 'novel', label: '小說／文學', description: '重視敘事聲音、人物語氣與對話節奏', instruction: '保留敘事視角、角色語氣與修辭效果；人物對話各自成段。' },
  { id: 'technical', label: '技術文件', description: '重視術語、識別字、步驟與程式碼精確性', instruction: '技術術語前後一致；程式碼、參數、命令、路徑與 API 名稱不得翻譯或改寫。' },
  { id: 'academic', label: '學術論文', description: '重視論證、引用、定義與正式語氣', instruction: '維持正式、客觀且可驗證的學術語氣；保留引用、註腳、圖表編號與限定語氣。' },
  { id: 'business_legal', label: '商務／法律', description: '重視義務、條件、數字與風險語意', instruction: '精確保留義務、許可、禁止、條件與例外；日期、金額、比例及條款編號不得改動。' },
  { id: 'general', label: '一般文件', description: '兼顧忠實、自然與易讀性', instruction: '使用清楚、自然且中性的繁體中文，忠實保留結構與資訊層級。' },
];

export function normalizeDocumentType(value: unknown): DocumentTypeId {
  return DOCUMENT_TYPES.some((item) => item.id === value) ? value as DocumentTypeId : 'auto';
}

export function normalizeDetectedDocumentType(value: unknown): DetectedDocumentType | null {
  const normalized = normalizeDocumentType(value);
  return normalized === 'auto' ? null : normalized;
}

export function resolveDocumentType(selected: DocumentTypeId, detected: DetectedDocumentType): DetectedDocumentType {
  return selected === 'auto' ? detected : selected;
}

export function getDocumentTypeInstruction(type: DetectedDocumentType) {
  return DOCUMENT_TYPES.find((item) => item.id === type)?.instruction ?? DOCUMENT_TYPES.at(-1)!.instruction;
}
