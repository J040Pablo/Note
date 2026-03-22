import React, { memo, useCallback, useRef, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import { debounce } from "@utils/performance";

interface QuickNoteEditorProps {
  initialValue?: string;
  onSave: (text: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

const QuickNoteEditor = memo(({
  initialValue = "",
  onSave,
  onCancel,
  placeholder = "Quick note...",
  autoFocus = true
}: QuickNoteEditorProps) => {
  const { theme } = useTheme();
  const [text, setText] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);
  
  // Debounce autosave
  const debouncedSaveRef = useRef(
    debounce((content: string) => {
      if (content.trim()) {
        onSave(content);
      }
    }, 1000)
  );

  const handleChangeText = useCallback((newText: string) => {
    setText(newText);
    debouncedSaveRef.current(newText);
  }, []);

  const handleSave = useCallback(() => {
    if (text.trim()) {
      onSave(text);
      setText("");
      Keyboard.dismiss();
    }
  }, [text, onSave]);

  const handleCancel = useCallback(() => {
    setText("");
    Keyboard.dismiss();
    onCancel?.();
  }, [onCancel]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.card }]}>
      <TextInput
        ref={inputRef}
        multiline
        maxLength={500}
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
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
          {text.length}/500
        </Text>

        <View style={styles.actions}>
          {text.trim().length > 0 && (
            <Pressable onPress={handleCancel} style={styles.actionButton}>
              <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
              <Text variant="caption" muted>Clear</Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleSave}
            style={[
              styles.actionButton,
              text.trim().length === 0 && { opacity: 0.5 }
            ]}
            disabled={text.trim().length === 0}
          >
            <Ionicons
              name="checkmark-done"
              size={16}
              color={text.trim().length > 0 ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text
              variant="caption"
              style={{
                color: text.trim().length > 0 ? theme.colors.primary : theme.colors.textSecondary
              }}
            >
              Save
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}) as React.MemoExoticComponent<React.FC<QuickNoteEditorProps>>;

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginHorizontal: 16,
    marginVertical: 8,
  },
  input: {
    minHeight: 80,
    maxHeight: 200,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 20,
    borderBottomWidth: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  }
});

export default QuickNoteEditor;
