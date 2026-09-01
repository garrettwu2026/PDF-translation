type TranslationContext = {
  style: string;
  glossary: string;
  characterMap: string;
  plotSummary: string;
  previousSourceText: string;
  previousTranslatedText: string;
  customInstructions: string;
  documentTypeInstruction?: string;
  preservePlaceholdersInstruction?: string;
};

type CorrectionContext = {
  sourceText: string;
  draftTranslation: string;
  glossary: string;
  characterMap: string;
  customInstructions: string;
  deterministicFindings?: string;
  documentTypeInstruction?: string;
};

export type CorrectionResult = {
  correctedTranslation: string;
  newTerms: string[];
  newCharacters: string[];
  chunkSummary: string;
  foundHallucinations: boolean;
  missingContentDetected: boolean;
  missingSentenceIds: string[];
};

export const CORRECTION_SCHEMA = {
  name: 'translation_correction',
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      correctedTranslation: { type: 'string' },
      newTerms: { type: 'array', items: { type: 'string' } },
      newCharacters: { type: 'array', items: { type: 'string' } },
      chunkSummary: { type: 'string' },
      foundHallucinations: { type: 'boolean' },
      missingContentDetected: { type: 'boolean' },
      missingSentenceIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['correctedTranslation', 'newTerms', 'newCharacters', 'chunkSummary', 'foundHallucinations', 'missingContentDetected', 'missingSentenceIds'],
  },
} as const;

export const extractionSystemInstruction = (hasNativeText: boolean) => hasNativeText
  ? 'You are a precise text formatting and repair tool. Your ONLY job is to take the provided raw PDF text and format it into clean Markdown. Fix broken line breaks, identify headings, merge split sentences, and preserve ALL original text exactly. Pay special attention to superscript numbers (citations/footnotes) and ensure they are formatted clearly (e.g., [1] or ^1). DO NOT translate, DO NOT summarize, and DO NOT skip any content.'
  : 'You are a precise OCR, text extraction, and repair tool. Your ONLY job is to extract the exact text from the provided PDF pages and format it as clean Markdown. Fix broken line breaks, identify headings, merge split sentences, and preserve ALL original text exactly. Identify superscript numbers used for citations or footnotes and format them as [n] or ^n. DO NOT translate the text. Extract it in its ORIGINAL LANGUAGE. DO NOT summarize, DO NOT skip any content.';

export const buildExtractionPrompt = (rawText: string, hasNativeText: boolean) => hasNativeText
  ? `你是一個專業的排版與文本修復助手。以下是從 PDF 底層直接提取出來的純文字，可能存在不正常的斷句或格式混亂。請幫我將這些文字重新排版成乾淨、連貫的 Markdown 格式（修復斷行、還原標題層級、合併被錯誤切斷的句子等）。\n\n【特別注意】：\n1. **修復斷句**：確保句子完整且邏輯連貫，修復因 PDF 換行導致的單字或句子中斷。\n2. **保留對話換行**：如果遇到人物對話（通常在引號內），請務必保留其獨立的換行，絕對不要將不同角色的對話合併成同一段落。\n3. **識別引用序號**：PDF 中常有上標的小數字作為註解或引用（如 word¹）。請識別這些數字並確保它們格式清晰（例如使用 [1] 或 ^1），不要讓它們與前面的單字黏在一起。\n4. **絕對不要翻譯**：保持原始語言。\n5. **絕對不要刪減或總結**：必須 100% 保留所有原始文字。\n\n原始文字：\n${rawText}`
  : '你是一個精準的 OCR、文字提取與修復工具。你的「唯一」任務是將這份 PDF 文件中的文字「逐字句」完整提取出來，並轉換為乾淨、連貫的 Markdown 格式。\n\n請嚴格遵守以下規則：\n1. **修復斷句**：確保句子完整，修復因排版導致的斷行問題。\n2. **保留對話換行**：如果遇到人物對話（通常在引號內），請務必保留其獨立的換行，絕對不要將不同角色的對話合併成同一段落。\n3. **識別上標註解**：請特別注意字尾的小數字（上標）。請將它們格式化為 [n] 或 ^n，確保它們與正文有微小區隔。\n4. **保持原始語言，絕對不要翻譯**：請完全照抄圖片上的文字。\n5. **絕對不要遺漏任何內容**：包含封面、目錄、章節標題與所有內文。\n6. **直接輸出 Markdown**：不要有任何開頭或結尾的解釋。';

