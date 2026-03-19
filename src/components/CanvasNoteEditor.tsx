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
  Keyboard,
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
import type { CanvasElement, CanvasNoteDocument, CanvasPage, ID } from "@models/types";
import { pickAndStoreImage } from "@utils/mediaPicker";
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
const makeLocalId = (): ID => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

type InteractionMode = "move" | "resize";
type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type DrawingToolMode = "brush" | "eraser" | null;

interface CanvasNoteEditorProps {
  value: string;
  onChangeText: (value: string) => void;
  toolbarVisible?: boolean;
  editable?: boolean;
}

interface ElementInteraction {
  elementId: string;
  mode: InteractionMode;
  handle?: ResizeHandle;
  startElX: number;
  startElY: number;
  startElW: number;
  startElH: number;
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
  points: Array<{ x: number; y: number }>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const getMaxZ = (els: CanvasElement[]) => els.reduce((acc, el) => Math.max(acc, el.zIndex ?? 0), 0);

const buildSmoothPath = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    d += ` Q ${current.x} ${current.y}, ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
};

const cloneDoc = (doc: CanvasNoteDocument): CanvasNoteDocument => JSON.parse(JSON.stringify(doc)) as CanvasNoteDocument;
const touchDist = (a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) =>
  Math.sqrt((a.pageX - b.pageX) ** 2 + (a.pageY - b.pageY) ** 2);
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
  primaryColor: string;
  surfaceElevated: string;
  defaultTextColor: string;
  onSetRef: (id: string, node: View | null) => void;
  onSetInputRef: (id: string, node: TextInput | null) => void;
  onTextFocused: (id: string) => void;
  onSelect: (id: string) => void;
  onMovePressIn: (el: CanvasElement, evt: GestureResponderEvent) => void;
  onResizePressIn: (el: CanvasElement, handle: ResizeHandle, evt: GestureResponderEvent) => void;
  onChangeText: (id: string, text: string) => void;
  onTextSizeChange: (id: string, h: number) => void;
}

const CanvasElementView = memo(
  ({
    element,
    selected,
    editable,
    primaryColor,
    surfaceElevated,
    defaultTextColor,
    onSetRef,
    onSetInputRef,
    onTextFocused,
    onSelect,
    onMovePressIn,
    onResizePressIn,
    onChangeText,
    onTextSizeChange
  }: ElementProps) => {
    const handlePress = useCallback(() => {
      if (!editable) return;
      onSelect(element.id);
    }, [editable, element.id, onSelect]);
    const handlePressIn = useCallback(
      (evt: GestureResponderEvent) => {
        if (!editable) return;
        onMovePressIn(element, evt);
      },
      [editable, element, onMovePressIn]
    );
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
      const textDecorationLine = element.style?.underline
        ? element.style?.strikethrough
          ? "underline line-through"
          : "underline"
        : element.style?.strikethrough
          ? "line-through"
          : "none";
      inner = (
        <TextInput
          ref={(node) => onSetInputRef(element.id, node)}
          multiline
          scrollEnabled={false}
          value={element.text}
          editable={selected && editable}
          onFocus={() => {
            if (!editable) return;
            handlePress();
            onTextFocused(element.id);
          }}
          onPressIn={handlePressIn}
          onChangeText={handleText}
          onContentSizeChange={(e) => onTextSizeChange(element.id, e.nativeEvent.contentSize.height)}
          placeholder="Tap to type…"
          placeholderTextColor={`${color}66`}
          style={{
            color,
            fontSize: element.style?.fontSize ?? 18,
            fontWeight: element.style?.bold ? "700" : "400",
            fontStyle: element.style?.italic ? "italic" : "normal",
            textDecorationLine,
            textAlign: element.style?.textAlign ?? "left",
            fontFamily: element.style?.fontFamily,
            paddingHorizontal: 8,
            paddingVertical: 6,
            width: "100%",
            height: "100%"
          }}
        />
      );
    } else if (element.type === "image") {
      inner = <Image source={{ uri: element.uri }} style={styles.imageFill} resizeMode="contain" />;
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
          borderWidth: selected ? 2 : 0,
          borderColor: selected ? primaryColor : "transparent",
          borderRadius: 10
        }}
      >
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          style={StyleSheet.absoluteFillObject}
        >
          {inner}
        </Pressable>

        {selected && editable && (
          <>
            {/* Corners */}
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
            {/* Sides */}
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

export const CanvasNoteEditor: React.FC<CanvasNoteEditorProps> = ({ value, onChangeText, toolbarVisible = true, editable = true }) => {
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
  const [drawingOpacity, setDrawingOpacity] = useState(1);
  const [drawingSmoothness, setDrawingSmoothness] = useState(0.45);
  const [drawingColor, setDrawingColor] = useState(DRAW_COLORS[1]);
  const [drawingSize, setDrawingSize] = useState(4);
  const [drawingDraft, setDrawingDraft] = useState<DrawingDraft | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [overviewMode, setOverviewMode] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<ID | null>(null);
  const [isDraggingPage, setIsDraggingPage] = useState(false);
  const [showRenamePageModal, setShowRenamePageModal] = useState(false);
  const [renamePageDraft, setRenamePageDraft] = useState("");

  // ── Refs ───────────────────────────────────────────────────────────────────
  const docRef = useRef(doc);
  docRef.current = doc;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const canvasPositionRef = useRef(canvasPosition);
  canvasPositionRef.current = canvasPosition;

  const elementInteractionRef = useRef<ElementInteraction | null>(null);
  const pinchStateRef = useRef<PinchState | null>(null);
  const canvasPanStateRef = useRef<CanvasPanState | null>(null);
  const rootRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const elementRefs = useRef<Record<string, View | null>>({});
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const undoStackRef = useRef<CanvasNoteDocument[]>([]);
  const redoStackRef = useRef<CanvasNoteDocument[]>([]);
  const displayScaleRef = useRef(1);
  const pendingInitialCenterRef = useRef(true);
  const pageToolbarAnim = useRef(new Animated.Value(0)).current;
  const toolbarTranslateY = useRef(new Animated.Value(0)).current;
  const toolbarOpacity = useRef(new Animated.Value(1)).current;

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

  useEffect(() => {
    requestAnimationFrame(() => {
      rootRef.current?.measureInWindow((x, y, width, height) => {
        const next = { x, y, width, height };
        setRootWindowFrame((prev) =>
          Math.abs(prev.x - x) < 0.5 &&
          Math.abs(prev.y - y) < 0.5 &&
          Math.abs(prev.width - width) < 0.5 &&
          Math.abs(prev.height - height) < 0.5
            ? prev
            : next
        );
      });
    });
  }, [rootLayout.height, rootLayout.width]);

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
      return clampCanvasOffset(center.x, center.y, fitScale);
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
    const centered = clampCanvasOffset(center.x, center.y, baseFitScale);
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
  }, []);

  const handleTextFocused = useCallback((id: string) => {
    if (pendingFocusTextId === id) setPendingFocusTextId(null);
  }, [pendingFocusTextId]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setPendingFocusTextId(null);
    setShowStylePanel(false);
    setShowAlignMenu(false);
    Keyboard.dismiss();
  }, []);

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
  }, [rootLayout.height, rootLayout.width, selectedTextElement]);

  useEffect(() => {
    const max = Math.max(0, (doc.pages?.length ?? 1) - 1);
    setCurrentPageIndex((prev) => clamp(prev, 0, max));
  }, [doc.pages]);

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
    setShowShapeMenu(false);
    setShowStylePanel(false);
    setShowAlignMenu(false);
    setSelectedId(null);
    setPendingFocusTextId(null);
    elementInteractionRef.current = null;
  }, [editable]);

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

  // ── Element callbacks ──────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (id: string) => {
      if (!editable || drawingMode) return;
      setSelectedId(id);
      bringToFront(id);
    },
    [bringToFront, drawingMode, editable]
  );

  const beginInteraction = useCallback(
    (el: CanvasElement, mode: InteractionMode, evt: GestureResponderEvent, handle?: ResizeHandle) => {
      if (!editable || drawingMode) return;
      pushUndoSnapshot();
      setSelectedId(el.id);
      bringToFront(el.id);
      elementInteractionRef.current = {
        elementId: el.id,
        mode,
        handle,
        startElX: el.x,
        startElY: el.y,
        startElW: el.width,
        startElH: el.height,
        startPageX: evt.nativeEvent.pageX,
        startPageY: evt.nativeEvent.pageY
      };
    },
    [bringToFront, drawingMode, editable, pushUndoSnapshot]
  );

  const handleElementMovePressIn = useCallback(
    (el: CanvasElement, evt: GestureResponderEvent) => beginInteraction(el, "move", evt),
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

  const beginDrawing = useCallback(
    (pageId: ID, rawX: number, rawY: number) => {
      if (!editable) return;
      const page = pagesById.get(pageId);
      if (!page) return;
      const x = clamp(rawX, 0, page.width);
      const y = clamp(rawY, 0, page.height);
      clearSelection();
      pushUndoSnapshot();
      setDrawingDraft({ pageId, points: [{ x, y }] });
    },
    [clearSelection, editable, pagesById, pushUndoSnapshot]
  );

  const updateDrawing = useCallback(
    (pageId: ID, rawX: number, rawY: number) => {
      if (!editable) return;
      const page = pagesById.get(pageId);
      if (!page) return;
      const x = clamp(rawX, 0, page.width);
      const y = clamp(rawY, 0, page.height);
      setDrawingDraft((prev) => {
        if (!prev || prev.pageId !== pageId) return prev;
        const last = prev.points[prev.points.length - 1];
        if (!last) return { ...prev, points: [...prev.points, { x, y }] };
        const filteredX = last.x + (x - last.x) * (1 - drawingSmoothness);
        const filteredY = last.y + (y - last.y) * (1 - drawingSmoothness);
        const dx = filteredX - last.x;
        const dy = filteredY - last.y;
        if (Math.sqrt(dx * dx + dy * dy) < 0.8) return prev;
        return { ...prev, points: [...prev.points, { x: filteredX, y: filteredY }] };
      });
    },
    [drawingSmoothness, editable, pagesById]
  );

  const endDrawing = useCallback(() => {
    if (!editable) return;
    setDrawingDraft((draft) => {
      if (!draft || draft.points.length < 1) return null;
      const points = draft.points.length === 1 ? [draft.points[0], { ...draft.points[0], x: draft.points[0].x + 0.1 }] : draft.points;
      const stroke = {
        id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        color: drawingColor,
        size: drawingSize,
        opacity: drawingOpacity,
        points,
        isEraser: drawingMode === "eraser"
      };

      setDoc((prev) => {
        if (drawingMode === "eraser") {
          return {
            ...prev,
            elements: prev.elements.map((el) => {
              if (el.type !== "drawing" || el.pageId !== draft.pageId) return el;
              return {
                ...el,
                strokes: el.strokes.filter((s) => {
                  for (const ePt of stroke.points) {
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
                ? { ...el, strokes: [...el.strokes, stroke], color: drawingColor, strokeWidth: drawingSize }
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
              strokes: [stroke]
            }
          ]
        };
      });

      return null;
    });
  }, [drawingColor, drawingMode, drawingOpacity, drawingSize, editable]);

  // ── PanResponder ───────────────────────────────────────────────────────────
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: (evt) => !drawingMode && (evt.nativeEvent.touches?.length ?? 0) >= 2,
        onMoveShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (evt, gs) => {
          if (drawingMode) return false;
          const touches = evt.nativeEvent.touches?.length ?? 0;
          if (touches >= 2) return true;
          if (touches === 1 && (Math.abs(gs.dx) > 1 || Math.abs(gs.dy) > 1)) {
            return true;
          }
          return !!elementInteractionRef.current;
        },

        onPanResponderGrant: (evt) => {
          if (drawingMode) return;
          const touches = evt.nativeEvent.touches ?? [];
          if (touches.length >= 2) {
            const scale = displayScaleRef.current || 1;
            const offsetX = canvasPositionRef.current.x;
            const offsetY = canvasPositionRef.current.y;
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
          if (drawingMode) return;
          const touches = evt.nativeEvent.touches ?? [];
          if (touches.length >= 2 && pinchStateRef.current) {
            const dist = touchDist(touches[0], touches[1]);
            const ratio = dist / Math.max(1, pinchStateRef.current.startDist);
            const nextZoom = clamp(pinchStateRef.current.startZoom * ratio, ZOOM_MIN, ZOOM_MAX);
            const startedAt100 = Math.abs(pinchStateRef.current.startZoom - 1) <= 0.05;
            const isPinchingIn = ratio < 1;
            if (!pinchStateRef.current.overviewTriggered && startedAt100 && isPinchingIn && nextZoom <= 0.8) {
              pinchStateRef.current = { ...pinchStateRef.current, overviewTriggered: true };
              setOverviewMode(true);
              setZoom(1);
              setCanvasPosition({ x: 0, y: 0 });
              return;
            }
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
            const scale = displayScaleRef.current || 1;
            const nextOffsetX = canvasPanStateRef.current.startOffsetX + gs.dx;
            const nextOffsetY = canvasPanStateRef.current.startOffsetY + gs.dy;
            const clampedOffset = clampCanvasOffset(nextOffsetX, nextOffsetY, scale);
            setCanvasPosition({ x: clampedOffset.x, y: clampedOffset.y });
            return;
          }

          if (!interaction) return;
          const scale = displayScaleRef.current || 1;
          const dxEl = (evt.nativeEvent.pageX - interaction.startPageX) / scale;
          const dyEl = (evt.nativeEvent.pageY - interaction.startPageY) / scale;

          setDoc((prev) => {
            const prevEl = prev.elements.find((x) => x.id === interaction.elementId) ?? null;
            if (!prevEl) return prev;
            const clampSize = (size: number) => Math.max(MIN_EL, size);

            const nextEls = prev.elements.map((cur) => {
              if (cur.id !== interaction.elementId) return cur;

              if (interaction.mode === "move") {
                return { ...cur, x: interaction.startElX + dxEl, y: interaction.startElY + dyEl };
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

        onPanResponderRelease: () => {
          elementInteractionRef.current = null;
          pinchStateRef.current = null;
          canvasPanStateRef.current = null;
        },

        onPanResponderTerminate: () => {
          elementInteractionRef.current = null;
          pinchStateRef.current = null;
          canvasPanStateRef.current = null;
        }
      }),
    [baseFitScale, clampCanvasOffset, drawingMode, pagesById, drawingSmoothness, viewportH, viewportW]
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
    setPendingFocusTextId(el.id);
  }, [addElement, defaultTextColor, doc.pageHeight, doc.pageWidth, getDefaultTargetPageId, pagesById]);

  const addHeading = useCallback(() => {
    const pageId = getDefaultTargetPageId();
    if (!pageId) return;
    const page = pagesById.get(pageId);
    const baseWidth = 360;
    const pageW = page?.width ?? doc.pageWidth;
    const y = Math.max(28, (page?.height ?? doc.pageHeight) * 0.12);
    const x = Math.max(16, (pageW - baseWidth) / 2);
    const el = createCanvasTextElement("Heading", x, y, pageId);
    addElement({
      ...el,
      width: baseWidth,
      height: 72,
      style: {
        ...el.style,
        fontSize: 36,
        bold: true,
        textColor: "#FFFFFF"
      }
    });
    setPendingFocusTextId(el.id);
  }, [addElement, doc.pageHeight, doc.pageWidth, getDefaultTargetPageId, pagesById]);

  const addImage = useCallback(async () => {
    const uri = await pickAndStoreImage("canvas-note");
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

  const reorderPages = useCallback((orderedPages: CanvasPage[]) => {
    setDoc((prev) => ({ ...prev, pages: orderedPages }));
  }, []);

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
  const showTextToolbar = !!selectedTextElement && !drawingMode;
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
  const overlayWidth = rootLayout.width || rootWindowFrame.width;
  const overlayHeight = rootLayout.height || rootWindowFrame.height;
  const toolbarWidth = Math.min(textToolbarLayout.width || 320, Math.max(220, overlayWidth - 16));
  const toolbarHeight = textToolbarLayout.height || FLOATING_TOOLBAR_H;
  const toolbarAnchorX = selectedOverlayRect ? selectedOverlayRect.x + selectedOverlayRect.width / 2 : overlayWidth / 2;
  const toolbarLeft = clamp(toolbarAnchorX - toolbarWidth / 2, 8, Math.max(8, overlayWidth - toolbarWidth - 8));
  const minToolbarTop = 62;
  const preferredToolbarTop = selectedOverlayRect ? selectedOverlayRect.y - toolbarHeight - 12 : overlayHeight - keyboardHeight - toolbarHeight - 8;
  const fallbackToolbarTop = selectedOverlayRect ? selectedOverlayRect.y + selectedOverlayRect.height + 12 : preferredToolbarTop;
  const maxToolbarTop = Math.max(minToolbarTop, overlayHeight - keyboardHeight - toolbarHeight - 8);
  const textToolbarTop = clamp(preferredToolbarTop >= minToolbarTop ? preferredToolbarTop : fallbackToolbarTop, minToolbarTop, maxToolbarTop);
  const popupTop = clamp(textToolbarTop + toolbarHeight + 8, minToolbarTop, Math.max(minToolbarTop, overlayHeight - keyboardHeight - 120));
  const renderCanvasPosition = useMemo(() => {
    const x = Number.isFinite(canvasPosition.x) ? canvasPosition.x : 0;
    const y = Number.isFinite(canvasPosition.y) ? canvasPosition.y : 0;
    const clamped = clampCanvasOffset(x, y, displayScale);
    return { x: clamped.x, y: clamped.y };
  }, [canvasPosition.x, canvasPosition.y, clampCanvasOffset, displayScale]);

  const resetZoom = useCallback(() => {
    const pageW = toPositiveNumber(currentPage.width, toPositiveNumber(doc.pageWidth, 900));
    const pageH = toPositiveNumber(currentPage.height, toPositiveNumber(doc.pageHeight, 1200));
    const center = getCenteredCanvasPosition(viewportW, viewportH, pageW, pageH, baseFitScale);
    const centered = clampCanvasOffset(center.x, center.y, baseFitScale);
    setZoom(1);
    setCanvasPosition({ x: centered.x, y: centered.y });
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [baseFitScale, clampCanvasOffset, currentPage.height, currentPage.width, doc.pageHeight, doc.pageWidth, viewportH, viewportW]);

  const toggleDrawingMode = useCallback(() => {
    if (!editable) return;
    setDrawingMode((prev) => (prev === "brush" ? null : "brush"));
    setShowShapeMenu(false);
    setShowStylePanel(false);
    setShowAlignMenu(false);
    clearSelection();
  }, [clearSelection, editable]);

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
          <Pressable style={StyleSheet.absoluteFillObject} onPress={clearSelection} />

          {pageEls.map((element) => (
            <CanvasElementView
              key={element.id}
              element={element}
              selected={editable && element.id === selectedId}
              editable={editable}
              primaryColor={colors.primary}
              surfaceElevated={colors.surfaceElevated}
              defaultTextColor={defaultTextColor}
              onSetRef={setElementRef}
              onSetInputRef={setInputRef}
              onTextFocused={handleTextFocused}
              onSelect={handleSelect}
              onMovePressIn={handleElementMovePressIn}
              onResizePressIn={handleElementResizePressIn}
              onChangeText={handleTextChange}
              onTextSizeChange={handleTextSizeChange}
            />
          ))}

          <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
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

              {drawingDraft?.pageId === page.id && drawingDraft.points.length > 1 && (
                  <Path
                    d={buildSmoothPath(drawingDraft.points)}
                    stroke={drawingColor}
                    strokeWidth={drawingSize}
                    strokeOpacity={drawingOpacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                />
              )}
            </Svg>
          </View>

          <View
            pointerEvents={drawingMode && editable ? "auto" : "none"}
            style={[StyleSheet.absoluteFillObject, styles.drawingTouchLayer]}
            onStartShouldSetResponderCapture={(evt) => !!drawingMode && editable && (evt.nativeEvent.touches?.length ?? 0) === 1}
            onMoveShouldSetResponderCapture={(evt) => !!drawingMode && editable && (evt.nativeEvent.touches?.length ?? 0) === 1}
            onResponderGrant={(evt) => {
              const x = evt.nativeEvent.locationX;
              const y = evt.nativeEvent.locationY;
              beginDrawing(page.id, x, y);
            }}
            onResponderMove={(evt) => {
              const x = evt.nativeEvent.locationX;
              const y = evt.nativeEvent.locationY;
              updateDrawing(page.id, x, y);
            }}
            onResponderRelease={endDrawing}
            onResponderTerminate={endDrawing}
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
      drawingSize,
      doc.pages,
      doc.pageHeight,
      doc.pageWidth,
      drawingsByPage,
      beginDrawing,
      endDrawing,
      clearSelection,
      handleElementMovePressIn,
      handleElementResizePressIn,
      handleSelect,
      handleTextChange,
      handleTextSizeChange,
      handleTextFocused,
      setElementRef,
      setInputRef,
      selectedId,
      sortedElements,
      updateDrawing
    ]
  );

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
      {...panResponder.panHandlers}
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
            <Pressable style={tb()} onPress={addHeading}>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>H</Text>
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
          style={[tb(), drawingMode === "brush" && styles.activeToolBtn]}
          onPress={() => toggleDrawingMode()}
          accessibilityLabel="Brush tool"
          accessibilityHint="Toggle freehand brush mode"
        >
          <Ionicons name="brush-outline" size={16} color={drawingMode === "brush" ? "#A78BFA" : colors.textPrimary} />
        </Pressable>

        {!!drawingMode && (
          <Pressable
            style={[tb(), drawingMode === "eraser" && styles.activeToolBtn]}
            onPress={() => setDrawingMode("eraser")}
            accessibilityLabel="Eraser tool"
            accessibilityHint="Switch to eraser mode"
          >
            <Ionicons name="close-circle-outline" size={16} color={drawingMode === "eraser" ? "#EF4444" : colors.textPrimary} />
          </Pressable>
        )}

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
          onPress={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
          disabled={currentPageIndex <= 0}
        >
          <Ionicons name="chevron-back" size={16} color={currentPageIndex <= 0 ? colors.textSecondary : colors.textPrimary} />
        </Pressable>
        <View style={styles.pagePill}>
          <Text muted variant="caption">{Math.min(pageCount, currentPageIndex + 1)}/{Math.max(1, pageCount)}</Text>
        </View>
        <Pressable
          style={[tb(), currentPageIndex >= pageCount - 1 && styles.disabledBtn]}
          onPress={() => setCurrentPageIndex((prev) => Math.min(Math.max(0, pageCount - 1), prev + 1))}
          disabled={currentPageIndex >= pageCount - 1}
        >
          <Ionicons name="chevron-forward" size={16} color={currentPageIndex >= pageCount - 1 ? colors.textSecondary : colors.textPrimary} />
        </Pressable>

        {drawingMode === "brush" && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.drawControlsRow}>
              {DRAW_COLORS.map((color) => {
                const active = drawingColor.toLowerCase() === color.toLowerCase();
                return (
                  <Pressable
                    key={color}
                    style={[
                      styles.drawColor,
                      { backgroundColor: color, borderColor: color === "#F9FAFB" ? "#9CA3AF" : color },
                      active && styles.drawColorActive
                    ]}
                    onPress={() => setDrawingColor(color)}
                  />
                );
              })}
              <Pressable
                style={[styles.menuBtnSmall, drawingSize <= DRAW_SIZES[0] && styles.disabledBtn]}
                onPress={() => setDrawingSize((s) => DRAW_SIZES[Math.max(0, DRAW_SIZES.indexOf(s) - 1)] ?? s)}
              >
                <Ionicons name="remove" size={16} color={colors.textPrimary} />
              </Pressable>
              <View style={[styles.textSizeChip, styles.textSizeChipPassive]}>
                <Text style={{ color: colors.textPrimary, fontSize: 12 }}>{drawingSize}px</Text>
              </View>
              <Pressable
                style={[styles.menuBtnSmall, drawingSize >= DRAW_SIZES[DRAW_SIZES.length - 1] && styles.disabledBtn]}
                onPress={() => setDrawingSize((s) => DRAW_SIZES[Math.min(DRAW_SIZES.length - 1, DRAW_SIZES.indexOf(s) + 1)] ?? s)}
              >
                <Ionicons name="add" size={16} color={colors.textPrimary} />
              </Pressable>

              <Pressable
                style={styles.menuBtnSmall}
                onPress={() => {
                  const idx = DRAW_OPACITIES.findIndex((x) => Math.abs(x - drawingOpacity) < 0.001);
                  setDrawingOpacity(DRAW_OPACITIES[(idx + 1) % DRAW_OPACITIES.length] ?? drawingOpacity);
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 11 }}>{Math.round(drawingOpacity * 100)}%</Text>
              </Pressable>

              <Pressable
                style={styles.menuBtnSmall}
                onPress={() => {
                  const idx = DRAW_SMOOTH_LEVELS.findIndex((x) => Math.abs(x - drawingSmoothness) < 0.001);
                  setDrawingSmoothness(DRAW_SMOOTH_LEVELS[(idx + 1) % DRAW_SMOOTH_LEVELS.length] ?? drawingSmoothness);
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 11 }}>S {Math.round(drawingSmoothness * 100)}</Text>
              </Pressable>

              <Pressable style={styles.menuBtnSmall} onPress={() => setDrawingMode("eraser")}>
                <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
              </Pressable>
            </View>
          </>
        )}

        {drawingMode === "eraser" && (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.drawControlsRow}>
              <Pressable
                style={[styles.menuBtnSmall, drawingSize <= DRAW_SIZES[0] && styles.disabledBtn]}
                onPress={() => setDrawingSize((s) => DRAW_SIZES[Math.max(0, DRAW_SIZES.indexOf(s) - 1)] ?? s)}
              >
                <Ionicons name="remove" size={16} color={colors.textPrimary} />
              </Pressable>
              <View style={[styles.textSizeChip, styles.textSizeChipPassive]}>
                <Text style={{ color: colors.textPrimary, fontSize: 12 }}>{drawingSize}px</Text>
              </View>
              <Pressable
                style={[styles.menuBtnSmall, drawingSize >= DRAW_SIZES[DRAW_SIZES.length - 1] && styles.disabledBtn]}
                onPress={() => setDrawingSize((s) => DRAW_SIZES[Math.min(DRAW_SIZES.length - 1, DRAW_SIZES.indexOf(s) + 1)] ?? s)}
              >
                <Ionicons name="add" size={16} color={colors.textPrimary} />
              </Pressable>
              <Pressable style={styles.menuBtnSmall} onPress={() => setDrawingMode("brush")}>
                <Ionicons name="brush-outline" size={16} color={colors.textPrimary} />
              </Pressable>
            </View>
          </>
        )}

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
            {currentPage ? renderPage(currentPage) : null}
          </View>
        </View>
      </ScrollView>

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
          setIsDraggingPage(false);
        }}
      >
        <View style={styles.overviewModalRoot}>
          <Pressable
            style={styles.overviewBackdrop}
            onPress={() => {
              setSelectedPageId(null);
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
                const page = doc.pages?.[index];
                if (page) setSelectedPageId(page.id);
                setIsDraggingPage(true);
              }}
              onDragEnd={({ data, to }) => {
                reorderPages(data);
                const next = data[to];
                if (next) {
                  setSelectedPageId(next.id);
                  setCurrentPageIndex(to);
                }
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
                    onLongPress={() => {
                      setSelectedPageId(item.id);
                      drag();
                    }}
                    delayLongPress={220}
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
                    <View style={styles.overviewThumbInnerRow}>
                      <View style={styles.overviewThumbPage} />
                    </View>
                    <View style={styles.overviewRowMeta}>
                      <Text variant="subtitle" numberOfLines={1}>{title}</Text>
                      <Text muted variant="caption">{Math.round(item.width)} × {Math.round(item.height)}</Text>
                    </View>
                    <Pressable
                      onLongPress={() => {
                        setSelectedPageId(item.id);
                        drag();
                      }}
                      delayLongPress={120}
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

      <View pointerEvents="box-none" style={styles.overlayLayer}>
        {showTextToolbar && (
          <>
            <View
              style={[
                styles.bottomTextToolbarWrap,
                {
                  left: toolbarLeft,
                  top: textToolbarTop,
                  width: toolbarWidth
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

              <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />

              <Pressable
                style={[styles.menuBtnSmall, showStylePanel && styles.activeBtn]}
                onPress={() => {
                  setShowAlignMenu(false);
                  setShowStylePanel((v) => !v);
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>aA</Text>
              </Pressable>

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
    overflow: "hidden",
    backgroundColor: "#1a1a1a"
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
    zIndex: 120
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
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#121722",
    alignItems: "center",
    justifyContent: "center"
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
