import type { TFunction } from 'i18next';

// Dynamic-key lookups (bins:colors.*, bins:backgrounds.*, bins:colorPicker.secondary.*) —
// preserved from the extractor via preservePatterns in i18next.config.ts. The English label from
// the data table (lib/colorPalette.ts, lib/premadeBackgrounds.ts, lib/cardStyle.ts) is the fallback.
type Translate = (key: string, options: { defaultValue: string }) => string;

/** Translate a color preset / hue name ("Red", "Gray", "Black"...) from lib/colorPalette. */
export function translateColorLabel(t: TFunction<'bins'>, label: string): string {
  return (t as unknown as Translate)(`colors.${label.toLowerCase()}`, { defaultValue: label });
}

/** Translate a premade card background label by its asset id. */
export function translateBackgroundLabel(t: TFunction<'bins'>, id: string, label: string): string {
  return (t as unknown as Translate)(`backgrounds.${id}`, { defaultValue: label });
}

const SECONDARY_KEYS: Record<string, string> = {
  'Border Color': 'border',
  'End Color': 'gradient',
  'Stripe Color': 'stripe',
};

/** Translate the secondary color label returned by getSecondaryColorInfo() in lib/cardStyle. */
export function translateSecondaryColorLabel(t: TFunction<'bins'>, label: string): string {
  const key = SECONDARY_KEYS[label];
  if (!key) return label;
  return (t as unknown as Translate)(`colorPicker.secondary.${key}`, { defaultValue: label });
}
