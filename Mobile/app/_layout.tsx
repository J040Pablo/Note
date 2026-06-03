import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { setAudioModeAsync } from "expo-audio";
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
import { usePomodoroStore } from "@store/usePomodoroStore";

function PomodoroOverlay() {
  const isPomodoroVisible = usePomodoroStore((state) => state.isVisible);
  if (!isPomodoroVisible) return null;
  return <FloatingPomodoro />;
}

// Internal component to handle hooks that need access to providers
function AppContent() {
  useNotificationSetup();
  useTaskSyncServer();
  useSyncListener();
  useInitializeStores();
  useWidgetSync();
  usePomodoroTimer();

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsRecording: false,
      interruptionMode: "duckOthers",
      shouldRouteThroughEarpiece: false
    });
  }, []);

  return (
    <>
      <ThemeAwareStatusBar />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="home" />
      </Stack>
      <PomodoroOverlay />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <FeedbackProvider>
          <DatabaseProvider>
            <AppContent />
          </DatabaseProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
