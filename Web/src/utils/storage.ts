/**
 * Safe wrapper for browser storage APIs to prevent crashes in environments
 * where storage is restricted (e.g., Firefox Private Mode, blocked cookies).
 */

export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn("[Storage] Error reading from localStorage:", e);
    }
    return null;
  },

  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("[Storage] Error writing to localStorage:", e);
    }
  },

  removeItem: (key: string): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("[Storage] Error removing from localStorage:", e);
    }
  },

  clear: (): void => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.clear();
      }
    } catch (e) {
      console.warn("[Storage] Error clearing localStorage:", e);
    }
  }
};

export const safeSessionStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch (e) {
      console.warn("[Storage] Error reading from sessionStorage:", e);
    }
    return null;
  },

  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("[Storage] Error writing to sessionStorage:", e);
    }
  },

  removeItem: (key: string): void => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("[Storage] Error removing from sessionStorage:", e);
    }
  }
};

/**
 * Checks if a specific storage type is available and working.
 */
export const isStorageAvailable = (type: "localStorage" | "sessionStorage"): boolean => {
  try {
    if (typeof window === "undefined") return false;
    const storage = window[type];
    if (!storage) return false;
    const x = "__storage_test__";
    storage.setItem(x, x);
    storage.removeItem(x);
    return true;
  } catch (e) {
    return false;
  }
};
