import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing } from "@hooks/useTheme";
import { Text } from "./Text";

type FeedbackTone = "success" | "error";

interface FeedbackState {
  visible: boolean;
  message: string;
  tone: FeedbackTone;
}

interface FeedbackContextValue {
  showToast: (message: string, tone?: FeedbackTone) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const translateY = useRef(new Animated.Value(24)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<FeedbackState>({
    visible: false,
    message: "",
    tone: "success"
  });

  const clearHideTimeout = () => {
    if (!hideTimeout.current) return;
    clearTimeout(hideTimeout.current);
    hideTimeout.current = null;
  };

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true })
    ]).start();
  }, [opacity, translateY]);

  const animateOut = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 24, duration: 180, useNativeDriver: true })
    ]).start(({ finished }) => {
      if (finished) {
        setState((current) => ({ ...current, visible: false, message: "" }));
      }
    });
  }, [opacity, translateY]);

  const showToast = useCallback(
    (message: string, tone: FeedbackTone = "success") => {
      clearHideTimeout();
      setState({ visible: true, message, tone });
      opacity.stopAnimation();
      translateY.stopAnimation();
      opacity.setValue(0);
      translateY.setValue(24);
      animateIn();
      hideTimeout.current = setTimeout(() => {
        animateOut();
        hideTimeout.current = null;
      }, 1800);
    },
    [animateIn, animateOut, opacity, translateY]
  );

  const value = useMemo<FeedbackContextValue>(() => ({ showToast }), [showToast]);

  const toneColor = state.tone === "success" ? theme.colors.primary : theme.colors.danger;
  const toneIcon = state.tone === "success" ? "checkmark-circle" : "alert-circle";

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {state.visible && (
        <View pointerEvents="none" style={styles.root}>
          <Animated.View
            style={[
              styles.toast,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                opacity,
                transform: [{ translateY }]
              }
            ]}
          >
            <Ionicons name={toneIcon} size={18} color={toneColor} />
            <Text style={styles.message}>{state.message}</Text>
          </Animated.View>
        </View>
      )}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = (): FeedbackContextValue => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useFeedback must be used within FeedbackProvider");
  }
  return context;
};

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg * 2,
    alignItems: "center"
  },
  toast: {
    minHeight: 48,
    maxWidth: "100%",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4
  },
  message: {
    flexShrink: 1,
    fontWeight: "600"
  }
});