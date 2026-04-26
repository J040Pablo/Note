import React, { useState, useMemo } from "react";
import { 
  MousePointer2, 
  LayoutTemplate, 
  Shapes, 
  Type, 
  Image as ImageIcon, 
  PenTool, 
  FolderOpen,
  Settings,
  ChevronDown,
  ChevronRight,
  Folder,
  FileText
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import styles from "./UnifiedSidebar.module.css";
import { CanvasTool } from "../CanvasEditor";
import { CanvasShapeType } from "../../../../utils/noteContent";
import { getFolders, getNotes } from "../../../../services/webData";
import { FolderEntry } from "../../types";

export type SidebarTab = CanvasTool | "templates" | "elements" | "shapes" | "projects" | "settings";

interface StrokeSettings {
  color: string;
  size: number;
  opacity: number;
}

interface UnifiedSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  onImageUploadClick: () => void;
  onAddElement: (type: "text" | "image" | "shape", shapeType?: CanvasShapeType) => void;
  strokeSettings: StrokeSettings;
  setStrokeSettings: React.Dispatch<React.SetStateAction<StrokeSettings>>;
}

const UnifiedSidebar: React.FC<UnifiedSidebarProps> = ({
  activeTab,
  onTabChange,
  onImageUploadClick,
  onAddElement,
  strokeSettings,
  setStrokeSettings
}) => {
  const navigate = useNavigate();
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const entries = useMemo(() => {
    const folders: FolderEntry[] = getFolders().map(f => ({
      id: f.id,
      parentId: f.parentId || null,
      type: "folder",
      name: f.name,
      color: f.color || "#111111",
      createdAt: f.createdAt || Date.now()
    }));
    const notes: FolderEntry[] = getNotes().map(n => ({
      id: n.id,
      parentId: n.parentId || null,
      type: "note",
      name: n.title || "Untitled",
      color: "#71717A",
      createdAt: n.createdAt || Date.now()
    }));
    return [...folders, ...notes];
  }, []);

  const toggleFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolders(next);
  };

  const isPanelOpen = !["select", "pan", "image", "draw"].includes(activeTab);

  const tabs = [
    { id: "select", icon: <MousePointer2 size={24} strokeWidth={1.5} />, label: "Design" },
    { id: "elements", icon: <Shapes size={24} strokeWidth={1.5} />, label: "Elementos" },
    { id: "text", icon: <Type size={24} strokeWidth={1.5} />, label: "Texto" },
    { id: "image", icon: <ImageIcon size={24} strokeWidth={1.5} />, label: "Uploads", action: () => onImageUploadClick() },
    { id: "draw", icon: <PenTool size={24} strokeWidth={1.5} />, label: "Ferramentas" },
    { id: "projects", icon: <FolderOpen size={24} strokeWidth={1.5} />, label: "Projetos" },
  ];

  const renderPanelContent = () => {
    switch (activeTab) {
      case "text":
        return (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Adicionar texto</h3>
            <button className={styles.largeTextBtn} onClick={() => onAddElement("text")}>
              Adicionar uma caixa de texto
            </button>
            <div className={styles.textPresets}>
              <button className={styles.presetHeading} onClick={() => onAddElement("text")}>
                Adicionar um título
              </button>
              <button className={styles.presetSubheading} onClick={() => onAddElement("text")}>
                Adicionar um subtítulo
              </button>
              <button className={styles.presetBody} onClick={() => onAddElement("text")}>
                Adicionar um pouco de texto
              </button>
            </div>
          </div>
        );

      case "elements":
      case "shapes":
        return (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Formas</h3>
            <div className={styles.shapesGrid}>
              <button className={styles.shapeBtn} onClick={() => onAddElement("shape", "rectangle")}>
                <div className={styles.shapeRect} />
              </button>
              <button className={styles.shapeBtn} onClick={() => onAddElement("shape", "circle")}>
                 <div className={styles.shapeCircle} />
              </button>
               <button className={styles.shapeBtn} onClick={() => onAddElement("shape", "line")}>
                 <div className={styles.shapeLine} />
              </button>
               <button className={styles.shapeBtn} onClick={() => onAddElement("shape", "arrow")}>
                 <div className={styles.shapeArrow} />
              </button>
            </div>
          </div>
        );

      case "draw":
        return (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Pincéis</h3>
            <div className={styles.brushSettings}>
              <div className={styles.brushColors}>
                {["#22d3ee", "#ef4444", "#10b981", "#f59e0b", "#0f172a", "#ffffff"].map(c => (
                  <button 
                    key={c}
                    className={`${styles.colorCircle} ${strokeSettings.color === c ? styles.colorCircleActive : ""}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setStrokeSettings(prev => ({ ...prev, color: c }))}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              
              <div className={styles.sliderGroup}>
                 <label className={styles.sliderLabel}>Espessura <span>{strokeSettings.size}px</span></label>
                 <input 
                  type="range" min="1" max="50" 
                  value={strokeSettings.size} 
                  onChange={e => setStrokeSettings(prev => ({ ...prev, size: parseInt(e.target.value) }))}
                  className={styles.brushSlider}
                 />
              </div>

               <div className={styles.sliderGroup}>
                 <label className={styles.sliderLabel}>Opacidade <span>{Math.round(strokeSettings.opacity * 100)}%</span></label>
                 <input 
                  type="range" min="0.1" max="1" step="0.1"
                  value={strokeSettings.opacity} 
                  onChange={e => setStrokeSettings(prev => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                  className={styles.brushSlider}
                 />
              </div>
            </div>
          </div>
        );

      case "projects":
        const renderTree = (parentId: string | null = null, level = 0) => {
          const children = entries.filter(e => e.parentId === parentId);
          if (children.length === 0 && level > 0) return null;

          return (
            <div className={styles.subTree} style={{ paddingLeft: level > 0 ? 12 : 0 }}>
              {children.map(item => {
                const isFolder = item.type === "folder";
                const isExpanded = expandedFolders.has(item.id);
                
                return (
                  <div key={item.id} className={styles.treeNodeWrapper}>
                    <div 
                      className={`${styles.treeNode} ${isFolder ? styles.folderNode : styles.fileNode}`}
                      onClick={() => {
                        if (isFolder) {
                          const next = new Set(expandedFolders);
                          if (next.has(item.id)) next.delete(item.id);
                          else next.add(item.id);
                          setExpandedFolders(next);
                        } else {
                          navigate(`/notes/${item.id}`);
                        }
                      }}
                    >
                      <span className={styles.treeIcon}>
                        {isFolder ? (
                          isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                        ) : (
                          <FileText size={14} />
                        )}
                      </span>
                      {isFolder && <Folder size={16} className={styles.folderIcon} style={{ color: item.color }} />}
                      <span className={styles.nodeLabel}>{item.name}</span>
                    </div>
                    {isFolder && isExpanded && renderTree(item.id, level + 1)}
                  </div>
                );
              })}
            </div>
          );
        };

        return (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Seus Projetos</h3>
            <div className={styles.projectTree}>
              {renderTree(null)}
            </div>
          </div>
        );

      case "settings":
      default:
        return (
           <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Opções</h3>
              <p className={styles.emptyText}>Configurações e outras opções estarão aqui futuramente.</p>
           </div>
        );
    }
  };

  return (
    <div className={`${styles.sidebarWrapper} ${isPanelOpen ? styles.wrapperOpen : ""}`}>
      {/* Icon Rail */}
      <aside className={styles.iconRail}>
        <nav className={styles.nav}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabActive : ""}`}
              onClick={() => {
                if (tab.action) {
                  tab.action();
                } else if (activeTab === tab.id) {
                  // Toggle off — return to select/default
                  onTabChange("select" as SidebarTab);
                } else {
                  onTabChange(tab.id as SidebarTab);
                }
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
        
        <div className={styles.bottomNav}>
           <button
              className={`${styles.tabBtn} ${activeTab === "settings" ? styles.tabActive : ""}`}
              onClick={() => {
                if (activeTab === "settings") {
                  onTabChange("select" as SidebarTab);
                } else {
                  onTabChange("settings");
                }
              }}
            >
              <Settings size={24} strokeWidth={1.5} />
              <span>Config</span>
            </button>
        </div>
      </aside>

      {/* Drawer Panel */}
      <div className={styles.panelDrawer}>
         <div className={styles.toolPanelHeader}>
            <div className={styles.searchBar}>
               <input type="text" placeholder="Buscar opções..." />
            </div>
            {/* Can add a close button for mobile if needed */}
         </div>
         <div className={styles.toolPanelContent}>
           {renderPanelContent()}
         </div>
      </div>
    </div>
  );
};

export default UnifiedSidebar;
