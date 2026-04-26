import React from "react";
import { Monitor, LayoutGrid, Maximize2, HelpCircle } from "lucide-react";
import styles from "./BottomBar.module.css";

interface BottomBarProps {
  zoom: number;
  setZoom: (z: number) => void;
  pageCount: number;
  onGridClick: () => void;
  onCenterCanvas?: () => void;
}

const BottomBar: React.FC<BottomBarProps> = ({ zoom, setZoom, pageCount, onGridClick, onCenterCanvas }) => {
  return (
    <footer className={styles.bottomBar}>
      <div className={styles.leftSection}>
         <button className={styles.iconBtn} aria-label="Editor Web mode">
           <Monitor size={16} />
         </button>
      </div>

      <div className={styles.centerSection}>
         <button className={styles.notesBtn} onClick={onGridClick}>
           {pageCount} {pageCount === 1 ? 'página' : 'páginas'}
         </button>
      </div>

      <div className={styles.rightSection}>
         <span className={styles.zoomText}>{Math.round(zoom * 100)}%</span>
         <input 
           type="range" 
           min="0.25" max="3.0" step="0.05"
           value={zoom} 
           onChange={(e) => setZoom(parseFloat(e.target.value))} 
           className={styles.zoomSlider} 
         />
         
         <div className={styles.divider} />

         <button className={styles.iconBtn} onClick={onGridClick}>
            <LayoutGrid size={16} />
         </button>
         <button className={styles.iconBtn} onClick={onCenterCanvas} title="Centralizar Canvas">
            <Maximize2 size={16} />
         </button>
         <button className={styles.iconBtn}>
            <HelpCircle size={16} />
         </button>
      </div>
    </footer>
  );
};

export default BottomBar;
