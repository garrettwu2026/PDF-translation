import { useDocumentConverter } from './useDocumentConverter';
import { useSourceTokenEstimate } from './useSourceTokenEstimate';
import { useApiKeySettings } from './useApiKeySettings';
import { useDocumentCostForecast } from './useDocumentCostForecast';
import { extractTranslationPdf } from '../lib/extract-translation-pdf';
import { reviewTranslatedChapter } from '../lib/review-translated-chapter';
import { contentDigest } from '../lib/request-integrity';
import { acquireDocumentLock } from '../lib/document-lock';
import { getHistory } from '../lib/db';
import React, { useState, useRef, useEffect } from 'react';
import { saveHistory, getAllHistory, deleteHistory, HistoryRecord, HistoryStorageError } from '../lib/db';
import { estimateTextTokens, splitMarkdownIntoTokenChunks } from '../lib/text';
import { validateUpload } from '../lib/file-limits';
import { buildDocumentAnalysisPrompt, DOCUMENT_ANALYSIS_SCHEMA, parseDocumentAnalysis } from '../lib/document-analysis';
import { DEFAULT_MODEL_ID, getModelConfig, MODELS } from '../lib/models';
import { reportError, reportWarning } from '../lib/diagnostics';
import { abortableDelay, isAbortError, throwIfAborted } from '../lib/abort';
import { DEFAULT_TRANSLATION_BUDGET_USD, DEFAULT_TRANSLATION_RETRY_LIMIT, TranslationBudgetExceededError } from '../lib/translation-budget';
import { type ToastMessage } from '../components/AppToast';
import { useBudgetedAiProviders } from './useBudgetedAiProviders';
import { costProfile, forecastDocumentCost, normalizeCostSamples, type CostSample } from '../lib/cost-forecast';
import { createLayeredDocumentMemory, formatLayeredDocumentMemory, getNewKnowledgeLines, mergeKnowledgeLines, updateLayeredDocumentMemory } from '../lib/document-memory';
import { getDocumentTypeInstruction, normalizeDetectedDocumentType, normalizeDocumentType, resolveDocumentType, type DetectedDocumentType, type DocumentTypeId } from '../lib/document-types';
import { useTranslationMachine } from './useTranslationMachine';
import { translateChunkWithQuality } from '../lib/translation-runner';
import { decideChapterProofreading } from '../lib/chapter-proofreading';
import { assessTranslationQuality } from '../lib/translation-quality';
import { useDocumentExports } from './useDocumentExports';
import { EMPTY_NOVEL_CONTINUITY, formatNovelContinuity, getNovelCanonicalGlossary, mergeNovelContinuity, normalizeNovelContinuity, seedNovelContinuity, type NovelContinuityMemory } from '../lib/novel-continuity';
import { beginTranslationChunk, commitTranslationChunk, createTranslationProgress, pauseTranslationProgress } from '../lib/translation-progress';

