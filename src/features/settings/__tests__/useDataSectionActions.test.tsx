import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real en/nb resources so plural keys and {{term}} interpolation are exercised
vi.unmock('react-i18next');

const showToast = vi.fn();
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ activeLocationId: 'loc-1' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/features/locations/useLocations', () => ({
  useLocationList: () => ({ locations: [], isLoading: false }),
}));

const { apiFetch } = await import('@/lib/api');
const { createTestI18n } = await import('@/test/i18nTestUtils');
const { useDataSectionActions } = await import('../useDataSectionActions');

const mockFetch = vi.mocked(apiFetch);

function setup(language?: string) {
  const i18n = createTestI18n();
  if (language) i18n.changeLanguage(language);
  const wrapper = ({ children }: { children: ReactNode }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
  return renderHook(() => useDataSectionActions(), { wrapper });
}

const now = new Date().toISOString();
const exportFile = JSON.stringify({
  version: 4,
  exportedAt: now,
  bins: [
    { id: 'a', name: 'Parent', items: ['x'], notes: '', tags: [], createdAt: now, updatedAt: now, shortCode: 'AAA111' },
    { id: 'b', name: 'Child', items: [], notes: '', tags: [], createdAt: now, updatedAt: now, parentShortCode: 'AAA111' },
  ],
  trashedBins: [{ id: 't', name: 'Old', items: [], notes: '', tags: [], createdAt: now, updatedAt: now }],
  areas: [{ path: 'Garage', items: ['Hammer'] }],
  unassignedItems: ['Tape'],
});

const mergePreview = {
  preview: true,
  toCreate: [{ name: 'Parent', itemCount: 1, tags: [], trashed: false, isChild: false }],
  toSkip: [{ name: 'Child', reason: 'parent not found', code: 'unresolved_parent' }],
  totalBins: 3,
  totalItems: 1,
  totalTrashedBins: 1,
  totalChildBins: 1,
  binsSkippedUnresolvedParent: 1,
  looseItemsTotal: 2,
  looseItemsToCreate: 1,
  looseItemsToSkip: 1,
};

function fileList(file: File): FileList {
  return { 0: file, length: 1, item: () => file } as unknown as FileList;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDataSectionActions JSON import', () => {
  async function selectJson(result: ReturnType<typeof setup>['result']) {
    await act(async () => {
      await result.current.handleImportFileSelected(fileList(new File([exportFile], 'b.json')), 'loc-1');
    });
  }

  it('sends trashedBins, areas and unassignedItems with the dry run', async () => {
    mockFetch.mockResolvedValue(mergePreview);
    const { result } = setup();
    act(() => result.current.setImportFormat('json'));
    await selectJson(result);

    const [path, opts] = mockFetch.mock.calls[0];
    expect(path).toBe('/api/locations/loc-1/import');
    const body = (opts as { body: Record<string, unknown> }).body;
    expect(body).toMatchObject({
      mode: 'merge',
      dryRun: true,
      areas: [{ path: 'Garage', items: ['Hammer'] }],
      unassignedItems: ['Tape'],
    });
    expect((body.trashedBins as unknown[]).length).toBe(1);
    expect((body.bins as unknown[]).length).toBe(2);
    await waitFor(() => expect(result.current.importPreview?.totalChildBins).toBe(1));
  });

  it('asks the server for a replace-mode preview instead of faking it, and caches per mode', async () => {
    const replacePreview = {
      ...mergePreview,
      toCreate: [...mergePreview.toCreate, { name: 'Child', itemCount: 0, tags: [], trashed: false, isChild: true }],
      toSkip: [],
      binsSkippedUnresolvedParent: 0,
      looseItemsToCreate: 2,
      looseItemsToSkip: 0,
    };
    mockFetch.mockResolvedValueOnce(mergePreview).mockResolvedValueOnce(replacePreview);
    const { result } = setup();
    act(() => result.current.setImportFormat('json'));
    await selectJson(result);
    await waitFor(() => expect(result.current.importPreview).not.toBeNull());

    act(() => result.current.setImportMode('replace'));
    await waitFor(() => expect(result.current.importPreview?.looseItemsToCreate).toBe(2));
    const replaceBody = (mockFetch.mock.calls[1][1] as { body: Record<string, unknown> }).body;
    expect(replaceBody).toMatchObject({ mode: 'replace', dryRun: true, unassignedItems: ['Tape'] });
    expect(result.current.importPreview?.toSkip).toEqual([]);
    expect(result.current.importPreview?.binsSkippedUnresolvedParent).toBe(0);

    // Toggling back uses the cache: no third request, and merge numbers return
    act(() => result.current.setImportMode('merge'));
    expect(result.current.importPreview?.looseItemsToSkip).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('picking a new file drops cached previews of the old file', async () => {
    mockFetch.mockResolvedValue(mergePreview);
    const { result } = setup();
    act(() => result.current.setImportFormat('json'));
    await selectJson(result);
    await waitFor(() => expect(result.current.importPreview).not.toBeNull());
    await selectJson(result);
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ...mergePreview, looseItemsToCreate: 9 });
    act(() => result.current.setImportMode('replace'));
    await waitFor(() => expect(result.current.importPreview?.looseItemsToCreate).toBe(9));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('shows an unsupported-version message instead of a generic one', async () => {
    const { result } = setup();
    act(() => result.current.setImportFormat('json'));
    const future = JSON.stringify({ version: 5, exportedAt: now, bins: [] });
    await act(async () => {
      await result.current.handleImportFileSelected(fileList(new File([future], 'f.json')), 'loc-1');
    });
    expect(showToast).toHaveBeenCalledWith({
      message: 'This file was created by a newer version of OpenBin. Update OpenBin to import it.',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  async function confirmWith(result: ReturnType<typeof setup>['result'], importResult: Record<string, unknown>) {
    mockFetch.mockResolvedValueOnce(mergePreview).mockResolvedValueOnce(importResult);
    act(() => result.current.setImportFormat('json'));
    await selectJson(result);
    await act(async () => {
      await result.current.handleConfirmImport('loc-1');
    });
    const last = showToast.mock.calls[showToast.mock.calls.length - 1][0] as { message: string };
    return last.message;
  }

  it('toast mentions skipped nested boxes and loose items (en)', async () => {
    const { result } = setup();
    const message = await confirmWith(result, {
      binsImported: 2,
      binsSkipped: 0,
      trashedBinsImported: 1,
      photosImported: 0,
      photosSkipped: 0,
      binsSkippedUnresolvedParent: 2,
      looseItemsImported: 3,
      looseItemsSkipped: 1,
    });
    expect(message).toContain('3 loose items');
    expect(message).toContain('(2 nested bins skipped: parent not found)');
    expect(message).toContain('(1 loose item skipped)');
  });

  it('toast is localized and pluralized (nb)', async () => {
    const { result } = setup('nb');
    const message = await confirmWith(result, {
      binsImported: 1,
      binsSkipped: 0,
      photosImported: 0,
      photosSkipped: 0,
      binsSkippedUnresolvedParent: 1,
      looseItemsImported: 1,
      looseItemsSkipped: 2,
    });
    expect(message).toContain('1 løs gjenstand');
    expect(message).toContain('(1 nøstet boks hoppet over: overordnet ikke funnet)');
    expect(message).toContain('(2 løse gjenstander hoppet over)');
  });

  it('toast stays unchanged for an old-style result', async () => {
    const { result } = setup();
    const message = await confirmWith(result, { binsImported: 2, binsSkipped: 1, photosImported: 0, photosSkipped: 0 });
    expect(message).toBe('Imported 2 bins (1 skipped)');
  });
});
