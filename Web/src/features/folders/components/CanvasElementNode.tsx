import React, { useRef, useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import type {
  CanvasElement,
  CanvasTextElement,
  CanvasImageElement,
  CanvasCodeElement,
  CanvasShapeElement,
} from "../../../utils/noteContent";
import styles from "./CanvasEditor.module.css";

type Props = {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: (id: string, e: React.MouseEvent | React.PointerEvent) => void;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
  onDelete: (id: string) => void;
  zoom: number;
  pageWidth: number;
  pageHeight: number;
};

type ResizeHandleStyle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const CanvasElementNode: React.FC<Props> = ({ element, isSelected, onSelect, onUpdate, onDelete, zoom, pageWidth, pageHeight }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeHandleStyle | null>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // If deselecting, leave edit mode.
  useEffect(() => {
    if (!isSelected) {
      setIsEditingText(false);
    }
  }, [isSelected]);

  // Focus input when editing
  useEffect(() => {
    if (isEditingText && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [isEditingText]);

  // Drag logic
  const handleDragPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(element.id, e);
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  
  const handleDragPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.movementX / zoom;
    const dy = e.movementY / zoom;
    
    // clamp position
    const newX = Math.max(0, Math.min(pageWidth - element.width, element.x + dx));
    const newY = Math.max(0, Math.min(pageHeight - element.height, element.y + dy));
    
    onUpdate(element.id, { x: newX, y: newY });
  };
  
  const handleDragPointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Resize logic
  const handleResizePointerDown = (handle: ResizeHandleStyle, e: React.PointerEvent) => {
    e.stopPropagation();
    onSelect(element.id, e);
    setIsResizing(handle);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!isResizing) return;
    const dx = e.movementX / zoom;
    const dy = e.movementY / zoom;

    let { x, y, width, height } = element;

    if (isResizing.includes("e")) width += dx;
    if (isResizing.includes("s")) height += dy;
    if (isResizing.includes("w")) { width -= dx; x += dx; }
    if (isResizing.includes("n")) { height -= dy; y += dy; }

    const minW = 40;
    const minH = 40;
    
    // Clamp mins
    if (width < minW) {
      if (isResizing.includes("w")) x -= minW - width;
      width = minW;
    }
    if (height < minH) {
      if (isResizing.includes("n")) y -= minH - height;
      height = minH;
    }
    
    // Clamp to page
    if (x < 0) { width += x; x = 0; }
    if (y < 0) { height += y; y = 0; }
    if (x + width > pageWidth) width = pageWidth - x;
    if (y + height > pageHeight) height = pageHeight - y;

    onUpdate(element.id, { x, y, width, height });
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    setIsResizing(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (element.type === "text" || element.type === "code") {
      setIsEditingText(true);
    }
  };

  const renderContent = () => {
    if (element.type === "text") {
      const textEl = element as CanvasTextElement;
      return (
        <textarea
          ref={textInputRef}
          className={styles.textElement}
          value={textEl.text}
          onChange={(e) => onUpdate(element.id, { text: e.target.value })}
          onBlur={() => setIsEditingText(false)}
          placeholder="Type here..."
          style={{
            fontSize: textEl.style?.fontSize,
            fontWeight: textEl.style?.bold ? "bold" : "normal",
            fontStyle: textEl.style?.italic ? "italic" : "normal",
            color: textEl.style?.textColor || "black"
          }}
        />
      );
    }
    
    if (element.type === "image") {
      const imgEl = element as CanvasImageElement;
      return (
        <img
          src={imgEl.uri}
          alt="Canvas image"
          className={styles.imageElement}
          draggable={false}
        />
      );
    }

    if (element.type === "code") {
      const codeEl = element as CanvasCodeElement;
      return (
        <textarea
          ref={textInputRef}
          className={styles.codeElement}
          value={codeEl.code}
          onChange={(e) => onUpdate(element.id, { code: e.target.value })}
          onBlur={() => setIsEditingText(false)}
          placeholder="Code snippet..."
          spellCheck={false}
        />
      );
    }

    if (element.type === "shape") {
      const shapeEl = element as CanvasShapeElement;
      if (shapeEl.shape === "circle") {
        return (
          <div style={{
            width: "100%", height: "100%", borderRadius: "50%",
            border: `${shapeEl.strokeWidth}px solid ${shapeEl.color}`
          }} />
        );
      } else if (shapeEl.shape === "rectangle" || shapeEl.shape as any === "square") {
        return (
          <div style={{
            width: "100%", height: "100%",
            border: `${shapeEl.strokeWidth}px solid ${shapeEl.color}`
          }} />
        );
      }
      return <div style={{ background: shapeEl.color, width: "100%", height: "100%" }} />;
    }

    // "drawing" element removed because all drawings will be handled natively by page overlay.
    return null;
  };

  const renderResizeHandles = () => {
    if (!isSelected || isEditingText) return null;
    const handles: ResizeHandleStyle[] = ["nw", "ne", "sw", "se", "n", "s", "e", "w"];
    
    return handles.map(h => {
      const classNameForHandle = styles[`resize${h.toUpperCase()}`];
      return (
        <div
          key={h}
          className={`${styles.resizeHandle} ${classNameForHandle}`}
          onPointerDown={(e) => handleResizePointerDown(h, e)}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
        />
      );
    });
  };

  return (
    <div
      ref={nodeRef}
      className={`${styles.elementWrapper} ${isSelected && !isEditingText ? styles.elementWrapperSelected : ""}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex,
      }}
      onDoubleClick={handleDoubleClick}
      onPointerDown={(e) => {
        if (!isEditingText) {
          onSelect(element.id, e);
        }
      }}
    >
      {/* Invisible overlay for selection/drag when NOT editing */}
      {!isEditingText && (
        <div 
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            cursor: isSelected ? "move" : "pointer", zIndex: 1 
          }}
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
        />
      )}

      {/* Actual content layer */}
      <div className={styles.contentContainer} style={{ pointerEvents: isEditingText ? 'auto' : 'none', position: 'relative', zIndex: 0, height: '100%', width: '100%' }}>
        {renderContent()}
      </div>

      {/* Action triggers */}
      {isSelected && !isEditingText && (
        <button 
          className={styles.deleteBtn} 
          onClick={(e) => { e.stopPropagation(); onDelete(element.id); }}
        >
          <Trash2 size={12} />
        </button>
      )}

      {renderResizeHandles()}
    </div>
  );
};

export default CanvasElementNode;
