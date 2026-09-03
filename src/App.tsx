import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Book, X, Image as ImageIcon } from 'lucide-react';
import {
  saveHistory,
  getAllHistory,
  deleteHistory,
  HistoryRecord,
  HistoryStorageError,
  shouldCheckpointTranslationProgress,
} from './lib/db';
import { estimateTextTokens, splitMarkdownIntoTokenChunks } from './lib/text';
import { MAX_PDF_PAGES, validateUpload } from './lib/file-limits';
import { buildDocumentAnalysisPrompt, DOCUMENT_ANALYSIS_SCHEMA, parseDocumentAnalysis, sampleDocumentForAnalysis } from './lib/document-analysis';
import { DEFAULT_MODEL_ID, getModelConfig, MODELS } from './lib/models';
import { reportError, reportWarning } from './lib/diagnostics';
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
  buildExtractionPrompt,
  extractionSystemInstruction,
} from './lib/translation-prompts';
import AppToast, { type ToastMessage } from './components/AppToast';
import ApiKeyModal from './components/ApiKeyModal';
import { DeleteHistoryDialog, HistoryModal } from './components/HistoryDialogs';
import InfoModal from './components/InfoModal';
import ModelSelectionPanel from './components/ModelSelectionPanel';
import TranslationCostSummary from './components/TranslationCostSummary';
import { useBudgetedAiProviders } from './hooks/useBudgetedAiProviders';
import { downloadBlob, requestEpub } from './lib/browser-exports';
import { costProfile, forecastDocumentCost, normalizeCostSamples, type CostSample } from './lib/cost-forecast';
import { estimatePromptOverheads } from './lib/cost-prompts';
import { estimatePdfSourceTokens, extractPdfText } from './lib/pdf-text-extraction';
import {
  createLayeredDocumentMemory,
  formatLayeredDocumentMemory,
  getNewKnowledgeLines,
  mergeKnowledgeLines,
  updateLayeredDocumentMemory,
} from './lib/document-memory';
import TranslationQualitySettings from './components/TranslationQualitySettings';
import DocumentUploadDropzone from './components/DocumentUploadDropzone';
import {
  getDocumentTypeInstruction,
  normalizeDetectedDocumentType,
  normalizeDocumentType,
  resolveDocumentType,
  type DetectedDocumentType,
  type DocumentTypeId,
} from './lib/document-types';
import { useTranslationMachine } from './hooks/useTranslationMachine';
import { translateChunkWithQuality } from './lib/translation-runner';
import {
  buildChapterProofreadingPrompt,
  CHAPTER_PROOFREADING_SCHEMA,
  parseChapterProofreadingResult,
  decideChapterProofreading,
} from './lib/chapter-proofreading';
import { protectContent, restoreProtectedContent } from './lib/protected-content';
import { assessTranslationQuality } from './lib/translation-quality';
import { useDocumentExports } from './hooks/useDocumentExports';
import WorkspaceHeader from './components/WorkspaceHeader';
import TranslationActionPanel from './components/TranslationActionPanel';
import DocumentResultPanel from './components/DocumentResultPanel';
import {
  EMPTY_NOVEL_CONTINUITY,
  formatNovelContinuity,
  getNovelCanonicalGlossary,
  mergeNovelContinuity,
  normalizeNovelContinuity,
  seedNovelContinuity,
  type NovelContinuityMemory,
} from './lib/novel-continuity';
import {
  beginTranslationChunk,
  commitTranslationChunk,
  createTranslationProgress,
  pauseTranslationProgress,
} from './lib/translation-progress';

