import { ApiError } from '@/lib/api';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Used when no `t` is supplied — mirrors the pre-i18n hardcoded English text exactly. */
const englishFallback: Translate = (_key, options) => (options?.defaultValue as string) ?? '';

/**
 * Map AI-related API errors to user-friendly messages.
 * @param err  The caught error.
 * @param fallback  Message shown for non-API errors.
 * @param t  Optional translate function (from useTranslation('ai')) — falls back to plain English when omitted.
 */
export function mapAiError(err: unknown, fallback: string, t?: unknown): string {
  const translate = (t as Translate | undefined) ?? englishFallback;
  if (err instanceof ApiError) {
    if (err.code === 'AI_CREDITS_EXHAUSTED') return err.message;
    if (err.code === 'AI_RATE_LIMITED') {
      return translate('aiErrors.rateLimited', { defaultValue: 'Too many AI requests — try again in a moment' });
    }
    if (err.code === 'VALIDATION_ERROR') return err.message;
    switch (err.status) {
      case 422: return translate('aiErrors.invalidApiKey', { defaultValue: 'Invalid API key or model — check Settings > AI' });
      case 429: return translate('aiErrors.providerRateLimited', { defaultValue: 'AI provider rate limited — wait a moment and try again' });
      case 502: return translate('aiErrors.providerError', { defaultValue: 'Your AI provider returned an error — verify your settings' });
      default: return err.message;
    }
  }
  return fallback;
}
