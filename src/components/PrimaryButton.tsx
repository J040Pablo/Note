import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "@hooks/useTheme";
import { Text } from "./Text";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({ label, onPress, style, disabled, loading, loadingLabel }) => {
  const { theme } = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.primary,
          opacity: isDisabled ? 0.65 : pressed ? 0.8 : 1
        },
        style
      ]}
    >
      {loading ? (
        <>
          <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          <Text style={[styles.label, { color: theme.colors.onPrimary }]}>{loadingLabel ?? label}</Text>
        </>
      ) : (
        <Text style={[styles.label, { color: theme.colors.onPrimary }]}>{label}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  label: {
    fontWeight: "600"
  }
});

