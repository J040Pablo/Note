import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@hooks/useTheme";

interface SelectionIndicatorProps {
  visible: boolean;
  style?: ViewStyle;
}

export const SelectionIndicator: React.FC<SelectionIndicatorProps> = ({ visible, style }) => {
  const { theme } = useTheme();
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 210,
      mass: 0.4
    }).start();
  }, [anim, visible]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.badge,
        { backgroundColor: theme.colors.primary },
        {
          opacity: anim,
          transform: [
            {
              scale: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.82, 1]
              })
            }
          ]
        },
        style
      ]}
    >
      <Ionicons name="checkmark" size={13} color={theme.colors.onPrimary} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    bottom: 4,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 5
  }
});
