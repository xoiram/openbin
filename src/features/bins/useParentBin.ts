import type { Bin } from '@/types';
import { useBin } from './useBins';

/** The bin with the given id, fetched by id (nothing is fetched for a null id). */
export function useParentBin(parentBinId: string | null | undefined): Bin | undefined {
  const { bin } = useBin(parentBinId ?? undefined);
  return parentBinId ? (bin ?? undefined) : undefined;
}