export default function App() {
  const [activeTab, setActiveTab] = useState<'translate' | 'converter'>('translate');
  const [customTitle, setCustomTitle] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [extractionComplete, setExtractionComplete] = useState(true);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [splitTranslation, setSplitTranslation] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [translationBudgetUsd, setTranslationBudgetUsd] = useState(DEFAULT_TRANSLATION_BUDGET_USD);
  const [translationRetryLimit, setTranslationRetryLimit] = useState(DEFAULT_TRANSLATION_RETRY_LIMIT);
  const [isCalculating, setIsCalculating] = useState(false);
  const translationMachine = useTranslationMachine();
  const isTranslating = translationMachine.isActive;
  const translationStage = translationMachine.state.stage;
  const [glossary, setGlossary] = useState<string>('');
  const [currentChunk, setCurrentChunk] = useState(0);
  const [completedCostChunks, setCompletedCostChunks] = useState(0);
  const [completedExtractionChunks, setCompletedExtractionChunks] = useState(0);
  const [costSamples, setCostSamples] = useState<CostSample[]>([]);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [inFlightStartUsd, setInFlightStartUsd] = useState<number | null>(null);
  const [totalChunks, setTotalChunks] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [translatedText, setTranslatedText] = useState('');
  const [translationStyle, setTranslationStyle] = useState<string | null>(null);
  const [characterMap, setCharacterMap] = useState<string>('');
  const [plotSummary, setPlotSummary] = useState<string>('');
  const [novelContinuity, setNovelContinuity] = useState<NovelContinuityMemory>(EMPTY_NOVEL_CONTINUITY);
  const statusMessage = translationMachine.state.statusMessage;
  const setStatusMessage = translationMachine.setStatus;
  const [documentType, setDocumentType] = useState<DocumentTypeId>('auto');
  const [resolvedDocumentType, setResolvedDocumentType] = useState<DetectedDocumentType | null>(null);
  const [chapterProofreading, setChapterProofreading] = useState(true);
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

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyStorageWarningShownRef = useRef(false);

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
    tokenAbortControllerRef.current?.abort();
    tokenWorkerTaskRef.current = null;
    setIsCalculating(false);
    setCurrentFileId(record.id);
    setCustomTitle(record.title);
    setAuthorName(record.author || '');
    setCoverImage(record.coverImage);
    setExtractedText(record.extractedText);
    setExtractionComplete(record.extractionComplete !== false);
    setSplitTranslation(record.splitTranslation !== false);
    setTranslatedText(record.translatedText);
    setCurrentChunk(record.currentChunk);
    setCompletedCostChunks(record.extractionComplete === false ? 0 : record.currentChunk);
    setCompletedExtractionChunks(0);
    setCostSamples(normalizeCostSamples(record.costSamples));
    setAnalysisComplete(record.currentChunk > 0);
    setInFlightStartUsd(null);
    setTotalChunks(record.totalChunks);
    const restoredModel = MODELS.some(model => model.id === record.model)
      ? record.model
      : DEFAULT_MODEL_ID;
    setSelectedModel(restoredModel);
    setTranslationStyle(record.translationStyle || null);
    setGlossary(record.glossaryText || '無');
    setCharacterMap(record.characterMap || '');
    setPlotSummary(record.plotSummary || '');
    setNovelContinuity(normalizeNovelContinuity(record.novelContinuity));
    restoreUsage(record.usageSnapshot);
    if (typeof record.budgetUsd === 'number' && Number.isFinite(record.budgetUsd)) setTranslationBudgetUsd(Math.max(0, record.budgetUsd));
    const restoredDocumentType = normalizeDocumentType(record.documentType);
    setDocumentType(restoredDocumentType);
    setResolvedDocumentType(
      normalizeDetectedDocumentType(record.effectiveDocumentType)
      ?? (restoredDocumentType === 'auto' ? null : restoredDocumentType),
    );
    setChapterProofreading(record.chapterProofreading !== false);

    setFile(null);
    setBase64Data(null);
    setTokenCount(record.extractionComplete === false ? null : estimateTextTokens(record.extractedText));

    setShowHistory(false);

    if (record.extractionComplete === false) {
      showToast('這份紀錄的 PDF 擷取尚未完成，請重新上傳原始 PDF；部分文字仍可下載。', 'error');
    } else if (!record.usageSnapshot) {
      showToast('舊紀錄未保存費用，後續累積成本不含先前用量。', 'success');
    } else if (record.status === 'translating' || record.status === 'error') {
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
      setCompletedCostChunks(0);
      setCostSamples([]);
      setAnalysisComplete(false);
      setTokenCount(null);
      setTotalChunks(0);
      setCustomTitle('');
      setNovelContinuity(EMPTY_NOVEL_CONTINUITY);
      resetUsage();
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
  const {
    isCopying,
    isDownloadingEpub,
    isDownloadingPdf,
    copyText: handleCopyText,
    downloadEpub,
    downloadMarkdownFile: handleDownloadMarkdown,
    downloadPdf,
  } = useDocumentExports({
    activeTab,
    file,
    customTitle,
    authorName,
    coverImage,
    translatedText,
    extractedText,
    isIframe,
    showToast,
  });
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
  const pdfWorkerRef = useRef<Worker | null>(null);
  const tokenWorkerTaskRef = useRef<string | null>(null);
  const extractionWorkerTaskRef = useRef<string | null>(null);
  const translationCancelledRef = useRef(false);
  const translationAbortControllerRef = useRef<AbortController | null>(null);
  const tokenAbortControllerRef = useRef<AbortController | null>(null);
  const {
    inputTokens: actualInputTokens,
    cachedInputTokens: actualCachedInputTokens,
    cacheWriteInputTokens: actualCacheWriteInputTokens,
    outputTokens: actualOutputTokens,
    reasoningTokens: actualReasoningTokens,
    actualCost,
    costBreakdown,
    resetUsage,
    restoreUsage,
    recordUsage,
    getUsageSnapshot,
    generateContent: generateContentWrapper,
    generateContentStream: generateContentStreamWrapper,
  } = useBudgetedAiProviders({
    googleApiKey: isManualKeyActive ? manualApiKey : undefined,
    openaiApiKey: isOpenaiKeyActive ? manualOpenaiApiKey : undefined,
    budgetUsd: translationBudgetUsd,
    getSignal: () => translationAbortControllerRef.current?.signal,
  });

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
      void calculateTokens(file);
    }
    return () => {
      tokenAbortControllerRef.current?.abort();
      const requestId = tokenWorkerTaskRef.current;
      if (requestId) {
        pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId } });
        tokenWorkerTaskRef.current = null;
      }
    };
  }, [base64Data, file]);

  const handleFileUpload = (selectedFile: File) => {
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
      setExtractionComplete(isMd);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '檔案格式或大小不符合限制。');
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
    setCompletedCostChunks(0);
    setCostSamples([]);
    setCompletedExtractionChunks(0);
    setAnalysisComplete(false);
    setInFlightStartUsd(null);
    setCurrentFileId(null);
    setCoverImage(null);
    setAuthorName('');
    setCurrentChunk(0);
    setTotalChunks(0);
    setTranslationStyle(null);
    setGlossary('無');
    setCharacterMap('');
    setPlotSummary('');
    setNovelContinuity(EMPTY_NOVEL_CONTINUITY);
    setResolvedDocumentType(null);
    setCustomTitle('');
    resetUsage();

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

  const calculateTokens = async (sourceFile: File) => {
    const requestId = crypto.randomUUID();
    tokenAbortControllerRef.current?.abort();
    const controller = new AbortController();
    tokenAbortControllerRef.current = controller;
    tokenWorkerTaskRef.current = requestId;
    setIsCalculating(true);
    const isCurrent = () => tokenWorkerTaskRef.current === requestId && !controller.signal.aborted;
    try {
      const estimate = sourceFile.name.toLowerCase().endsWith('.md')
        ? estimateTextTokens(await sourceFile.text())
        : await estimatePdfSourceTokens(sourceFile, total => {
          if (isCurrent()) setTotalPages(total);
        }, controller.signal);
      if (isCurrent()) setTokenCount(estimate);
    } catch (err) {
      if (isCurrent() && !isAbortError(err)) {
        reportWarning('source_token_estimate_unavailable');
        setTokenCount(null);
      }
    } finally {
      if (tokenWorkerTaskRef.current === requestId) {
        tokenWorkerTaskRef.current = null;
        setIsCalculating(false);
      }
      if (tokenAbortControllerRef.current === controller) tokenAbortControllerRef.current = null;
    }
  };

  const handleTranslate = async () => {
    if (!extractedText && (!file || !base64Data)) return;
    if (!extractionComplete && !file) {
      setError('PDF 文字擷取尚未完成，請重新上傳原始 PDF，避免只翻譯部分文件。');
      return;
    }

    const activeModel = getModelConfig(selectedModel);
    let startingChunk = currentChunk;
    let startsNewDocumentRun = startingChunk === 0 && !currentFileId;
    if (currentChunk === totalChunks && totalChunks > 0) {
      startingChunk = 0;
      startsNewDocumentRun = true;
    }

    const preflight = forecastDocumentCost({
      ...forecastOptions,
      spentUsd: startsNewDocumentRun ? 0 : actualCost.totalUsd,
      remainingTokens: startingChunk === 0 ? tokenCount : forecastOptions.remainingTokens,
      remainingChunks: startingChunk === 0 ? sourceChunkTokens.length || estimatedSourceChunks : forecastOptions.remainingChunks,
      analysisComplete: startingChunk > 0 && analysisComplete,
      samples: startsNewDocumentRun ? [] : costSamples,
      inFlightUsd: 0,
    });
    if (preflight.known && translationBudgetUsd > 0 && preflight.totalUsd > translationBudgetUsd) {
      setError(`預估完成後整份文件約 $${preflight.totalUsd.toFixed(2)} USD（規劃範圍 $${preflight.lowUsd.toFixed(2)}–$${preflight.highUsd.toFixed(2)}），超過目前 $${translationBudgetUsd.toFixed(2)} USD 上限。請調高文件上限或選擇較省成本的模型；估算不代表帳單保證。`);
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

    if (startsNewDocumentRun) {
      resetUsage();
      setCostSamples([]);
    }
    setCompletedCostChunks(startingChunk);
    setCompletedExtractionChunks(0);
    if (startingChunk === 0) setAnalysisComplete(false);
    translationAbortControllerRef.current?.abort();
    const translationController = new AbortController();
    translationAbortControllerRef.current = translationController;
    translationCancelledRef.current = false;
    translationMachine.start(extractedText && startingChunk > 0 ? 'translating' : 'extracting');
    if (startingChunk === 0) {
      setCurrentChunk(0);
      setTranslatedText('');
      setTranslationStyle(null);
      setGlossary('無');
      setCharacterMap('');
      setPlotSummary('');
      setNovelContinuity(EMPTY_NOVEL_CONTINUITY);
      setResolvedDocumentType(null);
    }
    setStatusMessage('');
    setError(null);
    const currentStartTime = Date.now();
    setStartTime(currentStartTime);
    setEstimatedRemainingTime(null);
    const fileId = currentFileId || crypto.randomUUID();
    let latestCostSamples = startsNewDocumentRun ? [] : normalizeCostSamples(costSamples);
    let latestExtractedText = extractedText;
    let latestTranslatedText = startingChunk > 0 ? translatedText : '';
    let latestExtractionComplete = extractionComplete;
    let latestProgress = createTranslationProgress(startingChunk);
    let latestTotalChunks = totalChunks;
    let latestTranslationStyle = startingChunk === 0 ? null : translationStyle;
    let latestGlossary = startingChunk === 0 ? '無' : glossary;
    let latestCharacterMap = startingChunk === 0 ? '' : characterMap;
    let latestPlotSummary = startingChunk === 0 ? '' : plotSummary;
    let latestNovelContinuity = startingChunk === 0
      ? { ...EMPTY_NOVEL_CONTINUITY, entities: [], timeline: [] }
      : normalizeNovelContinuity(novelContinuity);
    let latestEffectiveDocumentType = startingChunk === 0 ? null : resolvedDocumentType;
    let chunkMemoryCheckpoint: {
      glossary: string;
      characters: string;
      summary: string;
      novel: NovelContinuityMemory;
    } | null = null;

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
        pruneHistory = true,
      ) => {
        const record: HistoryRecord = {
          id: fileId,
          title: customTitle || file?.name || 'Untitled',
          author: authorName,
          coverImage: coverImage,
          extractedText: extracted,
          extractionComplete: latestExtractionComplete,
          splitTranslation,
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
          documentType,
          effectiveDocumentType: latestEffectiveDocumentType || undefined,
          chapterProofreading,
          novelContinuity: latestNovelContinuity,
          usageSnapshot: getUsageSnapshot(),
          costSamples: latestCostSamples,
          budgetUsd: translationBudgetUsd,
        };
        try {
          await saveHistory(record, { prune: pruneHistory });
          if (status === 'completed' || pruneHistory) {
            void loadHistory();
          }
        } catch (historyError) {
          reportWarning('translation_progress_save_failed');
          if (historyError instanceof HistoryStorageError && !historyStorageWarningShownRef.current) {
            historyStorageWarningShownRef.current = true;
            showToast(historyError.message, 'error');
          }
        }
      };

      let fullMarkdown = '';
      const isMd = file?.name?.toLowerCase().endsWith('.md');

      if (isMd || (extractedText && extractionComplete)) {
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
                      temperature: 0.1,
                      maxOutputTokens: 8_192,
                    });
                    if (translationCancelledRef.current) throw new Error('PDF 處理已取消');

                    if (response.usageMetadata) {
                      recordUsage(response.usageMetadata, selectedModel, translationBudgetUsd, 'extraction');
                    }

                    results[index] = response.text || '';
                    success = true;
                  } catch (err) {
                    if (err instanceof TranslationBudgetExceededError || isAbortError(err)) throw err;
                    reportWarning('pdf_extraction_chunk_failed', { chunk: index + 1, attempt: retries + 1 });
                    retries++;
                    if (retries >= MAX_RETRIES) {
                      throw err;
                    }
                    await abortableDelay(1000 * retries, translationController.signal);
                  }
                }

                completedExtractions++;
                setCompletedExtractionChunks(completedExtractions);
                setCurrentChunk(completedExtractions);
                setStatusMessage(`正在提取文字 (已完成 ${completedExtractions}/${totalExtractionChunks} 部分)...`);
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
      latestExtractionComplete = true;
      setExtractionComplete(true);
      // Replace upload estimates with the actual translation source, not PDF bytes/modalities.
      tokenAbortControllerRef.current?.abort();
      tokenWorkerTaskRef.current = null;
      setIsCalculating(false);
      setTokenCount(estimateTextTokens(fullMarkdown));

      // --- STAGE 1.5: GLOSSARY GENERATION & STYLE ANALYSIS ---
      let glossaryText = glossary;
      let detectedStyle = translationStyle || '一般/通用';
      let detectedCharacters = characterMap;
      let globalSummary = '';
      let detectedDocumentType: DetectedDocumentType = latestEffectiveDocumentType ?? 'general';

      const needsDocumentAnalysis = startingChunk === 0 || (documentType === 'auto' && !latestEffectiveDocumentType);
      if (needsDocumentAnalysis) {
        translationMachine.transition('analyzing');
        setStatusMessage('正在提取專業術語、角色關係與分析文本風格...');

        try {
          const analysisResponse = await generateContentWrapper({
            model: selectedModel,
            promptText: buildDocumentAnalysisPrompt(fullMarkdown),
            temperature: 0,
            maxOutputTokens: 4_096,
            jsonSchema: DOCUMENT_ANALYSIS_SCHEMA,
          });
          if (analysisResponse.usageMetadata) {
            recordUsage(analysisResponse.usageMetadata, selectedModel, translationBudgetUsd, 'analysis');
          }

          const analysis = parseDocumentAnalysis(analysisResponse.text || '');
          glossaryText = analysis.glossary;
          detectedCharacters = analysis.characterMap;
          detectedStyle = analysis.styleGuide;
          globalSummary = analysis.globalSummary;
          detectedDocumentType = analysis.documentType;

          setTranslationStyle(detectedStyle);
          setGlossary(glossaryText);
          setCharacterMap(detectedCharacters);
          latestTranslationStyle = detectedStyle;
          latestGlossary = glossaryText;
          latestCharacterMap = detectedCharacters;
          latestNovelContinuity = seedNovelContinuity(detectedCharacters);
          setNovelContinuity(latestNovelContinuity);
        } catch (err) {
          if (err instanceof TranslationBudgetExceededError || isAbortError(err)) throw err;
          reportWarning('document_analysis_failed');
          setTranslationStyle('一般/通用');
          setGlossary('無');
          setCharacterMap('無');
        }
      }

      setAnalysisComplete(true);

      // --- STAGE 2: TRANSLATION ---
      translationMachine.transition('translating');
      setStatusMessage('正在準備翻譯...');
      // Prefer Markdown boundaries and a provider-independent token budget so
      // headings, tables, and fenced code are not split by raw character count.
      const textChunks = splitTranslation ? splitMarkdownIntoTokenChunks(fullMarkdown, 1800) : [fullMarkdown];
      const translationChunksCount = textChunks.length;
      if (startingChunk > 0 && translationChunksCount !== totalChunks) {
        throw new Error('文件分段設定與已保存進度不同，請恢復原分段設定後再繼續。');
      }
      latestTotalChunks = translationChunksCount;
      setTotalChunks(translationChunksCount);

      let fullTranslatedText = latestTranslatedText;
      let previousTranslatedText = latestTranslatedText.slice(-1000);

      // Start from the current chunk if resuming
      const startChunk = startingChunk;
      let previousSourceText = startChunk > 0 ? textChunks[startChunk - 1].slice(-1000) : '';
      let dynamicGlossary = glossaryText;
      let dynamicCharacterMap = detectedCharacters;
      let layeredMemory = createLayeredDocumentMemory(globalSummary, startChunk > 0 ? plotSummary : '');
      const effectiveDocumentType = resolveDocumentType(documentType, detectedDocumentType);
      latestEffectiveDocumentType = effectiveDocumentType;
      setResolvedDocumentType(effectiveDocumentType);
      if (effectiveDocumentType === 'novel' && latestNovelContinuity.entities.length === 0) {
        latestNovelContinuity = seedNovelContinuity(dynamicCharacterMap, startChunk);
        setNovelContinuity(latestNovelContinuity);
      }
      const formatWorkingMemory = () => [
        formatLayeredDocumentMemory(layeredMemory),
        effectiveDocumentType === 'novel' ? formatNovelContinuity(latestNovelContinuity) : '',
      ].filter(Boolean).join('\n\n');
      let dynamicPlotSummary = formatWorkingMemory();
      const documentTypeInstruction = getDocumentTypeInstruction(effectiveDocumentType);
      let chapterSourceChunks: string[] = [];
      let chapterTranslatedChunks: string[] = [];
      let chapterStartOffset = fullTranslatedText.length;
      let chapterNewTermCount = 0;
      let chapterNewCharacterCount = 0;
      let chapterQualityWarningCount = 0;

      for (let i = startChunk; i < translationChunksCount; i++) {
        throwIfAborted(translationController.signal);
        chunkMemoryCheckpoint = {
          glossary: latestGlossary,
          characters: latestCharacterMap,
          summary: latestPlotSummary,
          novel: latestNovelContinuity,
        };
        const chunkStartUsage = getUsageSnapshot();
        const chunkStartUsd = chunkStartUsage.inputUsd + chunkStartUsage.outputUsd;
        setInFlightStartUsd(chunkStartUsd);
        latestProgress = beginTranslationChunk(latestProgress, i);
        setCurrentChunk(i + 1);
        setStatusMessage(`正在翻譯 (第 ${i + 1}/${translationChunksCount} 部分)...`);
        const result = await translateChunkWithQuality({
          sourceText: textChunks[i],
          model: selectedModel,
          chunkNumber: i + 1,
          totalChunks: translationChunksCount,
          retryLimit: translationRetryLimit,
          style: detectedStyle,
          glossary: dynamicGlossary,
          characterMap: dynamicCharacterMap,
          plotSummary: dynamicPlotSummary,
          previousSourceText,
          previousTranslatedText,
          customInstructions,
          documentTypeInstruction,
          documentType: effectiveDocumentType,
          signal: translationController.signal,
          generate: generateContentWrapper,
          generateStream: generateContentStreamWrapper,
          onUsage: (usage, billedModel, stage) => recordUsage(usage, billedModel, translationBudgetUsd, stage),
          onPreview: (preview) => setTranslatedText(fullTranslatedText + preview),
          onStage: (stage, message) => translationMachine.transition(stage, message),
          onWarning: reportWarning,
        });
        let currentChunkTranslated = result.translatedText;
        const addedTerms = getNewKnowledgeLines(dynamicGlossary, result.newTerms);
        const addedCharacters = getNewKnowledgeLines(dynamicCharacterMap, result.newCharacters);

        if (addedTerms.length > 0) {
          dynamicGlossary = mergeKnowledgeLines(dynamicGlossary, addedTerms);
          setGlossary(dynamicGlossary);
          latestGlossary = dynamicGlossary;
        }
        if (addedCharacters.length > 0) {
          dynamicCharacterMap = mergeKnowledgeLines(dynamicCharacterMap, addedCharacters);
          setCharacterMap(dynamicCharacterMap);
          latestCharacterMap = dynamicCharacterMap;
        }
        if (result.chunkSummary) {
          layeredMemory = updateLayeredDocumentMemory(layeredMemory, result.chunkSummary, textChunks[i]);
          latestPlotSummary = formatLayeredDocumentMemory(layeredMemory);
          setPlotSummary(latestPlotSummary);
        }
        if (effectiveDocumentType === 'novel') {
          const continuityUpdate = mergeNovelContinuity(latestNovelContinuity, {
            characterLines: result.newCharacters,
            chunk: i + 1,
            chunkSummary: result.chunkSummary,
            sourceChunk: textChunks[i],
          });
          latestNovelContinuity = continuityUpdate.memory;
          setNovelContinuity(latestNovelContinuity);
          dynamicGlossary = mergeKnowledgeLines(dynamicGlossary, getNovelCanonicalGlossary(latestNovelContinuity));
          latestGlossary = dynamicGlossary;
          setGlossary(dynamicGlossary);
          if (continuityUpdate.conflicts.length) {
            reportWarning('novel_continuity_conflict', {
              chunk: i + 1,
              count: continuityUpdate.conflicts.length,
            });
          }
        }
        dynamicPlotSummary = formatWorkingMemory();

        fullTranslatedText += currentChunkTranslated + '\n\n';
        if (chapterProofreading) {
          chapterSourceChunks.push(textChunks[i]);
          chapterTranslatedChunks.push(currentChunkTranslated);
          chapterNewTermCount += addedTerms.length;
          chapterNewCharacterCount += addedCharacters.length;
          const chunkQuality = assessTranslationQuality(textChunks[i], currentChunkTranslated, { documentType: effectiveDocumentType });
          chapterQualityWarningCount += chunkQuality.issues.filter((issue) => issue.severity === 'warning').length;
        }

        const chapterDecision = chapterProofreading ? decideChapterProofreading({
          chunks: textChunks,
          index: i,
          chapterChunkCount: chapterSourceChunks.length,
          documentType: effectiveDocumentType,
          newTermCount: chapterNewTermCount,
          newCharacterCount: chapterNewCharacterCount,
          qualityWarningCount: chapterQualityWarningCount,
        }) : null;

        if (chapterDecision?.shouldReview) {
          translationMachine.transition('chapter_review', `正在進行章節一致性校稿 (至第 ${i + 1}/${translationChunksCount} 部分)...`);
          const sourceChapter = chapterSourceChunks.join('\n\n');
          const translatedChapter = chapterTranslatedChunks.join('\n\n');
          const protectedChapter = protectContent(translatedChapter);
          try {
            const reviewResponse = await generateContentWrapper({
              model: selectedModel,
              promptText: buildChapterProofreadingPrompt({
                sourceChapter,
                translatedChapter: protectedChapter.text,
                documentType: effectiveDocumentType,
                style: detectedStyle,
                glossary: dynamicGlossary,
                characterMap: [
                  dynamicCharacterMap,
                  effectiveDocumentType === 'novel' ? formatNovelContinuity(latestNovelContinuity) : '',
                ].filter(Boolean).join('\n\n'),
              }),
              temperature: 0,
              maxOutputTokens: 16_384,
              jsonSchema: CHAPTER_PROOFREADING_SCHEMA,
            });
            if (reviewResponse.usageMetadata) recordUsage(reviewResponse.usageMetadata, selectedModel, translationBudgetUsd, 'chapter_review');
            const review = parseChapterProofreadingResult(reviewResponse.text || '{}');
            const restored = restoreProtectedContent(review.correctedChapter, protectedChapter.entries);
            const reviewQuality = assessTranslationQuality(sourceChapter, restored.text, { documentType: effectiveDocumentType });
            if (restored.missing.length || restored.unknown.length || restored.duplicates.length || restored.outOfOrder || reviewQuality.blocking) {
              throw new Error('Chapter review failed completeness checks');
            }
            fullTranslatedText = `${fullTranslatedText.slice(0, chapterStartOffset)}${restored.text}\n\n`;
            currentChunkTranslated = restored.text.slice(-Math.max(1000, currentChunkTranslated.length));
            dynamicGlossary = mergeKnowledgeLines(dynamicGlossary, review.newTerms);
            dynamicCharacterMap = mergeKnowledgeLines(dynamicCharacterMap, review.newCharacters);
            setGlossary(dynamicGlossary);
            setCharacterMap(dynamicCharacterMap);
            latestGlossary = dynamicGlossary;
            latestCharacterMap = dynamicCharacterMap;
            if (effectiveDocumentType === 'novel') {
              const continuityUpdate = mergeNovelContinuity(latestNovelContinuity, {
                characterLines: review.newCharacters,
                chunk: i + 1,
                sourceChunk: sourceChapter,
              });
              latestNovelContinuity = continuityUpdate.memory;
              setNovelContinuity(latestNovelContinuity);
              dynamicGlossary = mergeKnowledgeLines(dynamicGlossary, getNovelCanonicalGlossary(latestNovelContinuity));
              latestGlossary = dynamicGlossary;
              setGlossary(dynamicGlossary);
              dynamicPlotSummary = formatWorkingMemory();
            }
          } catch (reviewError) {
            if (reviewError instanceof TranslationBudgetExceededError || isAbortError(reviewError)) throw reviewError;
            reportWarning('chapter_proofreading_failed', { chunk: i + 1 });
          }
        }
        if (chapterDecision?.boundary) {
          if (!chapterDecision.shouldReview) reportWarning('chapter_proofreading_skipped_low_risk', { chunk: i + 1 });
          chapterSourceChunks = [];
          chapterTranslatedChunks = [];
          chapterStartOffset = fullTranslatedText.length;
          chapterNewTermCount = 0;
          chapterNewCharacterCount = 0;
          chapterQualityWarningCount = 0;
        }

        latestTranslatedText = fullTranslatedText;
        latestProgress = commitTranslationChunk(latestProgress, i);
        const chunkEndUsage = getUsageSnapshot();
        const chunkUsd = Math.max(0, chunkEndUsage.inputUsd + chunkEndUsage.outputUsd - chunkStartUsd);
        if (chunkUsd > 0) latestCostSamples = normalizeCostSamples([...latestCostSamples, {
          profile: costProfile(selectedModel, effectiveDocumentType, chapterProofreading, translationRetryLimit, customInstructions),
          sourceTokens: estimateTextTokens(textChunks[i]), costUsd: chunkUsd,
        }]);
        setCostSamples(latestCostSamples);
        setCompletedCostChunks(i + 1);
        setInFlightStartUsd(null);
        chunkMemoryCheckpoint = null;
        setTranslatedText(fullTranslatedText);
        previousTranslatedText = currentChunkTranslated.slice(-1000); // Keep last 1000 chars for context
        previousSourceText = textChunks[i].slice(-1000);

        // Save progress to IndexedDB
        if (shouldCheckpointTranslationProgress(i + 1, translationChunksCount)) {
          await saveCurrentState(
            'translating',
            i + 1,
            translationChunksCount,
            fullMarkdown,
            fullTranslatedText,
            detectedStyle,
            dynamicGlossary,
            dynamicCharacterMap,
            latestPlotSummary,
            i === 0,
          );
        }

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

      translationMachine.transition('saving', '正在儲存完成的翻譯...');
      await saveCurrentState(
        'completed',
        translationChunksCount,
        translationChunksCount,
        fullMarkdown,
        fullTranslatedText,
        detectedStyle,
        dynamicGlossary,
        dynamicCharacterMap,
        latestPlotSummary,
      );

      if (fullTranslatedText && autoDownload !== 'none') {
        setPendingDownload(autoDownload);
      }
      translationMachine.transition('completed', '');

    } catch (err: any) {
      if (chunkMemoryCheckpoint) {
        latestGlossary = chunkMemoryCheckpoint.glossary;
        latestCharacterMap = chunkMemoryCheckpoint.characters;
        latestPlotSummary = chunkMemoryCheckpoint.summary;
        latestNovelContinuity = chunkMemoryCheckpoint.novel;
      }
      setTranslatedText(latestTranslatedText);
      setGlossary(latestGlossary);
      setCharacterMap(latestCharacterMap);
      setPlotSummary(latestPlotSummary);
      setNovelContinuity(latestNovelContinuity);
      const wasCancelled = translationCancelledRef.current || isAbortError(err);
      const budgetExceeded = err instanceof TranslationBudgetExceededError;
      if (wasCancelled) {
        translationMachine.transition('paused', '');
        showToast('翻譯已停止，完成的進度可以從歷史紀錄繼續。', 'success');
      } else if (budgetExceeded) {
        translationMachine.transition('paused', '');
        setError(`${err.message}。已安全停止並保留進度，調高上限後即可繼續。`);
        showToast('已達費用上限，翻譯進度已保留。', 'error');
      } else {
        translationMachine.fail(err.message || '翻譯失敗');
        reportError('translation_failed');
        setError(`翻譯失敗 (Translation failed): ${err.message}`);
      }
      const resumableProgress = pauseTranslationProgress(latestProgress);
      setCurrentChunk(resumableProgress.completedChunks);
      setCompletedCostChunks(resumableProgress.completedChunks);
      // An unfinished first chunk will cause document analysis to run again on resume.
      if (resumableProgress.completedChunks === 0) setAnalysisComplete(false);
      if (!latestExtractionComplete) {
        setCompletedExtractionChunks(0);
        setError('PDF 擷取尚未完成，已保留部分文字與已發生費用。可在本頁重試；重新載入紀錄後需重新上傳原始 PDF。');
      }
      if (fileId) {
        const record: HistoryRecord = {
          id: fileId,
          title: customTitle || file?.name || 'Untitled',
          author: authorName,
          coverImage: coverImage,
          extractedText: latestExtractedText,
          extractionComplete: latestExtractionComplete,
          splitTranslation,
          translatedText: latestTranslatedText,
          currentChunk: resumableProgress.completedChunks,
          totalChunks: latestTotalChunks,
          status: wasCancelled || budgetExceeded ? 'translating' : 'error',
          timestamp: Date.now(),
          model: selectedModel,
          translationStyle: latestTranslationStyle || undefined,
          glossaryText: latestGlossary || undefined,
          characterMap: latestCharacterMap || undefined,
          plotSummary: latestPlotSummary || undefined,
          documentType,
          effectiveDocumentType: latestEffectiveDocumentType || undefined,
          chapterProofreading,
          novelContinuity: latestNovelContinuity,
          usageSnapshot: getUsageSnapshot(),
          costSamples: latestCostSamples,
          budgetUsd: translationBudgetUsd,
        };
        try {
          await saveHistory(record);
          void loadHistory();
        } catch (historyError) {
          reportWarning('translation_stop_state_save_failed');
        }
      }
    } finally {
      setInFlightStartUsd(null);
      if (translationAbortControllerRef.current === translationController) {
        translationAbortControllerRef.current = null;
      }
      translationCancelledRef.current = false;
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

  const selectedModelData = getModelConfig(selectedModel);

  // Cache book segmentation; streaming preview updates must not rescan the entire book.
  const sourceChunkTokens = useMemo(() => extractionComplete && extractedText
    ? (splitTranslation ? splitMarkdownIntoTokenChunks(extractedText, 1800) : [extractedText]).map(estimateTextTokens)
    : [], [extractionComplete, extractedText, splitTranslation]);
  const estimatedSourceChunks = tokenCount ? (splitTranslation ? Math.ceil(tokenCount / 1800) : 1) : 0;
  const remainingSourceTokens = sourceChunkTokens.length
    ? sourceChunkTokens.slice(completedCostChunks).reduce((sum, tokens) => sum + tokens, 0) : tokenCount;
  const memoryTokens = useMemo(() => estimateTextTokens([
    translationStyle, glossary, characterMap, plotSummary, customInstructions,
    formatNovelContinuity(novelContinuity),
  ].filter(Boolean).join('\n')), [translationStyle, glossary, characterMap, plotSummary, customInstructions, novelContinuity]);
  const forecastDocumentType = resolveDocumentType(documentType, resolvedDocumentType ?? 'general');
  const analysisSourceTokens = useMemo(() => extractionComplete && extractedText
    ? estimateTextTokens(sampleDocumentForAnalysis(extractedText)) : undefined, [extractionComplete, extractedText]);
  const promptOverheads = useMemo(() => estimatePromptOverheads({
    style: translationStyle || '一般/通用', glossary: glossary || '無', characterMap: characterMap || '無',
    plotSummary: [plotSummary, formatNovelContinuity(novelContinuity)].filter(Boolean).join('\n'),
    customInstructions, documentType: forecastDocumentType,
  }), [translationStyle, glossary, characterMap, plotSummary, novelContinuity, customInstructions, forecastDocumentType]);
  const forecastOptions = {
    model: selectedModel, documentTokens: tokenCount, remainingTokens: remainingSourceTokens,
    remainingChunks: sourceChunkTokens.length ? Math.max(0, sourceChunkTokens.length - completedCostChunks) : estimatedSourceChunks,
    extractionComplete, analysisComplete, chapterReview: chapterProofreading,
    documentType: forecastDocumentType, promptOverheads, analysisSourceTokens,
    extractionChunks: totalPages > 0 ? Math.ceil(totalPages / 5) : undefined,
    remainingExtractionRatio: totalPages > 0 ? 1 - completedExtractionChunks / Math.ceil(totalPages / 5) : 1,
    currentChunkTokens: sourceChunkTokens[completedCostChunks],
    retryLimit: translationRetryLimit, memoryTokens, customInstructions,
    spentUsd: actualCost.totalUsd, samples: costSamples,
    inFlightUsd: inFlightStartUsd === null ? 0 : Math.max(0, actualCost.totalUsd - inFlightStartUsd),
  };
  const costForecast = forecastDocumentCost(forecastOptions);
  const actualUsage = {
    inputTokens: actualInputTokens,
    cachedInputTokens: actualCachedInputTokens,
    cacheWriteInputTokens: actualCacheWriteInputTokens,
    outputTokens: actualOutputTokens,
    reasoningTokens: actualReasoningTokens,
  };
  return (
    <div className="app-shell min-h-screen bg-slate-950 text-slate-100 font-sans">
      <AppToast toast={toast} onClose={() => setToast(null)} />

      <WorkspaceHeader
        isIframe={isIframe}
        provider={selectedModelData.provider}
        hasGoogleKey={isManualKeyActive}
        hasOpenaiKey={isOpenaiKeyActive}
        onShowInfo={() => setShowInfoModal(true)}
        onShowKeys={() => setShowKeyModal(true)}
        onShowHistory={() => setShowHistory(true)}
      />

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
              <ModelSelectionPanel
                selectedModel={selectedModel}
                selectedModelData={selectedModelData}
                disabled={isTranslating}
                budgetUsd={translationBudgetUsd}
                spentUsd={actualCost.totalUsd}
                retryLimit={translationRetryLimit}
                estimatedUsd={costForecast.remainingUsd}
                onModelChange={setSelectedModel}
                onBudgetChange={setTranslationBudgetUsd}
                onRetryLimitChange={setTranslationRetryLimit}
              />
            )}

            <div className="app-card upload-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
              <div className="section-heading">
                <div className="step-badge">
                  {activeTab === 'translate' ? '2' : '1'}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-200">上傳文件</h2>
                  <p className="text-xs text-slate-500 mt-0.5">支援 PDF 與 Markdown</p>
                </div>
              </div>

              <DocumentUploadDropzone file={file} totalPages={totalPages} onFile={handleFileUpload} />

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

              {activeTab === 'translate' && (file || extractedText) && (
                <TranslationCostSummary
                  isCalculating={isCalculating}
                  documentTokens={tokenCount}
                  forecast={costForecast}
                  costBreakdown={costBreakdown}
                  actualUsage={actualUsage}
                  actualCost={actualCost}
                />
              )}
            </div>

            {activeTab === 'converter' && (
              <div className="app-card converter-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
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
              <div className="app-card preferences-card bg-slate-900 p-6 rounded-2xl shadow-lg shadow-black/20 border border-slate-800">
                <div className="section-heading">
                  <div className="step-badge">3</div>
                  <div><h2 className="text-lg font-semibold text-slate-200">翻譯偏好</h2><p className="text-xs text-slate-500 mt-0.5">有特別需求再填寫即可</p></div>
                </div>
                <div className="space-y-4">
                  <TranslationQualitySettings
                    documentType={documentType}
                    chapterProofreading={chapterProofreading}
                    disabled={isTranslating}
                    onDocumentTypeChange={setDocumentType}
                    onChapterProofreadingChange={setChapterProofreading}
                  />
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

            <TranslationActionPanel
              activeTab={activeTab}
              canTranslate={activeTab === 'translate' ? Boolean(file || extractedText) : Boolean(file)}
              isCalculating={isCalculating}
              isTranslating={isTranslating}
              isExtracting={isExtracting}
              statusMessage={statusMessage}
              totalChunks={totalChunks}
              currentChunk={currentChunk}
              translationStage={translationStage}
              estimatedRemainingTime={estimatedRemainingTime}
              translationStyle={translationStyle}
              error={error}
              onTranslate={handleTranslate}
              onCancel={handleCancelTranslation}
              onConvert={handlePdfToEpub}
            />

          </div>

          <DocumentResultPanel
            activeTab={activeTab}
            translatedText={translatedText}
            extractedText={extractedText}
            isTranslating={isTranslating}
            isExtracting={isExtracting}
            isCopying={isCopying}
            isDownloadingEpub={isDownloadingEpub}
            isDownloadingPdf={isDownloadingPdf}
            statusMessage={statusMessage}
            translationStage={translationStage}
            onCopy={handleCopyText}
            onDownloadEpub={() => downloadEpub()}
            onDownloadMarkdown={handleDownloadMarkdown}
            onDownloadPdf={downloadPdf}
          />

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
