import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { Upload, FileText, DollarSign, Play, Download, Loader2, AlertCircle, CheckCircle2, FileUp, Key, Copy, Book, X, ExternalLink, History, Trash2, Image as ImageIcon, Clock, Info } from 'lucide-react';
import { saveHistory, getAllHistory, deleteHistory, HistoryRecord } from './lib/db';
import { splitTextIntoChunks } from './lib/text';
import { assertPdfPageLimit, MAX_PDF_PAGES, validateUpload } from './lib/file-limits';
import { buildDocumentAnalysisPrompt, parseDocumentAnalysis } from './lib/document-analysis';
import { calculateTokenCost, DEFAULT_MODEL_ID, estimatePipelineCost, getModelConfig, MODELS } from './lib/models';

const MarkdownPreview = lazy(() => import('./components/MarkdownPreview'));
const markdownFallback = <div className="text-sm text-slate-500">正在載入預覽...</div>;
const LOCAL_STORAGE_KEY_NAME = '__pdf_translator_api_key_v1__';
const LOCAL_STORAGE_OPENAI_KEY_NAME = '__pdf_translator_openai_api_key_v1__';
const SESSION_STORAGE_KEY_NAME = '__pdf_translator_api_key_session_v1__';
const SESSION_STORAGE_OPENAI_KEY_NAME = '__pdf_translator_openai_api_key_session_v1__';

// Encoding only prevents accidental plain-text display in storage tools. It is
// not encryption; session storage is therefore the safe default.
const encodeStoredKey = (key: string) => {
  return window.btoa(key.split('').reverse().join(''));
};

const decodeStoredKey = (key: string) => {
  try {
    return window.atob(key).split('').reverse().join('');
  } catch (e) {
    return '';
  }
};

const readStoredKey = (sessionName: string, localName: string) => {
  const saved = sessionStorage.getItem(sessionName) ?? localStorage.getItem(localName);
  return saved ? decodeStoredKey(saved) : '';
};

