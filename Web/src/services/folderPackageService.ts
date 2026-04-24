import JSZip from "jszip";
import { loadData, saveData, DataStore, DataFolder, DataNote, DataQuickNote, DataTask } from "./webData";

/**
 * Folder Package Service — Replicates Mobile folderPackageService.ts logic for Web.
 * Handles granular export and merge-based import of folder structures.
 */

interface FolderPackageManifest {
  schemaVersion: string;
  exportedAt: number;
  type: "folder-package";
  origin: "web";
  rootFolder: DataFolder;
  folders: DataFolder[];
  notes: DataNote[];
  quickNotes: DataQuickNote[];
  tasks: DataTask[];
}

const PACKAGE_SCHEMA_VERSION = "1.0.0";

/**
 * Collects all descendants and related items for a given folder ID.
 */
const resolveFolderTree = (rootId: string) => {
  const store = loadData();
  const rootFolder = store.folders.find(f => f.id === rootId);
  if (!rootFolder) throw new Error("Folder not found");

  const folders: DataFolder[] = [];
  const descendants = new Set<string>([rootId]);
  const stack = [rootId];

  // DFS to collect all subfolders
  while (stack.length > 0) {
    const currentId = stack.pop()!;
    const children = store.folders.filter(f => f.parentId === currentId);
    for (const child of children) {
      if (!descendants.has(child.id)) {
        descendants.add(child.id);
        folders.push(child);
        stack.push(child.id);
      }
    }
  }

  // Collect notes, quickNotes, and tasks linked to any collected folder
  const notes = store.notes.filter(n => n.folderId && descendants.has(n.folderId));
  const quickNotes = store.quickNotes.filter(q => q.folderId && descendants.has(q.folderId));
  const tasks = store.tasks.filter(t => t.parentId && descendants.has(t.parentId));

  return { rootFolder, folders, notes, quickNotes, tasks };
};

export const exportFolderPackage = async (folderId: string): Promise<void> => {
  try {
    const tree = resolveFolderTree(folderId);
    const zip = new JSZip();

    const manifest: FolderPackageManifest = {
      schemaVersion: PACKAGE_SCHEMA_VERSION,
      exportedAt: Date.now(),
      type: "folder-package",
      origin: "web",
      ...tree
    };

    zip.file("data.json", JSON.stringify(manifest, null, 2));

    const content = await zip.generateAsync({ 
      type: "blob",
      compression: "DEFLATE"
    });

    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    const safeName = tree.rootFolder.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    
    link.href = url;
    link.download = `${safeName}-${dateStr}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("[folder-package] export failed", error);
    throw error;
  }
};

export const importFolderPackage = async (file: File): Promise<void> => {
  try {
    const zip = await JSZip.loadAsync(file);
    const dataFile = zip.file("data.json");
    if (!dataFile) throw new Error("Invalid package: data.json not found");

    const manifest = JSON.parse(await dataFile.async("string")) as FolderPackageManifest;
    if (manifest.type !== "folder-package") throw new Error("Invalid package type");

    const store = loadData();
    const idMap = new Map<string, string>(); // oldId -> newId

    const generateId = (prefix: string) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e4)}`;

    // 1. Process root folder (clear parentId to make it a root folder in current workspace)
    const newRootId = generateId("folder");
    idMap.set(manifest.rootFolder.id, newRootId);
    
    const importedRoot: DataFolder = {
      ...manifest.rootFolder,
      id: newRootId,
      parentId: null, // Always import as root for safety
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    store.folders.push(importedRoot);

    // 2. Process subfolders
    for (const f of manifest.folders) {
      const newId = generateId("folder");
      idMap.set(f.id, newId);
    }

    for (const f of manifest.folders) {
      const newId = idMap.get(f.id)!;
      store.folders.push({
        ...f,
        id: newId,
        parentId: f.parentId ? (idMap.get(f.parentId) || null) : newRootId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // 3. Process Notes
    for (const n of manifest.notes) {
      const newId = generateId("note");
      store.notes.push({
        ...n,
        id: newId,
        folderId: n.folderId ? (idMap.get(n.folderId) ?? null) : null,
        parentId: n.folderId ? (idMap.get(n.folderId) ?? null) : null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // 4. Process Quick Notes
    for (const q of manifest.quickNotes) {
      const newId = generateId("qn");
      store.quickNotes.push({
        ...q,
        id: newId,
        folderId: q.folderId ? (idMap.get(q.folderId) ?? null) : null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    // 5. Process Tasks
    for (const t of manifest.tasks) {
      const newId = generateId("task");
      store.tasks.push({
        ...t,
        id: newId,
        parentId: t.parentId ? (idMap.get(t.parentId) || null) : null,
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    saveData(store);
  } catch (error) {
    console.error("[folder-package] import failed", error);
    throw error;
  }
};
