import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import type { DrawingPoint, DrawingStroke, NoteBlock, NoteDrawingBlock, NoteTextBlock, RichNoteDocument } from "@models/types";
import { pickAndStoreImage } from "@utils/mediaPicker";
import {
  createDrawingBlock,
  createEmptyRichNote,
  createImageBlock,
  createTextBlock,
  parseRichNoteContent,
  serializeRichNoteContent
} from "@utils/noteContent";

interface RichNoteEditorProps {
  value: string;
  onChangeText: (next: string) => void;
}

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

export const RichNoteEditor: React.FC<RichNoteEditorProps> = ({ value, onChangeText }) => {
  const { theme } = useTheme();
  const [doc, setDoc] = useState<RichNoteDocument>(() => parseRichNoteContent(value));
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  useEffect(() => {
    setDoc(parseRichNoteContent(value));
  }, [value]);

  const commit = useCallback(
    (next: RichNoteDocument) => {
      setDoc(next);
      onChangeText(serializeRichNoteContent(next));
    },
    [onChangeText]
  );

  const updateBlock = useCallback(
    (blockId: string, updater: (prev: NoteBlock) => NoteBlock) => {
      const next: RichNoteDocument = {
        ...doc,
        blocks: doc.blocks.map((b) => (b.id === blockId ? updater(b) : b))
      };
      commit(next);
    },
    [commit, doc]
  );

  const insertAfter = useCallback(
    (index: number, block: NoteBlock) => {
      const nextBlocks = [...doc.blocks];
      nextBlocks.splice(index + 1, 0, block);
      commit({ ...doc, blocks: nextBlocks });
    },
    [commit, doc]
  );

  const removeBlock = useCallback(
    (blockId: string) => {
      const nextBlocks = doc.blocks.filter((b) => b.id !== blockId);
      commit({ ...doc, blocks: nextBlocks.length ? nextBlocks : [createTextBlock("")] });
    },
    [commit, doc]
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

  const selectedBlock = useMemo(
    () => doc.blocks.find((b) => b.id === selectedTextId && b.type === "text") as NoteTextBlock | undefined,
    [doc.blocks, selectedTextId]
  );

  return (
    <View style={styles.root}>
      {!!selectedBlock && (
        <View style={[styles.toolbar, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}> 
          <Pressable
            onPress={() =>
              formatTextBlock(selectedBlock.id, (prev) => ({
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
              formatTextBlock(selectedBlock.id, (prev) => ({
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
              formatTextBlock(selectedBlock.id, (prev) => ({
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
              formatTextBlock(selectedBlock.id, (prev) => ({
                ...prev,
                style: {
                  ...prev.style,
                  textColor: prev.style?.textColor === "#ef4444" ? theme.colors.textPrimary : "#ef4444"
                }
              }))
            }
            style={styles.toolbarButton}
          >
            <Ionicons name="color-palette-outline" size={16} color={theme.colors.textPrimary} />
          </Pressable>

          <Pressable
            onPress={() =>
              formatTextBlock(selectedBlock.id, (prev) => ({
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

          <Pressable
            onPress={() =>
              formatTextBlock(selectedBlock.id, (prev) => ({
                ...prev,
                style: { ...prev.style, fontSize: clampFontSize((prev.style?.fontSize ?? 16) - 2) }
              }))
            }
            style={styles.toolbarButton}
          >
            <Ionicons name="remove" size={16} color={theme.colors.textPrimary} />
          </Pressable>

          <Pressable
            onPress={() =>
              formatTextBlock(selectedBlock.id, (prev) => ({
                ...prev,
                style: { ...prev.style, fontSize: clampFontSize((prev.style?.fontSize ?? 16) + 2) }
              }))
            }
            style={styles.toolbarButton}
          >
            <Ionicons name="add" size={16} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
      )}

      {doc.blocks.map((block, index) => (
        <View key={block.id} style={styles.blockWrap}>
          {block.type === "text" && (
            <View style={[styles.blockCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
              <TextInput
                multiline
                value={block.text}
                onFocus={() => setSelectedTextId(block.id)}
                onChangeText={(text) => updateBlock(block.id, (prev) => (prev.type === "text" ? { ...prev, text } : prev))}
                placeholder="Write..."
                placeholderTextColor={theme.colors.textSecondary}
                style={[
                  styles.textBlockInput,
                  {
                    color: block.style?.textColor ?? theme.colors.textPrimary,
                    fontSize: clampFontSize(block.style?.fontSize),
                    fontWeight: block.style?.bold ? "700" : "400",
                    fontStyle: block.style?.italic ? "italic" : "normal",
                    textDecorationLine: block.style?.underline ? "underline" : "none",
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

          <View style={styles.insertRow}>
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
          </View>
        </View>
      ))}

      <Pressable
        onPress={() => commit(doc.blocks.length ? doc : createEmptyRichNote())}
        style={[styles.footerHint, { borderColor: theme.colors.border }]}
      >
        <Text muted variant="caption">Autosave enabled • Rich blocks</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    gap: 10,
    marginTop: 8
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
