import React from "react";
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { Linking as RNLinking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import RootNavigator from "@navigation/RootNavigator";
import { ThemeProvider, useTheme } from "@hooks/useTheme";
import { DatabaseProvider } from "@database/DatabaseProvider";
import { FeedbackProvider } from "@components/FeedbackProvider";
import type { RootStackParamList } from "@navigation/RootNavigator";

const navRef = createNavigationContainerRef<RootStackParamList>();

const parseDeepLinkToRoute = (url: string): { uri: string; name?: string; mimeType?: string | null } | null => {
  if (!url) return null;

  if (url.startsWith("file://") || url.startsWith("content://")) {
    const name = decodeURIComponent(url.split("/").pop() ?? "shared-file");
    return { uri: url, name, mimeType: null };
  }

  if (!url.startsWith("lifeorganizer://import-file")) {
    return null;
  }

  const [_, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  const uri = params.get("uri");
  if (!uri) return null;

  return {
    uri: decodeURIComponent(uri),
    name: params.get("name") ? decodeURIComponent(params.get("name") as string) : undefined,
    mimeType: params.get("mimeType") ? decodeURIComponent(params.get("mimeType") as string) : null
  };
};

const ThemedNavigation: React.FC = () => {
  const { theme } = useTheme();

  React.useEffect(() => {
    const handleUrl = (incoming: string | null) => {
      if (!incoming || !navRef.isReady()) return;
      const parsed = parseDeepLinkToRoute(incoming);
      if (!parsed) return;
      navRef.navigate("SaveSharedFile", parsed);
    };

    RNLinking.getInitialURL().then(handleUrl).catch(() => undefined);

    const sub = RNLinking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style={theme.mode === "dark" ? "light" : "dark"} backgroundColor={theme.colors.background} />
      <NavigationContainer
        ref={navRef}
        linking={{
          prefixes: ["lifeorganizer://"],
          config: {
            screens: {
              SaveSharedFile: {
                path: "import-file",
                parse: {
                  uri: (value: string) => decodeURIComponent(value),
                  name: (value: string) => decodeURIComponent(value),
                  mimeType: (value: string) => decodeURIComponent(value)
                }
              }
            }
          }
        }}
        theme={{
          ...(theme.mode === "dark" ? DarkTheme : DefaultTheme),
          colors: {
            ...(theme.mode === "dark" ? DarkTheme.colors : DefaultTheme.colors),
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <FeedbackProvider>
          <DatabaseProvider>
            <ThemedNavigation />
          </DatabaseProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

