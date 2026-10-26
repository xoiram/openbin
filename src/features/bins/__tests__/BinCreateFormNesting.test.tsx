import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const mockAddPhotosFromFiles = vi.fn();

import type { Bin } from "@/types";

vi.mock('../usePhotoAnalysis', () => ({
  usePhotoAnalysis: () => ({
    fileInputRef: { current: null },
    photos: [] as File[],
    photoPreviews: [] as string[],
    analyzing: false,
    analyzeError: null,
    analyzeMode: 'idle' as const,
    analyzePartialText: '',
    cancelAnalyze: vi.fn(),
    handlePhotoSelect: vi.fn(),
    handleRemovePhoto: vi.fn(),
    addPhotosFromFiles: mockAddPhotosFromFiles,
    handleAnalyze: vi.fn(),
    handleReanalyze: vi.fn(),
  }),
}));

vi.mock('@/features/ai/useAiSettings', () => ({
  useAiSettings: () => ({ settings: null, isLoading: false }),
}));

vi.mock('@/features/ai/useAiProviderSetup', () => ({
  useAiProviderSetup: () => ({ configured: false }),
}));

vi.mock('@/lib/aiToggle', () => ({
  useAiEnabled: () => ({ aiEnabled: false }),
}));

vi.mock('@/features/areas/useAreas', () => ({
  useAreaList: () => ({ areas: [] }),
  buildAreaTree: () => [],
  flattenAreaTree: () => [],
  getAreaPath: () => '',
  notifyAreasChanged: () => {},
}));

vi.mock('../useCustomFields', () => ({
  useCustomFields: () => ({ fields: [] }),
}));

vi.mock('../useQuickAdd', () => ({
  useQuickAdd: () => ({
    value: '',
    setValue: vi.fn(),
    saving: false,
    state: 'input',
    expandedText: '',
    setExpandedText: vi.fn(),
    checked: new Map(),
    structuredItems: null,
    isStructuring: false,
    structureError: null,
    selectedCount: 0,
    handleAdd: vi.fn(),
    handlePaste: vi.fn(),
    handleAiClick: vi.fn(),
    handleExpandedKeyDown: vi.fn(),
    handleExtractClick: vi.fn(),
    toggleChecked: vi.fn(),
    handleConfirmAdd: vi.fn(),
    backToExpanded: vi.fn(),
    cancelExpanded: vi.fn(),
  }),
}));

vi.mock('@/lib/useDictation', () => ({
  useDictation: () => ({
    state: 'idle',
    transcript: '',
    error: null,
    duration: 0,
    structuredItems: null,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    editTranscript: vi.fn(),
    submitEditedTranscript: vi.fn(),
  }),
}));

vi.mock('@/lib/audioRecorder', () => ({
  isRecordingSupported: () => false,
}));

vi.mock('@/features/bins/PhotoBulkAdd', () => ({
  PhotoBulkAdd: () => <div data-testid="photo-bulk-add">wizard</div>,
}));

vi.mock('@/lib/usePlan', () => ({
  usePlan: () => ({
    planInfo: {
      plan: 'pro', status: 'active', activeUntil: null, previousSubStatus: null,
      selfHosted: true, locked: false, features: {},
      upgradeUrl: null, upgradePlusUrl: null, upgradeProUrl: null, portalUrl: null, subscribePlanUrl: null,
      upgradeAction: null, upgradePlusAction: null, upgradeProAction: null, subscribePlanAction: null, portalAction: null,
      canDowngradeToFree: false, aiCredits: null, cancelAtPeriodEnd: null, billingPeriod: null, trialPeriodDays: 7,
    },
    isLoading: false,
    isPro: false, isPlus: false, isFree: false, isSelfHosted: true, isLocked: false,
    isGated: () => false,
    refresh: vi.fn(), usage: null, overLimits: null, isOverAnyLimit: false,
    isLocationOverLimit: () => false, refreshUsage: vi.fn(),
  }),
}));

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
    area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
  }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    activeLocationId: 'loc-1',
    demoMode: false,
    loading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
    setActiveLocationId: vi.fn(),
    updateUser: vi.fn(),
    deleteAccount: vi.fn(),
    recoverAccount: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function mkBin(id: string, name: string, extra: Partial<Bin> = {}): Bin {
  return {
    id, short_code: id.toUpperCase(), location_id: 'loc-1', name, area_id: null, area_name: '', items: [], notes: '', tags: [],
    icon: '', color: '', card_style: '', created_by: 'u1', created_by_name: 'U', visibility: 'location', custom_fields: {},
    created_at: '', updated_at: '', ...extra,
  };
}

