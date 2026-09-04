import { getModelConfig, getTemperatureConfig } from './models';
import {
  getUsageDelta,
  normalizeGoogleUsage,
  normalizeOpenAIUsage,
  type UsageMetadata,
} from './provider-usage';
import {
  getGoogleStructuredOutputConfig,
  getOpenAIResponseFormat,
  type StructuredOutputSchema,
} from './structured-output';
import { normalizeProviderError } from './provider-errors';
export type { UsageMetadata } from './provider-usage';

export type ContentResult = {
  text: string;
  usageMetadata?: UsageMetadata;
  finishReason?: string;
};

export type GenerateContentOptions = {
  costStage?: import('./cost-forecast').CostStage;
  cacheScope?: string;
  model: string;
  systemInstruction?: string;
  promptText?: string;
  base64Pdf?: string;
  temperature?: number;
  jsonMode?: boolean;
  jsonSchema?: StructuredOutputSchema;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type GenerateStreamOptions = {
  costStage?: import('./cost-forecast').CostStage;
  cacheScope?: string;
  model: string;
  systemInstruction?: string;
  promptText: string;
  temperature?: number;
  maxOutputTokens?: number;
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

const generateContentRequest = async (
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
        ...getTemperatureConfig(model, options.temperature ?? 0.1),
        systemInstruction: options.systemInstruction,
        ...getGoogleStructuredOutputConfig(options.jsonMode, options.jsonSchema),
        maxOutputTokens: options.maxOutputTokens,
        abortSignal: options.signal,
      },
    });
    return { text: response.text || '', usageMetadata: normalizeGoogleUsage(response.usageMetadata),
      finishReason: response.candidates?.[0]?.finishReason };
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
    ...getTemperatureConfig(model, options.temperature ?? 0.1),
    max_completion_tokens: options.maxOutputTokens,
    response_format: getOpenAIResponseFormat(options.jsonMode, options.jsonSchema),
  }, { signal: options.signal });
  return {
    text: response.choices[0]?.message.content || '',
    finishReason: response.choices[0]?.finish_reason,
    usageMetadata: normalizeOpenAIUsage(response.usage),
  };
};

export const generateContent = async (
  options: GenerateContentOptions,
  credentials: ProviderCredentials,
): Promise<ContentResult> => {
  try {
    return await generateContentRequest(options, credentials);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError' || error instanceof Error && error.name === 'AbortError') throw error;
    throw normalizeProviderError(error);
  }
};

async function* generateContentStreamRequest(
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
        ...getTemperatureConfig(model, options.temperature ?? 0.2),
        maxOutputTokens: options.maxOutputTokens,
        abortSignal: options.signal,
      },
    });
    let previousUsage: UsageMetadata | undefined;
    for await (const chunk of stream) {
      const currentUsage = normalizeGoogleUsage(chunk.usageMetadata);
      yield { text: chunk.text || '', usageMetadata: getUsageDelta(currentUsage, previousUsage),
        finishReason: chunk.candidates?.[0]?.finishReason };
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
    ...getTemperatureConfig(model, options.temperature ?? 0.2),
    max_completion_tokens: options.maxOutputTokens,
    stream: true,
    stream_options: { include_usage: true },
  }, { signal: options.signal });
  for await (const chunk of stream) {
    yield {
      text: chunk.choices?.[0]?.delta?.content || '',
      finishReason: chunk.choices?.[0]?.finish_reason ?? undefined,
      usageMetadata: normalizeOpenAIUsage(chunk.usage),
    };
  }
}
export async function* generateContentStream(
  options: GenerateStreamOptions,
  credentials: ProviderCredentials,
): AsyncGenerator<ContentResult> {
  try {
    yield* generateContentStreamRequest(options, credentials);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError' || error instanceof Error && error.name === 'AbortError') throw error;
    throw normalizeProviderError(error);
  }
}
