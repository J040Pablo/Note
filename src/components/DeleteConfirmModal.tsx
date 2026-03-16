import React from "react";
import { Modal, View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Text } from "./Text";
import { useTheme, spacing } from "@hooks/useTheme";

interface DeleteConfirmModalProps {
  visible: boolean;
  itemLabel?: string;
  title?: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  visible,
  itemLabel,
  title,
  message,
  onCancel,
  onConfirm,
  loading
}) => {
  const { theme } = useTheme();
  const resolvedTitle = title ?? `Delete ${itemLabel ?? "item"}?`;
  const resolvedMessage =
    message ?? (itemLabel ? `Delete this ${itemLabel}? This action cannot be undone.` : "Delete this item? This action cannot be undone.");

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card }]}> 
          <Text variant="subtitle">{resolvedTitle}</Text>
          <Text muted style={styles.message}>{resolvedMessage}</Text>

          <View style={styles.actions}>
            <Pressable disabled={loading} onPress={onCancel} style={[styles.secondaryButton, loading && styles.disabledButton]}>
              <Text muted>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={loading}
              onPress={onConfirm}
              style={[styles.dangerButton, { backgroundColor: theme.colors.danger }, loading && styles.disabledButton]}
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                  <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Deleting...</Text>
                </>
              ) : (
                <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Delete</Text>
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
    borderRadius: 16,
    padding: spacing.md
  },
  message: {
    marginTop: spacing.sm,
    lineHeight: 20
  },
  actions: {
    marginTop: spacing.md,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm
  },
  secondaryButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  dangerButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  disabledButton: {
    opacity: 0.7
  }
});
