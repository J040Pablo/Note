import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import JSZip from "jszip";
import { Alert } from "react-native";
import { getDB, runDbWrite, withDbWriteTransaction } from "@db/database";
import { getAllFolders } from "./foldersService";
import { getAllNotes } from "./notesService";
import { getAllTasks } from "./tasksService";
import { getAllFiles } from "./filesService";
import { reloadAllStoresFromDatabase } from "@hooks/useInitializeStores";
import { log, error as logError } from '@utils/logger';

const BACKUP_DIR = `${FileSystem.cacheDirectory}backups/`;

interface CompleteBackupData {
  folders: any[];
  notes: any[];
  quick_notes: any[];
  tasks: any[];
  attachments: any[];
  files: any[];
  app_meta: any[];
}

interface BackupManifest {
  type: "complete-backup";
  schemaVersion: string;
  exportedAt: number;
  origin: "mobile";
  appName: string;
}

const ensureDir = async (dir: string): Promise<void> => {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
};

export const exportCompleteBackup = async (): Promise<void> => {
  try {
    const db = await getDB();
    
    // Collect all data from SQLite tables
    const [folders, notes, quick_notes, tasks, attachments, files, app_meta] = await Promise.all([
      db.getAllAsync("SELECT * FROM folders"),
      db.getAllAsync("SELECT * FROM notes"),
      db.getAllAsync("SELECT * FROM quick_notes"),
      db.getAllAsync("SELECT * FROM tasks"),
      db.getAllAsync("SELECT * FROM attachments"),
      db.getAllAsync("SELECT * FROM files"),
      db.getAllAsync("SELECT * FROM app_meta"),
    ]);

    const data: CompleteBackupData = {
      folders,
      notes,
      quick_notes,
      tasks,
      attachments,
      files,
      app_meta,
    };

    const manifest: BackupManifest = {
      type: "complete-backup",
      schemaVersion: "1.0.0",
      exportedAt: Date.now(),
      origin: "mobile",
      appName: "Life Organizer",
    };

    const zip = new JSZip();
    zip.file("data.json", JSON.stringify(data, null, 2));
    zip.file("meta.json", JSON.stringify(manifest, null, 2));

    // Optional: Include physical files from documentDirectory if they exist
    // For now, focusing on the core database dump as requested.

    const zipBase64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE", compressionOptions: { level: 6 } });
    
    await ensureDir(BACKUP_DIR);
    const fileName = `backup-${Date.now()}.zip`;
    const zipPath = `${BACKUP_DIR}${fileName}`;
    
    await FileSystem.writeAsStringAsync(zipPath, zipBase64, { encoding: FileSystem.EncodingType.Base64 });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(zipPath, { mimeType: "application/zip", dialogTitle: "Export Complete Backup" });
    } else {
      Alert.alert("Success", "Backup saved to cache. Sharing unavailable.");
    }
  } catch (err) {
    logError("[backup] export failed", err);
    Alert.alert("Export Error", "Details logged to console.");
  }
};

export const importCompleteBackup = async (fileUri: string): Promise<void> => {
  try {
    const zipBase64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
    const zip = await JSZip.loadAsync(zipBase64, { base64: true });
    
    const metaFile = zip.file("meta.json");
    const dataFile = zip.file("data.json");
    
    if (!metaFile || !dataFile) {
      throw new Error("Invalid backup file: Missing meta.json or data.json");
    }

    const meta = JSON.parse(await metaFile.async("string")) as BackupManifest;
    if (meta.type !== "complete-backup") {
      throw new Error(`Invalid backup type: ${meta.type}`);
    }

    const data = JSON.parse(await dataFile.async("string")) as CompleteBackupData;

    await withDbWriteTransaction("importCompleteBackup", async (db) => {
      // Clear all existing data
      await db.runAsync("DELETE FROM folders");
      await db.runAsync("DELETE FROM notes");
      await db.runAsync("DELETE FROM quick_notes");
      await db.runAsync("DELETE FROM tasks");
      await db.runAsync("DELETE FROM attachments");
      await db.runAsync("DELETE FROM files");
      await db.runAsync("DELETE FROM app_meta");
      await db.runAsync("DELETE FROM notifications");

      // Helper for batch inserts
      const batchInsert = async (table: string, items: any[]) => {
        if (!items || items.length === 0) return;
        const keys = Object.keys(items[0]);
        const placeholders = keys.map(() => "?").join(", ");
        const sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
        
        for (const item of items) {
          const values = keys.map(k => item[k]);
          await db.runAsync(sql, ...values);
        }
      };

      await batchInsert("folders", data.folders);
      await batchInsert("notes", data.notes);
      await batchInsert("quick_notes", data.quick_notes);
      await batchInsert("tasks", data.tasks);
      await batchInsert("attachments", data.attachments);
      await batchInsert("files", data.files);
      await batchInsert("app_meta", data.app_meta);
    });

    // Refresh application stores
    await reloadAllStoresFromDatabase();
    
    Alert.alert("Success", "Backup restored successfully. Your data has been updated.");

  } catch (err) {
    logError("[backup] import failed", err);
    Alert.alert("Import Error", err instanceof Error ? err.message : "Details logged to console.");
  }
};
