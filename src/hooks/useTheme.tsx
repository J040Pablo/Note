import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

export type ThemeMode = "light" | "dark" | "system";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24
} as const;

interface Theme {
  mode: Exclude<ThemeMode, "system">;
  colors: {
    background: string;
    surface: string;
    surfaceElevated: string;
    card: string;
    textPrimary: string;
    textSecondary: string;
    primary: string;
    onPrimary: string;
    accent: string;
    border: string;
    danger: string;
    priorityLow: string;
    priorityMedium: string;
    priorityHigh: string;
  };
}

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const lightPalette: Theme["colors"] = {
  background: "#f9fafb",
  surface: "#f9fafb",
  surfaceElevated: "#ffffff",
  card: "#ffffff",
  textPrimary: "#0f172a",
  textSecondary: "#6b7280",
  primary: "#6366f1",
  onPrimary: "#ffffff",
  accent: "#22c55e",
  border: "#e5e7eb",
  danger: "#ef4444",
  priorityLow: "#9ca3af",
  priorityMedium: "#f97316",
  priorityHigh: "#ef4444"
};

const darkPalette: Theme["colors"] = {
  background: "#020617",
  surface: "#020617",
  surfaceElevated: "#020617",
  card: "#0f172a",
  textPrimary: "#e5e7eb",
  textSecondary: "#9ca3af",
  primary: "#818cf8",
  onPrimary: "#020617",
  accent: "#4ade80",
  border: "#1f2937",
  danger: "#f97373",
  priorityLow: "#6b7280",
  priorityMedium: "#fb923c",
  priorityHigh: "#f97373"
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");

  const theme: Theme = useMemo(() => {
    const effectiveMode: "light" | "dark" =
      mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
    return {
      mode: effectiveMode,
      colors: effectiveMode === "dark" ? darkPalette : lightPalette
    };
  }, [mode, system]);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
};

