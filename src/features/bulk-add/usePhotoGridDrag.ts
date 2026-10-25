import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/toast';
import { useTerminology } from '@/lib/terminology';
import type { ActiveDrag, DragPayload, DropTarget, KeyboardMoveState, PointerPayload } from './photoGridTypes';
import type { BulkAddAction, BulkAddState } from './useBulkGroupAdd';
import { MAX_PHOTOS_PER_GROUP } from './useBulkGroupAdd';

const TOUCH_THRESHOLD = 6;
const MOUSE_THRESHOLD = 3;
const RECEIVE_ANIMATION_MS = 280;

function hitTest(x: number, y: number): DropTarget {
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof HTMLElement)) return null;
  if (el.closest('[data-split-zone]')) return { type: 'split' };
  const binEl = el.closest<HTMLElement>('[data-bin-id]');
  if (binEl) {
    const id = binEl.getAttribute('data-bin-id');
    if (id) return { type: 'bin', groupId: id };
  }
  return null;
}

function vibrate(ms: number) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms);
  }
}

type DragState =
  | { phase: 'idle' }
  | { phase: 'pending'; payload: DragPayload; startX: number; startY: number; pointerId: number }
  | { phase: 'active'; drag: ActiveDrag; pointerId: number };

interface UsePhotoGridDragArgs {
  state: BulkAddState;
  dispatch: React.Dispatch<BulkAddAction>;
}

export interface UsePhotoGridDragResult {
  /** Currently rendered drag overlay payload, or null when idle/pending. */
  activeDrag: ActiveDrag | null;
  keyboardMove: KeyboardMoveState | null;
  /** Bin id to flash with the receive animation; null when no recent receive. */
  recentlyReceivedId: string | null;
  /** sr-only announcement for keyboard moves. */
  announcement: string;
  showSplitZone: boolean;
  splitZoneActive: boolean;
  showKeyboardSplitButton: boolean;
  /** Pointer-down handler bound to the top photo of each stack. */
  onPhotoPointerDown: (e: React.PointerEvent<HTMLDivElement>, payload: PointerPayload) => void;
  /** Enter/Space handler for keyboard moves. */
  onPhotoKeyDown: (e: React.KeyboardEvent<HTMLDivElement>, payload: KeyboardMoveState) => void;
  /** Click handler for the keyboard "Move to a new bin" button (the keyboard analog of the split drop zone). */
  onKeyboardSplit: () => void;
}

/**
 * Drag-and-drop state machine for the photo grouping grid:
 *   - pointer drag with movement-threshold (mouse vs touch) and pointer-id capture
 *   - hit-test against drop targets via document.elementFromPoint
 *   - keyboard alternative (Enter/Space to grab, navigate, drop; Escape to cancel)
 *   - recently-received flash animation for the destination bin
 *   - undo toast + auto-clear for JOIN/SPLIT/MOVE actions surfaced via state.lastToggle
 */
