import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/terminology', () => ({
  useTerminology: () => ({
    bin: 'bin', bins: 'bins', Bin: 'Bin', Bins: 'Bins',
    area: 'area', areas: 'areas', Area: 'Area', Areas: 'Areas',
    location: 'location', locations: 'locations', Location: 'Location', Locations: 'Locations',
  }),
}));

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('../useAreas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../useAreas')>()),
  deleteArea: vi.fn(),
}));

import { AreaCard, UnassignedAreaCard } from '../AreaCard';
import { DeleteAreaDialog } from '../AreaDialogs';

function renderCard(props: Partial<Parameters<typeof AreaCard>[0]> = {}) {
  const handlers = {
    onNavigate: vi.fn(),
    onShowItems: vi.fn(),
    onAddItem: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
  };
  render(
    <AreaCard
      id="a1"
      name="Garage"
      binCount={2}
      descendantBinCount={2}
      itemCount={5}
      descendantItemCount={5}
      looseItemCount={0}
      depth={0}
      hasChildren={false}
      isAdmin={false}
      canAddItem={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('AreaCard item count', () => {
  it('shows the item count next to the box count', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Show the 5 items in Garage' }).textContent).toBe('5 items');
    expect(screen.getByText(/2 bins/)).toBeTruthy();
  });

  it('uses the singular form for one item', () => {
    renderCard({ itemCount: 1, descendantItemCount: 1 });
    expect(screen.getByRole('button', { name: 'Show the 1 item in Garage' }).textContent).toBe('1 item');
  });

  it('shows (N total) only when the area has sub-areas and the total is larger', () => {
    renderCard({ hasChildren: true, descendantItemCount: 9 });
    expect(screen.getByRole('button', { name: /Show the 5 items/ }).textContent).toBe('5 items (9 total)');
  });

  it('omits the total without sub-areas or when it is not larger', () => {
    renderCard({ hasChildren: false, descendantItemCount: 9 });
    expect(screen.getByRole('button', { name: /Show the 5 items/ }).textContent).toBe('5 items');
  });

  it('omits the total when sub-areas add nothing', () => {
    renderCard({ hasChildren: true, descendantItemCount: 5 });
    expect(screen.getByRole('button', { name: /Show the 5 items/ }).textContent).toBe('5 items');
  });

  it('shows nothing for an area without items', () => {
    renderCard({ itemCount: 0, descendantItemCount: 0 });
    expect(screen.queryByRole('button', { name: /Show the/ })).toBeNull();
  });

  it('navigates to the items list on click without triggering the card navigation', () => {
    const h = renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Show the 5 items/ }));
    expect(h.onShowItems).toHaveBeenCalledWith('a1');
    expect(h.onNavigate).not.toHaveBeenCalled();
  });

  it('is keyboard operable without triggering the card navigation', () => {
    const h = renderCard();
    const link = screen.getByRole('button', { name: /Show the 5 items/ });
    expect(link.tabIndex).toBeGreaterThanOrEqual(0);
    // Enter/Space bubbling to the card would preventDefault the native click and navigate to the box list.
    expect(fireEvent.keyDown(link, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(link, { key: ' ' })).toBe(true);
    expect(h.onNavigate).not.toHaveBeenCalled();
  });

  it('still navigates to the box list when the card itself is clicked', () => {
    const h = renderCard();
    fireEvent.click(screen.getByText(/2 bins/));
    expect(h.onNavigate).toHaveBeenCalledWith('a1');
    expect(h.onShowItems).not.toHaveBeenCalled();
  });
});

describe('AreaCard menu', () => {
  it('offers Add item to members, who get no rename or delete', () => {
    const h = renderCard({ canAddItem: true });
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(h.onAddItem).toHaveBeenCalledWith('a1');
    expect(h.onNavigate).not.toHaveBeenCalled();
  });

  it('shows rename, delete and Add item to admins, and passes the loose item count on delete', () => {
    const h = renderCard({ isAdmin: true, canAddItem: true, looseItemCount: 3, hasChildren: true, descendantBinCount: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add item' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(h.onDelete).toHaveBeenCalledWith('a1', 'Garage', 2, undefined, 4, 3);
  });

  it('has no menu for viewers', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
  });
});

describe('UnassignedAreaCard', () => {
  it('shows and links the unassigned item count', () => {
    const onNavigate = vi.fn();
    const onShowItems = vi.fn();
    render(<UnassignedAreaCard count={1} itemCount={7} onNavigate={onNavigate} onShowItems={onShowItems} />);
    const link = screen.getByRole('button', { name: 'Show the 7 items in Unassigned' });
    expect(link.textContent).toBe('7 items');
    fireEvent.click(link);
    expect(onShowItems).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.keyDown(link, { key: 'Enter' });
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/1 bin/));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('shows no item count when there are none', () => {
    render(<UnassignedAreaCard count={2} itemCount={0} onNavigate={vi.fn()} onShowItems={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Show the/ })).toBeNull();
  });
});

describe('DeleteAreaDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  const open = (extra: object) =>
    render(<DeleteAreaDialog target={{ id: 'a1', name: 'Garage', binCount: 2, ...extra }} onOpenChange={vi.fn()} locationId="loc" />);

  it('mentions loose items becoming unassigned, in plural form', () => {
    open({ looseItemCount: 1 });
    expect(screen.getByText(/1 item placed directly in it will become unassigned/)).toBeTruthy();
  });

  it('uses the plural for several loose items and keeps the box warning', () => {
    open({ looseItemCount: 4 });
    expect(screen.getByText(/They will become unassigned\. 4 items placed directly in it will become unassigned/)).toBeTruthy();
  });

  it('mentions loose items when the area has no boxes', () => {
    open({ binCount: 0, looseItemCount: 2 });
    expect(screen.getByText(/Delete "Garage"\? 2 items placed directly/)).toBeTruthy();
  });

  it('does not mention items when there are none', async () => {
    open({ looseItemCount: 0 });
    await waitFor(() => expect(screen.getByText(/"Garage" has 2 bins/)).toBeTruthy());
    expect(screen.queryByText(/placed directly/)).toBeNull();
  });
});
