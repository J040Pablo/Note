import React, { memo } from "react";
import { View, StyleSheet, TextInput, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import type { NoteCodeBlock } from "@models/types";

interface CodeBlockRendererProps {
  block: NoteCodeBlock;
  onUpdate: (code: string) => void;
  onChangeLanguage?: (lang: NoteCodeBlock["language"]) => void;
  onDelete?: () => void;
  editable?: boolean;
}

const LANGUAGE_COLORS: Record<NonNullable<NoteCodeBlock["language"]>, string> = {
  javascript: "#f7df1e",
  typescript: "#3178c6",
  python: "#3776ab",
  java: "#007396",
  sql: "#cc2927",
  html: "#e34c26",
  css: "#563d7c",
  json: "#000000",
  yaml: "#cb171e",
  bash: "#4eaa25"
};

const getHighlightedCode = (code: string, language: NoteCodeBlock["language"]): string => {
  // Basic syntax highlighting - can be expanded
  const keywords: Record<string, string[]> = {
    javascript: ["const", "let", "var", "function", "if", "else", "return", "class", "import", "export"],
    typescript: ["const", "let", "var", "function", "if", "else", "return", "class", "import", "export", "interface", "type"],
    python: ["def", "class", "if", "else", "for", "while", "return", "import", "from", "as", "async", "await"],
    java: ["public", "private", "class", "interface", "void", "int", "String", "new", "import", "package"],
    bash: ["if", "then", "else", "fi", "for", "do", "done", "function", "echo", "export"],
  };

  return code; // For now, return plain code - actual highlighting would use a library
};

const CodeBlockRenderer = memo(({
  block,
  onUpdate,
  onChangeLanguage,
  onDelete,
  editable = true
}: CodeBlockRendererProps) => {
  const { theme } = useTheme();
  const languageColor = LANGUAGE_COLORS[block.language || "javascript"];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.languageTag}>
          <View style={[styles.languageDot, { backgroundColor: languageColor }]} />
          <Text style={styles.languageText}>{block.language || "code"}</Text>
        </View>
        {editable && onDelete && (
          <Pressable onPress={onDelete} hitSlop={8}>
            <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        style={styles.codeContainer}
      >
        {editable ? (
          <TextInput
            multiline
            editable={editable}
            value={block.code}
            onChangeText={onUpdate}
            style={[
              styles.codeInput,
              {
                color: theme.colors.textPrimary,
                backgroundColor: "#1e1e1e",
              }
            ]}
            placeholderTextColor={theme.colors.textSecondary}
            placeholder="Enter code..."
            scrollEnabled={false}
            textAlignVertical="top"
          />
        ) : (
          <Text
            style={[
              styles.codeText,
              {
                color: "#d4d4d4",
                backgroundColor: "#1e1e1e",
              }
            ]}
          >
            {block.code}
          </Text>
        )}
      </ScrollView>

      {block.showLineNumbers && (
        <View style={styles.lineNumbers}>
          {block.code.split("\n").map((_, idx) => (
            <Text key={idx} style={[styles.lineNumber, { color: theme.colors.textSecondary }]}>
              {(idx + 1).toString().padStart(2, " ")}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}) as React.MemoExoticComponent<React.FC<CodeBlockRendererProps>>;

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2d2d2d"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1e1e1e",
    borderBottomWidth: 1,
    borderBottomColor: "#2d2d2d"
  },
  languageTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  languageDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  languageText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#a0a0a0",
    textTransform: "lowercase"
  },
  codeContainer: {
    maxHeight: 300,
  },
  codeInput: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: "100%",
    color: "#d4d4d4",
  },
  codeText: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  lineNumbers: {
    position: "absolute",
    left: 0,
    top: 50,
    backgroundColor: "#1e1e1e",
    borderRightWidth: 1,
    borderRightColor: "#2d2d2d",
    paddingRight: 8,
  },
  lineNumber: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 20,
    width: 30,
    textAlign: "right",
  }
});

export default CodeBlockRenderer;
