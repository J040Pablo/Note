import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Linking,
  type NativeSyntheticEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
  type TextInputSelectionChangeEventData
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import type { DrawingPoint, DrawingStroke, NoteBlock, NoteCodeBlock, NoteDrawingBlock, NoteTextBlock, RichNoteDocument } from "@models/types";
import { pickAndStoreImage } from "@utils/mediaPicker";
import { debounce } from "@utils/performance";
import {
  createCodeBlock,
  createDrawingBlock,
  createEmptyRichNote,
  createImageBlock,
  createTextBlock,
  parseRichNoteContent,
  serializeRichNoteContent
} from "@utils/noteContent";
import { insertClipboardHtmlIntoRichDoc, isClipboardRichText } from "@utils/richClipboard";
import CodeBlockRenderer from "@components/CodeBlockRenderer";
import { TextBlockWithLinks } from "@components/TextBlockWithLinks";
import LinkModal from "@components/LinkModal";
import { useLinkHandler } from "@hooks/useLinkHandler";
import { useInternalSearch } from "@hooks/useInternalSearch";
import { useRichEditorLink } from "@hooks/useRichEditorLink";
import { stringToLink } from "@utils/linkUtils";

interface RichNoteEditorProps {
  value: string;
  onChangeText: (next: string) => void;
  mode?: "full" | "quick";
}

type TextSelectionRange = {
  start: number;
  end: number;
};

const clampFontSize = (size?: number) => {
  const next = size ?? 16;
  return Math.max(12, Math.min(28, next));
};

