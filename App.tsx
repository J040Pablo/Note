import React from "react";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import RootNavigator from "@navigation/RootNavigator";
import { ThemeProvider, useTheme } from "@hooks/useTheme";
import { DatabaseProvider } from "@database/DatabaseProvider";

const ThemedNavigation: React.FC = () => {
  const { theme } = useTheme();
  const scheme = useColorScheme();

  return (
    <>
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} backgroundColor={theme.colors.background} />
      <NavigationContainer
        theme={{
          ...(scheme === "dark" ? DarkTheme : DefaultTheme),
          colors: {
            ...(scheme === "dark" ? DarkTheme.colors : DefaultTheme.colors),
            background: theme.colors.background,
            card: theme.colors.surface,
            border: theme.colors.border,
            text: theme.colors.textPrimary,
            primary: theme.colors.primary
          }
        }}
      >
        <RootNavigator />
      </NavigationContainer>
    </>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <DatabaseProvider>
        <ThemedNavigation />
      </DatabaseProvider>
    </ThemeProvider>
  );
}

