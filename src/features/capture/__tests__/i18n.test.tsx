import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Real react-i18next + real locale JSON (see src/test/i18nTestUtils.tsx).
vi.unmock('react-i18next');

const { renderWithI18n } = await import('@/test/i18nTestUtils');
const { CameraStartScreen } = await import('../CameraStartScreen');
const { AddMoreTile } = await import('@/features/bulk-add/AddMoreTile');
const { DeletePhotoDialog } = await import('@/features/photos/DeletePhotoDialog');
const { ReorganizeEmptyState } = await import('@/features/reorganize/ReorganizeStatusCards');

const noop = () => {};

describe('capture / bulk-add / photos / reorganize translations', () => {
  it('renders the camera start screen in Norwegian', () => {
    renderWithI18n(<CameraStartScreen hasCamera error={null} onStart={noop} onCancel={noop} />, { language: 'nb' });
    expect(screen.getByText('Klar til å ta bilder')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start kamera' })).toBeTruthy();
    // Reused common namespace key
    expect(screen.getByRole('button', { name: 'Avbryt' })).toBeTruthy();
  });

  it('renders the camera start screen in English', () => {
    renderWithI18n(<CameraStartScreen hasCamera={false} error={null} onStart={noop} onCancel={noop} />);
    expect(screen.getByText('Camera not available')).toBeTruthy();
  });

  it('renders the bulk-add "add more" tile in Norwegian', () => {
    renderWithI18n(<AddMoreTile sizes={{ binSize: 80, photoSize: 64, padding: 4, spread: 4, gap: 8 }} onClick={noop} />, {
      language: 'nb',
    });
    expect(screen.getByRole('button', { name: 'Legg til flere bilder' })).toBeTruthy();
  });

  it('renders the delete-photo dialog in Norwegian', () => {
    renderWithI18n(<DeletePhotoDialog open onOpenChange={noop} onConfirm={noop} />, { language: 'nb' });
    expect(screen.getByText('Slette bilde?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Slett' })).toBeTruthy();
  });

  it('renders the reorganize empty state in Norwegian', () => {
    renderWithI18n(<ReorganizeEmptyState message="x" />, { language: 'nb' });
    expect(screen.getByText('Ingen forslag ennå')).toBeTruthy();
  });
});
