import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { Upload, FileText, DollarSign, Play, Download, Loader2, AlertCircle, CheckCircle2, FileUp, Key, Copy, Book, X, ExternalLink, History, Image as ImageIcon, Clock, Info } from 'lucide-react';
import { saveHistory, getAllHistory, deleteHistory, HistoryRecord } from './lib/db';
import { splitTextIntoChunks } from './lib/text';
import { MAX_PDF_PAGES, validateUpload } from './lib/file-limits';
import { buildDocumentAnalysisPrompt, parseDocumentAnalysis } from './lib/document-analysis';
import { calculateTokenCost, DEFAULT_MODEL_ID, estimatePipelineCost, getModelConfig, MODELS } from './lib/models';
import { reportError, reportWarning } from './lib/diagnostics';
import { generateContent, generateContentStream, type GenerateContentOptions, type GenerateStreamOptions } from './lib/ai-providers';
import { abortableDelay, isAbortError, throwIfAborted } from './lib/abort';
import {
  DEFAULT_TRANSLATION_BUDGET_USD,
  DEFAULT_TRANSLATION_RETRY_LIMIT,
  TranslationBudgetExceededError,
} from './lib/translation-budget';
import {
  LOCAL_STORAGE_KEY_NAME,
  LOCAL_STORAGE_OPENAI_KEY_NAME,
  SESSION_STORAGE_KEY_NAME,
  SESSION_STORAGE_OPENAI_KEY_NAME,
  persistStoredKey,
  readStoredKey,
} from './lib/api-key-storage';
import {
  buildCorrectionPrompt,
  buildExtractionPrompt,
  buildTranslationPrompt,
  buildTranslationSystemInstruction,
  extractionSystemInstruction,
} from './lib/translation-prompts';
import AppToast, { type ToastMessage } from './components/AppToast';
import ApiKeyModal from './components/ApiKeyModal';
import { DeleteHistoryDialog, HistoryModal } from './components/HistoryDialogs';
import InfoModal from './components/InfoModal';
import TranslationLimits from './components/TranslationLimits';
import { useTranslationUsage } from './hooks/useTranslationUsage';
import { downloadBlob, downloadMarkdown, printElementToPdf, requestEpub } from './lib/browser-exports';
import { extractPdfText } from './lib/pdf-text-extraction';

