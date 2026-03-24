import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import html2pdf from 'html2pdf.js/dist/html2pdf.min.js';
import { Upload, FileText, DollarSign, Play, Download, Loader2, AlertCircle, CheckCircle2, FileUp, Key, Copy, Book, X, ExternalLink } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const uint8ArrayToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

const MODELS = [
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (最強品質)', inputPrice: 1.25, outputPrice: 5.00 },
  { id: 'gemini-3.1-flash-preview', name: 'Gemini 3.1 Flash (推薦)', inputPrice: 0.075, outputPrice: 0.30 },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite (極速)', inputPrice: 0.0375, outputPrice: 0.15 },
];

const splitTextIntoChunks = (text: string, maxChunkSize: number = 4000) => {
  // First, split by headings to keep sections together as much as possible
  const sections = text.split(/(?=\n#+ )/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const section of sections) {
    // If a single section is too long, split it by paragraphs
    if (section.length > maxChunkSize) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      const paragraphs = section.split(/\n\n+/);
      for (const paragraph of paragraphs) {
        if (paragraph.length > maxChunkSize) {
          // If a single paragraph is still too long, we have to split it by sentences or lines
          if (currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = '';
          }
          
          let remainingParagraph = paragraph;
          while (remainingParagraph.length > maxChunkSize) {
            // Try to find a good split point (period followed by space)
            let splitPoint = remainingParagraph.lastIndexOf('. ', maxChunkSize);
            if (splitPoint === -1) splitPoint = maxChunkSize;
            else splitPoint += 1; // Include the period
            
            chunks.push(remainingParagraph.substring(0, splitPoint));
            remainingParagraph = remainingParagraph.substring(splitPoint);
          }
          currentChunk = remainingParagraph;
        } else {
          if ((currentChunk.length + paragraph.length + 2) > maxChunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = '';
          }
          currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + paragraph;
        }
      }
    } else {
      if ((currentChunk.length + section.length) > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      currentChunk += section;
    }
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  
  return chunks;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'translate' | 'converter'>('translate');
  const [customTitle, setCustomTitle] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-flash-preview');
  const [splitTranslation, setSplitTranslation] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationStage, setTranslationStage] = useState<'extracting' | 'repairing' | 'analyzing' | 'translating' | null>(null);
  const [glossary, setGlossary] = useState<string>('');
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [translatedText, setTranslatedText] = useState('');
  const [translationStyle, setTranslationStyle] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [toast, setToast] = useState<{id: number, message: string, type: 'success' | 'error'} | null>(null);
  const [autoDownload, setAutoDownload] = useState<'none' | 'epub' | 'pdf' | 'md'>('md');
  const [pendingDownload, setPendingDownload] = useState<'epub' | 'pdf' | 'md' | null>(null);
  const [isIframe, setIsIframe] = useState(false);
  
  // Action states
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloadingEpub, setIsDownloadingEpub] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsIframe(window !== window.parent);
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ id: Date.now(), message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
  };
  const [error, setError] = useState<string | null>(null);
  const [isKeySelected, setIsKeySelected] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
  const [manualApiKey, setManualApiKey] = useState('');
  const [isManualKeyActive, setIsManualKeyActive] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [estimatedRemainingTime, setEstimatedRemainingTime] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      try {
        let attempts = 0;
        // @ts-ignore
        while (typeof window !== 'undefined' && !window.aistudio && attempts < 10) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        // @ts-ignore
        if (typeof window !== 'undefined' && window.aistudio && window.aistudio.hasSelectedApiKey) {
          // Add a timeout to prevent hanging in Safari
          const hasKey = await Promise.race([
            // @ts-ignore
            window.aistudio.hasSelectedApiKey(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout checking API key")), 3000))
          ]);
          setIsKeySelected(!!hasKey);
        } else {
          setIsKeySelected(false);
        }
      } catch (e) {
        console.error("Error checking API key:", e);
        setIsKeySelected(false);
      } finally {
        setIsCheckingKey(false);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    // @ts-ignore
    if (typeof window !== 'undefined' && window.aistudio && window.aistudio.openSelectKey) {
      try {
        // Add a timeout to prevent hanging
        await Promise.race([
          // @ts-ignore
          window.aistudio.openSelectKey(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout opening API key dialog")), 5000))
        ]);
        setIsKeySelected(true);
      } catch (e: any) {
        console.error(e);
        showToast(`無法開啟 API Key 設定視窗 (${e.message})。\n\n這可能是因為 Safari 的跨網站追蹤防護 (ITP) 阻擋了驗證模組。請嘗試在 Safari 設定中關閉「防止跨網站追蹤」，或改用 Chrome 瀏覽器。`, 'error');
      }
    } else {
      showToast("無法呼叫 API Key 設定視窗。\n\n請注意：您目前可能直接訪問了 .run.app 網址，或者瀏覽器阻擋了跨網站追蹤。請使用 AI Studio 產生的「Share (分享)」連結來開啟此應用程式。", 'error');
    }
  };

  useEffect(() => {
    if (base64Data && file) {
      calculateTokens(base64Data, selectedModel, file);
    }
  }, [selectedModel, base64Data, file]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    const isPdf = selectedFile.type === 'application/pdf';
    const isMd = selectedFile.name.toLowerCase().endsWith('.md');

    if (!isPdf && !isMd) {
      setError('請上傳 PDF 或 Markdown 檔案 (Please upload a PDF or MD file).');
      return;
    }
    
    setError(null);
    setFile(selectedFile);
    setTranslatedText('');
    setExtractedText('');
    setTokenCount(null);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setBase64Data(base64);
      
      if (isPdf) {
        try {
          const arrayBuffer = await selectedFile.arrayBuffer();
          const pdfDoc = await PDFDocument.load(arrayBuffer);
          setTotalPages(pdfDoc.getPageCount());
        } catch (e) {
          console.error("Failed to parse PDF pages", e);
        }
      } else if (isMd) {
        setTotalPages(0);
        const text = await selectedFile.text();
        setExtractedText(text);
      }
    };
    reader.onerror = () => {
      setError('讀取檔案失敗 (Failed to read file).');
    };
    reader.readAsDataURL(selectedFile);
  };

  const calculateTokens = async (base64: string, modelId: string, currentFile?: File) => {
    setIsCalculating(true);
    setError(null);
    try {
      const apiKey = isManualKeyActive ? manualApiKey : (process.env.API_KEY || process.env.GEMINI_API_KEY);
      if (!apiKey) throw new Error("API Key 尚未設定");
      const ai = new GoogleGenAI({ apiKey });
      
      const fileToUse = currentFile || file;
      if (!fileToUse) throw new Error("File not found");
      
      let totalTokens = 0;
      const isMd = fileToUse.name.toLowerCase().endsWith('.md');

      if (isMd) {
        const text = await fileToUse.text();
        const response = await ai.models.countTokens({
          model: modelId,
          contents: {
            parts: [
              { text: text },
              { text: 'Translate this document into Traditional Chinese.' }
            ]
          }
        });
        totalTokens = response.totalTokens;
      } else {
        const arrayBuffer = await fileToUse.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pageCount = pdfDoc.getPageCount();
        
        if (pageCount <= 1000) {
          const response = await ai.models.countTokens({
            model: modelId,
            contents: {
              parts: [
                { inlineData: { data: base64, mimeType: 'application/pdf' } },
                { text: 'Translate this document into Traditional Chinese.' }
              ]
            }
          });
          totalTokens = response.totalTokens;
        } else {
          const CHUNK_SIZE = 500;
          const chunks = Math.ceil(pageCount / CHUNK_SIZE);
          
          for (let i = 0; i < chunks; i++) {
            const startPage = i * CHUNK_SIZE;
            const endPage = Math.min(startPage + CHUNK_SIZE, pageCount) - 1;
            const pageIndices = Array.from({length: endPage - startPage + 1}, (_, idx) => startPage + idx);
            
            const chunkPdf = await PDFDocument.create();
            const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
            copiedPages.forEach(page => chunkPdf.addPage(page));
            
            const chunkBytes = await chunkPdf.save();
            const chunkBase64 = uint8ArrayToBase64(chunkBytes);
            
            const response = await ai.models.countTokens({
              model: modelId,
              contents: {
                parts: [
                  { inlineData: { data: chunkBase64, mimeType: 'application/pdf' } },
                  { text: 'Translate this document into Traditional Chinese.' }
                ]
              }
            });
            totalTokens += response.totalTokens;
          }
        }
      }
      
      // Multiply by 6 to roughly estimate the multi-stage process:
      // 1. PDF -> Markdown (1x)
      // 2. Markdown -> Glossary (~0.5x)
      // 3. Markdown + Glossary + Context -> Translation (~0.8x)
      // 4. Extra buffer as requested (6x total)
      setTokenCount(Math.round(totalTokens * 6));
    } catch (err: any) {
      console.error(err);
      setError(`計算 Token 失敗 (Failed to calculate tokens): ${err.message}`);
      setTokenCount(null);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleTranslate = async () => {
    if (!file || !base64Data) return;
    setIsTranslating(true);
    setTranslationStage('extracting');
    setTranslatedText('');
    setTranslationStyle(null);
    setStatusMessage('');
    setError(null);
    setCurrentChunk(0);
    setTotalChunks(0);
    const currentStartTime = Date.now();
    setStartTime(currentStartTime);
    setEstimatedRemainingTime(null);
    
    try {
      const apiKey = isManualKeyActive ? manualApiKey : (process.env.API_KEY || process.env.GEMINI_API_KEY);
      if (!apiKey) throw new Error("API Key 尚未設定");
      const ai = new GoogleGenAI({ apiKey });
      
      let fullMarkdown = '';
      const isMd = file.name.toLowerCase().endsWith('.md');
      
      if (isMd || extractedText) {
        fullMarkdown = extractedText;
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const pdfjsDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
        const pageCount = pdfDoc.getPageCount();
        
        // --- STAGE 1: EXTRACTION ---
        setStatusMessage('正在從 PDF 提取文字...');
        const EXTRACTION_CHUNK_SIZE = 5; // Extract 5 pages at a time
        const extractionChunks = Math.ceil(pageCount / EXTRACTION_CHUNK_SIZE);
        setTotalChunks(extractionChunks);
        
        for (let i = 0; i < extractionChunks; i++) {
          setCurrentChunk(i + 1);
          setStatusMessage(`正在提取文字 (第 ${i + 1}/${extractionChunks} 部分)...`);
          
          const chunkPdf = await PDFDocument.create();
          const startPage = i * EXTRACTION_CHUNK_SIZE;
          const endPage = Math.min(startPage + EXTRACTION_CHUNK_SIZE, pageCount) - 1;
          const pageIndices = Array.from({length: endPage - startPage + 1}, (_, idx) => startPage + idx);
          
          const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
          copiedPages.forEach(page => chunkPdf.addPage(page));
          
          const chunkBytes = await chunkPdf.save();
          const chunkBase64 = uint8ArrayToBase64(chunkBytes);
          
          // Extract raw text for validation and primary source
          let chunkRawText = '';
          try {
            for (let p = startPage + 1; p <= endPage + 1; p++) {
              const page = await pdfjsDoc.getPage(p);
              const textContent = await page.getTextContent();
              chunkRawText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
            }
          } catch (e) {
            console.warn("Failed to extract raw text", e);
          }
          const rawTextLength = chunkRawText.replace(/\s+/g, '').length;
          const hasRawText = rawTextLength > 50;
          
          let success = false;
          let retries = 0;
          const MAX_RETRIES = 3;
          
          while (!success && retries < MAX_RETRIES) {
            try {
              const parts: any[] = [];
              let systemInstruction = "";
              
              if (hasRawText) {
                // Use raw text and ask LLM to format it
                systemInstruction = "You are a precise text formatting tool. Your ONLY job is to take the provided raw PDF text and format it into clean Markdown. Fix broken line breaks, identify headings, and preserve ALL original text exactly. Pay special attention to superscript numbers (citations/footnotes) and ensure they are formatted clearly (e.g., [1] or ^1). DO NOT translate, DO NOT summarize, and DO NOT skip any content.";
                parts.push({ text: `你是一個專業的排版助手。以下是從 PDF 底層直接提取出來的純文字。請幫我將這些文字重新排版成乾淨的 Markdown 格式（修復不正常的斷行、還原標題層級等）。

【特別注意】：
1. **識別引用序號**：PDF 中常有上標的小數字作為註解或引用（如 word¹）。請識別這些數字並確保它們格式清晰（例如使用 [1] 或 ^1），不要讓它們與前面的單字黏在一起導致拼字錯誤。
2. **絕對不要翻譯**：保持原始語言。
3. **絕對不要刪減或總結**：必須 100% 保留所有原始文字。

原始文字：
${chunkRawText}` });
              } else {
                // Fallback to Vision OCR for scanned PDFs
                systemInstruction = "You are a precise OCR and text extraction tool. Your ONLY job is to extract the exact text from the provided PDF pages and format it as Markdown. Identify superscript numbers used for citations or footnotes and format them as [n] or ^n. DO NOT translate the text. Extract it in its ORIGINAL LANGUAGE. DO NOT summarize, DO NOT skip any content.";
                parts.push({ inlineData: { data: chunkBase64, mimeType: 'application/pdf' } });
                parts.push({ text: '你是一個精準的 OCR 與文字提取工具。你的「唯一」任務是將這份 PDF 文件中的文字「逐字逐句」完整提取出來，並轉換為乾淨的 Markdown 格式。\n\n請嚴格遵守以下規則：\n1. **識別上標註解**：請特別注意字尾的小數字（上標），這些通常是引用或註解。請將它們格式化為 [n] 或 ^n，確保它們與正文有微小區隔，不要混淆為單字的一部分。\n2. **保持原始語言，絕對不要翻譯**：請完全照抄圖片上的文字。\n3. **絕對不要遺漏任何內容**：包含封面、目錄、章節標題與所有內文。\n4. **直接輸出 Markdown**：不要有任何開頭或結尾的解釋。' });
              }

              const responseStream = await ai.models.generateContentStream({
                model: selectedModel,
                contents: { parts },
                config: {
                  systemInstruction,
                  temperature: 0.1,
                }
              });
              
              let chunkExtractedText = '';
              for await (const chunk of responseStream) {
                const text = chunk.text || '';
                chunkExtractedText += text;
                setExtractedText(fullMarkdown + chunkExtractedText);
              }
              
              // Validation Mechanism (only strict if using Vision OCR, as formatting raw text is safer)
              if (!hasRawText && rawTextLength > 50) {
                const extractedLength = chunkExtractedText.replace(/\s+/g, '').length;
                if (extractedLength > rawTextLength * 3 || extractedLength < rawTextLength * 0.2) {
                  console.warn(`Validation failed for chunk ${i + 1}. Raw length: ${rawTextLength}, Extracted length: ${extractedLength}. Retrying...`);
                  throw new Error(`Extracted text length (${extractedLength}) deviates significantly from original PDF text (${rawTextLength}). Possible hallucination or omission.`);
                }
              }
              
              fullMarkdown += chunkExtractedText + '\n\n';
              setExtractedText(fullMarkdown);
              success = true;
            } catch (err: any) {
              retries++;
              setStatusMessage(`提取文字異常，正在重新嘗試 (第 ${i + 1}/${extractionChunks} 部分) - 重試次數: ${retries}`);
              if (retries >= MAX_RETRIES) throw err;
              await new Promise(resolve => setTimeout(resolve, 2000 * retries));
            }
          }
        }
      }
      
      // --- STAGE 1.2: SOURCE TEXT REPAIR ---
      setTranslationStage('repairing');
      setStatusMessage('正在優化原始文本結構與修復斷句...');
      
      // Split for repair if text is very long to avoid context limits
      const repairChunks = splitTextIntoChunks(fullMarkdown, 8000);
      let repairedMarkdown = '';
      
      for (let i = 0; i < repairChunks.length; i++) {
        setStatusMessage(`正在優化文本結構 (第 ${i + 1}/${repairChunks.length} 部分)...`);
        try {
          const repairResponse = await ai.models.generateContent({
            model: selectedModel,
            contents: {
              parts: [
                { text: `你是一個專業的文本修復助手。以下是從 PDF 提取出的 Markdown 文本，可能存在不正常的斷句、多餘的空格或格式混亂。請在不改變任何原意的前提下，修復這些結構問題，確保句子完整且邏輯連貫。

【嚴格規則】：
1. **絕對不要翻譯**：保持原始語言。
2. **絕對不要刪減或總結**：必須 100% 保留所有原始資訊。
3. **確保內容正確**：不要添加任何原文中沒有的資訊。
4. **直接輸出修復後的 Markdown**：不要有任何解釋。

待修復文本：
${repairChunks[i]}` }
              ]
            },
            config: { temperature: 0.1 }
          });
          repairedMarkdown += (repairResponse.text || repairChunks[i]) + '\n\n';
          setExtractedText(repairedMarkdown);
        } catch (err) {
          console.warn("Repair failed for chunk, using original", err);
          repairedMarkdown += repairChunks[i] + '\n\n';
        }
      }
      fullMarkdown = repairedMarkdown.trim();
      setExtractedText(fullMarkdown);

      // --- STAGE 1.5: GLOSSARY GENERATION & STYLE ANALYSIS ---
      setTranslationStage('analyzing');
      setStatusMessage('正在提取專業術語與分析文本風格...');
      let glossaryText = '無';
      let detectedStyle = '一般/通用';
      
      try {
        const [glossaryResponse, styleResponse] = await Promise.all([
          ai.models.generateContent({
            model: selectedModel,
            contents: {
              parts: [
                { text: `你是一位專業的術語與角色管理專家。請深度閱讀以下文本，並執行以下任務：
1. **核心術語與實體提取**：識別文本中的關鍵技術術語、專有名詞。
2. **文學要素提取 (若為小說)**：特別提取「人物名稱」、「地理位置」、「核心意象」或「特定物品」。
3. **全域一致性定義**：為每個項目選定一個最精準、符合繁體中文習慣的譯名。對於角色，請根據其性別與身份選定合適的譯名。

請以純文字列表格式輸出，格式為：「- [英文名稱]: [繁體中文譯名]」。
如果沒有明顯的項目，請輸出「無」。不要輸出任何開頭、結尾或解釋性文字。

文本內容：
${fullMarkdown.substring(0, 50000)}` }
              ]
            }
          }).catch(err => {
            console.warn("Glossary generation failed, continuing without it.", err);
            return { text: '無' };
          }),
          ai.models.generateContent({
            model: selectedModel,
            contents: {
              parts: [
                { text: `請作為資深文學編輯與編譯專家，為以下文本制定一份「翻譯風格指南」。請分析：
1. **文本領域與類型**：(如：硬核科幻、浪漫小說、技術文件、學術論文)
2. **敘事視角與語氣**：(如：冷峻的第三人稱、感性的第一人稱、正式客觀)
3. **目標受眾與文化背景**：(如：青少年讀者、專業研究員、一般大眾)
4. **特定風格規範**：(如：對話是否應口語化、是否保留特定外來語、對讀者的稱呼)

請將以上分析總結成一段具體的「翻譯指令」。
例如 (若為小說)：「這是一部帶有憂鬱色彩的現代小說。請採用流暢、具有文學美感的繁體中文，避免生硬的翻譯腔。對話應符合角色性格，保留原文的隱喻與情感張力。」
不要輸出任何多餘的解釋。

文本內容：
${fullMarkdown.substring(0, 5000)}` }
              ]
            }
          }).catch(err => {
            console.warn("Style analysis failed, continuing with default style.", err);
            return { text: '一般/通用' };
          })
        ]);
        
        glossaryText = glossaryResponse.text || '無';
        detectedStyle = styleResponse.text?.trim() || '一般/通用';
        setTranslationStyle(detectedStyle);
      } catch (err) {
        console.warn("Analysis failed, continuing with defaults.", err);
        setTranslationStyle('一般/通用');
      }
      
      // --- STAGE 2: TRANSLATION ---
      setTranslationStage('translating');
      setStatusMessage('正在準備翻譯...');
      const textChunks = splitTranslation ? splitTextIntoChunks(fullMarkdown, 3000) : [fullMarkdown];
      const translationChunksCount = textChunks.length;
      setTotalChunks(translationChunksCount);
      setCurrentChunk(0);
      
      let fullTranslatedText = '';
      let previousTranslatedText = '';
      
      for (let i = 0; i < translationChunksCount; i++) {
        setCurrentChunk(i + 1);
        setStatusMessage(`正在翻譯 (第 ${i + 1}/${translationChunksCount} 部分)...`);
        
        let success = false;
        let retries = 0;
        const MAX_RETRIES = 6;
        let currentChunkTranslated = '';

        const promptText = `你是一位世界級的專業翻譯專家，精通技術文件與學術著作的編譯。
請將以下 Markdown 文本翻譯成繁體中文。

【翻譯指南】：
1. **風格目標**：${detectedStyle}
2. **術語一致性**：${glossaryText !== '無' ? `必須嚴格遵守以下術語表：\n${glossaryText}` : '保持專有名詞前後統一。'}
3. **上下文銜接**：${previousTranslatedText ? `參考上一段的譯文風格：\n${previousTranslatedText}` : '這是文件的開頭。'}

【執行步驟】：
第一步：**精準直譯**。確保不遺漏任何標題、段落、列表、註釋或 Markdown 標記。
第二步：**語意潤色**。在不改變原意的前提下，調整句式使其符合繁體中文的閱讀習慣，消除生硬的翻譯感。
第三步：**自我校對**。檢查是否有漏譯、術語不統一或語意模糊的地方。

【嚴格禁令】：
- 嚴禁摘要、嚴禁刪減、嚴禁跳過任何內容。
- 嚴禁輸出任何與譯文無關的解釋、評論或提示詞。

【待翻譯文本】：
${textChunks[i]}`;

        while (!success && retries < MAX_RETRIES) {
          try {
            const responseStream = await ai.models.generateContentStream({
              model: selectedModel,
              contents: {
                parts: [
                  { text: promptText }
                ]
              },
              config: {
                systemInstruction: "You are a highly accurate translator. Your goal is to translate the provided text into Traditional Chinese with 100% fidelity. DO NOT skip any sentences, DO NOT summarize, and DO NOT add any information that is not in the source text. Maintain all Markdown formatting exactly.",
                temperature: 0.2,
              }
            });
            
            for await (const chunk of responseStream) {
              const text = chunk.text || '';
              currentChunkTranslated += text;
              setTranslatedText(fullTranslatedText + currentChunkTranslated);
            }

            // Basic validation for translation: check if output is suspiciously short
            const sourceLength = textChunks[i].replace(/\s+/g, '').length;
            const targetLength = currentChunkTranslated.replace(/\s+/g, '').length;
            
            // For English to Chinese, the character count usually decreases, but shouldn't be less than 20% of source
            if (sourceLength > 100 && targetLength < sourceLength * 0.15) {
              console.warn(`Translation validation failed for chunk ${i + 1}. Source length: ${sourceLength}, Target length: ${targetLength}. Retrying...`);
              throw new Error("Translated text is suspiciously short. Possible omission.");
            }

            success = true;
          } catch (err: any) {
            const errorMessage = err.message?.toLowerCase() || '';
            const status = err.status;
            
            if (status === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
              retries++;
              if (retries >= MAX_RETRIES) throw new Error(`API 頻率限制過嚴，請稍後再試。(${err.message})`);
              const waitTime = retries * 10;
              setStatusMessage(`API 限制，等待 ${waitTime} 秒後重試...`);
              await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              setStatusMessage(`正在翻譯 (第 ${i + 1}/${translationChunksCount} 部分)...`);
              currentChunkTranslated = '';
            } else {
              throw err;
            }
          }
        }
        
        fullTranslatedText += currentChunkTranslated + '\n\n';
        setTranslatedText(fullTranslatedText);
        previousTranslatedText = currentChunkTranslated.slice(-1000); // Keep last 1000 chars for context
        
        // Estimation update
        const now = Date.now();
        const elapsed = now - currentStartTime;
        const completed = i + 1;
        const avg = elapsed / completed;
        const remaining = translationChunksCount - completed;
        setEstimatedRemainingTime(Math.round((avg * remaining) / 1000));
        
        if (i < translationChunksCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (fullTranslatedText && autoDownload !== 'none') {
        setPendingDownload(autoDownload);
      }
      
    } catch (err: any) {
      console.error(err);
      setError(`翻譯失敗 (Translation failed): ${err.message}`);
    } finally {
      setIsTranslating(false);
      setTranslationStage(null);
      setCurrentChunk(0);
      setTotalChunks(0);
      setStatusMessage('');
    }
  };

  useEffect(() => {
    if (pendingDownload && !isTranslating && translatedText) {
      // Wait a bit for the DOM to fully render the markdown
      const timer = setTimeout(() => {
        if (pendingDownload === 'epub') {
          downloadEpub(translatedText);
        } else if (pendingDownload === 'pdf') {
          downloadPdf();
        } else if (pendingDownload === 'md') {
          handleDownloadMarkdown();
        }
        setPendingDownload(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [pendingDownload, isTranslating, translatedText]);

  const downloadPdf = async () => {
    if (isIframe) {
      showToast("在 AI Studio 預覽模式下無法下載檔案，請點擊頂部「在新分頁開啟」以獲得完整功能。", 'error');
      return;
    }
    
    setIsDownloadingPdf(true);
    try {
      const element = document.getElementById('translation-result-content');
      if (!element) throw new Error("找不到內容元素");

      const contentHtml = element.innerHTML;
      const defaultTitle = activeTab === 'translate' 
        ? `${file?.name.replace(/\.(pdf|md)$/i, '') || 'document'}_翻譯`
        : (customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document');

      // 建立列印專用的隱藏 Iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc) throw new Error("無法建立列印環境");

      // 寫入內容與專為 PDF 優化的列印樣式
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${defaultTitle}</title>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap');
              
              body { 
                font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif; 
                padding: 20mm; 
                color: #000000; 
                background: #ffffff;
                line-height: 1.6;
                font-size: 12pt;
              }
              
              /* 確保長文件分頁正常 */
              * { 
                box-sizing: border-box; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
              }
              
              h1 { font-size: 24pt; border-bottom: 2px solid #333; padding-bottom: 10px; margin-top: 0; }
              h2 { font-size: 20pt; margin-top: 25px; border-bottom: 1px solid #eee; page-break-after: avoid; }
              h3 { font-size: 16pt; margin-top: 20px; page-break-after: avoid; }
              
              p, li { margin-bottom: 10px; word-wrap: break-word; }
              
              pre { 
                background: #f4f4f4 !important; 
                padding: 15px; 
                border-radius: 5px; 
                white-space: pre-wrap; 
                word-wrap: break-word;
                font-size: 10pt;
                border: 1px solid #ddd;
              }
              
              code { 
                background: #f4f4f4 !important; 
                padding: 2px 5px; 
                border-radius: 3px; 
                font-family: monospace; 
              }
              
              blockquote { 
                border-left: 5px solid #ddd; 
                padding-left: 20px; 
                color: #444; 
                font-style: italic; 
                margin: 20px 0;
              }
              
              table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 20px 0; 
                page-break-inside: auto;
              }
              
              tr { page-break-inside: avoid; page-break-after: auto; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background: #f9f9f9 !important; }
              
              img { max-width: 100%; height: auto; display: block; margin: 10px auto; }
              
              @page {
                size: A4;
                margin: 15mm;
              }
            </style>
          </head>
          <body>
            <div id="content">${contentHtml}</div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  // 延遲移除 iframe，確保列印對話框已彈出
                  setTimeout(function() {
                    window.frameElement.parentNode.removeChild(window.frameElement);
                  }, 1000);
                }, 500);
              };
            </script>
          </body>
        </html>
      `);
      iframeDoc.close();

      showToast('請在列印對話框中選擇「另存為 PDF」', 'success');
    } catch (err: any) {
      console.error("PDF Error:", err);
      showToast(`生成 PDF 失敗: ${err.message}`, 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const text = activeTab === 'translate' ? translatedText : extractedText;
    if (!text) return;
    
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const defaultTitle = activeTab === 'translate' 
      ? `${file?.name.replace(/\.(pdf|md)$/i, '') || 'document'}_翻譯`
      : (customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document');
    a.download = `${defaultTitle}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已下載 Markdown 檔案', 'success');
  };

  const handleCopyText = async () => {
    const textToCopy = activeTab === 'translate' ? translatedText : extractedText;
    if (!textToCopy) return;
    if (isIframe) {
      showToast("在 AI Studio 預覽模式下無法複製，請點擊頂部「在新分頁開啟」以獲得完整功能。", 'error');
      return;
    }
    
    setIsCopying(true);
    // 讓 React 有時間渲染 loading 狀態
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Fallback for iframe environments
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      showToast("已複製全文到剪貼簿！", 'success');
    } catch (err) {
      console.error("Failed to copy text:", err);
      showToast("複製失敗，請手動選取複製。", 'error');
    } finally {
      setIsCopying(false);
    }
  };

  const handlePdfToEpub = async () => {
    if (!file) return;
    if (isIframe) {
      showToast("在 AI Studio 預覽模式下無法下載檔案，請點擊頂部「在新分頁開啟」以獲得完整功能。", 'error');
      return;
    }
    
    setIsExtracting(true);
    setStatusMessage('正在從 PDF 提取文字...');
    setError(null);
    
    try {
      let fullText = '';
      const isMd = file.name.toLowerCase().endsWith('.md');

      if (isMd) {
        setStatusMessage('正在讀取 Markdown 檔案...');
        fullText = await file.text();
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const numPages = pdf.numPages;
        
        for (let i = 1; i <= numPages; i++) {
          setStatusMessage(`提取文字中 (第 ${i}/${numPages} 頁)...`);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n\n';
          setExtractedText(fullText);
        }
      }
      
      setStatusMessage('正在產生 EPUB...');
      const titleToUse = customTitle.trim() || file.name.replace(/\.(pdf|md)$/i, '');
      
      const response = await fetch('/api/generate-epub', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: titleToUse,
          markdown: fullText,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to generate EPUB: ${response.status} ${errorText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${titleToUse}.epub`;
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 1000);
      
      showToast('EPUB 轉換並下載成功！', 'success');
      setExtractedText(fullText);
      
    } catch (err: any) {
      console.error(err);
      setError(`轉換失敗: ${err.message}`);
      showToast(`轉換失敗: ${err.message}`, 'error');
    } finally {
      setIsExtracting(false);
      setStatusMessage('');
    }
  };

  const downloadEpub = async (textToUse?: string) => {
    if (isIframe) {
      showToast("在 AI Studio 預覽模式下無法下載檔案，請點擊頂部「在新分頁開啟」以獲得完整功能。", 'error');
      return;
    }
    const text = textToUse || (activeTab === 'translate' ? translatedText : extractedText);
    if (!text) return;
    
    setIsDownloadingEpub(true);
    // 讓 React 有時間渲染 loading 狀態
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      const defaultTitle = activeTab === 'translate' 
        ? `${file?.name.replace(/\.(pdf|md)$/i, '') || 'document'}_翻譯`
        : (customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document');

      const response = await fetch('/api/generate-epub', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: defaultTitle,
          markdown: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("EPUB generation failed:", response.status, errorText);
        throw new Error(`Failed to generate EPUB: ${response.status} ${errorText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file?.name.replace('.pdf', '') || 'document'}_翻譯.epub`;
      document.body.appendChild(a);
      a.click();
      
      // Delay cleanup to ensure the browser has time to start the download
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 1000);
      
      showToast('EPUB 下載成功！', 'success');
    } catch (err) {
      console.error("Failed to generate EPUB:", err);
      showToast(`產生 EPUB 失敗，請確定您的網路連線正常。(${err instanceof Error ? err.message : String(err)})`, 'error');
    } finally {
      setIsDownloadingEpub(false);
    }
  };

  const selectedModelData = MODELS.find(m => m.id === selectedModel)!;
  
  // 翻譯成繁體中文時，由於 Tokenizer 的特性，一個中文字通常會佔用 1~3 個 Token
  // 加上輸出 Token 單價通常是輸入的 3~4 倍，因此將預估倍率從 1.05 提高到 2.5 以更貼近實際花費
  const estimatedOutputTokens = tokenCount ? Math.round(tokenCount * 2.5) : 0; 
  const estimatedInputCost = tokenCount ? (tokenCount / 1000000) * selectedModelData.inputPrice : 0;
  const estimatedOutputCost = estimatedOutputTokens ? (estimatedOutputTokens / 1000000) * selectedModelData.outputPrice : 0;
  const totalEstimatedCost = estimatedInputCost + estimatedOutputCost;
  const totalEstimatedCostTWD = totalEstimatedCost * 32.5; // 假設匯率 1 USD = 32.5 TWD

  if (isCheckingKey) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium">正在驗證環境...</p>
        </div>
      </div>
    );
  }

  if (!isKeySelected && !isManualKeyActive) {
    // @ts-ignore
    const isRawUrl = typeof window !== 'undefined' && !(window as any).aistudio;

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans">
        <div className="bg-slate-900 p-8 rounded-2xl shadow-lg shadow-blue-900/10 border border-slate-800 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-900/30 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
            <Key className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-semibold mb-2 text-slate-100">需要綁定 API Key</h2>
          <p className="text-slate-400 mb-6 text-sm leading-relaxed">
            為了保護開發者的額度，使用此翻譯工具需要您自備 Google Gemini API Key。請點擊下方按鈕綁定您的金鑰。
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] border border-blue-400/50 mb-4"
          >
            自動選擇或輸入 API Key
          </button>

          <div className="mt-6 pt-6 border-t border-slate-800 text-left">
            <p className="text-sm text-slate-300 mb-3 font-medium">Safari / iOS 用戶替代方案：</p>
            <p className="text-xs text-slate-500 mb-3">若上方按鈕沒有反應或跳出錯誤，請在此手動貼上您的 API Key：</p>
            <div className="flex flex-col gap-2">
              <input
                type="password"
                placeholder="AIzaSy..."
                value={manualApiKey}
                onChange={(e) => setManualApiKey(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <button
                onClick={() => {
                  if (manualApiKey.trim().length > 20) {
                    setIsManualKeyActive(true);
                  } else {
                    showToast("請輸入有效的 Gemini API Key", 'error');
                  }
                }}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                使用手動輸入的金鑰
              </button>
            </div>
          </div>
          
          {isRawUrl && (
            <div className="mt-6 p-4 bg-amber-950/30 border border-amber-900/50 rounded-xl text-left">
              <p className="text-sm text-amber-500 font-medium flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4" />
                網址來源錯誤
              </p>
              <p className="text-xs text-amber-400/80 leading-relaxed">
                偵測到您直接訪問了 <code>.run.app</code> 網址。此環境無法載入 API Key 驗證模組。請改用原作者提供的 <strong>AI Studio 分享連結</strong> (<code>https://ai.studio/share/...</code>) 開啟本網頁。
              </p>
            </div>
          )}
          
          <p className="text-xs text-slate-500 mt-6">
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline hover:text-slate-300">
              點此前往 Google AI Studio 獲取免費 API Key
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div key={toast.id} className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-start gap-3 max-w-sm animate-in slide-in-from-top-4 fade-in duration-300 print:hidden ${
          toast.type === 'success' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50 backdrop-blur-sm' : 'bg-red-950/80 text-red-400 border border-red-900/50 backdrop-blur-sm'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          )}
          <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{toast.message}</p>
          <button onClick={() => setToast(null)} className="ml-auto text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-10 print:hidden">
        {isIframe && (
          <div className="bg-amber-950/30 border-b border-amber-900/50 px-4 py-2.5 sm:px-6 lg:px-8 flex items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-2 text-amber-500 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
              <p>
                <strong>預覽模式限制：</strong> 受限於 AI Studio 的安全機制，<strong className="font-semibold">複製與下載功能可能會失效</strong>。請在新分頁開啟以獲得完整功能。
              </p>
            </div>
            <a 
              href={window.location.href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/50 hover:bg-amber-800/50 text-amber-400 rounded-lg text-xs font-medium transition-colors border border-amber-700/30"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              在新分頁開啟
            </a>
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/20 border border-blue-500/30 p-2 rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.2)]">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-100">PDF 翻譯神器</h1>
          </div>
          <div className="text-sm text-slate-400 flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/50 px-3 py-1.5 rounded-full shadow-inner">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            已綁定個人 API Key
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:m-0 print:max-w-none">
        <div className="flex gap-6 mb-8 border-b border-slate-800 print:hidden">
          <button 
            onClick={() => setActiveTab('translate')}
            className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'translate' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-700'}`}
          >
            PDF 翻譯
          </button>
          <button 
            onClick={() => setActiveTab('converter')}
            className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'converter' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300 hover:border-slate-700'}`}
          >
            文件轉換器
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 print:block print:gap-0">
          
          <div className="lg:col-span-4 space-y-6 print:hidden">
            
            {activeTab === 'translate' && (
              <div className="bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-slate-200">
                  <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-500/20 flex items-center justify-center text-blue-400 font-semibold text-sm shadow-inner">1</div>
                  選擇模型
                </h2>
                <div className="space-y-3">
                  {MODELS.map(model => (
                    <label 
                      key={model.id}
                      className={`flex items-start p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                        selectedModel === model.id 
                          ? 'border-blue-500 bg-blue-900/20 shadow-[0_0_10px_rgba(37,99,235,0.1)]' 
                          : 'border-slate-800 hover:border-blue-500/50 hover:bg-slate-800/50'
                      }`}
                    >
                      <input 
                        type="radio" 
                        name="model" 
                        value={model.id}
                        checked={selectedModel === model.id}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="mt-1 text-blue-500 focus:ring-blue-500 bg-slate-950 border-slate-700"
                      />
                      <div className="ml-3">
                        <div className="font-medium text-slate-200">{model.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          輸入: ${model.inputPrice}/1M tokens<br/>
                          輸出: ${model.outputPrice}/1M tokens
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-slate-200">
                <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-500/20 flex items-center justify-center text-blue-400 font-semibold text-sm shadow-inner">
                  {activeTab === 'translate' ? '2' : '1'}
                </div>
                上傳 PDF
              </h2>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
                  file ? 'border-blue-500/50 bg-blue-900/10' : 'border-slate-700 hover:border-blue-500 hover:bg-slate-800/50'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="application/pdf,.md" 
                  className="hidden" 
                />
                
                {file ? (
                  <div className="flex flex-col items-center">
                    <FileText className="w-10 h-10 text-blue-400 mb-3 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
                    <p className="font-medium text-slate-200 truncate max-w-full px-4">{file.name}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {(file.size / 1024 / 1024).toFixed(2)} MB {totalPages > 0 && `· 共 ${totalPages} 頁`}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <FileUp className="w-10 h-10 text-slate-500 mb-3" />
                    <p className="font-medium text-slate-300">點擊或拖曳上傳 PDF</p>
                    <p className="text-sm text-slate-500 mt-1">支援最大 3600 頁的文件</p>
                  </div>
                )}
              </div>

              {activeTab === 'translate' && (
                <div className="mt-4 space-y-4">
                  <div className="flex items-start gap-3 p-3 bg-slate-950/50 border border-slate-800 rounded-xl">
                    <div className="flex items-center h-5 mt-0.5">
                      <input
                        id="split-translation"
                        type="checkbox"
                        checked={splitTranslation}
                        onChange={(e) => setSplitTranslation(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </div>
                    <div className="flex-1 text-sm">
                      <label htmlFor="split-translation" className="font-medium text-slate-300 cursor-pointer block mb-1">
                        拆分長文件 (建議)
                      </label>
                      <div className="text-slate-500 space-y-1 text-xs">
                        <p><span className="text-emerald-400/80 font-medium">勾選 (拆分)：</span>適合長文件，可避免翻譯因字數過多而中斷，但段落交界處可能不夠通順。</p>
                        <p><span className="text-amber-400/80 font-medium">不勾選 (不拆分)：</span>適合短文件，上下文連貫性最佳，但過長的文件可能因字數限制而中斷或失敗。</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 font-medium">翻譯完成後自動下載：</span>
                    <select 
                      value={autoDownload}
                      onChange={(e) => setAutoDownload(e.target.value as any)}
                      className="bg-slate-950 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="none">無</option>
                      <option value="md">Markdown</option>
                      <option value="epub">EPUB</option>
                      <option value="pdf">PDF</option>
                    </select>
                  </div>
                </div>
              )}

              {activeTab === 'translate' && file && (
                <div className="mt-6 bg-slate-950/50 rounded-xl p-4 border border-slate-800 shadow-inner">
                  <h3 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-500" />
                    預估資訊
                  </h3>
                  
                  {isCalculating ? (
                    <div className="flex items-center justify-center py-4 text-slate-500 text-sm gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      計算 Token 中...
                    </div>
                  ) : tokenCount !== null ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">輸入 Token 數:</span>
                        <span className="font-medium text-slate-300">{tokenCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">預估輸出 Token 數:</span>
                        <span className="font-medium text-slate-300">~{estimatedOutputTokens.toLocaleString()}</span>
                      </div>
                      <div className="pt-2 mt-2 border-t border-slate-800 space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">預估輸入成本:</span>
                          <span className="text-slate-300">${estimatedInputCost.toFixed(4)} USD</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">預估輸出成本:</span>
                          <span className="text-slate-300">~${estimatedOutputCost.toFixed(4)} USD</span>
                        </div>
                      </div>
                      <div className="pt-1 text-[10px] text-slate-500 italic">
                        * 費用以每 100 萬個 Token 為單位計算。PDF 的 Token 數包含文字與格式分析。
                      </div>
                      <div className="pt-3 mt-3 border-t border-slate-800 flex flex-col gap-1">
                        <div className="flex justify-between font-medium text-blue-400">
                          <span>總預估成本 (USD):</span>
                          <span>~${totalEstimatedCost.toFixed(4)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-emerald-400">
                          <span>總預估成本 (TWD):</span>
                          <span>~NT$ {totalEstimatedCostTWD.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {activeTab === 'converter' && (
              <div className="bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-slate-200">
                  <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-500/20 flex items-center justify-center text-blue-400 font-semibold text-sm shadow-inner">2</div>
                  設定 EPUB
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">自訂書名 (選填)</label>
                    <input 
                      type="text" 
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder={file ? file.name.replace('.pdf', '') : '未命名文件'}
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2 text-slate-200">
                <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-500/20 flex items-center justify-center text-blue-400 font-semibold text-sm shadow-inner">3</div>
                {activeTab === 'translate' ? '開始翻譯' : '開始轉換'}
              </h2>
              
              {activeTab === 'translate' ? (
                <button
                  onClick={handleTranslate}
                  disabled={!file || isCalculating || isTranslating || isExtracting}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] border border-blue-400/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {isTranslating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                      <span className="text-white">{statusMessage ? statusMessage : (totalChunks > 0 ? `翻譯中 (第 ${currentChunk}/${totalChunks} 部分)...` : '準備中...')}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      確認翻譯
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={handlePdfToEpub}
                  disabled={!file || isExtracting || isTranslating}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] border border-blue-400/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                      <span className="text-white">{statusMessage || '轉換中...'}</span>
                    </>
                  ) : (
                    <>
                      <Book className="w-5 h-5" />
                      轉換並下載 EPUB
                    </>
                  )}
                </button>
              )}

              {activeTab === 'translate' && isTranslating && totalChunks > 0 && (
                <div className="mt-6 space-y-3">
                  <div className="flex justify-between text-sm font-semibold text-slate-400">
                    <span>
                      {translationStage === 'extracting' ? `提取文字進度: ${Math.round((currentChunk / totalChunks) * 100)}%` : 
                       translationStage === 'repairing' ? '正在優化原始文本結構...' :
                       translationStage === 'analyzing' ? '正在分析文本風格...' : 
                       `翻譯進度: ${Math.round((currentChunk / totalChunks) * 100)}%`}
                    </span>
                    {estimatedRemainingTime !== null && translationStage === 'translating' && (
                      <span className="text-blue-400">
                        預計剩餘: {Math.floor(estimatedRemainingTime / 60)} 分 {estimatedRemainingTime % 60} 秒
                      </span>
                    )}
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden shadow-inner border border-slate-800">
                    <div 
                      className="bg-blue-500 h-full transition-all duration-500 ease-out relative shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                      style={{ width: `${(currentChunk / totalChunks) * 100}%` }}
                    >
                      <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                    </div>
                  </div>
                  
                  {translationStyle && (
                    <div className="mt-4 p-3 bg-indigo-950/30 border border-indigo-900/50 text-indigo-300 rounded-lg text-sm flex items-start gap-2">
                      <FileText className="w-5 h-5 shrink-0 mt-0.5 text-indigo-400" />
                      <div>
                        <span className="font-semibold text-indigo-200">AI 偵測翻譯風格：</span>
                        {translationStyle}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {error && (
                <div className="mt-4 p-3 bg-red-950/30 border border-red-900/50 text-red-400 rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}
            </div>

          </div>

          <div className="lg:col-span-8 print:block print:w-full">
            <div className="bg-slate-900 rounded-2xl shadow-lg shadow-black/20 border border-slate-800 h-full min-h-[600px] flex flex-col overflow-hidden print:border-none print:shadow-none print:h-auto print:min-h-0 print:rounded-none print:block">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 print:hidden">
                <h2 className="text-lg font-medium flex items-center gap-2 text-slate-200">
                  {activeTab === 'translate' ? '翻譯結果' : '提取文字預覽'}
                </h2>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyText}
                    disabled={!(activeTab === 'translate' ? translatedText : extractedText) || isCopying}
                    className="py-2 px-4 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isCopying ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Copy className="w-4 h-4" />}
                    複製全文
                  </button>
                  <button
                    onClick={() => downloadEpub()}
                    disabled={!(activeTab === 'translate' ? translatedText : extractedText) || isTranslating || isDownloadingEpub || isExtracting}
                    className="py-2 px-4 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isDownloadingEpub ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Book className="w-4 h-4" />}
                    下載 EPUB
                  </button>
                  <button
                    onClick={handleDownloadMarkdown}
                    disabled={!(activeTab === 'translate' ? translatedText : extractedText) || isTranslating}
                    className="py-2 px-4 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    <FileText className="w-4 h-4" />
                    下載 MD
                  </button>
                  <button
                    onClick={downloadPdf}
                    disabled={!(activeTab === 'translate' ? translatedText : extractedText) || isTranslating || isDownloadingPdf}
                    className="py-2 px-4 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-600 text-slate-300 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  >
                    {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Download className="w-4 h-4" />}
                    下載 PDF
                  </button>
                </div>
              </div>
              
              <div className="flex-1 p-6 overflow-auto bg-slate-900 print:overflow-visible print:p-0">
                {(activeTab === 'translate' ? !translatedText : !extractedText) && !isTranslating && !isExtracting ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                    {activeTab === 'translate' ? (
                      <>
                        <FileText className="w-16 h-16 opacity-20" />
                        <p>翻譯結果將顯示於此</p>
                      </>
                    ) : (
                      <>
                        <Book className="w-16 h-16 opacity-20" />
                        <p>上傳檔案並點擊「轉換並下載 EPUB」按鈕</p>
                        <p className="text-sm text-slate-500">轉換完成後將自動下載 EPUB 檔案，並在此預覽提取的文字</p>
                      </>
                    )}
                  </div>
                ) : isExtracting && !extractedText ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4">
                    <Loader2 className="w-16 h-16 animate-spin text-blue-500 opacity-80" />
                    <p className="text-slate-400">{statusMessage || '正在處理您的文件...'}</p>
                  </div>
                ) : (
                  <div id="translation-result-content" className="prose prose-invert max-w-none prose-headings:font-semibold prose-a:text-blue-400">
                    <ReactMarkdown>{activeTab === 'translate' ? (translationStage === 'extracting' || translationStage === 'repairing' || translationStage === 'analyzing' ? extractedText : translatedText) : extractedText}</ReactMarkdown>
                    {(isTranslating || isExtracting) && (
                      <div className="mt-4 flex items-center text-slate-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin mr-2 text-blue-500" />
                        {statusMessage || '處理中...'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
