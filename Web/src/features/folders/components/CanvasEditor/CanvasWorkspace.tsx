import React from "react";
import styles from "../CanvasEditor.module.css";
import CanvasPage from "./CanvasPage";
import { CanvasNoteDocument, CanvasElement } from "../../../../utils/noteContent";

interface CanvasWorkspaceProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  workspaceRef: React.RefObject<HTMLDivElement | null>;
  localDoc: CanvasNoteDocument;
  zoom: number;
  pan: { x: number; y: number };
  activeTool: string;
  isPanning: boolean;
  selectedId: string | null;
  liveStrokePath: string | null;
  strokeSettings: { color: string; size: number; opacity: number };
  
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  
  onSelectElement: (id: string, e: React.MouseEvent | React.PointerEvent) => void;
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  
  onDrawStart: (e: React.PointerEvent<HTMLDivElement>, pageId: string) => void;
  onDrawMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDrawEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
  

}

const PAGE_GAP = 60;
const INITIAL_TOP_OFFSET = 100;

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  viewportRef,
  workspaceRef,
  localDoc,
  zoom,
  pan,
  activeTool,
  isPanning,
  selectedId,
  liveStrokePath,
  strokeSettings,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSelectElement,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
  onDrawStart,
  onDrawMove,
  onDrawEnd,

}) => {

  const getPageTop = (index: number) => {
    let top = INITIAL_TOP_OFFSET;
    for (let i = 0; i < index; i++) {
        // Safe access, assume DEFAULT_PAGE_H if missing height conceptually, 
        // though our schema ensures it exists.
        top += (localDoc.pages[i].height || 1100) + PAGE_GAP;
    }
    return top;
  };

  return (
    <div 
      ref={viewportRef}
      className={styles.viewport}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ cursor: activeTool === "pan" ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
    >
        <div 
        ref={workspaceRef}
        className={styles.canvas}
        style={{ 
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transition: isPanning ? 'none' : 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
            cursor: activeTool === "pan" ? (isPanning ? 'grabbing' : 'grab') : 'default'
        }}
      >
        {localDoc.pages.map((page, idx) => {
           const topPosition = getPageTop(idx);
           
           return (
              <CanvasPage
                key={page.id}
                page={page}
                pageIndex={idx}
                elements={localDoc.elements.filter(el => el.pageId === page.id)}
                zoom={zoom}
                activeTool={activeTool}
                selectedId={selectedId}
                liveStrokePath={liveStrokePath} /* Ideally should only be passed to the page being drawn on, but we'll manage */
                strokeSettings={strokeSettings}
                topPosition={topPosition}
                onSelectElement={onSelectElement}
                onUpdateElement={onUpdateElement}
                onDeleteElement={onDeleteElement}
                onDuplicateElement={onDuplicateElement}
                onDrawStart={onDrawStart}
                onDrawMove={onDrawMove}
                onDrawEnd={onDrawEnd}
              />
           );
        })}
      </div>
    </div>
  );
};

export default CanvasWorkspace;
