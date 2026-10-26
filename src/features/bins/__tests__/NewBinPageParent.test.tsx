import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { BinCreateFormData } from '../BinCreateForm';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('@/features/locations/useLocations', () => ({
  useActiveLocation: () => ({ id: 'loc-1', name: 'Home' }),
}));

const addBinMock = vi.fn().mockResolvedValue({ id: 'new-1' });
vi.mock('../useBins', () => ({ addBin: (...args: unknown[]) => addBinMock(...args) }));

vi.mock('../BinCreateForm', () => ({
  BinCreateForm: (props: { initialParentBinId?: string | null; onSubmit: (d: BinCreateFormData) => void }) => (
    <button
      type="button"
      data-testid="form"
      onClick={() => props.onSubmit({
        name: 'N', items: [], notes: '', tags: [], areaId: null, parentBinId: props.initialParentBinId ?? null,
        icon: '', color: '', cardStyle: '', visibility: 'location', customFields: {}, photos: [],
      })}
    >
      parent:{props.initialParentBinId ?? 'none'}
    </button>
  ),
}));

import { NewBinPage } from '../NewBinPage';

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/bins/new" element={<NewBinPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('NewBinPage ?parent=', () => {
  it('has no preselected parent by default', () => {
    renderAt('/bins/new');
    expect(screen.getByTestId('form')).toHaveTextContent('parent:none');
  });

  it('preselects the parent from the query string and creates the box inside it', async () => {
    renderAt('/bins/new?parent=toolbox');
    expect(screen.getByTestId('form')).toHaveTextContent('parent:toolbox');
    fireEvent.click(screen.getByTestId('form'));
    await waitFor(() => expect(addBinMock).toHaveBeenCalledWith(expect.objectContaining({ parentBinId: 'toolbox', locationId: 'loc-1' })));
    expect(navigateMock).toHaveBeenCalledWith('/bin/new-1');
  });
});
