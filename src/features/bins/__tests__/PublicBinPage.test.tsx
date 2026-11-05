import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { ApiError, apiFetch } from '@/lib/api';
import { PublicBinFallback } from '../PublicBinFallback';
import { PublicBinPage } from '../PublicBinPage';
import type { PublicBin } from '../usePublicBin';

const mockApiFetch = vi.mocked(apiFetch);

const toolbox: PublicBin = {
  id: 'b1',
  name: 'Toolbox',
  area_name: 'Garage',
  notes: 'Top shelf',
  tags: ['garage'],
  icon: '',
  color: '',
  card_style: '',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  items: [
    { name: 'Hammer', quantity: null },
    { name: 'Nails', quantity: 200 },
  ],
  custom_fields: [{ name: 'Shelf', value: 'A3' }],
  photos: [{ id: 'p1', filename: 'front.jpg' }],
  parent: { id: 'shed', name: 'Shed' },
  children: [{ id: 'c1', name: 'Screws', icon: '', color: '', item_count: 1 }],
};

/** Records where the router ends up, to assert redirects. */
function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{`${loc.pathname}${loc.search}`}</div>;
}

// Deliberately no auth, location, plan or terminology providers: anonymous visitors have none of them.
function renderPage(binId = 'b1') {
  return render(
    <MemoryRouter initialEntries={[`/bin/${binId}`]}>
      <Routes>
        <Route path="/bin/:id" element={<PublicBinPage binId={binId} />} />
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PublicBinPage', () => {
  it('renders the box without any app providers', async () => {
    mockApiFetch.mockResolvedValue(toolbox);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Toolbox' })).toBeTruthy();
    expect(screen.getByText('Garage')).toBeTruthy();
    expect(screen.getByText('Hammer')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
    expect(screen.getByText('Top shelf')).toBeTruthy();
    expect(screen.getByText('garage')).toBeTruthy();
    expect(screen.getByText('Shelf')).toBeTruthy();
    expect(screen.getByText('A3')).toBeTruthy();
  });

  it('serves photos from the public routes', async () => {
    mockApiFetch.mockResolvedValue(toolbox);
    renderPage();

    const img = await screen.findByAltText('front.jpg');
    expect(img.getAttribute('src')).toBe('/api/public/bins/b1/photos/p1/thumb');
    expect(img.closest('a')?.getAttribute('href')).toBe('/api/public/bins/b1/photos/p1/file');
  });

  it('links to the parent and child boxes, which open their own public views', async () => {
    mockApiFetch.mockResolvedValue(toolbox);
    renderPage();

    const parent = await screen.findByRole('link', { name: /Inside Shed/ });
    expect(parent.getAttribute('href')).toBe('/bin/shed');
    const child = screen.getByRole('link', { name: /Screws/ });
    expect(child.getAttribute('href')).toBe('/bin/c1');
    expect(screen.getByText('1 item')).toBeTruthy();
  });

  it('offers a login link that returns to this box, and has no edit controls', async () => {
    mockApiFetch.mockResolvedValue(toolbox);
    renderPage();

    const login = await screen.findByRole('link', { name: 'Log in to edit' });
    expect(login.getAttribute('href')).toBe('/login?next=%2Fbin%2Fb1');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('hides sections that are empty', async () => {
    mockApiFetch.mockResolvedValue({ ...toolbox, photos: [], items: [], notes: '  ', tags: [], custom_fields: [], children: [], parent: null });
    renderPage();

    await screen.findByRole('heading', { name: 'Toolbox' });
    for (const title of ['Photos', 'Items', 'Notes', 'Tags', 'Details', 'Contains']) {
      expect(screen.queryByText(title)).toBeNull();
    }
  });

  it('sends the visitor to login, returning to the box, when it is not publicly viewable', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(404, 'Not found'));
    renderPage();

    await waitFor(() => expect(screen.getByTestId('login-page')).toBeTruthy());
    expect(screen.getByTestId('location').textContent).toBe('/login?next=%2Fbin%2Fb1');
  });

  it('shows an error instead of redirecting when the request itself fails', async () => {
    mockApiFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    renderPage();

    expect(await screen.findByText("Couldn't load this page")).toBeTruthy();
    expect(screen.queryByTestId('login-page')).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows a loading state first', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  });
});

describe('PublicBinFallback', () => {
  const notFound = <div data-testid="not-found">Not found</div>;

  function renderFallback() {
    return render(
      <MemoryRouter>
        <PublicBinFallback binId="b1" notFound={notFound} />
      </MemoryRouter>,
    );
  }

  it('shows the read-only view, with a notice, when the box is public', async () => {
    mockApiFetch.mockResolvedValue(toolbox);
    renderFallback();

    expect(await screen.findByRole('heading', { name: 'Toolbox' })).toBeTruthy();
    expect(screen.getByText(/read-only copy/)).toBeTruthy();
    expect(screen.queryByTestId('not-found')).toBeNull();
  });

  it('shows the usual not-found state when the box is not public', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(404, 'Not found'));
    renderFallback();
    expect(await screen.findByTestId('not-found')).toBeTruthy();
  });

  it('falls back to the usual not-found state when the lookup fails', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(500, 'boom'));
    renderFallback();
    expect(await screen.findByTestId('not-found')).toBeTruthy();
  });
});
