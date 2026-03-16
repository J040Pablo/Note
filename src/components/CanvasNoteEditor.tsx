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
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
  Image
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import type { CanvasElement, CanvasNoteDocument, CanvasPage, ID } from "@models/types";
import { pickAndStoreImage } from "@utils/mediaPicker";
import {
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
const ZOOM_MAX = 2.5;
const PAGE_GAP = 18;
const HISTORY_LIMIT = 80;
const FLOATING_TOOLBAR_H = 46;
const FONT_FAMILIES = ["System", "sans-serif", "serif", "monospace"] as const;
const TEXT_COLORS = ["#111827", "#FFFFFF", "#EF4444", "#3B82F6", "#22C55E", "#EAB308", "#EC4899"];
const TEXT_SIZE_PRESETS = [12, 14, 16, 18, 21, 24, 28, 32, 40, 48];

type InteractionMode = "move" | "resize";
type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface CanvasNoteEditorProps {
  value: string;
  onChangeText: (value: string) => void;
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
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const getMaxZ = (els: CanvasElement[]) => els.reduce((acc, el) => Math.max(acc, el.zIndex ?? 0), 0);
const cloneDoc = (doc: CanvasNoteDocument): CanvasNoteDocument => JSON.parse(JSON.stringify(doc)) as CanvasNoteDocument;
const touchDist = (a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) =>
  Math.sqrt((a.pageX - b.pageX) ** 2 + (a.pageY - b.pageY) ** 2);
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
    const handlePress = useCallback(() => onSelect(element.id), [element.id, onSelect]);
    const handlePressIn = useCallback(
      (evt: GestureResponderEvent) => onMovePressIn(element, evt),
      [element, onMovePressIn]
    );
    const handleText = useCallback(
      (t: string) => onChangeText(element.id, t),
      [element.id, onChangeText]
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
          editable={selected}
          onFocus={() => {
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

        {selected && (
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

export const CanvasNoteEditor: React.FC<CanvasNoteEditorProps> = ({ value, onChangeText }) => {
  const { theme } = useTheme();
  const isDark = !!(theme as { dark?: boolean }).dark;
  const defaultTextColor = isDark ? "#FFFFFF" : "#111827";

  // ── Document state ─────────────────────────────────────────────────────────
  const [doc, setDoc] = useState<CanvasNoteDocument>(() => {
    const parsed = parseCanvasNoteContent(value);
    return { ...parsed, zoom: 1, offsetX: parsed.offsetX ?? 0, offsetY: parsed.offsetY ?? 0 };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [viewportW, setViewportW] = useState(0);
  const [historyTick, setHistoryTick] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [scrollAreaY, setScrollAreaY] = useState(0);
  const [rootLayout, setRootLayout] = useState({ width: 0, height: 0 });
  const [rootWindowFrame, setRootWindowFrame] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [selectedOverlayRect, setSelectedOverlayRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [textToolbarLayout, setTextToolbarLayout] = useState({ width: 320, height: FLOATING_TOOLBAR_H });
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [pendingFocusTextId, setPendingFocusTextId] = useState<string | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const docRef = useRef(doc);
  docRef.current = doc;

  const elementInteractionRef = useRef<ElementInteraction | null>(null);
  const pinchStateRef = useRef<PinchState | null>(null);
  const rootRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const elementRefs = useRef<Record<string, View | null>>({});
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const undoStackRef = useRef<CanvasNoteDocument[]>([]);
  const redoStackRef = useRef<CanvasNoteDocument[]>([]);
  const displayScaleRef = useRef(1);

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

  // Sync external value
  useEffect(() => {
    const norm = serializeCanvasNoteContent(parseCanvasNoteContent(value));
    if (norm !== lastSerializedRef.current) {
      const parsed = parseCanvasNoteContent(value);
      // Always normalize to zoom = 1 when loading from storage
      setDoc({ ...parsed, zoom: 1, offsetX: parsed.offsetX ?? 0, offsetY: parsed.offsetY ?? 0 });
      lastSerializedRef.current = norm;
      undoStackRef.current = [];
      redoStackRef.current = [];
      notifyHistoryChanged();
    }
  }, [notifyHistoryChanged, value]);

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
    const targetWidth = Math.max(220, viewportW - 24);
    const pageW = doc.pageWidth || 1;
    return clamp(targetWidth / pageW, 0.2, 2.5);
  }, [doc.pageWidth, viewportW]);

  const displayScale = useMemo(() => clamp(baseFitScale * doc.zoom, 0.2, 4), [baseFitScale, doc.zoom]);
  displayScaleRef.current = displayScale;

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
        const nextRoot = { x: rootX, y: rootY, width: rootWidth, height: rootHeight };
        setRootWindowFrame((prev) =>
          Math.abs(prev.x - rootX) < 0.5 &&
          Math.abs(prev.y - rootY) < 0.5 &&
          Math.abs(prev.width - rootWidth) < 0.5 &&
          Math.abs(prev.height - rootHeight) < 0.5
            ? prev
            : nextRoot
        );
        const elementNode = elementRefs.current[selectedTextElement.id];
        elementNode?.measureInWindow((x, y, width, height) => {
          const nextRect = { x: x - rootX, y: y - rootY, width, height };
          setSelectedOverlayRect((prev) => (sameRect(prev, nextRect) ? prev : nextRect));
        });
      });
    });
  }, [doc.zoom, doc.offsetX, doc.offsetY, rootLayout.height, rootLayout.width, scrollY, selectedTextElement]);

  const getDefaultTargetPageId = useCallback((): ID | null => {
    if (selectedElement) return selectedElement.pageId;
    return doc.pages?.[doc.pages.length - 1]?.id ?? doc.pages?.[0]?.id ?? null;
  }, [doc.pages, selectedElement]);

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
      setSelectedId(id);
      bringToFront(id);
    },
    [bringToFront]
  );

  const beginInteraction = useCallback(
    (el: CanvasElement, mode: InteractionMode, evt: GestureResponderEvent, handle?: ResizeHandle) => {
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
    [bringToFront, pushUndoSnapshot]
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
      updateElement(id, (prev) => (prev.type === "text" ? { ...prev, text } : prev));
    },
    [updateElement]
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

  // ── PanResponder ───────────────────────────────────────────────────────────
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: (evt) => (evt.nativeEvent.touches?.length ?? 0) >= 2,
        onMoveShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (evt, gs) => {
          const touches = evt.nativeEvent.touches?.length ?? 0;
          if (touches >= 2) return true;
          return (Math.abs(gs.dx) > 1 || Math.abs(gs.dy) > 1) && !!elementInteractionRef.current;
        },

        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches ?? [];
          if (touches.length >= 2) {
            const scale = displayScaleRef.current || 1;
            const offsetX = docRef.current.offsetX ?? 0;
            const offsetY = docRef.current.offsetY ?? 0;
            const midX = (touches[0].pageX + touches[1].pageX) / 2;
            const midY = (touches[0].pageY + touches[1].pageY) / 2;
            const localX = midX;
            const localY = midY - scrollAreaY + scrollY;
            pinchStateRef.current = {
              startDist: touchDist(touches[0], touches[1]),
              startZoom: docRef.current.zoom,
              anchorX: (localX - offsetX) / scale,
              anchorY: (localY - offsetY) / scale
            };
            elementInteractionRef.current = null;
          }
          setScrollEnabled(false);
        },

        onPanResponderMove: (evt, gs: PanResponderGestureState) => {
          const touches = evt.nativeEvent.touches ?? [];
          if (touches.length >= 2 && pinchStateRef.current) {
            const dist = touchDist(touches[0], touches[1]);
            const ratio = dist / Math.max(1, pinchStateRef.current.startDist);
            const nextZoom = clamp(pinchStateRef.current.startZoom * ratio, ZOOM_MIN, ZOOM_MAX);
            const nextScale = clamp(baseFitScale * nextZoom, 0.2, 4);
            const midX = (touches[0].pageX + touches[1].pageX) / 2;
            const midY = (touches[0].pageY + touches[1].pageY) / 2;
            const localX = midX;
            const localY = midY - scrollAreaY + scrollY;

            const nextOffsetX = localX - pinchStateRef.current.anchorX * nextScale;
            const nextOffsetY = localY - pinchStateRef.current.anchorY * nextScale;

            setDoc((prev) => ({
              ...prev,
              zoom: nextZoom,
              offsetX: nextOffsetX,
              offsetY: nextOffsetY
            }));
            return;
          }

          const interaction = elementInteractionRef.current;
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
          setScrollEnabled(true);
        },

        onPanResponderTerminate: () => {
          elementInteractionRef.current = null;
          pinchStateRef.current = null;
          setScrollEnabled(true);
        }
      }),
    [baseFitScale, pagesById, scrollAreaY, scrollY]
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

  // ── Render ─────────────────────────────────────────────────────────────────
  const { colors } = theme;
  const sortedElements = useMemo(
    () => [...doc.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)),
    [doc.elements]
  );

  const tb = () => styles.toolBtn;
  const canUndo = useMemo(() => undoStackRef.current.length > 0, [historyTick]);
  const canRedo = useMemo(() => redoStackRef.current.length > 0, [historyTick]);
  const isTextMode = !!selectedTextElement;
  const showTextToolbar = !!selectedTextElement;
  const selectedTextStyle = selectedTextElement?.style ?? {};
  const selectedTextColor = selectedTextStyle.textColor ?? defaultTextColor;
  const selectedFontFamily = selectedTextStyle.fontFamily ?? "System";
  const selectedFontSize = selectedTextStyle.fontSize ?? 18;
  const showSelectionDelete = !!selectedId;
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

  const resetZoom = useCallback(() => {
    setDoc((prev) => ({ ...prev, zoom: 1, offsetX: 0, offsetY: 0 }));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const renderPage = useCallback(
    (page: CanvasPage, index: number) => {
      const pageEls = sortedElements.filter((el) => el.pageId === page.id);
      const scaledW = page.width * displayScale;
      const scaledH = page.height * displayScale;
      const isFirst = index === 0;
      const isLast = index === (doc.pages?.length ?? 1) - 1;
      const canDeletePage = (doc.pages?.length ?? 0) > 1;
      return (
        <View key={page.id} style={{ alignItems: "center", marginBottom: PAGE_GAP, width: scaledW }}>
          <View style={[styles.pageActions, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}> 
            <Pressable
              style={[styles.pageActionBtn, isFirst && styles.disabledBtn]}
              onPress={() => movePage(page.id, -1)}
              disabled={isFirst}
            >
              <Ionicons name="arrow-up-outline" size={14} color={isFirst ? colors.textSecondary : colors.textPrimary} />
            </Pressable>
            <Pressable
              style={[styles.pageActionBtn, isLast && styles.disabledBtn]}
              onPress={() => movePage(page.id, 1)}
              disabled={isLast}
            >
              <Ionicons name="arrow-down-outline" size={14} color={isLast ? colors.textSecondary : colors.textPrimary} />
            </Pressable>
            <Pressable
              style={[styles.pageActionBtn, !canDeletePage && styles.disabledBtn]}
              onPress={() => deletePage(page.id)}
              disabled={!canDeletePage}
            >
              <Ionicons name="trash-outline" size={14} color={canDeletePage ? "#EF4444" : colors.textSecondary} />
            </Pressable>
          </View>

          <View
            style={[
              styles.page,
              {
                width: scaledW,
                height: scaledH,
                backgroundColor: page.backgroundColor ?? (isDark ? "#0b1220" : "#FFFFFF"),
                borderColor: colors.border
              }
            ]}
          >
            <Pressable style={StyleSheet.absoluteFillObject} onPress={clearSelection} />

            <View
              style={{
                position: "absolute",
                left: -((page.width * (1 - displayScale)) / 2),
                top: -((page.height * (1 - displayScale)) / 2),
                width: page.width,
                height: page.height,
                transform: [{ scale: displayScale }]
              }}
            >
              {pageEls.map((element) => (
                <CanvasElementView
                  key={element.id}
                  element={element}
                  selected={element.id === selectedId}
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
            </View>
          </View>

          <Text muted variant="caption" style={styles.pageLabel}>
            Page {index + 1}
          </Text>
        </View>
      );
    },
    [
      colors.border,
      colors.primary,
      colors.surfaceElevated,
      defaultTextColor,
      displayScale,
      doc.pages,
      deletePage,
      clearSelection,
      handleElementMovePressIn,
      handleElementResizePressIn,
      handleSelect,
      handleTextChange,
      handleTextSizeChange,
      handleTextFocused,
      isDark,
      movePage,
      setElementRef,
      setInputRef,
      selectedId,
      sortedElements
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
      <View style={[styles.topBar, { borderColor: colors.border, backgroundColor: colors.surfaceElevated }]}>
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
            <Pressable style={tb()} onPress={addPage}>
              <Ionicons name="document-text-outline" size={16} color={colors.textPrimary} />
            </Pressable>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        )}

        <Pressable style={[tb(), !canUndo && styles.disabledBtn]} onPress={handleUndo} disabled={!canUndo}>
          <Ionicons name="arrow-undo-outline" size={16} color={canUndo ? colors.textPrimary : colors.textSecondary} />
        </Pressable>
        <Pressable style={[tb(), !canRedo && styles.disabledBtn]} onPress={handleRedo} disabled={!canRedo}>
          <Ionicons name="arrow-redo-outline" size={16} color={canRedo ? colors.textPrimary : colors.textSecondary} />
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable style={styles.zoomResetBtn} onPress={resetZoom}>
          <Text variant="caption" muted style={styles.zoomLabel}>
            {Math.round(doc.zoom * 100)}%
          </Text>
        </Pressable>

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

      <ScrollView
        ref={(n) => {
          scrollRef.current = n;
        }}
        scrollEnabled={scrollEnabled}
        contentContainerStyle={styles.pagesContent}
        keyboardShouldPersistTaps="handled"
        onLayout={(e: LayoutChangeEvent) => {
          const { width, y } = e.nativeEvent.layout;
          setViewportW((prev) => (Math.abs(prev - width) < 0.5 ? prev : width));
          setScrollAreaY((prev) => (Math.abs(prev - y) < 0.5 ? prev : y));
        }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const nextY = e.nativeEvent.contentOffset.y;
          setScrollY((prev) => (Math.abs(prev - nextY) < 0.5 ? prev : nextY));
        }}
        scrollEventThrottle={16}
      >
        <View
          style={{
            transform: [{ translateX: doc.offsetX ?? 0 }, { translateY: doc.offsetY ?? 0 }]
          }}
        >
          {(doc.pages ?? []).map(renderPage)}
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
  root: { flex: 1, gap: 6, marginTop: 8 },
  topBar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4
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
  pagesContent: {
    paddingTop: 6,
    paddingBottom: 24,
    alignItems: "center"
  },
  page: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    overflow: "hidden"
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
  shapeModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    justifyContent: "flex-start",
    paddingTop: 76,
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
