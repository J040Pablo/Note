import React from "react";
import { TextInput, StyleSheet, View } from "react-native";
import { useTheme } from "@hooks/useTheme";
import { Text } from "./Text";

interface MarkdownEditorProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onChangeText,
  placeholder
}) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceElevated }]}>
      <Text variant="caption" muted style={styles.hint}>
        Basic markdown supported: *italic*, **bold**, - list
      </Text>
      <TextInput
        multiline
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            color: theme.colors.text
          }
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 12,
    marginTop: 8
  },
  hint: {
    marginBottom: 4
  },
  input: {
    minHeight: 160,
    textAlignVertical: "top",
    fontSize: 14,
    lineHeight: 20
  }
});

