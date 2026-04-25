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
  LayoutTemplate
} from "lucide-react";
import { 
  CanvasNoteDocument, 
  CanvasElement,
  CanvasPage,
  ID,
  DrawingPoint,
  DrawingStroke,
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
import styles from "./CanvasEditor.module.css";

type Props = {
  document: CanvasNoteDocument;
  onChange: (doc: CanvasNoteDocument) => void;
};

const HISTORY_LIMIT = 80;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 5;
const MAX_STROKE_STEP = 2.5;

const buildSmoothSvgPath = (points: DrawingPoint[]): string => {
  if (!points.length) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

const CanvasEditor: React.FC<Props> = ({ document: initialDocument, onChange }) => {
  // --- States ---
  const [localDoc, setLocalDoc] = useState<CanvasNoteDocument>(initialDocument);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [pagesModalOpen, setPagesModalOpen] = useState(false);
  const [liveStrokePath, setLiveStrokePath] = useState<string | null>(null);

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

  // --- Centering Logic ---
  const centerCanvas = useCallback(() => {
    if (!viewportRef.current) return;
    const { width, height } = viewportRef.current.getBoundingClientRect();
    const pageW = localDoc.pageWidth || DEFAULT_PAGE_W;
    const pageH = localDoc.pageHeight || DEFAULT_PAGE_H;
    
    // Zoom to fit slightly
    const fitZoom = Math.min((width - 100) / pageW, (height - 100) / pageH, 0.85);
    setZoom(fitZoom);
    
    // Center the 5000x5000 canvas in the viewport, then offset so the page (fixed at 2500x2500 in CSS) is centered.
    setPan({
      x: width / 2 - 2500 * fitZoom,
      y: height / 2 - 2500 * fitZoom
    });
  }, [localDoc.pageWidth, localDoc.pageHeight]);

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
    
    // Safety: ignore external updates if we have unsaved local changes 
    // or are in the middle of a gesture.
    const isDirty = localDocRef.current !== lastAcknowledgedDocRef.current;
    if (isDirty || isPanning || currentStrokeRef.current) return;

    lastAcknowledgedDocRef.current = initialDocument;
    setLocalDoc(initialDocument);
  }, [initialDocument, isPanning]);

  // --- Pan & Zoom Engine ---
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // LOCK Browser Scroll

      if (e.ctrlKey || e.metaKey) {
        // PRO ZOOM (centered on mouse)
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomDelta = -e.deltaY * 0.003;
        const nextZoom = Math.min(Math.max(ZOOM_MIN, zoom + zoomDelta), ZOOM_MAX);
        
        if (nextZoom !== zoom) {
          const ratio = nextZoom / zoom;
          setPan(prev => ({
            x: mouseX - (mouseX - prev.x) * ratio,
            y: mouseY - (mouseY - prev.y) * ratio
          }));
          setZoom(nextZoom);
        }
      } else {
        // Simple manual pan via wheel
        setPan(prev => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY
        }));
      }
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoom]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.target === viewportRef.current || e.target === workspaceRef.current) {
      setSelectedId(null);
      if (!isDrawMode) {
        setIsPanning(true);
        viewportRef.current?.setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanning) {
      setPan(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
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

  const handleAddElement = (type: "text" | "image" | "shape") => {
    pushUndo();
    const pageId = currentPage.id;
    const centerX = currentPage.width / 2 - 125;
    const centerY = currentPage.height / 2 - 30;
    const maxZ = localDoc.elements.reduce((acc, current) => Math.max(acc, current.zIndex || 0), 0);
    
    let newEl: CanvasElement;
    if (type === "text") newEl = createCanvasTextElement("New Text", centerX, centerY, pageId, maxZ + 1);
    else if (type === "shape") newEl = createCanvasShapeElement("rectangle", "#e2e8f0", centerX, centerY, pageId, maxZ + 1);
    else {
      fileInputRef.current?.click();
      return;
    }

    const nextDoc = { ...localDoc, elements: [...localDoc.elements, newEl] };
    notifyChange(nextDoc);
    setSelectedId(newEl.id);
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
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // --- Drawing System ---
  const handleDrawStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    drawPointerIdRef.current = e.pointerId;
    currentStrokeRef.current = [{ x, y }];
    pendingDrawPointsRef.current = [];
    setLiveStrokePath(buildSmoothSvgPath([{ x, y }]));
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDrawMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode || drawPointerIdRef.current !== e.pointerId || !currentStrokeRef.current) return;
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
    if (!isDrawMode || drawPointerIdRef.current !== e.pointerId || !currentStrokeRef.current) return;
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
        color: "#1d4ed8",
        size: 3,
        points: strokePoints
      };

      const nextPages = [...localDoc.pages];
      const pageIdx = localDoc.currentPageIndex;
      const pageDrawings = Array.isArray(nextPages[pageIdx]?.drawings) ? nextPages[pageIdx].drawings : [];
      nextPages[pageIdx] = {
        ...nextPages[pageIdx],
        drawings: [...pageDrawings, newStroke]
      };
      
      notifyChange({ ...localDoc, pages: nextPages });
    }
    currentStrokeRef.current = null;
    pendingDrawPointsRef.current = [];
    setLiveStrokePath(null);
  };

  useEffect(() => {
    return () => {
      if (drawRafRef.current != null) {
        cancelAnimationFrame(drawRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDrawMode) {
      if (drawRafRef.current != null) {
        cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
      }
      drawPointerIdRef.current = null;
      currentStrokeRef.current = null;
      pendingDrawPointsRef.current = [];
      setLiveStrokePath(null);
    }
  }, [isDrawMode]);

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

  return (
    <div className={styles.editorContainer}>
      <aside className={styles.sidebar}>
        <button className={styles.sidebarItem}><LayoutTemplate size={20} /><span>Modelos</span></button>
        <button className={styles.sidebarItem}><Shapes size={20} /><span>Elementos</span></button>
        <button className={styles.sidebarItem} onClick={() => handleAddElement("text")}><TypeIcon size={20} /><span>Texto</span></button>
        <button className={styles.sidebarItem} onClick={() => fileInputRef.current?.click()}><CloudUpload size={20} /><span>Uploads</span></button>
        <button className={`${styles.sidebarItem} ${isDrawMode ? styles.sidebarItemActive : ""}`} onClick={() => setIsDrawMode(!isDrawMode)}>
          <PenTool size={20} /><span>Desenho</span>
        </button>
        <button className={styles.sidebarItem}><Hammer size={20} /><span>Apps</span></button>
      </aside>

      <div className={styles.mainContent}>
        <header className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <button className={styles.topBarBtn}>Arquivo</button>
            <div className={styles.toolbarDivider} />
            <button className={styles.toolbarBtn} onClick={handleUndo} disabled={undoStackRef.current.length === 0}><Undo size={18} /></button>
            <button className={styles.toolbarBtn} onClick={handleRedo} disabled={redoStackRef.current.length === 0}><Redo size={18} /></button>
          </div>
          <div className={styles.topBarRight}>
             <button className={styles.primaryBtn}><Maximize2 size={16} /> Preview</button>
             <button className={styles.shareBtn}>Share</button>
          </div>
        </header>

        <div 
          ref={viewportRef}
          className={styles.viewport}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ cursor: isPanning ? 'grabbing' : 'default' }}
        >
          <div 
            ref={workspaceRef}
            className={styles.canvas}
            style={{ 
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                cursor: isPanning ? 'grabbing' : 'grab'
            }}
          >
            <div
              className={styles.pageSheet}
              style={{ width: currentPage.width, height: currentPage.height }}
              onPointerDown={handleDrawStart}
              onPointerMove={handleDrawMove}
              onPointerUp={handleDrawEnd}
            >
              <div className={styles.pageBackground} style={{ width: currentPage.width, height: currentPage.height }} />
              
              {/* Drawing Layer */}
              <svg className={styles.drawingSvg} style={{ pointerEvents: isDrawMode ? "auto" : "none", zIndex: 110 }}>
                {currentPage.drawings.map(stroke => (
                  <path
                    key={stroke.id}
                    d={buildSmoothSvgPath(stroke.points)}
                    fill="none" stroke={stroke.color} strokeWidth={stroke.size}
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                ))}
                {liveStrokePath && (
                  <path
                    d={liveStrokePath}
                    fill="none" stroke="#1d4ed8" strokeWidth={3}
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                )}
              </svg>

              {localDoc.elements
                .filter(el => el.pageId === currentPage.id)
                .map(el => (
                <CanvasElementNode
                  key={el.id}
                  element={el}
                  isSelected={selectedId === el.id}
                  onSelect={(id, e) => { e.stopPropagation(); setSelectedId(id); }}
                  onUpdate={handleElementUpdate}
                  onDelete={handleElementDelete}
                  onDuplicate={handleElementDuplicate}
                  zoom={zoom}
                />
              ))}
            </div>
          </div>
        </div>

        <footer className={styles.bottomBar}>
          <div className={styles.bottomLeft}>
            <button className={styles.bottomBtn}><Monitor size={16} /> Notes</button>
          </div>
          <div className={styles.bottomCenter}>
            <div className={styles.filmstrip}>
              {localDoc.pages.map((p, idx) => (
                <div 
                  key={p.id} 
                  className={`${styles.pageThumb} ${idx === localDoc.currentPageIndex ? styles.pageThumbActive : ""}`}
                  onClick={() => notifyChange({ ...localDoc, currentPageIndex: idx })}
                >
                  {idx + 1}
                </div>
              ))}
              <button className={styles.addPageThumb} onClick={() => {
                const newP = createCanvasPage();
                notifyChange({ ...localDoc, pages: [...localDoc.pages, newP], currentPageIndex: localDoc.pages.length });
              }}>+</button>
            </div>
          </div>
          <div className={styles.bottomRight}>
            <span className={styles.zoomText}>{Math.round(zoom * 100)}%</span>
            <input type="range" min="0.1" max="5" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className={styles.zoomSlider} />
            <button className={styles.gridBtn} onClick={() => setPagesModalOpen(true)}><LayoutGrid size={16} /></button>
          </div>
        </footer>
      </div>

      <PagesModal
        open={pagesModalOpen}
        pages={localDoc.pages}
        elements={localDoc.elements}
        currentPageIndex={localDoc.currentPageIndex}
        onClose={() => setPagesModalOpen(false)}
        onSelectPage={(i) => { notifyChange({ ...localDoc, currentPageIndex: i }); setPagesModalOpen(false); }}
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