export function useTranslationWorkspace() {
  const journalDocumentRef = useRef<string | null>(null);
  const fingerprintRef = useRef<string | null>(null);
  const settingsRef = useRef<string | null>(null);
  const chapterContextRef = useRef<HistoryRecord['chapterContext']>(undefined);
  const startingRef = useRef(false);
  const uploadSequenceRef = useRef(0);
  const [activeTab, setActiveTab] = useState<'translate' | 'converter'>('translate');
  const [customTitle, setCustomTitle] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [extractionComplete, setExtractionComplete] = useState(true);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);
  const [splitTranslation, setSplitTranslation] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [translationBudgetUsd, setTranslationBudgetUsd] = useState(DEFAULT_TRANSLATION_BUDGET_USD);
  const [translationRetryLimit, setTranslationRetryLimit] = useState(DEFAULT_TRANSLATION_RETRY_LIMIT);
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
  const { tokenCount, setTokenCount, isCalculating, cancelEstimate } = useSourceTokenEstimate(file, base64Data, setTotalPages);
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
    if (startingRef.current) return;
    fingerprintRef.current = record.sourceFingerprint ?? null;
    settingsRef.current = record.resumeSettings ?? null;
    chapterContextRef.current = record.chapterContext;
    setCustomInstructions(record.customInstructions ?? '');
    if (record.pendingRequests) showToast('有未收到完整用量回報的請求；顯示費用僅含已知用量，請核對供應商帳單。', 'error');
    cancelEstimate();
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
    if (startingRef.current) { showToast('請先停止翻譯再刪除紀錄。', 'error'); return; }
    let release: (() => Promise<void>) | undefined;
    try {
      const record = await getHistory(historyToDelete);
      if (!record) return;
      release = await acquireDocumentLock(record.sourceFingerprint ?? await contentDigest(record.extractedText));
      await deleteHistory(historyToDelete);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '無法刪除紀錄。', 'error');
      return;
    } finally { await release?.(); }
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
  const { manualApiKey, setManualApiKey, isManualKeyActive, manualOpenaiApiKey, setManualOpenaiApiKey, isOpenaiKeyActive, rememberApiKeys, setRememberApiKeys, showKeyModal, setShowKeyModal, handleSaveApiKeys } = useApiKeySettings(showToast);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [estimatedRemainingTime, setEstimatedRemainingTime] = useState<number | null>(null);
  const pdfWorkerRef = useRef<Worker | null>(null);
  const extractionWorkerTaskRef = useRef<string | null>(null);
  const translationCancelledRef = useRef(false);
  const translationAbortControllerRef = useRef<AbortController | null>(null);
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
    flushRequests,
  } = useBudgetedAiProviders({
    googleApiKey: isManualKeyActive ? manualApiKey : undefined,
    openaiApiKey: isOpenaiKeyActive ? manualOpenaiApiKey : undefined,
    budgetUsd: translationBudgetUsd,
    getSignal: () => translationAbortControllerRef.current?.signal,
    getDocumentId: () => journalDocumentRef.current,
  });

  useEffect(() => {
    // Initialize PDF worker
    try {
      pdfWorkerRef.current = new Worker(new URL('../pdf.worker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      reportError('pdf_worker_initialization_failed');
    }

    return () => {
      translationAbortControllerRef.current?.abort();
      if (extractionWorkerTaskRef.current) {
        pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId: extractionWorkerTaskRef.current } });
      }
      pdfWorkerRef.current?.terminate();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const handleFileUpload = async (selectedFile: File) => {
    if (startingRef.current || isTranslating) {
      showToast('請先停止目前翻譯，再更換文件。', 'error');
      return;
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

    if (currentFileId && !extractionComplete && fingerprintRef.current) {
      const fingerprint = await contentDigest(await selectedFile.arrayBuffer());
      if (fingerprint === fingerprintRef.current) {
        setFile(selectedFile);
        const reader = new FileReader();
        reader.onload = () => setBase64Data((reader.result as string).split(',')[1]);
        reader.readAsDataURL(selectedFile);
        setError(null);
        showToast('已重新載入原文件；續傳會重用已完成頁面，不重複計費。');
        return;
      }
      setError('這不是尚未完成擷取的原文件。請先完成原文件，或重新整理後上傳新文件。');
      return;
    }
    fingerprintRef.current = null;
    settingsRef.current = null;
    chapterContextRef.current = undefined;

    cancelEstimate();
    if (extractionWorkerTaskRef.current) {
      pdfWorkerRef.current?.postMessage({ type: 'CANCEL_TASK', payload: { requestId: extractionWorkerTaskRef.current } });
      extractionWorkerTaskRef.current = null;
    }

    setError(null);
    setFile(selectedFile);
    setBase64Data(null);
    const uploadSequence = ++uploadSequenceRef.current;
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
      if (uploadSequence !== uploadSequenceRef.current) return;
      const base64 = (event.target?.result as string).split(',')[1];
      setBase64Data(base64);

      if (isMd) {
        setTotalPages(0);
        const text = await selectedFile.text();
        if (uploadSequence !== uploadSequenceRef.current) return;
        setExtractedText(text);
      }
    };
    reader.onerror = () => {
      if (uploadSequence !== uploadSequenceRef.current) return;
      setError('讀取檔案失敗 (Failed to read file).');
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleTranslate = async () => {
    if (startingRef.current) return;
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

    startingRef.current = true;
    let releaseLock: (() => Promise<void>) | undefined;
    let fingerprint: string;
    let resumeSettings: string;
    try {
      resumeSettings = await contentDigest(JSON.stringify({
        version: 1, selectedModel, splitTranslation, documentType, customInstructions, chapterProofreading,
      }));
      fingerprint = fingerprintRef.current ?? await contentDigest(file ? await file.arrayBuffer() : extractedText);
      releaseLock = await acquireDocumentLock(fingerprint);
      if (!startsNewDocumentRun && currentFileId) {
        const fresh = await getHistory(currentFileId);
        if (!fresh || fresh.currentChunk !== startingChunk || fresh.translatedText !== translatedText) {
          throw new Error('歷史進度已更新，請從歷史紀錄重新載入，避免覆寫其他分頁的結果。');
        }
        if (startingChunk > 0 && fresh.resumeSettings && fresh.resumeSettings !== resumeSettings) {
          throw new Error('續傳設定與存檔不符，請恢復原模型、分段、文件類型、指示及校稿設定。');
        }
        restoreUsage(fresh.usageSnapshot);
        if (fresh.pendingRequests) showToast('部分請求用量待確認；重試可能產生額外費用，請核對供應商帳單。', 'error');
      }
    } catch (error) {
      await releaseLock?.();
      startingRef.current = false;
      setError(error instanceof Error ? error.message : '無法取得文件執行鎖。');
      return;
    }
    fingerprintRef.current = fingerprint;
    settingsRef.current = resumeSettings;

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
    const fileId = startsNewDocumentRun ? crypto.randomUUID() : currentFileId || crypto.randomUUID();
    journalDocumentRef.current = fileId;
    let latestChapterContext = startsNewDocumentRun ? undefined : chapterContextRef.current;
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
          sourceFingerprint: fingerprint, resumeSettings, customInstructions,
          chapterContext: latestChapterContext,
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
          throw historyError;
        }
      };

      await saveCurrentState('translating', startingChunk, latestTotalChunks, latestExtractedText,
        latestTranslatedText, latestTranslationStyle, latestGlossary, latestCharacterMap, latestPlotSummary);

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

        const extractionRequestId = crypto.randomUUID();
        if (extractionWorkerTaskRef.current) {
          pdfWorkerRef.current?.postMessage({
            type: 'CANCEL_TASK',
            payload: { requestId: extractionWorkerTaskRef.current },
          });
        }
        extractionWorkerTaskRef.current = extractionRequestId;

        try {
          fullMarkdown = await extractTranslationPdf({
            worker: pdfWorkerRef.current, fileBuffer: arrayBuffer, requestId: extractionRequestId,
            model: selectedModel, retryLimit: translationRetryLimit,
            signal: translationController.signal, isCancelled: () => translationCancelledRef.current,
            generate: generateContentWrapper,
            onUsage: usage => recordUsage(usage, selectedModel, translationBudgetUsd, 'extraction'),
            onTotal: setTotalChunks,
            onProgress: async ({ completed, total, markdown }) => {
              setCompletedExtractionChunks(completed);
              setCurrentChunk(completed);
              setStatusMessage(`正在提取文字 (已完成 ${completed}/${total} 部分)...`);
              latestTotalChunks = total;
              latestExtractedText = markdown;
              setExtractedText(markdown);
              await saveCurrentState('translating', 0, total, markdown, '', null, '無', '', '', false);
            },
            onWarning: reportWarning,
          });
        } finally {
          if (extractionWorkerTaskRef.current === extractionRequestId) {
            extractionWorkerTaskRef.current = null;
          }
        }

        latestExtractedText = fullMarkdown;
        setExtractedText(fullMarkdown);
      }
      latestExtractionComplete = true;
      setExtractionComplete(true);
      // Replace upload estimates with the actual translation source, not PDF bytes/modalities.
      cancelEstimate();
      setTokenCount(estimateTextTokens(fullMarkdown));
      await saveCurrentState('translating', startingChunk, latestTotalChunks, fullMarkdown,
        latestTranslatedText, latestTranslationStyle, latestGlossary, latestCharacterMap, latestPlotSummary, false);

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
            costStage: 'analysis',
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
          if (err instanceof TranslationBudgetExceededError || err instanceof HistoryStorageError || isAbortError(err)) throw err;
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
      let previousTranslatedText = latestChapterContext?.previousTranslation ?? latestTranslatedText.slice(-1000);

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
      let chapterSourceChunks: string[] = latestChapterContext?.source.slice() ?? [];
      let chapterTranslatedChunks: string[] = latestChapterContext?.translated.slice() ?? [];
      let chapterStartOffset = latestChapterContext?.startOffset ?? fullTranslatedText.length;
      let chapterNewTermCount = latestChapterContext?.terms ?? 0;
      let chapterNewCharacterCount = latestChapterContext?.characters ?? 0;
      let chapterQualityWarningCount = latestChapterContext?.warnings ?? 0;

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
          try {
            const review = await reviewTranslatedChapter({
              model: selectedModel, sourceChapter, translatedChapter,
              documentType: effectiveDocumentType, style: detectedStyle, glossary: dynamicGlossary,
              characterMap: [
                dynamicCharacterMap,
                effectiveDocumentType === 'novel' ? formatNovelContinuity(latestNovelContinuity) : '',
              ].filter(Boolean).join('\n\n'),
              generate: generateContentWrapper,
              onUsage: usage => recordUsage(usage, selectedModel, translationBudgetUsd, 'chapter_review'),
            });
            fullTranslatedText = `${fullTranslatedText.slice(0, chapterStartOffset)}${review.correctedChapter}\n\n`;
            currentChunkTranslated = review.correctedChapter.slice(-Math.max(1000, currentChunkTranslated.length));
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
            if (reviewError instanceof TranslationBudgetExceededError || reviewError instanceof HistoryStorageError || isAbortError(reviewError)) throw reviewError;
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
        latestChapterContext = {
          source: chapterSourceChunks.slice(), translated: chapterTranslatedChunks.slice(),
          startOffset: chapterStartOffset, terms: chapterNewTermCount,
          characters: chapterNewCharacterCount, warnings: chapterQualityWarningCount,
          previousTranslation: previousTranslatedText,
        };
        chapterContextRef.current = latestChapterContext;

        // Save progress to IndexedDB
        {
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
      await flushRequests();
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
          sourceFingerprint: fingerprint, resumeSettings, customInstructions,
          chapterContext: latestChapterContext,
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
      await flushRequests();
      journalDocumentRef.current = null;
      startingRef.current = false;
      await releaseLock?.();
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

  const { isExtracting, handlePdfToEpub } = useDocumentConverter({
    file, customTitle, authorName, coverImage, isIframe, setStatusMessage, setError, setExtractedText, showToast,
  });

  const selectedModelData = getModelConfig(selectedModel);

  const { sourceChunkTokens, estimatedSourceChunks, forecastOptions, costForecast } = useDocumentCostForecast({
    extractionComplete,
    extractedText,
    splitTranslation,
    tokenCount,
    completedCostChunks,
    translationStyle,
    glossary,
    characterMap,
    plotSummary,
    customInstructions,
    novelContinuity,
    documentType,
    resolvedDocumentType,
    selectedModel,
    analysisComplete,
    chapterProofreading,
    totalPages,
    completedExtractionChunks,
    translationRetryLimit,
    actualCost,
    costSamples,
    inFlightStartUsd,
  });
  const actualUsage = {
    inputTokens: actualInputTokens,
    cachedInputTokens: actualCachedInputTokens,
    cacheWriteInputTokens: actualCacheWriteInputTokens,
    outputTokens: actualOutputTokens,
    reasoningTokens: actualReasoningTokens,
  };
  return {
    activeTab, setActiveTab, customTitle, setCustomTitle,
    customInstructions, setCustomInstructions, isExtracting, extractedText,
    selectedModel, setSelectedModel, splitTranslation, setSplitTranslation,
    file, tokenCount, translationBudgetUsd, setTranslationBudgetUsd,
    translationRetryLimit, setTranslationRetryLimit, isCalculating, isTranslating,
    translationStage, currentChunk, totalChunks, totalPages,
    translatedText, translationStyle, statusMessage, documentType,
    setDocumentType, chapterProofreading, setChapterProofreading, toast,
    setToast, autoDownload, setAutoDownload, isIframe,
    history, showHistory, setShowHistory, historyToDelete,
    setHistoryToDelete, coverImage, setCoverImage, authorName,
    setAuthorName, currentFileId, handleLoadHistory, handleDeleteHistory,
    confirmDeleteHistory, showToast, isCopying, isDownloadingEpub,
    isDownloadingPdf, handleCopyText, downloadEpub, handleDownloadMarkdown,
    downloadPdf, error, manualApiKey, setManualApiKey,
    isManualKeyActive, manualOpenaiApiKey, setManualOpenaiApiKey, isOpenaiKeyActive,
    rememberApiKeys, setRememberApiKeys, showKeyModal, setShowKeyModal,
    showInfoModal, setShowInfoModal, estimatedRemainingTime, actualCost,
    costBreakdown, handleSaveApiKeys, handleFileUpload, handleTranslate,
    handleCancelTranslation, handlePdfToEpub, selectedModelData, costForecast,
    actualUsage,
  };
}

export type TranslationWorkspace = ReturnType<typeof useTranslationWorkspace>;
