import React from "react";
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef, NavigationIndependentTree } from "@react-navigation/native";
import { Linking as RNLinking } from "react-native";
import RootNavigator from "@navigation/RootNavigator";
import { useTheme } from "@hooks/useTheme";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { useTasksStore } from "@store/useTasksStore";
import { addNotificationResponseListener, getLastNotificationResponse } from "@services/notificationService";
import { debug, warn, error as logError } from "@utils/logger";
import { shouldLogDev } from "@utils/runtimeEnv";

const navRef = createNavigationContainerRef<RootStackParamList>();

const parseDeepLinkToRoute = (url: string): { uri: string; name?: string; mimeType?: string | null } | null => {
  if (!url) return null;
  if (url.startsWith("file://") || url.startsWith("content://")) {
    const name = decodeURIComponent(url.split("/").pop() ?? "shared-file");
    return { uri: url, name, mimeType: null };
  }
  if (!url.startsWith("spectru://import-file")) return null;
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

export default function HomeLayout() {
  const { theme } = useTheme();

  React.useEffect(() => {
    const handledKeys = new Set<string>();
    const pendingTimers = new Set<ReturnType<typeof setTimeout>>();

    const handleNotificationTap = (response: any) => {
      try {
        const identifier = String(response?.notification?.request?.identifier ?? "unknown-id");
        const taskId = String(response?.notification?.request?.content?.data?.taskId ?? "");
        const triggerDate = String(
          response?.notification?.request?.trigger?.value ??
          response?.notification?.request?.trigger?.date ??
          "unknown-trigger"
        );
        const dedupeKey = `${identifier}-${taskId || "no-task"}-${triggerDate}`;

        if (handledKeys.has(dedupeKey)) return;
        if (!taskId) return;

        const navigateToTask = (attempt = 0) => {
          if (!navRef.isReady()) {
            if (attempt >= 15) return;
            const retryTimer = setTimeout(() => {
              pendingTimers.delete(retryTimer);
              navigateToTask(attempt + 1);
            }, 200);
            pendingTimers.add(retryTimer);
            return;
          }
          handledKeys.add(dedupeKey);
          const tasks = useTasksStore.getState().tasks;
          if (tasks && tasks[taskId]) {
            navRef.navigate("Tabs", { screen: "Tasks", params: { focusTaskId: taskId } });
          } else {
            navRef.navigate("Tabs", { screen: "Tasks" });
          }
        };
        navigateToTask();
      } catch (error) {
        logError('[NOTIF] Error handling notification response:', error);
      }
    };

    const handleUrl = (incoming: string | null) => {
      if (!incoming || !navRef.isReady()) return;
      const parsed = parseDeepLinkToRoute(incoming);
      if (!parsed) return;
      navRef.navigate("SaveSharedFile", parsed);
    };

    RNLinking.getInitialURL().then(handleUrl).catch(() => undefined);
    getLastNotificationResponse().then((response) => {
      if (response) handleNotificationTap(response);
    }).catch(e => logError('[NOTIF] Error reading last response:', e));

    const sub = RNLinking.addEventListener("url", ({ url }) => handleUrl(url));
    const notificationSub = addNotificationResponseListener(handleNotificationTap);

    return () => {
      pendingTimers.forEach(clearTimeout);
      sub.remove();
      if (notificationSub?.remove) notificationSub.remove();
    };
  }, []);

  return (
    <NavigationIndependentTree>
      <NavigationContainer
        ref={navRef}
        linking={{
          prefixes: ["spectru://"],
          config: {
            screens: {
              SaveSharedFile: {
                path: "import-file",
                parse: {
                  uri: (v: string) => decodeURIComponent(v),
                  name: (v: string) => decodeURIComponent(v),
                  mimeType: (v: string) => decodeURIComponent(v)
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
    </NavigationIndependentTree>
  );
}
