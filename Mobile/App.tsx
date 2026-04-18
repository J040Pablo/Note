import React from "react";
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from "@react-navigation/native";
import { Linking as RNLinking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { setAudioModeAsync } from "expo-audio";
import RootNavigator from "@navigation/RootNavigator";
import { ThemeProvider, useTheme } from "@hooks/useTheme";
import { DatabaseProvider } from "@database/DatabaseProvider";
import { FeedbackProvider } from "@components/FeedbackProvider";
import FloatingPomodoro from "@components/FloatingPomodoro";
import { ThemeAwareStatusBar } from "@components/ThemeAwareStatusBar";
import { useNotificationSetup } from "@hooks/useNotificationSetup";
import { useTaskSyncServer } from "@hooks/useTaskSyncServer";
import { useSyncListener } from "@hooks/useSyncListener";
import { useInitializeStores } from "@hooks/useInitializeStores";
import { usePomodoroTimer } from "@hooks/usePomodoroTimer";
import { useWidgetSync } from "@hooks/useWidgetSync";
import { addNotificationResponseListener, getLastNotificationResponse } from "@services/notificationService";
import { usePomodoroStore } from "@store/usePomodoroStore";
import { useTasksStore } from "@store/useTasksStore";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { shouldLogDev } from "@utils/runtimeEnv";

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
  useWidgetSync(); // CRITICAL: Keep Android contribution widget in sync with task state

  React.useEffect(() => {
    const handledKeys = new Set<string>();
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    const handleNotificationTap = (response: any) => {
      try {
        const identifier = String(
          response?.notification?.request?.identifier ??
          "unknown-id"
        );
        const taskId = String(response?.notification?.request?.content?.data?.taskId ?? "");
        const triggerDate = String(
          response?.notification?.request?.trigger?.value ??
          response?.notification?.request?.trigger?.date ??
          "unknown-trigger"
        );
        const dedupeKey = `${identifier}-${taskId || "no-task"}-${triggerDate}`;

        if (shouldLogDev) {
          console.info(`[NOTIF][TAP] Received response id=${identifier} taskId=${taskId || "none"} trigger=${triggerDate}`);
        }

        if (handledKeys.has(dedupeKey)) {
          if (shouldLogDev) {
            console.info(`[NOTIF][TAP] Duplicate response ignored key=${dedupeKey}`);
          }
          return;
        }

        if (!taskId) {
          if (shouldLogDev) {
            console.info('[NOTIF][TAP] Ignored response without taskId');
          }
          return;
        }

        const navigateToTask = (attempt = 0) => {
          if (!navRef.isReady()) {
            if (attempt >= 15) {
              console.warn('[NOTIF][NAVIGATION] Navigation not ready after retries; notification tap dropped.');
              return;
            }
            const retryTimer = setTimeout(() => {
              pendingTimers.delete(retryTimer);
              navigateToTask(attempt + 1);
            }, 200);
            pendingTimers.add(retryTimer);
            if (shouldLogDev) {
              console.info(`[NOTIF][NAVIGATION] Waiting nav ready attempt=${attempt + 1}`);
            }
            return;
          }

          handledKeys.add(dedupeKey);

          const tasks = useTasksStore.getState().tasks;
          if (tasks && tasks[taskId]) {
            if (shouldLogDev) {
              console.info(`[NOTIF][NAVIGATION] Navigating to task ${taskId}`);
            }
            navRef.navigate("Tabs", { screen: "Tasks", params: { focusTaskId: taskId } });
          } else {
            console.warn('[NOTIF] Task not found in store:', taskId);
            if (shouldLogDev) {
              console.info('[NOTIF][NAVIGATION] Navigating to Tasks fallback');
            }
            navRef.navigate("Tabs", { screen: "Tasks" });
          }
        };

        navigateToTask();
      } catch (error) {
        console.error('[NOTIF] Error handling notification response:', error);
        if (navRef.isReady()) {
          navRef.navigate("Tabs", { screen: "Tasks" });
        }
      }
    };

    const handleUrl = (incoming: string | null) => {
      if (!incoming || !navRef.isReady()) return;
      const parsed = parseDeepLinkToRoute(incoming);
      if (!parsed) return;
      navRef.navigate("SaveSharedFile", parsed);
    };

    RNLinking.getInitialURL().then(handleUrl).catch(() => undefined);

    // Cold-start recovery: user tapped notification while app was terminated
    getLastNotificationResponse()
      .then((response) => {
        if (!response) return;
        handleNotificationTap(response);
      })
      .catch((error) => {
        console.error('[NOTIF] Error reading last notification response:', error);
      });

    const sub = RNLinking.addEventListener("url", ({ url }) => handleUrl(url));

    const notificationSub = addNotificationResponseListener((response) => {
      handleNotificationTap(response);
    });

    return () => {
      pendingTimers.forEach((timer) => clearTimeout(timer));
      pendingTimers.clear();
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

const PomodoroOverlay: React.FC = () => {
  const isPomodoroVisible = usePomodoroStore((state) => state.isVisible);

  if (!isPomodoroVisible) {
    return null;
  }

  return <FloatingPomodoro />;
};

export default function App() {
  usePomodoroTimer();

  React.useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsRecording: false,
      interruptionMode: "duckOthers",
      shouldRouteThroughEarpiece: false
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <FeedbackProvider>
          <DatabaseProvider>
            <ThemedNavigation />
            <PomodoroOverlay />
          </DatabaseProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

