import { useCallback, useEffect, useRef, useState } from 'react';

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

/**
 * Positions a dropdown panel just below its trigger (viewport coordinates, so it can be portalled out of
 * clipping/transformed ancestors such as a dialog panel) and closes it on an outside mousedown. The
 * trigger lives in `containerRef`, the panel in `menuRef`.
 */
export function useAnchoredDropdown(open: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [pos, setPos] = useState<DropdownPosition | null>(null);

  const reposition = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const vv = window.visualViewport;
      const top = rect.bottom + 4 + (vv?.offsetTop ?? 0);
      const left = rect.left + (vv?.offsetLeft ?? 0);
      const width = rect.width;
      setPos((prev) => (prev && prev.top === top && prev.left === left && prev.width === width ? prev : { top, left, width }));
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    reposition();
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    }
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open, reposition, onClose]);

  return { containerRef, menuRef, pos };
}
