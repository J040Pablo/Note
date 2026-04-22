import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Crypto from "expo-crypto";
import { Share } from "react-native";
import JSZip from "jszip";
import { z } from "zod";
import type { AppFile, Folder, ID, Note, QuickNote } from "@models/types";
import { createFolder, getAllFolders } from "@services/foldersService";
import { createNote, createQuickNote, getAllNotes, getAllQuickNotes } from "@services/notesService";
import { createFileRecord, getAllFiles } from "@services/filesService";
import { useAppStore } from "@store/useAppStore";
import { useFilesStore } from "@store/useFilesStore";
import { useNotesStore } from "@store/useNotesStore";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { log, warn, error as logError } from '@utils/logger';

const PACKAGE_SCHEMA_VERSION = "1.0.0";
const PACKAGE_ROOT = `${FileSystem.cacheDirectory}folder-packages/`;
const INTERNAL_IMPORTED_ASSETS_ROOT = `${FileSystem.documentDirectory}imported-assets/`;
const URI_PROTOCOL = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

export type PackageConflictResolution = "create_new" | "rename" | "replace";
export type PackageStep =
  | "resolving"
  | "analyzing"
  | "collecting"
  | "copying_assets"
  | "writing_manifest"
  | "zipping"
  | "sharing"
  | "validating"
  | "resolving_conflicts"
  | "creating_folders"
  | "importing_files"
  | "importing_notes"
  | "finalizing";

export interface PackageProgressEvent {
  step: PackageStep;
  progress: number; // 0..1
  message: string;
  processed?: number;
  total?: number;
}

export interface PackageOperationOptions {
  signal?: { isCancelled: () => boolean };
  onProgress?: (event: PackageProgressEvent) => void;
  onMessage?: (message: string, tone?: "success" | "error") => void;
}

export interface ExportFolderPackageOptions extends PackageOperationOptions {
  fileNamePrefix?: string;
  shareAfterExport?: boolean;
}

export interface ImportFolderPackageOptions extends PackageOperationOptions {
  conflictResolution?: PackageConflictResolution;
  renameSuffix?: string;
}

const folderSnapshotSchema = z.object({
  oldId: z.string(),
  name: z.string(),
  parentOldId: z.string().nullable(),
  orderIndex: z.number(),
  color: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  photoPath: z.string().nullable().optional(),
  bannerPath: z.string().nullable().optional(),
  createdAt: z.number()
});

const noteSnapshotSchema = z.object({
  oldId: z.string(),
  folderOldId: z.string().nullable(),
  title: z.string(),
  content: z.string(),
  createdAt: z.number(),
  updatedAt: z.number()
});

const fileSnapshotSchema = z.object({
  oldId: z.string(),
  parentFolderOldId: z.string().nullable(),
  name: z.string(),
  type: z.enum(["pdf", "image", "document"]),
  pathRef: z.string(),
  description: z.string().nullable().optional(),
  thumbnailPathRef: z.string().nullable().optional(),
  bannerPathRef: z.string().nullable().optional(),
  hash: z.string().optional(),
  createdAt: z.number(),
  orderIndex: z.number()
});

const assetRefSchema = z.object({
  ownerType: z.enum(["note", "quickNote", "folder", "file"]),
  ownerOldId: z.string(),
  sourceField: z.string(),
  originalUri: z.string(),
  assetPath: z.string(),
  hash: z.string().optional(),
  mimeType: z.string().nullable().optional()
});

export const folderPackageManifestSchema = z.object({
  schemaVersion: z.string(),
  exportedAt: z.number(),
  rootFolder: folderSnapshotSchema,
  folders: z.array(folderSnapshotSchema),
  notes: z.array(noteSnapshotSchema),
  quickNotes: z.array(noteSnapshotSchema),
  files: z.array(fileSnapshotSchema),
  assetRefs: z.array(assetRefSchema),
  idMapHints: z.object({
    folders: z.record(z.string()).optional(),
    notes: z.record(z.string()).optional(),
    quickNotes: z.record(z.string()).optional(),
    files: z.record(z.string()).optional()
  }).optional()
});

export type FolderPackageManifest = z.infer<typeof folderPackageManifestSchema>;

export interface ExportFolderPackageResult {
  shareableUri: string;
  manifest: FolderPackageManifest;
  warnings: string[];
}

interface ImportFolderPackageResult {
  rootFolderId: ID | null;
  importedFolders: Folder[];
  importedNotes: Note[];
  importedQuickNotes: QuickNote[];
  importedFiles: AppFile[];
  warnings: string[];
  errors: string[];
}

const ensureDir = async (dir: string): Promise<void> => {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
};

const safeName = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, "_");

const emitProgress = (
  options: PackageOperationOptions | undefined,
  event: PackageProgressEvent
): void => {
  options?.onProgress?.(event);
};

const throwIfCancelled = (options?: PackageOperationOptions): void => {
  if (options?.signal?.isCancelled()) {
    throw new Error("Package operation cancelled");
  }
};

