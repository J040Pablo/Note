import React from "react";
import { Modal, View, StyleSheet, Pressable } from "react-native";
import { Text } from "./Text";
import { useTheme, spacing } from "@hooks/useTheme";

interface DeleteConfirmModalProps {
  visible: boolean;
  itemLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  visible,
  itemLabel,
  onCancel,
  onConfirm
}) => {
  const { theme } = useTheme();

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card }]}> 
          <Text variant="subtitle">Delete item</Text>
          <Text muted style={styles.message}>
            {itemLabel
              ? `Do you want to delete this ${itemLabel}?`
              : "Do you want to delete this item?"}
          </Text>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.secondaryButton}>
              <Text muted>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={[styles.dangerButton, { backgroundColor: theme.colors.danger }]}
            >
              <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Delete</Text>
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
    borderRadius: 999
  }
});
