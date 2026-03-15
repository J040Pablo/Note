import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FOLDER_COLOR_OPTIONS } from "@utils/folderColors";

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
  accentColor: string;
  setAccentColor: (color: string) => void;
  accentPresets: string[];
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

const STORAGE_MODE_KEY = "settings.theme.mode";
const STORAGE_ACCENT_KEY = "settings.theme.accent";

export const accentPresets = FOLDER_COLOR_OPTIONS.map((option) => option.hex.toLowerCase());

const isValidHexColor = (value: string): boolean => /^#([0-9A-Fa-f]{6})$/.test(value);

const normalizeHex = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const raw = hex.replace("#", "");
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16)
  };
};

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminanceFromHex = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

const contrastRatio = (a: string, b: string): number => {
  const l1 = luminanceFromHex(a);
  const l2 = luminanceFromHex(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
};

const mixHex = (base: string, target: string, amount: number): string => {
  const b = hexToRgb(base);
  const t = hexToRgb(target);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * amount);
  const toHex = (v: number) => v.toString(16).padStart(2, "0").toUpperCase();
  return `#${toHex(mix(b.r, t.r))}${toHex(mix(b.g, t.g))}${toHex(mix(b.b, t.b))}`;
};

const ensureAccentContrast = (
  accent: string,
  background: string,
  mode: "light" | "dark",
  minRatio = 2.6
): string => {
  if (contrastRatio(accent, background) >= minRatio) return accent;

  const target = mode === "dark" ? "#FFFFFF" : "#000000";
  let candidate = accent;

  for (let i = 0; i < 8; i += 1) {
    candidate = mixHex(candidate, target, 0.2);
    if (contrastRatio(candidate, background) >= minRatio) {
      return candidate;
    }
  }

  return candidate;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const system = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>("system");
  const [accentColor, setAccentColorState] = useState<string>(accentPresets[0]);

  useEffect(() => {
    (async () => {
      try {
        const [savedMode, savedAccent] = await Promise.all([
          AsyncStorage.getItem(STORAGE_MODE_KEY),
          AsyncStorage.getItem(STORAGE_ACCENT_KEY)
        ]);

        if (savedMode === "light" || savedMode === "dark" || savedMode === "system") {
          setMode(savedMode);
        }

        if (savedAccent) {
          const normalized = normalizeHex(savedAccent);
          if (isValidHexColor(normalized)) {
            setAccentColorState(normalized);
          }
        }
      } catch {
        // Keep defaults when persistence fails.
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_MODE_KEY, mode).catch(() => undefined);
  }, [mode]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_ACCENT_KEY, accentColor).catch(() => undefined);
  }, [accentColor]);

  const setAccentColor = (input: string) => {
    const normalized = normalizeHex(input);
    if (!isValidHexColor(normalized)) return;
    setAccentColorState(normalized);
  };

  const theme: Theme = useMemo(() => {
    const effectiveMode: "light" | "dark" =
      mode === "system" ? (system === "dark" ? "dark" : "light") : mode;

    const basePalette = effectiveMode === "dark" ? darkPalette : lightPalette;
    const adjustedAccent = ensureAccentContrast(accentColor, basePalette.background, effectiveMode);
    const selectedOnPrimary = luminanceFromHex(adjustedAccent) > 0.42 ? "#111827" : "#ffffff";

    return {
      mode: effectiveMode,
      colors: {
        ...basePalette,
        primary: adjustedAccent,
        accent: adjustedAccent,
        onPrimary: selectedOnPrimary
      }
    };
  }, [accentColor, mode, system]);

  return (
    <ThemeContext.Provider
      value={{ theme, mode, setMode, accentColor, setAccentColor, accentPresets }}
    >
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

