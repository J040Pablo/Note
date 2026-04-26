import React, { useState, useEffect } from "react";
import { 
  MousePointer2, 
  PenTool, 
  Highlighter, 
  Eraser, 
  Type, 
  Shapes, 
  LayoutGrid,
  Minus,
  X
} from "lucide-react";
import styles from "./DrawMenu.module.css";
import { CanvasTool } from "../../CanvasEditor";
import { CanvasShapeType } from "../../../../../utils/noteContent";

interface StrokeSettings {
  color: string;
  size: number;
  opacity: number;
}

interface DrawMenuProps {
  activeTool: CanvasTool;
  setActiveTool: (tool: CanvasTool) => void;
  strokeSettings: StrokeSettings;
  setStrokeSettings: React.Dispatch<React.SetStateAction<StrokeSettings>>;
  onAddElement: (type: "text" | "image" | "shape", shapeType?: CanvasShapeType) => void;
  onOpenPages: () => void;
  setActiveTab: (tab: any) => void;
}

type SubmenuType = "none" | "draw" | "shapes" | "text";

const DrawMenu: React.FC<DrawMenuProps> = ({
  activeTool,
  setActiveTool,
  strokeSettings,
  setStrokeSettings,
  onAddElement,
  onOpenPages,
  setActiveTab
}) => {
  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuType>("none");

  // Sync submenu with tool, but don't auto-open if just selected
  useEffect(() => {
    if (activeTool === "draw") {
      // Keep it as is
    } else {
      setActiveSubmenu("none");
    }
  }, [activeTool]);

  const mainTools = [
    { id: "select", icon: <MousePointer2 size={20} />, label: "Selecionar", tool: "select" },
    { id: "draw", icon: <PenTool size={20} />, label: "Pincel", tool: "draw", 
      config: { opacity: 1, size: 4 } },
    { id: "marker", icon: <Highlighter size={20} />, label: "Marcador", tool: "draw", 
      config: { opacity: 0.5, size: 10 } },
    { id: "shapes", icon: <Shapes size={20} />, label: "Formas", submenu: "shapes" },
    { id: "text", icon: <Type size={20} />, label: "Texto", action: () => onAddElement("text") },
    { id: "grid", icon: <LayoutGrid size={20} />, label: "Páginas", action: onOpenPages },
  ];

  const colors = [
    "#22d3ee", "#06b6d4", "#3b82f6", "#6366f1", 
    "#ef4444", "#f97316", "#f59e0b", "#10b981", 
    "#0f172a", "#334155", "#94a3b8", "#ffffff"
  ];

  const brushSizes = [
    { label: "Fino", value: 2 },
    { label: "Médio", value: 6 },
    { label: "Grosso", value: 12 },
    { label: "Extra", value: 24 },
  ];

  const handleToolClick = (item: any) => {
    if (item.action) {
      item.action();
      return;
    }

    if (item.submenu) {
        setActiveSubmenu(activeSubmenu === item.submenu ? "none" : item.submenu as SubmenuType);
    } else {
        const isCurrent = activeTool === item.tool && (item.id === "select" || (activeTool === "draw" && activeSubmenu === "draw"));
        
        if (isCurrent) {
            setActiveTool("select");
            setActiveSubmenu("none");
        } else {
            setActiveTool(item.tool as CanvasTool);
            if (item.config) {
                setStrokeSettings(prev => ({ ...prev, ...item.config }));
            }
            setActiveSubmenu(item.tool === "draw" ? "draw" : "none");
        }
    }
  };

  return (
    <div className={styles.floatingContainer}>
      {/* Column 0: Close Toggle (above the panel) */}
      <div style={{ position: 'absolute', top: -50, left: 8, pointerEvents: 'auto' }}>
        <button 
          className={styles.closeCircleBtn} 
          onClick={() => {
            setActiveTool("select");
            setActiveTab("select");
          }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Column 1: Main Tools */}
      <div className={`${styles.panel} ${styles.panelEntry}`}>
        {mainTools.map((item) => {
          const isActive = (item.tool === activeTool && !item.submenu) || activeSubmenu === item.submenu;
          return (
            <button
              key={item.id}
              className={`${styles.toolBtn} ${isActive ? styles.toolBtnActive : ""}`}
              onClick={() => handleToolClick(item)}
            >
              {isActive && <div className={styles.activeDot} />}
              {item.icon}
              <span className={styles.toolLabel}>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Column 2: Submenu */}
      <div className={`${styles.panel} ${styles.submenu} ${styles.submenuEntry}`}>
        {activeSubmenu === "none" ? (
           <div className={styles.emptySubmenuContent}>
              <p className={styles.emptyText}>Escolha uma ferramenta</p>
           </div>
        ) : (
          <>
            {activeSubmenu === "draw" && (
              <>
                <div>
                  <h4 className={styles.sectionTitle}>Cores</h4>
                  <div className={styles.colorGrid}>
                    {colors.map(c => (
                      <button
                        key={c}
                        className={`${styles.colorCircle} ${strokeSettings.color === c ? styles.colorCircleActive : ""}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setStrokeSettings(prev => ({ ...prev, color: c }))}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className={styles.sectionTitle}>Espessura</h4>
                  <div className={styles.sizeList}>
                    {brushSizes.map(s => (
                      <button 
                        key={s.value}
                        className={`${styles.sizeOption} ${strokeSettings.size === s.value ? styles.sizeOptionActive : ""}`}
                        onClick={() => setStrokeSettings(prev => ({ ...prev, size: s.value }))}
                      >
                        <div className={styles.sizePreview} style={{ height: Math.max(1, s.value / 4) }} />
                        <span>{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {activeSubmenu === "shapes" && (
              <>
                 <h4 className={styles.sectionTitle}>Formas</h4>
                 <div className={styles.sizeList}>
                   <button className={styles.sizeOption} onClick={() => onAddElement("shape", "rectangle")}>Retângulo</button>
                   <button className={styles.sizeOption} onClick={() => onAddElement("shape", "circle")}>Círculo</button>
                   <button className={styles.sizeOption} onClick={() => onAddElement("shape", "line")}>Linha</button>
                   <button className={styles.sizeOption} onClick={() => onAddElement("shape", "arrow")}>Seta</button>
                 </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DrawMenu;
