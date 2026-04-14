import AsyncStorage from "@react-native-async-storage/async-storage";
import { Dimensions } from "react-native";
import { stopAlarm } from "@services/alarmService";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type PomodoroMode = "focus" | "break";

const DEFAULT_FOCUS_DURATION = 25 * 60;
const DEFAULT_BREAK_DURATION = 5 * 60;
const DEFAULT_POSITION = { x: 18, y: 140 };

const getDefaultOpenPosition = () => {
  const { width, height } = Dimensions.get("window");
  return {
    x: Math.max(10, width - 80),
    y: Math.max(60, height - 160)
  };
};

const getDurationForMode = (mode: PomodoroMode, focusDuration: number, breakDuration: number): number => {
  return mode === "focus" ? focusDuration : breakDuration;
};

interface Position {
  x: number;
  y: number;
}

interface PomodoroState {
  isVisible: boolean;
  isRunning: boolean;
  mode: PomodoroMode;
  timeLeft: number;
  focusDuration: number;
  breakDuration: number;
  isExpanded: boolean;
  position: Position;
  lastTickAt: number | null;
}

interface PomodoroActions {
  start: () => void;
  pause: () => void;
  reset: () => void;
  seek: (delta: number) => void;
  seekBackward: () => void;
  seekForward: () => void;
  toggleMode: () => void;
  toggleExpanded: () => void;
  setPosition: (x: number, y: number) => void;
  openPomodoro: () => void;
  closePomodoro: () => void;
  tick: (elapsedSeconds: number) => PomodoroMode[];
}

export type PomodoroStore = PomodoroState & PomodoroActions;

export const usePomodoroStore = create<PomodoroStore>()(
  persist(
    (set) => ({
      isVisible: false,
      isRunning: false,
      mode: "focus",
      timeLeft: DEFAULT_FOCUS_DURATION,
      focusDuration: DEFAULT_FOCUS_DURATION,
      breakDuration: DEFAULT_BREAK_DURATION,
      isExpanded: false,
      position: DEFAULT_POSITION,
      lastTickAt: null,

      start: () =>
        set((state) => {
          if (state.isRunning) {
            return state;
          }
          if (__DEV__) {
            console.log("[POMODORO ACTION] start");
          }
          return {
            isRunning: true,
            lastTickAt: Date.now()
          };
        }),

      pause: () =>
        set((state) => {
          if (!state.isRunning) {
            return state;
          }
          void stopAlarm();
          if (__DEV__) {
            console.log("[POMODORO ACTION] pause");
          }
          return {
            isRunning: false,
            lastTickAt: null
          };
        }),

      reset: () =>
        set((state) => {
          void stopAlarm();
          if (__DEV__) {
            console.log("[POMODORO ACTION] reset");
          }
          return {
            isRunning: false,
            timeLeft: getDurationForMode(state.mode, state.focusDuration, state.breakDuration),
            lastTickAt: null
          };
        }),

      seek: (delta) =>
        set((state) => {
          const maxTime = state.mode === "focus" ? state.focusDuration : state.breakDuration;
          const newTime = Math.max(0, Math.min(state.timeLeft + delta, maxTime));
          return { timeLeft: newTime };
        }),

      seekBackward: () =>
        set((state) => {
          const maxTime = state.mode === "focus" ? state.focusDuration : state.breakDuration;
          const newTime = Math.max(0, Math.min(state.timeLeft - 15, maxTime));
          return { timeLeft: newTime };
        }),

      seekForward: () =>
        set((state) => {
          const maxTime = state.mode === "focus" ? state.focusDuration : state.breakDuration;
          const newTime = Math.max(0, Math.min(state.timeLeft + 15, maxTime));
          return { timeLeft: newTime };
        }),

      toggleMode: () =>
        set((state) => {
          const nextMode: PomodoroMode = state.mode === "focus" ? "break" : "focus";
          if (nextMode === state.mode) {
            return state;
          }
          void stopAlarm();
          if (__DEV__) {
            console.log("[POMODORO ACTION] toggleMode", nextMode);
          }
          return {
            mode: nextMode,
            timeLeft: getDurationForMode(nextMode, state.focusDuration, state.breakDuration),
            lastTickAt: state.isRunning ? Date.now() : null
          };
        }),

      toggleExpanded: () =>
        set((state) => ({
          isExpanded: !state.isExpanded
        })),

      setPosition: (x, y) =>
        set({
          position: { x, y }
        }),

      openPomodoro: () =>
        set((state) => {
          const nextPosition = getDefaultOpenPosition();
          if (__DEV__) {
            console.log("[POMODORO ACTION] openPomodoro");
          }
          return {
            isVisible: true,
            isExpanded: true,
            isRunning: false,
            lastTickAt: null,
            mode: state.mode,
            timeLeft: getDurationForMode(state.mode, state.focusDuration, state.breakDuration),
            position: nextPosition
          };
        }),

      closePomodoro: () =>
        set((state) => {
          void stopAlarm();
          if (__DEV__) {
            console.log("[POMODORO ACTION] closePomodoro");
          }
          return {
            isVisible: false,
            isExpanded: false,
            isRunning: false,
            lastTickAt: null,
            mode: state.mode,
            timeLeft: getDurationForMode(state.mode, state.focusDuration, state.breakDuration)
          };
        }),

      tick: (elapsedSeconds) => {
        if (elapsedSeconds <= 0) {
          return [];
        }

        set((state) => {
          if (!state.isRunning) {
            return { lastTickAt: Date.now() };
          }

          const timeLeft = Math.max(state.timeLeft - elapsedSeconds, 0);

          return {
            timeLeft,
            lastTickAt: Date.now()
          };
        });

        return [];
      }
    }),
    {
      name: "pomodoro-storage",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        focusDuration: state.focusDuration,
        breakDuration: state.breakDuration
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<PomodoroStore>;
        return {
          ...currentState,
          focusDuration: persisted.focusDuration ?? currentState.focusDuration,
          breakDuration: persisted.breakDuration ?? currentState.breakDuration
        };
      }
    }
  )
);
