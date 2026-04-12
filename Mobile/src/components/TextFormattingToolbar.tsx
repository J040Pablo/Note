import React, { memo } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@hooks/useTheme";
import type { NoteTextStyle } from "@models/types";

interface TextFormattingToolbarProps {
  currentStyle?: NoteTextStyle;
  onBoldToggle: () => void;
  onItalicToggle: () => void;
  onUnderlineToggle: () => void;
  onStrikethroughToggle: () => void;
  onColorPick: () => void;
  onHighlightPick: () => void;
  onFontSizeChange: (size: number) => void;
  onAlignmentChange: (align: "left" | "center" | "right") => void;
  onAddCode: () => void;
  onAddImage: () => void;
  onAddLink?: () => void;
}

const TextFormattingToolbar = memo(function TextFormattingToolbar({
  currentStyle = {},
  onBoldToggle,
  onItalicToggle,
  onUnderlineToggle,
  onStrikethroughToggle,
  onColorPick,
  onHighlightPick,
  onFontSizeChange,
  onAlignmentChange,
  onAddCode,
  onAddImage,
  onAddLink
}: TextFormattingToolbarProps) {
  const { theme } = useTheme();

  return (
    <ScrollView
      horizontal
      scrollEventThrottle={16}
      showsHorizontalScrollIndicator={false}
      style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      {/* Text Style Buttons */}
      <Pressable
        onPress={onBoldToggle}
        style={[
          styles.toolButton,
          currentStyle.bold && { backgroundColor: theme.colors.primary }
        ]}
      >
        <Ionicons
          name="text"
          size={18}
          color={currentStyle.bold ? "#fff" : theme.colors.textPrimary}
          style={{ fontWeight: "bold" }}
        />
      </Pressable>

      <Pressable
        onPress={onItalicToggle}
        style={[
          styles.toolButton,
          currentStyle.italic && { backgroundColor: theme.colors.primary }
        ]}
      >
        <Ionicons
          name="text"
          size={18}
          color={currentStyle.italic ? "#fff" : theme.colors.textPrimary}
          style={{ fontStyle: "italic" }}
        />
      </Pressable>

      <Pressable
        onPress={onUnderlineToggle}
        style={[
          styles.toolButton,
          currentStyle.underline && { backgroundColor: theme.colors.primary }
        ]}
      >
        <Ionicons
          name="text"
          size={18}
          color={currentStyle.underline ? "#fff" : theme.colors.textPrimary}
          style={{ textDecorationLine: "underline" }}
        />
      </Pressable>

      <Pressable
        onPress={onStrikethroughToggle}
        style={[
          styles.toolButton,
          currentStyle.strikethrough && { backgroundColor: theme.colors.primary }
        ]}
      >
        <Ionicons
          name="text"
          size={18}
          color={currentStyle.strikethrough ? "#fff" : theme.colors.textPrimary}
          style={{ textDecorationLine: "line-through" }}
        />
      </Pressable>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      {/* Color & Highlight */}
      <Pressable
        onPress={onColorPick}
        style={[
          styles.toolButton,
          currentStyle.textColor && { borderWidth: 2, borderColor: currentStyle.textColor }
        ]}
      >
        <Ionicons name="color-palette" size={18} color={theme.colors.primary} />
      </Pressable>

      <Pressable
        onPress={onHighlightPick}
        style={[
          styles.toolButton,
          currentStyle.highlightColor && { backgroundColor: currentStyle.highlightColor }
        ]}
      >
        <Ionicons name="brush-outline" size={18} color={theme.colors.textPrimary} />
      </Pressable>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      {/* Alignment */}
      <Pressable
        onPress={() => onAlignmentChange("left")}
        style={[
          styles.toolButton,
          currentStyle.textAlign === "left" && { backgroundColor: theme.colors.primary }
        ]}
      >
        <Ionicons
          name="text-outline"
          size={18}
          color={currentStyle.textAlign === "left" ? "#fff" : theme.colors.textPrimary}
        />
      </Pressable>

      <Pressable
        onPress={() => onAlignmentChange("center")}
        style={[
          styles.toolButton,
          currentStyle.textAlign === "center" && { backgroundColor: theme.colors.primary }
        ]}
      >
        <Ionicons
          name="text"
          size={18}
          color={currentStyle.textAlign === "center" ? "#fff" : theme.colors.textPrimary}
        />
      </Pressable>

      <Pressable
        onPress={() => onAlignmentChange("right")}
        style={[
          styles.toolButton,
          currentStyle.textAlign === "right" && { backgroundColor: theme.colors.primary }
        ]}
      >
        <Ionicons
          name="text-outline"
          size={18}
          color={currentStyle.textAlign === "right" ? "#fff" : theme.colors.textPrimary}
        />
      </Pressable>

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      {/* Font Size Presets */}
      {[12, 14, 16, 18, 20, 24].map((size) => (
        <Pressable
          key={size}
          onPress={() => onFontSizeChange(size)}
          style={[
            styles.toolButton,
            currentStyle.fontSize === size && { backgroundColor: theme.colors.primary }
          ]}
        >
          <View style={styles.fontSizeButton}>
            <Ionicons
              name="text"
              size={currentStyle.fontSize === size ? 16 : 12}
              color={currentStyle.fontSize === size ? "#fff" : theme.colors.textPrimary}
            />
          </View>
        </Pressable>
      ))}

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      {/* Insert Options */}
      {onAddLink && (
        <>
          <Pressable onPress={onAddLink} style={styles.toolButton}>
            <Ionicons name="link" size={18} color={theme.colors.primary} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
        </>
      )}

      <Pressable onPress={onAddCode} style={styles.toolButton}>
        <Ionicons name="code" size={18} color={theme.colors.primary} />
      </Pressable>

      <Pressable onPress={onAddImage} style={styles.toolButton}>
        <Ionicons name="image" size={18} color={theme.colors.primary} />
      </Pressable>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 4,
  },
  toolButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
  },
  fontSizeButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    width: 1,
    marginVertical: 4,
  },
});

export default TextFormattingToolbar;
