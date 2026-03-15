import React from "react";
import { Pressable, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "@hooks/useTheme";
import { Text } from "./Text";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ label, onPress, style }) => {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.primary,
          opacity: pressed ? 0.8 : 1
        },
        style
      ]}
    >
      <Text style={[styles.label, { color: theme.colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  label: {
    fontWeight: "600"
  }
});