export function usePhotoGridDrag({ state, dispatch }: UsePhotoGridDragArgs): UsePhotoGridDragResult {
  const { t } = useTranslation('bulkAdd');
  const term = useTerminology();
  const { showToast } = useToast();
  const lastToggleRef = useRef<typeof state.lastToggle>(null);
  const [drag, setDrag] = useState<DragState>({ phase: 'idle' });
  const [keyboardMove, setKeyboardMove] = useState<KeyboardMoveState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [recentlyReceivedId, setRecentlyReceivedId] = useState<string | null>(null);
  const receiveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashReceive = useCallback((groupId: string) => {
    if (receiveTimerRef.current) clearTimeout(receiveTimerRef.current);
    setRecentlyReceivedId(groupId);
    receiveTimerRef.current = setTimeout(() => {
      setRecentlyReceivedId(null);
      receiveTimerRef.current = null;
    }, RECEIVE_ANIMATION_MS);
  }, []);

  useEffect(
    () => () => {
      if (receiveTimerRef.current) clearTimeout(receiveTimerRef.current);
    },
    [],
  );

  // Surface a new lastToggle as a toast.
  useEffect(() => {
    if (state.lastToggle && state.lastToggle !== lastToggleRef.current) {
      lastToggleRef.current = state.lastToggle;
      showToast({
        message:
          state.lastToggle.verb === 'Joined'
            ? t('grid.joined', { defaultValue: 'Joined' })
            : t('grid.split', { defaultValue: 'Split' }),
        duration: 4000,
        action: {
          label: t('grid.undo', { defaultValue: 'Undo' }),
          onClick: () => dispatch({ type: 'UNDO_LAST_TOGGLE' }),
        },
      });
      const timer = setTimeout(() => dispatch({ type: 'CLEAR_LAST_TOGGLE' }), 4000);
      return () => clearTimeout(timer);
    }
    if (!state.lastToggle) lastToggleRef.current = null;
  }, [state.lastToggle, showToast, dispatch, t]);

  // Window listeners for pointermove / pointerup during drag.
  useEffect(() => {
    if (drag.phase === 'idle') return;

    const handleMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      if (drag.phase === 'pending') {
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        const threshold =
          drag.payload.pointerType === 'touch' ? TOUCH_THRESHOLD : MOUSE_THRESHOLD;
        if (Math.hypot(dx, dy) >= threshold) {
          e.preventDefault();
          const dropTarget = hitTest(e.clientX, e.clientY);
          setDrag({
            phase: 'active',
            pointerId: drag.pointerId,
            drag: { ...drag.payload, x: e.clientX, y: e.clientY, dropTarget },
          });
          vibrate(8);
        }
      } else {
        e.preventDefault();
        const dropTarget = hitTest(e.clientX, e.clientY);
        setDrag({
          phase: 'active',
          pointerId: drag.pointerId,
          drag: { ...drag.drag, x: e.clientX, y: e.clientY, dropTarget },
        });
      }
    };

    const handleUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      if (drag.phase === 'active') {
        const { dropTarget, photoId, sourceGroupId, sourceGroupSize } = drag.drag;
        if (dropTarget?.type === 'bin' && dropTarget.groupId !== sourceGroupId) {
          dispatch({
            type: 'MOVE_PHOTO_TO_GROUP',
            photoId,
            targetGroupId: dropTarget.groupId,
          });
          flashReceive(dropTarget.groupId);
          vibrate(12);
        } else if (dropTarget?.type === 'split' && sourceGroupSize > 1) {
          dispatch({ type: 'MOVE_PHOTO_TO_NEW_GROUP', photoId });
          vibrate(12);
        }
      }
      setDrag({ phase: 'idle' });
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [drag, dispatch, flashReceive]);

  // Escape cancels keyboard move.
  useEffect(() => {
    if (!keyboardMove) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setKeyboardMove(null);
        setAnnouncement(t('grid.announce.canceled', { defaultValue: 'Move canceled.' }));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [keyboardMove, t]);

  const onPhotoPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, payload: PointerPayload) => {
      if (e.button !== undefined && e.button !== 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      setDrag({
        phase: 'pending',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        payload: {
          ...payload,
          offsetX: e.clientX - rect.left,
          offsetY: e.clientY - rect.top,
          pointerType: e.pointerType,
        },
      });
    },
    [],
  );

  const onPhotoKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>, payload: KeyboardMoveState) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!keyboardMove) {
        setKeyboardMove(payload);
        setAnnouncement(
          t('grid.announce.moving', {
            defaultValue: 'Moving photo {{index}}. Press another photo to move it, or press Escape to cancel.',
            index: payload.indexLabel,
          }),
        );
      } else if (keyboardMove.photoId === payload.photoId) {
        setKeyboardMove(null);
        setAnnouncement(t('grid.announce.canceled', { defaultValue: 'Move canceled.' }));
      } else if (keyboardMove.sourceGroupId === payload.sourceGroupId) {
        setAnnouncement(
          t('grid.announce.sameBin', { defaultValue: 'That photo is in the same {{bin}}. Pick a different {{bin}}.', bin: term.bin }),
        );
      } else {
        const targetBinCount = state.groups.find((g) => g.id === payload.sourceGroupId)?.photos.length ?? 0;
        if (targetBinCount + 1 > MAX_PHOTOS_PER_GROUP) {
          setAnnouncement(
            t('grid.announce.targetFull', {
              defaultValue: 'Target {{bin}} is full (max {{max}} photos).',
              bin: term.bin,
              max: MAX_PHOTOS_PER_GROUP,
            }),
          );
          return;
        }
        dispatch({
          type: 'MOVE_PHOTO_TO_GROUP',
          photoId: keyboardMove.photoId,
          targetGroupId: payload.sourceGroupId,
        });
        flashReceive(payload.sourceGroupId);
        setAnnouncement(t('grid.announce.moved', { defaultValue: 'Moved photo {{index}}.', index: keyboardMove.indexLabel }));
        setKeyboardMove(null);
      }
    },
    [keyboardMove, state.groups, dispatch, flashReceive, t],
  );

  const onKeyboardSplit = useCallback(() => {
    if (!keyboardMove) return;
    dispatch({ type: 'MOVE_PHOTO_TO_NEW_GROUP', photoId: keyboardMove.photoId });
    setAnnouncement(
      t('grid.announce.movedToNew', {
        defaultValue: 'Photo {{index}} moved to a new {{bin}}.',
        bin: term.bin,
        index: keyboardMove.indexLabel,
      }),
    );
    setKeyboardMove(null);
  }, [keyboardMove, dispatch, t]);

  const activeDrag = drag.phase === 'active' ? drag.drag : null;
  const showSplitZone = activeDrag !== null && activeDrag.sourceGroupSize > 1;
  const splitZoneActive = activeDrag?.dropTarget?.type === 'split';
  const showKeyboardSplitButton = keyboardMove !== null && keyboardMove.sourceGroupSize > 1;

  return {
    activeDrag,
    keyboardMove,
    recentlyReceivedId,
    announcement,
    showSplitZone,
    splitZoneActive,
    showKeyboardSplitButton,
    onPhotoPointerDown,
    onPhotoKeyDown,
    onKeyboardSplit,
  };
}
