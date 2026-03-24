import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";

interface QuickNoteInputProps {
  initialValue?: string;
  onSave: (text: string) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
}

/**
 * QuickNoteInput - Controlled text input with autosave
 * Saves automatically as user types (debounced)
 */
export const QuickNoteInput = ({
  initialValue = "",
  onSave,
  onCancel,
  placeholder = "Quick note...",
  autoFocus = true,
  maxLength = 500
}: QuickNoteInputProps) => {
  const { theme } = useTheme();
  const [text, setText] = useState(initialValue);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save with 1 second debounce
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (text.trim() && text !== initialValue) {
        setIsSaving(true);
        onSave(text)
          .catch((err) => console.error("Quick note save error:", err))
          .finally(() => setIsSaving(false));
      }
    }, 1000);

    return () => {
      if (saveTimeoutRef.current !== null) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [text, initialValue, onSave]);

  const handleChangeText = (newText: string) => {
    setText(newText);
  };

  const handleSave = async () => {
    if (text.trim()) {
      setIsSaving(true);
      try {
        await onSave(text);
        setText("");
        Keyboard.dismiss();
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleCancel = () => {
    setText("");
    Keyboard.dismiss();
    onCancel?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.card }]}>
      <TextInput
        ref={inputRef}
        multiline
        maxLength={maxLength}
        value={text}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSecondary}
        style={[
          styles.input,
          {
            color: theme.colors.textPrimary,
            borderColor: theme.colors.border
          }
        ]}
        autoFocus={autoFocus}
        scrollEnabled={true}
        textAlignVertical="top"
      />

      <View style={styles.footer}>
        <View style={styles.charCount}>
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
            {text.length}/{maxLength}
          </Text>
          {isSaving && (
            <Text style={{ fontSize: 12, color: theme.colors.primary, marginLeft: 8 }}>
              saving...
            </Text>
          )}
        </View>

        <View style={styles.actions}>
          {text.trim().length > 0 && (
            <Pressable onPress={handleCancel} style={styles.actionButton}>
              <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
              <Text variant="caption" muted>
                Clear
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleSave}
            style={[
              styles.actionButton,
              text.trim().length === 0 && { opacity: 0.5 }
            ]}
            disabled={text.trim().length === 0 || isSaving}
          >
            <Ionicons
              name="checkmark-done"
              size={16}
              color={text.trim().length > 0 ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text variant="caption" style={{ color: text.trim().length > 0 ? theme.colors.primary : theme.colors.textSecondary }}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth
  },
  input: {
    flex: 1,
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
    borderRadius: 6
  }
});