const normalizeUri = (value: string): string => {
  if (!value) return value;
  if (URI_PROTOCOL.test(value)) return value;
  return `file://${value}`;
};

const isLikelyLocalUri = (uri: string): boolean => uri.startsWith("file://") || uri.startsWith("content://");

const collectUrisFromNoteContent = (content: string): string[] => {
  const found = new Set<string>();

  // 1) Rich-note JSON blocks (image uri / drawing backgroundUri / canvas image elements)
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    for (const block of blocks as Array<Record<string, unknown>>) {
      if (typeof block?.uri === "string") found.add(block.uri);
      if (typeof block?.backgroundUri === "string") found.add(block.backgroundUri);
    }
    const elements = Array.isArray(parsed?.elements) ? parsed.elements : [];
    for (const el of elements as Array<Record<string, unknown>>) {
      if (el?.type === "image" && typeof el?.uri === "string") found.add(el.uri);
    }
  } catch {
    // Legacy/plain note content can be non-JSON; regex fallback below handles it.
  }

  // 2) Generic URI finder to catch legacy embeds inside text payload.
  const uriRegex = /((?:file|content):\/\/[^\s"'`\\)]+(?:\.[a-zA-Z0-9]+)?)/g;
  let match = uriRegex.exec(content);
  while (match) {
    if (match[1]) found.add(match[1]);
    match = uriRegex.exec(content);
  }

  return Array.from(found);
};

const rewriteContentUris = (content: string, uriMap: Record<string, string>): string => {
  let next = content;
  for (const [oldUri, newUri] of Object.entries(uriMap)) {
    if (!oldUri || !newUri) continue;
    next = next.split(oldUri).join(newUri);
  }
  return next;
};

const hashFile = async (uri: string): Promise<string> => {
  const contentBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, contentBase64);
};