export const buildTranslationSystemInstruction = ({
  style,
  glossary,
  characterMap,
  plotSummary,
  previousSourceText,
  previousTranslatedText,
  customInstructions,
  documentTypeInstruction,
  preservePlaceholdersInstruction,
}: TranslationContext) => `你是一位世界級的專業翻譯專家與資深編譯專家，精通各種文體的正體中文翻譯。你不僅擅長長篇小說、技術文件與各類科技、科學領域（如：人工智慧、生物工程、物理學、資訊安全等），更深耕於文學小說、社會科學、歷史、經濟、政治等各類文學與非文學著作。
你的唯一任務是將使用者提供的文本翻譯成精確、優雅且符合各專業領域規範的繁體中文。

【全域翻譯指南與風格】：
${style}

【文件類型專用規則】：
${documentTypeInstruction || '使用一般文件翻譯規則。'}

【全域術語表 (Glossary)】：
請嚴格遵守以下術語表，確保譯名完全一致：
${glossary !== '無' ? glossary : '保持專有名詞與章節標題前後統一。'}

【角色圖譜 (Character Map)】：
請根據以下角色設定，確保對話語氣與人稱（他/她/它）一致：
${characterMap !== '無' ? characterMap : '自動識別角色並保持一致。'}

【前情提要 (Plot Summary)】：
${plotSummary ? `目前故事進展：\n${plotSummary}` : '這是故事的開頭。'}

${previousSourceText ? `【前文參考 (Context)】：
為了確保上下文銜接順暢（如代名詞、語氣、連貫性），請參考上一段的原文與譯文：
[上一段原文]：
${previousSourceText}
[上一段譯文]：
${previousTranslatedText}` : ''}

【強制約束】：
1. 零漏譯：嚴禁摘要、嚴禁刪減、嚴禁跳過任何段落或句子。即使是重複或看似不重要的內容也必須翻譯。
2. 嚴禁輸出任何與譯文無關的解釋、評論或提示詞。
3. 必須 100% 符合術語表與角色圖譜。
4. 確保標點符號符合繁體中文規範（如使用全形標點，避免英文逗號誤用）。
5. 嚴禁「超譯」與「幻覺」：不要為了語句優美而加入原文中不存在的形容詞、副詞或任何描述性內容。保持譯文精簡且 100% 忠於原意。
6. 嚴格保留原文的 Markdown 格式與分段結構：確保標題、段落、清單等格式與原文完全一致，不要將段落合併（除非是為了修復對話排版，見第9點）。
7. 純譯文輸出：嚴禁在翻譯結果中保留或夾雜原始語言（如英文）的「句子或段落」，絕對不要輸出「原文+譯文」的雙語對照格式。除了專有名詞後方的括號註釋外，整份輸出必須是純粹的繁體中文。
8. 雙關語與隱喻處理：請敏銳偵測原文中的雙關語、幽默、隱喻或言外之意。盡可能在譯文中重現對等的修辭效果與雙重語意；若中英文無法完美對應，請以最符合上下文語境的方式進行「意譯」，切勿生硬直譯導致失去原有的文字趣味。
9. 文中的 [[PDFT_SEG:SXXXX]] 是句子追蹤標記，必須逐字保留在對應譯句之前，不得刪除、翻譯、重排或自行新增。
${preservePlaceholdersInstruction ? `10. ${preservePlaceholdersInstruction}\n` : ''}
${customInstructions ? `\n【使用者自訂指示 (Custom Instructions)】：\n請嚴格遵守以下由使用者針對此文本提供的特殊翻譯指示：\n${customInstructions}\n` : ''}`;

