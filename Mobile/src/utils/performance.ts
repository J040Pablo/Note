/**
 * Performance utilities for optimized rendering and interactions
 */

/**
 * Debounce function - delays execution of callback
 */
export const debounce = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      callback(...args);
      timeoutId = null;
    }, delay);
  };
};

/**
 * Throttle function - limits execution frequency
 */
export const throttle = <T extends (...args: any[]) => any>(
  callback: T,
  interval: number
): ((...args: Parameters<T>) => void) => {
  let lastRun = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastRun = now - lastRun;

    if (timeSinceLastRun >= interval) {
      callback(...args);
      lastRun = now;
    } else {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        callback(...args);
        lastRun = Date.now();
      }, interval - timeSinceLastRun);
    }
  };
};

/**
 * Request animation frame debounce - for smooth animations
 */
export const rafDebounce = <T extends (...args: any[]) => any>(
  callback: T
): ((...args: Parameters<T>) => void) => {
  let frameId: number | null = null;

  return (...args: Parameters<T>) => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
    frameId = requestAnimationFrame(() => {
      callback(...args);
      frameId = null;
    });
  };
};
