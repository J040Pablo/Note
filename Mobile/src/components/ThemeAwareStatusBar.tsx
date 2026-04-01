import React from "react";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useTheme } from "@hooks/useTheme";

/**
 * ThemeAwareStatusBar Component
 * 
 * Automatically adapts the status bar appearance based on the current theme mode:
 * - Light mode: Light background with dark icons for contrast
 * - Dark mode: Dark background with light icons for contrast
 * 
 * Ensures proper visibility of system status icons (Wi-Fi, clock, battery) in all theme modes.
 */
export const ThemeAwareStatusBar: React.FC = () => {
  const { theme } = useTheme();

  return (
    <ExpoStatusBar
      // Icon style: "light" for light icons on dark background, "dark" for dark icons on light background
      style={theme.mode === "dark" ? "light" : "dark"}
      // Background color matches the app background
      backgroundColor={theme.colors.background}
      // Translucent is false to ensure the status bar background is visible
      translucent={false}
    />
  );
};

export default ThemeAwareStatusBar;
