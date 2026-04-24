import JSZip from "jszip";
import { loadData, DataStore } from "./webData";

/**
 * Backup Service — Web implementation mirroring Mobile folderPackageService logic.
 * Generates a ZIP file containing data.json and meta.json.
 */

interface BackupMeta {
  version: string;
  exportedAt: number;
  origin: "web";
  app: string;
}

export const exportCompleteBackup = async (): Promise<void> => {
  try {
    const data = loadData();
    const zip = new JSZip();

    const meta: BackupMeta = {
      version: "1.0.0",
      exportedAt: Date.now(),
      origin: "web",
      app: "Note",
    };

    // Parallelize serialization
    zip.file("data.json", JSON.stringify(data, null, 2));
    zip.file("meta.json", JSON.stringify(meta, null, 2));

    const content = await zip.generateAsync({ 
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    // Browser download trigger
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.href = url;
    link.download = `note-backup-${dateStr}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("[backup] export failed", error);
    throw error;
  }
};

export const importBackupFile = async (file: File): Promise<DataStore> => {
  try {
    const zip = await JSZip.loadAsync(file);
    
    const dataFile = zip.file("data.json");
    if (!dataFile) {
      throw new Error("Invalid backup: data.json not found");
    }

    const dataRaw = await dataFile.async("string");
    const data = JSON.parse(dataRaw) as DataStore;

    // Basic validation
    if (!data.folders || !data.notes || !data.tasks) {
      throw new Error("Invalid backup: data structure is incomplete");
    }

    return data;
  } catch (error) {
    console.error("[backup] import failed", error);
    throw error;
  }
};