const persistStoredKey = (
  key: string,
  sessionName: string,
  localName: string,
  rememberOnDevice: boolean,
) => {
  sessionStorage.removeItem(sessionName);
  localStorage.removeItem(localName);
  if (!key) return;
  const target = rememberOnDevice ? localStorage : sessionStorage;
  target.setItem(rememberOnDevice ? localName : sessionName, encodeStoredKey(key));
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'translate' | 'converter'>('translate');
  const [customTitle, setCustomTitle] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [splitTranslation, setSplitTranslation] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [actualInputTokens, setActualInputTokens] = useState(0);
  const [actualOutputTokens, setActualOutputTokens] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationStage, setTranslationStage] = useState<'extracting' | 'analyzing' | 'translating' | null>(null);
  const [glossary, setGlossary] = useState<string>('');
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [translatedText, setTranslatedText] = useState('');
  const [translationStyle, setTranslationStyle] = useState<string | null>(null);
  const [characterMap, setCharacterMap] = useState<string>('');
  const [plotSummary, setPlotSummary] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState('');
  const [toast, setToast] = useState<{id: number, message: string, type: 'success' | 'error'} | null>(null);
  const [autoDownload, setAutoDownload] = useState<'none' | 'epub' | 'pdf' | 'md'>('md');
  const [pendingDownload, setPendingDownload] = useState<'epub' | 'pdf' | 'md' | null>(null);
  const [isIframe, setIsIframe] = useState(false);
  
  // New features state
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyToDelete, setHistoryToDelete] = useState<string | null>(null);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState('');
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  
  // Action states
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloadingEpub, setIsDownloadingEpub] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsIframe(window !== window.parent);
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const records = await getAllHistory();
      setHistory(records.sort((a, b) => b.timestamp - a.timestamp));
    } catch (e) {
      console.error("Failed to load history", e);
    }
  };

  const handleLoadHistory = (record: HistoryRecord) => {
    setCurrentFileId(record.id);
    setCustomTitle(record.title);
    setAuthorName(record.author || '');
    setCoverImage(record.coverImage);
    setExtractedText(record.extractedText);
    setTranslatedText(record.translatedText);
    setCurrentChunk(record.currentChunk);
    setTotalChunks(record.totalChunks);
    const restoredModel = MODELS.some(model => model.id === record.model)
      ? record.model
      : DEFAULT_MODEL_ID;
    setSelectedModel(restoredModel);
    setTranslationStyle(record.translationStyle || null);
    setGlossary(record.glossaryText || '無');
    setCharacterMap(record.characterMap || '');
    setPlotSummary(record.plotSummary || '');
    
    setFile(null);
    setBase64Data(null);
    setTokenCount(null);
    
    setShowHistory(false);
    
    if (record.status === 'translating' || record.status === 'error') {
      showToast('已載入歷史紀錄，您可以繼續翻譯', 'success');
    } else {
      showToast('已載入歷史紀錄', 'success');
    }
  };

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistoryToDelete(id);
  };

  const confirmDeleteHistory = async () => {
    if (!historyToDelete) return;
    await deleteHistory(historyToDelete);
    loadHistory();
    if (currentFileId === historyToDelete) {
      setCurrentFileId(null);
      setExtractedText('');
      setTranslatedText('');
      setCurrentChunk(0);
      setTotalChunks(0);
      setCustomTitle('');
    }
    setHistoryToDelete(null);
    showToast('歷史紀錄已刪除', 'success');
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ id: Date.now(), message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
  };
  const [error, setError] = useState<string | null>(null);
  const [manualApiKey, setManualApiKey] = useState(() =>
    readStoredKey(SESSION_STORAGE_KEY_NAME, LOCAL_STORAGE_KEY_NAME));
  const [isManualKeyActive, setIsManualKeyActive] = useState(() =>
    readStoredKey(SESSION_STORAGE_KEY_NAME, LOCAL_STORAGE_KEY_NAME).length > 20);
  const [manualOpenaiApiKey, setManualOpenaiApiKey] = useState(() =>
    readStoredKey(SESSION_STORAGE_OPENAI_KEY_NAME, LOCAL_STORAGE_OPENAI_KEY_NAME));
  const [isOpenaiKeyActive, setIsOpenaiKeyActive] = useState(() =>
    readStoredKey(SESSION_STORAGE_OPENAI_KEY_NAME, LOCAL_STORAGE_OPENAI_KEY_NAME).length > 10);
  const [rememberApiKeys, setRememberApiKeys] = useState(() =>
    Boolean(localStorage.getItem(LOCAL_STORAGE_KEY_NAME) || localStorage.getItem(LOCAL_STORAGE_OPENAI_KEY_NAME)));
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [estimatedRemainingTime, setEstimatedRemainingTime] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfWorkerRef = useRef<Worker | null>(null);
  const tokenWorkerTaskRef = useRef<string | null>(null);
  const extractionWorkerTaskRef = useRef<string | null>(null);
  const translationCancelledRef = useRef(false);

  useEffect(() => {
    // Initialize PDF worker
    try {
      pdfWorkerRef.current = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      console.error("Failed to initialize PDF worker:", err);
    }
    
    return () => {
      if (tokenWorkerTaskRef.current) {
        pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId: tokenWorkerTaskRef.current } });
      }
      if (extractionWorkerTaskRef.current) {
        pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId: extractionWorkerTaskRef.current } });
      }
      pdfWorkerRef.current?.terminate();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Removed handleSelectKey as it's AI Studio specific

  useEffect(() => {
    if (base64Data && file) {
      void calculateTokens(base64Data, selectedModel, file);
    }
    return () => {
      const requestId = tokenWorkerTaskRef.current;
      if (requestId) {
        pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId } });
        tokenWorkerTaskRef.current = null;
      }
    };
  }, [selectedModel, base64Data, file]);

  const generateContentWrapper = async (options: {
    model: string,
    systemInstruction?: string,
    promptText?: string,
    base64Pdf?: string,
    temperature?: number,
    jsonMode?: boolean
  }) => {
    const selectedModelData = getModelConfig(options.model);
    if (selectedModelData.provider === 'google') {
      const apiKey = manualApiKey;
      if (!apiKey || !isManualKeyActive) throw new Error("Google Gemini API Key 尚未設定");
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const requestOptions: any = {
          model: options.model,
          contents: { parts: [] },
          config: { temperature: options.temperature !== undefined ? options.temperature : 0.1 }
      };
      if (options.systemInstruction) requestOptions.config.systemInstruction = options.systemInstruction;
      if (options.jsonMode) requestOptions.config.responseMimeType = "application/json";
      
      if (options.base64Pdf) {
          requestOptions.contents.parts.push({ inlineData: { data: options.base64Pdf, mimeType: 'application/pdf' } });
      }
      if (options.promptText) {
          requestOptions.contents.parts.push({ text: options.promptText });
      }
      
      const response = await ai.models.generateContent(requestOptions);
      return {
          text: response.text || '',
          usageMetadata: response.usageMetadata
      };
    } else {
      const apiKey = manualOpenaiApiKey;
      if (!apiKey || !isOpenaiKeyActive) throw new Error("OpenAI API Key 尚未設定");
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const messages: any[] = [];
      if (options.systemInstruction) messages.push({ role: "system", content: options.systemInstruction });
      if (options.base64Pdf) {
          throw new Error("OpenAI 模型不支援直接讀取 PDF 掃描檔。請確認檔案是可以選取文字的 PDF 或 Markdown，或是先改用 Gemini 模型進行。");
      }
      if (options.promptText) messages.push({ role: "user", content: options.promptText });
      
      const response = await openai.chat.completions.create({
          model: options.model,
          messages,
          temperature: options.temperature !== undefined ? options.temperature : 0.1,
          response_format: options.jsonMode ? { type: "json_object" } : undefined
      });
      return {
          text: response.choices[0].message.content || '',
          usageMetadata: {
              promptTokenCount: response.usage?.prompt_tokens || 0,
              candidatesTokenCount: response.usage?.completion_tokens || 0
          }
      };
    }
  };

  const generateContentStreamWrapper = async function*(options: {
    model: string,
    systemInstruction?: string,
    promptText: string,
    temperature?: number
  }) {
    const selectedModelData = getModelConfig(options.model);
    if (selectedModelData.provider === 'google') {
      const apiKey = manualApiKey;
      if (!apiKey || !isManualKeyActive) throw new Error("Google Gemini API Key 尚未設定");
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const responseStream = await ai.models.generateContentStream({
          model: options.model,
          contents: { parts: [{ text: options.promptText }] },
          config: { 
            systemInstruction: options.systemInstruction, 
            temperature: options.temperature !== undefined ? options.temperature : 0.2 
          }
      });
      for await (const chunk of responseStream) {
          yield { 
            text: chunk.text || '', 
            usageMetadata: chunk.usageMetadata 
          };
      }
    } else {
      const apiKey = manualOpenaiApiKey;
      if (!apiKey || !isOpenaiKeyActive) throw new Error("OpenAI API Key 尚未設定");
      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      const stream = await openai.chat.completions.create({
          model: options.model,
          messages: [
              ...(options.systemInstruction ? [{ role: "system" as const, content: options.systemInstruction }] : []),
              { role: "user" as const, content: options.promptText }
          ],
          temperature: options.temperature !== undefined ? options.temperature : 0.2,
          stream: true,
          stream_options: { include_usage: true }
      });
      for await (const chunk of stream) {
          yield { 
              text: chunk.choices?.[0]?.delta?.content || '', 
              usageMetadata: chunk.usage ? { promptTokenCount: chunk.usage.prompt_tokens, candidatesTokenCount: chunk.usage.completion_tokens } : undefined
          };
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    let isPdf = false;
    let isMd = false;
    try {
      const upload = validateUpload(selectedFile);
      isPdf = upload.kind === 'pdf';
      isMd = upload.kind === 'markdown';
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '檔案格式或大小不符合限制。');
      e.target.value = '';
      return;
    }

    if (tokenWorkerTaskRef.current) {
      pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId: tokenWorkerTaskRef.current } });
      tokenWorkerTaskRef.current = null;
    }
    if (extractionWorkerTaskRef.current) {
      pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId: extractionWorkerTaskRef.current } });
      extractionWorkerTaskRef.current = null;
    }
    
    setError(null);
    setFile(selectedFile);
    setTranslatedText('');
    setExtractedText('');
    setTokenCount(null);
    setCurrentFileId(null);
    setCoverImage(null);
    setAuthorName('');
    setCurrentChunk(0);
    setTotalChunks(0);
    setTranslationStyle(null);
    setGlossary('無');
    setCharacterMap('');
    setPlotSummary('');
    setCustomTitle('');
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setBase64Data(base64);
      
      if (isMd) {
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
    const requestId = crypto.randomUUID();
    if (tokenWorkerTaskRef.current) {
      pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId: tokenWorkerTaskRef.current } });
    }
    tokenWorkerTaskRef.current = requestId;
    setIsCalculating(true);
    setError(null);
    const isCurrentRequest = () => tokenWorkerTaskRef.current === requestId;
    try {
      const selectedModelData = getModelConfig(modelId);
      const fileToUse = currentFile || file;
      if (!fileToUse) throw new Error("File not found");
      const isMd = fileToUse.name.toLowerCase().endsWith('.md');

      const estimateLocally = async () => {
        const estimatedTokens = isMd
          ? Math.ceil((await fileToUse.text()).length * 0.5)
          : Math.ceil(fileToUse.size / 4);
        if (isCurrentRequest()) setTokenCount(estimatedTokens);
      };

      if (selectedModelData.provider === 'openai') {
        await estimateLocally();
        return;
      }

      const apiKey = manualApiKey;
      if (!apiKey || !isManualKeyActive) {
        await estimateLocally();
        return;
      }
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      
      let totalTokens = 0;

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
        totalTokens = response.totalTokens ?? 0;
        if (isCurrentRequest()) setTokenCount(Math.round(totalTokens));
      } else {
        const arrayBuffer = await fileToUse.arrayBuffer();
        
        if (!pdfWorkerRef.current) {
          throw new Error("PDF Worker not initialized");
        }

        return new Promise<void>((resolve, reject) => {
          const handleMessage = async (e: MessageEvent) => {
            const { type, payload } = e.data;
            if (payload?.requestId !== requestId) return;
            
            if (type === 'TOTAL_PAGES') {
              if (isCurrentRequest()) setTotalPages(payload.pageCount);
            } else if (type === 'TOKEN_CHUNK') {
              try {
                const response = await ai.models.countTokens({
                  model: modelId,
                  contents: {
                    parts: [
                      { inlineData: { data: payload.base64, mimeType: 'application/pdf' } },
                      { text: 'Translate this document into Traditional Chinese.' }
                    ]
                  }
                });
                totalTokens += response.totalTokens ?? 0;
                pdfWorkerRef.current?.postMessage({
                  type: 'TOKEN_CHUNK_ACK',
                  payload: { requestId, index: payload.index },
                });
                if (payload.isLast) {
                  if (isCurrentRequest()) setTokenCount(Math.round(totalTokens));
                  pdfWorkerRef.current?.removeEventListener('message', handleMessage);
                  resolve();
                }
              } catch (err) {
                pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId } });
                pdfWorkerRef.current?.removeEventListener('message', handleMessage);
                reject(err);
              }
            } else if (type === 'ERROR') {
              pdfWorkerRef.current?.removeEventListener('message', handleMessage);
              reject(new Error(payload.message));
            } else if (type === 'TASK_CANCELLED') {
              pdfWorkerRef.current?.removeEventListener('message', handleMessage);
              resolve();
            }
          };

          pdfWorkerRef.current?.addEventListener('message', handleMessage);
          pdfWorkerRef.current?.postMessage({
            type: 'CALCULATE_TOKENS', 
            payload: { requestId, fileBuffer: arrayBuffer }
          }, [arrayBuffer]);
        });
      }
    } catch (err: any) {
      if (isCurrentRequest()) {
        console.error(err);
        setError(`計算 Token 失敗 (Failed to calculate tokens): ${err.message}`);
        setTokenCount(null);
      }
    } finally {
      if (isCurrentRequest()) {
        tokenWorkerTaskRef.current = null;
        setIsCalculating(false);
      }
    }
  };

  const handleTranslate = async () => {
    if (!extractedText && (!file || !base64Data)) return;

    const activeModel = getModelConfig(selectedModel);

    const hasProviderKey = activeModel.provider === 'google'
      ? Boolean(manualApiKey && isManualKeyActive)
      : Boolean(manualOpenaiApiKey && isOpenaiKeyActive);
    if (!hasProviderKey) {
      setError(activeModel.provider === 'google' ? 'Google Gemini API Key 尚未設定' : 'OpenAI API Key 尚未設定');
      setShowKeyModal(true);
      return;
    }
    
    let startingChunk = currentChunk;
    if (currentChunk === totalChunks && totalChunks > 0) {
      startingChunk = 0;
      setCurrentChunk(0);
      setTranslatedText('');
      setTranslationStyle(null);
      setGlossary('無');
      setCharacterMap('');
      setPlotSummary('');
    }
    
    translationCancelledRef.current = false;
    setIsTranslating(true);
    setTranslationStage(extractedText && startingChunk > 0 ? 'translating' : 'extracting');
    if (startingChunk === 0) {
      setTranslatedText('');
      setTranslationStyle(null);
      setCharacterMap('');
      setPlotSummary('');
    }
    setStatusMessage('');
    setError(null);
    const currentStartTime = Date.now();
    setStartTime(currentStartTime);
    setEstimatedRemainingTime(null);
    setActualInputTokens(0);
    setActualOutputTokens(0);
    
    const fileId = currentFileId || crypto.randomUUID();
    let latestExtractedText = extractedText;
    let latestTranslatedText = translatedText;
    let latestChunk = startingChunk;
    let latestTotalChunks = totalChunks;
    let latestTranslationStyle = startingChunk === 0 ? null : translationStyle;
    let latestGlossary = startingChunk === 0 ? '無' : glossary;
    let latestCharacterMap = startingChunk === 0 ? '' : characterMap;
    let latestPlotSummary = startingChunk === 0 ? '' : plotSummary;

    try {
      setCurrentFileId(fileId);
      
      const saveCurrentState = async (
        status: 'translating' | 'completed' | 'error',
        current: number,
        total: number,
        extracted: string,
        translated: string,
        currentStyle: string | null,
        currentGlossary: string,
        currentCharacters: string,
        currentPlotSummary: string,
      ) => {
        const record: HistoryRecord = {
          id: fileId,
          title: customTitle || file?.name || 'Untitled',
          author: authorName,
          coverImage: coverImage,
          extractedText: extracted,
          translatedText: translated,
          currentChunk: current,
          totalChunks: total,
          status,
          timestamp: Date.now(),
          model: selectedModel,
          translationStyle: currentStyle || undefined,
          glossaryText: currentGlossary || undefined,
          characterMap: currentCharacters || undefined,
          plotSummary: currentPlotSummary || undefined,
        };
        try {
          await saveHistory(record);
          void loadHistory();
        } catch (historyError) {
          console.warn('Unable to persist translation progress', historyError);
        }
      };

      let fullMarkdown = '';
      const isMd = file?.name?.toLowerCase().endsWith('.md');
      
      if (isMd || extractedText) {
        fullMarkdown = extractedText;
      } else if (currentChunk === 0 && file) {
        const arrayBuffer = await file.arrayBuffer();
        
        if (!pdfWorkerRef.current) {
          throw new Error("PDF Worker not initialized");
        }

        // --- STAGE 1: EXTRACTION (Worker-assisted) ---
        setStatusMessage('正在從 PDF 提取文字...');
        
        const results: string[] = [];
        let completedExtractions = 0;
        let totalExtractionChunks = 0;
        const extractionRequestId = crypto.randomUUID();
        if (extractionWorkerTaskRef.current) {
          pdfWorkerRef.current?.postMessage({
            type: 'CANCEL_TASK',
            payload: { requestId: extractionWorkerTaskRef.current },
          });
        }
        extractionWorkerTaskRef.current = extractionRequestId;

        try {
          await new Promise<void>((resolve, reject) => {
          const handleMessage = async (e: MessageEvent) => {
            const { type, payload } = e.data;
            if (payload?.requestId !== extractionRequestId) return;
            
            if (type === 'TOTAL_CHUNKS') {
              totalExtractionChunks = payload.totalChunks;
              setTotalChunks(payload.totalChunks);
              results.length = payload.totalChunks;
            } else if (type === 'EXTRACTION_CHUNK') {
              const { index, base64, rawText, isLast } = payload;
              
              // Process the chunk using Gemini API on the main thread
              try {
                if (translationCancelledRef.current) throw new Error('PDF 處理已取消');
                const rawTextLength = rawText.replace(/\s+/g, '').length;
                const hasRawText = rawTextLength > 10;
                
                let success = false;
                let retries = 0;
                const MAX_RETRIES = 3;

                while (!success && retries < MAX_RETRIES) {
                  try {
                    let promptText = "";
                    let systemInstruction = "";
                    if (hasRawText) {
                      systemInstruction = "You are a precise text formatting and repair tool. Your ONLY job is to take the provided raw PDF text and format it into clean Markdown. Fix broken line breaks, identify headings, merge split sentences, and preserve ALL original text exactly. Pay special attention to superscript numbers (citations/footnotes) and ensure they are formatted clearly (e.g., [1] or ^1). DO NOT translate, DO NOT summarize, and DO NOT skip any content.";
                      promptText = `你是一個專業的排版與文本修復助手。以下是從 PDF 底層直接提取出來的純文字，可能存在不正常的斷句或格式混亂。請幫我將這些文字重新排版成乾淨、連貫的 Markdown 格式（修復斷行、還原標題層級、合併被錯誤切斷的句子等）。\n\n【特別注意】：\n1. **修復斷句**：確保句子完整且邏輯連貫，修復因 PDF 換行導致的單字或句子中斷。\n2. **保留對話換行**：如果遇到人物對話（通常在引號內），請務必保留其獨立的換行，絕對不要將不同角色的對話合併成同一段落。\n3. **識別引用序號**：PDF 中常有上標的小數字作為註解或引用（如 word¹）。請識別這些數字並確保它們格式清晰（例如使用 [1] 或 ^1），不要讓它們與前面的單字黏在一起。\n4. **絕對不要翻譯**：保持原始語言。\n5. **絕對不要刪減或總結**：必須 100% 保留所有原始文字。\n\n原始文字：\n${rawText}`;
                    } else {
                      systemInstruction = "You are a precise OCR, text extraction, and repair tool. Your ONLY job is to extract the exact text from the provided PDF pages and format it as clean Markdown. Fix broken line breaks, identify headings, merge split sentences, and preserve ALL original text exactly. Identify superscript numbers used for citations or footnotes and format them as [n] or ^n. DO NOT translate the text. Extract it in its ORIGINAL LANGUAGE. DO NOT summarize, DO NOT skip any content.";
                      promptText = '你是一個精準的 OCR、文字提取與修復工具。你的「唯一」任務是將這份 PDF 文件中的文字「逐字句」完整提取出來，並轉換為乾淨、連貫的 Markdown 格式。\n\n請嚴格遵守以下規則：\n1. **修復斷句**：確保句子完整，修復因排版導致的斷行問題。\n2. **保留對話換行**：如果遇到人物對話（通常在引號內），請務必保留其獨立的換行，絕對不要將不同角色的對話合併成同一段落。\n3. **識別上標註解**：請特別注意字尾的小數字（上標）。請將它們格式化為 [n] 或 ^n，確保它們與正文有微小區隔。\n4. **保持原始語言，絕對不要翻譯**：請完全照抄圖片上的文字。\n5. **絕對不要遺漏任何內容**：包含封面、目錄、章節標題與所有內文。\n6. **直接輸出 Markdown**：不要有任何開頭或結尾的解釋。';
                    }

                    const response = await generateContentWrapper({
                      model: selectedModel,
                      systemInstruction,
                      promptText,
                      base64Pdf: hasRawText ? undefined : base64,
                      temperature: 0.1
                    });
                    if (translationCancelledRef.current) throw new Error('PDF 處理已取消');
                    
                    if (response.usageMetadata) {
                      setActualInputTokens(prev => prev + (response.usageMetadata?.promptTokenCount || 0));
                      setActualOutputTokens(prev => prev + (response.usageMetadata?.candidatesTokenCount || 0));
                    }
                    
                    results[index] = response.text || '';
                    success = true;
                  } catch (err) {
                    console.error(`Chunk ${index} failed (attempt ${retries + 1}):`, err);
                    retries++;
                    if (retries >= MAX_RETRIES) {
                      if (index === totalExtractionChunks - 1 && !hasRawText) {
                        results[index] = "";
                        success = true;
                      } else {
                        throw err;
                      }
                    }
                    await new Promise(r => setTimeout(r, 1000 * retries));
                  }
                }

                completedExtractions++;
                setCurrentChunk(completedExtractions);
                setStatusMessage(`正在提取文字 (已完成 ${completedExtractions}/${totalExtractionChunks} 部分)...`);
                latestChunk = completedExtractions;
                latestTotalChunks = totalExtractionChunks;
                latestExtractedText = results.filter(r => r !== undefined).join('\n\n');
                setExtractedText(latestExtractedText);

                pdfWorkerRef.current?.postMessage({
                  type: 'EXTRACTION_CHUNK_ACK',
                  payload: { requestId: extractionRequestId, index },
                });

                if (totalExtractionChunks > 0 && completedExtractions === totalExtractionChunks) {
                  pdfWorkerRef.current?.removeEventListener('message', handleMessage);
                  resolve();
                }
              } catch (err) {
                pdfWorkerRef.current?.postMessage({
                  type: 'CANCEL_TASK',
                  payload: { requestId: extractionRequestId },
                });
                pdfWorkerRef.current?.removeEventListener('message', handleMessage);
                reject(err);
              }
            } else if (type === 'ERROR') {
              pdfWorkerRef.current?.removeEventListener('message', handleMessage);
              reject(new Error(payload.message));
            } else if (type === 'TASK_CANCELLED') {
              pdfWorkerRef.current?.removeEventListener('message', handleMessage);
              reject(new Error('PDF 處理已取消'));
            }
          };

          pdfWorkerRef.current?.addEventListener('message', handleMessage);
          pdfWorkerRef.current?.postMessage({
            type: 'GET_EXTRACTION_CHUNKS', 
            payload: { requestId: extractionRequestId, fileBuffer: arrayBuffer }
          }, [arrayBuffer]);
          });
        } finally {
          if (extractionWorkerTaskRef.current === extractionRequestId) {
            extractionWorkerTaskRef.current = null;
          }
        }

        fullMarkdown = results.join('\n\n').trim();
        latestExtractedText = fullMarkdown;
        setExtractedText(fullMarkdown);
      }

      // --- STAGE 1.5: GLOSSARY GENERATION & STYLE ANALYSIS ---
      let glossaryText = glossary;
      let detectedStyle = translationStyle || '一般/通用';
      let detectedCharacters = characterMap;
      
      if (startingChunk === 0) {
        setTranslationStage('analyzing');
        setStatusMessage('正在提取專業術語、角色關係與分析文本風格...');
        
        try {
          const analysisResponse = await generateContentWrapper({
            model: selectedModel,
            promptText: buildDocumentAnalysisPrompt(fullMarkdown),
            temperature: 0,
            jsonMode: true,
          });
          if (analysisResponse.usageMetadata) {
            setActualInputTokens(prev => prev + (analysisResponse.usageMetadata?.promptTokenCount || 0));
            setActualOutputTokens(prev => prev + (analysisResponse.usageMetadata?.candidatesTokenCount || 0));
          }

          const analysis = parseDocumentAnalysis(analysisResponse.text || '');
          glossaryText = analysis.glossary;
          detectedCharacters = analysis.characterMap;
          detectedStyle = analysis.styleGuide;
          
          setTranslationStyle(detectedStyle);
          setGlossary(glossaryText);
          setCharacterMap(detectedCharacters);
          latestTranslationStyle = detectedStyle;
          latestGlossary = glossaryText;
          latestCharacterMap = detectedCharacters;
        } catch (err) {
          console.warn("Analysis failed, continuing with defaults.", err);
          setTranslationStyle('一般/通用');
          setGlossary('無');
          setCharacterMap('無');
        }
      }
      
      // --- STAGE 2: TRANSLATION ---
      setTranslationStage('translating');
      setStatusMessage('正在準備翻譯...');
      // Gemini 3/3.5 has a huge context window, but output is limited to 8192 tokens per request.
      // 3500 characters is a safe upper bound to ensure the translated output doesn't get truncated and maintains high quality.
      const textChunks = splitTranslation ? splitTextIntoChunks(fullMarkdown, 3500) : [fullMarkdown];
      const translationChunksCount = textChunks.length;
      latestTotalChunks = translationChunksCount;
      setTotalChunks(translationChunksCount);
      
      let fullTranslatedText = translatedText; // Start with what we already have
      let previousTranslatedText = translatedText.slice(-1000);
      
      // Start from the current chunk if resuming
      const startChunk = startingChunk;
      let previousSourceText = startChunk > 0 ? textChunks[startChunk - 1].slice(-1000) : '';
      let dynamicGlossary = glossaryText;
      let dynamicCharacterMap = detectedCharacters;
      let dynamicPlotSummary = plotSummary;
      
      for (let i = startChunk; i < translationChunksCount; i++) {
        if (translationCancelledRef.current) throw new Error('翻譯已取消');
        latestChunk = i + 1;
        setCurrentChunk(i + 1);
        setStatusMessage(`正在翻譯 (第 ${i + 1}/${translationChunksCount} 部分)...`);
        
        let success = false;
        let retries = 0;
        const MAX_RETRIES = 6;
        let currentChunkTranslated = '';

        const systemInstruction = `你是一位世界級的專業翻譯專家與資深編譯專家，精通各種文體的正體中文翻譯。你不僅擅長長篇小說、技術文件與各類科技、科學領域（如：人工智慧、生物工程、物理學、資訊安全等），更深耕於文學小說、社會科學、歷史、經濟、政治等各類文學與非文學著作。
你的唯一任務是將使用者提供的文本翻譯成精確、優雅且符合各專業領域規範的繁體中文。

【全域翻譯指南與風格】：
${detectedStyle}

【全域術語表 (Glossary)】：
請嚴格遵守以下術語表，確保譯名完全一致：
${dynamicGlossary !== '無' ? dynamicGlossary : '保持專有名詞與章節標題前後統一。'}

【角色圖譜 (Character Map)】：
請根據以下角色設定，確保對話語氣與人稱（他/她/它）一致：
${dynamicCharacterMap !== '無' ? dynamicCharacterMap : '自動識別角色並保持一致。'}

【前情提要 (Plot Summary)】：
${dynamicPlotSummary ? `目前故事進展：\n${dynamicPlotSummary}` : '這是故事的開頭。'}

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
9. 強制對話換行：這是極度重要的規則！只要遇到人物對話（通常包含在引號內），**必須強制獨立成段（換行）**。即使原文中多個角色的對話、或是對話與敘事描述擠在同一個段落，你也**絕對要主動將它們拆分成不同的段落**。每個角色的對話必須獨立一行，並使用繁體中文標準引號（「」與『』）。
${customInstructions ? `\n【使用者自訂指示 (Custom Instructions)】：\n請嚴格遵守以下由使用者針對此文本提供的特殊翻譯指示：\n${customInstructions}\n` : ''}`;

        const promptText = `請翻譯以下文本。
【待翻譯文本】：
${textChunks[i]}`;

        while (!success && retries < MAX_RETRIES) {
          try {
            // Step 1: Draft Translation (Streaming)
            setStatusMessage(`正在翻譯初稿 (第 ${i + 1}/${translationChunksCount} 部分)...`);
            const responseStream = generateContentStreamWrapper({
              model: selectedModel,
              systemInstruction,
              promptText,
              temperature: 0.2
            });
            
            for await (const chunk of responseStream) {
              if (translationCancelledRef.current) throw new Error('翻譯已取消');
              const text = chunk.text || '';
              currentChunkTranslated += text;
              setTranslatedText(fullTranslatedText + currentChunkTranslated);
              if (chunk.usageMetadata) {
                setActualInputTokens(prev => prev + (chunk.usageMetadata?.promptTokenCount || 0));
                setActualOutputTokens(prev => prev + (chunk.usageMetadata?.candidatesTokenCount || 0));
              }
            }

            // Basic validation for translation: check if output is suspiciously short
            const sourceLength = textChunks[i].replace(/\s+/g, '').length;
            const targetLength = currentChunkTranslated.replace(/\s+/g, '').length;
            
            // For English to Chinese, the character count usually decreases.
            // We only trigger retry if the source is substantial and the target is extremely short.
            // Changed threshold from 0.05 to 0.02 to avoid false positives on concise translations or texts with lots of whitespace.
            if (sourceLength > 150 && targetLength < sourceLength * 0.02) {
              console.warn(`Translation validation failed for chunk ${i + 1}. Source length: ${sourceLength}, Target length: ${targetLength}.`);
              console.warn(`Source text: ${textChunks[i].substring(0, 200)}...`);
              console.warn(`Translated text: ${currentChunkTranslated}`);
              if (retries < 2) {
                throw new Error("Translated text is suspiciously short. Possible omission.");
              } else {
                console.warn(`Accepting short translation after ${retries} retries to prevent translation failure.`);
              }
            }

            // Step 2: Self-Correction & Context Update
            setStatusMessage(`正在自我校對與更新術語 (第 ${i + 1}/${translationChunksCount} 部分)...`);
            
            const correctionResponse = await generateContentWrapper({
              model: selectedModel,
              promptText: `請對以下翻譯進行嚴格的自我校對，並提取新出現的專有名詞與劇情發展。

【原文】：
${textChunks[i]}

【初稿譯文】：
${currentChunkTranslated}

【現有術語表】：
${dynamicGlossary}

【現有角色圖譜】：
${dynamicCharacterMap}

【任務 1：自我校對與零漏譯檢查】：
請檢查初稿是否有：
1. **漏譯或誤譯**：檢查是否有任何句子、段落被跳過或未翻譯。
2. 標點符號錯誤。
3. 未遵守現有術語表與角色圖譜。
4. **幻覺或超譯**：檢查譯文是否加入了原文中不存在的資訊。
5. **格式檢查**：確保譯文保留了原文所有的 Markdown 標記（如 # 標題、* 列表等）以及正確的分段與換行。
6. **夾雜原文檢查 (極度重要)**：確保初稿中沒有殘留未翻譯的英文「句子或段落」（絕對不可包含雙語對照的段落）。如果發現整句或整段未翻譯的英文，請務必將其翻譯為繁體中文。除了專有名詞的括號註釋外，最終輸出必須是 100% 的繁體中文。
7. **雙關語與語氣檢查**：確認原文中的雙關語、隱喻或特殊語氣是否被妥善保留並轉化為自然流暢的中文，避免生硬直譯。
8. **強制對話換行檢查**：這是極度重要的檢查！仔細審視所有對話。如果同一個段落內包含兩個以上角色的對話，或者對話與大段敘事描述擠在一起，**必須強制拆分成多個段落（換行）**。確保每個角色的對話都獨立一行。
${customInstructions ? `9. **使用者自訂指示檢查**：請確保譯文完全符合以下使用者自訂指示：\n${customInstructions}\n` : ''}
請直接提供修正後的「最終完美譯文」。

【任務 2：動態上下文提取】：
請分析本段內容並提取：
1. **新術語**：新出現的專有名詞（格式：- [英文]: [中文]）。
2. **新角色/角色發展**：新出現的角色或現有角色的新資訊（如性別、新關係）。
3. **劇情摘要**：用 50 字內簡述本段發生的關鍵劇情。

請務必以 JSON 格式回傳，格式如下：
{
  "correctedTranslation": "修正後的最終完整譯文。必須嚴格保留原文的 Markdown 格式、標題結構與分段換行，不可合併段落。禁止包含未翻譯英文。純繁中輸出。",
  "newTerms": ["- [英文]: [中文]"],
  "newCharacters": ["- [角色名]: [描述]"],
  "chunkSummary": "本段劇情的極簡摘要",
  "foundHallucinations": true 或 false,
  "missingContentDetected": true 或 false
}`,
              temperature: 0,
              jsonMode: true
            });
            if (translationCancelledRef.current) throw new Error('翻譯已取消');

            try {
              const correctionResult = JSON.parse(correctionResponse.text || '{}');
              
              if (correctionResponse.usageMetadata) {
                setActualInputTokens(prev => prev + (correctionResponse.usageMetadata?.promptTokenCount || 0));
                setActualOutputTokens(prev => prev + (correctionResponse.usageMetadata?.candidatesTokenCount || 0));
              }
              
              if (correctionResult.missingContentDetected) {
                console.warn(`Missing content detected in chunk ${i + 1}. Retrying with higher emphasis on completeness.`);
                retries++;
                if (retries < MAX_RETRIES) {
                  currentChunkTranslated = '';
                  continue; // Retry this chunk
                }
              }

              if (correctionResult.correctedTranslation) {
                currentChunkTranslated = correctionResult.correctedTranslation;
                // Update UI with corrected translation
                setTranslatedText(fullTranslatedText + currentChunkTranslated);
              }
              
              if (correctionResult.newTerms && correctionResult.newTerms.length > 0) {
                const newTermsStr = correctionResult.newTerms.join('\n');
                dynamicGlossary += (dynamicGlossary === '無' ? '' : '\n') + newTermsStr;
                setGlossary(dynamicGlossary);
                latestGlossary = dynamicGlossary;
              }

              if (correctionResult.newCharacters && correctionResult.newCharacters.length > 0) {
                const newCharsStr = correctionResult.newCharacters.join('\n');
                dynamicCharacterMap += (dynamicCharacterMap === '無' ? '' : '\n') + newCharsStr;
                setCharacterMap(dynamicCharacterMap);
                latestCharacterMap = dynamicCharacterMap;
              }

              if (correctionResult.chunkSummary) {
                dynamicPlotSummary = dynamicPlotSummary ? `${dynamicPlotSummary}\n- ${correctionResult.chunkSummary}` : `- ${correctionResult.chunkSummary}`;
                // Keep plot summary concise (last 10 points)
                const summaryLines = dynamicPlotSummary.split('\n');
                if (summaryLines.length > 10) {
                  dynamicPlotSummary = summaryLines.slice(-10).join('\n');
                }
                setPlotSummary(dynamicPlotSummary);
                latestPlotSummary = dynamicPlotSummary;
              }
            } catch (e) {
              console.warn("Failed to parse correction response, using draft translation.", e);
            }

            success = true;
          } catch (err: any) {
            const errorMessage = err.message?.toLowerCase() || '';
            const status = err.status;
            
            if (status === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('suspiciously short')) {
              retries++;
              if (retries >= MAX_RETRIES) throw new Error(`翻譯失敗：模型輸出內容過短或達到 API 限制。(${err.message})`);
              
              const isShortError = errorMessage.includes('suspiciously short');
              const waitTime = isShortError ? 1 : retries * 5;
              
              setStatusMessage(isShortError ? `譯文長度異常，正在重新嘗試 (${retries}/${MAX_RETRIES})...` : `API 限制，等待 ${waitTime} 秒後重試...`);
              await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              setStatusMessage(`正在翻譯 (第 ${i + 1}/${translationChunksCount} 部分)...`);
              currentChunkTranslated = '';
            } else {
              throw err;
            }
          }
        }
        
        fullTranslatedText += currentChunkTranslated + '\n\n';
        latestTranslatedText = fullTranslatedText;
        setTranslatedText(fullTranslatedText);
        previousTranslatedText = currentChunkTranslated.slice(-1000); // Keep last 1000 chars for context
        previousSourceText = textChunks[i].slice(-1000);
        
        // Save progress to IndexedDB
        await saveCurrentState(
          'translating',
          i + 1,
          translationChunksCount,
          fullMarkdown,
          fullTranslatedText,
          detectedStyle,
          dynamicGlossary,
          dynamicCharacterMap,
          dynamicPlotSummary,
        );
        
        // Estimation update
        const now = Date.now();
        const elapsed = now - currentStartTime;
        const completed = i + 1;
        const avg = elapsed / completed;
        const remaining = translationChunksCount - completed;
        setEstimatedRemainingTime(Math.round((avg * remaining) / 1000));
        
        if (i < translationChunksCount - 1) {
          // Reduced delay for better efficiency
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      await saveCurrentState(
        'completed',
        translationChunksCount,
        translationChunksCount,
        fullMarkdown,
        fullTranslatedText,
        detectedStyle,
        dynamicGlossary,
        dynamicCharacterMap,
        dynamicPlotSummary,
      );
      
      if (fullTranslatedText && autoDownload !== 'none') {
        setPendingDownload(autoDownload);
      }
      
    } catch (err: any) {
      const wasCancelled = translationCancelledRef.current;
      if (wasCancelled) {
        showToast('翻譯已停止，完成的進度可以從歷史紀錄繼續。', 'success');
      } else {
        console.error(err);
        setError(`翻譯失敗 (Translation failed): ${err.message}`);
      }
      if (fileId) {
        const record: HistoryRecord = {
          id: fileId,
          title: customTitle || file?.name || 'Untitled',
          author: authorName,
          coverImage: coverImage,
          extractedText: latestExtractedText,
          translatedText: latestTranslatedText,
          currentChunk: latestChunk,
          totalChunks: latestTotalChunks,
          status: wasCancelled ? 'translating' : 'error',
          timestamp: Date.now(),
          model: selectedModel,
          translationStyle: latestTranslationStyle || undefined,
          glossaryText: latestGlossary || undefined,
          characterMap: latestCharacterMap || undefined,
          plotSummary: latestPlotSummary || undefined,
        };
        try {
          await saveHistory(record);
          void loadHistory();
        } catch (historyError) {
          console.warn('Unable to save stopped or failed translation progress', historyError);
        }
      }
    } finally {
      translationCancelledRef.current = false;
      setIsTranslating(false);
      setTranslationStage(null);
      setStatusMessage('');
    }
  };

  const handleCancelTranslation = () => {
    translationCancelledRef.current = true;
    setStatusMessage('正在安全停止翻譯...');
    const requestId = extractionWorkerTaskRef.current;
    if (requestId) {
      pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId } });
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
      showToast("在內嵌模式下可能無法下載檔案，請在新分頁開啟以獲得完整功能。", 'error');
      return;
    }
    
    setIsDownloadingPdf(true);
    try {
      const element = document.getElementById('translation-result-content');
      if (!element) throw new Error("找不到內容元素");

      const baseName = customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document';
      const defaultTitle = activeTab === 'translate' 
        ? `${baseName}_翻譯`
        : baseName;

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

      // Build the print document with DOM APIs. User-controlled titles and
      // rendered content are never interpolated into executable HTML.
      iframeDoc.open();
      iframeDoc.write('<!doctype html><html><head></head><body></body></html>');
      iframeDoc.close();

      iframeDoc.title = defaultTitle;
      const style = iframeDoc.createElement('style');
      style.textContent = `
        body { font-family: "Microsoft JhengHei", "PingFang TC", sans-serif; padding: 20mm; color: #000; background: #fff; line-height: 1.6; font-size: 12pt; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        h1 { font-size: 24pt; border-bottom: 2px solid #333; padding-bottom: 10px; margin-top: 0; }
        h2 { font-size: 20pt; margin-top: 25px; border-bottom: 1px solid #eee; page-break-after: avoid; }
        h3 { font-size: 16pt; margin-top: 20px; page-break-after: avoid; }
        p, li { margin-bottom: 10px; overflow-wrap: anywhere; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 10pt; border: 1px solid #ddd; }
        code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
        blockquote { border-left: 5px solid #ddd; padding-left: 20px; color: #444; font-style: italic; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; page-break-inside: auto; }
        tr { page-break-inside: avoid; page-break-after: auto; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f9f9f9; }
        img { max-width: 100%; height: auto; display: block; margin: 10px auto; }
        @page { size: A4; margin: 15mm; }
      `;
      iframeDoc.head.appendChild(style);

      const printContent = element.cloneNode(true) as HTMLElement;
      printContent.removeAttribute('id');
      iframeDoc.body.appendChild(printContent);

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1000);
      }, 300);

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
    const baseName = customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document';
    const defaultTitle = activeTab === 'translate' 
      ? `${baseName}_翻譯`
      : baseName;
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
      showToast("在內嵌模式下可能無法複製，請在新分頁開啟以獲得完整功能。", 'error');
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
      showToast("在內嵌模式下可能無法下載檔案，請在新分頁開啟以獲得完整功能。", 'error');
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
        const [pdfjsLib, workerModule] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.mjs?url'),
        ]);
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const numPages = pdf.numPages;
        try {
          assertPdfPageLimit(numPages);
        } catch (pageError) {
          await pdf.destroy();
          throw pageError;
        }
        
        for (let i = 1; i <= numPages; i++) {
          setStatusMessage(`提取文字中 (第 ${i}/${numPages} 頁)...`);
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n\n';
          setExtractedText(fullText);
          page.cleanup();
        }
        await pdf.destroy();
      }
      
      setStatusMessage('正在產生 EPUB...');
      const baseName = customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document';
      const titleToUse = baseName;
      
      const response = await fetch('/api/generate-epub', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: titleToUse,
          markdown: fullText,
          author: authorName || undefined,
          cover: coverImage || undefined
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
      showToast("在內嵌模式下可能無法下載檔案，請在新分頁開啟以獲得完整功能。", 'error');
      return;
    }
    const text = textToUse || (activeTab === 'translate' ? translatedText : extractedText);
    if (!text) return;
    
    setIsDownloadingEpub(true);
    // 讓 React 有時間渲染 loading 狀態
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      const baseName = customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document';
      const defaultTitle = activeTab === 'translate' 
        ? `${baseName}_翻譯`
        : baseName;

      const response = await fetch('/api/generate-epub', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: defaultTitle,
          markdown: text,
          author: authorName || undefined,
          cover: coverImage || undefined
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
      a.download = `${baseName}_翻譯.epub`;
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

  const selectedModelData = getModelConfig(selectedModel);
  
  // The pipeline reads source text multiple times for analysis, translation,
  // proofreading and glossary updates. Keep document tokens separate from the
  // estimated billable pipeline tokens so the UI does not mislabel a multiplier
  // as the source document size.
  const estimatedCost = estimatePipelineCost(selectedModelData, tokenCount ?? 0);
  const estimatedPipelineInputTokens = estimatedCost.inputTokens;
  const estimatedOutputTokens = estimatedCost.outputTokens;
  const estimatedInputCost = estimatedCost.inputUsd;
  const estimatedOutputCost = estimatedCost.outputUsd;
  const totalEstimatedCost = estimatedCost.totalUsd;
  const totalEstimatedCostTWD = estimatedCost.totalTwd;

  const actualCost = calculateTokenCost(selectedModelData, actualInputTokens, actualOutputTokens);
  const actualInputCost = actualCost.inputUsd;
  const actualOutputCost = actualCost.outputUsd;
  const totalActualCost = actualCost.totalUsd;
  const totalActualCostTWD = actualCost.totalTwd;

  return (
    <div className="app-shell min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div key={toast.id} className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-start gap-3 w-[calc(100%-2rem)] sm:w-auto max-w-sm animate-in slide-in-from-top-4 fade-in duration-300 print:hidden ${
          toast.type === 'success' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50 backdrop-blur-sm' : 'bg-red-950/80 text-red-400 border border-red-900/50 backdrop-blur-sm'
        }`}>
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap break-words">{toast.message}</p>
          </div>
          <button onClick={() => setToast(null)} className="ml-2 shrink-0 text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <header className="app-header bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-10 print:hidden">
        {isIframe && (
          <div className="bg-amber-950/30 border-b border-amber-900/50 px-4 py-2.5 sm:px-6 lg:px-8 flex items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-2 text-amber-500 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
              <p>
                <strong>內嵌模式限制：</strong> 受限於瀏覽器的安全機制，<strong className="font-semibold">複製與下載功能可能會失效</strong>。請在新分頁開啟以獲得完整功能。
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
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="brand-mark bg-blue-600/20 border border-blue-500/30 p-2.5 rounded-xl">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-100">PDF 翻譯工作台</h1>
              <p className="text-[11px] text-slate-500 mt-0.5">清楚、安心地完成每一份翻譯</p>
            </div>
          </div>
          <div className="header-actions flex items-center gap-2">
            <button
              onClick={() => setShowInfoModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full text-sm font-medium transition-colors border border-slate-700 shadow-inner"
            >
              <Info className="w-4 h-4" />
              <span className="hidden sm:inline">使用說明</span>
            </button>
            <button
              onClick={() => setShowKeyModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full text-sm font-medium transition-colors border border-slate-700 shadow-inner"
            >
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">API Key</span>
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full text-sm font-medium transition-colors border border-slate-700 shadow-inner"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">歷史紀錄</span>
            </button>
            {((selectedModelData.provider === 'google' && isManualKeyActive) ||
              (selectedModelData.provider === 'openai' && isOpenaiKeyActive)) && (
              <div className="text-sm text-slate-400 flex items-center gap-1.5 bg-slate-800/50 border border-slate-700/50 px-3 py-1.5 rounded-full shadow-inner hidden sm:flex">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                已綁定 API Key
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-main max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:m-0 print:max-w-none">
        <div className="workspace-intro mb-7 print:hidden">
          <div>
            <p className="eyebrow">AI DOCUMENT WORKSPACE</p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-100 mt-1">把文件變成好讀的繁體中文</h2>
            <p className="text-sm text-slate-500 mt-2">上傳檔案、選擇模型，剩下的交給我們。</p>
          </div>
        </div>
        <div className="mode-switch inline-flex gap-1 mb-8 p-1 rounded-xl print:hidden">
          <button 
            onClick={() => setActiveTab('translate')}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'translate' ? 'is-active text-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
          >
            PDF 翻譯
          </button>
          <button 
            onClick={() => setActiveTab('converter')}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'converter' ? 'is-active text-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
          >
            文件轉換器
          </button>
        </div>

        <div className="workspace-grid grid grid-cols-1 lg:grid-cols-12 gap-6 print:block print:gap-0">
          
          <div className="control-rail lg:col-span-5 xl:col-span-4 space-y-5 print:hidden">
            
            {activeTab === 'translate' && (
              <div className="app-card model-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
                <div className="section-heading">
                  <div className="step-badge">1</div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-200">選擇 AI 模型</h2>
                    <p className="text-xs text-slate-500 mt-0.5">依照品質、速度和預算選擇</p>
                  </div>
                </div>

                <label htmlFor="model-select" className="block text-xs font-semibold text-slate-500 mb-2">翻譯模型</label>
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(event) => setSelectedModel(event.target.value)}
                  className="model-select w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <optgroup label="Google Gemini">
                    {MODELS.filter(model => model.provider === 'google').map(model => (
                      <option key={model.id} value={model.id}>{model.name} — {model.badge}</option>
                    ))}
                  </optgroup>
                  <optgroup label="OpenAI GPT">
                    {MODELS.filter(model => model.provider === 'openai').map(model => (
                      <option key={model.id} value={model.id}>{model.name} — {model.badge}</option>
                    ))}
                  </optgroup>
                </select>

                <div className="selected-model mt-4 rounded-xl border border-slate-800 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {selectedModelData.provider === 'google' ? 'Google Gemini' : 'OpenAI GPT'}
                      </p>
                      <p className="font-semibold text-slate-200 mt-0.5 truncate">{selectedModelData.name}</p>
                    </div>
                    <span className="model-badge shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold">{selectedModelData.badge}</span>
                  </div>
                  <div className="price-grid grid grid-cols-3 gap-2 mt-4 text-center">
                    <div><span>輸入</span><strong>${selectedModelData.inputPrice}</strong></div>
                    <div><span>快取</span><strong>${selectedModelData.cachedInputPrice}</strong></div>
                    <div><span>輸出</span><strong>${selectedModelData.outputPrice}</strong></div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3">每 1M tokens{selectedModelData.priceNote ? `・${selectedModelData.priceNote}` : ''}</p>
                </div>
              </div>
            )}

            <div className="app-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
              <div className="section-heading">
                <div className="step-badge">
                  {activeTab === 'translate' ? '2' : '1'}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">上傳文件</h2>
                  <p className="text-xs text-slate-500 mt-0.5">支援 PDF 與 Markdown</p>
                </div>
              </div>
              
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
                    <p className="text-sm text-slate-500 mt-1">PDF 最大 50 MB／3,600 頁</p>
                  </div>
                )}
              </div>

              {activeTab === 'translate' && (
                <div className="mt-4 space-y-4">
                  <div className="friendly-option flex items-start gap-3 p-3 bg-slate-950/50 border border-slate-800 rounded-xl">
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

              <details className="advanced-settings mt-6 pt-5 border-t border-slate-800">
                <summary className="text-sm font-semibold text-slate-300 flex items-center gap-2 cursor-pointer">
                  <Book className="w-4 h-4 text-blue-400" />
                  EPUB 匯出設定 <span className="ml-auto text-xs font-normal text-slate-500">選填</span>
                </summary>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">作者名稱 (選填)</label>
                    <input
                      type="text"
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      placeholder="例如：John Doe"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1.5">自訂封面圖片 (選填)</label>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 cursor-pointer">
                        <div className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-950 border border-slate-700 border-dashed rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors">
                          <ImageIcon className="w-4 h-4" />
                          {coverImage ? '更換封面' : '上傳圖片'}
                        </div>
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (!['image/jpeg', 'image/png'].includes(file.type)) {
                                showToast('封面僅支援 JPG 或 PNG 圖片', 'error');
                                return;
                              }
                              if (file.size > 5 * 1024 * 1024) {
                                showToast('封面圖片不可超過 5 MB', 'error');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onload = (e) => setCoverImage(e.target?.result as string);
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      {coverImage && (
                        <button
                          onClick={() => setCoverImage(null)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          title="移除封面"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {coverImage && (
                      <div className="mt-2 relative w-20 h-28 rounded-md overflow-hidden border border-slate-700 shadow-sm">
                        <img src={coverImage} alt="Cover Preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                </div>
              </details>

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
                        <span className="text-slate-500">文件 Token 數:</span>
                        <span className="font-medium text-slate-300">{tokenCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">預估流程輸入 Token:</span>
                        <span className="font-medium text-slate-300">~{estimatedPipelineInputTokens.toLocaleString()}</span>
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
                      
                      {(actualInputTokens > 0 || actualOutputTokens > 0) && (
                        <div className="pt-4 mt-4 border-t border-slate-700/50 space-y-2">
                          <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
                            <Clock className="w-4 h-4 text-purple-400" />
                            實際使用量與成本 (即時更新)
                          </h4>
                          <div className="flex justify-between">
                            <span className="text-slate-500">實際輸入 Token:</span>
                            <span className="font-medium text-slate-300">{actualInputTokens.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">實際輸出 Token:</span>
                            <span className="font-medium text-slate-300">{actualOutputTokens.toLocaleString()}</span>
                          </div>
                          <div className="pt-2 mt-2 border-t border-slate-800/50 space-y-1">
                            <div className="flex justify-between text-blue-400">
                              <span>實際已產生成本 (USD):</span>
                              <span className="font-medium">${totalActualCost.toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between text-emerald-400">
                              <span>實際已產生成本 (TWD):</span>
                              <span className="font-bold">NT$ {totalActualCostTWD.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {activeTab === 'converter' && (
              <div className="app-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
                <div className="section-heading">
                  <div className="step-badge">2</div>
                  <div><h2 className="text-lg font-semibold text-slate-200">設定 EPUB</h2><p className="text-xs text-slate-500 mt-0.5">補上書名與資訊</p></div>
                </div>
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

            {activeTab === 'translate' && (
              <div className="app-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
                <div className="section-heading">
                  <div className="step-badge">3</div>
                  <div><h2 className="text-lg font-semibold text-slate-200">翻譯偏好</h2><p className="text-xs text-slate-500 mt-0.5">有特別需求再填寫即可</p></div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">自訂翻譯指示 (選填)</label>
                    <textarea 
                      value={customInstructions}
                      onChange={(e) => setCustomInstructions(e.target.value)}
                      placeholder="例如：請將主角的名字翻譯為「約翰」，並保持幽默的語氣..."
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none h-24 custom-scrollbar"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="app-card action-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
              <div className="section-heading">
                <div className="step-badge">
                  {activeTab === 'translate' ? '4' : '3'}
                </div>
                <div><h2 className="text-lg font-semibold text-slate-200">{activeTab === 'translate' ? '準備開始' : '準備轉換'}</h2><p className="text-xs text-slate-500 mt-0.5">確認設定後即可執行</p></div>
              </div>
              
              {activeTab === 'translate' ? (
                <div className="space-y-2.5">
                  <button
                    onClick={handleTranslate}
                    disabled={(!file && !extractedText) || isCalculating || isTranslating || isExtracting}
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
                  {isTranslating && (
                    <button
                      type="button"
                      onClick={handleCancelTranslation}
                      className="w-full py-2.5 px-4 border border-slate-700 bg-white text-slate-500 hover:text-red-500 hover:border-red-300 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      停止並保留進度
                    </button>
                  )}
                </div>
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
                      <div className="flex-1 overflow-hidden">
                        <div className="font-semibold text-indigo-200 mb-1">AI 偵測翻譯風格：</div>
                        <div className="prose prose-sm prose-invert max-w-none">
                          <Suspense fallback={markdownFallback}><MarkdownPreview>{translationStyle}</MarkdownPreview></Suspense>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {error && (
                <div className="mt-4 p-3 bg-red-950/30 border border-red-900/50 text-red-400 rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="break-words whitespace-pre-wrap">{error}</p>
                  </div>
                </div>
              )}
            </div>

          </div>

          <div className="result-column lg:col-span-7 xl:col-span-8 print:block print:w-full">
            <div className="result-panel bg-slate-900 rounded-2xl shadow-lg shadow-black/20 border border-slate-800 h-full min-h-[680px] flex flex-col overflow-hidden print:border-none print:shadow-none print:h-auto print:min-h-0 print:rounded-none print:block">
              <div className="result-toolbar px-5 sm:px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/50 print:hidden">
                <h2 className="text-lg font-medium flex items-center gap-2 text-slate-200">
                  <span className="result-status-dot"></span>
                  {activeTab === 'translate' ? '翻譯預覽' : '文字預覽'}
                </h2>
                
                <div className="result-actions flex items-center gap-2 overflow-x-auto max-w-full">
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
                    <Suspense fallback={markdownFallback}>
                      <MarkdownPreview>{activeTab === 'translate' ? (translationStage === 'extracting' || translationStage === 'analyzing' ? extractedText : translatedText) : extractedText}</MarkdownPreview>
                    </Suspense>
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

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
              <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                <History className="w-5 h-5 text-blue-400" />
                歷史紀錄
              </h2>
              <button 
                onClick={() => setShowHistory(false)}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {history.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>尚無歷史紀錄</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map(record => (
                    <div 
                      key={record.id}
                      onClick={() => handleLoadHistory(record)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer group ${
                        currentFileId === record.id 
                          ? 'bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(37,99,235,0.1)]' 
                          : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-slate-200 truncate mb-1">
                            {record.title}
                          </h3>
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {new Date(record.timestamp).toLocaleString()}
                            </span>
                            <span className="flex items-center gap-1">
                              {record.status === 'completed' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              ) : record.status === 'error' ? (
                                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                              ) : (
                                <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                              )}
                              {record.status === 'completed' ? '已完成' : record.status === 'error' ? '錯誤' : `翻譯中 (${record.currentChunk}/${record.totalChunks})`}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteHistory(record.id, e)}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="刪除紀錄"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {historyToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4 text-red-400">
                <AlertCircle className="w-6 h-6" />
                <h2 className="text-xl font-semibold">確認刪除</h2>
              </div>
              <p className="text-slate-300 mb-6">
                您確定要刪除這筆歷史紀錄嗎？此操作無法復原。
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setHistoryToDelete(null)}
                  className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteHistory}
                  className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                >
                  確認刪除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600/20 p-2 rounded-xl border border-blue-500/30">
                  <Info className="w-5 h-5 text-blue-400" />
                </div>
                <h2 className="text-xl font-semibold text-slate-100">系統說明與翻譯流程</h2>
              </div>
              <button 
                onClick={() => setShowInfoModal(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors p-2 hover:bg-slate-800 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar space-y-8 text-slate-300">
              <section>
                <h3 className="text-lg font-medium text-slate-100 mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div>
                  核心功能
                </h3>
                <ul className="list-disc list-inside space-y-2 text-sm leading-relaxed ml-2">
                  <li><strong className="text-slate-200">多模型支援：</strong>整合 Google Gemini 與 OpenAI GPT 雙生態系，提供多樣化的頂級 AI 模型選擇。</li>
                  <li><strong className="text-slate-200">多格式支援：</strong>支援 PDF 與 Markdown 檔案上傳。</li>
                  <li><strong className="text-slate-200">智慧排版修復：</strong>自動修復 PDF 斷行問題，還原 Markdown 標題與清單格式。</li>
                  <li><strong className="text-slate-200">多格式匯出：</strong>支援將翻譯結果匯出為 Markdown、排版優化的 PDF，以及 EPUB 電子書。</li>
                  <li><strong className="text-slate-200">進度接續：</strong>自動儲存翻譯歷史，支援中斷後接續翻譯。</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-medium text-slate-100 mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-purple-500 rounded-full"></div>
                  AI 翻譯流程架構
                </h3>
                <div className="space-y-4 text-sm leading-relaxed">
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                    <h4 className="font-semibold text-purple-400 mb-2">階段一：文字提取與格式修復 (Extraction)</h4>
                    <p>使用 Web Worker 在背景解析 PDF，並透過 Gemini 模型將碎片化的文字重新排版為連貫的 Markdown 格式，同時強制保留對話換行與引用序號，此階段<strong className="text-slate-200">絕對不進行翻譯</strong>以保留原意。</p>
                  </div>
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                    <h4 className="font-semibold text-purple-400 mb-2">階段二：全域分析與風格建模 (Global Analysis)</h4>
                    <p>在正式翻譯前，系統會讀取前 50,000 字進行分析，自動提取<strong className="text-slate-200">核心術語表 (Glossary)</strong>、<strong className="text-slate-200">角色圖譜 (Character Map)</strong>，並制定統一的<strong className="text-slate-200">翻譯風格指南</strong>，確保長篇翻譯的語氣與名詞一致。</p>
                  </div>
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                    <h4 className="font-semibold text-purple-400 mb-2">階段三：迭代式分段翻譯 (Iterative Translation)</h4>
                    <p>將文本切分為每塊 3,500 字的區塊進行翻譯。每次翻譯都會帶入：全域術語表、角色圖譜、前情提要，以及<strong className="text-slate-200">上一段的原文與譯文</strong>，確保上下文完美銜接。</p>
                  </div>
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50">
                    <h4 className="font-semibold text-purple-400 mb-2">階段四：自我校對與動態更新 (Self-Correction)</h4>
                    <p>初稿完成後，系統會立即進行第二次 AI 調用進行嚴格校對。檢查是否有<strong className="text-slate-200">漏譯、幻覺或超譯</strong>。同時，系統會動態提取本段新出現的術語與劇情，並<strong className="text-slate-200">滾動式更新</strong>到全域術語表中，供下一段使用。</p>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-medium text-slate-100 mb-3 flex items-center gap-2">
                  <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
                  系統底層參數設定
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                    <span className="text-slate-400 block mb-1">區塊大小 (Chunk Size)</span>
                    <strong className="text-slate-200">3,500 字元</strong>
                    <p className="text-xs text-slate-500 mt-1">確保 Markdown 格式保留與術語一致性的最佳平衡點。</p>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                    <span className="text-slate-400 block mb-1">提取溫度 (Extraction Temp)</span>
                    <strong className="text-slate-200">0.1</strong>
                    <p className="text-xs text-slate-500 mt-1">極低溫度，確保 100% 忠實還原原文，不產生幻覺。</p>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                    <span className="text-slate-400 block mb-1">翻譯溫度 (Translation Temp)</span>
                    <strong className="text-slate-200">0.2</strong>
                    <p className="text-xs text-slate-500 mt-1">低溫度，在保持語句通順的同時，嚴格限制超譯。</p>
                  </div>
                  <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                    <span className="text-slate-400 block mb-1">校對溫度 (Correction Temp)</span>
                    <strong className="text-slate-200">0.0</strong>
                    <p className="text-xs text-slate-500 mt-1">絕對理性，專注於尋找漏譯與格式錯誤，並以 JSON 格式精準輸出。</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
            <button 
              onClick={() => setShowKeyModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors p-1"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-blue-900/30 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/20">
                <Key className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-semibold mb-2 text-slate-100">API Key 設定</h2>
              <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                使用此翻譯工具需要設定對應的 API Key。預設只保留到此分頁工作階段結束，並直接傳送給所選的 AI 服務。
              </p>

              <div className="text-left space-y-4">
                <div>
                  <p className="text-sm text-slate-300 mb-2 font-medium flex justify-between">
                    <span>Google Gemini API Key：</span>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 underline">獲取金鑰</a>
                  </p>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={manualApiKey}
                    onChange={(e) => setManualApiKey(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                  />
                </div>

                <div>
                  <p className="text-sm text-slate-300 mb-2 font-medium flex justify-between">
                    <span>OpenAI API Key (選填)：</span>
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-xs text-emerald-400 hover:text-emerald-300 underline">獲取金鑰</a>
                  </p>
                  <input
                    type="password"
                    placeholder="sk-proj-..."
                    value={manualOpenaiApiKey}
                    onChange={(e) => setManualOpenaiApiKey(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                  />
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberApiKeys}
                    onChange={(event) => setRememberApiKeys(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-700 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-300">在這台裝置記住金鑰</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">只建議在自己的私人裝置啟用。瀏覽器儲存空間不是密碼保管庫。</span>
                  </span>
                </label>

                <div className="pt-4">
                  <button
                    onClick={() => {
                      const trimmedGoogle = manualApiKey.trim();
                      const trimmedOpenai = manualOpenaiApiKey.trim();
                      if (trimmedGoogle !== '' && trimmedGoogle.length <= 20) {
                        showToast("Google API Key 格式不正確", 'error');
                        return;
                      }
                      if (trimmedOpenai !== '' && trimmedOpenai.length <= 10) {
                        showToast("OpenAI API Key 格式不正確", 'error');
                        return;
                      }

                      persistStoredKey(trimmedGoogle, SESSION_STORAGE_KEY_NAME, LOCAL_STORAGE_KEY_NAME, rememberApiKeys);
                      persistStoredKey(trimmedOpenai, SESSION_STORAGE_OPENAI_KEY_NAME, LOCAL_STORAGE_OPENAI_KEY_NAME, rememberApiKeys);
                      setIsManualKeyActive(trimmedGoogle.length > 20);
                      setIsOpenaiKeyActive(trimmedOpenai.length > 10);
                      setManualApiKey(trimmedGoogle);
                      setManualOpenaiApiKey(trimmedOpenai);

                      if (trimmedGoogle === '' && trimmedOpenai === '') {
                        showToast('已清除所有儲存的 API Key', 'success');
                      } else {
                        showToast(rememberApiKeys ? '已在這台裝置記住並套用金鑰' : '已在此分頁工作階段套用金鑰', 'success');
                      }
                      setShowKeyModal(false);
                    }}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_20px_rgba(37,99,235,0.5)] border border-blue-400/50"
                  >
                    儲存並套用
                  </button>
                </div>
              </div>
              
              <p className="text-xs text-slate-500 mt-6 text-center">
                若要清除金鑰，請將輸入框留空後儲存。金鑰不會傳送到本網站伺服器。
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
