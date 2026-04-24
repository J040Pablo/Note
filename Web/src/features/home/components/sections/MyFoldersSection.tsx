import React from "react";
import { Folder } from "lucide-react";
import styles from "../HomeFeed.module.css";

type FolderItem = {
  id: string;
  name: string;
  description?: string;
  notes: number;
};

type Props = {
  folders: FolderItem[];
  onFolderClick: (id: string, name: string) => void;
};

const MyFoldersSection: React.FC<Props> = ({ folders, onFolderClick }) => {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>My Folders</h2>
      </header>
      {folders.length === 0 ? (
        <div className={styles.emptyCard}>
          <p>No folders yet.</p>
        </div>
      ) : (
        <div className={styles.folderGrid}>
          {folders.map((folder) => (
            <button
              key={folder.id}
              className={styles.folderCard}
              onClick={() => onFolderClick(folder.id, folder.name)}
            >
              <Folder size={18} className={styles.folderIcon} />
              <div className={styles.folderInfo}>
                <span className={styles.folderName}>{folder.name}</span>
                <span className={styles.folderNotes}>{folder.notes} notes</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default MyFoldersSection;
