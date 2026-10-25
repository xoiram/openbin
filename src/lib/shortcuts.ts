import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export type ShortcutCategory = 'navigation' | 'action' | 'general';

export interface ShortcutDef {
  id: string;
  category: ShortcutCategory;
  keys: string;
  icon?: string;
}

// Labels are translated at render time via useShortcutLabels().
export const SHORTCUTS: ShortcutDef[] = [
  { id: 'go-home', category: 'navigation', keys: 'g h' },
  { id: 'go-bins', category: 'navigation', keys: 'g b' },
  { id: 'go-scan', category: 'action', keys: 'g s' },
  { id: 'go-print', category: 'navigation', keys: 'g p' },
  { id: 'go-locations', category: 'navigation', keys: 'g l' },
  { id: 'go-items', category: 'navigation', keys: 'g i' },
  { id: 'go-tags', category: 'navigation', keys: 'g t' },
  { id: 'go-settings', category: 'navigation', keys: 'g e' },
  { id: 'new-bin', category: 'action', keys: 'n' },
  { id: 'focus-search', category: 'action', keys: '/' },
  { id: 'select-all', category: 'action', keys: 'mod+a' },
  { id: 'ask-ai', category: 'action', keys: 'mod+j' },
  { id: 'command-palette', category: 'general', keys: 'mod+k' },
  { id: 'toggle-sidebar', category: 'general', keys: '[' },
  { id: 'shortcuts-help', category: 'general', keys: '?' },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function formatKeys(keys: string): string[] {
  return keys.split(' ').map((part) => {
    if (part.startsWith('mod+')) {
      const key = part.slice(4).toUpperCase();
      return isMac ? `\u2318${key}` : `Ctrl+${key}`;
    }
    return part.toUpperCase();
  });
}

export const SHORTCUT_CATEGORY_ORDER: ShortcutCategory[] = ['navigation', 'action', 'general'];

/** Translated labels for shortcuts (by id) and shortcut categories. */
export function useShortcutLabels(): {
  label: (shortcut: ShortcutDef) => string;
  categoryLabel: (category: ShortcutCategory) => string;
} {
  const { t } = useTranslation('common');
  return useMemo(() => {
    const labels: Record<string, string> = {
      'go-home': t('shortcuts.items.goHome', { defaultValue: 'Go to Home' }),
      'go-bins': t('shortcuts.items.goBins', { defaultValue: 'Go to Bins' }),
      'go-scan': t('shortcuts.items.scan', { defaultValue: 'Scan QR Code' }),
      'go-print': t('shortcuts.items.goPrint', { defaultValue: 'Go to Print' }),
      'go-locations': t('shortcuts.items.goLocations', { defaultValue: 'Go to Locations' }),
      'go-items': t('shortcuts.items.goItems', { defaultValue: 'Go to Items' }),
      'go-tags': t('shortcuts.items.goTags', { defaultValue: 'Go to Tags' }),
      'go-settings': t('shortcuts.items.goSettings', { defaultValue: 'Go to Settings' }),
      'new-bin': t('shortcuts.items.newBin', { defaultValue: 'New Bin' }),
      'focus-search': t('shortcuts.items.focusSearch', { defaultValue: 'Focus Search' }),
      'select-all': t('shortcuts.items.selectAll', { defaultValue: 'Select All' }),
      'ask-ai': t('shortcuts.items.askAi', { defaultValue: 'Ask AI' }),
      'command-palette': t('shortcuts.items.commandPalette', { defaultValue: 'Command Palette' }),
      'toggle-sidebar': t('shortcuts.items.toggleSidebar', { defaultValue: 'Toggle Sidebar' }),
      'shortcuts-help': t('shortcuts.items.keyboardShortcuts', { defaultValue: 'Keyboard Shortcuts' }),
    };
    const categories: Record<ShortcutCategory, string> = {
      navigation: t('shortcuts.categories.navigation', { defaultValue: 'Navigation' }),
      action: t('shortcuts.categories.actions', { defaultValue: 'Actions' }),
      general: t('shortcuts.categories.general', { defaultValue: 'General' }),
    };
    return {
      label: (shortcut) => labels[shortcut.id] ?? shortcut.id,
      categoryLabel: (category) => categories[category],
    };
  }, [t]);
}

export function groupedShortcuts(): { category: ShortcutCategory; items: ShortcutDef[] }[] {
  return SHORTCUT_CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: SHORTCUTS.filter((s) => s.category === cat),
  }));
}
