import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/api';

/** What `GET /api/public/bins/:id` returns: an allowlisted, read-only view of a box (see docs/public-qr-access.md). */
export interface PublicBin {
  id: string;
  name: string;
  area_name: string;
  notes: string;
  tags: string[];
  icon: string;
  color: string;
  card_style: string;
  created_at: string;
  updated_at: string;
  items: Array<{ name: string; quantity: number | null }>;
  custom_fields: Array<{ name: string; value: string }>;
  photos: Array<{ id: string; filename: string }>;
  parent: { id: string; name: string } | null;
  children: Array<{ id: string; name: string; icon: string; color: string; item_count: number }>;
}

export function getPublicPhotoUrls(binId: string, photoId: string) {
  return {
    file: `/api/public/bins/${binId}/photos/${photoId}/file`,
    thumb: `/api/public/bins/${binId}/photos/${photoId}/thumb`,
  };
}

export type PublicBinState =
  | { status: 'loading' }
  | { status: 'ready'; bin: PublicBin }
  /** The server refused: the location has public access off, or the box is private, trashed or unknown. */
  | { status: 'unavailable' }
  /** Anything else (network down, server error): not the same as "not public", so callers must not treat it as such. */
  | { status: 'error' };

/**
 * Fetch the public view of a box. Refetches when `id` changes (child links keep the page mounted).
 * Only a 404 means "not publicly viewable"; other failures are reported as `error`.
 * Each successful load counts as a public view on the server, so this must not poll or refetch on events.
 */
export function usePublicBin(id: string | undefined): PublicBinState {
  const [state, setState] = useState<PublicBinState>({ status: 'loading' });

  useEffect(() => {
    if (!id) {
      setState({ status: 'unavailable' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    apiFetch<PublicBin>(`/api/public/bins/${encodeURIComponent(id)}`, { skipRefresh: true })
      .then((bin) => { if (!cancelled) setState({ status: 'ready', bin }); })
      .catch((err) => {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 404 ? { status: 'unavailable' } : { status: 'error' });
      });
    return () => { cancelled = true; };
  }, [id]);

  return state;
}
