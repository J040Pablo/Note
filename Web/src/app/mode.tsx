import React from "react";

export type AppMode = "standalone" | "mobile-sync";

type AppModeContextValue = {
  mode: AppMode | null;
  ready: boolean;
  setMode: (nextMode: AppMode) => void;
  clearMode: () => void;
};

const MODE_STORAGE_KEY = "app.mode";

const AppModeContext = React.createContext<AppModeContextValue | null>(null);

export const AppModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = React.useState<AppMode | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (stored === "standalone" || stored === "mobile-sync") {
      setModeState(stored);
    }
    setReady(true);
  }, []);

  const setMode = React.useCallback((nextMode: AppMode) => {
    setModeState(nextMode);
    localStorage.setItem(MODE_STORAGE_KEY, nextMode);
  }, []);

  const clearMode = React.useCallback(() => {
    setModeState(null);
    localStorage.removeItem(MODE_STORAGE_KEY);
  }, []);

  const value = React.useMemo<AppModeContextValue>(
    () => ({
      mode,
      ready,
      setMode,
      clearMode,
    }),
    [mode, ready, setMode, clearMode]
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
};

export const useAppMode = (): AppModeContextValue => {
  const context = React.useContext(AppModeContext);
  if (!context) {
    throw new Error("useAppMode must be used within AppModeProvider");
  }
  return context;
};
