import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  PenTool,
  LayoutGrid,
  Undo,
  Redo,
  Maximize2,
  Monitor,
  Hammer,
  Shapes,
  CloudUpload,
  Type as TypeIcon,
  LayoutTemplate,
  Hand
} from "lucide-react";
import { 
  CanvasNoteDocument, 
  CanvasElement,
  CanvasPage,
  ID,
  DrawingPoint,
  DrawingStroke,
  CanvasDrawingElement,
  createCanvasDrawingElement,
  createCanvasTextElement,
  createCanvasImageElement,
  createCanvasShapeElement,
  createCanvasPage,
  makeId,
  DEFAULT_PAGE_W,
  DEFAULT_PAGE_H
} from "../../../utils/noteContent";
import CanvasElementNode from "./CanvasElementNode";
import PagesModal from "./PagesModal";
import EditorTopBar from "./CanvasEditor/EditorTopBar";
import UnifiedSidebar, { SidebarTab } from "./CanvasEditor/UnifiedSidebar";
import DrawMenu from "./CanvasEditor/DrawMenu/DrawMenu";
import CanvasWorkspace from "./CanvasEditor/CanvasWorkspace";
import BottomBar from "./CanvasEditor/BottomBar";
import { exportNotePackage } from "../../../services/folderPackageService";
import styles from "./CanvasEditor.module.css";

export type CanvasTool = "select" | "text" | "image" | "draw" | "pan";

type Props = {
  document: CanvasNoteDocument;
  onChange: (doc: CanvasNoteDocument) => void;
  onInteractionChange?: (isInteracting: boolean) => void;
  // TopBar Hooks
  title?: string;
  onTitleChange?: (t: string) => void;
  onTitleBlur?: () => void;
  onBack?: () => void;
  saving?: boolean;
  folderName?: string | null;
  noteId?: string; // Real note ID for global export
};

const HISTORY_LIMIT = 80;
const ZOOM_MIN = 0.25;   // 25% minimum
const ZOOM_MAX = 3.0;    // 300% maximum
const ZOOM_STEP = 0.05;  // 5% per wheel tick
const MAX_STROKE_STEP = 2.5;

const buildSmoothSvgPath = (points: DrawingPoint[]): string => {
  if (!points.length) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    
    if (i === 0) {
      d += ` L ${midX} ${midY}`;
    } else {
      const p0 = points[i - 1];
      d += ` Q ${p1.x} ${p1.y}, ${midX} ${midY}`;
    }
    
    if (i === points.length - 2) {
      d += ` L ${p2.x} ${p2.y}`;
    }
  }
  return d;
};

