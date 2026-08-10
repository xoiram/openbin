import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { Events, notify } from '@/lib/eventBus';
import type { AiSuggestedItem } from '@/types';
import { mapAiError } from './aiErrors';

interface StructureTextOptions {
  text: string;
  mode?: 'items';
  context?: {
    binName?: string;
    existingItems?: string[];
  };
  locationId?: string;
}

interface StructureTextResult {
  items: AiSuggestedItem[];
}


export async function structureTextItems(options: StructureTextOptions): Promise<AiSuggestedItem[]> {
  const result = await apiFetch<StructureTextResult>('/api/ai/structure-text', {
    method: 'POST',
    body: {
      text: options.text,
      mode: options.mode || 'items',
      context: options.context,
      locationId: options.locationId,
    },
  });
  notify(Events.PLAN);
  return result.items;
}

export function useTextStructuring() {
  const { t } = useTranslation('ai');
  const [structuredItems, setAiSuggestedItems] = useState<AiSuggestedItem[] | null>(null);
  const [isStructuring, setIsStructuring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const structure = useCallback(async (options: StructureTextOptions) => {
    setIsStructuring(true);
    setError(null);
    setAiSuggestedItems(null);
    try {
      const items = await structureTextItems(options);
      setAiSuggestedItems(items);
      return items;
    } catch (err) {
      setError(mapAiError(err, t('structureText.fallbackError', {
        defaultValue: "Couldn't extract items — try describing them differently",
      }), t));
      return null;
    } finally {
      setIsStructuring(false);
    }
  }, [t]);

  const clearStructured = useCallback(() => {
    setAiSuggestedItems(null);
    setError(null);
  }, []);

  return { structuredItems, isStructuring, error, structure, clearStructured };
}
