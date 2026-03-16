import { useRef, useCallback } from "react";

/**
 * Prevents duplicate navigation actions when the user taps multiple times quickly.
 *
 * How it works:
 *  - The first call to `withLock` runs the action immediately and blocks the lock.
 *  - Any subsequent call while the lock is held is silently dropped.
 *  - The lock is automatically released after `lockDurationMs` (default 500 ms),
 *    which is long enough to cover the full screen transition animation.
 *
 * Usage:
 *   const { withLock } = useNavigationLock();
 *   <Pressable onPress={() => withLock(() => navigation.navigate("Screen"))} />
 */
export function useNavigationLock(lockDurationMs = 500) {
  const isLockedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const withLock = useCallback(
    (action: () => void): void => {
      if (isLockedRef.current) return;

      isLockedRef.current = true;

      // Clear any stale timer
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      // Release lock after the animation window
      timerRef.current = setTimeout(() => {
        isLockedRef.current = false;
        timerRef.current = null;
      }, lockDurationMs);

      // Run the navigation action synchronously so the native push
      // happens on the same JS event-loop tick, before any async work.
      action();
    },
    [lockDurationMs]
  );

  return { withLock };
}
