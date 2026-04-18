const MODE_STORAGE_KEY = "app.mode";

export const isWebMobileSyncMode = (): boolean => {
  try {
    return window.localStorage.getItem(MODE_STORAGE_KEY) === "mobile-sync";
  } catch {
    return false;
  }
};