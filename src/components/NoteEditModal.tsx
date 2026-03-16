import React, { useEffect, useState } from "react";
import { Modal, View, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useTheme, spacing } from "@hooks/useTheme";
import { Text } from "./Text";

interface NoteEditModalProps {
  visible: boolean;
  initialTitle: string;
  initialContent: string;
  onCancel: () => void;
  onConfirm: (title: string, content: string) => void;
  submitting?: boolean;
}

export const NoteEditModal: React.FC<NoteEditModalProps> = ({
  visible,
  initialTitle,
  initialContent,
  onCancel,
  onConfirm,
  submitting = false
}) => {
  const { theme } = useTheme();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setContent(initialContent);
    }
  }, [initialContent, initialTitle, visible]);

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card }]}> 
          <Text variant="subtitle">Edit note</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={theme.colors.textSecondary}
            style={[
              styles.input,
              {
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary
              }
            ]}
          />
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Content"
            placeholderTextColor={theme.colors.textSecondary}
            multiline
            style={[
              styles.textArea,
              {
                borderColor: theme.colors.border,
                color: theme.colors.textPrimary
              }
            ]}
          />

          <View style={styles.actions}>
            <Pressable disabled={submitting} onPress={onCancel} style={[styles.secondaryButton, submitting && styles.disabledButton]}>
              <Text muted>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={submitting}
              onPress={() => {
                if (submitting) return;
                onConfirm(title.trim(), content);
              }}
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, submitting && styles.disabledButton]}
            >
              {submitting ? (
                <>
                  <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                  <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Saving...</Text>
                </>
              ) : (
                <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Save</Text>
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
  input: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth
  },
  textArea: {
    marginTop: spacing.sm,
    minHeight: 120,
    textAlignVertical: "top",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth
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
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  disabledButton: {
    opacity: 0.7
  }
});
