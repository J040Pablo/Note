import React, { useState } from "react";
import { Undo, Redo, Cloud, ChevronDown, Check, Share, Download, Grid, ArrowLeft } from "lucide-react";
import styles from "./EditorTopBar.module.css";
import AnimatedHomeMenu from "./AnimatedHomeMenu";

export interface EditorTopBarProps {
  title?: string;
  onTitleChange?: (t: string) => void;
  onTitleBlur?: () => void;
  onBack?: () => void;
  folderName?: string | null;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isSaving?: boolean;
  isDownloading?: boolean;
  onDownload?: () => void;
}

const EditorTopBar: React.FC<EditorTopBarProps> = ({
  title = "",
  onTitleChange,
  onTitleBlur,
  onBack,
  folderName,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isSaving = false,
  isDownloading = false,
  onDownload
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const toggleMenu = (menu: string) => {
    setActiveMenu(activeMenu === menu ? null : menu);
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: title || 'Canvas Note',
          url: window.location.href
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("Link copiado para a área de transferência!");
      }
    } catch (err) {
      console.log("Error sharing:", err);
    }
  };


  return (
    <header className={styles.topBar}>
      <div className={styles.leftSection}>
        <button 
          className={styles.backBtn} 
          onClick={onBack} 
          aria-label="Voltar"
          title="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        
        <AnimatedHomeMenu onBack={onBack} />
        
        <div className={styles.divider} />
        
        <div className={styles.relativeParent}>
          <button className={styles.menuBtn} onClick={() => toggleMenu("arquivo")}>
            Arquivo
          </button>
          {activeMenu === "arquivo" && <div className={styles.popover}>Em breve</div>}
        </div>
        
        <div className={styles.relativeParent}>
          <button className={styles.menuBtn} onClick={() => toggleMenu("resize")}>
             Redimensionar
          </button>
          {activeMenu === "resize" && <div className={styles.popover}>Em breve</div>}
        </div>

        <div className={styles.divider} />

        <button 
          className={styles.iconBtn} 
          onClick={onUndo} 
          disabled={!canUndo}
          aria-label="Desfazer"
        >
          <Undo size={18} />
        </button>
        <button 
          className={styles.iconBtn} 
          onClick={onRedo} 
          disabled={!canRedo}
          aria-label="Refazer"
        >
          <Redo size={18} />
        </button>

        <div className={styles.statusSection}>
          {isSaving ? (
             <span className={styles.statusText}><Cloud size={16} /> Salvando...</span>
          ) : (
             <span className={styles.statusText}><Check size={16} /> Salvo</span>
          )}
        </div>
      </div>

      <div className={styles.centerSection}>
          <input 
            type="text" 
            className={styles.titleInput} 
            value={title} 
            onChange={(e) => onTitleChange?.(e.target.value)}
            onBlur={onTitleBlur}
            placeholder="Nome do design..."
          />
          {folderName && (
             <span className={styles.folderBadge}>{folderName}</span>
          )}
      </div>

      <div className={styles.rightSection}>
        <div className={styles.relativeParent} style={{ display: 'flex' }}>
          <div className={styles.collaborators} onClick={() => toggleMenu("user")}>
            {/* Mock collaborator avatars */}
            <div className={styles.avatar} style={{ cursor: 'pointer' }}>P</div>
          </div>
          {activeMenu === "user" && <div className={`${styles.popover}`} style={{ right: 0, left: 'auto' }}>Em breve</div>}
        </div>
        
        <div className={styles.relativeParent}>
          <button className={styles.metricsBtn} onClick={() => toggleMenu("grid")}>
             <Grid size={16} />
          </button>
          {activeMenu === "grid" && <div className={`${styles.popover}`} style={{ right: 0, left: 'auto' }}>Em breve</div>}
        </div>

        <button className={styles.viewBtn}>
          <ChevronDown size={16} />
        </button>

        <button 
          className={styles.exportBtn} 
          onClick={onDownload} 
          disabled={isDownloading}
        >
          <Download size={16} className={isDownloading ? styles.spinner : ""} />
          <span>{isDownloading ? "Baixando..." : "Baixar"}</span>
        </button>

        <button className={styles.primaryBtn} onClick={handleShare}>
           <Share size={16} /> <span>Compartilhar</span>
        </button>
      </div>
    </header>
  );
};

export default EditorTopBar;