const CanvasEditor: React.FC<Props> = ({ 
  document: initialDocument, 
  onChange, 
  onInteractionChange,
  title,
  onTitleChange,
  onTitleBlur,
  onBack,
  saving,
  folderName,
  noteId
}) => {
  // --- States ---
  const [localDoc, setLocalDoc] = useState<CanvasNoteDocument>(initialDocument);
  const [isDownloading, setIsDownloading] = useState(false);
  const [zoom, setZoom] = useState(0.85);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Unified tool state
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [activeTab, setActiveTab] = useState<SidebarTab>("select");
  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Brush settings
  const [strokeSettings, setStrokeSettings] = useState({
    color: "#1d4ed8",
    size: 4,
    opacity: 1
  });

  const [pagesModalOpen, setPagesModalOpen] = useState(false);
  const [liveStrokePath, setLiveStrokePath] = useState<string | null>(null);

  // --- Interaction Tracking ---
  const [interactionCount, setInteractionCount] = useState(0);

  const startInteraction = useCallback(() => {
    setInteractionCount(prev => {
      if (prev === 0) onInteractionChange?.(true);
      return prev + 1;
    });
  }, [onInteractionChange]);

  const endInteraction = useCallback(() => {
    setInteractionCount(prev => {
      const next = Math.max(0, prev - 1);
      if (next === 0) onInteractionChange?.(false);
      return next;
    });
  }, [onInteractionChange]);

  // --- History ---
  const undoStackRef = useRef<CanvasNoteDocument[]>([]);
  const redoStackRef = useRef<CanvasNoteDocument[]>([]);

  // --- Refs ---
  const viewportRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localDocRef = useRef(localDoc);
  const currentStrokeRef = useRef<DrawingPoint[] | null>(null);
  const pendingDrawPointsRef = useRef<DrawingPoint[]>([]);
  const drawRafRef = useRef<number | null>(null);
  const drawPointerIdRef = useRef<number | null>(null);
  const drawPageIdRef = useRef<string | null>(null);
  localDocRef.current = localDoc;

  const flushDrawFrame = useCallback(() => {
    const stroke = currentStrokeRef.current;
    if (!stroke || pendingDrawPointsRef.current.length === 0) return;

    let last = stroke[stroke.length - 1] ?? null;
    const pending = pendingDrawPointsRef.current;
    pendingDrawPointsRef.current = [];

    for (const point of pending) {
      if (!last) {
        stroke.push(point);
        last = point;
        continue;
      }
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.15) continue;
      if (dist > MAX_STROKE_STEP) {
        const steps = Math.max(2, Math.ceil(dist / MAX_STROKE_STEP));
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps;
          stroke.push({
            x: last.x + dx * t,
            y: last.y + dy * t
          });
        }
      } else {
        stroke.push(point);
      }
      last = stroke[stroke.length - 1] ?? point;
    }

    setLiveStrokePath(buildSmoothSvgPath(stroke));
  }, []);

  const scheduleDrawFrame = useCallback(() => {
    if (drawRafRef.current != null) return;
    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null;
      flushDrawFrame();
      if (pendingDrawPointsRef.current.length > 0) {
        scheduleDrawFrame();
      }
    });
  }, [flushDrawFrame]);

  // --- Logic ---
  const currentPage = useMemo(() => {
    const fallbackPage = localDoc.pages[0];
    const rawPage = localDoc.pages[localDoc.currentPageIndex] || fallbackPage;
    if (!rawPage) {
      return createCanvasPage(localDoc.pageWidth || DEFAULT_PAGE_W, localDoc.pageHeight || DEFAULT_PAGE_H);
    }
    return {
      ...rawPage,
      width: rawPage.width || localDoc.pageWidth || DEFAULT_PAGE_W,
      height: rawPage.height || localDoc.pageHeight || DEFAULT_PAGE_H,
      drawings: Array.isArray(rawPage.drawings) ? rawPage.drawings : []
    };
  }, [localDoc.pages, localDoc.currentPageIndex]);

  // Debounce autosave logic
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const notifyChange = useCallback((newDoc: CanvasNoteDocument) => {
    setLocalDoc(newDoc);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onChange(newDoc);
      debounceTimerRef.current = null;
    }, 220);
  }, [onChange]);

  const pushUndo = useCallback(() => {
    undoStackRef.current.push(JSON.parse(JSON.stringify(localDocRef.current)));
    if (undoStackRef.current.length > HISTORY_LIMIT) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, []);

  const handleUndo = () => {
    const prev = undoStackRef.current.pop();
    if (prev) {
      redoStackRef.current.push(JSON.parse(JSON.stringify(localDocRef.current)));
      setLocalDoc(prev);
      onChange(prev);
    }
  };

  const handleRedo = () => {
    const next = redoStackRef.current.pop();
    if (next) {
      undoStackRef.current.push(JSON.parse(JSON.stringify(localDocRef.current)));
      setLocalDoc(next);
      onChange(next);
    }
  };

  const clampPan = useCallback((p: {x: number, y: number}, currentZoom: number) => {
    if (!viewportRef.current) return p;
    const { width, height } = viewportRef.current.getBoundingClientRect();
    const canvasBoundW = 5000 * currentZoom;
    const canvasBoundH = 5000 * currentZoom;
    
    // We want to keep at least 100px of the canvas visible at all times
    const minX = -canvasBoundW + 100;
    const maxX = width - 100;
    const minY = -canvasBoundH + 100;
    const maxY = height - 100;

    return {
      x: Math.max(minX, Math.min(maxX, p.x)),
      y: Math.max(minY, Math.min(maxY, p.y))
    };
  }, []);

  // --- Centering Logic --- (dynamic, bounding-box based)
  const centerCanvas = useCallback(() => {
    if (!viewportRef.current) return;
    const { width, height } = viewportRef.current.getBoundingClientRect();

    const pages = localDoc.pages;
    if (!pages.length) return;

    // Compute total document height + width across all stacked pages
    const PAGE_GAP = 60;
    const INIT_TOP = 100;
    const pageW = pages[0].width;
    let totalH = INIT_TOP;
    pages.forEach((p, i) => {
      totalH += p.height + (i < pages.length - 1 ? PAGE_GAP : 0);
    });

    // Pick a zoom that fits the widest page with comfortable margin
    const fitZoom = Math.min(
      Math.max(ZOOM_MIN, (width - 120) / pageW),
      ZOOM_MAX,
      0.9
    );

    // Pan so the center of the document lands in the center of the viewport.
    // Pages are placed inside the 5000×5000 canvas starting at left=2500-pageW/2.
    const docCenterX = 2500; // pages are centered horizontally in canvas
    const docCenterY = INIT_TOP + totalH / 2;

    const targetPanX = width  / 2 - docCenterX * fitZoom;
    const targetPanY = height / 2 - docCenterY * fitZoom;

    setZoom(fitZoom);
    setPan({ x: targetPanX, y: targetPanY });
  }, [localDoc.pages]);

  useEffect(() => {
    if (localDoc.pages.length > 0) return;
    notifyChange({
      ...localDoc,
      pages: [createCanvasPage(localDoc.pageWidth || DEFAULT_PAGE_W, localDoc.pageHeight || DEFAULT_PAGE_H)],
      currentPageIndex: 0
    });
  }, [localDoc, notifyChange]);

  useEffect(() => {
    centerCanvas();
    window.addEventListener("resize", centerCanvas);
    return () => window.removeEventListener("resize", centerCanvas);
  }, [centerCanvas]);

  // --- Live Sync Refresh ---
  const lastAcknowledgedDocRef = useRef(initialDocument);

  useEffect(() => {
    // If the input prop hasn't changed since we last acknowledged it, do nothing.
    if (initialDocument === lastAcknowledgedDocRef.current) return;
    
    // If the incoming doc matches our current local doc, it means our local
    // change was acknowledged/saved. Update the ref and do nothing else.
    if (initialDocument === localDocRef.current) {
      lastAcknowledgedDocRef.current = initialDocument;
      return;
    }

    // Safety: ignore external updates if we have unsaved local changes 
    // or are in the middle of a gesture.
    const isDirty = localDocRef.current !== lastAcknowledgedDocRef.current;
    if (isDirty || isPanning || isDrawing || interactionCount > 0) return;

    lastAcknowledgedDocRef.current = initialDocument;
    setLocalDoc(initialDocument);
  }, [initialDocument, isPanning, isDrawing, interactionCount]);

  // --- Pan & Zoom Engine ---
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const currentZoom = zoomRef.current; // always fresh, no stale closure

      if (e.ctrlKey || e.metaKey) {
        // Multiplicative zoom centred on cursor — smooth 5% steps
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05;
        const nextZoom = Math.min(Math.max(ZOOM_MIN, currentZoom * factor), ZOOM_MAX);

        if (nextZoom !== currentZoom) {
          const ratio = nextZoom / currentZoom;
          zoomRef.current = nextZoom;           // update ref immediately
          setZoom(nextZoom);
          setPan(prev => clampPan({
            x: mouseX - (mouseX - prev.x) * ratio,
            y: mouseY - (mouseY - prev.y) * ratio
          }, nextZoom));
        }
      } else {
        // Plain scroll → pan
        setPan(prev => clampPan({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY
        }, currentZoom));
      }
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoom]);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Always deselect when clicking on the background (viewport, workspace, or page background)
    const isBackground = e.target === viewportRef.current || 
                        e.target === workspaceRef.current || 
                        (e.target as HTMLElement).classList.contains(styles.pageBackground);
    
    if (isBackground) {
      setSelectedId(null);
      
      if (activeTool === "pan" || activeTool === "select") {
        setIsPanning(true);
        startInteraction();
        viewportRef.current?.setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan(prev => clampPan({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }, zoom));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
      endInteraction();
      viewportRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  // --- Element Interactions ---
  const handleElementUpdate = (id: string, updates: Partial<CanvasElement>) => {
    notifyChange({
      ...localDoc,
      elements: localDoc.elements.map(el => el.id === id ? { ...el, ...updates } as CanvasElement : el)
    });
  };

  const handleElementDelete = (id: string) => {
    pushUndo();
    notifyChange({
      ...localDoc,
      elements: localDoc.elements.filter(el => el.id !== id)
    });
    setSelectedId(null);
  };

  const handleElementDuplicate = useCallback((id: string) => {
    const el = localDoc.elements.find(e => e.id === id);
    if (!el) return;
    
    const maxZ = localDoc.elements.reduce((acc, current) => Math.max(acc, current.zIndex || 0), 0);
    const newEl = {
      ...JSON.parse(JSON.stringify(el)),
      id: makeId(),
      x: el.x + 20,
      y: el.y + 20,
      zIndex: maxZ + 1
    };
    
    pushUndo();
    notifyChange({
      ...localDoc,
      elements: [...localDoc.elements, newEl]
    });
    setSelectedId(newEl.id);
  }, [localDoc, notifyChange, pushUndo]);

  const handleAddElement = (type: "text" | "image" | "shape", shapeType?: import("../../../utils/noteContent").CanvasShapeType) => {
    pushUndo();
    const pageId = currentPage.id;
    const centerX = currentPage.width / 2 - 125;
    const centerY = currentPage.height / 2 - 30;
    const maxZ = localDoc.elements.reduce((acc, current) => Math.max(acc, current.zIndex || 0), 0);
    
    let newEl: CanvasElement;
    if (type === "text") newEl = createCanvasTextElement("New Text", centerX, centerY, pageId, maxZ + 1);
    else if (type === "shape") newEl = createCanvasShapeElement(shapeType || "rectangle", "#6366f1", centerX, centerY, pageId, maxZ + 1);
    else {
      fileInputRef.current?.click();
      return;
    }

    const nextDoc = { ...localDoc, elements: [...localDoc.elements, newEl] };
    notifyChange(nextDoc);
    setSelectedId(newEl.id);
    setActiveTool("select"); // Switch to select after adding
    setActiveTab("select");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxWidth = 300;
        const ratio = img.width / img.height;
        const w = img.width > maxWidth ? maxWidth : img.width;
        const h = img.width > maxWidth ? maxWidth / ratio : img.height;

        const maxZ = localDoc.elements.reduce((acc, current) => Math.max(acc, current.zIndex || 0), 0);
        const newImg = createCanvasImageElement(base64, currentPage.width / 2 - w/2, currentPage.height / 2 - h/2, currentPage.id, maxZ + 1);
        newImg.width = w;
        newImg.height = h;

        pushUndo();
        notifyChange({ ...localDoc, elements: [...localDoc.elements, newImg] });
        setSelectedId(newImg.id);
        setActiveTool("select");
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDrawStart = (e: React.PointerEvent<HTMLDivElement>, pageId?: string) => {
    if (activeTool !== "draw") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    
    drawPointerIdRef.current = e.pointerId;
    drawPageIdRef.current = pageId || localDoc.pages[localDoc.currentPageIndex]?.id || null;
    currentStrokeRef.current = [{ x, y }];
    pendingDrawPointsRef.current = [];
    setLiveStrokePath(buildSmoothSvgPath([{ x, y }]));
    
    setIsDrawing(true);
    startInteraction();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDrawMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== "draw" || drawPointerIdRef.current !== e.pointerId || !currentStrokeRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nativeEvt = e.nativeEvent as PointerEvent;
    const coalesced = typeof nativeEvt.getCoalescedEvents === "function" ? nativeEvt.getCoalescedEvents() : [nativeEvt];
    for (const evt of coalesced) {
      pendingDrawPointsRef.current.push({
        x: (evt.clientX - rect.left) / zoom,
        y: (evt.clientY - rect.top) / zoom
      });
    }
    scheduleDrawFrame();
  };

  const handleDrawEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== "draw" || drawPointerIdRef.current !== e.pointerId || !currentStrokeRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    drawPointerIdRef.current = null;
    
    if (drawRafRef.current != null) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = null;
    }
    flushDrawFrame();
    
    const strokePoints = currentStrokeRef.current;
    if (strokePoints && strokePoints.length >= 2) {
      const newStroke: DrawingStroke = {
        id: makeId(),
        color: strokeSettings.color,
        size: strokeSettings.size,
        opacity: strokeSettings.opacity,
        points: strokePoints
      };

      const nextElements = [...localDoc.elements];
      const pageId = drawPageIdRef.current || localDoc.pages[localDoc.currentPageIndex]?.id;
      
      const existingIdx = nextElements.findIndex(el => 
        el.type === "drawing" && el.pageId === pageId && el.x === 0 && el.y === 0
      );

      if (existingIdx >= 0) {
        const el = nextElements[existingIdx] as CanvasDrawingElement;
        nextElements[existingIdx] = {
          ...el,
          strokes: [...el.strokes, newStroke]
        };
      } else {
        const page = localDoc.pages.find(p => p.id === pageId);
        const newEl = createCanvasDrawingElement(
          0, 0, 
          page?.width || localDoc.pageWidth, 
          page?.height || localDoc.pageHeight, 
          pageId as string, 
          0
        );
        newEl.strokes = [newStroke];
        nextElements.push(newEl);
      }
      
      notifyChange({ ...localDoc, elements: nextElements });
    }
    
    currentStrokeRef.current = null;
    pendingDrawPointsRef.current = [];
    setLiveStrokePath(null);
    setIsDrawing(false);
    endInteraction();
  };

  useEffect(() => {
    return () => {
      if (drawRafRef.current != null) {
        cancelAnimationFrame(drawRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeTool !== "draw") {
      if (drawRafRef.current != null) {
        cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
      drawPointerIdRef.current = null;
      currentStrokeRef.current = null;
      pendingDrawPointsRef.current = [];
      setLiveStrokePath(null);
      if (isDrawing) {
        setIsDrawing(false);
        endInteraction();
      }
    }
  }, [activeTool, isDrawing, endInteraction]);

  const onDeletePage = useCallback((index: number) => {
    const nextPages = localDoc.pages.filter((_, i) => i !== index);
    const pageId = localDoc.pages[index].id;
    const nextElements = localDoc.elements.filter(el => el.pageId !== pageId);
    
    let nextIdx = localDoc.currentPageIndex;
    if (nextIdx >= nextPages.length) nextIdx = Math.max(0, nextPages.length - 1);
    
    pushUndo();
    notifyChange({
      ...localDoc,
      pages: nextPages,
      elements: nextElements,
      currentPageIndex: nextIdx
    });
  }, [localDoc, notifyChange, pushUndo]);

  const onMovePage = useCallback((index: number, direction: "up" | "down") => {
    const nextPages = [...localDoc.pages];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= nextPages.length) return;
    
    [nextPages[index], nextPages[target]] = [nextPages[target], nextPages[index]];
    
    let nextIdx = localDoc.currentPageIndex;
    if (nextIdx === index) nextIdx = target;
    else if (nextIdx === target) nextIdx = index;

    pushUndo();
    notifyChange({
      ...localDoc,
      pages: nextPages,
      currentPageIndex: nextIdx
    });
  }, [localDoc, notifyChange, pushUndo]);

  const handleDownload = useCallback(async () => {
    if (!noteId) {
      alert("Note not ready for export. Wait for it to be saved.");
      return;
    }
    
    setIsDownloading(true);
    try {
      await exportNotePackage(noteId);
    } catch (err) {
      console.error("[canvas-export] failed", err);
      alert("Falha ao gerar o arquivo de backup. Tente novamente.");
    } finally {
      setIsDownloading(false);
    }
  }, [noteId]);

  return (
    <div className={styles.editorContainer}>

      {/* ── Full-width TopBar ─────────────────────────────────────── */}
      <EditorTopBar 
        title={title || ""}
        onTitleChange={onTitleChange || (() => {})}
        onTitleBlur={onTitleBlur || (() => {})}
        onBack={onBack || (() => {})}
        folderName={folderName}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStackRef.current.length > 0}
        canRedo={redoStackRef.current.length > 0}
        isSaving={saving || (debounceTimerRef.current !== null)}
        isDownloading={isDownloading}
        onDownload={handleDownload}
      />

      {/* ── Body row: Sidebar | Canvas ────────────────────────────── */}
      <div className={styles.bodyRow}>
        <UnifiedSidebar
          activeTab={activeTab}
          onTabChange={(tab: SidebarTab) => {
            setActiveTab(tab);
            if (tab === "draw") {
              // Entering tools menu doesn't auto-activate draw tool unless explicit
              // If we want it to stay on current tool, just do nothing.
              // We reset to select to avoid confusion if previous tool is unknown
              if (activeTool === "draw" || activeTool === "pan") {
                 setActiveTool("select");
              }
            } else if (["select", "pan"].includes(tab)) {
               setActiveTool(tab as CanvasTool);
            } else {
               setActiveTool("select");
            }
          }}
          onImageUploadClick={() => fileInputRef.current?.click()}
          onAddElement={handleAddElement}
          strokeSettings={strokeSettings}
          setStrokeSettings={setStrokeSettings}
        />
        
        <div className={styles.mainContent}>
          {activeTab === "draw" && (
            <DrawMenu 
              activeTool={activeTool}
              setActiveTool={setActiveTool}
              strokeSettings={strokeSettings}
              setStrokeSettings={setStrokeSettings}
              onAddElement={handleAddElement}
              onOpenPages={() => setPagesModalOpen(true)}
              setActiveTab={setActiveTab}
            />
          )}
          <CanvasWorkspace 
            viewportRef={viewportRef}
            workspaceRef={workspaceRef}
            localDoc={localDoc}
            zoom={zoom}
            pan={pan}
            activeTool={activeTool}
            isPanning={isPanning}
            selectedId={selectedId}
            liveStrokePath={liveStrokePath}
            strokeSettings={strokeSettings}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onSelectElement={(id, e) => { 
              if (activeTool === "draw") return;
              e.stopPropagation(); 
              setSelectedId(id); 
              setActiveTool("select");
              setActiveTab("select");
            }}
            onUpdateElement={handleElementUpdate}
            onDeleteElement={handleElementDelete}
            onDuplicateElement={handleElementDuplicate}
            onDrawStart={handleDrawStart}
            onDrawMove={handleDrawMove}
            onDrawEnd={handleDrawEnd}
          />

          <BottomBar 
            zoom={zoom}
            setZoom={setZoom}
            pageCount={localDoc.pages.length}
            onGridClick={() => setPagesModalOpen(true)}
            onCenterCanvas={centerCanvas}
          />
        </div>
      </div>

      <PagesModal
        open={pagesModalOpen}
        pages={localDoc.pages}
        elements={localDoc.elements}
        currentPageIndex={localDoc.currentPageIndex}
        onClose={() => setPagesModalOpen(false)}
        onSelectPage={(i: number) => { notifyChange({ ...localDoc, currentPageIndex: i }); setPagesModalOpen(false); }}
        onAddPage={() => { 
          const newP = createCanvasPage();
          notifyChange({ ...localDoc, pages: [...localDoc.pages, newP], currentPageIndex: localDoc.pages.length });
        }}
        onDeletePage={onDeletePage}
        onMovePage={onMovePage}
      />
      <input type="file" ref={fileInputRef} style={{ display: "none" }} accept="image/*" onChange={handleImageUpload} />
    </div>
  );
};

export default CanvasEditor;
