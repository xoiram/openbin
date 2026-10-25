import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('react-i18next');

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ activeLocationId: 'loc-1' })),
}));
vi.mock('@/features/locations/useLocations', () => ({
  useLocationList: vi.fn(() => ({
    locations: [{ id: 'loc-1', name: 'Home', activity_retention_days: 30, trash_retention_days: 14 }],
    isLoading: false,
  })),
}));

const preview = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../useDataSectionActions', () => ({
  useDataSectionActions: () => ({
    fileInputRef: { current: null },
    exportDialogOpen: false,
    setExportDialogOpen: vi.fn(),
    exportFormat: 'zip',
    setExportFormat: vi.fn(),
    exporting: false,
    importDialogOpen: true,
    setImportDialogOpen: vi.fn(),
    importFormat: 'json',
    setImportFormat: vi.fn(),
    importMode: 'merge',
    setImportMode: vi.fn(),
    pendingData: { bins: [] },
    csvPending: null,
    zipPending: null,
    importing: false,
    importPreview: preview.current,
    handleExport: vi.fn(),
    handleImportFileClick: vi.fn(),
    handleImportFileSelected: vi.fn(),
    handleConfirmImport: vi.fn(),
    resetImportState: vi.fn(),
  }),
}));

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { DataSection } = await import('../sections/DataSection');

function renderData(language?: string) {
  return renderWithI18n(
    <MemoryRouter>
      <DataSection />
    </MemoryRouter>,
    language ? { language } : undefined,
  );
}

const base = {
  toCreate: [
    { name: 'Parent', itemCount: 2, tags: [] },
    { name: 'Same', itemCount: 0, tags: [], isChild: true },
    { name: 'Same', itemCount: 1, tags: [], isChild: true },
  ],
  toSkip: [{ name: 'Orphan', reason: 'parent not found', code: 'unresolved_parent' }],
  totalBins: 4,
  totalItems: 3,
};

beforeEach(() => {
  preview.current = null;
});

describe('DataSection import preview notes', () => {
  it('shows nested, trashed, loose and unresolved-parent lines (en)', () => {
    preview.current = {
      ...base,
      totalChildBins: 3,
      totalTrashedBins: 1,
      looseItemsToCreate: 2,
      looseItemsToSkip: 1,
      binsSkippedUnresolvedParent: 1,
    };
    renderData();
    expect(screen.getByText('3 nested bins')).toBeTruthy();
    expect(screen.getByText('1 bin in the trash')).toBeTruthy();
    expect(screen.getByText('2 loose items will be added')).toBeTruthy();
    expect(screen.getByText('1 loose item already exists and will be skipped')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('1 nested bin will be skipped because its parent was not found');
    // Repeated names must not collide
    expect(screen.getAllByText('Same')).toHaveLength(2);
  });

  it('is localized with the Norwegian default noun (nb)', () => {
    preview.current = { ...base, totalChildBins: 2, totalTrashedBins: 2, looseItemsToCreate: 1, binsSkippedUnresolvedParent: 2 };
    renderData('nb');
    expect(screen.getByText('2 nøstede bokser')).toBeTruthy();
    expect(screen.getByText('2 bokser i papirkurven')).toBeTruthy();
    expect(screen.getByText('1 løs gjenstand legges til')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('2 nøstede bokser hoppes over fordi overordnet ikke ble funnet');
  });

  it('shows no notes for an old-style or CSV preview', () => {
    preview.current = base;
    renderData();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/nested/)).toBeNull();
    expect(screen.queryByText(/loose/)).toBeNull();
  });

  it('hides lines whose count is zero', () => {
    preview.current = { ...base, totalChildBins: 0, totalTrashedBins: 0, looseItemsToCreate: 0, looseItemsToSkip: 0, binsSkippedUnresolvedParent: 0 };
    renderData();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/in the trash/)).toBeNull();
  });
});