const mockBins: Bin[] = [
  mkBin('toolbox', 'Toolbox', { area_id: 'a1', area_name: 'Garage' }),
  mkBin('safe', 'Safe', { area_id: 'a2', area_name: 'Office', visibility: 'private' }),
  mkBin('bits', 'Drill bits', { parent_bin_id: 'toolbox', parent_bin_name: 'Toolbox', area_name: 'Garage' }),
];

vi.mock('../useBins', () => ({
  useBinList: () => ({ bins: mockBins, isLoading: false }),
  useBinSearch: ({ topLevelOnly }: { topLevelOnly?: boolean } = {}) => ({
    bins: topLevelOnly ? mockBins.filter((b) => !b.parent_bin_id) : mockBins,
    isLoading: false,
  }),
  useChildBins: (parentId?: string) => ({ bins: mockBins.filter((b) => b.parent_bin_id === parentId), isLoading: false }),
  useBin: (id?: string) => ({ bin: mockBins.find((b) => b.id === id), isLoading: false }),
}));

import { BinCreateForm } from '../BinCreateForm';

function renderForm(props: Partial<React.ComponentProps<typeof BinCreateForm>> = {}) {
  const onSubmit = vi.fn();
  render(
    <MemoryRouter>
      <BinCreateForm mode="full" locationId="loc-1" onSubmit={onSubmit} {...props} />
    </MemoryRouter>,
  );
  return onSubmit;
}

function openMore() {
  fireEvent.click(screen.getByText('More options'));
}

async function pickParent(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /Not inside another bin/ }));
  fireEvent.click(await screen.findByText(name));
}

describe('BinCreateForm nesting', () => {
  it('has an "Inside" picker under More options', () => {
    renderForm();
    openMore();
    expect(screen.getByText('Inside')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Not inside another bin/ })).toBeInTheDocument();
    expect(screen.queryByTestId('inherited-area')).not.toBeInTheDocument();
  });

  it('shows the parent area read-only and submits parentBinId without areaId', async () => {
    const onSubmit = renderForm();
    openMore();
    await pickParent('Toolbox');
    await waitFor(() => expect(screen.getByTestId('inherited-area')).toHaveTextContent('Garage'));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Screws' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Screws', parentBinId: 'toolbox', areaId: null, visibility: 'location' }));
  });

  it('forces private visibility under a private parent', async () => {
    const onSubmit = renderForm();
    openMore();
    await pickParent('Safe');
    expect(await screen.findByText(/Must stay private while the parent bin is private/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Everyone/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Passports' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ parentBinId: 'safe', visibility: 'private' }));
  });

  it('preselects the parent and lets the user clear it', async () => {
    const onSubmit = renderForm({ initialParentBinId: 'toolbox' });
    // More options starts open when a parent is preselected
    expect(screen.getByRole('button', { name: /Toolbox/ })).toBeInTheDocument();
    expect(screen.getByTestId('inherited-area')).toHaveTextContent('Garage');
    fireEvent.click(screen.getByRole('button', { name: /Toolbox/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Not inside another bin/ }));
    expect(screen.queryByTestId('inherited-area')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Loose' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ parentBinId: null }));
  });

  it('drops a preselected parent that is itself a child', async () => {
    const onSubmit = renderForm({ initialParentBinId: 'bits' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ parentBinId: null }));
  });
});
