import { getModelConfig } from './models';
import {
  getUsageDelta,
  normalizeGoogleUsage,
  normalizeOpenAIUsage,
  type UsageMetadata,
} from './provider-usage';
export type { UsageMetadata } from './provider-usage';

export type ContentResult = {
  text: string;
  usageMetadata?: UsageMetadata;
};

export type GenerateContentOptions = {
  model: string;
  systemInstruction?: string;
  promptText?: string;
  base64Pdf?: string;
  temperature?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
};

export type GenerateStreamOptions = {
  model: string;
  systemInstruction?: string;
  promptText: string;
  temperature?: number;
  signal?: AbortSignal;
};

export type ProviderCredentials = {
  googleApiKey?: string;
  openaiApiKey?: string;
};

const requireKey = (key: string | undefined, providerName: string) => {
  if (!key) throw new Error(`${providerName} API Key 尚未設定`);
  return key;
};

export const generateContent = async (
  options: GenerateContentOptions,
  credentials: ProviderCredentials,
): Promise<ContentResult> => {
  const model = getModelConfig(options.model);
  if (model.provider === 'google') {
    const apiKey = requireKey(credentials.googleApiKey, 'Google Gemini');
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
    if (options.base64Pdf) {
      parts.push({ inlineData: { data: options.base64Pdf, mimeType: 'application/pdf' } });
    }
    if (options.promptText) parts.push({ text: options.promptText });

    const response = await ai.models.generateContent({
      model: options.model,
      contents: { parts },
      config: {
        temperature: options.temperature ?? 0.1,
        systemInstruction: options.systemInstruction,
        responseMimeType: options.jsonMode ? 'application/json' : undefined,
        abortSignal: options.signal,
      },
    });
    return { text: response.text || '', usageMetadata: normalizeGoogleUsage(response.usageMetadata) };
  }

  const apiKey = requireKey(credentials.openaiApiKey, 'OpenAI');
  if (options.base64Pdf) {
    throw new Error('OpenAI 模型不支援直接讀取 PDF 掃描檔。請確認檔案是可以選取文字的 PDF 或 Markdown，或是先改用 Gemini 模型進行。');
  }
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (options.systemInstruction) messages.push({ role: 'system', content: options.systemInstruction });
  if (options.promptText) messages.push({ role: 'user', content: options.promptText });
  const response = await openai.chat.completions.create({
    model: options.model,
    messages,
    temperature: options.temperature ?? 0.1,
    response_format: options.jsonMode ? { type: 'json_object' } : undefined,
  }, { signal: options.signal });
  return {
    text: response.choices[0].message.content || '',
    usageMetadata: normalizeOpenAIUsage(response.usage),
  };
};

export async function* generateContentStream(
  options: GenerateStreamOptions,
  credentials: ProviderCredentials,
): AsyncGenerator<ContentResult> {
  const model = getModelConfig(options.model);
  if (model.provider === 'google') {
    const apiKey = requireKey(credentials.googleApiKey, 'Google Gemini');
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const stream = await ai.models.generateContentStream({
      model: options.model,
      contents: { parts: [{ text: options.promptText }] },
      config: {
        systemInstruction: options.systemInstruction,
        temperature: options.temperature ?? 0.2,
        abortSignal: options.signal,
      },
    });
    let previousUsage: UsageMetadata | undefined;
    for await (const chunk of stream) {
      const currentUsage = normalizeGoogleUsage(chunk.usageMetadata);
      yield { text: chunk.text || '', usageMetadata: getUsageDelta(currentUsage, previousUsage) };
      if (currentUsage) previousUsage = currentUsage;
    }
    return;
  }

  const apiKey = requireKey(credentials.openaiApiKey, 'OpenAI');
  const { default: OpenAI } = await import('openai');
  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const stream = await openai.chat.completions.create({
    model: options.model,
    messages: [
      ...(options.systemInstruction ? [{ role: 'system' as const, content: options.systemInstruction }] : []),
      { role: 'user' as const, content: options.promptText },
    ],
    temperature: options.temperature ?? 0.2,
    stream: true,
    stream_options: { include_usage: true },
  }, { signal: options.signal });
  for await (const chunk of stream) {
    yield {
      text: chunk.choices?.[0]?.delta?.content || '',
      usageMetadata: normalizeOpenAIUsage(chunk.usage),
    };
  }
}