const MarkdownPreview = lazy(() => import('./components/MarkdownPreview'));
const markdownFallback = <div className="text-sm text-slate-500">正在載入預覽...</div>;
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
  const { actualInputTokens, actualOutputTokens, resetUsage, recordUsage } = useTranslationUsage();
  const [translationBudgetUsd, setTranslationBudgetUsd] = useState(DEFAULT_TRANSLATION_BUDGET_USD);
  const [translationRetryLimit, setTranslationRetryLimit] = useState(DEFAULT_TRANSLATION_RETRY_LIMIT);
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
  const [toast, setToast] = useState<ToastMessage | null>(null);
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
      reportError('history_load_failed');
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
  const translationAbortControllerRef = useRef<AbortController | null>(null);
  const tokenAbortControllerRef = useRef<AbortController | null>(null);

  const handleSaveApiKeys = () => {
    const trimmedGoogle = manualApiKey.trim();
    const trimmedOpenai = manualOpenaiApiKey.trim();
    if (trimmedGoogle !== '' && trimmedGoogle.length <= 20) {
      showToast('Google API Key 格式不正確', 'error');
      return;
    }
    if (trimmedOpenai !== '' && trimmedOpenai.length <= 10) {
      showToast('OpenAI API Key 格式不正確', 'error');
      return;
    }
    persistStoredKey(trimmedGoogle, SESSION_STORAGE_KEY_NAME, LOCAL_STORAGE_KEY_NAME, rememberApiKeys);
    persistStoredKey(trimmedOpenai, SESSION_STORAGE_OPENAI_KEY_NAME, LOCAL_STORAGE_OPENAI_KEY_NAME, rememberApiKeys);
    setIsManualKeyActive(trimmedGoogle.length > 20);
    setIsOpenaiKeyActive(trimmedOpenai.length > 10);
    setManualApiKey(trimmedGoogle);
    setManualOpenaiApiKey(trimmedOpenai);
    showToast(
      trimmedGoogle === '' && trimmedOpenai === ''
        ? '已清除所有儲存的 API Key'
        : rememberApiKeys ? '已在這台裝置記住並套用金鑰' : '已在此分頁工作階段套用金鑰',
      'success',
    );
    setShowKeyModal(false);
  };

  useEffect(() => {
    // Initialize PDF worker
    try {
      pdfWorkerRef.current = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      reportError('pdf_worker_initialization_failed');
    }
    
    return () => {
      translationAbortControllerRef.current?.abort();
      tokenAbortControllerRef.current?.abort();
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
      tokenAbortControllerRef.current?.abort();
      const requestId = tokenWorkerTaskRef.current;
      if (requestId) {
        pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId } });
        tokenWorkerTaskRef.current = null;
      }
    };
  }, [selectedModel, base64Data, file]);

  const providerCredentials = () => ({
    googleApiKey: isManualKeyActive ? manualApiKey : undefined,
    openaiApiKey: isOpenaiKeyActive ? manualOpenaiApiKey : undefined,
  });
  const generateContentWrapper = (options: GenerateContentOptions) =>
    generateContent({ ...options, signal: options.signal ?? translationAbortControllerRef.current?.signal }, providerCredentials());
  const generateContentStreamWrapper = (options: GenerateStreamOptions) =>
    generateContentStream({ ...options, signal: options.signal ?? translationAbortControllerRef.current?.signal }, providerCredentials());

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (isTranslating) {
      translationCancelledRef.current = true;
      translationAbortControllerRef.current?.abort();
    }
    
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
    tokenAbortControllerRef.current?.abort();
    const tokenController = new AbortController();
    tokenAbortControllerRef.current = tokenController;
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
          config: { abortSignal: tokenController.signal },
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
                  config: { abortSignal: tokenController.signal },
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
      if (isCurrentRequest() && !isAbortError(err)) {
        reportError('token_calculation_failed');
        setError(`計算 Token 失敗 (Failed to calculate tokens): ${err.message}`);
        setTokenCount(null);
      }
    } finally {
      if (isCurrentRequest()) {
        tokenWorkerTaskRef.current = null;
        setIsCalculating(false);
      }
      if (tokenAbortControllerRef.current === tokenController) {
        tokenAbortControllerRef.current = null;
      }
    }
  };

  const handleTranslate = async () => {
    if (!extractedText && (!file || !base64Data)) return;

    const activeModel = getModelConfig(selectedModel);
    const projectedCost = estimatePipelineCost(activeModel, tokenCount ?? 0).totalUsd;
    if (translationBudgetUsd > 0 && projectedCost > translationBudgetUsd) {
      setError(`預估流程成本 $${projectedCost.toFixed(2)} USD，已超過目前 $${translationBudgetUsd.toFixed(2)} USD 上限。請調高上限、縮短文件或改用較省成本的模型。`);
      return;
    }

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
    
    translationAbortControllerRef.current?.abort();
    const translationController = new AbortController();
    translationAbortControllerRef.current = translationController;
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
    resetUsage();
    
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
      throwIfAborted(translationController.signal);
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
          reportWarning('translation_progress_save_failed');
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
                const MAX_RETRIES = translationRetryLimit;

                while (!success && retries < MAX_RETRIES) {
                  try {
                    throwIfAborted(translationController.signal);
                    const systemInstruction = extractionSystemInstruction(hasRawText);
                    const promptText = buildExtractionPrompt(rawText, hasRawText);

                    const response = await generateContentWrapper({
                      model: selectedModel,
                      systemInstruction,
                      promptText,
                      base64Pdf: hasRawText ? undefined : base64,
                      temperature: 0.1
                    });
                    if (translationCancelledRef.current) throw new Error('PDF 處理已取消');
                    
                    if (response.usageMetadata) {
                      recordUsage(response.usageMetadata, selectedModel, translationBudgetUsd);
                    }
                    
                    results[index] = response.text || '';
                    success = true;
                  } catch (err) {
                    if (err instanceof TranslationBudgetExceededError || isAbortError(err)) throw err;
                    reportWarning('pdf_extraction_chunk_failed', { chunk: index + 1, attempt: retries + 1 });
                    retries++;
                    if (retries >= MAX_RETRIES) {
                      if (index === totalExtractionChunks - 1 && !hasRawText) {
                        results[index] = "";
                        success = true;
                      } else {
                        throw err;
                      }
                    }
                    await abortableDelay(1000 * retries, translationController.signal);
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
            recordUsage(analysisResponse.usageMetadata, selectedModel, translationBudgetUsd);
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
          if (err instanceof TranslationBudgetExceededError || isAbortError(err)) throw err;
          reportWarning('document_analysis_failed');
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
        throwIfAborted(translationController.signal);
        latestChunk = i + 1;
        setCurrentChunk(i + 1);
        setStatusMessage(`正在翻譯 (第 ${i + 1}/${translationChunksCount} 部分)...`);
        
        let success = false;
        let retries = 0;
        const MAX_RETRIES = translationRetryLimit;
        let currentChunkTranslated = '';

        const systemInstruction = buildTranslationSystemInstruction({
          style: detectedStyle,
          glossary: dynamicGlossary,
          characterMap: dynamicCharacterMap,
          plotSummary: dynamicPlotSummary,
          previousSourceText,
          previousTranslatedText,
          customInstructions,
        });
        const promptText = buildTranslationPrompt(textChunks[i]);

        while (!success && retries < MAX_RETRIES) {
          try {
            throwIfAborted(translationController.signal);
            // Step 1: Draft Translation (Streaming)
            setStatusMessage(`正在翻譯初稿 (第 ${i + 1}/${translationChunksCount} 部分)...`);
            const responseStream = generateContentStreamWrapper({
              model: selectedModel,
              systemInstruction,
              promptText,
              temperature: 0.2
            });
            
            for await (const chunk of responseStream) {
              throwIfAborted(translationController.signal);
              const text = chunk.text || '';
              currentChunkTranslated += text;
              setTranslatedText(fullTranslatedText + currentChunkTranslated);
              if (chunk.usageMetadata) {
                recordUsage(chunk.usageMetadata, selectedModel, translationBudgetUsd);
              }
            }

            // Basic validation for translation: check if output is suspiciously short
            const sourceLength = textChunks[i].replace(/\s+/g, '').length;
            const targetLength = currentChunkTranslated.replace(/\s+/g, '').length;
            
            // For English to Chinese, the character count usually decreases.
            // We only trigger retry if the source is substantial and the target is extremely short.
            // Changed threshold from 0.05 to 0.02 to avoid false positives on concise translations or texts with lots of whitespace.
            if (sourceLength > 150 && targetLength < sourceLength * 0.02) {
              reportWarning('translation_length_validation_failed', {
                chunk: i + 1,
                sourceLength,
                targetLength,
              });
              if (retries < 2) {
                throw new Error("Translated text is suspiciously short. Possible omission.");
              } else {
                reportWarning('short_translation_accepted', { chunk: i + 1, retries });
              }
            }

            // Step 2: Self-Correction & Context Update
            setStatusMessage(`正在自我校對與更新術語 (第 ${i + 1}/${translationChunksCount} 部分)...`);
            
            const correctionResponse = await generateContentWrapper({
              model: selectedModel,
              promptText: buildCorrectionPrompt({
                sourceText: textChunks[i],
                draftTranslation: currentChunkTranslated,
                glossary: dynamicGlossary,
                characterMap: dynamicCharacterMap,
                customInstructions,
              }),
              temperature: 0,
              jsonMode: true
            });
            throwIfAborted(translationController.signal);

            if (correctionResponse.usageMetadata) {
              recordUsage(correctionResponse.usageMetadata, selectedModel, translationBudgetUsd);
            }

            try {
              const correctionResult = JSON.parse(correctionResponse.text || '{}');
              
              if (correctionResult.missingContentDetected) {
                reportWarning('translation_missing_content_detected', { chunk: i + 1, retries });
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
              reportWarning('correction_response_parse_failed', { chunk: i + 1 });
            }

            success = true;
          } catch (err: any) {
            if (err instanceof TranslationBudgetExceededError || isAbortError(err)) throw err;
            const errorMessage = err.message?.toLowerCase() || '';
            const status = err.status;
            
            if (status === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('suspiciously short')) {
              retries++;
              if (retries >= MAX_RETRIES) throw new Error(`翻譯失敗：模型輸出內容過短或達到 API 限制。(${err.message})`);
              
              const isShortError = errorMessage.includes('suspiciously short');
              const waitTime = isShortError ? 1 : retries * 5;
              
              setStatusMessage(isShortError ? `譯文長度異常，正在重新嘗試 (${retries}/${MAX_RETRIES})...` : `API 限制，等待 ${waitTime} 秒後重試...`);
              await abortableDelay(waitTime * 1000, translationController.signal);
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
          await abortableDelay(500, translationController.signal);
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
      const wasCancelled = translationCancelledRef.current || isAbortError(err);
      const budgetExceeded = err instanceof TranslationBudgetExceededError;
      if (wasCancelled) {
        showToast('翻譯已停止，完成的進度可以從歷史紀錄繼續。', 'success');
      } else if (budgetExceeded) {
        setError(`${err.message}。已安全停止並保留進度，調高上限後即可繼續。`);
        showToast('已達費用上限，翻譯進度已保留。', 'error');
      } else {
        reportError('translation_failed');
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
          status: wasCancelled || budgetExceeded ? 'translating' : 'error',
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
          reportWarning('translation_stop_state_save_failed');
        }
      }
    } finally {
      if (translationAbortControllerRef.current === translationController) {
        translationAbortControllerRef.current = null;
      }
      translationCancelledRef.current = false;
      setIsTranslating(false);
      setTranslationStage(null);
      setStatusMessage('');
    }
  };

  const handleCancelTranslation = () => {
    translationCancelledRef.current = true;
    translationAbortControllerRef.current?.abort();
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

      printElementToPdf(element, defaultTitle);

      showToast('請在列印對話框中選擇「另存為 PDF」', 'success');
    } catch (err: any) {
      reportError('pdf_export_failed');
      showToast(`生成 PDF 失敗: ${err.message}`, 'error');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const text = activeTab === 'translate' ? translatedText : extractedText;
    if (!text) return;
    
    const baseName = customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document';
    const defaultTitle = activeTab === 'translate' 
      ? `${baseName}_翻譯`
      : baseName;
    downloadMarkdown(text, `${defaultTitle}.md`);
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
      reportError('clipboard_copy_failed');
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
        fullText = await extractPdfText(file, (page, total, text) => {
          setStatusMessage(`提取文字中 (第 ${page}/${total} 頁)...`);
          setExtractedText(text);
        });
      }
      
      setStatusMessage('正在產生 EPUB...');
      const baseName = customTitle.trim() || file?.name.replace(/\.(pdf|md)$/i, '') || 'document';
      const titleToUse = baseName;
      
      const blob = await requestEpub({
        title: titleToUse,
        markdown: fullText,
        author: authorName || undefined,
        cover: coverImage || undefined,
      });
      downloadBlob(blob, `${titleToUse}.epub`);
      
      showToast('EPUB 轉換並下載成功！', 'success');
      setExtractedText(fullText);
      
    } catch (err: any) {
      reportError('pdf_to_epub_failed');
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

      const blob = await requestEpub({
        title: defaultTitle,
        markdown: text,
        author: authorName || undefined,
        cover: coverImage || undefined,
      });
      downloadBlob(blob, `${defaultTitle}.epub`);
      
      showToast('EPUB 下載成功！', 'success');
    } catch (err) {
      reportError('epub_download_failed');
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
      <AppToast toast={toast} onClose={() => setToast(null)} />

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
              data-testid="api-key-button"
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full text-sm font-medium transition-colors border border-slate-700 shadow-inner"
            >
              <Key className="w-4 h-4" />
              <span className="hidden sm:inline">API Key</span>
            </button>
            <button
              onClick={() => setShowHistory(true)}
              data-testid="history-button"
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
            data-testid="tab-translate"
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'translate' ? 'is-active text-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
          >
            PDF 翻譯
          </button>
          <button 
            onClick={() => setActiveTab('converter')}
            data-testid="tab-converter"
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
                <TranslationLimits
                  budgetUsd={translationBudgetUsd}
                  retryLimit={translationRetryLimit}
                  estimatedUsd={totalEstimatedCost}
                  onBudgetChange={setTranslationBudgetUsd}
                  onRetryLimitChange={setTranslationRetryLimit}
                />
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
                  data-testid="file-input"
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

      {showHistory && (
        <HistoryModal
          records={history}
          currentFileId={currentFileId}
          onClose={() => setShowHistory(false)}
          onLoad={handleLoadHistory}
          onRequestDelete={handleDeleteHistory}
        />
      )}

      {historyToDelete && (
        <DeleteHistoryDialog onCancel={() => setHistoryToDelete(null)} onConfirm={confirmDeleteHistory} />
      )}

      {showInfoModal && <InfoModal onClose={() => setShowInfoModal(false)} />}

      {showKeyModal && (
        <ApiKeyModal
          googleKey={manualApiKey}
          openaiKey={manualOpenaiApiKey}
          rememberOnDevice={rememberApiKeys}
          setGoogleKey={setManualApiKey}
          setOpenaiKey={setManualOpenaiApiKey}
          setRememberOnDevice={setRememberApiKeys}
          onClose={() => setShowKeyModal(false)}
          onSave={handleSaveApiKeys}
        />
      )}

    </div>
  );
}
