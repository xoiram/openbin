import type { Bin } from '@/types';
import { useBinList } from './useBins';

/** Looks up the bin with the given id in the location's bin list (nothing is fetched for a null id). */
export function useParentBin(parentBinId: string | null | undefined): Bin | undefined {
  const { bins } = useBinList(undefined, 'name', undefined, !parentBinId);
  return parentBinId ? bins.find((b) => b.id === parentBinId) : undefined;
}
