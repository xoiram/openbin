import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BinCreateFormData } from '../BinCreateForm';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ activeLocationId: 'loc-1', token: 't' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({ bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins', area: 'area', Area: 'Area' }),
}));
vi.mock('@/features/photos/usePhotos', () => ({ addPhoto: vi.fn() }));
vi.mock('@/features/photos/compressImage', () => ({ compressImage: vi.fn() }));
vi.mock('../BinCreateSuccess', () => ({ BinCreateSuccess: () => <div>success</div> }));

const addBinMock = vi.fn().mockResolvedValue({ id: 'new-1' });
vi.mock('../useBins', () => ({
  addBin: (...a: unknown[]) => addBinMock(...a),
  useAllTags: () => [],
}));
vi.mock('../BinCreateForm', () => ({
  BinCreateForm: (props: { initialParentBinId?: string | null; onSubmit: (d: BinCreateFormData) => void }) => (
    <button
      type="button"
      onClick={() => props.onSubmit({
        name: 'N', items: [], notes: '', tags: [], areaId: null, parentBinId: props.initialParentBinId ?? null,
        icon: '', color: '', cardStyle: '', visibility: 'location', customFields: {}, photos: [],
      })}
    >
      parent:{props.initialParentBinId ?? 'none'}
    </button>
  ),
}));

import { BinCreateDialog } from '../BinCreateDialog';

describe('BinCreateDialog parentBinId', () => {
  it('passes the preselected parent to the form and creates the box inside it', async () => {
    render(<BinCreateDialog open onOpenChange={vi.fn()} parentBinId="toolbox" />);
    fireEvent.click(screen.getByRole('button', { name: 'parent:toolbox' }));
    await waitFor(() => expect(addBinMock).toHaveBeenCalledWith(expect.objectContaining({ parentBinId: 'toolbox' })));
  });
});
