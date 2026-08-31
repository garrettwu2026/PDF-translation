type DiagnosticValue = string | number | boolean | null | undefined;
type DiagnosticContext = Record<string, DiagnosticValue>;

const writeDiagnostic = (
  level: 'warn' | 'error',
  event: string,
  context?: DiagnosticContext,
) => {
  if (!import.meta.env.DEV) return;
  const safeContext = context
    ? Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined))
    : undefined;
  console[level](`[diagnostic:${event}]`, safeContext ?? '');
};

// Never pass uploaded text, translated text, prompts, API keys, or provider
// response bodies into these helpers. Production builds emit no diagnostics.
export const reportWarning = (event: string, context?: DiagnosticContext) =>
  writeDiagnostic('warn', event, context);

export const reportError = (event: string, context?: DiagnosticContext) =>
  writeDiagnostic('error', event, context);
