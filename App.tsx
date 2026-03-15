import React from "react";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import RootNavigator from "@navigation/RootNavigator";
import { ThemeProvider } from "@hooks/useTheme";
import { DatabaseProvider } from "@database/DatabaseProvider";

export default function App() {
  const scheme = useColorScheme();

  return (
    <ThemeProvider>
      <DatabaseProvider>
        <NavigationContainer theme={scheme === "dark" ? DarkTheme : DefaultTheme}>
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          <RootNavigator />
        </NavigationContainer>
      </DatabaseProvider>
    </ThemeProvider>
  );
}

