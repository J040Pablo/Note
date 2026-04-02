import React, { useRef, useState, useEffect, useCallback } from "react";
import { Trash2, Copy, ImageOff } from "lucide-react";
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
  onDuplicate?: (id: string) => void;
  zoom: number;
};

type ResizeHandleStyle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const isBrowserRenderableImageUri = (uri: string): boolean => {
  const value = uri.trim();
  if (!value) return false;
  if (value.startsWith("data:image/")) return true;
  if (value.startsWith("blob:")) return true;
  if (value.startsWith("http://") || value.startsWith("https://")) return true;
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) return true;
  if (value.startsWith("file://")) return false;
  return !/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
};

const CanvasElementNode: React.FC<Props> = ({ 
  element, 
  isSelected, 
  onSelect, 
  onUpdate, 
  onDelete, 
  onDuplicate,
  zoom 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<ResizeHandleStyle | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const imageUri = element.type === "image" ? element.uri : "";
  const canRenderImageUri = element.type === "image" ? isBrowserRenderableImageUri(imageUri) : true;

  useEffect(() => {
    setImageLoadFailed(false);
  }, [imageUri]);

  // Exit edit mode on deselect
  useEffect(() => {
    if (!isSelected) setIsEditing(false);
  }, [isSelected]);

  // Focus contentEditable on edit mode start
  useEffect(() => {
    if (isEditing && contentRef.current) {
      const el = contentRef.current;
      el.focus();
      
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

  // --- Handlers ---
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isEditing) return;
    e.stopPropagation();
    onSelect(element.id, e);
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.movementX / zoom;
    const dy = e.movementY / zoom;
    onUpdate(element.id, { x: element.x + dx, y: element.y + dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleResizeDown = (handle: ResizeHandleStyle, e: React.PointerEvent) => {
    e.stopPropagation();
    setIsResizing(handle);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent) => {
    if (!isResizing) return;
    const dx = e.movementX / zoom;
    const dy = e.movementY / zoom;

    let { x, y, width, height } = element;

    if (isResizing.includes("e")) width += dx;
    if (isResizing.includes("s")) height += dy;
    if (isResizing.includes("w")) { width -= dx; x += dx; }
    if (isResizing.includes("n")) { height -= dy; y += dy; }

    // Clamp
    width = Math.max(20, width);
    height = Math.max(20, height);

    onUpdate(element.id, { x, y, width, height });
  };

  const handleResizeUp = (e: React.PointerEvent) => {
    setIsResizing(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (element.type === "text") {
      setIsEditing(true);
    }
  };

  // --- Renderers ---
  const renderContent = () => {
    if (element.type === "text") {
      return (
        <div
          ref={contentRef}
          contentEditable={isEditing}
          suppressContentEditableWarning
          className={styles.textElement}
          onBlur={(e) => {
            onUpdate(element.id, { text: e.currentTarget.innerText });
            setIsEditing(false);
          }}
          style={{
            fontSize: element.style?.fontSize ? `${element.style.fontSize}px` : "18px",
            fontWeight: element.style?.bold ? "bold" : "normal",
            fontStyle: element.style?.italic ? "italic" : "normal",
            color: element.style?.textColor || "#f8fafc",
            textAlign: element.style?.textAlign || "left",
            width: "100%",
            height: "100%",
            outline: "none",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word"
          }}
        >
          {element.text}
        </div>
      );
    }

    if (element.type === "image") {
      if (!canRenderImageUri || imageLoadFailed) {
        return (
          <div
            style={{
              width: "100%",
              height: "100%",
              border: "1px dashed #64748b",
              background: "#0f172a",
              color: "#cbd5e1",
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              padding: "10px",
              fontSize: "12px",
              lineHeight: 1.35,
              borderRadius: "6px"
            }}
          >
            <div>
              <ImageOff size={16} style={{ marginBottom: 6 }} />
              <div>Image unavailable in web</div>
              <div style={{ opacity: 0.7 }}>Local mobile file cannot be opened by browser.</div>
            </div>
          </div>
        );
      }

      return (
        <img 
          src={imageUri}
          className={styles.imageElement} 
          alt="" 
          onError={() => setImageLoadFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} 
        />
      );
    }

    if (element.type === "shape") {
      const borderRadius = element.shape === "circle" ? "50%" : "0%";
      return (
        <div style={{
          width: "100%",
          height: "100%",
          border: `${element.strokeWidth}px solid ${element.color}`,
          borderRadius
        }} />
      );
    }

    return null;
  };

  return (
    <div
      ref={nodeRef}
      className={`${styles.elementWrapper} ${isSelected ? styles.elementWrapperSelected : ""}`}
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        zIndex: element.zIndex,
        pointerEvents: "auto"
      }}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Interaction Overlay (only visible when not editing) */}
      {!isEditing && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, cursor: isSelected ? "move" : "pointer" }} />
      )}

      {renderContent()}

      {/* Resize Handles */}
      {isSelected && !isEditing && (
        <>
          {(["nw", "ne", "sw", "se", "n", "s", "e", "w"] as ResizeHandleStyle[]).map(h => (
            <div
              key={h}
              className={`${styles.resizeHandle} ${styles[`resize${h.toUpperCase()}`]}`}
              onPointerDown={(e) => handleResizeDown(h, e)}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeUp}
            />
          ))}
          
          {/* Action Toolbar */}
          <div style={{
            position: "absolute",
            top: -45,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1e2230",
            border: "1px solid #3f4458",
            borderRadius: "8px",
            padding: "4px 8px",
            display: "flex",
            gap: "8px",
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.5)"
          }}>
            <button onClick={() => onDuplicate?.(element.id)} style={{ background: "transparent", border: "none", color: "#8b92a5", cursor: "pointer" }}><Copy size={16} /></button>
            <button onClick={() => onDelete(element.id)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer" }}><Trash size={16} /></button>
          </div>
        </>
      )}
    </div>
  );
};

// Internal replacement for Lucide Trash if needed, but assuming import Trash from lucide-react works as Trash2 usually.
const Trash = Trash2;

export default CanvasElementNode;
