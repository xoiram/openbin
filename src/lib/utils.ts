import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import i18n from './i18n';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats seconds as M:SS for recording timers. */
export function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Returns `singular` when count === 1, otherwise `pluralForm` (defaults to singular + "s"). */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/** "1 item" / "5 items" / "2 children" — count + space + word, with optional explicit plural. */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

export const EMAIL_REGEX = /^[^\s@+]+@[^\s@]+\.[^\s@]+$/;

/** Returns the first whitespace-separated token of a name (e.g. "John Smith" → "John"). */
export function firstName(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  const space = trimmed.indexOf(' ');
  return space === -1 ? trimmed : trimmed.slice(0, space);
}

export function haptic(pattern: number | number[] = 10) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

/**
 * Extract a human-readable message from an unknown catch value.
 *
 * For an ApiError whose code has a translation in `errors:codes.*`, and when
 * the UI language is not English, returns that generic translated message.
 * English keeps the server's (more specific) message. VALIDATION_ERROR and
 * unknown codes always fall through to the server text.
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  // Duck-typed on `code` instead of `instanceof ApiError`: importing api.ts here
  // would create a cycle and breaks tests that partially mock '@/lib/api'.
  const code = err instanceof Error ? (err as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && code && !i18n.language?.startsWith('en')) {
    const key = `errors:codes.${code}`;
    // Dynamic key (the code comes from the server), so bypass the typed-key overloads.
    const translate = i18n.t.bind(i18n) as (k: string) => string;
    if (i18n.exists(key)) return translate(key);
  }
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

/** Format a byte count as B/KB/MB/GB with one-decimal precision. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Returns true if `url` uses http: or https: protocol (blocks javascript:, data:, etc.). */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

// ── Shared UI class constants ──────────────────────────────────────

/** Focus ring used on buttons, switches, checkboxes, and similar interactive controls. */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

/** Shared disabled styling for interactive elements. */
export const disabledClasses = 'disabled:cursor-not-allowed disabled:opacity-50';

/** Base classes shared by Input, Textarea, and similar form controls. */
export const inputBase =
  'w-full rounded-[var(--radius-sm)] bg-[var(--bg-input)] border border-[var(--border-flat)] px-3.5 py-2.5 text-base text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] transition-all duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

/** Flat card base — shared by Card, Table, ListItem. */
export const flatCard = 'flat-card rounded-[var(--radius-lg)]';

/** Overlay backdrop — shared by Dialog and CommandPalette. */
export const overlayBackdrop =
  'fixed inset-0 bg-[var(--overlay-backdrop)] transition-opacity';

/** Small uppercase category/section header text. See `.ui-eyebrow` in index.css. */
export const categoryHeader = 'ui-eyebrow';

/** Section header: 10px semibold in primary text color. */
export const sectionHeader = 'text-[13px] text-[var(--text-primary)]';

/** Section header row: baseline-aligned title on the left, actions on the right. */
export const sectionHeaderRow = 'flex items-baseline justify-between mb-4';

/** Inline icon-button: 36px tap target, flex-centered. */
export const iconButton = 'shrink-0 flex items-center justify-center size-9';

/** Standard top-right close button for dialogs/overlays: 44px tap target, filled chip. */
export const closeButton =
  'absolute right-2.5 top-2.5 z-10 rounded-[var(--radius-sm)] h-11 w-11 bg-[var(--bg-input)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center';

/** Sticky footer for flush-mode dialog bodies (px-5 padding). Caller supplies its own layout (row-spread, flex justify-end, etc.). */
export const stickyDialogFooter =
  'mt-auto sticky bottom-0 -mx-5 bg-[var(--bg-flat-heavy)] border-t border-[var(--border-subtle)] px-5 pt-3 pb-[calc(12px+var(--safe-bottom))]';

/** Fade-in-on-hover remove button for list rows (visible at 30% on mobile).
 *  44×44 touch target meets WCAG / platform minimums. */
export const rowAction =
  'shrink-0 flex items-center justify-center size-11 text-[var(--text-tertiary)] opacity-30 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity';

/** Short numeric date string from an ISO timestamp, in the given locale (pass `i18n.language`). */
export function formatDate(dateStr: string, locale?: string): string {
  return new Date(dateStr).toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
}
