import React from "react";
import { Modal, View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Text } from "./Text";
import { useTheme, spacing } from "@hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";

interface AppAlertModalProps {
  visible: boolean;
  title: string;
  message: string;
  type?: "info" | "success" | "error" | "warning";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  loading?: boolean;
}

export const AppAlertModal: React.FC<AppAlertModalProps> = ({
  visible,
  title,
  message,
  type = "info",
  confirmLabel = "OK",
  cancelLabel,
  onConfirm,
  onCancel,
  loading
}) => {
  const { theme } = useTheme();

  const getIcon = () => {
    switch (type) {
      case "success": return { name: "checkmark-circle" as const, color: "#22C55E" };
      case "error": return { name: "alert-circle" as const, color: theme.colors.danger };
      case "warning": return { name: "warning" as const, color: "#F59E0B" };
      default: return { name: "information-circle" as const, color: theme.colors.primary };
    }
  };

  const icon = getIcon();

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
          <View style={styles.header}>
            <Ionicons name={icon.name} size={28} color={icon.color} />
            <Text variant="subtitle" style={styles.title}>{title}</Text>
          </View>
          
          <Text muted style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            {cancelLabel && (
              <Pressable disabled={loading} onPress={onCancel} style={styles.secondaryButton}>
                <Text muted>{cancelLabel}</Text>
              </Pressable>
            )}
            
            <Pressable
              disabled={loading}
              onPress={onConfirm}
              style={[
                styles.primaryButton, 
                { backgroundColor: type === "error" || type === "warning" ? theme.colors.danger : theme.colors.primary },
                loading && styles.disabledButton
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color={theme.colors.onPrimary} />
              ) : (
                <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    padding: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  title: {
    flex: 1
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.sm
  },
  secondaryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  primaryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center"
  },
  disabledButton: {
    opacity: 0.7
  }
});
