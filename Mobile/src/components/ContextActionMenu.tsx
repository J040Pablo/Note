import React from "react";
import { Modal, View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing } from "@hooks/useTheme";
import { Text } from "./Text";

export interface ContextActionItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

interface ContextActionMenuProps {
  visible: boolean;
  title?: string;
  actions: ContextActionItem[];
  onClose: () => void;
}

export const ContextActionMenu: React.FC<ContextActionMenuProps> = ({
  visible,
  title,
  actions,
  onClose
}) => {
  const { theme } = useTheme();

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
          onPress={() => {}}
        >
          {!!title && (
            <Text style={[styles.title, { color: theme.colors.textSecondary }]} numberOfLines={1}>
              {title}
            </Text>
          )}

          {actions.map((action, idx) => {
            const color = action.destructive ? theme.colors.danger : theme.colors.textPrimary;
            return (
              <Pressable
                key={action.key}
                style={[
                  styles.actionRow,
                  idx !== actions.length - 1 && { borderBottomColor: theme.colors.border, borderBottomWidth: StyleSheet.hairlineWidth }
                ]}
                onPress={() => {
                  onClose();
                  action.onPress();
                }}
              >
                <Ionicons name={action.icon} size={18} color={color} />
                <Text style={[styles.actionLabel, { color }]}>{action.label}</Text>
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end"
  },
  sheet: {
    margin: spacing.md,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden"
  },
  title: {
    fontSize: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "500"
  }
});
