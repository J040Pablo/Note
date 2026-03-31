import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  Type,
  Image as ImageIcon,
  PenTool,
  LayoutGrid,
  Square,
  Undo,
  Redo,
  ChevronLeft,
  ChevronRight,
  Grid,
  ZoomIn,
  ZoomOut,
  Upload,
  Eraser
} from "lucide-react";
import type { 
  CanvasNoteDocument, 
  CanvasElement,
  CanvasPage,
  ID,
  DrawingPoint,
  DrawingStroke,
  CanvasDrawingElement
} from "../../../utils/noteContent";
import {
  createCanvasTextElement,
  createCanvasImageElement,
  createCanvasDrawingElement,
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

const HISTORY_LIMIT = 50;

const CanvasEditor: React.FC<Props> = ({ document, onChange }) => {
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // States for new features
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [pagesModalOpen, setPagesModalOpen] = useState(false);

  // History Stacks
  const undoStackRef = useRef<CanvasNoteDocument[]>([]);
  const redoStackRef = useRef<CanvasNoteDocument[]>([]);

  const workspaceRef = useRef<HTMLDivElement>(null);

  const pushHistory = useCallback((docState: CanvasNoteDocument) => {
    undoStackRef.current.push(JSON.parse(JSON.stringify(docState)));
    if (undoStackRef.current.length > HISTORY_LIMIT) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
  }, []);

  const handleChange = useCallback((newDoc: CanvasNoteDocument) => {
    pushHistory(document);
    onChange(newDoc);
  }, [document, onChange, pushHistory]);

  const handleUndo = () => {
    const prev = undoStackRef.current.pop();
    if (prev) {
      redoStackRef.current.push(JSON.parse(JSON.stringify(document)));
      onChange(prev);
    }
  };

  const handleRedo = () => {
    const next = redoStackRef.current.pop();
    if (next) {
      undoStackRef.current.push(JSON.parse(JSON.stringify(document)));
      onChange(next);
    }
  };

  const handleWorkspacePointerDown = (e: React.PointerEvent) => {
    // Unselect when clicking background
    setSelectedId(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      // Zoom
      const zoomDelta = -e.deltaY * 0.002;
      const newZoom = Math.min(Math.max(0.1, zoom + zoomDelta), 5);
      setZoom(newZoom);
    }
    // Removed panning to keep page stationary/centered per requirements
  };

  // --- Element Handlers ---
  const handleElementUpdate = useCallback((id: string, updates: Partial<CanvasElement>) => {
    onChange({
      ...document,
      elements: document.elements.map(el => 
        el.id === id ? { ...el, ...updates } as CanvasElement : el
      )
    });
  }, [document, onChange]);

  const handleElementDelete = useCallback((id: string) => {
    handleChange({
      ...document,
      elements: document.elements.filter(el => el.id !== id)
    });
    if (selectedId === id) setSelectedId(null);
  }, [document, selectedId, handleChange]);

  const handleElementSelect = useCallback((id: string, e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    setSelectedId(id);
    
    // Bring element to front
    const elements = [...document.elements];
    const elIndex = elements.findIndex(el => el.id === id);
    if (elIndex > -1) {
      const el = elements[elIndex];
      elements.splice(elIndex, 1);
      el.zIndex = Date.now();
      elements.push(el);
      onChange({ ...document, elements });
    }
  }, [document, onChange]);

  // --- Creation ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const pageId = document.pages[currentPageIndex]?.id || "default";
      const newImg = createCanvasImageElement(base64, 100, 100, pageId);
      handleChange({
        ...document,
        elements: [...document.elements, newImg]
      });
      setSelectedId(newImg.id);
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = "";
  };

  const handleAddElement = (type: "text" | "image" | "shape") => {
    setIsDrawMode(false);
    const pageId = document.pages[currentPageIndex]?.id || "default";
    
    // Add in center of the page viewport
    const centerX = 150;
    const centerY = 150;
    
    let newEl: CanvasElement;
    if (type === "text") newEl = createCanvasTextElement("New Text", centerX, centerY, pageId);
    else if (type === "shape") newEl = createCanvasShapeElement("rectangle", "#e2e8f0", centerX, centerY, pageId);
    else {
      fileInputRef.current?.click();
      return;
    }

    handleChange({
      ...document,
      elements: [...document.elements, newEl]
    });
    setSelectedId(newEl.id);
  };

  // --- Drawing Layer ---
  // Native freeform drawing over the entire current page
  const [currentStroke, setCurrentStroke] = useState<DrawingPoint[] | null>(null);

  const handleDrawStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    setCurrentStroke([{ x, y }]);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleDrawMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode || !currentStroke) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    setCurrentStroke(prev => [...(prev || []), { x, y }]);
  };

  const handleDrawEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawMode || !currentStroke) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    if (currentStroke.length >= 2) {
      const stroke: DrawingStroke = {
        id: makeId(),
        color: "#3b82f6", // default brush color for MVP
        size: 4,
        points: currentStroke
      };

      const pageId = document.pages[currentPageIndex]?.id;
      // We will create or append to a background Drawing Element that spans the page
      const existingDrawingLayer = document.elements.find(e => e.type === "drawing" && e.pageId === pageId && e.width === (document.pageWidth || DEFAULT_PAGE_W));
      
      if (existingDrawingLayer) {
        handleElementUpdate(existingDrawingLayer.id, {
          strokes: [...(existingDrawingLayer as any).strokes, stroke]
        });
      } else {
        const newLayer = createCanvasDrawingElement(0, 0, pageId);
        newLayer.width = document.pageWidth || DEFAULT_PAGE_W;
        newLayer.height = document.pageHeight || DEFAULT_PAGE_H;
        newLayer.zIndex = 0; // Behind ordinary objects
        newLayer.strokes = [stroke];
        
        handleChange({
          ...document,
          elements: [...document.elements, newLayer]
        });
      }
    }
    setCurrentStroke(null);
  };

  const handleClearDrawing = () => {
    const pageId = document.pages[currentPageIndex]?.id;
    const nextElements = document.elements.filter(el => !(el.type === "drawing" && el.pageId === pageId));
    handleChange({ ...document, elements: nextElements });
  };

  // --- Page Management ---
  const handleAddPage = () => {
    const newPage = createCanvasPage(document.pageWidth, document.pageHeight);
    handleChange({
      ...document,
      pages: [...document.pages, newPage]
    });
    setCurrentPageIndex(document.pages.length);
    setPagesModalOpen(false);
  };

  const handleDeletePage = (index: number) => {
    const pageId = document.pages[index].id;
    const newPages = document.pages.filter((_, i) => i !== index);
    const newElements = document.elements.filter(el => el.pageId !== pageId);
    handleChange({
      ...document,
      pages: newPages,
      elements: newElements
    });
    if (currentPageIndex >= newPages.length) {
      setCurrentPageIndex(Math.max(0, newPages.length - 1));
    }
  };

  const handleMovePage = (index: number, direction: "up" | "down") => {
    const newPages = [...document.pages];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx >= 0 && targetIdx < newPages.length) {
      [newPages[index], newPages[targetIdx]] = [newPages[targetIdx], newPages[index]];
      handleChange({ ...document, pages: newPages });
      if (currentPageIndex === index) setCurrentPageIndex(targetIdx);
      else if (currentPageIndex === targetIdx) setCurrentPageIndex(index);
    }
  };


  const pages = document.pages?.length > 0 ? document.pages : [{ id: "page-1", width: document.pageWidth || DEFAULT_PAGE_W, height: document.pageHeight || DEFAULT_PAGE_H }];
  const currentPage = pages[currentPageIndex];

  // Helper to render all existing strokes for this page
  const pageDrawingElements = document.elements.filter(el => el.type === "drawing" && el.pageId === currentPage.id) as CanvasDrawingElement[];

  return (
    <div 
      ref={workspaceRef}
      className={styles.workspace}
      onPointerDown={handleWorkspacePointerDown}
      onWheel={handleWheel}
      // Center the stationary page content
      style={{ display: "flex", alignItems: "center", justifyContent: "center" }} 
    >
      <div 
        className={styles.canvasPanZoom}
        style={{
          transform: `scale(${zoom})`,
          position: "relative",
          width: currentPage.width,
          height: currentPage.height
        }}
      >
        <div
          className={styles.pageContainer}
          style={{ width: currentPage.width, height: currentPage.height }}
          onPointerDown={handleDrawStart}
          onPointerMove={handleDrawMove}
          onPointerUp={handleDrawEnd}
          onPointerCancel={handleDrawEnd}
        >
           {/* DRAWING LAYER OVERLAY */}
           <svg 
             style={{ 
               position: "absolute", inset: 0, 
               width: "100%", height: "100%", 
               pointerEvents: isDrawMode ? "auto" : "none", 
               zIndex: isDrawMode ? 9998 : 0,
               cursor: isDrawMode ? "crosshair" : "default" 
             }}
           >
             {/* Render existing strokes from all drawing elements on this page */}
             {pageDrawingElements.map(layer => (
                <g key={layer.id}>
                  {layer.strokes.map(stroke => (
                    <polyline
                      key={stroke.id}
                      points={stroke.points.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none" stroke={stroke.color} strokeWidth={stroke.size}
                      strokeLinecap="round" strokeLinejoin="round"
                    />
                  ))}
                </g>
             ))}
             
             {/* Render current active stroke */}
             {currentStroke && (
               <polyline 
                 points={currentStroke.map(p => `${p.x},${p.y}`).join(" ")}
                 fill="none" stroke="#3b82f6" strokeWidth={4}
                 strokeLinecap="round" strokeLinejoin="round"
               />
             )}
           </svg>

          {document.elements
            .filter(el => el.pageId === currentPage.id && el.type !== "drawing")
            .map(el => (
            <CanvasElementNode
              key={el.id}
              element={el}
              isSelected={selectedId === el.id}
              onSelect={handleElementSelect}
              onUpdate={handleElementUpdate}
              onDelete={handleElementDelete}
              zoom={zoom}
              pageWidth={currentPage.width}
              pageHeight={currentPage.height}
            />
          ))}

        </div>
      </div>

      <div className={styles.toolbarContainer} onPointerDown={e => e.stopPropagation()}>
        <div className={styles.toolbarRow}>
          <div className={styles.toolbarTools}>
            <button className={styles.toolbarBtn} onClick={() => handleAddElement("text")} title="Add Text">
              <Type size={18} />
            </button>
            <button className={styles.toolbarBtn} onClick={() => handleAddElement("image")} title="Add Image">
              <ImageIcon size={18} />
            </button>
            <div className={styles.toolbarDivider} />
            <button className={`${styles.toolbarBtn} ${isDrawMode ? styles.toolbarBtnActive : ""}`} onClick={() => { setIsDrawMode(!isDrawMode); setSelectedId(null); }} title="Draw">
              <PenTool size={18} />
            </button>
            <button className={styles.toolbarBtn} onClick={handleClearDrawing} title="Eraser / Clear Drawing">
              <Eraser size={18} />
            </button>
            <button className={styles.toolbarBtn} onClick={() => handleAddElement("shape")} title="Shapes">
              <Square size={18} />
            </button>
            <div className={styles.toolbarDivider} />
            <button className={styles.toolbarBtn} onClick={() => setPagesModalOpen(true)} title="Pages (Grid View)">
              <LayoutGrid size={18} />
            </button>
          </div>
          <div className={styles.toolbarTools}>
            <button className={styles.toolbarBtn} onClick={() => setZoom(z => Math.min(5, z + 0.1))} title="Zoom In">
               <ZoomIn size={18} />
            </button>
            <button className={styles.toolbarBtn} onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} title="Zoom Out">
               <ZoomOut size={18} />
            </button>
            <div className={styles.toolbarDivider} />
            <button 
              className={styles.toolbarBtn} 
              onClick={handleUndo} 
              disabled={undoStackRef.current.length === 0}
            >
              <Undo size={18} />
            </button>
            <button 
              className={styles.toolbarBtn} 
              onClick={handleRedo}
              disabled={redoStackRef.current.length === 0}
            >
              <Redo size={18} />
            </button>
          </div>
        </div>
        
        <div className={styles.toolbarSecondary}>
          <span className={styles.zoomIndicator}>
            {Math.round(zoom * 100)}%
          </span>
          <div className={styles.pagePicker}>
            <button 
              className={styles.toolbarBtn}
              disabled={currentPageIndex === 0}
              onClick={() => { setCurrentPageIndex(p => Math.max(0, p - 1)); setIsDrawMode(false); }}
            >
              <ChevronLeft size={16} />
            </button>
            <span>{currentPageIndex + 1} / {pages.length}</span>
            <button 
              className={styles.toolbarBtn}
              disabled={currentPageIndex >= pages.length - 1}
              onClick={() => { setCurrentPageIndex(p => Math.min(pages.length - 1, p + 1)); setIsDrawMode(false); }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <PagesModal
        open={pagesModalOpen}
        pages={pages}
        elements={document.elements}
        currentPageIndex={currentPageIndex}
        onClose={() => setPagesModalOpen(false)}
        onSelectPage={(i) => { setCurrentPageIndex(i); setPagesModalOpen(false); }}
        onAddPage={handleAddPage}
        onDeletePage={handleDeletePage}
        onMovePage={handleMovePage}
      />

      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: "none" }} 
        accept="image/*" 
        onChange={handleImageUpload} 
      />
    </div>
  );
};

export default CanvasEditor;
