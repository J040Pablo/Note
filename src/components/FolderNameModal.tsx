import React, { useState, useEffect } from "react";
import { Modal, View, StyleSheet, TextInput, Pressable } from "react-native";
import { useTheme, spacing } from "@hooks/useTheme";
import { Text } from "./Text";
import { FOLDER_COLOR_OPTIONS, getFolderColorHex } from "@utils/folderColors";

interface FolderNameModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (name: string, color: string | null) => void;
  initialName?: string;
  initialColor?: string | null;
  title?: string;
  confirmLabel?: string;
}

export const FolderNameModal: React.FC<FolderNameModalProps> = ({
  visible,
  onCancel,
  onConfirm,
  initialName,
  initialColor,
  title = "New folder",
  confirmLabel = "Create"
}) => {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>("blue");

  useEffect(() => {
    if (visible) {
      setName(initialName ?? "");
      setColor(initialColor ?? "blue");
    }
  }, [initialColor, initialName, visible]);

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
          <Text variant="subtitle">{title}</Text>
          <Text muted style={{ marginTop: spacing.xs }}>
            Give your folder a short, descriptive name.
          </Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder="Folder name"
            placeholderTextColor={theme.colors.textSecondary}
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary
              }
            ]}
          />

          <Text style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>Folder color</Text>
          <View style={styles.colorRow}>
            {FOLDER_COLOR_OPTIONS.map((option) => {
              const isSelected = color === option.value;
              const swatchColor = getFolderColorHex(option.value, theme.colors.primary);

              return (
                <Pressable
                  key={option.key}
                  onPress={() => setColor(option.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${option.label} color`}
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: swatchColor,
                      borderColor: isSelected ? theme.colors.textPrimary : theme.colors.border,
                      transform: [{ scale: isSelected ? 1.05 : 1 }]
                    }
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.secondaryButton}>
              <Text muted>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!name.trim()) return;
                onConfirm(name.trim(), color);
              }}
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>{confirmLabel}</Text>
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
  input: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth
  },
  colorRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2
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
  primaryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999
  }
});

