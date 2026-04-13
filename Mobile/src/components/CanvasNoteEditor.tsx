/**
 * CanvasNoteEditor – Canva-style spatial canvas for notes.
 *
 * Key design decisions
 * --------------------
 * 1. Notes are page-based (fixed-size pages stacked vertically, scrollable).
 * 2. Only one element can be selected at a time; selection is explicit.
 * 3. Selection shows a visible box + 8 resize handles (corners + sides).
 * 4. Elements move by dragging inside the selection box; resize via handles.
 * 5. All state mutations go through setDoc. A 220 ms debounce calls onChangeText
 *    so interactions remain smooth.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Keyboard,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  Image
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import PencilToolbarModal from "@components/PencilToolbarModal";
import type { CanvasElement, CanvasNoteDocument, CanvasPage, ID } from "@models/types";
import { pickAndSaveImage, deleteImage } from "@services/imageService";
import { highlightCodeBlock } from "@utils/syntaxHighlighter";
import {
  createCanvasDrawingElement,
  createCanvasImageElement,
  createCanvasShapeElement,
  createCanvasTextElement,
  parseCanvasNoteContent,
  serializeCanvasNoteContent
} from "@utils/noteContent";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────────────────────

const MIN_EL = 40;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const HISTORY_LIMIT = 80;
const FLOATING_TOOLBAR_H = 46;
const FONT_FAMILIES = ["System", "sans-serif", "serif", "monospace", "cursive"] as const;
const TEXT_COLORS = ["#111827", "#FFFFFF", "#EF4444", "#3B82F6", "#22C55E", "#EAB308", "#EC4899"];
const TEXT_SIZE_PRESETS = [12, 14, 16, 18, 21, 24, 28, 32, 40, 48];
const DRAW_COLORS = ["#F9FAFB", "#A78BFA", "#F472B6", "#60A5FA", "#34D399", "#FBBF24", "#FB7185"];
const DRAW_SIZES = [2, 4, 6, 8, 12];
const DRAW_OPACITIES = [0.35, 0.55, 0.75, 1];
const DRAW_SMOOTH_LEVELS = [0, 0.25, 0.45, 0.65, 0.82];
const PAGE_SWIPE_DIST = 50;
const PAGE_SWIPE_VELOCITY = 0.45;
const PAGE_CENTER_Y_BIAS = 32;
const MAX_STROKE_STEP = 4;
const MAX_STROKE_CONNECT_DISTANCE = 240;
const MAX_INTERPOLATED_POINTS_PER_MOVE = 64;
const DRAW_TOUCH_PAD = 1000;
const SNAP_THRESHOLD = 8;
const DOUBLE_TAP_MS = 280;
const makeLocalId = (): ID => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

type InteractionMode = "move" | "resize" | "rotate";
type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type DrawingToolMode = "pencil" | "transparentPencil" | "eraser" | null;
type EditorInteractionMode = "draw" | "select" | "text";
type TextInteractionMode = "idle" | "selected" | "editing";

interface CanvasNoteEditorProps {
  value: string;
  onChangeText: (value: string) => void;
  toolbarVisible?: boolean;
  editable?: boolean;
  centerSignal?: number;
  isViewMode?: boolean;  // 🔥 NEW: true = view/read-only mode, false = editor mode
}

interface ElementInteraction {
  elementId: string;
  mode: InteractionMode;
  handle?: ResizeHandle;
  startElX: number;
  startElY: number;
  startElW: number;
  startElH: number;
  startElRotation: number;
  startPageX: number;
  startPageY: number;
}

interface PinchState {
  startDist: number;
  startZoom: number;
  anchorX: number;
  anchorY: number;
  overviewTriggered?: boolean;
}

interface CanvasPanState {
  startOffsetX: number;
  startOffsetY: number;
}

interface DrawingDraft {
  pageId: ID;
  points: Array<{ x: number; y: number } | null>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const getMaxZ = (els: CanvasElement[]) => els.reduce((acc, el) => Math.max(acc, el.zIndex ?? 0), 0);

const buildSmoothPath = (points: Array<{ x: number; y: number } | null>) => {
  if (!points.length) return "";
  let d = "";
  let segment: Array<{ x: number; y: number }> = [];

  const flushSegment = () => {
    if (!segment.length) return;
    if (segment.length === 1) {
      const p = segment[0];
      d += ` M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
      segment = [];
      return;
    }
    d += ` M ${segment[0].x} ${segment[0].y}`;
    for (let i = 0; i < segment.length - 1; i += 1) {
      const p0 = segment[i - 1] ?? segment[i];
      const p1 = segment[i];
      const p2 = segment[i + 1];
      const p3 = segment[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    segment = [];
  };

  for (const point of points) {
    if (!point) {
      flushSegment();
      continue;
    }
    segment.push(point);
  }
  flushSegment();
  return d.trim();
};

const cloneDoc = (doc: CanvasNoteDocument): CanvasNoteDocument => JSON.parse(JSON.stringify(doc)) as CanvasNoteDocument;
const touchDist = (a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) =>
  Math.sqrt((a.pageX - b.pageX) ** 2 + (a.pageY - b.pageY) ** 2);

// 🔒 VALIDAÇÃO SEGURA DE EVENTOS TOUCH
const getSafePageCoords = (evt: GestureResponderEvent) => {
  const { pageX, pageY } = evt?.nativeEvent ?? {};
  if (typeof pageX !== "number" || typeof pageY !== "number") {
    console.warn("[CanvasEditor] Invalid touch coords", { pageX, pageY });
    return null;
  }
  return { pageX, pageY };
};

// 🧭 SNAP INTELIGENTE DE ROTAÇÃO
const snapRotation = (angle: number, threshold = 6) => {
  const snapAngles = [0, 90, 180, 270];
  for (const snapAngle of snapAngles) {
    if (Math.abs(angle - snapAngle) < threshold) {
      return snapAngle;
    }
  }
  return angle;
};

// 📐 NORMALIZAR ÂNGULO PARA 0-360
const normalizeAngle = (angle: number): number => {
  return ((angle % 360) + 360) % 360;
};

const toPositiveNumber = (value: unknown, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const getCenteredCanvasPosition = (
  viewportWidth: number,
  viewportHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  scale: number
) => ({
  x: viewportWidth / 2 - (canvasWidth * scale) / 2,
  y: viewportHeight / 2 - (canvasHeight * scale) / 2
});
const normalizeCanvasDoc = (raw: CanvasNoteDocument): CanvasNoteDocument => {
  const pageWidth = toPositiveNumber(raw.pageWidth, 900);
  const pageHeight = toPositiveNumber(raw.pageHeight, 1200);
  const pages = (raw.pages ?? []).map((p) => ({
    ...p,
    width: toPositiveNumber(p.width, pageWidth),
    height: toPositiveNumber(p.height, pageHeight)
  }));
  const safePages = pages.length ? pages : [{ id: "page-1", width: pageWidth, height: pageHeight }];
  const offsetX = Number.isFinite(raw.offsetX) ? (raw.offsetX as number) : 0;
  const offsetY = Number.isFinite(raw.offsetY) ? (raw.offsetY as number) : 0;
  const zoom = Number.isFinite(raw.zoom) ? clamp(raw.zoom, ZOOM_MIN, ZOOM_MAX) : 1;
  return {
    ...raw,
    pageWidth,
    pageHeight,
    pages: safePages,
    offsetX,
    offsetY,
    zoom
  };
};
const sameRect = (
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null
) =>
  !!a &&
  !!b &&
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// Arrow shape
// ─────────────────────────────────────────────────────────────────────────────

const ArrowShape = memo(({ color, strokeWidth }: { color: string; strokeWidth: number }) => {
  const head = Math.max(8, strokeWidth * 2.5);
  return (
    <View style={styles.arrowWrap}>
      <View style={[styles.arrowLine, { backgroundColor: color, height: strokeWidth }]} />
      <View
        style={[
          styles.arrowHead,
          {
            borderTopWidth: head,
            borderBottomWidth: head,
            borderLeftWidth: head * 1.4,
            borderLeftColor: color
          }
        ]}
      />
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Single canvas element
// ─────────────────────────────────────────────────────────────────────────────

interface ElementProps {
  element: CanvasElement;
  selected: boolean;
  editable: boolean;
  isTextEditing: boolean;
  isDragging: boolean;
  isRotating: boolean;  // 📐 Indica se está em modo rotação
  rotationAngle: number;  // 📐 Ângulo atual de rotação
  primaryColor: string;
  surfaceElevated: string;
  defaultTextColor: string;
  isOpeningLinkRef: React.MutableRefObject<boolean>;
  isViewMode?: boolean;  // 🔥 NEW: true = read-only view mode
  onSetRef: (id: string, node: View | null) => void;
  onSetInputRef: (id: string, node: TextInput | null) => void;
  onTextFocused: (id: string) => void;
  onSelect: (id: string) => void;
  onEnterTextEdit: (id: string) => void;
  onSetTextMoveMode: (id: string) => void;
  onSetTextToolbarMode: (mode: "hidden" | "floating" | "keyboard") => void;
  onMeasureToolbarPosition: (id: string) => void;
  onMovePressIn: (el: CanvasElement, evt: GestureResponderEvent) => void;
  onRotatePressIn: (el: CanvasElement, evt: GestureResponderEvent) => void;
  onResizePressIn: (el: CanvasElement, handle: ResizeHandle, evt: GestureResponderEvent) => void;
  onChangeText: (id: string, text: string) => void;
  onSelectionChange: (selection: { start: number; end: number } | null) => void;
  textInteractionMode?: "idle" | "selected" | "editing";
}

const CanvasElementView = memo(
  ({
    element,
    selected,
    editable,
    isTextEditing,
    isDragging,
    isRotating,  // 📐 Prop para controlar visibilidade do ângulo
    rotationAngle,  // 📐 Ângulo atual
    primaryColor,
    surfaceElevated,
    defaultTextColor,
    isOpeningLinkRef,
    isViewMode,
    onSetRef,
    onSetInputRef,
    onTextFocused,
    onSelect,
    onEnterTextEdit,
    onSetTextMoveMode,
    onSetTextToolbarMode,
    onMeasureToolbarPosition,
    onMovePressIn,
    onRotatePressIn,
    onResizePressIn,
    onChangeText,
    onSelectionChange,
    textInteractionMode
  }: ElementProps) => {
    const lastTapRef = useRef(0);
    const inputRefRef = useRef<TextInput | null>(null);

    // Focus TextInput when entering edit mode
    useEffect(() => {
      if (textInteractionMode === "editing" && element.type === "text") {
        inputRefRef.current?.focus?.();
      }
    }, [textInteractionMode, element.type]);

    const handlePress = useCallback(() => {
      // 🔥 SOLO USE textInteractionMode - IGNORE isTextEditing
      if (!editable) return;
      if (element.type !== "text") {
        onSelect(element.id);
        return;
      }

      if (textInteractionMode === "editing") return;

      const now = Date.now();
      const isDoubleTap = textInteractionMode === "selected" && now - lastTapRef.current <= DOUBLE_TAP_MS;
      lastTapRef.current = now;

      if (isDoubleTap) {
        onEnterTextEdit(element.id);
        return;
      }

      onSetTextMoveMode(element.id);
    }, [editable, element.id, element.type, textInteractionMode, onEnterTextEdit, onSelect, onSetTextMoveMode]);

    const handlePressIn = useCallback(
      (evt: GestureResponderEvent) => {
        if (!editable) return;
        if (element.type === "text") {
          if (textInteractionMode === "editing") return;
          // When in selected mode, allow drag to move
          onMovePressIn(element, evt);
          return;
        }
        onMovePressIn(element, evt);
      },
      [editable, element, textInteractionMode, onMovePressIn]
    );

    const handleTextPress = useCallback(
      (evt: GestureResponderEvent) => {
        if (!editable || isTextEditing) return;
        evt.stopPropagation();
        onSelect(element.id);
        onEnterTextEdit(element.id);
      },
      [editable, element.id, isTextEditing, onEnterTextEdit, onSelect]
    );

    const handleLinkPress = useCallback(() => {
      // 🔥 CRITICAL RULE: Links only work in VIEW MODE
      // In editor mode, selection/editing always takes priority
      if (!isViewMode) {
        return;
      }

      if (element.type !== "text") return;
      const metadata = (element as any).metadata as any;
      if (!metadata?.link) return;
      const url = metadata.link.url;
      if (!url) return;
      
      // Check if it's a valid URL
      const validUrl = url.startsWith("http://") || url.startsWith("https://") || url.startsWith("app://")
        ? url
        : `https://${url}`;
      
      Linking.openURL(validUrl).catch(() => {
        Alert.alert("Cannot open link", "The link is not valid");
      });
    }, [element, isViewMode]);

    const handleElementPress = useCallback(() => {
      // 🔥 LINK BEHAVIOR DEPENDS ON VIEWING MODE
      const metadata = (element as any).metadata as any;
      const hasLink = element.type === "text" && metadata?.link?.url;

      // VIEW MODE: Links take priority, text clicks do nothing
      if (isViewMode) {
        if (hasLink) {
          handleLinkPress();
        }
        // In view mode, don't select/edit
        return;
      }

      // EDITOR MODE: Selection/editing takes priority, links ignored
      handlePress();
    }, [element, isViewMode, handleLinkPress, handlePress]);

    const handleText = useCallback(
      (t: string) => {
        if (!editable) return;
        onChangeText(element.id, t);
      },
      [editable, element.id, onChangeText]
    );

    let inner: React.ReactNode = null;

    if (element.type === "text") {
      const color = element.style?.textColor ?? defaultTextColor;
      const isCodeBlock = element.style?.fontFamily === "monospace";
      const canEditText = textInteractionMode === "editing" && editable && !isDragging;
      const codeEditColor = "#E5E7EB";
      const codeEditBackground = "#111827";
      const textDecorationLine = element.style?.underline
        ? element.style?.strikethrough
          ? "underline line-through"
          : "underline"
        : element.style?.strikethrough
          ? "line-through"
          : "none";
      
      // Use syntax highlighting for code blocks
      if (isCodeBlock && !canEditText) {
        const highlights = highlightCodeBlock(element.text, "javascript", "dark");
        inner = (
          <View style={{ paddingHorizontal: 8, paddingVertical: 6, width: "100%", height: "100%" }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {highlights.map((highlight, idx) => (
                <Text
                  key={idx}
                  style={{
                    fontSize: element.style?.fontSize ?? 18,
                    fontFamily: "monospace",
                    fontWeight: highlight.fontWeight === "bold" ? "700" : (element.style?.bold ? "700" : "400"),
                    fontStyle: element.style?.italic ? "italic" : "normal",
                    color: highlight.color,
                    lineHeight: (element.style?.fontSize ?? 18) * 1.4
                  }}
                >
                  {highlight.text}
                </Text>
              ))}
            </View>
          </View>
        );
      } else {
        inner = (
          <TextInput
            ref={(node) => {
              inputRefRef.current = node;
              onSetInputRef(element.id, node);
            }}
            multiline
            scrollEnabled={false}
            value={element.text}
            editable={canEditText}
            pointerEvents={canEditText ? "auto" : "auto"}
            onFocus={() => {
              if (!editable) return;
              // Only set toolbar mode to keyboard, DO NOT change interaction mode
              onSetTextToolbarMode("keyboard");
              onMeasureToolbarPosition(element.id);
            }}
            onBlur={() => {
              if (!editable) return;
              if (isOpeningLinkRef.current) return;
              // When blur occurs during editing, revert to selected or idle
              if (textInteractionMode === "editing") {
                onSetTextToolbarMode("floating");
              }
            }}
            onSelectionChange={(e) => {
              const selection = {
                start: e.nativeEvent.selection.start,
                end: e.nativeEvent.selection.end
              };
              onSelectionChange(selection);
            }}
            onChangeText={handleText}
            placeholder="Tap to type…"
            placeholderTextColor={isCodeBlock ? "#9CA3AF" : `${color}66`}
            style={{
              color: isCodeBlock ? codeEditColor : color,
              fontSize: element.style?.fontSize ?? 18,
              fontWeight: element.style?.bold ? "700" : "400",
              fontStyle: element.style?.italic ? "italic" : "normal",
              textDecorationLine,
              textAlign: element.style?.textAlign ?? "left",
              fontFamily: element.style?.fontFamily,
              backgroundColor: isCodeBlock ? codeEditBackground : "transparent",
              borderRadius: isCodeBlock ? 8 : 0,
              paddingHorizontal: 8,
              paddingVertical: 6,
              width: "100%",
              height: "100%",
              textAlignVertical: "top"
            }}
          />
        );
      }
    } else if (element.type === "image") {
      inner = element.uri ? <Image source={{ uri: element.uri }} style={styles.imageFill} resizeMode="contain" /> : <View style={[styles.imageFill, { backgroundColor: "#f0f0f0" }]} />;
    } else if (element.type === "shape") {
      if (element.shape === "arrow") {
        inner = <ArrowShape color={element.color} strokeWidth={element.strokeWidth} />;
      } else if (element.shape === "circle") {
        inner = (
          <View
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 999,
              borderColor: element.color,
              borderWidth: element.strokeWidth
            }}
          />
        );
      } else {
        inner = (
          <View
            style={{ width: "100%", height: "100%", borderColor: element.color, borderWidth: element.strokeWidth }}
          />
        );
      }
    }

    const showTextBorder = element.type === "text" && (textInteractionMode === "selected" || textInteractionMode === "editing");
    const showTextHandles = element.type === "text" && (textInteractionMode === "selected" || isRotating);
    const showNonTextBorder = selected && element.type !== "text";

    return (
      <View
        ref={(node) => onSetRef(element.id, node)}
        style={{
          position: "absolute",
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          transform: [{ rotate: `${element.rotation}deg` }],
          zIndex: element.zIndex,
          borderWidth: showTextBorder || showNonTextBorder ? 2 : 0,
          borderColor: showTextBorder || showNonTextBorder ? primaryColor : "transparent",
          borderRadius: 10
        }}
      >
        <Pressable
          onPress={handleElementPress}
          onPressIn={element.type === "text" ? undefined : handlePressIn}
          pointerEvents="auto"
          style={StyleSheet.absoluteFillObject}
        >
          {inner}
        </Pressable>

        {/* TEXT ELEMENT HANDLES - ONLY IN SELECTED MODE */}
        {editable && showTextHandles && (
          <>
            <View pointerEvents="box-none" style={styles.textActionButtonsWrap}>
              <View style={styles.textActionButtonsRow}>
                <Pressable
                  onPressIn={(evt) => onMovePressIn(element, evt)}
                  hitSlop={8}
                  style={[styles.textActionButton, styles.textActionButtonActive]}
                >
                  <Ionicons name="move" size={18} color="#111827" />
                </Pressable>

                <View style={{ position: "relative" }}>
                  <Pressable
                    onPressIn={(evt) => onRotatePressIn(element, evt)}
                    hitSlop={8}
                    style={styles.textActionButton}
                  >
                    <Ionicons name="sync" size={18} color="#111827" />
                  </Pressable>
                  {/* 📐 MOSTRAR ÂNGULO SOMENTE DURANTE DRAG DE ROTAÇÃO */}
                  {isRotating && (
                    <Text
                      style={{
                        position: "absolute",
                        top: -22,
                        left: "50%",
                        transform: [{ translateX: -15 }],
                        fontSize: 11,
                        color: "#fff",
                        backgroundColor: "#00000099",
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 3,
                        fontWeight: "600",
                        fontFamily: "monospace"
                      }}
                    >
                      {Math.round(rotationAngle)}°
                    </Text>
                  )}
                </View>
              </View>
            </View>
            {/* Corner resize handles for text */}
            {(["nw", "ne", "sw", "se"] as const).map((h) => (
              <Pressable
                key={h}
                onPressIn={(evt) => onResizePressIn(element, h, evt)}
                hitSlop={12}
                style={[
                  styles.handle,
                  styles.cornerHandle,
                  h === "nw" && styles.handleNW,
                  h === "ne" && styles.handleNE,
                  h === "sw" && styles.handleSW,
                  h === "se" && styles.handleSE,
                  { borderColor: primaryColor, backgroundColor: surfaceElevated }
                ]}
              />
            ))}
            {/* Side resize handles for text */}
            {(["n", "e", "s", "w"] as const).map((h) => (
              <Pressable
                key={h}
                onPressIn={(evt) => onResizePressIn(element, h, evt)}
                hitSlop={12}
                style={[
                  styles.handle,
                  styles.sideHandle,
                  h === "n" && styles.handleN,
                  h === "e" && styles.handleE,
                  h === "s" && styles.handleS,
                  h === "w" && styles.handleW,
                  { borderColor: primaryColor, backgroundColor: surfaceElevated }
                ]}
              />
            ))}
          </>
        )}

        {/* NON-TEXT ELEMENT HANDLES */}
        {editable && showNonTextBorder && (
          <>
            {/* Corner handles */}
            {(["nw", "ne", "sw", "se"] as const).map((h) => (
              <Pressable
                key={h}
                onPressIn={(evt) => onResizePressIn(element, h, evt)}
                hitSlop={12}
                style={[
                  styles.handle,
                  styles.cornerHandle,
                  h === "nw" && styles.handleNW,
                  h === "ne" && styles.handleNE,
                  h === "sw" && styles.handleSW,
                  h === "se" && styles.handleSE,
                  { borderColor: primaryColor, backgroundColor: surfaceElevated }
                ]}
              />
            ))}
            {/* Side handles */}
            {(["n", "e", "s", "w"] as const).map((h) => (
              <Pressable
                key={h}
                onPressIn={(evt) => onResizePressIn(element, h, evt)}
                hitSlop={12}
                style={[
                  styles.handle,
                  styles.sideHandle,
                  h === "n" && styles.handleN,
                  h === "e" && styles.handleE,
                  h === "s" && styles.handleS,
                  h === "w" && styles.handleW,
                  { borderColor: primaryColor, backgroundColor: surfaceElevated }
                ]}
              />
            ))}
          </>
        )}
      </View>
    );
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export const CanvasNoteEditor: React.FC<CanvasNoteEditorProps> = ({
  value,
  onChangeText,
  toolbarVisible = true,
  editable = true,
  centerSignal = 0,
  isViewMode = false  // 🔥 true = read-only view, false = editor
}) => {
  const { theme } = useTheme();
  const defaultTextColor = "#FFFFFF";

  // ── Document state ─────────────────────────────────────────────────────────
  const [doc, setDoc] = useState<CanvasNoteDocument>(() => {
    const parsed = normalizeCanvasDoc(parseCanvasNoteContent(value));
    return { ...parsed, zoom: 1, offsetX: 0, offsetY: 0 };
  });
  const [zoom, setZoom] = useState(1);
  const [canvasPosition, setCanvasPosition] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewportW, setViewportW] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [historyTick, setHistoryTick] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [rootLayout, setRootLayout] = useState({ width: 0, height: 0 });
  const [rootWindowFrame, setRootWindowFrame] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [selectedOverlayRect, setSelectedOverlayRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [textToolbarLayout, setTextToolbarLayout] = useState({ width: 320, height: FLOATING_TOOLBAR_H });
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [pendingFocusTextId, setPendingFocusTextId] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<DrawingToolMode>(null);
  const [mode, setMode] = useState<EditorInteractionMode>("select");
  const [textInteractionMode, setTextInteractionMode] = useState<TextInteractionMode>("idle");
  const [isRotating, setIsRotating] = useState(false);  // 📐 Controlar visibilidade do ângulo
  const [rotationAngle, setRotationAngle] = useState(0);  // 📐 Ângulo atualizado em tempo real
  const [drawingOpacity, setDrawingOpacity] = useState(1);
  const [drawingSmoothness, setDrawingSmoothness] = useState(0.05);
  const [drawingColor, setDrawingColor] = useState(DRAW_COLORS[1]);
  const [drawingSize, setDrawingSize] = useState(4);
  const [drawingDraft, setDrawingDraft] = useState<DrawingDraft | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [nextPageIndex, setNextPageIndex] = useState<number | null>(null);
  const [pageTransitionDirection, setPageTransitionDirection] = useState<1 | -1>(1);
  const [overviewMode, setOverviewMode] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<ID | null>(null);
  const [isDraggingPage, setIsDraggingPage] = useState(false);
  const [showRenamePageModal, setShowRenamePageModal] = useState(false);
  const [renamePageDraft, setRenamePageDraft] = useState("");
  const [alignmentGuides, setAlignmentGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [isElementDragging, setIsElementDragging] = useState(false);
  const [showPencilModal, setShowPencilModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkModalInput, setLinkModalInput] = useState("");
  const [selectedTextRange, setSelectedTextRange] = useState<{ start: number; end: number } | null>(null);
  const [textToolbarMode, setTextToolbarMode] = useState<"hidden" | "floating" | "keyboard">("hidden");
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const isOpeningLinkRef = useRef(false);
  const lastTextTapIdRef = useRef<string | null>(null);
  const lastTextTapTimeRef = useRef<number>(0);
  
  const docRef = useRef(doc);
  docRef.current = doc;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const canvasPositionRef = useRef(canvasPosition);
  canvasPositionRef.current = canvasPosition;
  const rootWindowFrameRef = useRef(rootWindowFrame);
  rootWindowFrameRef.current = rootWindowFrame;

  const elementInteractionRef = useRef<ElementInteraction | null>(null);
  const pinchStateRef = useRef<PinchState | null>(null);
  const canvasPanStateRef = useRef<CanvasPanState | null>(null);
  const rootRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const elementInputRefs = useRef<Map<string, TextInput | null>>(new Map());
  const elementRefs = useRef<Record<string, View | null>>({});
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const undoStackRef = useRef<CanvasNoteDocument[]>([]);
  const redoStackRef = useRef<CanvasNoteDocument[]>([]);
  const displayScaleRef = useRef(1);
  const pendingInitialCenterRef = useRef(true);
  const pageToolbarAnim = useRef(new Animated.Value(0)).current;
  const toolbarTranslateY = useRef(new Animated.Value(0)).current;
  const toolbarOpacity = useRef(new Animated.Value(1)).current;
  const pageSwipeX = useRef(new Animated.Value(0)).current;
  const pageSwipeActiveRef = useRef(false);
  const isDraggingPageRef = useRef(false);
  const animatedIndex = useRef(new Animated.Value(0)).current;
  const drawingSessionRef = useRef<{ active: boolean; pageId: ID | null }>({ active: false, pageId: null });
  const drawingLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const drawingTouchModeRef = useRef<"draw" | "gesture" | null>(null);
  const drawingRafRef = useRef<number | null>(null);
  const pendingDrawingPointRef = useRef<{ pageId: ID; x: number; y: number } | null>(null);

  const lastSerializedRef = useRef(serializeCanvasNoteContent(parseCanvasNoteContent(value)));
  const serializeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifyHistoryChanged = useCallback(() => setHistoryTick((v) => v + 1), []);

  const pushUndoSnapshot = useCallback(() => {
    undoStackRef.current.push(cloneDoc(docRef.current));
    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
    redoStackRef.current = [];
    notifyHistoryChanged();
  }, [notifyHistoryChanged]);

  const handleUndo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    redoStackRef.current.push(cloneDoc(docRef.current));
    setDoc(prev);
    setSelectedId(null);
    notifyHistoryChanged();
  }, [notifyHistoryChanged]);

  const handleRedo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(cloneDoc(docRef.current));
    setDoc(next);
    setSelectedId(null);
    notifyHistoryChanged();
  }, [notifyHistoryChanged]);

  // ── Debounced serialization ────────────────────────────────────────────────
  useEffect(() => {
    if (serializeTimerRef.current) clearTimeout(serializeTimerRef.current);
    serializeTimerRef.current = setTimeout(() => {
      serializeTimerRef.current = null;
      const s = serializeCanvasNoteContent(doc);
      if (s === lastSerializedRef.current) return;
      lastSerializedRef.current = s;
      onChangeText(s);
    }, 220);
    return () => {
      if (serializeTimerRef.current) clearTimeout(serializeTimerRef.current);
    };
  }, [doc, onChangeText]);

  const refreshRootWindowFrame = useCallback(() => {
    rootRef.current?.measureInWindow((x, y, width, height) => {
      const next = { x, y, width, height };
      rootWindowFrameRef.current = next;
      setRootWindowFrame((prev) =>
        Math.abs(prev.x - x) < 0.5 &&
        Math.abs(prev.y - y) < 0.5 &&
        Math.abs(prev.width - width) < 0.5 &&
        Math.abs(prev.height - height) < 0.5
          ? prev
          : next
      );
    });
  }, []);

  useEffect(() => {
    requestAnimationFrame(refreshRootWindowFrame);
  }, [refreshRootWindowFrame, rootLayout.height, rootLayout.width, zoom, canvasPosition.x, canvasPosition.y, currentPageIndex]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const selectedElement = useMemo(
    () => doc.elements.find((x) => x.id === selectedId) ?? null,
    [doc.elements, selectedId]
  );

  const selectedTextElement = useMemo(
    () => (selectedElement?.type === "text" ? selectedElement : null),
    [selectedElement]
  );

  const baseFitScale = useMemo(() => {
    const targetWidth = Math.max(220, viewportW - 32);
    const targetHeight = Math.max(220, viewportH - 32);
    const pageW = toPositiveNumber(doc.pageWidth, 900);
    const pageH = toPositiveNumber(doc.pageHeight, 1200);
    const fitByWidth = targetWidth / pageW;
    const fitByHeight = targetHeight / pageH;
    const fitScale = Math.min(fitByWidth, fitByHeight);
    return clamp(fitScale * 0.98, 0.2, 2.5);
  }, [doc.pageHeight, doc.pageWidth, viewportH, viewportW]);

  const displayScale = useMemo(() => clamp(baseFitScale * zoom, 0.2, 4), [baseFitScale, zoom]);
  displayScaleRef.current = displayScale;

  const clampCanvasOffset = useCallback(
    (rawX: number, rawY: number, scale: number = displayScaleRef.current) => {
      if (viewportW <= 0 || viewportH <= 0) return { x: rawX, y: rawY };
      const scaledW = Math.max(1, toPositiveNumber(doc.pageWidth, 900) * scale);
      const scaledH = Math.max(1, toPositiveNumber(doc.pageHeight, 1200) * scale);
      const panPadding = 1800;
      const minX = viewportW - scaledW - panPadding;
      const maxX = panPadding;
      const minY = viewportH - scaledH - panPadding;
      const maxY = panPadding;
      return {
        x: clamp(rawX, minX, maxX),
        y: clamp(rawY, minY, maxY)
      };
    },
    [doc.pageHeight, doc.pageWidth, viewportH, viewportW]
  );

  // Sync external value
  useEffect(() => {
    if (value === lastSerializedRef.current) return;

    const normalizedIncoming = normalizeCanvasDoc(parseCanvasNoteContent(value));
    const incoming = serializeCanvasNoteContent(normalizedIncoming);
    const current = serializeCanvasNoteContent(normalizeCanvasDoc(docRef.current));

    if (incoming === current) {
      lastSerializedRef.current = incoming;
      return;
    }

    if (incoming === lastSerializedRef.current) return;

    const pageW = toPositiveNumber(normalizedIncoming.pageWidth, 900);
    const pageH = toPositiveNumber(normalizedIncoming.pageHeight, 1200);
    const targetWidth = Math.max(220, viewportW - 32);
    const targetHeight = Math.max(220, viewportH - 32);
    const fitScale = clamp(Math.min(targetWidth / pageW, targetHeight / pageH) * 0.98, 0.2, 2.5);

    setDoc({ ...normalizedIncoming, zoom: 1, offsetX: 0, offsetY: 0 });
    setZoom(1);
    setCanvasPosition((prev) => {
      if (viewportW <= 0 || viewportH <= 0) return prev;
      const center = getCenteredCanvasPosition(viewportW, viewportH, pageW, pageH, fitScale);
      return clampCanvasOffset(center.x, center.y + PAGE_CENTER_Y_BIAS, fitScale);
    });

    pendingInitialCenterRef.current = true;
    lastSerializedRef.current = incoming;
    undoStackRef.current = [];
    redoStackRef.current = [];
    notifyHistoryChanged();
  }, [clampCanvasOffset, notifyHistoryChanged, value, viewportH, viewportW]);

  useEffect(() => {
    if (!pendingInitialCenterRef.current) return;
    if (viewportW <= 0 || viewportH <= 0) return;
    pendingInitialCenterRef.current = false;

    setZoom(1);
    const pageW = toPositiveNumber(docRef.current.pageWidth, 900);
    const pageH = toPositiveNumber(docRef.current.pageHeight, 1200);
    const center = getCenteredCanvasPosition(viewportW, viewportH, pageW, pageH, baseFitScale);
    const centered = clampCanvasOffset(center.x, center.y + PAGE_CENTER_Y_BIAS, baseFitScale);
    setCanvasPosition(centered);
  }, [baseFitScale, clampCanvasOffset, viewportH, viewportW]);

  const pagesById = useMemo(() => {
    const m = new Map<string, CanvasPage>();
    (doc.pages ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [doc.pages]);

  const setElementRef = useCallback((id: string, node: View | null) => {
    elementRefs.current[id] = node;
  }, []);

  const setInputRef = useCallback((id: string, node: TextInput | null) => {
    inputRefs.current[id] = node;
    if (node) {
      elementInputRefs.current.set(id, node);
    }
  }, []);

  const handleTextFocused = useCallback((id: string) => {
    setTextInteractionMode("editing");
    setMode("text");
    if (pendingFocusTextId === id) setPendingFocusTextId(null);
  }, [pendingFocusTextId]);

  // Refocus text input when link modal closes
  useEffect(() => {
    if (showLinkModal) {
      isOpeningLinkRef.current = false;
    }
  }, [showLinkModal]);

  // Refocus text input when link modal closes
  useEffect(() => {
    if (!showLinkModal && selectedId) {
      const input = elementInputRefs.current.get(selectedId);
      if (input) {
        requestAnimationFrame(() => {
          input.focus();
          if (selectionRef.current) {
            input.setSelection?.(selectionRef.current.start, selectionRef.current.end);
          }
        });
      }
    }
  }, [showLinkModal, selectedId]);

  // Handle keyboard show/hide for toolbar positioning
  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener("keyboardDidShow", () => {
        if (textInteractionMode === "editing") {
          setTextToolbarMode("keyboard");
        }
      }),
      Keyboard.addListener("keyboardDidHide", () => {
        if (selectedId && textInteractionMode === "editing") {
          setTextToolbarMode("floating");
        } else {
          setTextToolbarMode("hidden");
        }
      })
    ];
    
    return () => subscriptions.forEach(sub => sub.remove());
  }, [selectedId, textInteractionMode]);

  const clearAlignmentGuides = useCallback(() => {
    setAlignmentGuides((prev) => (prev.x === null && prev.y === null ? prev : { x: null, y: null }));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setIsElementDragging(false);
    clearAlignmentGuides();
    setTextInteractionMode("idle");
    // Keep drawing mode active; otherwise drawing touch layer is disabled mid-stroke.
    setMode(drawingMode ? "draw" : "select");
    setPendingFocusTextId(null);
    setShowStylePanel(false);
    setShowAlignMenu(false);
    setTextToolbarMode("hidden");
    Keyboard.dismiss();
  }, [clearAlignmentGuides, drawingMode]);

  useEffect(() => {
    if (selectedId) return;
    setIsElementDragging(false);
    clearAlignmentGuides();
  }, [clearAlignmentGuides, selectedId]);

  useEffect(() => {
    if (!pendingFocusTextId) return;
    const input = inputRefs.current[pendingFocusTextId];
    if (!input) return;
    const t = setTimeout(() => input.focus(), 60);
    return () => clearTimeout(t);
  }, [doc.elements, pendingFocusTextId]);

  useEffect(() => {
    if (selectedTextElement) return;
    setShowStylePanel(false);
    setShowAlignMenu(false);
  }, [selectedTextElement]);

  useEffect(() => {
    if (!selectedTextElement) return;
    setShowShapeMenu(false);
  }, [selectedTextElement]);

  useEffect(() => {
    if (!selectedTextElement) {
      setSelectedOverlayRect((prev) => (prev === null ? prev : null));
      return;
    }

    requestAnimationFrame(() => {
      rootRef.current?.measureInWindow((rootX, rootY, rootWidth, rootHeight) => {
        const elementNode = elementRefs.current[selectedTextElement.id];
        elementNode?.measureInWindow((x, y, width, height) => {
          const nextRect = { x: x - rootX, y: y - rootY, width, height };
          setSelectedOverlayRect((prev) => (sameRect(prev, nextRect) ? prev : nextRect));
        });
      });
    });
  }, [rootLayout.height, rootLayout.width, selectedTextElement?.id]);

  useEffect(() => {
    const max = Math.max(0, (doc.pages?.length ?? 1) - 1);
    setCurrentPageIndex((prev) => clamp(prev, 0, max));
    setNextPageIndex((prev) => (prev === null ? prev : clamp(prev, 0, max)));
  }, [doc.pages]);

  useEffect(() => {
    isDraggingPageRef.current = isDraggingPage;
  }, [isDraggingPage]);

  useEffect(() => {
    Animated.timing(animatedIndex, {
      toValue: currentPageIndex,
      duration: 200,
      useNativeDriver: false
    }).start();
  }, [animatedIndex, currentPageIndex]);

  const showPageToolbar = overviewMode && (!!selectedPageId || isDraggingPage);

  useEffect(() => {
    Animated.timing(pageToolbarAnim, {
      toValue: showPageToolbar ? 1 : 0,
      duration: showPageToolbar ? 180 : 140,
      useNativeDriver: true
    }).start();
  }, [pageToolbarAnim, showPageToolbar]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(toolbarTranslateY, {
        toValue: toolbarVisible ? 0 : -110,
        duration: 200,
        useNativeDriver: true
      }),
      Animated.timing(toolbarOpacity, {
        toValue: toolbarVisible ? 1 : 0,
        duration: 180,
        useNativeDriver: true
      })
    ]).start();
  }, [toolbarOpacity, toolbarTranslateY, toolbarVisible]);

  useEffect(() => {
    if (editable) return;
    setDrawingMode(null);
    setTextInteractionMode("idle");
    setShowShapeMenu(false);
    setShowStylePanel(false);
    setShowAlignMenu(false);
    setSelectedId(null);
    setIsElementDragging(false);
    clearAlignmentGuides();
    setPendingFocusTextId(null);
    elementInteractionRef.current = null;
  }, [clearAlignmentGuides, editable]);

  const getDefaultTargetPageId = useCallback((): ID | null => {
    if (selectedPageId) return selectedPageId;
    if (doc.pages?.length) {
      const safeIndex = clamp(currentPageIndex, 0, doc.pages.length - 1);
      const visiblePageId = doc.pages[safeIndex]?.id;
      if (visiblePageId) return visiblePageId;
    }
    if (selectedElement) return selectedElement.pageId;
    return doc.pages?.[0]?.id ?? null;
  }, [currentPageIndex, doc.pages, selectedElement, selectedPageId]);

  const updateElement = useCallback((id: string, updater: (prev: CanvasElement) => CanvasElement) => {
    setDoc((prev) => ({ ...prev, elements: prev.elements.map((el) => (el.id === id ? updater(el) : el)) }));
  }, []);

  const measureToolbarPosition = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const input = elementInputRefs.current.get(id);
      if (input) {
        input.measureInWindow((x, y, width, height) => {
          setToolbarPosition({ x, y, width, height });
        });
      }
    });
  }, []);

  const setTextMoveMode = useCallback(
    (id: string) => {
      if (!editable) return;
      setSelectedId(id);
      setTextInteractionMode("selected");
      setMode("select");
      setPendingFocusTextId(null);
      setTextToolbarMode("floating");
      Keyboard.dismiss();
      measureToolbarPosition(id);
    },
    [editable, measureToolbarPosition]
  );

  const addElement = useCallback((element: CanvasElement) => {
    pushUndoSnapshot();
    setDoc((prev) => {
      const maxZ = getMaxZ(prev.elements);
      return { ...prev, elements: [...prev.elements, { ...element, zIndex: maxZ + 1 }] };
    });
    setSelectedId(element.id);
  }, [pushUndoSnapshot]);

  const bringToFront = useCallback((id: string) => {
    setDoc((prev) => {
      const maxZ = getMaxZ(prev.elements);
      return { ...prev, elements: prev.elements.map((el) => (el.id === id ? { ...el, zIndex: maxZ + 1 } : el)) };
    });
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    pushUndoSnapshot();
    setDoc((prev) => ({ ...prev, elements: prev.elements.filter((x) => x.id !== selectedId) }));
    setSelectedId(null);
  }, [pushUndoSnapshot, selectedId]);

  const deleteSelectedOrAll = useCallback(() => {
    pushUndoSnapshot();
    if (selectedId) {
      setDoc((prev) => ({ ...prev, elements: prev.elements.filter((x) => x.id !== selectedId) }));
      setSelectedId(null);
      return;
    }

    setDoc((prev) => ({ ...prev, elements: [] }));
    setSelectedId(null);
  }, [pushUndoSnapshot, selectedId]);

  // ── Element callbacks ──────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (id: string) => {
      if (!editable || drawingMode) return;
      const target = docRef.current.elements.find((x) => x.id === id);
      
      // Double-tap logic for text elements
      if (target?.type === "text") {
        const now = Date.now();
        const isSameElement = lastTextTapIdRef.current === id;
        const isDoubleTap = isSameElement && (now - lastTextTapTimeRef.current) < DOUBLE_TAP_MS;
        
        lastTextTapIdRef.current = id;
        lastTextTapTimeRef.current = now;
        
        if (isDoubleTap) {
          // Second tap: enter edit mode
          setSelectedId(id);
          setTextInteractionMode("editing");
          setMode("text");
          setPendingFocusTextId(id);
          bringToFront(id);
          return;
        }
      }
      
      // First tap or non-text: just select
      setSelectedId(id);
      setTextInteractionMode(target?.type === "text" ? "selected" : "idle");
      setMode("select");
      bringToFront(id);
      
      // 📐 SEMPRE MEDIR POSIÇÃO DA TOOLBAR
      if (target?.type === "text") {
        requestAnimationFrame(() => {
          measureToolbarPosition(id);
        });
      }
    },
    [bringToFront, drawingMode, editable, measureToolbarPosition]
  );

  const enterTextEdit = useCallback(
    (id: string) => {
      if (!editable || drawingMode) return;
      const target = docRef.current.elements.find((x) => x.id === id);
      if (!target || target.type !== "text") return;
      
      setSelectedId(id);
      setTextInteractionMode("editing");
      setMode("text");
      setPendingFocusTextId(id);
      bringToFront(id);
      
      // 📐 FOCAR INPUT COM REQUESTANIMATIONFRAME
      requestAnimationFrame(() => {
        const input = elementInputRefs.current.get(id);
        if (input) {
          input.focus?.();
        }
      });
    },
    [bringToFront, drawingMode, editable]
  );

  const beginInteraction = useCallback(
    (el: CanvasElement, mode: InteractionMode, evt: GestureResponderEvent, handle?: ResizeHandle) => {
      if (!editable || drawingMode || textInteractionMode === "editing") return;
      if (!evt?.nativeEvent) return;
      
      // 🔒 VALIDAÇÃO SEGURA DE COORDENADAS
      const coords = getSafePageCoords(evt);
      if (!coords) return;
      
      pushUndoSnapshot();
      setSelectedId(el.id);
      setIsElementDragging(mode === "move");
      if (mode !== "move") clearAlignmentGuides();
      if (mode === "rotate") setIsRotating(true);  // 📐 INICIAR MODO ROTAÇÃO
      setTextInteractionMode("idle");
      bringToFront(el.id);
      elementInteractionRef.current = {
        elementId: el.id,
        mode,
        handle,
        startElX: el.x,
        startElY: el.y,
        startElW: el.width,
        startElH: el.height,
        startElRotation: el.rotation ?? 0,
        startPageX: coords?.pageX ?? 0,
        startPageY: coords?.pageY ?? 0
      };
    },
    [bringToFront, clearAlignmentGuides, drawingMode, editable, pushUndoSnapshot, textInteractionMode]
  );

  const handleElementMovePressIn = useCallback(
    (el: CanvasElement, evt: GestureResponderEvent) => beginInteraction(el, "move", evt),
    [beginInteraction]
  );

  const handleElementRotatePressIn = useCallback(
    (el: CanvasElement, evt: GestureResponderEvent) => {
      evt.stopPropagation();
      beginInteraction(el, "rotate", evt);
    },
    [beginInteraction]
  );

  const handleElementResizePressIn = useCallback(
    (el: CanvasElement, handle: ResizeHandle, evt: GestureResponderEvent) => {
      evt.stopPropagation();
      beginInteraction(el, "resize", evt, handle);
    },
    [beginInteraction]
  );

  const handleTextChange = useCallback(
    (id: string, text: string) => {
      if (!editable) return;
      updateElement(id, (prev) => (prev.type === "text" ? { ...prev, text } : prev));
    },
    [editable, updateElement]
  );

  const handleTextSizeChange = useCallback((id: string, h: number) => {
    setDoc((prev) => ({
      ...prev,
      elements: prev.elements.map((el) =>
        el.id === id && el.type === "text"
          ? { ...el, height: Math.max(el.height, Math.max(MIN_EL, h + 18)) }
          : el
      )
    }));
  }, []);

  const updateSelectedTextStyle = useCallback(
    (updater: (style: NonNullable<CanvasElement["type"] extends "text" ? never : never> | any) => any) => {
      if (!selectedTextElement) return;
      updateElement(selectedTextElement.id, (prev) => {
        if (prev.type !== "text") return prev;
        return { ...prev, style: updater(prev.style ?? {}) };
      });
    },
    [selectedTextElement, updateElement]
  );

  const cycleFontFamily = useCallback(() => {
    if (!selectedTextElement) return;
    const current = selectedTextElement.style?.fontFamily ?? "System";
    const idx = FONT_FAMILIES.indexOf(current as (typeof FONT_FAMILIES)[number]);
    const next = FONT_FAMILIES[(idx + 1 + FONT_FAMILIES.length) % FONT_FAMILIES.length];
    updateSelectedTextStyle((style: Record<string, unknown>) => ({ ...style, fontFamily: next }));
  }, [selectedTextElement, updateSelectedTextStyle]);

  const toggleTextStyle = useCallback(
    (key: "bold" | "italic" | "underline" | "strikethrough") => {
      updateSelectedTextStyle((style: Record<string, unknown>) => ({ ...style, [key]: !style[key] }));
    },
    [updateSelectedTextStyle]
  );

  const changeTextSize = useCallback(
    (delta: number) => {
      if (!selectedTextElement) return;
      const current = selectedTextElement.style?.fontSize ?? 18;
      const next = clamp(current + delta, 10, 84);
      updateSelectedTextStyle((style: Record<string, unknown>) => ({ ...style, fontSize: next }));
    },
    [selectedTextElement, updateSelectedTextStyle]
  );

  const setTextSize = useCallback(
    (size: number) => {
      updateSelectedTextStyle((style: Record<string, unknown>) => ({ ...style, fontSize: size }));
    },
    [updateSelectedTextStyle]
  );

  const setTextAlign = useCallback(
    (align: "left" | "center" | "right") => {
      updateSelectedTextStyle((style: Record<string, unknown>) => ({ ...style, textAlign: align }));
    },
    [updateSelectedTextStyle]
  );

  const setTextColor = useCallback(
    (color: string) => {
      updateSelectedTextStyle((style: Record<string, unknown>) => ({ ...style, textColor: color }));
    },
    [updateSelectedTextStyle]
  );

  const toggleCodeTextStyle = useCallback(() => {
    updateSelectedTextStyle((style: Record<string, unknown>) => {
      const isCode = style.fontFamily === "monospace";
      if (isCode) {
        return {
          ...style,
          fontFamily: "System",
          textColor: defaultTextColor,
          highlightColor: ""
        };
      }

      return {
        ...style,
        fontFamily: "monospace",
        textColor: "#E5E7EB",
        highlightColor: "#111827",
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false
      };
    });
  }, [defaultTextColor, updateSelectedTextStyle]);

  const handleSelectionChange = useCallback((selection: { start: number; end: number } | null) => {
    setSelectedTextRange(selection);
    selectionRef.current = selection;
  }, []);

  const handleOpenLinkModal = useCallback(() => {
    isOpeningLinkRef.current = true;
    selectionRef.current = selectedTextRange;
    setShowLinkModal(true);
  }, [selectedTextRange]);

  const addLinkToText = useCallback(() => {
    if (!linkModalInput.trim() || !selectedTextElement) return;
    
    const selection = selectionRef.current;
    if (!selection || selection.start === selection.end) {
      // No text selected, just add URL to end
      const linkMetadata = {
        url: linkModalInput,
        start: selectedTextElement.text.length,
        end: selectedTextElement.text.length
      };
      updateElement(selectedTextElement.id, (prev) =>
        prev.type === "text" 
          ? { ...prev, metadata: { ...((prev as any).metadata || {}), link: linkMetadata } } 
          : prev
      );
    } else {
      // Use selected text and add link metadata
      const linkMetadata = {
        url: linkModalInput,
        start: selection.start,
        end: selection.end
      };
      updateElement(selectedTextElement.id, (prev) =>
        prev.type === "text" 
          ? { ...prev, metadata: { ...((prev as any).metadata || {}), link: linkMetadata } } 
          : prev
      );
    }
    
    setShowLinkModal(false);
    setLinkModalInput("");
  }, [linkModalInput, selectedTextElement, updateElement]);

  const beginDrawing = useCallback(
    (pageId: ID, rawX: number, rawY: number) => {
      if (!editable) return;
      const page = pagesById.get(pageId);
      if (!page) return;
      if (drawingRafRef.current != null) {
        cancelAnimationFrame(drawingRafRef.current);
        drawingRafRef.current = null;
      }
      pendingDrawingPointRef.current = null;
      const x = Number.isFinite(rawX) ? rawX : 0;
      const y = Number.isFinite(rawY) ? rawY : 0;
      clearSelection();
      pushUndoSnapshot();
      drawingLastPointRef.current = { x, y };
      setDrawingDraft({ pageId, points: [{ x, y }] });
    },
    [clearSelection, editable, pagesById, pushUndoSnapshot]
  );

  const appendDrawingPoint = useCallback(
    (pageId: ID, rawX: number, rawY: number) => {
      if (!editable) return;
      const page = pagesById.get(pageId);
      if (!page) return;
      const x = Number.isFinite(rawX) ? rawX : 0;
      const y = Number.isFinite(rawY) ? rawY : 0;
      setDrawingDraft((prev) => {
        if (!prev || prev.pageId !== pageId) return prev;
        const last = drawingLastPointRef.current;
        if (!last) {
          drawingLastPointRef.current = { x, y };
          return { ...prev, points: [...prev.points, { x, y }] };
        }
        const jumpDx = x - last.x;
        const jumpDy = y - last.y;
        const jumpDist = Math.sqrt(jumpDx * jumpDx + jumpDy * jumpDy);
        if (jumpDist > MAX_STROKE_CONNECT_DISTANCE) {
          drawingLastPointRef.current = { x, y };
          return { ...prev, points: [...prev.points, null, { x, y }] };
        }
        const effectiveSmoothness = drawingMode === "eraser" ? drawingSmoothness : 0;
        const filteredX = last.x + (x - last.x) * (1 - effectiveSmoothness);
        const filteredY = last.y + (y - last.y) * (1 - effectiveSmoothness);
        const dx = filteredX - last.x;
        const dy = filteredY - last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minPointDistance = drawingMode === "eraser" ? 0.8 : 0.15;
        if (dist < minPointDistance) return prev;

        if (dist > MAX_STROKE_STEP) {
          const steps = Math.min(MAX_INTERPOLATED_POINTS_PER_MOVE, Math.max(2, Math.ceil(dist / (MAX_STROKE_STEP * 0.75))));
          const inserts = Array.from({ length: steps }, (_, i) => {
            const t = (i + 1) / steps;
            return {
              x: last.x + (filteredX - last.x) * t,
              y: last.y + (filteredY - last.y) * t
            };
          });
          drawingLastPointRef.current = inserts[inserts.length - 1] ?? drawingLastPointRef.current;
          return { ...prev, points: [...prev.points, ...inserts] };
        }

        drawingLastPointRef.current = { x: filteredX, y: filteredY };
        return { ...prev, points: [...prev.points, { x: filteredX, y: filteredY }] };
      });
    },
    [drawingMode, drawingSmoothness, editable, pagesById]
  );

  const flushPendingDrawingPoint = useCallback(() => {
    const pending = pendingDrawingPointRef.current;
    if (!pending) return;
    pendingDrawingPointRef.current = null;
    appendDrawingPoint(pending.pageId, pending.x, pending.y);
  }, [appendDrawingPoint]);

  const scheduleDrawingFlush = useCallback(() => {
    if (drawingRafRef.current != null) return;
    drawingRafRef.current = requestAnimationFrame(() => {
      drawingRafRef.current = null;
      flushPendingDrawingPoint();
      if (pendingDrawingPointRef.current) {
        scheduleDrawingFlush();
      }
    });
  }, [flushPendingDrawingPoint]);

  const updateDrawing = useCallback(
    (pageId: ID, rawX: number, rawY: number) => {
      if (!editable) return;
      const page = pagesById.get(pageId);
      if (!page) return;
      const x = Number.isFinite(rawX) ? rawX : 0;
      const y = Number.isFinite(rawY) ? rawY : 0;
      pendingDrawingPointRef.current = { pageId, x, y };
      scheduleDrawingFlush();
    },
    [editable, pagesById, scheduleDrawingFlush]
  );

  const endDrawing = useCallback(() => {
    if (!editable) return;
    if (drawingRafRef.current != null) {
      cancelAnimationFrame(drawingRafRef.current);
      drawingRafRef.current = null;
    }
    flushPendingDrawingPoint();
    setDrawingDraft((draft) => {
      if (!draft || draft.points.length < 1) return null;
      const segments: Array<Array<{ x: number; y: number }>> = [];
      let currentSegment: Array<{ x: number; y: number }> = [];
      for (const point of draft.points) {
        if (!point) {
          if (currentSegment.length) segments.push(currentSegment);
          currentSegment = [];
          continue;
        }
        currentSegment.push(point);
      }
      if (currentSegment.length) segments.push(currentSegment);
      if (!segments.length) return null;

      const normalizedSegments = segments.map((segment) =>
        segment.length === 1 ? [segment[0], { ...segment[0], x: segment[0].x + 0.1 }] : segment
      );

      const strokes = normalizedSegments.map((points, index) => ({
        id: `${Date.now()}-${Math.floor(Math.random() * 100000)}-${index}`,
        color: drawingColor,
        size: drawingSize,
        opacity: drawingMode === "transparentPencil" ? 0 : drawingOpacity,
        points,
        isEraser: false
      }));

      setDoc((prev) => {
        if (drawingMode === "eraser") {
          const eraserPoints = normalizedSegments.flat();
          return {
            ...prev,
            elements: prev.elements.map((el) => {
              if (el.type !== "drawing" || el.pageId !== draft.pageId) return el;
              return {
                ...el,
                strokes: el.strokes.filter((s) => {
                  for (const ePt of eraserPoints) {
                    for (const sPt of s.points) {
                      const dx = ePt.x - sPt.x;
                      const dy = ePt.y - sPt.y;
                      if (Math.sqrt(dx * dx + dy * dy) < Math.max(8, drawingSize * 1.6)) {
                        return false;
                      }
                    }
                  }
                  return true;
                })
              };
            })
          };
        }

        const existing = prev.elements.find((el) => el.type === "drawing" && el.pageId === draft.pageId);
        if (existing && existing.type === "drawing") {
          return {
            ...prev,
            elements: prev.elements.map((el) =>
              el.id === existing.id && el.type === "drawing"
                ? { ...el, strokes: [...el.strokes, ...strokes], color: drawingColor, strokeWidth: drawingSize }
                : el
            )
          };
        }

        const page = prev.pages.find((p) => p.id === draft.pageId);
        const pageW = page?.width ?? prev.pageWidth;
        const pageH = page?.height ?? prev.pageHeight;
        const drawingEl = createCanvasDrawingElement(0, 0, draft.pageId);
        const maxZ = getMaxZ(prev.elements);
        return {
          ...prev,
          elements: [
            ...prev.elements,
            {
              ...drawingEl,
              width: pageW,
              height: pageH,
              zIndex: maxZ + 1,
              color: drawingColor,
              strokeWidth: drawingSize,
              strokes
            }
          ]
        };
      });

      return null;
    });
    pendingDrawingPointRef.current = null;
    drawingLastPointRef.current = null;
  }, [drawingColor, drawingMode, drawingOpacity, drawingSize, editable, flushPendingDrawingPoint]);

  useEffect(() => {
    return () => {
      if (drawingRafRef.current != null) {
        cancelAnimationFrame(drawingRafRef.current);
      }
    };
  }, []);

  const getSnappedMove = useCallback(
    (elementId: ID, rawX: number, rawY: number) => {
      const currentDoc = docRef.current;
      const moving = currentDoc.elements.find((el) => el.id === elementId);
      if (!moving) return { x: rawX, y: rawY, guideX: null as number | null, guideY: null as number | null };

      const page = pagesById.get(moving.pageId);
      const pageW = page?.width ?? currentDoc.pageWidth;
      const pageH = page?.height ?? currentDoc.pageHeight;
      const w = moving.width;
      const h = moving.height;

      const others = currentDoc.elements.filter((el) => el.pageId === moving.pageId && el.id !== moving.id);

      const verticalTargets: number[] = [0, pageW / 2, pageW];
      const horizontalTargets: number[] = [0, pageH / 2, pageH];

      for (const el of others) {
        verticalTargets.push(el.x, el.x + el.width / 2, el.x + el.width);
        horizontalTargets.push(el.y, el.y + el.height / 2, el.y + el.height);
      }

      const movingV = [rawX, rawX + w / 2, rawX + w];
      const movingH = [rawY, rawY + h / 2, rawY + h];

      let bestDx = Number.POSITIVE_INFINITY;
      let bestDy = Number.POSITIVE_INFINITY;
      let snappedX = rawX;
      let snappedY = rawY;
      let guideX: number | null = null;
      let guideY: number | null = null;

      for (const target of verticalTargets) {
        for (let i = 0; i < movingV.length; i += 1) {
          const delta = target - movingV[i];
          const abs = Math.abs(delta);
          if (abs <= SNAP_THRESHOLD && abs < bestDx) {
            bestDx = abs;
            snappedX = rawX + delta;
            guideX = target;
          }
        }
      }

      for (const target of horizontalTargets) {
        for (let i = 0; i < movingH.length; i += 1) {
          const delta = target - movingH[i];
          const abs = Math.abs(delta);
          if (abs <= SNAP_THRESHOLD && abs < bestDy) {
            bestDy = abs;
            snappedY = rawY + delta;
            guideY = target;
          }
        }
      }

      const clampedX = clamp(snappedX, 0, Math.max(0, pageW - w));
      const clampedY = clamp(snappedY, 0, Math.max(0, pageH - h));

      return {
        x: clampedX,
        y: clampedY,
        guideX,
        guideY
      };
    },
    [pagesById]
  );

  // ── PanResponder ───────────────────────────────────────────────────────────
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: (evt) => {
          if (isDraggingPageRef.current || overviewMode) return false;
          if (textInteractionMode === "editing") return false;
          return (evt.nativeEvent.touches?.length ?? 0) >= 2;
        },
        onMoveShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (evt, gs) => {
          if (isDraggingPageRef.current || overviewMode) return false;
          if (textInteractionMode === "editing") return false;
          const touches = evt.nativeEvent.touches?.length ?? 0;
          if (touches >= 2) return true;
          if (drawingMode) return false;
          if (touches === 1 && (Math.abs(gs.dx) > 1 || Math.abs(gs.dy) > 1)) {
            return true;
          }
          return !!elementInteractionRef.current;
        },

        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches ?? [];
          if (isDraggingPageRef.current || overviewMode || textInteractionMode === "editing") return;
          if (drawingMode && touches.length < 2) return;
          pageSwipeActiveRef.current = false;
          if (touches.length >= 2) {
            if (drawingSessionRef.current.active) {
              drawingTouchModeRef.current = "gesture";
              drawingSessionRef.current = { active: false, pageId: null };
              drawingLastPointRef.current = null;
              setDrawingDraft(null);
            }
            const scale = displayScaleRef.current || 1;
            const offsetX = canvasPositionRef.current.x;
            const offsetY = canvasPositionRef.current.y;
            // 🔒 VALIDAÇÃO SEGURA DE COORDENADAS
            if (!touches[0]?.pageX || !touches[1]?.pageX || !touches[0]?.pageY || !touches[1]?.pageY) {
              return;
            }
            const midX = (touches[0].pageX + touches[1].pageX) / 2;
            const midY = (touches[0].pageY + touches[1].pageY) / 2;
            pinchStateRef.current = {
              startDist: touchDist(touches[0], touches[1]),
              startZoom: zoomRef.current,
              anchorX: (midX - offsetX) / scale,
              anchorY: (midY - offsetY) / scale
            };
            canvasPanStateRef.current = null;
            elementInteractionRef.current = null;
          } else if (touches.length === 1 && !elementInteractionRef.current) {
            canvasPanStateRef.current = {
              startOffsetX: canvasPositionRef.current.x,
              startOffsetY: canvasPositionRef.current.y
            };
          }
        },

        onPanResponderMove: (evt, gs: PanResponderGestureState) => {
          const touches = evt.nativeEvent.touches ?? [];
          if (isDraggingPageRef.current || overviewMode || textInteractionMode === "editing") return;
          if (drawingMode && touches.length < 2) return;
          if (touches.length >= 2 && pinchStateRef.current) {
            // 🔒 VALIDAÇÃO SEGURA DE COORDENADAS
            if (!touches[0]?.pageX || !touches[1]?.pageX || !touches[0]?.pageY || !touches[1]?.pageY) {
              return;
            }
            const dist = touchDist(touches[0], touches[1]);
            const ratio = dist / Math.max(1, pinchStateRef.current.startDist);
            const nextZoom = clamp(pinchStateRef.current.startZoom * ratio, ZOOM_MIN, ZOOM_MAX);
            const midX = (touches[0].pageX + touches[1].pageX) / 2;
            const midY = (touches[0].pageY + touches[1].pageY) / 2;
            const nextScale = clamp(baseFitScale * nextZoom, 0.2, 4);
            const nextX = midX - pinchStateRef.current.anchorX * nextScale;
            const nextY = midY - pinchStateRef.current.anchorY * nextScale;
            const clampedOffset = clampCanvasOffset(nextX, nextY, nextScale);
            setCanvasPosition({ x: clampedOffset.x, y: clampedOffset.y });
            setZoom(nextZoom);
            return;
          }

          const interaction = elementInteractionRef.current;
          if (!interaction && touches.length === 1 && canvasPanStateRef.current) {
            const swipeAllowed = !overviewMode && pageCount > 1 && zoomRef.current <= 1.02 && !selectedTextElement && nextPageIndex === null;
            const horizontalDominant = Math.abs(gs.dx) > Math.abs(gs.dy) * 1.15;

            if (swipeAllowed && horizontalDominant) {
              const direction: 1 | -1 = gs.dx < 0 ? 1 : -1;
              const targetIndex = clamp(currentPageIndex + direction, 0, pageCount - 1);
              if (targetIndex !== currentPageIndex) {
                if (!pageSwipeActiveRef.current || nextPageIndex !== targetIndex) {
                  pageSwipeActiveRef.current = true;
                  setPageTransitionDirection(direction);
                  setNextPageIndex(targetIndex);
                  pageSwipeX.setValue(direction === 1 ? 0 : -slideWidth);
                }
                const drag = clamp(Math.abs(gs.dx), 0, slideWidth);
                pageSwipeX.setValue(direction === 1 ? -drag : -slideWidth + drag);
              } else {
                // Edge resistance at first/last page.
                const resisted = gs.dx * 0.2;
                pageSwipeX.setValue(resisted);
              }
              return;
            }

            if (pageSwipeActiveRef.current) return;
            const scale = displayScaleRef.current || 1;
            const nextOffsetX = canvasPanStateRef.current.startOffsetX + gs.dx;
            const nextOffsetY = canvasPanStateRef.current.startOffsetY + gs.dy;
            const clampedOffset = clampCanvasOffset(nextOffsetX, nextOffsetY, scale);
            setCanvasPosition({ x: clampedOffset.x, y: clampedOffset.y });
            return;
          }

          if (!interaction) return;
          
          // 🔒 VALIDAÇÃO SEGURA DE COORDENADAS
          const coords = getSafePageCoords(evt);
          if (!coords) return;
          
          const scale = displayScaleRef.current || 1;
          const offsetX = canvasPositionRef.current.x || 0;
          const offsetY = canvasPositionRef.current.y || 0;
          const dxEl = ((coords.pageX - offsetX) - (interaction.startPageX - offsetX)) / scale;
          const dyEl = ((coords.pageY - offsetY) - (interaction.startPageY - offsetY)) / scale;

          setDoc((prev) => {
            const prevEl = prev.elements.find((x) => x.id === interaction.elementId) ?? null;
            if (!prevEl) return prev;
            const clampSize = (size: number) => Math.max(MIN_EL, size);

            const snapped =
              interaction.mode === "move"
                ? getSnappedMove(interaction.elementId, interaction.startElX + dxEl, interaction.startElY + dyEl)
                : null;
            if (interaction.mode === "move") {
              setIsElementDragging(true);
              setAlignmentGuides((prevGuides) => {
                const nextGuides = { x: snapped?.guideX ?? null, y: snapped?.guideY ?? null };
                if (prevGuides.x === nextGuides.x && prevGuides.y === nextGuides.y) return prevGuides;
                return nextGuides;
              });
            } else {
              clearAlignmentGuides();
            }

            const nextEls = prev.elements.map((cur) => {
              if (cur.id !== interaction.elementId) return cur;

              if (interaction.mode === "move") {
                return { ...cur, x: snapped?.x ?? interaction.startElX + dxEl, y: snapped?.y ?? interaction.startElY + dyEl };
              }

              if (interaction.mode === "rotate") {
                // 📐 ROTAÇÃO MELHORADA COM SNAP E FEEDBACK
                const centerX = interaction.startElX + interaction.startElW / 2;
                const centerY = interaction.startElY + interaction.startElH / 2;
                
                // Usar coordenadas validadas
                const touchX = coords.pageX;
                const touchY = coords.pageY;
                const offsetX = canvasPositionRef.current.x || 0;
                const offsetY = canvasPositionRef.current.y || 0;
                const scale = displayScaleRef.current || 1;
                
                // Converter para espaço do canvas
                const canvasX = (touchX - offsetX) / scale;
                const canvasY = (touchY - offsetY) / scale;
                
                // Ângulo atual
                const dx = canvasX - centerX;
                const dy = canvasY - centerY;
                const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
                
                // Ângulo inicial (do toque inicial)
                const startOffsetX = canvasPositionRef.current.x || 0;
                const startOffsetY = canvasPositionRef.current.y || 0;
                const startCanvasX = (interaction.startPageX - startOffsetX) / scale;
                const startCanvasY = (interaction.startPageY - startOffsetY) / scale;
                const startDx = startCanvasX - centerX;
                const startDy = startCanvasY - centerY;
                const startAngle = Math.atan2(startDy, startDx) * (180 / Math.PI);
                
                // Delta de rotação
                const rotationDelta = currentAngle - startAngle;
                const rawRotation = interaction.startElRotation + rotationDelta;
                const normalizedRotation = normalizeAngle(rawRotation);
                
                // 📐 ATUALIZAR ÂNGULO EM TEMPO REAL PARA EXIBIÇÃO
                setRotationAngle(normalizedRotation);
                
                // 🧭 APLICAR SNAP INTELIGENTE
                const snappedRotation = snapRotation(normalizedRotation);
                return { ...cur, rotation: snappedRotation };
              }

              const handle = interaction.handle ?? "se";
              let x = interaction.startElX;
              let y = interaction.startElY;
              let w = interaction.startElW;
              let h = interaction.startElH;

              const isCornerHandle = handle.length === 2;
              if (isCornerHandle) {
                const ratio = Math.max(0.1, interaction.startElW / Math.max(1, interaction.startElH));
                const widthDeltaFromX = handle.includes("w") ? -dxEl : dxEl;
                const widthDeltaFromY = (handle.includes("n") ? -dyEl : dyEl) * ratio;
                const nextWidth = clampSize(
                  interaction.startElW +
                    (Math.abs(widthDeltaFromX) >= Math.abs(widthDeltaFromY) ? widthDeltaFromX : widthDeltaFromY)
                );
                const nextHeight = clampSize(nextWidth / ratio);

                if (handle.includes("w")) {
                  x = interaction.startElX + (interaction.startElW - nextWidth);
                }
                if (handle.includes("n")) {
                  y = interaction.startElY + (interaction.startElH - nextHeight);
                }

                return { ...cur, x, y, width: nextWidth, height: nextHeight };
              }

              if (handle.includes("e")) w = clampSize(interaction.startElW + dxEl);
              if (handle.includes("s")) h = clampSize(interaction.startElH + dyEl);
              if (handle.includes("w")) {
                const nextWidth = clampSize(interaction.startElW - dxEl);
                x = interaction.startElX + (interaction.startElW - nextWidth);
                w = nextWidth;
              }
              if (handle.includes("n")) {
                const nextHeight = clampSize(interaction.startElH - dyEl);
                y = interaction.startElY + (interaction.startElH - nextHeight);
                h = nextHeight;
              }

              return { ...cur, x, y, width: clampSize(w), height: clampSize(h) };
            });

            return { ...prev, elements: nextEls };
          });
        },

        onPanResponderRelease: (_evt, gs) => {
          if (pageSwipeActiveRef.current && nextPageIndex !== null) {
            const horizontalDominant = Math.abs(gs.dx) > Math.abs(gs.dy);
            const validSwipe = horizontalDominant && (Math.abs(gs.dx) > PAGE_SWIPE_DIST || Math.abs(gs.vx) > PAGE_SWIPE_VELOCITY);

            if (validSwipe) {
              const toValue = pageTransitionDirection === 1 ? -slideWidth : 0;
              Animated.timing(pageSwipeX, {
                toValue,
                duration: 170,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true
              }).start(({ finished }) => {
                if (!finished) return;
                finalizePageTransition(nextPageIndex);
              });
            } else {
              const backTo = pageTransitionDirection === 1 ? 0 : -slideWidth;
              Animated.timing(pageSwipeX, {
                toValue: backTo,
                duration: 170,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true
              }).start(() => {
                setNextPageIndex(null);
                setPageTransitionDirection(1);
                pageSwipeX.setValue(0);
              });
            }
          } else {
            Animated.timing(pageSwipeX, {
              toValue: 0,
              duration: 120,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true
            }).start();
          }
          pageSwipeActiveRef.current = false;
          elementInteractionRef.current = null;
          pinchStateRef.current = null;
          canvasPanStateRef.current = null;
          setIsElementDragging(false);
          setIsRotating(false);  // 📐 FINALIZAR MODO ROTAÇÃO
          setRotationAngle(0);  // 📐 RESETAR ÂNGULO
          clearAlignmentGuides();
          
          // 📐 RECALCULAR POSIÇÃO DA TOOLBAR APÓS MOVIMENTO/RESIZE
          if (selectedId) {
            requestAnimationFrame(() => {
              measureToolbarPosition(selectedId);
            });
          }
        },

        onPanResponderTerminate: () => {
          if (pageSwipeActiveRef.current || nextPageIndex !== null) {
            Animated.timing(pageSwipeX, {
              toValue: 0,
              duration: 150,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true
            }).start(() => {
              setNextPageIndex(null);
              setPageTransitionDirection(1);
            });
          }
          pageSwipeActiveRef.current = false;
          elementInteractionRef.current = null;
          pinchStateRef.current = null;
          canvasPanStateRef.current = null;
          setIsElementDragging(false);
          setIsRotating(false);  // 📐 FINALIZAR MODO ROTAÇÃO
          setRotationAngle(0);  // 📐 RESETAR ÂNGULO
          clearAlignmentGuides();
        }
      }),
    [
      baseFitScale,
      clampCanvasOffset,
      currentPageIndex,
      drawingMode,
      nextPageIndex,
      overviewMode,
      pageTransitionDirection,
      pageSwipeX,
      pagesById,
      drawingSmoothness,
      clearAlignmentGuides,
      getSnappedMove,
      selectedTextElement,
      textInteractionMode,
      viewportH,
      viewportW
    ]
  );

  // ── Toolbar add helpers ────────────────────────────────────────────────────
  const addText = useCallback(() => {
    const pageId = getDefaultTargetPageId();
    if (!pageId) return;
    const page = pagesById.get(pageId);
    const baseWidth = 220;
    const baseHeight = 56;
    const pageW = page?.width ?? doc.pageWidth;
    const pageH = page?.height ?? doc.pageHeight;
    const x = Math.max(16, (pageW - baseWidth) / 2);
    const y = Math.max(24, pageH * 0.18);
    const el = createCanvasTextElement("", x, y, pageId);
    addElement({ ...el, style: { ...el.style, textColor: defaultTextColor } });
    setTextInteractionMode("editing");
    setMode("text");
    setPendingFocusTextId(el.id);
  }, [addElement, defaultTextColor, doc.pageHeight, doc.pageWidth, getDefaultTargetPageId, pagesById]);

  const addImage = useCallback(async () => {
    const uri = await pickAndSaveImage("canvas-note");
    if (!uri) return;
    const pageId = getDefaultTargetPageId();
    if (!pageId) return;
    const page = pagesById.get(pageId);
    const baseWidth = 260;
    const baseHeight = 180;
    const pageW = page?.width ?? doc.pageWidth;
    const pageH = page?.height ?? doc.pageHeight;
    const x = Math.max(16, (pageW - baseWidth) / 2);
    const y = Math.max(32, pageH * 0.35);
    addElement(createCanvasImageElement(uri, x, y, pageId));
  }, [addElement, doc.pageHeight, doc.pageWidth, getDefaultTargetPageId, pagesById]);

  const addShape = useCallback(
    (shape: "arrow" | "rectangle" | "circle") => {
      const pageId = getDefaultTargetPageId();
      if (!pageId) return;
      const page = pagesById.get(pageId);
      const baseWidth = shape === "arrow" ? 220 : 160;
      const baseHeight = shape === "arrow" ? 36 : 120;
      const pageW = page?.width ?? doc.pageWidth;
      const pageH = page?.height ?? doc.pageHeight;
      const x = Math.max(16, (pageW - baseWidth) / 2);
      const y = Math.max(24, pageH * 0.22);
      addElement(createCanvasShapeElement(shape, x, y, pageId));
      setShowShapeMenu(false);
    },
    [addElement, doc.pageHeight, doc.pageWidth, getDefaultTargetPageId, pagesById]
  );

  const addPage = useCallback(() => {
    pushUndoSnapshot();
    setDoc((prev) => {
      const w = prev.pageWidth;
      const h = prev.pageHeight;
      const page: CanvasPage = { id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`, width: w, height: h };
      return { ...prev, pages: [...(prev.pages ?? []), page] };
    });
  }, [pushUndoSnapshot]);

  const movePage = useCallback(
    (pageId: ID, direction: -1 | 1) => {
      pushUndoSnapshot();
      setDoc((prev) => {
        const pages = [...(prev.pages ?? [])];
        const idx = pages.findIndex((p) => p.id === pageId);
        if (idx < 0) return prev;
        const nextIdx = idx + direction;
        if (nextIdx < 0 || nextIdx >= pages.length) return prev;
        const temp = pages[idx];
        pages[idx] = pages[nextIdx];
        pages[nextIdx] = temp;
        return { ...prev, pages };
      });
    },
    [pushUndoSnapshot]
  );

  const deletePage = useCallback(
    (pageId: ID) => {
      Alert.alert("Apagar página", "Tem certeza que deseja apagar esta página? Os elementos dela serão removidos.", [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: () => {
            pushUndoSnapshot();
            setDoc((prev) => {
              const pages = [...(prev.pages ?? [])];
              if (pages.length <= 1) return prev;
              const nextPages = pages.filter((p) => p.id !== pageId);
              const nextElements = prev.elements.filter((el) => el.pageId !== pageId);
              const selectedStillExists = nextElements.some((el) => el.id === selectedId);
              if (!selectedStillExists) setSelectedId(null);
              return { ...prev, pages: nextPages, elements: nextElements };
            });
          }
        }
      ]);
    },
    [pushUndoSnapshot, selectedId]
  );

  const duplicatePage = useCallback(
    (pageId: ID) => {
      pushUndoSnapshot();
      let nextSelected: ID | null = null;
      let nextIndex = 0;
      setDoc((prev) => {
        const pages = [...(prev.pages ?? [])];
        const idx = pages.findIndex((p) => p.id === pageId);
        if (idx < 0) return prev;
        const base = pages[idx];
        const newPageId = makeLocalId();
        const duplicatedPage: CanvasPage = {
          ...base,
          id: newPageId
        };
        pages.splice(idx + 1, 0, duplicatedPage);

        const duplicatedElements = prev.elements
          .filter((el) => el.pageId === pageId)
          .map((el) => ({
            ...JSON.parse(JSON.stringify(el)),
            id: makeLocalId(),
            pageId: newPageId
          })) as CanvasElement[];

        nextSelected = newPageId;
        nextIndex = idx + 1;
        return {
          ...prev,
          pages,
          elements: [...prev.elements, ...duplicatedElements]
        };
      });
      if (nextSelected) {
        setSelectedPageId(nextSelected);
        setCurrentPageIndex(nextIndex);
      }
    },
    [pushUndoSnapshot]
  );

  const renameSelectedPage = useCallback(() => {
    if (!selectedPageId) return;
    const idx = (doc.pages ?? []).findIndex((p) => p.id === selectedPageId);
    const currentLabel = idx >= 0 ? (doc.pages?.[idx]?.title ?? `Page ${idx + 1}`) : "";
    setRenamePageDraft(currentLabel);
    setShowRenamePageModal(true);
  }, [doc.pages, selectedPageId]);

  const applyRenamePage = useCallback(() => {
    if (!selectedPageId) {
      setShowRenamePageModal(false);
      return;
    }
    const title = renamePageDraft.trim();
    setDoc((prev) => ({
      ...prev,
      pages: (prev.pages ?? []).map((p) =>
        p.id === selectedPageId
          ? { ...p, title: title.length ? title : undefined }
          : p
      )
    }));
    setShowRenamePageModal(false);
  }, [renamePageDraft, selectedPageId]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const colors = useMemo(
    () => ({
      ...theme.colors,
      primary: "#A78BFA",
      textPrimary: "#E5E7EB",
      textSecondary: "#9BA3B3",
      border: "#2A3244",
      surface: "#111622",
      surfaceElevated: "#1A2233"
    }),
    [theme.colors]
  );
  const sortedElements = useMemo(
    () => [...doc.elements].filter((el) => el.type !== "drawing").sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [doc.elements]
  );
  const drawingsByPage = useMemo(() => {
    const map = new Map<ID, CanvasElement[]>();
    doc.elements
      .filter((el) => el.type === "drawing")
      .forEach((el) => {
        const list = map.get(el.pageId) ?? [];
        list.push(el);
        map.set(el.pageId, list);
      });
    return map;
  }, [doc.elements]);

  const tb = () => styles.toolBtn;
  const canUndo = useMemo(() => undoStackRef.current.length > 0, [historyTick]);
  const canRedo = useMemo(() => redoStackRef.current.length > 0, [historyTick]);
  const isTextMode = !!selectedTextElement;
  useEffect(() => {
    if (drawingMode) {
      setMode("draw");
      return;
    }
    if (selectedTextElement && textInteractionMode === "editing") {
      setMode("text");
      return;
    }
    setMode("select");
  }, [drawingMode, selectedTextElement, textInteractionMode]);
  const showTextToolbar = textToolbarMode !== "hidden";
  const selectedTextStyle = selectedTextElement?.style ?? {};
  const selectedTextColor = selectedTextStyle.textColor ?? defaultTextColor;
  const selectedFontFamily = selectedTextStyle.fontFamily ?? "System";
  const selectedFontSize = selectedTextStyle.fontSize ?? 18;
  const showSelectionDelete = !!selectedId;
  const pageCount = doc.pages?.length ?? 0;
  const currentPage =
    pageCount > 0
      ? doc.pages[currentPageIndex] ?? doc.pages[0]
      : { id: "fallback-page", width: toPositiveNumber(doc.pageWidth, 900), height: toPositiveNumber(doc.pageHeight, 1200) };
  const stagedNextPage =
    nextPageIndex !== null && pageCount > 0
      ? doc.pages[nextPageIndex] ?? null
      : null;
  const currentPageWidth = Math.max(240, toPositiveNumber(currentPage.width, toPositiveNumber(doc.pageWidth, 900)));
  const stagedNextPageWidth = stagedNextPage
    ? Math.max(240, toPositiveNumber(stagedNextPage.width, toPositiveNumber(doc.pageWidth, 900)))
    : currentPageWidth;
  const slideWidth = Math.max(currentPageWidth, stagedNextPageWidth);
  const currentPageHeight = Math.max(320, toPositiveNumber(currentPage.height, toPositiveNumber(doc.pageHeight, 1200)));
  const stagedNextPageHeight = stagedNextPage
    ? Math.max(320, toPositiveNumber(stagedNextPage.height, toPositiveNumber(doc.pageHeight, 1200)))
    : currentPageHeight;
  const pageTrackHeight = Math.max(currentPageHeight, stagedNextPageHeight);
  const overlayWidth = rootLayout.width || rootWindowFrame.width;
  const overlayHeight = rootLayout.height || rootWindowFrame.height;
  const toolbarWidth = Math.min(textToolbarLayout.width || 320, Math.max(220, overlayWidth - 16));
  const toolbarHeight = textToolbarLayout.height || FLOATING_TOOLBAR_H;
  
  // 🔥 GUARD: Se não temos posição válida, não renderizar toolbar
  const hasValidToolbarPosition = textToolbarMode === "floating" && toolbarPosition && typeof toolbarPosition.x === "number" && typeof toolbarPosition.y === "number";
  
  // Calcular posição da toolbar baseado em modo
  let toolbarLeft = overlayWidth / 2 - toolbarWidth / 2;
  let dynamicToolbarWidth = toolbarWidth;
  let textToolbarTop = 62;
  
  if (hasValidToolbarPosition && textToolbarMode === "floating") {
    // Modo floating: aparecer acima do elemento
    toolbarLeft = clamp(toolbarPosition.x + toolbarPosition.width / 2 - toolbarWidth / 2, 8, Math.max(8, overlayWidth - toolbarWidth - 8));
    textToolbarTop = Math.max(62, toolbarPosition.y - toolbarHeight - 12);
    dynamicToolbarWidth = toolbarWidth;
  } else if (textToolbarMode === "keyboard") {
    // Modo keyboard: aparecer acima do teclado, ocupar largura inteira
    toolbarLeft = 0;
    dynamicToolbarWidth = overlayWidth;
    textToolbarTop = overlayHeight - keyboardHeight - toolbarHeight - 8;
  }
  
  const popupTop = clamp(textToolbarTop + toolbarHeight + 8, 62, Math.max(62, overlayHeight - keyboardHeight - 120));
  const renderCanvasPosition = useMemo(() => {
    const x = Number.isFinite(canvasPosition.x) ? canvasPosition.x : 0;
    const y = Number.isFinite(canvasPosition.y) ? canvasPosition.y : 0;
    const clamped = clampCanvasOffset(x, y, displayScale);
    return { x: clamped.x, y: clamped.y };
  }, [canvasPosition.x, canvasPosition.y, clampCanvasOffset, displayScale]);

  const getLiveRenderCanvasPosition = useCallback(() => {
    const x = Number.isFinite(canvasPositionRef.current.x) ? canvasPositionRef.current.x : 0;
    const y = Number.isFinite(canvasPositionRef.current.y) ? canvasPositionRef.current.y : 0;
    const clamped = clampCanvasOffset(x, y, displayScaleRef.current);
    return { x: clamped.x, y: clamped.y };
  }, [clampCanvasOffset]);

  const getPagePointFromScreen = useCallback(
    (page: CanvasPage, pageX: number, pageY: number) => {
      const scale = Math.max(0.0001, displayScaleRef.current || 1);
      const liveCanvasPos = getLiveRenderCanvasPosition();
      const frame = rootWindowFrameRef.current;
      const localX = (pageX - frame.x - liveCanvasPos.x) / scale;
      const localY = (pageY - frame.y - liveCanvasPos.y) / scale;
      return {
        x: Number.isFinite(localX) ? localX : 0,
        y: Number.isFinite(localY) ? localY : 0
      };
    },
    [getLiveRenderCanvasPosition]
  );

  const getPagePointFromEvent = useCallback(
    (_page: CanvasPage, evt: GestureResponderEvent) => {
      const locationX = Number.isFinite(evt.nativeEvent.locationX) ? evt.nativeEvent.locationX : 0;
      const locationY = Number.isFinite(evt.nativeEvent.locationY) ? evt.nativeEvent.locationY : 0;
      return {
        x: locationX - DRAW_TOUCH_PAD,
        y: locationY - DRAW_TOUCH_PAD
      };
    },
    []
  );

  const handleDrawingRelease = useCallback(() => {
    if (!drawingSessionRef.current.active) return;
    drawingSessionRef.current = { active: false, pageId: null };
    endDrawing();
  }, [endDrawing]);

  const handleDrawingCancel = useCallback(() => {
    drawingSessionRef.current = { active: false, pageId: null };
    drawingLastPointRef.current = null;
    setDrawingDraft(null);
  }, []);

  const resetZoom = useCallback(() => {
    const pageW = toPositiveNumber(currentPage.width, toPositiveNumber(doc.pageWidth, 900));
    const pageH = toPositiveNumber(currentPage.height, toPositiveNumber(doc.pageHeight, 1200));
    const center = getCenteredCanvasPosition(viewportW, viewportH, pageW, pageH, baseFitScale);
    const centered = clampCanvasOffset(center.x, center.y + PAGE_CENTER_Y_BIAS, baseFitScale);
    setZoom(1);
    setCanvasPosition({ x: centered.x, y: centered.y });
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [baseFitScale, clampCanvasOffset, currentPage.height, currentPage.width, doc.pageHeight, doc.pageWidth, viewportH, viewportW]);

  useEffect(() => {
    if (!centerSignal) return;
    resetZoom();
  }, [centerSignal, resetZoom]);

  const finalizePageTransition = useCallback((targetIndex: number) => {
    setCurrentPageIndex(targetIndex);
    setNextPageIndex(null);
    setPageTransitionDirection(1);
    requestAnimationFrame(() => {
      pageSwipeX.setValue(0);
    });
  }, [pageSwipeX]);

  const goToPage = useCallback(
    (requestedIndex: number, animated = true) => {
      const targetIndex = clamp(requestedIndex, 0, Math.max(0, pageCount - 1));
      if (targetIndex === currentPageIndex) return;
      if (nextPageIndex !== null) return;

      const direction: 1 | -1 = targetIndex > currentPageIndex ? 1 : -1;
      setPageTransitionDirection(direction);
      setNextPageIndex(targetIndex);

      if (!animated) {
        finalizePageTransition(targetIndex);
        return;
      }

      if (direction === 1) {
        pageSwipeX.setValue(0);
      } else {
        pageSwipeX.setValue(-slideWidth);
      }

      Animated.timing(pageSwipeX, {
        toValue: direction === 1 ? -slideWidth : 0,
        duration: 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start(({ finished }) => {
        if (!finished) return;
        finalizePageTransition(targetIndex);
      });
    },
    [currentPageIndex, finalizePageTransition, nextPageIndex, pageCount, pageSwipeX, slideWidth]
  );

  const toggleDrawingMode = useCallback(() => {
    if (!editable) return;

    if (drawingMode === "pencil" || drawingMode === "transparentPencil") {
      // Se o lápis já está ativo, desativa tudo
      setDrawingMode(null);
      setMode("select");
      setShowPencilModal(false);
    } else if (showPencilModal) {
      // Se o modal já está aberto, fecha
      setDrawingMode(null);
      setMode("select");
      setShowPencilModal(false);
    } else {
      // Caso contrário, ativa o lápis e abre o modal
      setDrawingMode("pencil");
      setMode("draw");
      setShowPencilModal(true);
    }

    setSelectedId(null);
    setTextInteractionMode("idle");
    setPendingFocusTextId(null);
    setShowShapeMenu(false);
    setShowStylePanel(false);
    setShowAlignMenu(false);
    Keyboard.dismiss();
  }, [editable, drawingMode, showPencilModal]);

  const toggleEraserMode = useCallback(() => {
    if (!editable) return;

    if (showPencilModal && drawingMode === "eraser") {
      setDrawingMode(null);
      setMode("select");
      setShowPencilModal(false);
    } else {
      setDrawingMode("eraser");
      setMode("draw");
      setShowPencilModal(true);
    }

    setSelectedId(null);
    setTextInteractionMode("idle");
    setPendingFocusTextId(null);
    setShowShapeMenu(false);
    setShowStylePanel(false);
    setShowAlignMenu(false);
    Keyboard.dismiss();
  }, [drawingMode, editable, showPencilModal]);

  const renderPage = useCallback(
    (page: CanvasPage) => {
      const pageW = Math.max(240, toPositiveNumber(page.width, toPositiveNumber(doc.pageWidth, 900)));
      const pageH = Math.max(320, toPositiveNumber(page.height, toPositiveNumber(doc.pageHeight, 1200)));
      const pageEls = sortedElements.filter((el) => el.pageId === page.id);
      const pageDrawingEls = drawingsByPage.get(page.id) ?? [];
      return (
        <View
          key={page.id}
          style={[
            styles.canvas,
            {
              width: pageW,
              height: pageH,
              borderColor: drawingMode ? "#6D5BD0" : "#2B3340"
            }
          ]}
        >
          <View style={styles.pageClipSurface}>
            <View pointerEvents={mode === "draw" ? "none" : "auto"} style={[StyleSheet.absoluteFillObject, styles.elementsLayer]}>
              <Pressable style={StyleSheet.absoluteFillObject} onPress={clearSelection} />

              {pageEls.map((element) => (
                <CanvasElementView
                  key={element.id}
                  element={element}
                  selected={editable && element.id === selectedId}
                  editable={editable}
                  isTextEditing={textInteractionMode === "editing" && element.id === selectedId}
                  isDragging={isElementDragging && element.id === selectedId}
                  isRotating={isRotating && element.id === selectedId}  // 📐 PASSAR isRotating
                  rotationAngle={rotationAngle}  // 📐 PASSAR rotationAngle
                  primaryColor={colors.primary}
                  surfaceElevated={colors.surfaceElevated}
                  defaultTextColor={defaultTextColor}
                  isOpeningLinkRef={isOpeningLinkRef}
                  isViewMode={isViewMode}
                  onSetRef={setElementRef}
                  onSetInputRef={setInputRef}
                  onTextFocused={handleTextFocused}
                  onSelect={handleSelect}
                  onEnterTextEdit={enterTextEdit}
                  onSetTextMoveMode={setTextMoveMode}
                  onSetTextToolbarMode={setTextToolbarMode}
                  onMeasureToolbarPosition={measureToolbarPosition}
                  onMovePressIn={handleElementMovePressIn}
                  onRotatePressIn={handleElementRotatePressIn}
                  onResizePressIn={handleElementResizePressIn}
                  onChangeText={handleTextChange}
                  onSelectionChange={handleSelectionChange}
                  textInteractionMode={element.id === selectedId ? textInteractionMode : "idle"}
                />
              ))}
            </View>

            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.drawingVisualLayer]}>
              <Svg width={pageW} height={pageH}>
                {pageDrawingEls.map((drawingEl) =>
                  drawingEl.type === "drawing"
                    ? drawingEl.strokes.map((stroke) => (
                          <Path
                            key={stroke.id}
                            d={buildSmoothPath(stroke.points)}
                            stroke={stroke.color}
                            strokeWidth={stroke.size}
                            strokeOpacity={stroke.opacity ?? 1}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                          />
                      ))
                    : null
                )}

                {drawingDraft?.pageId === page.id && drawingDraft.points.some((pt) => !!pt) && (
                  <Path
                    d={buildSmoothPath(drawingDraft.points)}
                    stroke={drawingMode === "eraser" ? "#EF4444" : drawingColor}
                    strokeWidth={drawingSize}
                    strokeOpacity={drawingMode === "eraser" ? 0.6 : drawingMode === "transparentPencil" ? 0 : drawingOpacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}
              </Svg>
            </View>
          </View>

          <View
            pointerEvents={mode === "draw" && editable ? "auto" : "none"}
            style={[
              styles.drawingTouchLayer,
              {
                top: -DRAW_TOUCH_PAD,
                left: -DRAW_TOUCH_PAD,
                right: -DRAW_TOUCH_PAD,
                bottom: -DRAW_TOUCH_PAD
              }
            ]}
            onStartShouldSetResponder={() => false}
            onMoveShouldSetResponder={(evt) => mode === "draw" && editable && (evt.nativeEvent.touches?.length ?? 0) === 1}
            onStartShouldSetResponderCapture={(evt) => {
              const touches = evt.nativeEvent.touches?.length ?? 0;
              if (touches >= 2) {
                drawingTouchModeRef.current = "gesture";
                handleDrawingCancel();
                return false;
              }
              return false;
            }}
            onMoveShouldSetResponderCapture={(evt) => {
              const touches = evt.nativeEvent.touches?.length ?? 0;
              if (touches >= 2) {
                drawingTouchModeRef.current = "gesture";
                handleDrawingCancel();
                return false;
              }
              return !!drawingMode && editable && touches === 1;
            }}
            onResponderTerminationRequest={() => drawingTouchModeRef.current === "gesture" || !drawingSessionRef.current.active}
            onResponderGrant={(evt) => {
              if ((evt.nativeEvent.touches?.length ?? 0) !== 1) return;
              drawingTouchModeRef.current = "draw";
              const point = getPagePointFromEvent(page, evt);
              drawingSessionRef.current = { active: true, pageId: page.id };
              beginDrawing(page.id, point.x, point.y);
            }}
            onResponderMove={(evt) => {
              const touches = evt.nativeEvent.touches?.length ?? 0;
              if (touches >= 2) {
                drawingTouchModeRef.current = "gesture";
                handleDrawingCancel();
                return;
              }
              if (touches !== 1) {
                handleDrawingRelease();
                return;
              }
              if (!drawingSessionRef.current.active || drawingSessionRef.current.pageId !== page.id) return;
              const point = getPagePointFromEvent(page, evt);
              updateDrawing(page.id, point.x, point.y);
            }}
            onResponderRelease={() => {
              drawingTouchModeRef.current = null;
              handleDrawingRelease();
            }}
            onResponderTerminate={() => {
              drawingTouchModeRef.current = null;
              handleDrawingRelease();
            }}
          />
        </View>
      );
    },
    [
      colors.border,
      colors.primary,
      colors.surfaceElevated,
      defaultTextColor,
      drawingColor,
      drawingDraft,
      drawingMode,
      mode,
      drawingSize,
      doc.pages,
      doc.pageHeight,
      doc.pageWidth,
      drawingsByPage,
      beginDrawing,
      handleDrawingRelease,
      clearSelection,
      getPagePointFromEvent,
      handleElementMovePressIn,
      handleElementResizePressIn,
      handleSelect,
      enterTextEdit,
      handleTextChange,
      handleTextFocused,
      setElementRef,
      setInputRef,
      setTextMoveMode,
      handleElementRotatePressIn,
      selectedId,
      isElementDragging,
      textInteractionMode,
      sortedElements,
      updateDrawing
    ]
  );

  const renderPagePreview = useCallback(
    (page: CanvasPage) => {
      const thumbW = 72;
      const thumbH = 96;
      const pageW = Math.max(240, toPositiveNumber(page.width, toPositiveNumber(doc.pageWidth, 900)));
      const pageH = Math.max(320, toPositiveNumber(page.height, toPositiveNumber(doc.pageHeight, 1200)));
      const pageEls = sortedElements.filter((el) => el.pageId === page.id);
      const pageDrawingEls = drawingsByPage.get(page.id) ?? [];

      const scale = Math.min((thumbW - 8) / pageW, (thumbH - 8) / pageH);
      const scaledW = pageW * scale;
      const scaledH = pageH * scale;
      const offsetX = (thumbW - scaledW) / 2;
      const offsetY = (thumbH - scaledH) / 2;

      return (
        <View style={styles.overviewThumbInnerRow}>
          <View style={styles.previewViewport}>
            <View style={[styles.previewScaledWrap, { left: offsetX, top: offsetY, width: scaledW, height: scaledH }]}>
              <View style={[styles.previewPageFrame, { width: pageW, height: pageH, transform: [{ scale }], transformOrigin: "0 0" }]}>
                {pageEls.map((el) => {
                  if (el.type === "text") {
                    return (
                      <View
                        key={el.id}
                        style={{
                          position: "absolute",
                          left: el.x,
                          top: el.y,
                          width: el.width,
                          height: el.height,
                          overflow: "hidden"
                        }}
                      >
                        <Text numberOfLines={2} style={styles.previewText}>
                          {el.text || "T"}
                        </Text>
                      </View>
                    );
                  }

                  if (el.type === "image") {
                    return el.uri ? (
                      <Image
                        key={el.id}
                        source={{ uri: el.uri }}
                        style={{ position: "absolute", left: el.x, top: el.y, width: el.width, height: el.height, borderRadius: 4 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        key={el.id}
                        style={{ position: "absolute", left: el.x, top: el.y, width: el.width, height: el.height, borderRadius: 4, backgroundColor: "#f0f0f0" }}
                      />
                    );
                  }

                  if (el.type === "shape") {
                    return (
                      <View
                        key={el.id}
                        style={{
                          position: "absolute",
                          left: el.x,
                          top: el.y,
                          width: el.width,
                          height: el.height,
                          borderWidth: Math.max(1, el.strokeWidth),
                          borderColor: el.color,
                          borderRadius: el.shape === "circle" ? 999 : 4
                        }}
                      />
                    );
                  }

                  return null;
                })}

                <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
                  <Svg width={pageW} height={pageH}>
                    {pageDrawingEls.map((drawingEl) =>
                      drawingEl.type === "drawing"
                        ? drawingEl.strokes.map((stroke) => (
                            <Path
                              key={stroke.id}
                              d={buildSmoothPath(stroke.points)}
                              stroke={stroke.color}
                              strokeWidth={Math.max(1, stroke.size)}
                              strokeOpacity={stroke.opacity ?? 1}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                            />
                          ))
                        : null
                    )}
                  </Svg>
                </View>
              </View>
            </View>
          </View>
        </View>
      );
    },
    [doc.pageHeight, doc.pageWidth, drawingsByPage, sortedElements]
  );

  const shouldShowAlignmentGuides = (isElementDragging || !!selectedId) && (alignmentGuides.x !== null || alignmentGuides.y !== null);

  return (
    <View
      ref={rootRef}
      style={styles.root}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setRootLayout((prev) =>
          Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5 ? prev : { width, height }
        );
      }}
      {...(!isDraggingPage && !overviewMode && mode !== "draw" ? panResponder.panHandlers : {})}
    >
      {/* ── Top toolbar ───────────────────────────────────────────────────── */}
      <Animated.View
        pointerEvents={toolbarVisible ? "box-none" : "none"}
        style={[
          styles.topBarOverlay,
          {
            opacity: toolbarOpacity,
            transform: [{ translateY: toolbarTranslateY }]
          }
        ]}
      >
        <View style={[styles.topBar, { borderColor: "rgba(148,163,184,0.28)" }]}> 
        {!isTextMode && (
          <>
            <Pressable style={tb()} onPress={addText}>
              <Ionicons name="text-outline" size={16} color={colors.textPrimary} />
            </Pressable>
            <Pressable style={tb()} onPress={addImage}>
              <Ionicons name="image-outline" size={16} color={colors.textPrimary} />
            </Pressable>
            <Pressable style={[tb(), showShapeMenu && styles.activeToolBtn]} onPress={() => setShowShapeMenu(true)}>
              <Ionicons name="shapes-outline" size={16} color={colors.textPrimary} />
            </Pressable>
            <Pressable
              style={[tb(), overviewMode && styles.activeToolBtn]}
              onPress={() => {
                setOverviewMode(true);
                setSelectedPageId(null);
              }}
            >
              <Ionicons name="grid-outline" size={16} color={colors.textPrimary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        )}

        <Pressable
          style={[tb(), (drawingMode === "pencil" || drawingMode === "transparentPencil") && styles.activeToolBtn]}
          onPress={() => toggleDrawingMode()}
          accessibilityLabel="Brush tool"
          accessibilityHint="Toggle freehand brush mode"
        >
          <Ionicons
            name="brush-outline"
            size={16}
            color={drawingMode === "pencil" || drawingMode === "transparentPencil" ? "#A78BFA" : colors.textPrimary}
          />
        </Pressable>

        <Pressable
          style={[tb(), drawingMode === "eraser" && styles.activeToolBtn]}
          onPress={toggleEraserMode}
          accessibilityLabel="Eraser tool"
          accessibilityHint="Toggle eraser mode"
        >
          <Ionicons name="backspace-outline" size={18} color={drawingMode === "eraser" ? "#EF4444" : colors.textPrimary} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable style={[tb(), !canUndo && styles.disabledBtn]} onPress={handleUndo} disabled={!canUndo}>
          <Ionicons name="arrow-undo-outline" size={16} color={canUndo ? colors.textPrimary : colors.textSecondary} />
        </Pressable>
        <Pressable style={[tb(), !canRedo && styles.disabledBtn]} onPress={handleRedo} disabled={!canRedo}>
          <Ionicons name="arrow-redo-outline" size={16} color={canRedo ? colors.textPrimary : colors.textSecondary} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable style={styles.zoomResetBtn} onPress={resetZoom}>
          <Text variant="caption" muted style={styles.zoomLabel}>
            {Math.round(zoom * 100)}%
          </Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          style={[tb(), currentPageIndex <= 0 && styles.disabledBtn]}
          onPress={() => goToPage(currentPageIndex - 1)}
          disabled={currentPageIndex <= 0}
        >
          <Ionicons name="chevron-back" size={16} color={currentPageIndex <= 0 ? colors.textSecondary : colors.textPrimary} />
        </Pressable>
        <View style={styles.pagePill}>
          <Text muted variant="caption">{Math.min(pageCount, currentPageIndex + 1)}/{Math.max(1, pageCount)}</Text>
        </View>
        <Pressable
          style={[tb(), currentPageIndex >= pageCount - 1 && styles.disabledBtn]}
          onPress={() => goToPage(currentPageIndex + 1)}
          disabled={currentPageIndex >= pageCount - 1}
        >
          <Ionicons name="chevron-forward" size={16} color={currentPageIndex >= pageCount - 1 ? colors.textSecondary : colors.textPrimary} />
        </Pressable>

        {/* Drawing controls moved to PencilToolbarModal */}

        {showSelectionDelete && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Pressable style={tb()} onPress={deleteSelected}>
              <Ionicons name="trash-outline" size={16} color="#EF4444" />
            </Pressable>
          </>
        )}

        {isTextMode && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Pressable style={tb()} onPress={clearSelection}>
              <Ionicons name="checkmark" size={18} color={colors.textPrimary} />
            </Pressable>
          </>
        )}
        </View>
      </Animated.View>

      <ScrollView
        ref={(n) => {
          scrollRef.current = n;
        }}
        pointerEvents={isDraggingPage || overviewMode ? "none" : "auto"}
        style={styles.canvasScroll}
        contentContainerStyle={styles.canvasScrollContent}
        scrollEnabled={false}
        keyboardShouldPersistTaps="handled"
        onLayout={(e: LayoutChangeEvent) => {
          const { width, height } = e.nativeEvent.layout;
          setViewportW((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
          setViewportH((prev) => (Math.abs(prev - height) < 0.5 ? prev : height));
        }}
      >
        <View style={styles.workspace}>
          <View
            style={[
              styles.canvasContainer,
              {
              transform: [
                { translateX: renderCanvasPosition.x },
                { translateY: renderCanvasPosition.y },
                { scale: displayScale }
              ],
              transformOrigin: "0 0"
              }
            ]}
          >
            {currentPage ? (
              <View style={[styles.pageTrackViewport, { width: slideWidth, height: pageTrackHeight }]}> 
                {stagedNextPage ? (
                  <Animated.View
                    style={[
                      styles.pageTrack,
                      {
                        width: slideWidth * 2,
                        transform: [{ translateX: pageSwipeX }]
                      }
                    ]}
                  >
                    {pageTransitionDirection === 1 ? (
                      <>
                        <View style={[styles.pageTrackItem, { width: slideWidth, height: pageTrackHeight }]}>{renderPage(currentPage)}</View>
                        <View style={[styles.pageTrackItem, { width: slideWidth, height: pageTrackHeight }]}>{renderPage(stagedNextPage)}</View>
                      </>
                    ) : (
                      <>
                        <View style={[styles.pageTrackItem, { width: slideWidth, height: pageTrackHeight }]}>{renderPage(stagedNextPage)}</View>
                        <View style={[styles.pageTrackItem, { width: slideWidth, height: pageTrackHeight }]}>{renderPage(currentPage)}</View>
                      </>
                    )}
                  </Animated.View>
                ) : (
                  <View style={[styles.pageTrackItem, { width: slideWidth, height: pageTrackHeight }]}>{renderPage(currentPage)}</View>
                )}
              </View>
            ) : null}

            {shouldShowAlignmentGuides && alignmentGuides.x !== null && (
              <View
                pointerEvents="none"
                style={[
                  styles.alignmentGuideVertical,
                  {
                    left: alignmentGuides.x,
                    height: pageTrackHeight
                  }
                ]}
              />
            )}

            {shouldShowAlignmentGuides && alignmentGuides.y !== null && (
              <View
                pointerEvents="none"
                style={[
                  styles.alignmentGuideHorizontal,
                  {
                    top: alignmentGuides.y,
                    width: slideWidth
                  }
                ]}
              />
            )}
          </View>
        </View>
      </ScrollView>

      <View pointerEvents="box-none" style={styles.dotsOverlay}>
        <View style={styles.dotsContainer}>
          {(doc.pages ?? []).map((page, index) => {
            const dotScale = animatedIndex.interpolate({
              inputRange: [index - 1, index, index + 1],
              outputRange: [1, 1.2, 1],
              extrapolate: "clamp"
            });
            const dotOpacity = animatedIndex.interpolate({
              inputRange: [index - 1, index, index + 1],
              outputRange: [0.3, 1, 0.3],
              extrapolate: "clamp"
            });
            const dotWidth = animatedIndex.interpolate({
              inputRange: [index - 1, index, index + 1],
              outputRange: [8, 16, 8],
              extrapolate: "clamp"
            });
            return (
              <Pressable
                key={page.id}
                onPress={() => goToPage(index)}
                hitSlop={8}
              >
                <Animated.View
                  style={[
                    styles.dot,
                    {
                      width: dotWidth,
                      opacity: dotOpacity,
                      transform: [{ scale: dotScale }]
                    }
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      <Modal visible={showShapeMenu} transparent animationType="fade" onRequestClose={() => setShowShapeMenu(false)}>
        <Pressable style={styles.shapeModalBackdrop} onPress={() => setShowShapeMenu(false)}>
          <View style={[styles.shapeModalCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
            <Text variant="subtitle" style={styles.shapeModalTitle}>
              Formas
            </Text>

            <View style={styles.shapeModalRow}>
              <Pressable style={[styles.shapeModalBtn, { borderColor: colors.border }]} onPress={() => addShape("rectangle")}>
                <Ionicons name="square-outline" size={20} color={colors.textPrimary} />
                <Text muted variant="caption">Quadrado</Text>
              </Pressable>

              <Pressable style={[styles.shapeModalBtn, { borderColor: colors.border }]} onPress={() => addShape("circle")}>
                <Ionicons name="ellipse-outline" size={20} color={colors.textPrimary} />
                <Text muted variant="caption">Círculo</Text>
              </Pressable>

              <Pressable style={[styles.shapeModalBtn, { borderColor: colors.border }]} onPress={() => addShape("arrow")}>
                <Ionicons name="arrow-forward-outline" size={20} color={colors.textPrimary} />
                <Text muted variant="caption">Seta</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={overviewMode}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setOverviewMode(false);
          setSelectedPageId(null);
          isDraggingPageRef.current = false;
          setIsDraggingPage(false);
        }}
      >
        <View style={styles.overviewModalRoot}>
          <Pressable
            style={styles.overviewBackdrop}
            onPress={() => {
              setSelectedPageId(null);
              isDraggingPageRef.current = false;
              setIsDraggingPage(false);
            }}
          />

          <View style={[styles.overviewCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}> 
            <View style={styles.overviewHeader}>
              <Text variant="subtitle">Pages overview</Text>
              <Pressable
                style={styles.menuBtnSmall}
                onPress={() => {
                  setOverviewMode(false);
                  setSelectedPageId(null);
                  isDraggingPageRef.current = false;
                  setIsDraggingPage(false);
                }}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            <DraggableFlatList
              data={doc.pages ?? []}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.overviewList}
              activationDistance={10}
              onDragBegin={(index) => {
                isDraggingPageRef.current = true;
                pushUndoSnapshot();
                const page = doc.pages?.[index];
                if (page) setSelectedPageId(page.id);
                setIsDraggingPage(true);
              }}
              onDragEnd={({ data, from, to }) => {
                const pages = doc.pages ?? [];
                if (!pages.length) {
                  isDraggingPageRef.current = false;
                  setIsDraggingPage(false);
                  return;
                }

                const reordered = data;
                const currentId = pages[currentPageIndex]?.id ?? null;
                const selectedIdSafe = selectedPageId;

                setDoc((prev) => ({ ...prev, pages: reordered }));

                if (currentId) {
                  const nextCurrentIdx = reordered.findIndex((p) => p.id === currentId);
                  if (nextCurrentIdx >= 0) setCurrentPageIndex(nextCurrentIdx);
                }

                if (selectedIdSafe) {
                  const stillExists = reordered.some((p) => p.id === selectedIdSafe);
                  setSelectedPageId(stillExists ? selectedIdSafe : null);
                }

                isDraggingPageRef.current = false;
                setIsDraggingPage(false);
              }}
              renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<CanvasPage>) => {
                const index = getIndex?.() ?? 0;
                const isCurrent = index === currentPageIndex;
                const isSelected = selectedPageId === item.id;
                const title = item.title ?? `Page ${index + 1}`;
                return (
                  <Pressable
                    onPress={() => {
                      setSelectedPageId(item.id);
                      setCurrentPageIndex(index);
                    }}
                    style={[
                      styles.overviewRow,
                      {
                        borderColor: isSelected || isCurrent ? colors.primary : colors.border,
                        backgroundColor: isActive ? "#2A3346" : "#151C29",
                        transform: [{ scale: isActive ? 1.05 : 1 }],
                        opacity: isActive ? 0.96 : 1,
                        elevation: isActive ? 10 : 2,
                        shadowOpacity: isActive ? 0.28 : 0.1
                      }
                    ]}
                  >
                    {renderPagePreview(item)}
                    <View style={styles.overviewRowMeta}>
                      <Text variant="subtitle" numberOfLines={1}>{title}</Text>
                      <Text muted variant="caption">{Math.round(item.width)} × {Math.round(item.height)}</Text>
                    </View>
                    <Pressable
                      onLongPress={() => {
                        setSelectedPageId(item.id);
                        drag();
                      }}
                      delayLongPress={140}
                      hitSlop={8}
                      style={styles.overviewDragHandle}
                    >
                      <Ionicons name="reorder-three-outline" size={18} color={colors.textSecondary} />
                    </Pressable>
                  </Pressable>
                );
              }}
            />
          </View>

          <Animated.View
            pointerEvents={showPageToolbar ? "auto" : "none"}
            style={[
              styles.pageToolbarWrap,
              {
                opacity: pageToolbarAnim,
                transform: [
                  {
                    translateY: pageToolbarAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0]
                    })
                  }
                ]
              }
            ]}
          >
            <View style={styles.pageToolbarInner}>
              <Pressable
                style={styles.pageToolbarBtn}
                onPress={() => {
                  if (!selectedPageId) return;
                  deletePage(selectedPageId);
                  setSelectedPageId(null);
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </Pressable>

              <Pressable
                style={styles.pageToolbarBtn}
                onPress={() => {
                  if (!selectedPageId) return;
                  duplicatePage(selectedPageId);
                }}
              >
                <Ionicons name="copy-outline" size={18} color="#E5E7EB" />
              </Pressable>

              <Pressable style={styles.pageToolbarBtn} onPress={renameSelectedPage}>
                <Ionicons name="create-outline" size={18} color="#E5E7EB" />
              </Pressable>

              <Pressable
                style={styles.pageToolbarBtn}
                onPress={() => {
                  addPage();
                }}
              >
                <Ionicons name="add-outline" size={20} color="#E5E7EB" />
              </Pressable>

              <Pressable
                style={styles.pageToolbarBtn}
                onPress={() => {
                  if (!selectedPageId) return;
                  movePage(selectedPageId, -1);
                }}
              >
                <Ionicons name="arrow-up-outline" size={18} color="#E5E7EB" />
              </Pressable>

              <Pressable
                style={styles.pageToolbarBtn}
                onPress={() => {
                  if (!selectedPageId) return;
                  movePage(selectedPageId, 1);
                }}
              >
                <Ionicons name="arrow-down-outline" size={18} color="#E5E7EB" />
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={showRenamePageModal} transparent animationType="fade" onRequestClose={() => setShowRenamePageModal(false)}>
        <Pressable style={styles.shapeModalBackdrop} onPress={() => setShowRenamePageModal(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.shapeModalCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          >
            <Text variant="subtitle" style={styles.shapeModalTitle}>Rename page</Text>
            <TextInput
              value={renamePageDraft}
              onChangeText={setRenamePageDraft}
              placeholder="Page name"
              placeholderTextColor="#94A3B866"
              style={[styles.renameInput, { color: colors.textPrimary, borderColor: colors.border }]}
              autoFocus
              maxLength={48}
            />
            <View style={styles.renameActions}>
              <Pressable style={styles.menuBtnSmall} onPress={() => setShowRenamePageModal(false)}>
                <Text muted>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.menuBtnSmall, styles.activeBtn]} onPress={applyRenamePage}>
                <Text style={{ color: colors.textPrimary }}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showLinkModal} transparent animationType="fade" onRequestClose={() => setShowLinkModal(false)}>
        <Pressable style={styles.shapeModalBackdrop} onPress={() => setShowLinkModal(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.shapeModalCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          >
            <Text variant="subtitle" style={styles.shapeModalTitle}>Add Link</Text>
            <TextInput
              value={linkModalInput}
              onChangeText={setLinkModalInput}
              placeholder="Enter URL or text"
              placeholderTextColor="#94A3B866"
              style={[styles.renameInput, { color: colors.textPrimary, borderColor: colors.border }]}
              autoFocus
            />
            <View style={styles.renameActions}>
              <Pressable style={styles.menuBtnSmall} onPress={() => {
                setShowLinkModal(false);
                setLinkModalInput("");
              }}>
                <Text muted>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.menuBtnSmall, styles.activeBtn]} onPress={addLinkToText}>
                <Text style={{ color: colors.textPrimary }}>Add</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View pointerEvents="box-none" style={styles.overlayLayer}>
        {showTextToolbar && !(textToolbarMode === "floating" && !hasValidToolbarPosition) && (
          <>
            <View
              style={[
                styles.bottomTextToolbarWrap,
                {
                  left: toolbarLeft,
                  top: textToolbarTop,
                  width: dynamicToolbarWidth
                }
              ]}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setTextToolbarLayout((prev) =>
                  Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5 ? prev : { width, height }
                );
              }}
              pointerEvents="box-none"
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.floatingTextToolbar, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}
                style={styles.bottomToolbarScroll}
              >
              <Pressable
                style={[styles.textTbBtn, showStylePanel && styles.activeBtn]}
                onPress={() => {
                  setShowAlignMenu(false);
                  setShowStylePanel((v) => !v);
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>Aa</Text>
              </Pressable>

              <Pressable
                style={[styles.textTbBtn, false]}
                onPress={() => {
                  setShowAlignMenu(false);
                  setShowStylePanel(false);
                }}
              >
                <View style={styles.colorUnderlineWrap}>
                  <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "500" }}>A</Text>
                  <View style={[styles.colorUnderline, { backgroundColor: selectedTextColor }]} />
                </View>
              </Pressable>

              <Pressable style={[styles.textTbBtn, selectedTextStyle.bold && styles.activeBtn]} onPress={() => toggleTextStyle("bold")}>
                <Text style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 18 }}>B</Text>
              </Pressable>
              <Pressable style={[styles.textTbBtn, selectedTextStyle.italic && styles.activeBtn]} onPress={() => toggleTextStyle("italic")}>
                <Text style={{ color: colors.textPrimary, fontStyle: "italic", fontSize: 18 }}>I</Text>
              </Pressable>
              <Pressable style={[styles.textTbBtn, selectedTextStyle.underline && styles.activeBtn]} onPress={() => toggleTextStyle("underline")}>
                <Text style={{ color: colors.textPrimary, textDecorationLine: "underline", fontSize: 18 }}>U</Text>
              </Pressable>
              <Pressable style={[styles.textTbBtn, selectedTextStyle.strikethrough && styles.activeBtn]} onPress={() => toggleTextStyle("strikethrough")}>
                <Text style={{ color: colors.textPrimary, textDecorationLine: "line-through", fontSize: 18 }}>S</Text>
              </Pressable>

              <Pressable
                style={[styles.textTbBtn, selectedFontFamily === "monospace" && styles.activeBtn]}
                onPress={toggleCodeTextStyle}
              >
                <Ionicons name="code-slash-outline" size={18} color={colors.textPrimary} />
              </Pressable>

              <Pressable
                style={styles.textTbBtn}
                onPressIn={handleOpenLinkModal}
              >
                <Ionicons name="link" size={18} color={colors.textPrimary} />
              </Pressable>

              <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />

              <Pressable
                style={[styles.menuBtnSmall, showAlignMenu && styles.activeBtn]}
                onPress={() => {
                  setShowStylePanel(false);
                  setShowAlignMenu((v) => !v);
                }}
              >
                <Ionicons name="menu" size={18} color={colors.textPrimary} />
              </Pressable>

              <Pressable style={styles.textTbBtn} onPress={deleteSelected}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
              </Pressable>

              <Pressable style={styles.menuBtnLarge} onPress={clearSelection}>
                <Ionicons name="checkmark" size={22} color={colors.textPrimary} />
              </Pressable>
              </ScrollView>
            </View>

            {showStylePanel && (
              <View
                style={[
                  styles.sizePalettePopup,
                  {
                    left: 8,
                    right: 8,
                    top: popupTop,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceElevated
                  }
                ]}
              >
              <View style={styles.formatRow}>
                <Pressable style={styles.menuBtnSmall} onPress={cycleFontFamily}>
                  <Text style={{ color: colors.textPrimary, fontSize: 11 }}>
                    {selectedFontFamily === "System" ? "Fonte" : selectedFontFamily.slice(0, 6)}
                  </Text>
                </Pressable>
                <View style={[styles.textSizeChip, styles.textSizeChipPassive]}>
                  <Text style={{ color: colors.textPrimary, fontSize: 12 }}>{selectedFontSize}</Text>
                </View>
              </View>

              <View style={styles.sizePresetRow}>
                {TEXT_SIZE_PRESETS.map((size) => {
                  const active = selectedFontSize === size;
                  return (
                    <Pressable
                      key={size}
                      style={[styles.sizePresetChip, active && styles.activeBtn]}
                      onPress={() => setTextSize(size)}
                    >
                      <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: active ? "700" : "500" }}>
                        {size}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.colorRow}>
                {TEXT_COLORS.map((color) => {
                  const active = selectedTextColor.toLowerCase() === color.toLowerCase();
                  return (
                    <Pressable
                      key={color}
                      style={[
                        styles.colorDot,
                        {
                          backgroundColor: color,
                          borderColor: color === "#FFFFFF" ? "#B6BDC8" : color
                        },
                        active && styles.colorDotActive
                      ]}
                      onPress={() => setTextColor(color)}
                    />
                  );
                })}
              </View>
              </View>
            )}

            {showAlignMenu && (
              <View
                style={[
                  styles.colorPalettePopup,
                  {
                    left: 8,
                    right: 8,
                    top: popupTop,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceElevated
                  }
                ]}
              >
              <View style={styles.formatRow}>
                <Pressable
                  style={[styles.menuBtnSmall, (selectedTextStyle.textAlign ?? "left") === "left" && styles.activeBtn]}
                  onPress={() => setTextAlign("left")}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 12 }}>Esquerda</Text>
                </Pressable>
                <Pressable
                  style={[styles.menuBtnSmall, selectedTextStyle.textAlign === "center" && styles.activeBtn]}
                  onPress={() => setTextAlign("center")}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 12 }}>Centro</Text>
                </Pressable>
                <Pressable
                  style={[styles.menuBtnSmall, selectedTextStyle.textAlign === "right" && styles.activeBtn]}
                  onPress={() => setTextAlign("right")}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 12 }}>Direita</Text>
                </Pressable>
              </View>
              </View>
            )}
          </>
        )}

      </View>

      <PencilToolbarModal
        visible={showPencilModal}
        onDismiss={() => setShowPencilModal(false)}
        currentColor={drawingColor}
        onColorChange={setDrawingColor}
        currentSize={drawingSize}
        onSizeChange={setDrawingSize}
        currentOpacity={drawingOpacity}
        onOpacityChange={setDrawingOpacity}
        isUsingEraser={drawingMode === "eraser"}
        activeTool={drawingMode === "eraser" ? "eraser" : drawingMode === "transparentPencil" ? "transparentPencil" : drawingMode === "pencil" ? "pencil" : null}
        onToolToggle={(tool) => {
          if (tool === "eraser") {
            setDrawingMode("eraser");
            setMode("draw");
            return;
          }
          if (tool === "transparentPencil") {
            setDrawingMode("transparentPencil");
            setMode("draw");
            return;
          }
          setDrawingMode("pencil");
          setMode("draw");
        }}
        onDelete={deleteSelectedOrAll}
        colors={DRAW_COLORS}
        sizes={DRAW_SIZES}
      />
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#0b0b0b"
  },
  topBarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: "transparent",
    alignItems: "center",
    paddingHorizontal: 8
  },
  topBar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 78,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(20,20,20,0.62)",
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    maxWidth: "96%",
    alignSelf: "center"
  },
  toolBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  activeToolBtn: {
    backgroundColor: "#3B82F622"
  },
  disabledBtn: {
    opacity: 0.45
  },
  zoomResetBtn: {
    minWidth: 52,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  divider: { width: 1, height: 20, marginHorizontal: 2 },
  zoomLabel: { minWidth: 34, textAlign: "center", fontSize: 11 },
  pagePill: {
    minWidth: 62,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  canvasScroll: {
    flex: 1,
    backgroundColor: "#0b0b0b"
  },
  canvasScrollContent: {
    flexGrow: 1,
    minHeight: "100%"
  },
  workspace: {
    flex: 1,
    width: "100%",
    height: "100%",
    position: "relative",
    backgroundColor: "#0b0b0b",
    padding: 0,
    overflow: "hidden"
  },
  canvasContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 1
  },
  pageTrackViewport: {
    overflow: "visible"
  },
  pageTrack: {
    flexDirection: "row",
    alignItems: "stretch"
  },
  pageTrackItem: {
    position: "relative",
    alignItems: "center",
    justifyContent: "flex-start"
  },
  alignmentGuideVertical: {
    position: "absolute",
    top: 0,
    width: 1,
    backgroundColor: "#22D3EE",
    zIndex: 999
  },
  alignmentGuideHorizontal: {
    position: "absolute",
    left: 0,
    height: 1,
    backgroundColor: "#22D3EE",
    zIndex: 999
  },
  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 16,
    overflow: "visible",
    backgroundColor: "#1a1a1a"
  },
  pageClipSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1a1a1a"
  },
  elementsLayer: {
    zIndex: 10
  },
  drawingVisualLayer: {
    zIndex: 20
  },
  pageActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
    marginBottom: 6
  },
  pageActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  drawControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap"
  },
  drawColor: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5
  },
  drawColorActive: {
    transform: [{ scale: 1.15 }],
    borderWidth: 2.5
  },
  drawingTouchLayer: {
    position: "absolute",
    zIndex: 9999
  },
  dotsOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    pointerEvents: "box-none"
  },
  dotsContainer: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    pointerEvents: "auto"
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.3)"
  },
  overviewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    zIndex: 0
  },
  overviewModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 28
  },
  overviewCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    maxHeight: "80%",
    padding: 12,
    gap: 10,
    zIndex: 2
  },
  overviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 6
  },
  overviewList: {
    paddingBottom: 8,
    gap: 8
  },
  overviewRow: {
    minHeight: 78,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000000",
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }
  },
  overviewThumbInnerRow: {
    width: 72,
    height: 96,
    borderRadius: 8,
    backgroundColor: "#121722",
    alignItems: "center",
    justifyContent: "center"
  },
  previewViewport: {
    width: 72,
    height: 96,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#0F1420"
  },
  previewScaledWrap: {
    position: "absolute",
    overflow: "hidden",
    borderRadius: 4
  },
  previewPageFrame: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "#1a1a1a",
    overflow: "hidden"
  },
  previewText: {
    color: "#D1D5DB",
    fontSize: 18,
    lineHeight: 20
  },
  overviewRowMeta: {
    flex: 1,
    gap: 4
  },
  overviewDragHandle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center"
  },
  overviewThumbWrap: {
    width: "31%",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 8,
    alignItems: "center",
    gap: 6
  },
  overviewThumbInner: {
    width: "100%",
    aspectRatio: 0.75,
    borderRadius: 8,
    backgroundColor: "#121722",
    alignItems: "center",
    justifyContent: "center"
  },
  overviewThumbPage: {
    width: "78%",
    height: "82%",
    borderRadius: 8,
    backgroundColor: "#1D2535",
    borderWidth: 1,
    borderColor: "#2F3B54"
  },
  shapeModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  shapeModalCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 14,
    gap: 12
  },
  shapeModalTitle: {
    fontWeight: "700"
  },
  shapeModalRow: {
    flexDirection: "row",
    gap: 10
  },
  shapeModalBtn: {
    flex: 1,
    minHeight: 86,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 10
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1400,
    elevation: 24
  },
  pageToolbarWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 22,
    zIndex: 1200
  },
  pageToolbarInner: {
    minHeight: 62,
    borderRadius: 22,
    backgroundColor: "rgba(17, 24, 39, 0.86)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.32)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18
  },
  pageToolbarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  bottomTextToolbarWrap: {
    position: "absolute",
    zIndex: 1200,
    elevation: 20
  },
  bottomToolbarScroll: {
    flexGrow: 0
  },
  floatingTextToolbar: {
    minHeight: FLOATING_TOOLBAR_H,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  textTbBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  colorUnderlineWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2
  },
  colorUnderline: {
    width: 16,
    height: 3,
    borderRadius: 999
  },
  menuBtn: {
    minWidth: 84,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  menuBtnSmall: {
    minWidth: 48,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  menuBtnLarge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  textSizeChip: {
    minWidth: 44,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  textSizeChipPassive: {
    height: 36,
    borderRadius: 18,
    opacity: 0.75
  },
  activeBtn: {
    backgroundColor: "#3B82F633"
  },
  verticalDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    marginHorizontal: 4,
    opacity: 0.9
  },
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  colorPalettePopup: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    zIndex: 1201,
    elevation: 21
  },
  sizePalettePopup: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    zIndex: 1201,
    elevation: 21
  },
  sizePresetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  formatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
    alignItems: "center"
  },
  renameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  renameActions: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8
  },
  sizePresetChip: {
    minWidth: 46,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5
  },
  colorDotActive: {
    transform: [{ scale: 1.2 }],
    borderWidth: 2.5
  },
  pageLabel: { marginTop: 6, marginBottom: 2 },
  arrowWrap: { width: "100%", height: "100%", flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  arrowLine: { flex: 1 },
  arrowHead: { width: 0, height: 0, borderTopColor: "transparent", borderBottomColor: "transparent" },
  imageFill: { width: "100%", height: "100%" },
  textActionButtonsWrap: {
    position: "absolute",
    left: "50%",
    bottom: -54,
    transform: [{ translateX: -52 }],
    zIndex: 50
  },
  textActionButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  textActionButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.2)",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7
  },
  textActionButtonActive: {
    backgroundColor: "#A7F3D0",
    borderColor: "#10B981"
  },
  handle: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2
  },
  cornerHandle: {
    borderRadius: 6
  },
  sideHandle: {
    width: 28,
    height: 20,
    borderRadius: 10
  },
  handleNW: { left: -12, top: -12 },
  handleNE: { right: -12, top: -12 },
  handleSW: { left: -12, bottom: -12 },
  handleSE: { right: -12, bottom: -12 },
  handleN: { left: "50%", top: -10, marginLeft: -14 },
  handleS: { left: "50%", bottom: -10, marginLeft: -14 },
  handleE: { right: -10, top: "50%", marginTop: -10 },
  handleW: { left: -10, top: "50%", marginTop: -10 }
});
