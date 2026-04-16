import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FOLDER_COLOR_OPTIONS } from "@utils/folderColors";

export type ThemeMode = "light" | "dark";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24
} as const;

interface Theme {
  mode: ThemeMode;
  colors: {
    background: string;
    surface: string;
    surfaceElevated: string;
    card: string;
    textPrimary: string;
    textSecondary: string;
    primary: string;
    primaryLight: string;
    primaryDark: string;
    primaryAlpha20: string;
    onPrimary: string;
    secondary: string;
    secondaryLight: string;
    secondaryDark: string;
    secondaryAlpha20: string;
    onSecondary: string;
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
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  secondaryColor: string;
  setSecondaryColor: (color: string) => void;
  primaryPresets: string[];
  secondaryPresets: string[];
  accentColor: string;
  setAccentColor: (color: string) => void;
  accentPresets: string[];
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_THEME_KEY = "theme";
const LEGACY_STORAGE_MODE_KEY = "settings.theme.mode";
const LEGACY_STORAGE_ACCENT_KEY = "settings.theme.accent";

export const colorPresets = [
  "#FFFFFF",
  "#F3F4F6",
  "#9CA3AF",
  "#6B7280",
  "#1F2937",
  "#111827",
  "#000000",
  "#7C3AED",
  "#3B82F6",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#F472B6",
  ...FOLDER_COLOR_OPTIONS.map((option) => option.hex.toUpperCase())
].filter((hex, index, all) => all.indexOf(hex) === index);

export const primaryPresets = colorPresets;
export const secondaryPresets = colorPresets;

const DEFAULT_THEME_MODE: ThemeMode = "light";
const DEFAULT_PRIMARY = "#FFFFFF";
const DEFAULT_SECONDARY = "#111827";

interface PersistedThemeSettings {
  themeMode: ThemeMode;
  primaryColor: string;
  secondaryColor: string;
}

const isValidHexColor = (value: string): boolean => /^#([0-9A-Fa-f]{6})$/.test(value);

const normalizeHex = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith("#") ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
};

const isLightColor = (hex: string): boolean => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 200;
};

const isSimilarColor = (c1: string, c2: string): boolean => {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const diff = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
  return diff < 100;
};

const getContrastColor = (hex: string): "#000000" | "#FFFFFF" => {
  return isLightColor(hex) ? "#000000" : "#FFFFFF";
};

