import React from "react";
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from "@react-navigation/native";
import { Linking as RNLinking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import RootNavigator from "@navigation/RootNavigator";
import { ThemeProvider, useTheme } from "@hooks/useTheme";
import { DatabaseProvider } from "@database/DatabaseProvider";
import { FeedbackProvider } from "@components/FeedbackProvider";
import { ThemeAwareStatusBar } from "@components/ThemeAwareStatusBar";
import { useNotificationSetup } from "@hooks/useNotificationSetup";
import { useTaskSyncServer } from "@hooks/useTaskSyncServer";
import { useSyncListener } from "@hooks/useSyncListener";
import { useInitializeStores } from "@hooks/useInitializeStores";
import { addNotificationResponseListener } from "@services/notificationService";
import { useTasksStore } from "@store/useTasksStore";
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

  // Initialize notifications on app startup
  useNotificationSetup();
  useTaskSyncServer();
  useSyncListener(); // Real-time sync listener for all stores
  useInitializeStores(); // Pre-load stores to prevent race conditions with notifications

  React.useEffect(() => {
    const handleUrl = (incoming: string | null) => {
      if (!incoming || !navRef.isReady()) return;
      const parsed = parseDeepLinkToRoute(incoming);
      if (!parsed) return;
      navRef.navigate("SaveSharedFile", parsed);
    };

    RNLinking.getInitialURL().then(handleUrl).catch(() => undefined);

    const sub = RNLinking.addEventListener("url", ({ url }) => handleUrl(url));

    const notificationSub = addNotificationResponseListener((response) => {
      try {
        const taskId = response?.notification?.request?.content?.data?.taskId;
        if (!taskId || !navRef.isReady()) return;

        // Validate taskId exists in store before navigating
        const tasks = useTasksStore.getState().tasks;
        if (tasks && tasks[taskId]) {
          navRef.navigate("Tabs", { screen: "Tasks", params: { focusTaskId: taskId } });
        } else {
          console.warn('[NOTIF] Task not found in store:', taskId);
          // Navigate to Tasks tab anyway so user sees something
          navRef.navigate("Tabs", { screen: "Tasks" });
        }
      } catch (error) {
        console.error('[NOTIF] Error handling notification response:', error);
        // Always navigate to Tasks to prevent blank screen
        if (navRef.isReady()) {
          navRef.navigate("Tabs", { screen: "Tasks" });
        }
      }
    });

    return () => {
      sub.remove();
      if (notificationSub && notificationSub.remove) {
        notificationSub.remove();
      }
    };
  }, []);

  return (
    <>
      <ThemeAwareStatusBar />
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

