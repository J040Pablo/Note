import React from "react";
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@hooks/useTheme";

type FloatingButtonProps = {
  onPress: PressableProps["onPress"];
  icon: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  iconStyle?: StyleProp<ViewStyle>;
  iconSize?: number;
  accessibilityLabel?: string;
  testID?: string;
};

export const FloatingButton: React.FC<FloatingButtonProps> = ({
  onPress,
  icon,
  style,
  iconStyle,
  iconSize = 24,
  accessibilityLabel,
  testID
}) => {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={20}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.primary,
          shadowColor: theme.colors.textPrimary
        },
        pressed && styles.pressed,
        style
      ]}
    >
      <Ionicons
        name={icon}
        size={iconSize}
        color={theme.colors.onPrimary}
        style={iconStyle}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12
  },
  pressed: {
    transform: [{ scale: 0.96 }]
  }
});