const copyAssetToDir = async (
  sourceUri: string,
  assetDir: string,
  fallbackName: string,
  dedupByHash: Map<string, string>
): Promise<{ assetPath: string; hash: string }> => {
  const normalizedSource = normalizeUri(sourceUri);
  const srcInfo = await FileSystem.getInfoAsync(normalizedSource);
  if (!srcInfo.exists) {
    throw new Error(`Asset does not exist: ${sourceUri}`);
  }
  const hash = await hashFile(normalizedSource);
  const existing = dedupByHash.get(hash);
  if (existing) {
    return { assetPath: existing, hash };
  }

  const ext = fallbackName.includes(".") ? fallbackName.split(".").pop() : "bin";
  const baseName = `${hash.slice(0, 16)}_${safeName(fallbackName)}`;
  const finalName = baseName.endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`;
  const relativePath = `assets/${finalName}`;
  const destination = `${assetDir}/${finalName}`;
  await FileSystem.copyAsync({ from: normalizedSource, to: destination });
  dedupByHash.set(hash, relativePath);
  return { assetPath: relativePath, hash };
};

const resolveTreeByFolder = async (rootFolderId: ID): Promise<{
  rootFolder: Folder;
  folders: Folder[];
  notes: Note[];
  quickNotes: QuickNote[];
  files: AppFile[];
}> => {
  const [allFolders, allNotes, allQuickNotes, allFiles] = await Promise.all([
    getAllFolders(),
    getAllNotes(),
    getAllQuickNotes(),
    getAllFiles()
  ]);
  const rootFolder = allFolders.find((folder) => folder.id === rootFolderId);
  if (!rootFolder) {
    throw new Error("Selected root folder was not found");
  }

  const folderById = new Map(allFolders.map((folder) => [folder.id, folder]));
  const stack: ID[] = [rootFolderId];
  const pickedFolderIds = new Set<ID>();

  while (stack.length) {
    const currentId = stack.pop() as ID;
    if (pickedFolderIds.has(currentId)) continue;
    pickedFolderIds.add(currentId);
    for (const folder of allFolders) {
      if (folder.parentId === currentId) {
        stack.push(folder.id);
      }
    }
  }

  const folders = Array.from(pickedFolderIds)
    .map((id) => folderById.get(id))
    .filter(Boolean) as Folder[];
  const notes = allNotes.filter((note) => note.folderId && pickedFolderIds.has(note.folderId));
  const quickNotes = allQuickNotes.filter((note) => note.folderId && pickedFolderIds.has(note.folderId));
  const files = allFiles.filter((file) => file.parentFolderId && pickedFolderIds.has(file.parentFolderId));

  return { rootFolder, folders, notes, quickNotes, files };
};

const createStagingRoot = async (jobPrefix: string): Promise<{ root: string; assetsDir: string }> => {
  await ensureDir(PACKAGE_ROOT);
  const root = `${PACKAGE_ROOT}${jobPrefix}-${Date.now()}`;
  const assetsDir = `${root}/assets`;
  await ensureDir(root);
  await ensureDir(assetsDir);
  return { root, assetsDir };
};

const buildZipFromStaging = async (stagingRoot: string, zipPath: string): Promise<void> => {
  const zip = new JSZip();

  const walk = async (dir: string, prefix = ""): Promise<void> => {
    const entries = await FileSystem.readDirectoryAsync(dir);
    for (const entry of entries) {
      const absolute = `${dir}/${entry}`;
      const info = await FileSystem.getInfoAsync(absolute);
      if (!info.exists) continue;
      if (info.isDirectory) {
        await walk(absolute, `${prefix}${entry}/`);
      } else {
        const b64 = await FileSystem.readAsStringAsync(absolute, { encoding: FileSystem.EncodingType.Base64 });
        zip.file(`${prefix}${entry}`, b64, { base64: true });
      }
    }
  };

  await walk(stagingRoot);
  const outBase64 = await zip.generateAsync({ type: "base64", compression: "DEFLATE", compressionOptions: { level: 6 } });
  await FileSystem.writeAsStringAsync(zipPath, outBase64, { encoding: FileSystem.EncodingType.Base64 });
};

const maybeUnzipToStaging = async (fileUri: string, stagingRoot: string): Promise<string> => {
  // Initial implementation:
  // - If input is .json => treat as manifest file.
  // - If input is a directory => expect manifest.json inside.
  // - If input is .zip => unzip with JSZip in-memory.
  if (fileUri.endsWith(".json")) return fileUri;

  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists && info.isDirectory) {
    return `${fileUri}/manifest.json`;
  }

  if (!fileUri.endsWith(".zip")) {
    throw new Error("Unsupported package format. Expected .zip, folder, or manifest.json");
  }

  const zipBase64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(zipBase64, { base64: true });
  const files = Object.keys(zip.files);
  for (const rel of files) {
    const entry = zip.files[rel];
    if (entry.dir) {
      await ensureDir(`${stagingRoot}/${rel}`);
      continue;
    }
    const contentB64 = await entry.async("base64");
    const target = `${stagingRoot}/${rel}`;
    const folder = target.split("/").slice(0, -1).join("/");
    await ensureDir(folder);
    await FileSystem.writeAsStringAsync(target, contentB64, { encoding: FileSystem.EncodingType.Base64 });
  }
  return `${stagingRoot}/manifest.json`;
};

export const exportFolderPackage = async (
  folderId: string,
  options?: ExportFolderPackageOptions
): Promise<{ shareableUri: string; manifest: FolderPackageManifest }> => {
  emitProgress(options, { step: "analyzing", progress: 0.02, message: "Analyzing folder tree..." });
  throwIfCancelled(options);

  const tree = await resolveTreeByFolder(folderId);
  const { root, assetsDir } = await createStagingRoot("export");
  const dedupByHash = new Map<string, string>();
  const assetRefs: FolderPackageManifest["assetRefs"] = [];
  const noteContentMap = new Map<ID, string>();
  const quickNoteContentMap = new Map<ID, string>();

  const totalContentItems = tree.notes.length + tree.quickNotes.length + tree.files.length;
  let processed = 0;

  emitProgress(options, { step: "copying_assets", progress: 0.08, message: "Copying referenced media assets..." });

  for (const note of tree.notes) {
    throwIfCancelled(options);
    const uriMap: Record<string, string> = {};
    for (const uri of collectUrisFromNoteContent(note.content)) {
      if (!isLikelyLocalUri(uri)) continue;
      try {
        const fallbackName = uri.split("/").pop() || `note-${note.id}-asset`;
        const { assetPath, hash } = await copyAssetToDir(uri, assetsDir, fallbackName, dedupByHash);
        uriMap[uri] = assetPath;
        assetRefs.push({
          ownerType: "note",
          ownerOldId: note.id,
          sourceField: "content",
          originalUri: uri,
          assetPath,
          hash
        });
      } catch {
        // Best-effort: keep original URI if copy fails.
      }
    }
    noteContentMap.set(note.id, rewriteContentUris(note.content, uriMap));
    processed += 1;
    emitProgress(options, {
      step: "copying_assets",
      progress: 0.08 + (processed / Math.max(totalContentItems, 1)) * 0.52,
      message: "Processing note assets...",
      processed,
      total: totalContentItems
    });
  }

  for (const quickNote of tree.quickNotes) {
    throwIfCancelled(options);
    const uriMap: Record<string, string> = {};
    for (const uri of collectUrisFromNoteContent(quickNote.content)) {
      if (!isLikelyLocalUri(uri)) continue;
      try {
        const fallbackName = uri.split("/").pop() || `quick-note-${quickNote.id}-asset`;
        const { assetPath, hash } = await copyAssetToDir(uri, assetsDir, fallbackName, dedupByHash);
        uriMap[uri] = assetPath;
        assetRefs.push({
          ownerType: "quickNote",
          ownerOldId: quickNote.id,
          sourceField: "content",
          originalUri: uri,
          assetPath,
          hash
        });
      } catch {
        // Best-effort: keep original URI if copy fails.
      }
    }
    quickNoteContentMap.set(quickNote.id, rewriteContentUris(quickNote.content, uriMap));
    processed += 1;
  }

  const exportedFiles: FolderPackageManifest["files"] = [];
  for (const file of tree.files) {
    throwIfCancelled(options);
    try {
      const sourceName = file.path.split("/").pop() || file.name;
      const { assetPath, hash } = await copyAssetToDir(file.path, assetsDir, sourceName, dedupByHash);
      exportedFiles.push({
        oldId: file.id,
        parentFolderOldId: file.parentFolderId,
        name: file.name,
        type: file.type,
        pathRef: assetPath,
        description: file.description ?? null,
        thumbnailPathRef: null,
        bannerPathRef: null,
        hash,
        createdAt: file.createdAt,
        orderIndex: file.orderIndex
      });
      processed += 1;
    } catch {
      // Best-effort: skip invalid file paths.
    }
  }

  emitProgress(options, { step: "writing_manifest", progress: 0.72, message: "Writing manifest..." });

  const manifest: FolderPackageManifest = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    exportedAt: Date.now(),
    rootFolder: {
      oldId: tree.rootFolder.id,
      name: tree.rootFolder.name,
      parentOldId: tree.rootFolder.parentId ?? null,
      orderIndex: tree.rootFolder.orderIndex,
      color: tree.rootFolder.color ?? null,
      description: tree.rootFolder.description ?? null,
      photoPath: tree.rootFolder.photoPath ?? null,
      bannerPath: tree.rootFolder.bannerPath ?? null,
      createdAt: tree.rootFolder.createdAt
    },
    folders: tree.folders.map((folder) => ({
      oldId: folder.id,
      name: folder.name,
      parentOldId: folder.parentId ?? null,
      orderIndex: folder.orderIndex,
      color: folder.color ?? null,
      description: folder.description ?? null,
      photoPath: folder.photoPath ?? null,
      bannerPath: folder.bannerPath ?? null,
      createdAt: folder.createdAt
    })),
    notes: tree.notes.map((note) => ({
      oldId: note.id,
      folderOldId: note.folderId ?? null,
      title: note.title,
      content: noteContentMap.get(note.id) ?? note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    })),
    quickNotes: tree.quickNotes.map((note) => ({
      oldId: note.id,
      folderOldId: note.folderId ?? null,
      title: note.title,
      content: quickNoteContentMap.get(note.id) ?? note.content,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt
    })),
    files: exportedFiles,
    assetRefs,
    idMapHints: { folders: {}, notes: {}, quickNotes: {}, files: {} }
  };

  const manifestPath = `${root}/manifest.json`;
  await FileSystem.writeAsStringAsync(manifestPath, JSON.stringify(manifest, null, 2));

  emitProgress(options, { step: "zipping", progress: 0.86, message: "Compressing package..." });
  const base = options?.fileNamePrefix || tree.rootFolder.name || "folder-package";
  const zipName = `${safeName(base)}-${Date.now()}.zip`;
  const zipPath = `${PACKAGE_ROOT}${zipName}`;
  await buildZipFromStaging(root, zipPath);

  if (options?.shareAfterExport !== false) {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(zipPath, { mimeType: "application/zip", dialogTitle: "Share folder package" });
    }
  }

  emitProgress(options, { step: "finalizing", progress: 1, message: "Folder package exported." });
  options?.onMessage?.("Pacote exportado com sucesso", "success");
  return { shareableUri: zipPath, manifest };
};

export interface ExportFolderPackageAndShareOptions extends ExportFolderPackageOptions {
  shareDialogTitle?: string;
}

const guessMimeTypeFromPath = (assetPath: string): string | null => {
  const ext = (assetPath.split(".").pop() || "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf";
  if (ext === "json") return "application/json";
  if (ext === "txt") return "text/plain";
  return null;
};

/**
 * Exporta uma pasta completa (subpastas, notes, quick notes e arquivos) para ZIP
 * e dispara o compartilhamento. Esta funcao foi pensada para uso direto em FAB/botoes.
 *
 * Etapas emitidas no onProgress:
 * - resolving
 * - copying_assets
 * - writing_manifest
 * - zipping
 * - sharing
 */
export const exportFolderPackageAndShare = async (
  folderId: string,
  options?: ExportFolderPackageAndShareOptions
): Promise<ExportFolderPackageResult> => {
  const warnings: string[] = [];

  emitProgress(options, { step: "resolving", progress: 0.02, message: "Resolving folder subtree..." });
  throwIfCancelled(options);

  try {
    // 1) DFS da subarvore inteira para manter hierarquia original no manifest.
    // Este eh o caminho usado quando o usuario escolhe "Compartilhar" em uma pasta.
    // Compartilhamento de arquivo individual continua no fluxo existente de files/share.
    const tree = await resolveTreeByFolder(folderId);
    const { root, assetsDir } = await createStagingRoot("export");
    const dedupByHash = new Map<string, string>();
    const assetRefs: FolderPackageManifest["assetRefs"] = [];
    const noteContentMap = new Map<ID, string>();
    const quickNoteContentMap = new Map<ID, string>();

    const totalItems = tree.notes.length + tree.quickNotes.length + tree.files.length;
    let processed = 0;
    emitProgress(options, { step: "copying_assets", progress: 0.1, message: "Copying assets and files..." });

    // 2) Parse rich content/canvas e copia assets das notes para staging/assets.
    for (const note of tree.notes) {
      throwIfCancelled(options);
      const uriMap: Record<string, string> = {};
      for (const uri of collectUrisFromNoteContent(note.content)) {
        if (!isLikelyLocalUri(uri)) continue;
        try {
          const fallbackName = uri.split("/").pop() || `note-${note.id}-asset`;
          const copied = await copyAssetToDir(uri, assetsDir, fallbackName, dedupByHash);
          uriMap[uri] = copied.assetPath;
          assetRefs.push({
            ownerType: "note",
            ownerOldId: note.id,
            sourceField: "content",
            originalUri: uri,
            assetPath: copied.assetPath,
            hash: copied.hash,
            mimeType: guessMimeTypeFromPath(copied.assetPath)
          });
        } catch (error) {
          warnings.push(`Note asset skipped (${note.title}): ${(error as Error).message}`);
        }
      }
      // 3) Remapeia URIs internas para assets/<file>.
      noteContentMap.set(note.id, rewriteContentUris(note.content, uriMap));
      processed += 1;
      emitProgress(options, {
        step: "copying_assets",
        progress: 0.1 + (processed / Math.max(totalItems, 1)) * 0.5,
        message: "Copying note/quick-note assets...",
        processed,
        total: totalItems
      });
    }

    for (const quickNote of tree.quickNotes) {
      throwIfCancelled(options);
      const uriMap: Record<string, string> = {};
      for (const uri of collectUrisFromNoteContent(quickNote.content)) {
        if (!isLikelyLocalUri(uri)) continue;
        try {
          const fallbackName = uri.split("/").pop() || `quick-note-${quickNote.id}-asset`;
          const copied = await copyAssetToDir(uri, assetsDir, fallbackName, dedupByHash);
          uriMap[uri] = copied.assetPath;
          assetRefs.push({
            ownerType: "quickNote",
            ownerOldId: quickNote.id,
            sourceField: "content",
            originalUri: uri,
            assetPath: copied.assetPath,
            hash: copied.hash,
            mimeType: guessMimeTypeFromPath(copied.assetPath)
          });
        } catch (error) {
          warnings.push(`Quick note asset skipped (${quickNote.title}): ${(error as Error).message}`);
        }
      }
      quickNoteContentMap.set(quickNote.id, rewriteContentUris(quickNote.content, uriMap));
      processed += 1;
      emitProgress(options, {
        step: "copying_assets",
        progress: 0.1 + (processed / Math.max(totalItems, 1)) * 0.5,
        message: "Copying note/quick-note assets...",
        processed,
        total: totalItems
      });
    }

    // 4) Copia arquivos fisicos da subarvore para assets/ com hash+safeName.
    const exportedFiles: FolderPackageManifest["files"] = [];
    for (const file of tree.files) {
      throwIfCancelled(options);
      try {
        const sourceName = file.path.split("/").pop() || file.name;
        const copied = await copyAssetToDir(file.path, assetsDir, sourceName, dedupByHash);
        assetRefs.push({
          ownerType: "file",
          ownerOldId: file.id,
          sourceField: "path",
          originalUri: file.path,
          assetPath: copied.assetPath,
          hash: copied.hash,
          mimeType: guessMimeTypeFromPath(copied.assetPath)
        });
        exportedFiles.push({
          oldId: file.id,
          parentFolderOldId: file.parentFolderId,
          name: file.name,
          type: file.type,
          pathRef: copied.assetPath,
          description: file.description ?? null,
          thumbnailPathRef: null,
          bannerPathRef: null,
          hash: copied.hash,
          createdAt: file.createdAt,
          orderIndex: file.orderIndex
        });
      } catch (error) {
        warnings.push(`File skipped (${file.name}): ${(error as Error).message}`);
      }
      processed += 1;
      emitProgress(options, {
        step: "copying_assets",
        progress: 0.1 + (processed / Math.max(totalItems, 1)) * 0.5,
        message: "Copying note/quick-note assets...",
        processed,
        total: totalItems
      });
    }

    emitProgress(options, { step: "writing_manifest", progress: 0.64, message: "Writing manifest..." });

    const manifest: FolderPackageManifest = {
      schemaVersion: PACKAGE_SCHEMA_VERSION,
      exportedAt: Date.now(),
      rootFolder: {
        oldId: tree.rootFolder.id,
        name: tree.rootFolder.name,
        parentOldId: tree.rootFolder.parentId ?? null,
        orderIndex: tree.rootFolder.orderIndex,
        color: tree.rootFolder.color ?? null,
        description: tree.rootFolder.description ?? null,
        photoPath: tree.rootFolder.photoPath ?? null,
        bannerPath: tree.rootFolder.bannerPath ?? null,
        createdAt: tree.rootFolder.createdAt
      },
      folders: tree.folders.map((folder) => ({
        oldId: folder.id,
        name: folder.name,
        parentOldId: folder.parentId ?? null,
        orderIndex: folder.orderIndex,
        color: folder.color ?? null,
        description: folder.description ?? null,
        photoPath: folder.photoPath ?? null,
        bannerPath: folder.bannerPath ?? null,
        createdAt: folder.createdAt
      })),
      notes: tree.notes.map((note) => ({
        oldId: note.id,
        folderOldId: note.folderId ?? null,
        title: note.title,
        content: noteContentMap.get(note.id) ?? note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      })),
      quickNotes: tree.quickNotes.map((note) => ({
        oldId: note.id,
        folderOldId: note.folderId ?? null,
        title: note.title,
        content: quickNoteContentMap.get(note.id) ?? note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
      })),
      files: exportedFiles,
      assetRefs,
      // Mantemos oldId hints para o app destino reconstruir referencias quando quiser.
      idMapHints: { folders: {}, notes: {}, quickNotes: {}, files: {} }
    };

    // 5) Estrutura final do ZIP: manifest + assets + payload opcional com hierarquia legivel.
    await FileSystem.writeAsStringAsync(`${root}/manifest.json`, JSON.stringify(manifest, null, 2));
    const payloadRoot = `${root}/payload`;
    const payloadFolders = `${payloadRoot}/folders`;
    await ensureDir(payloadFolders);
    await FileSystem.writeAsStringAsync(`${payloadRoot}/notes.json`, JSON.stringify(manifest.notes, null, 2));
    await FileSystem.writeAsStringAsync(`${payloadRoot}/quickNotes.json`, JSON.stringify(manifest.quickNotes, null, 2));
    await FileSystem.writeAsStringAsync(`${payloadRoot}/files.json`, JSON.stringify(manifest.files, null, 2));
    await FileSystem.writeAsStringAsync(`${payloadRoot}/folders.json`, JSON.stringify(manifest.folders, null, 2));

    // Cria arvores de pasta simbolicas no payload para depuracao/importadores alternativos.
    const byParent = new Map<string | null, Array<{ oldId: string; name: string }>>();
    for (const folder of manifest.folders) {
      const list = byParent.get(folder.parentOldId) || [];
      list.push({ oldId: folder.oldId, name: folder.name });
      byParent.set(folder.parentOldId, list);
    }
    const queue: Array<{ oldId: string; parentOldId: string | null; chain: string[] }> = [
      { oldId: manifest.rootFolder.oldId, parentOldId: manifest.rootFolder.parentOldId, chain: [safeName(manifest.rootFolder.name)] }
    ];
    while (queue.length) {
      const current = queue.shift() as { oldId: string; parentOldId: string | null; chain: string[] };
      const dir = `${payloadFolders}/${current.chain.join("/")}`;
      await ensureDir(dir);
      const localNotes = manifest.notes.filter((note) => note.folderOldId === current.oldId);
      const localQuick = manifest.quickNotes.filter((note) => note.folderOldId === current.oldId);
      const localFiles = manifest.files.filter((file) => file.parentFolderOldId === current.oldId);
      await FileSystem.writeAsStringAsync(
        `${dir}/index.json`,
        JSON.stringify({ folderOldId: current.oldId, notes: localNotes, quickNotes: localQuick, files: localFiles }, null, 2)
      );
      const children = byParent.get(current.oldId) || [];
      for (const child of children) {
        queue.push({ oldId: child.oldId, parentOldId: current.oldId, chain: [...current.chain, safeName(child.name)] });
      }
    }

    emitProgress(options, { step: "zipping", progress: 0.82, message: "Creating ZIP..." });
    const zipName = `${safeName(options?.fileNamePrefix || tree.rootFolder.name || "folder-package")}-${Date.now()}.zip`;
    const zipPath = `${PACKAGE_ROOT}${zipName}`;
    await buildZipFromStaging(root, zipPath);

    emitProgress(options, { step: "sharing", progress: 0.94, message: "Sharing package..." });
    const canShareNatively = await Sharing.isAvailableAsync();
    if (!zipPath.endsWith(".zip")) {
      throw new Error("Export did not generate a ZIP file.");
    }
    if (canShareNatively) {
      await Sharing.shareAsync(zipPath, {
        mimeType: "application/zip",
        dialogTitle: options?.shareDialogTitle ?? "Share folder package"
      });
    } else {
      warn(
        "[folder-package] expo-sharing unavailable; falling back to Share.share. Some apps may not support ZIP attachments."
      );
      await Share.share({
        title: options?.shareDialogTitle ?? "Share folder package",
        url: zipPath
      });
    }

    emitProgress(options, { step: "sharing", progress: 1, message: "Package shared successfully." });
    if (warnings.length) {
      options?.onMessage?.(`Pacote compartilhado com ${warnings.length} avisos`, "error");
    } else {
      options?.onMessage?.("Pacote exportado e compartilhado com sucesso", "success");
    }
    return { shareableUri: zipPath, manifest, warnings };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error during export/share.";
    options?.onMessage?.(`Falha ao exportar/compartilhar: ${reason}`, "error");
    throw new Error(`Could not export and share folder package: ${reason}`);
  }
};

const applyConflictNameRule = (
  name: string,
  existingNames: Set<string>,
  resolution: PackageConflictResolution,
  suffix: string
): string => {
  if (resolution === "replace") return name;
  if (!existingNames.has(name)) return name;
  if (resolution === "rename") return `${name} ${suffix}`;
  return `${name} (import ${new Date().toISOString().slice(0, 10)})`;
};

export const importFolderPackage = async (
  fileUri: string,
  destinationFolderId: string | null = null,
  options?: ImportFolderPackageOptions
): Promise<ImportFolderPackageResult> => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const conflictResolution = options?.conflictResolution ?? "create_new";
  const renameSuffix = options?.renameSuffix ?? "(imported)";

  emitProgress(options, { step: "validating", progress: 0.02, message: "Opening package..." });
  throwIfCancelled(options);

  const staging = await createStagingRoot("import");
  const manifestPath = await maybeUnzipToStaging(fileUri, staging.root);
  const rawManifest = await FileSystem.readAsStringAsync(manifestPath);
  const parseResult = folderPackageManifestSchema.safeParse(JSON.parse(rawManifest));
  if (!parseResult.success) {
    throw new Error(`Invalid package manifest: ${parseResult.error.message}`);
  }
  const manifest = parseResult.data;
  if (manifest.schemaVersion !== PACKAGE_SCHEMA_VERSION) {
    throw new Error(`Unsupported schema version: ${manifest.schemaVersion}`);
  }

  emitProgress(options, { step: "resolving_conflicts", progress: 0.12, message: "Resolving folder conflicts..." });

  const existingFolders = await getAllFolders();
  const existingRootNames = new Set(existingFolders.filter((f) => f.parentId === destinationFolderId).map((f) => f.name));
  const oldToNewFolderId = new Map<ID, ID>();
  const importedFolders: Folder[] = [];
  const importedNotes: Note[] = [];
  const importedQuickNotes: QuickNote[] = [];
  const importedFiles: AppFile[] = [];

  const foldersByDepth = [...manifest.folders].sort((a, b) => {
    const depth = (node: { parentOldId: string | null }, map: Map<string, string | null>): number => {
      let d = 0;
      let current = node.parentOldId;
      while (current) {
        d += 1;
        current = map.get(current) ?? null;
      }
      return d;
    };
    const parents = new Map(manifest.folders.map((f) => [f.oldId, f.parentOldId]));
    return depth(a, parents) - depth(b, parents);
  });

  emitProgress(options, {
    step: "creating_folders",
    progress: 0.2,
    message: "Creating folders and subfolders...",
    processed: 0,
    total: foldersByDepth.length
  });

  for (let i = 0; i < foldersByDepth.length; i += 1) {
    throwIfCancelled(options);
    const sourceFolder = foldersByDepth[i];
    try {
      const parentMapped =
        sourceFolder.oldId === manifest.rootFolder.oldId
          ? destinationFolderId
          : sourceFolder.parentOldId
            ? (oldToNewFolderId.get(sourceFolder.parentOldId) ?? destinationFolderId)
            : destinationFolderId;

      let folderName = sourceFolder.name;
      if (sourceFolder.oldId === manifest.rootFolder.oldId) {
        folderName = applyConflictNameRule(folderName, existingRootNames, conflictResolution, renameSuffix);
      }

      const created = await createFolder(
        folderName,
        parentMapped ?? null,
        sourceFolder.color ?? null,
        sourceFolder.description ?? null,
        sourceFolder.photoPath ?? null,
        sourceFolder.bannerPath ?? null
      );
      oldToNewFolderId.set(sourceFolder.oldId, created.id);
      importedFolders.push(created);
    } catch (error) {
      errors.push(`Folder ${sourceFolder.name}: ${(error as Error).message}`);
    }

    emitProgress(options, {
      step: "creating_folders",
      progress: 0.2 + ((i + 1) / Math.max(foldersByDepth.length, 1)) * 0.25,
      message: "Creating folders and subfolders...",
      processed: i + 1,
      total: foldersByDepth.length
    });
  }

  await ensureDir(INTERNAL_IMPORTED_ASSETS_ROOT);
  const dedupHashToInternalPath = new Map<string, string>();

  emitProgress(options, {
    step: "importing_files",
    progress: 0.48,
    message: "Importing files...",
    processed: 0,
    total: manifest.files.length
  });

  const importedAssetUriMap: Record<string, string> = {};
  for (let i = 0; i < manifest.files.length; i += 1) {
    throwIfCancelled(options);
    const file = manifest.files[i];
    try {
      const sourceAbsolute = `${staging.root}/${file.pathRef}`;
      const info = await FileSystem.getInfoAsync(sourceAbsolute);
      if (!info.exists) {
        warnings.push(`Missing file asset: ${file.pathRef}`);
        continue;
      }

      const hash = file.hash ?? (await hashFile(sourceAbsolute));
      let importedPhysicalPath = dedupHashToInternalPath.get(hash);
      if (!importedPhysicalPath) {
        const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
        const fileName = `${hash.slice(0, 16)}_${safeName(file.name)}.${ext}`;
        importedPhysicalPath = `${INTERNAL_IMPORTED_ASSETS_ROOT}${fileName}`;
        const existingInfo = await FileSystem.getInfoAsync(importedPhysicalPath);
        if (!existingInfo.exists) {
          await FileSystem.copyAsync({ from: sourceAbsolute, to: importedPhysicalPath });
        }
        dedupHashToInternalPath.set(hash, importedPhysicalPath);
      }

      const parentFolderId = file.parentFolderOldId ? (oldToNewFolderId.get(file.parentFolderOldId) ?? null) : null;
      const created = await createFileRecord({
        name: file.name,
        type: file.type,
        path: importedPhysicalPath,
        parentFolderId,
        description: file.description ?? null
      });
      importedFiles.push(created);
      importedAssetUriMap[file.pathRef] = importedPhysicalPath;
    } catch (error) {
      errors.push(`File ${file.name}: ${(error as Error).message}`);
    }

    emitProgress(options, {
      step: "importing_files",
      progress: 0.48 + ((i + 1) / Math.max(manifest.files.length, 1)) * 0.2,
      message: "Importing files...",
      processed: i + 1,
      total: manifest.files.length
    });
  }

  // Import note/quick-note assets (images/drawings embedded in content).
  for (const assetRef of manifest.assetRefs) {
    try {
      const sourceAbsolute = `${staging.root}/${assetRef.assetPath}`;
      const info = await FileSystem.getInfoAsync(sourceAbsolute);
      if (!info.exists) continue;
      const hash = assetRef.hash ?? (await hashFile(sourceAbsolute));
      let importedPath = dedupHashToInternalPath.get(hash);
      if (!importedPath) {
        const originalName = assetRef.assetPath.split("/").pop() || `${hash}.bin`;
        importedPath = `${INTERNAL_IMPORTED_ASSETS_ROOT}${safeName(originalName)}`;
        const exists = await FileSystem.getInfoAsync(importedPath);
        if (!exists.exists) {
          await FileSystem.copyAsync({ from: sourceAbsolute, to: importedPath });
        }
        dedupHashToInternalPath.set(hash, importedPath);
      }
      importedAssetUriMap[assetRef.assetPath] = importedPath;
    } catch (error) {
      warnings.push(`Asset ${assetRef.assetPath}: ${(error as Error).message}`);
    }
  }

  emitProgress(options, { step: "importing_notes", progress: 0.72, message: "Importing notes and quick notes..." });

  for (const note of manifest.notes) {
    throwIfCancelled(options);
    try {
      const folderId = note.folderOldId ? (oldToNewFolderId.get(note.folderOldId) ?? null) : null;
      const remappedContent = rewriteContentUris(note.content, importedAssetUriMap);
      const created = await createNote({
        title: note.title,
        content: remappedContent,
        folderId
      });
      importedNotes.push(created);
    } catch (error) {
      errors.push(`Note ${note.title}: ${(error as Error).message}`);
    }
  }

  for (const note of manifest.quickNotes) {
    throwIfCancelled(options);
    try {
      const folderId = note.folderOldId ? (oldToNewFolderId.get(note.folderOldId) ?? null) : null;
      const remappedContent = rewriteContentUris(note.content, importedAssetUriMap);
      const created = await createQuickNote({
        title: note.title,
        content: remappedContent,
        folderId
      });
      importedQuickNotes.push(created);
    } catch (error) {
      errors.push(`QuickNote ${note.title}: ${(error as Error).message}`);
    }
  }

  // Reflect imported entities immediately in stores for Home/Folders screens.
  const appStore = useAppStore.getState();
  const notesStore = useNotesStore.getState();
  const quickNotesStore = useQuickNotesStore.getState();
  const filesStore = useFilesStore.getState();
  importedFolders.forEach((item) => appStore.upsertFolder(item));
  importedNotes.forEach((item) => notesStore.upsertNote(item));
  importedQuickNotes.forEach((item) => quickNotesStore.upsertQuickNote(item));
  importedFiles.forEach((item) => filesStore.upsertFile(item));

  emitProgress(options, { step: "finalizing", progress: 1, message: "Import finished." });
  if (!errors.length) {
    options?.onMessage?.("Pacote importado com sucesso", "success");
  } else {
    options?.onMessage?.("Importacao concluida com alertas", "error");
  }

  return {
    rootFolderId: oldToNewFolderId.get(manifest.rootFolder.oldId) ?? null,
    importedFolders,
    importedNotes,
    importedQuickNotes,
    importedFiles,
    warnings,
    errors
  };
};

export const folderPackageService = {
  exportFolderPackage,
  exportFolderPackageAndShare,
  importFolderPackage,
  schemas: {
    manifest: folderPackageManifestSchema
  }
};