export const buildTranslationPrompt = (sourceText: string) => `請翻譯以下文本。
【待翻譯文本】：
${sourceText}`;

export const buildCorrectionPrompt = ({
  sourceText,
  draftTranslation,
  glossary,
  characterMap,
  customInstructions,
  deterministicFindings,
  documentTypeInstruction,
}: CorrectionContext) => `請對以下翻譯進行嚴格的自我校對，並提取新出現的專有名詞與劇情發展。

【原文】：
${sourceText}

【初稿譯文】：
${draftTranslation}

【現有術語表】：
${glossary}

【現有角色圖譜】：
${characterMap}

【程式化完整性檢查】：
${deterministicFindings || '- 尚未提供程式化檢查結果。'}

【文件類型專用規則】：
${documentTypeInstruction || '使用一般文件翻譯規則。'}

【任務 1：自我校對與零漏譯檢查】：
請檢查初稿是否有：
1. **漏譯或誤譯**：檢查是否有任何句子、段落被跳過或未翻譯。
2. 標點符號錯誤。
3. 未遵守現有術語表與角色圖譜。
4. **幻覺或超譯**：檢查譯文是否加入了原文中不存在的資訊。
5. **格式檢查**：確保譯文保留了原文所有的 Markdown 標記（如 # 標題、* 列表等）以及正確的分段與換行。
6. **夾雜原文檢查 (極度重要)**：確保初稿中沒有殘留未翻譯的英文「句子或段落」（絕對不可包含雙語對照的段落）。如果發現整句或整段未翻譯的英文，請務必將其翻譯為繁體中文。除了專有名詞的括號註釋外，最終輸出必須是 100% 的繁體中文。
7. **雙關語與語氣檢查**：確認原文中的雙關語、隱喻或特殊語氣是否被妥善保留並轉化為自然流暢的中文，避免生硬直譯。
8. **文件類型規則檢查**：確認譯文符合上方文件類型專用規則，不要把小說排版規則套用到技術、學術或法律文件。
9. **句子標記檢查**：逐一核對 [[PDFT_SEG:SXXXX]]；missingSentenceIds 必須列出原文存在但譯文缺少或對應譯句為空的 ID，否則回傳空陣列。
${customInstructions ? `10. **使用者自訂指示檢查**：請確保譯文完全符合以下使用者自訂指示：\n${customInstructions}\n` : ''}
請直接提供修正後的「最終完美譯文」。

【任務 2：動態上下文提取】：
請分析本段內容並提取：
1. **新術語**：新出現的專有名詞（格式：- [英文]: [中文]）。
2. **新角色/角色發展**：新出現的角色或現有角色的新資訊（如性別、新關係）。
3. **劇情摘要**：用 50 字內簡述本段發生的關鍵劇情。

請依 API 提供的 JSON Schema 回傳結果。correctedTranslation 必須是修正後的完整純譯文；陣列沒有新資料時回傳空陣列。`;

export const parseCorrectionResult = (responseText: string): CorrectionResult => {
  const normalized = responseText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(normalized) as Partial<CorrectionResult>;
  if (
    typeof parsed.correctedTranslation !== 'string'
    || !Array.isArray(parsed.newTerms)
    || !parsed.newTerms.every((value) => typeof value === 'string')
    || !Array.isArray(parsed.newCharacters)
    || !parsed.newCharacters.every((value) => typeof value === 'string')
    || typeof parsed.chunkSummary !== 'string'
    || typeof parsed.foundHallucinations !== 'boolean'
    || typeof parsed.missingContentDetected !== 'boolean'
    || !Array.isArray(parsed.missingSentenceIds)
    || !parsed.missingSentenceIds.every((value) => typeof value === 'string')
  ) {
    throw new Error('Correction response does not match the required schema');
  }
  return parsed as CorrectionResult;
};
