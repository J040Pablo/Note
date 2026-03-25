import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";

interface QuickNoteInputProps {
  initialTitle?: string;
  initialContent?: string;
  onSave: (payload: { title: string; content: string }) => Promise<void>;
  onCancel?: () => void;
  titlePlaceholder?: string;
  contentPlaceholder?: string;
  autoFocus?: boolean;
  titleMaxLength?: number;
  maxLength?: number;
}

export const QuickNoteInput = ({
  initialTitle = "",
  initialContent = "",
  onSave,
  onCancel,
  titlePlaceholder = "Title",
  contentPlaceholder = "Write a quick note...",
  autoFocus = true,
  titleMaxLength = 80,
  maxLength = 500
}: QuickNoteInputProps) => {
  const { theme } = useTheme();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedKey, setLastSavedKey] = useState("");
  const titleInputRef = useRef<TextInput>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    setTitle(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const runSave = async () => {
    const safeTitle = title.trim();
    const safeContent = content.trim();
    const normalizedTitle = safeTitle || "Quick Note";
    const nextKey = `${normalizedTitle}::${safeContent}`;

    if (!safeTitle && !safeContent) return;
    if (nextKey === lastSavedKey) return;
    if (saveInFlightRef.current) return;

    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      await onSave({ title: normalizedTitle, content: safeContent });
      setLastSavedKey(nextKey);
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      runSave();
    }, 800);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [title, content]);

  const handleCancel = () => {
    setTitle("");
    setContent("");
    Keyboard.dismiss();
    onCancel?.();
  };

  const canClear = title.trim().length > 0 || content.trim().length > 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.card }]}>
      <TextInput
        ref={titleInputRef}
        value={title}
        onChangeText={setTitle}
        placeholder={titlePlaceholder}
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          styles.titleInput,
          {
            color: theme.colors.textPrimary,
            borderColor: theme.colors.border
          }
        ]}
        autoFocus={autoFocus}
        maxLength={titleMaxLength}
        returnKeyType="next"
        onBlur={runSave}
      />

      <TextInput
        multiline
        maxLength={maxLength}
        value={content}
        onChangeText={setContent}
        placeholder={contentPlaceholder}
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          styles.input,
          {
            color: theme.colors.textPrimary,
            borderColor: theme.colors.border
          }
        ]}
        autoFocus={false}
        scrollEnabled={true}
        textAlignVertical="top"
        onBlur={runSave}
      />

      <View style={styles.footer}>
        <View style={styles.charCount}>
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
            {content.length}/{maxLength}
          </Text>
          {isSaving && (
            <Text style={{ fontSize: 12, color: theme.colors.primary, marginLeft: 8 }}>
              saving...
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          {canClear && (
            <Pressable onPress={handleCancel} style={styles.actionButton}>
              <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
              <Text variant="caption" muted>
                Clear
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 280,
    maxHeight: 420
  },
  titleInput: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "600",
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  input: {
    minHeight: 160,
    maxHeight: 260,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 24
  },
  footer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.1)"
  },
  charCount: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end"
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.03)"
  }
});
