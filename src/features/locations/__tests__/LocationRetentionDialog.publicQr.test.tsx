import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TERMINOLOGY } from '@/lib/terminology';
import type { Location } from '@/types';
import { LocationRetentionDialog } from '../LocationRetentionDialog';

const updateLocationMock = vi.fn();

vi.mock('../useLocations', () => ({
  updateLocation: (...args: unknown[]) => updateLocationMock(...args),
}));
vi.mock('@/lib/terminology', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/terminology')>()),
  useTerminology: () => DEFAULT_TERMINOLOGY,
}));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'l1',
    name: 'Home',
    role: 'admin',
    created_by: 'u1',
    invite_code: 'ABC',
    activity_retention_days: 90,
    trash_retention_days: 30,
    app_name: 'OpenBin',
    term_bin: '',
    term_location: '',
    term_area: '',
    default_join_role: 'member',
    public_qr_access: false,
    public_qr_photos: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderDialog(location: Location) {
  return render(<LocationRetentionDialog location={location} open onOpenChange={vi.fn()} />);
}

const accessSwitch = () => screen.getByRole('switch', { name: 'Public QR access' });
const photosSwitch = () => screen.getByRole('switch', { name: 'Include photos' });

beforeEach(() => {
  updateLocationMock.mockReset();
  updateLocationMock.mockResolvedValue(undefined);
});

describe('LocationRetentionDialog — public QR access', () => {
  it('starts off, and hides the photos switch while access is off', () => {
    renderDialog(makeLocation());
    expect(accessSwitch().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('switch', { name: 'Include photos' })).toBeNull();
  });

  it('reveals the photos switch (on by default) once access is turned on', () => {
    renderDialog(makeLocation());
    fireEvent.click(accessSwitch());
    expect(accessSwitch().getAttribute('aria-checked')).toBe('true');
    expect(photosSwitch().getAttribute('aria-checked')).toBe('true');
  });

  it('reflects the saved values', () => {
    renderDialog(makeLocation({ public_qr_access: true, public_qr_photos: false }));
    expect(accessSwitch().getAttribute('aria-checked')).toBe('true');
    expect(photosSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('warns that anyone with a label can see the contents', () => {
    renderDialog(makeLocation());
    expect(screen.getByText(/Anyone who has a label or its link can see the contents/)).toBeTruthy();
    expect(screen.getByText(/Private bins are never shown/)).toBeTruthy();
  });

  it('saves both switches with the other settings', async () => {
    renderDialog(makeLocation());
    fireEvent.click(accessSwitch());
    fireEvent.click(photosSwitch());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateLocationMock).toHaveBeenCalledTimes(1));
    expect(updateLocationMock).toHaveBeenCalledWith('l1', {
      activity_retention_days: 90,
      trash_retention_days: 30,
      default_join_role: 'member',
      public_qr_access: true,
      public_qr_photos: false,
    });
  });

  it('keeps access off when saving unrelated changes', async () => {
    renderDialog(makeLocation());
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateLocationMock).toHaveBeenCalled());
    expect(updateLocationMock.mock.calls[0][1]).toMatchObject({ public_qr_access: false });
  });
});
