import { safeLocalStorage } from "../utils/storage";

const MODE_STORAGE_KEY = "app.mode";

export const isWebMobileSyncMode = (): boolean => {
  return safeLocalStorage.getItem(MODE_STORAGE_KEY) === "mobile-sync";
};