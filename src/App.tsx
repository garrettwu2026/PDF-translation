import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { Upload, FileText, DollarSign, Play, Download, Loader2, AlertCircle, CheckCircle2, FileUp, Key } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';

const uint8ArrayToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

const MODELS = [
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', inputPrice: 1.25, outputPrice: 5.00 },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash', inputPrice: 0.075, outputPrice: 0.30 },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', inputPrice: 0.075, outputPrice: 0.30 },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite', inputPrice: 0.075, outputPrice: 0.30 },
];

export default function App() {
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [translatedText, setTranslatedText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isKeySelected, setIsKeySelected] = useState(false);
  const [isCheckingKey, setIsCheckingKey] = useState(true);
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
        alert(`無法開啟 API Key 設定視窗 (${e.message})。\n\n這可能是因為 Safari 的跨網站追蹤防護 (ITP) 阻擋了驗證模組。請嘗試在 Safari 設定中關閉「防止跨網站追蹤」，或改用 Chrome 瀏覽器。`);
      }
    } else {
      alert("無法呼叫 API Key 設定視窗。\n\n請注意：您目前可能直接訪問了 .run.app 網址，或者瀏覽器阻擋了跨網站追蹤。請使用 AI Studio 產生的「Share (分享)」連結來開啟此應用程式。");
    }
  };

  useEffect(() => {
    if (base64Data) {
      calculateTokens(base64Data, selectedModel);
    }
  }, [selectedModel, base64Data]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    if (selectedFile.type !== 'application/pdf') {
      setError('請上傳 PDF 檔案 (Please upload a PDF file).');
      return;
    }
    
    setError(null);
    setFile(selectedFile);
    setTranslatedText('');
    setTokenCount(null);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setBase64Data(base64);
      
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        setTotalPages(pdfDoc.getPageCount());
      } catch (e) {
        console.error("Failed to parse PDF pages", e);
      }
      
      await calculateTokens(base64, selectedModel);
    };
    reader.onerror = () => {
      setError('讀取檔案失敗 (Failed to read file).');
    };
    reader.readAsDataURL(selectedFile);
  };

  const calculateTokens = async (base64: string, modelId: string) => {
    setIsCalculating(true);
    setError(null);
    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.countTokens({
        model: modelId,
        contents: {
          parts: [
            { inlineData: { data: base64, mimeType: 'application/pdf' } },
            { text: 'Translate this document into Traditional Chinese.' }
          ]
        }
      });
      setTokenCount(response.totalTokens);
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
    setTranslatedText('');
    setStatusMessage('');
    setError(null);
    setCurrentChunk(0);
    setTotalChunks(0);
    
    try {
      const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
      const ai = new GoogleGenAI({ apiKey });
      
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pageCount = pdfDoc.getPageCount();
      
      const CHUNK_SIZE = 5; // Translate 5 pages at a time to reduce total requests
      const chunks = Math.ceil(pageCount / CHUNK_SIZE);
      setTotalChunks(chunks);
      
      let fullText = '';
      
      for (let i = 0; i < chunks; i++) {
        setCurrentChunk(i + 1);
        
        const chunkPdf = await PDFDocument.create();
        const startPage = i * CHUNK_SIZE;
        const endPage = Math.min(startPage + CHUNK_SIZE, pageCount) - 1;
        const pageIndices = Array.from({length: endPage - startPage + 1}, (_, idx) => startPage + idx);
        
        const copiedPages = await chunkPdf.copyPages(pdfDoc, pageIndices);
        copiedPages.forEach(page => chunkPdf.addPage(page));
        
        const chunkBytes = await chunkPdf.save();
        const chunkBase64 = uint8ArrayToBase64(chunkBytes);
        
        let success = false;
        let retries = 0;
        const MAX_RETRIES = 6;
        let currentChunkText = '';

        while (!success && retries < MAX_RETRIES) {
          try {
            const responseStream = await ai.models.generateContentStream({
              model: selectedModel,
              contents: {
                parts: [
                  { inlineData: { data: chunkBase64, mimeType: 'application/pdf' } },
                  { text: '請將這份 PDF 文件的內容翻譯成繁體中文 (Traditional Chinese)。請盡可能保持原始的結構、段落和格式。請以 Markdown 格式輸出。直接輸出翻譯內容，不要加上任何多餘的解釋或開場白。' }
                ]
              }
            });
            
            for await (const chunk of responseStream) {
              const text = chunk.text || '';
              currentChunkText += text;
              setTranslatedText(fullText + currentChunkText);
            }
            success = true;
          } catch (err: any) {
            const errorMessage = err.message?.toLowerCase() || '';
            const status = err.status;
            
            // Check if it's a rate limit or quota error (429)
            if (status === 429 || errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate limit') || errorMessage.includes('too many') || errorMessage.includes('exhausted')) {
              retries++;
              if (retries >= MAX_RETRIES) throw new Error(`已達到最大重試次數。API 頻率限制過嚴，請稍後再試。(${err.message})`);
              
              const waitTime = retries * 15; // Wait 15s, 30s, 45s...
              setStatusMessage(`API 限制，等待 ${waitTime} 秒後重試...`);
              await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
              setStatusMessage('');
              currentChunkText = ''; // Reset chunk text for the retry
            } else {
              throw err; // Rethrow other errors (e.g., 400 Bad Request)
            }
          }
        }
        
        fullText += currentChunkText + '\n\n';
        setTranslatedText(fullText);
        
        // Add a baseline delay between successful chunks to prevent hitting the RPM limit
        if (i < chunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
    } catch (err: any) {
      console.error(err);
      setError(`翻譯失敗 (Translation failed): ${err.message}`);
    } finally {
      setIsTranslating(false);
      setCurrentChunk(0);
      setTotalChunks(0);
      setStatusMessage('');
    }
  };

  const downloadPdf = async () => {
    const element = document.getElementById('translation-result-content');
    if (!element) return;
    
    try {
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      const opt: any = {
        margin:       15,
        filename:     `${file?.name.replace('.pdf', '') || 'document'}_翻譯.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      
      html2pdf().set(opt).from(element).save();
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("產生 PDF 失敗，請確定您的瀏覽器支援此功能。");
    }
  };

  const selectedModelData = MODELS.find(m => m.id === selectedModel)!;
  
  const estimatedInputCost = tokenCount ? (tokenCount / 1000000) * selectedModelData.inputPrice : 0;
  const estimatedOutputCost = tokenCount ? (tokenCount / 1000000) * selectedModelData.outputPrice : 0;
  const totalEstimatedCost = estimatedInputCost + estimatedOutputCost;

  if (isCheckingKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-sm font-medium">正在驗證環境...</p>
        </div>
      </div>
    );
  }

  if (!isKeySelected) {
    // @ts-ignore
    const isRawUrl = typeof window !== 'undefined' && !(window as any).aistudio;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Key className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">需要綁定 API Key</h2>
          <p className="text-slate-600 mb-6 text-sm leading-relaxed">
            為了保護開發者的額度，使用此翻譯工具需要您自備 Google Gemini API Key。請點擊下方按鈕綁定您的金鑰。
          </p>
          <button
            onClick={handleSelectKey}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
          >
            選擇或輸入 API Key
          </button>
          
          {isRawUrl && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-left">
              <p className="text-sm text-amber-800 font-medium flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4" />
                網址來源錯誤
              </p>
              <p className="text-xs text-amber-700 leading-relaxed">
                偵測到您直接訪問了 <code>.run.app</code> 網址。此環境無法載入 API Key 驗證模組。請改用原作者提供的 <strong>AI Studio 分享連結</strong> (<code>https://ai.studio/share/...</code>) 開啟本網頁。
              </p>
            </div>
          )}
          
          <p className="text-xs text-slate-400 mt-4">
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-slate-600">
              了解如何獲取付費 API Key
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">PDF 翻譯神器</h1>
          </div>
          <div className="text-sm text-slate-500 flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-full">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            已綁定個人 API Key
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-4 space-y-6">
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-semibold text-sm">1</div>
                選擇模型
              </h2>
              <div className="space-y-3">
                {MODELS.map(model => (
                  <label 
                    key={model.id}
                    className={`flex items-start p-3 rounded-xl border cursor-pointer transition-colors ${
                      selectedModel === model.id 
                        ? 'border-indigo-600 bg-indigo-50/50' 
                        : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                    }`}
                  >
                    <input 
                      type="radio" 
                      name="model" 
                      value={model.id}
                      checked={selectedModel === model.id}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="mt-1 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="ml-3">
                      <div className="font-medium text-slate-900">{model.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        輸入: ${model.inputPrice}/1M tokens<br/>
                        輸出: ${model.outputPrice}/1M tokens
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-semibold text-sm">2</div>
                上傳 PDF
              </h2>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  file ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="application/pdf" 
                  className="hidden" 
                />
                
                {file ? (
                  <div className="flex flex-col items-center">
                    <FileText className="w-10 h-10 text-indigo-500 mb-3" />
                    <p className="font-medium text-slate-900 truncate max-w-full px-4">{file.name}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {(file.size / 1024 / 1024).toFixed(2)} MB {totalPages > 0 && `· 共 ${totalPages} 頁`}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <FileUp className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="font-medium text-slate-900">點擊或拖曳上傳 PDF</p>
                    <p className="text-sm text-slate-500 mt-1">支援最大 3600 頁的文件</p>
                  </div>
                )}
              </div>

              {file && (
                <div className="mt-6 bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h3 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    預估資訊
                  </h3>
                  
                  {isCalculating ? (
                    <div className="flex items-center justify-center py-4 text-slate-500 text-sm gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      計算 Token 中...
                    </div>
                  ) : tokenCount !== null ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">文件 Token 數:</span>
                        <span className="font-medium">{tokenCount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">預估輸入成本:</span>
                        <span>${estimatedInputCost.toFixed(4)} USD</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">預估輸出成本:</span>
                        <span>~${estimatedOutputCost.toFixed(4)} USD</span>
                      </div>
                      <div className="pt-2 mt-2 border-t border-slate-200 flex justify-between font-medium text-indigo-700">
                        <span>總預估成本:</span>
                        <span>~${totalEstimatedCost.toFixed(4)} USD</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-semibold text-sm">3</div>
                開始翻譯
              </h2>
              
              <button
                onClick={handleTranslate}
                disabled={!file || isCalculating || isTranslating}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTranslating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {statusMessage ? statusMessage : (totalChunks > 0 ? `翻譯中 (第 ${currentChunk}/${totalChunks} 部分)...` : '準備中...')}
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    確認翻譯
                  </>
                )}
              </button>
              
              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}
            </div>

          </div>

          <div className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 h-full min-h-[600px] flex flex-col overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <h2 className="text-lg font-medium flex items-center gap-2">
                  翻譯結果
                </h2>
                
                <button
                  onClick={downloadPdf}
                  disabled={!translatedText || isTranslating}
                  className="py-2 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  下載 PDF
                </button>
              </div>
              
              <div className="flex-1 p-6 overflow-auto bg-white">
                {!translatedText && !isTranslating ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <FileText className="w-16 h-16 opacity-20" />
                    <p>翻譯結果將顯示於此</p>
                  </div>
                ) : (
                  <div id="translation-result-content" className="prose prose-slate max-w-none prose-headings:font-semibold prose-a:text-indigo-600">
                    <ReactMarkdown>{translatedText}</ReactMarkdown>
                    {isTranslating && (
                      <span className="inline-block w-2 h-4 ml-1 bg-indigo-500 animate-pulse"></span>
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
