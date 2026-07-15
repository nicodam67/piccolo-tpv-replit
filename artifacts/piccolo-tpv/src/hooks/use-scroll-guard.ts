import { useRef, useCallback } from 'react';
import type React from 'react';

/**
 * Shared scroll-tap guard hook.
 *
 * Prevents accidental click/tap actions when the user is actually scrolling
 * (or panning) a container. The guard tracks how far the pointer has moved
 * between pointerdown and click; if the distance exceeds TAP_SLOP pixels the
 * action is suppressed.
 *
 * Usage:
 *   const { onPointerDown, guard, guardLabel } = useScrollGuard();
 *
 *   // Attach onPointerDown to every interactive element (or a common ancestor):
 *   <button onPointerDown={onPointerDown} onClick={guard(() => doSomething())} />
 *
 *   // For <label> elements whose click must not toggle a nested <input> during scroll:
 *   <label onPointerDown={onPointerDown} onClick={guardLabel}>...</label>
 */

export const TAP_SLOP = 8; // px — exported so files can reuse the value for canvas panning

export function useScrollGuard() {
  const originRef = useRef<{ x: number; y: number } | null>(null);

  /** Capture the pointer start position. Attach to onPointerDown. */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    originRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  /**
   * Wrap a zero-argument handler so it only fires when the pointer has not
   * drifted beyond TAP_SLOP. Returns a React.MouseEvent handler suitable for
   * onClick.
   *
   * Example:  onClick={guard(() => selectItem(id))}
   */
  const guard = useCallback(
    (handler: () => void) =>
      (e: React.MouseEvent) => {
        if (originRef.current) {
          const dx = e.clientX - originRef.current.x;
          const dy = e.clientY - originRef.current.y;
          if (Math.sqrt(dx * dx + dy * dy) > TAP_SLOP) {
            originRef.current = null;
            return;
          }
        }
        originRef.current = null;
        handler();
      },
    [],
  );

  /**
   * Guard for a <label onClick> that wraps a native checkbox/radio. Calls
   * e.preventDefault() to suppress the label→input toggle when the user was
   * scrolling. On a genuine tap the event is left alone so the native
   * label behaviour still works.
   *
   * Example:  <label onPointerDown={onPointerDown} onClick={guardLabel}>
   */
  const guardLabel = useCallback((e: React.MouseEvent) => {
    if (originRef.current) {
      const dx = e.clientX - originRef.current.x;
      const dy = e.clientY - originRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > TAP_SLOP) {
        e.preventDefault();
        originRef.current = null;
        return;
      }
    }
    originRef.current = null;
  }, []);

  return { onPointerDown, guard, guardLabel };
}