const adjustColor = (hex: string, amount: number): string => {
  const col = hex.replace("#", "");
  const num = parseInt(col, 16);

  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00ff) + amount;
  let b = (num & 0x0000ff) + amount;

  r = Math.max(Math.min(255, r), 0);
  g = Math.max(Math.min(255, g), 0);
  b = Math.max(Math.min(255, b), 0);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase()}`;
};

const withAlpha = (hex: string, alpha: number): string => {
  const clamped = Math.max(0, Math.min(alpha, 1));
  const alphaHex = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `${hex}${alphaHex}`;
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

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [primaryColor, setPrimaryColorState] = useState<string>(DEFAULT_PRIMARY);
  const [secondaryColor, setSecondaryColorState] = useState<string>(DEFAULT_SECONDARY);

  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedMode, savedAccent] = await Promise.all([
          AsyncStorage.getItem(STORAGE_THEME_KEY),
          AsyncStorage.getItem(LEGACY_STORAGE_MODE_KEY),
          AsyncStorage.getItem(LEGACY_STORAGE_ACCENT_KEY)
        ]);

        if (savedTheme) {
          const parsed = JSON.parse(savedTheme) as Partial<PersistedThemeSettings>;
          if (parsed.themeMode === "light" || parsed.themeMode === "dark") {
            setMode(parsed.themeMode);
          }
          if (parsed.primaryColor) {
            const normalizedPrimary = normalizeHex(parsed.primaryColor);
            if (isValidHexColor(normalizedPrimary)) {
              setPrimaryColorState(normalizedPrimary);
            }
          }
          if (parsed.secondaryColor) {
            const normalizedSecondary = normalizeHex(parsed.secondaryColor);
            if (isValidHexColor(normalizedSecondary)) {
              setSecondaryColorState(normalizedSecondary);
            }
          }
          return;
        }

        if (savedMode === "light" || savedMode === "dark") {
          setMode(savedMode);
        }
        if (savedAccent) {
          const normalized = normalizeHex(savedAccent);
          if (isValidHexColor(normalized)) {
            setSecondaryColorState(normalized);
          }
        }
      } catch {
        // Keep defaults when persistence fails.
      }
    })();
  }, []);

  useEffect(() => {
    const payload: PersistedThemeSettings = {
      themeMode: mode,
      primaryColor,
      secondaryColor
    };
    AsyncStorage.setItem(STORAGE_THEME_KEY, JSON.stringify(payload)).catch(() => undefined);
  }, [mode, primaryColor, secondaryColor]);

  const setPrimaryColor = (input: string) => {
    const normalized = normalizeHex(input);
    if (!isValidHexColor(normalized)) return;
    setPrimaryColorState(normalized);
  };

  const setSecondaryColor = (input: string) => {
    const normalized = normalizeHex(input);
    if (!isValidHexColor(normalized)) return;
    setSecondaryColorState(normalized);
  };

  const setAccentColor = setSecondaryColor;

  const theme: Theme = useMemo(() => {
    const isNeutralLight = mode === "light" && primaryColor.toUpperCase() === "#FFFFFF";

    let backgroundBase = mode === "light" ? adjustColor(primaryColor, 12) : adjustColor(primaryColor, -16);
    let primaryIsLight = isLightColor(backgroundBase);
    let textPrimary: string = getContrastColor(backgroundBase);
    let textSecondary = primaryIsLight
      ? adjustColor(backgroundBase, -110)
      : adjustColor(backgroundBase, 110);

    let background = backgroundBase;
    let surface = mode === "light"
      ? adjustColor(backgroundBase, -16)
      : adjustColor(backgroundBase, 18);
    let surfaceElevated = mode === "light"
      ? adjustColor(backgroundBase, -24)
      : adjustColor(backgroundBase, 28);
    let card = mode === "light"
      ? adjustColor(backgroundBase, -20)
      : adjustColor(backgroundBase, 24);
    let border = mode === "light"
      ? adjustColor(backgroundBase, -34)
      : adjustColor(backgroundBase, 34);

    if (isNeutralLight) {
      backgroundBase = "#FFFFFF";
      primaryIsLight = true;
      background = "#FFFFFF";
      surface = "#F3F4F6";
      surfaceElevated = "#E5E7EB";
      card = "#F9FAFB";
      border = "#E5E7EB";
      textPrimary = "#111827";
      textSecondary = "#6B7280";
    }

    let actionColor = secondaryColor;

    if (isSimilarColor(backgroundBase, actionColor)) {
      actionColor = primaryIsLight ? "#000000" : "#FFFFFF";
    }

    const actionOnColor = getContrastColor(actionColor);

    return {
      mode,
      colors: {
        background,
        surface,
        surfaceElevated,
        card,
        textPrimary,
        textSecondary,
        primary: actionColor,
        primaryLight: mixHex(actionColor, "#FFFFFF", mode === "dark" ? 0.26 : 0.18),
        primaryDark: mixHex(actionColor, "#000000", mode === "dark" ? 0.3 : 0.22),
        primaryAlpha20: withAlpha(actionColor, 0.2),
        onPrimary: actionOnColor,
        secondary: actionColor,
        secondaryLight: mixHex(actionColor, "#FFFFFF", mode === "dark" ? 0.26 : 0.18),
        secondaryDark: mixHex(actionColor, "#000000", mode === "dark" ? 0.3 : 0.22),
        secondaryAlpha20: withAlpha(actionColor, 0.2),
        onSecondary: actionOnColor,
        accent: actionColor,
        border,
        danger: mode === "dark" ? "#FCA5A5" : "#B91C1C",
        priorityLow: textSecondary,
        priorityMedium: mode === "dark" ? "#FDBA74" : "#C2410C",
        priorityHigh: mode === "dark" ? "#FCA5A5" : "#B91C1C"
      }
    };
  }, [mode, primaryColor, secondaryColor]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        mode,
        setMode,
        themeMode: mode,
        setThemeMode: setMode,
        primaryColor,
        setPrimaryColor,
        secondaryColor,
        setSecondaryColor,
        primaryPresets,
        secondaryPresets,
        accentColor: secondaryColor,
        setAccentColor,
        accentPresets: secondaryPresets
      }}
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

