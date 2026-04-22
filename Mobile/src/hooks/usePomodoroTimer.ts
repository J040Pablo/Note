import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { playAlarm, stopAlarm } from "@services/alarmService";
import { usePomodoroStore } from "@store/usePomodoroStore";
import { log, warn, error as logError } from '@utils/logger';

const TIMER_INTERVAL_MS = 1000;

export const usePomodoroTimer = () => {
  const isRunning = usePomodoroStore((state) => state.isRunning);
  const start = usePomodoroStore((state) => state.start);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const state = usePomodoroStore.getState();
    if (state.isRunning && state.lastTickAt == null) {
      start();
    }
  }, [start]);

  useEffect(() => {
    if (!isRunning) {
      void stopAlarm();
      if (intervalRef.current) {
        log("[TIMER] Clearing interval");
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (intervalRef.current !== null) {
      return;
    }

    log("[TIMER] Starting interval");

    intervalRef.current = setInterval(() => {
      const state = usePomodoroStore.getState();
      if (!state.isRunning) {
        return;
      }

      state.tick(1);
      const next = usePomodoroStore.getState();

      if (next.timeLeft <= 0) {
        next.pause();
        void playAlarm();
      }
    }, TIMER_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        log("[TIMER] Clearing interval");
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasBackground = appStateRef.current !== "active";
      appStateRef.current = nextState;

      if (nextState === "active" && wasBackground) {
        const state = usePomodoroStore.getState();
        if (!state.isRunning || state.lastTickAt == null) {
          return;
        }

        const elapsedSeconds = Math.floor((Date.now() - state.lastTickAt) / 1000);
        if (elapsedSeconds > 0) {
          state.tick(elapsedSeconds);
          const next = usePomodoroStore.getState();
          if (next.timeLeft <= 0) {
            next.pause();
            void playAlarm();
          }
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
};