const distance = (a: DrawingPoint, b: DrawingPoint) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const DrawingCanvas = memo(function DrawingCanvas({
  block,
  onChange
}: {
  block: NoteDrawingBlock;
  onChange: (next: NoteDrawingBlock) => void;
}) {
  const { theme } = useTheme();
  const [canvasWidth, setCanvasWidth] = useState(1);
  const activeStrokeRef = useRef<DrawingStroke | null>(null);

  const appendPoint = useCallback(
    (x: number, y: number) => {
      const stroke = activeStrokeRef.current;
      if (!stroke) return;
      const point = { x: Math.max(0, Math.min(canvasWidth, x)), y: Math.max(0, Math.min(block.height, y)) };
      const last = stroke.points[stroke.points.length - 1];
      if (!last || distance(last, point) > 2) {
        stroke.points.push(point);
      }
    },
    [block.height, canvasWidth]
  );

  const startStroke = useCallback((x: number, y: number) => {
    activeStrokeRef.current = {
      id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      color: "#ef4444",
      size: 4,
      points: [{ x, y }]
    };
  }, []);

  const commitStroke = useCallback(() => {
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (!stroke || stroke.points.length < 2) return;
    onChange({ ...block, strokes: [...block.strokes, stroke] });
  }, [block, onChange]);

  const handleGrant = useCallback(
    (evt: GestureResponderEvent) => {
      const { locationX, locationY } = evt.nativeEvent;
      startStroke(locationX, locationY);
    },
    [startStroke]
  );

  const handleMove = useCallback(
    (evt: GestureResponderEvent, _state: PanResponderGestureState) => {
      const { locationX, locationY } = evt.nativeEvent;
      appendPoint(locationX, locationY);
    },
    [appendPoint]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: handleGrant,
        onPanResponderMove: handleMove,
        onPanResponderRelease: commitStroke,
        onPanResponderTerminate: commitStroke
      }),
    [commitStroke, handleGrant, handleMove]
  );

  return (
    <View style={[styles.blockCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
      <View style={styles.blockHeaderRow}>
        <Text muted variant="caption">Drawing</Text>
        <View style={styles.inlineActionsRow}>
          <Pressable onPress={() => onChange({ ...block, strokes: [] })} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color={theme.colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={async () => {
              const uri = await pickAndStoreImage("note-draw-bg");
              if (!uri) return;
              onChange({ ...block, backgroundUri: uri });
            }}
            hitSlop={8}
          >
            <Ionicons name="image-outline" size={16} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View
        {...panResponder.panHandlers}
        onLayout={(e) => setCanvasWidth(Math.max(1, e.nativeEvent.layout.width))}
        style={[styles.canvas, { height: block.height, borderColor: theme.colors.border }]}
      >
        {!!block.backgroundUri && <Image source={{ uri: block.backgroundUri }} style={styles.canvasBackgroundImage} resizeMode="cover" />}

        {block.strokes.map((stroke) =>
          stroke.points.map((p, idx) => (
            <View
              key={`${stroke.id}-${idx}`}
              style={{
                position: "absolute",
                left: p.x - stroke.size / 2,
                top: p.y - stroke.size / 2,
                width: stroke.size,
                height: stroke.size,
                borderRadius: stroke.size / 2,
                backgroundColor: stroke.color
              }}
            />
          ))
        )}
      </View>
    </View>
  );
});

export const RichNoteEditor: React.FC<RichNoteEditorProps> = ({ value, onChangeText, mode = "full" }) => {
  const { theme } = useTheme();
  const [doc, setDoc] = useState<RichNoteDocument>(() => parseRichNoteContent(value));
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selection, setSelection] = useState<TextSelectionRange>({ start: 0, end: 0 });
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isSizePickerOpen, setIsSizePickerOpen] = useState(false);
  
  // Link integration
  const { linkContext, setLinkContext, insertLinkInBlock, getSelectedText } = useRichEditorLink();
  const { searchInternalItems } = useInternalSearch();
  
  // Debounce ref to avoid excessive saves
  const debouncedSaveRef = useRef<((content: string) => void) | null>(null);

  // Define onInsertLinkHtml early so we can pass to useLinkHandler
  const onInsertLinkHtml = useCallback(
    (html: string) => {
      if (!linkContext || !selectedTextId) return;
      // Will call formatTextBlock when it's available
      setDoc((prev) => {
        const blockIndex = prev.blocks.findIndex((b) => b.id === selectedTextId);
        if (blockIndex < 0) return prev;
        const target = prev.blocks[blockIndex];
        if (target.type !== "text") return prev;
        const newText = insertLinkInBlock(target.text, html, linkContext);
        return {
          ...prev,
          blocks: prev.blocks.map((b, idx) =>
            idx === blockIndex && b.type === "text" ? { ...b, text: newText } : b
          )
        };
      });
      setLinkContext(null);
    },
    [linkContext, selectedTextId, insertLinkInBlock]
  );

  const { linkModalVisible, selectedText, openLinkModal, closeLinkModal, insertExternalLink, insertInternalLink, handleLinkPress } = useLinkHandler(onInsertLinkHtml);

  useEffect(() => {
    const parsed = parseRichNoteContent(value);

    if (mode !== "quick") {
      setDoc(parsed);
      return;
    }

    const allTextBlocks = parsed.blocks.every((b) => b.type === "text");
    if (!allTextBlocks) {
      setDoc(parsed);
      return;
    }

    if (parsed.blocks.length <= 1) {
      setDoc(parsed);
      return;
    }

    const mergedText = parsed.blocks.map((b) => (b.type === "text" ? b.text : "")).join("");
    const firstTextBlock = parsed.blocks[0] as NoteTextBlock;
    const mergedDoc: RichNoteDocument = {
      version: 1,
      blocks: [
        {
          ...createTextBlock(mergedText),
          style: firstTextBlock.style ? { ...firstTextBlock.style } : undefined,
          text: mergedText
        }
      ]
    };

    setDoc(mergedDoc);
  }, [mode, value]);

  // Create debounced save on mount
  useEffect(() => {
    debouncedSaveRef.current = debounce((content: string) => {
      onChangeText(content);
    }, 800);
  }, [onChangeText]);

  const commit = useCallback(
    (next: RichNoteDocument) => {
      setDoc(next);
      if (debouncedSaveRef.current) {
        debouncedSaveRef.current(serializeRichNoteContent(next));
      }
    },
    []
  );

  const updateBlock = useCallback(
    (blockId: string, updater: (prev: NoteBlock) => NoteBlock) => {
      setDoc((prev) => {
        const next: RichNoteDocument = {
          ...prev,
          blocks: prev.blocks.map((b) => (b.id === blockId ? updater(b) : b))
        };
        if (debouncedSaveRef.current) {
          debouncedSaveRef.current(serializeRichNoteContent(next));
        }
        return next;
      });
    },
    []
  );

  const insertAfter = useCallback(
    (index: number, block: NoteBlock) => {
      setDoc((prev) => {
        const nextBlocks = [...prev.blocks];
        nextBlocks.splice(index + 1, 0, block);
        const next = { ...prev, blocks: nextBlocks };
        if (debouncedSaveRef.current) {
          debouncedSaveRef.current(serializeRichNoteContent(next));
        }
        return next;
      });
    },
    []
  );

  const removeBlock = useCallback(
    (blockId: string) => {
      setDoc((prev) => {
        const nextBlocks = prev.blocks.filter((b) => b.id !== blockId);
        const next = { ...prev, blocks: nextBlocks.length ? nextBlocks : [createTextBlock("")] };
        if (debouncedSaveRef.current) {
          debouncedSaveRef.current(serializeRichNoteContent(next));
        }
        return next;
      });
    },
    []
  );

  const formatTextBlock = useCallback(
    (blockId: string, updater: (prev: NoteTextBlock) => NoteTextBlock) => {
      updateBlock(blockId, (prev) => {
        if (prev.type !== "text") return prev;
        return updater(prev);
      });
    },
    [updateBlock]
  );

  const handleAddLink = useCallback(() => {
    if (!selectedBlock) return;

    const selectedTextContent = getSelectedText(selectedBlock.text, {
      blockId: selectedBlock.id,
      start: selection.start,
      end: selection.end
    });

    setLinkContext({
      blockId: selectedBlock.id,
      start: selection.start,
      end: selection.end
    });

    openLinkModal(selectedTextContent);
  }, [selectedBlock, selection, getSelectedText, openLinkModal]);

  const selectedBlock = useMemo(
    () => doc.blocks.find((b) => b.id === selectedTextId && b.type === "text") as NoteTextBlock | undefined,
    [doc.blocks, selectedTextId]
  );

  const hasSelectedRange = useMemo(
    () => !!selectedBlock && selection.end > selection.start,
    [selectedBlock, selection.end, selection.start]
  );

  const applyStyleToSelection = useCallback(
    (updater: (prev: NoteTextBlock) => NoteTextBlock) => {
      if (!selectedBlock) return;

      // Important: keep text as a single flowing block.
      // Splitting one block into many blocks causes visual line-break/layout issues in RN TextInput.
      formatTextBlock(selectedBlock.id, updater);
    },
    [formatTextBlock, selectedBlock]
  );

  const applyFontPreset = useCallback(
    (preset: "small" | "normal" | "large" | "h1" | "h2" | "h3") => {
      const fontSizeMap: Record<typeof preset, number> = {
        small: 13,
        normal: 16,
        large: 20,
        h1: 32,
        h2: 28,
        h3: 24
      };

      const nextSize = fontSizeMap[preset];

      applyStyleToSelection((prev) => ({
        ...prev,
        style: {
          ...prev.style,
          fontSize: clampFontSize(nextSize)
        }
      }));
    },
    [applyStyleToSelection]
  );

  const applyTextColor = useCallback(
    (color: string) => {
      applyStyleToSelection((prev) => ({
        ...prev,
        style: {
          ...prev.style,
          textColor: color
        }
      }));
      setIsColorPickerOpen(false);
    },
    [applyStyleToSelection]
  );

  const applyTextSizePreset = useCallback(
    (preset: "small" | "normal" | "large" | "h1" | "h2" | "h3") => {
      applyFontPreset(preset);
      setIsSizePickerOpen(false);
    },
    [applyFontPreset]
  );

  const toggleColorPicker = useCallback(() => {
    setIsColorPickerOpen((prev) => {
      const next = !prev;
      if (next) setIsSizePickerOpen(false);
      return next;
    });
  }, []);

  const toggleSizePicker = useCallback(() => {
    setIsSizePickerOpen((prev) => {
      const next = !prev;
      if (next) setIsColorPickerOpen(false);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!selectedBlock) {
      setIsColorPickerOpen(false);
      setIsSizePickerOpen(false);
    }
  }, [selectedBlock]);

  const handleSelectionChange = useCallback(
    (blockId: string, event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      if (selectedTextId !== blockId) return;
      const { start, end } = event.nativeEvent.selection;
      setSelection({ start, end });
    },
    [selectedTextId]
  );

  const handleTextBlockChange = useCallback(
    (blockId: string, nextText: string) => {
      setDoc((prev) => {
        const blockIndex = prev.blocks.findIndex((b) => b.id === blockId);
        if (blockIndex < 0) return prev;
        const target = prev.blocks[blockIndex];
        if (target.type !== "text") return prev;

        // Initial rich-paste support:
        // if pasted payload looks like HTML, convert to internal rich blocks and
        // insert/merge into current document preserving other blocks.
        if (isClipboardRichText(nextText)) {
          const safeStart = Math.max(0, Math.min(selection.start, target.text.length));
          const safeEnd = Math.max(safeStart, Math.min(selection.end, target.text.length));
          const prefix = target.text.slice(0, safeStart);
          const suffix = target.text.slice(safeEnd);
          const merged = insertClipboardHtmlIntoRichDoc(
            prev,
            nextText,
            blockId,
            prefix,
            suffix,
            target.style
          );
          if (debouncedSaveRef.current) {
            debouncedSaveRef.current(serializeRichNoteContent(merged));
          }
          return merged;
        }

        const next: RichNoteDocument = {
          ...prev,
          blocks: prev.blocks.map((b) => (b.id === blockId && b.type === "text" ? { ...b, text: nextText } : b))
        };
        if (debouncedSaveRef.current) {
          debouncedSaveRef.current(serializeRichNoteContent(next));
        }
        return next;
      });
    },
    [selection.end, selection.start]
  );

  return (
    <View style={styles.root}>
      {!!selectedBlock && (
        <View style={styles.toolbarStack}>
          <View style={[styles.toolbar, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}> 
            <Pressable
              onPress={() =>
                applyStyleToSelection((prev) => ({
                  ...prev,
                  style: { ...prev.style, bold: !prev.style?.bold }
                }))
              }
              style={styles.toolbarButton}
            >
              <Text style={{ fontWeight: "700", color: theme.colors.textPrimary }}>B</Text>
            </Pressable>

            <Pressable
              onPress={() =>
                applyStyleToSelection((prev) => ({
                  ...prev,
                  style: { ...prev.style, italic: !prev.style?.italic }
                }))
              }
              style={styles.toolbarButton}
            >
              <Text style={{ fontStyle: "italic", color: theme.colors.textPrimary }}>I</Text>
            </Pressable>

            <Pressable
              onPress={() =>
                applyStyleToSelection((prev) => ({
                  ...prev,
                  style: { ...prev.style, underline: !prev.style?.underline }
                }))
              }
              style={styles.toolbarButton}
            >
              <Text style={{ textDecorationLine: "underline", color: theme.colors.textPrimary }}>U</Text>
            </Pressable>

            <Pressable
              onPress={() =>
                applyStyleToSelection((prev) => ({
                  ...prev,
                  style: { ...prev.style, strikethrough: !prev.style?.strikethrough }
                }))
              }
              style={styles.toolbarButton}
            >
              <Text style={{ textDecorationLine: "line-through", color: theme.colors.textPrimary }}>S</Text>
            </Pressable>

            <Pressable
              onPress={toggleColorPicker}
              style={[
                styles.toolbarButtonLabel,
                styles.menuTrigger,
                isColorPickerOpen && { backgroundColor: theme.colors.primary }
              ]}
            >
              <Ionicons
                name="color-palette-outline"
                size={14}
                color={isColorPickerOpen ? "#fff" : theme.colors.textPrimary}
              />
              <Text variant="caption" style={{ color: isColorPickerOpen ? "#fff" : theme.colors.textPrimary }}>
                Color
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                applyStyleToSelection((prev) => ({
                  ...prev,
                  style: {
                    ...prev.style,
                    highlightColor: prev.style?.highlightColor ? "" : "#FEF08A"
                  }
                }))
              }
              style={styles.toolbarButton}
            >
              <Ionicons name="brush-outline" size={16} color={theme.colors.textPrimary} />
            </Pressable>

            <View style={styles.toolbarDivider} />

            <Pressable
              onPress={toggleSizePicker}
              style={[
                styles.toolbarButtonLabel,
                styles.menuTrigger,
                isSizePickerOpen && { backgroundColor: theme.colors.primary }
              ]}
            >
              <Ionicons name="text-outline" size={14} color={isSizePickerOpen ? "#fff" : theme.colors.textPrimary} />
              <Text variant="caption" style={{ color: isSizePickerOpen ? "#fff" : theme.colors.textPrimary }}>
                Size
              </Text>
            </Pressable>

            <View style={styles.toolbarDivider} />

            <Pressable
              onPress={handleAddLink}
              style={styles.toolbarButton}
            >
              <Ionicons name="link" size={16} color={theme.colors.primary} />
            </Pressable>

            {hasSelectedRange && (
              <View style={styles.selectionBadge}>
                <Text variant="caption" muted>{selection.end - selection.start} selected</Text>
              </View>
            )}
          </View>

          {isColorPickerOpen && (
            <View style={[styles.dropdownPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
              <View style={styles.dropdownOptionsRow}>
                {["#ef4444", "#2563eb", "#16a34a", "#f59e0b", theme.colors.textPrimary].map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => applyTextColor(color)}
                    style={[
                      styles.colorSwatchLarge,
                      { backgroundColor: color },
                      selectedBlock.style?.textColor === color && { borderColor: theme.colors.primary, borderWidth: 2 }
                    ]}
                  />
                ))}
                <Pressable
                  onPress={() => applyTextColor("")}
                  style={[styles.dropdownChip, { borderColor: theme.colors.border }]}
                >
                  <Text variant="caption" style={{ color: theme.colors.textPrimary }}>Default</Text>
                </Pressable>
              </View>
            </View>
          )}

          {isSizePickerOpen && (
            <View style={[styles.dropdownPanel, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
              <View style={styles.dropdownOptionsRow}>
                {[
                  { key: "small", label: "Sm" },
                  { key: "normal", label: "N" },
                  { key: "large", label: "Lg" },
                  { key: "h1", label: "H1" },
                  { key: "h2", label: "H2" },
                  { key: "h3", label: "H3" }
                ].map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => applyTextSizePreset(option.key as "small" | "normal" | "large" | "h1" | "h2" | "h3")}
                    style={[styles.dropdownChip, { borderColor: theme.colors.border }]}
                  >
                    <Text variant="caption" style={{ color: theme.colors.textPrimary }}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {doc.blocks.map((block, index) => (
        <View key={block.id} style={styles.blockWrap}>
          {block.type === "text" && (
            <View style={[styles.blockCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
              <TextBlockWithLinks
                multiline
                isSelected={selectedTextId === block.id}
                value={block.text}
                onFocus={() => {
                  setSelectedTextId(block.id);
                  setSelection({ start: 0, end: 0 });
                }}
                onSelectionChange={(event) => handleSelectionChange(block.id, event)}
                onChangeText={(text) => handleTextBlockChange(block.id, text)}
                onLinkPress={handleLinkPress}
                placeholder="Write..."
                placeholderTextColor={theme.colors.textSecondary}
                style={[
                  styles.textBlockInput,
                  {
                    color: block.style?.textColor ?? theme.colors.textPrimary,
                    fontSize: clampFontSize(block.style?.fontSize),
                    fontWeight: block.style?.bold ? "700" : "400",
                    fontStyle: block.style?.italic ? "italic" : "normal",
                    textDecorationLine:
                      block.style?.underline && block.style?.strikethrough
                        ? "underline line-through"
                        : block.style?.underline
                        ? "underline"
                        : block.style?.strikethrough
                        ? "line-through"
                        : "none",
                    backgroundColor: block.style?.highlightColor || "transparent"
                  }
                ]}
              />
            </View>
          )}

          {block.type === "image" && (
            <View style={[styles.blockCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
              <Image source={{ uri: block.uri }} style={styles.imageBlock} resizeMode="cover" />
              <TextInput
                value={block.caption ?? ""}
                onChangeText={(caption) => updateBlock(block.id, (prev) => (prev.type === "image" ? { ...prev, caption } : prev))}
                placeholder="Caption (optional)"
                placeholderTextColor={theme.colors.textSecondary}
                style={[styles.captionInput, { color: theme.colors.textPrimary }]}
              />
              <View style={styles.imageActionsRow}>
                <Pressable
                  onPress={() =>
                    updateBlock(block.id, (prev) => {
                      if (prev.type !== "image") return prev;
                      return createDrawingBlock(prev.uri);
                    })
                  }
                >
                  <Text muted variant="caption">Annotate</Text>
                </Pressable>
                <Pressable onPress={() => removeBlock(block.id)}>
                  <Text muted variant="caption">Remove</Text>
                </Pressable>
              </View>
            </View>
          )}

          {block.type === "drawing" && (
            <DrawingCanvas
              block={block}
              onChange={(next) => updateBlock(block.id, () => next)}
            />
          )}

          {block.type === "code" && (
            <CodeBlockRenderer
              block={block}
              onUpdate={(code) => 
                updateBlock(block.id, (prev) => (prev.type === "code" ? { ...prev, code } : prev))
              }
              onChangeLanguage={(lang) => 
                updateBlock(block.id, (prev) => (prev.type === "code" ? { ...prev, language: lang } : prev))
              }
              onDelete={() => removeBlock(block.id)}
              editable
            />
          )}

          {mode === "full" && <View style={styles.insertRow}>
            <Pressable
              style={[styles.insertButton, { borderColor: theme.colors.border }]}
              onPress={() => insertAfter(index, createTextBlock(""))}
            >
              <Ionicons name="text-outline" size={14} color={theme.colors.textSecondary} />
              <Text muted variant="caption">Text</Text>
            </Pressable>
            <Pressable
              style={[styles.insertButton, { borderColor: theme.colors.border }]}
              onPress={async () => {
                const uri = await pickAndStoreImage("note-img");
                if (!uri) return;
                insertAfter(index, createImageBlock(uri));
              }}
            >
              <Ionicons name="image-outline" size={14} color={theme.colors.textSecondary} />
              <Text muted variant="caption">Image</Text>
            </Pressable>
            <Pressable
              style={[styles.insertButton, { borderColor: theme.colors.border }]}
              onPress={() => insertAfter(index, createCodeBlock())}
            >
              <Ionicons name="code" size={14} color={theme.colors.textSecondary} />
              <Text muted variant="caption">Code</Text>
            </Pressable>
            <Pressable
              style={[styles.insertButton, { borderColor: theme.colors.border }]}
              onPress={() => insertAfter(index, createDrawingBlock())}
            >
              <Ionicons name="brush-outline" size={14} color={theme.colors.textSecondary} />
              <Text muted variant="caption">Draw</Text>
            </Pressable>
            <Pressable
              style={[styles.insertButton, { borderColor: theme.colors.border }]}
              onPress={() => removeBlock(block.id)}
            >
              <Ionicons name="trash-outline" size={14} color={theme.colors.textSecondary} />
              <Text muted variant="caption">Delete</Text>
            </Pressable>
          </View>}
        </View>
      ))}

      <Pressable
        onPress={() => commit(doc.blocks.length ? doc : createEmptyRichNote())}
        style={[styles.footerHint, { borderColor: theme.colors.border }]}
      >
        <Text muted variant="caption">
          {mode === "quick" ? "Autosave enabled • Selection formatting" : "Autosave enabled • Rich blocks"}
        </Text>
      </Pressable>

      <LinkModal
        visible={linkModalVisible}
        selectedText={selectedText}
        onClose={closeLinkModal}
        onInsertExternal={insertExternalLink}
        onInsertInternal={insertInternalLink}
        onSearchInternalItems={searchInternalItems}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    gap: 10,
    marginTop: 8
  },
  toolbarStack: {
    gap: 6
  },
  toolbar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap"
  },
  toolbarButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  toolbarButtonLabel: {
    minWidth: 34,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4
  },
  menuTrigger: {
    paddingHorizontal: 10,
    minWidth: 74
  },
  dropdownPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  dropdownOptionsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  dropdownChip: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  toolbarDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginHorizontal: 2
  },
  selectionBadge: {
    marginLeft: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  colorSwatchLarge: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.2)"
  },
  blockWrap: {
    gap: 8
  },
  blockCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden"
  },
  textBlockInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top"
  },
  imageBlock: {
    width: "100%",
    height: 220
  },
  captionInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14
  },
  imageActionsRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  blockHeaderRow: {
    paddingHorizontal: 12,
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  inlineActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  canvas: {
    margin: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#ffffff"
  },
  canvasBackgroundImage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%"
  },
  insertRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  insertButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  footerHint: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4
  }
});
