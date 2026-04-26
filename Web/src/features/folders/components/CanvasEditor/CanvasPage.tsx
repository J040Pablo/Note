import { CanvasPage as ICanvasPage, CanvasElement, buildSmoothSvgPath } from "../../../../utils/noteContent";
import CanvasElementNode from "../CanvasElementNode";
import styles from "../CanvasEditor.module.css";

interface CanvasPageProps {
  page: ICanvasPage;
  pageIndex: number;
  elements: CanvasElement[];
  zoom: number;
  activeTool: string;
  selectedId: string | null;
  liveStrokePath: string | null;
  strokeSettings: { color: string; size: number; opacity: number };
  topPosition: number;
  
  onSelectElement: (id: string, e: React.MouseEvent | React.PointerEvent) => void;
  onUpdateElement: (id: string, updates: Partial<CanvasElement>) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement: (id: string) => void;
  
  onDrawStart: (e: React.PointerEvent<HTMLDivElement>, pageId: string) => void;
  onDrawMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onDrawEnd: (e: React.PointerEvent<HTMLDivElement>) => void;

}

const CanvasPage: React.FC<CanvasPageProps> = ({
  page,
  pageIndex,
  elements,
  zoom,
  activeTool,
  selectedId,
  liveStrokePath,
  strokeSettings,
  topPosition,
  onSelectElement,
  onUpdateElement,
  onDeleteElement,
  onDuplicateElement,
  onDrawStart,
  onDrawMove,
  onDrawEnd,

}) => {
  return (
    <div
      className={styles.pageSheetWrapper}
      style={{
        position: 'absolute',
        top: topPosition,
        left: 2500,
        transform: 'translateX(-50%)',
        width: page.width,
      }}
    >
      <div className={styles.pageLabel}>Página {pageIndex + 1}</div>
      <div
        className={styles.pageSheet}
        style={{ 
          width: page.width, 
          height: page.height,
          cursor: activeTool === "draw" ? "crosshair" : "default",
          transform: 'none', // Reset since wrapper handles position
          position: 'relative',
          top: 0, left: 0
        }}
        onPointerDown={(e) => onDrawStart(e, page.id)}
        onPointerMove={onDrawMove}
        onPointerUp={onDrawEnd}
      >
        <div className={styles.pageBackground} style={{ width: page.width, height: page.height }} />
        
        {/* Drawing Layer (Local Feedback only) */}
        <svg className={styles.drawingSvg} style={{ pointerEvents: activeTool === "draw" ? "auto" : "none", zIndex: 100 }}>
          {liveStrokePath && (
            <path
              d={liveStrokePath}
              fill="none" stroke={strokeSettings.color} strokeWidth={strokeSettings.size}
              strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity: strokeSettings.opacity }}
            />
          )}
        </svg>

        {elements.map(el => (
          <CanvasElementNode
            key={el.id}
            element={el}
            isSelected={selectedId === el.id}
            onSelect={onSelectElement}
            onUpdate={onUpdateElement}
            onDelete={onDeleteElement}
            onDuplicate={onDuplicateElement}
            zoom={zoom}
            activeTool={activeTool}
          />
        ))}
      </div>
    </div>
  );
};

export default CanvasPage;
