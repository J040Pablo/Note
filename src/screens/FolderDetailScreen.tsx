import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, ScrollView, Modal, TextInput, Alert, Share } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { PrimaryButton } from "@components/PrimaryButton";
import { FolderNameModal } from "@components/FolderNameModal";
import { FolderIcon } from "@components/FolderIcon";
import { FileIcon } from "@components/FileIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { NoteEditModal } from "@components/NoteEditModal";
import { useTheme } from "@hooks/useTheme";
import type { CompositeNavigationProp, RouteProp } from "@react-navigation/native";
import type { FoldersStackParamList, RootStackParamList } from "@navigation/RootNavigator";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useAppStore } from "@store/useAppStore";
import { useNotesStore } from "@store/useNotesStore";
import { useFilesStore } from "@store/useFilesStore";
import { createFolder, deleteFolder, getFoldersByParent, updateFolder } from "@services/foldersService";
import { deleteNote, getNotesByFolder, updateNote } from "@services/notesService";
import { addRecentOpen, getPinnedItems, savePinnedItems } from "@services/appMetaService";
import {
  deleteFile,
  getFilesByFolder,
  getFileTypeIcon,
  importFileFromDevice,
  moveFileToFolder,
  openExternalFile,
  renameFile
} from "@services/filesService";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppFile, Folder, Note } from "@models/types";
import { Ionicons } from "@expo/vector-icons";

const firstLine = (text: string): string => {
  const line = (text || "").split(/\r?\n/).find((x) => x.trim().length > 0) ?? "";
  return line.length > 80 ? line.slice(0, 77).trimEnd() + "…" : line;
};

type FolderDetailRoute = RouteProp<FoldersStackParamList, "FolderDetail">;
type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<FoldersStackParamList, "FolderDetail">,
  NativeStackNavigationProp<RootStackParamList>
>;

type MixedItem =
  | { id: string; kind: "folder"; folder: Folder }
  | { id: string; kind: "note"; note: Note }
  | { id: string; kind: "file"; file: AppFile };

const FolderDetailScreen: React.FC = () => {
  const { theme } = useTheme();
  const route = useRoute<FolderDetailRoute>();
  const navigation = useNavigation<Nav>();
  const { folderId, trail: routeTrail } = route.params;

  const folders = useAppStore((s) => s.folders);
  const upsertFolder = useAppStore((s) => s.upsertFolder);
  const removeFolder = useAppStore((s) => s.removeFolder);
  const pinnedItems = useAppStore((s) => s.pinnedItems);
  const togglePinned = useAppStore((s) => s.togglePinned);
  const setPinnedItems = useAppStore((s) => s.setPinnedItems);
  const setRecentItems = useAppStore((s) => s.setRecentItems);
  const notes = useNotesStore((s) => s.notes);
  const setNotes = useNotesStore((s) => s.setNotes);
  const upsertNote = useNotesStore((s) => s.upsertNote);
  const removeNote = useNotesStore((s) => s.removeNote);
  const files = useFilesStore((s) => s.files);
  const setFiles = useFilesStore((s) => s.setFiles);
  const upsertFile = useFilesStore((s) => s.upsertFile);
  const removeFile = useFilesStore((s) => s.removeFile);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showPathTree, setShowPathTree] = useState(true);
  const [selectedFile, setSelectedFile] = useState<AppFile | null>(null);
  const [renamingFile, setRenamingFile] = useState<AppFile | null>(null);
  const [movingFile, setMovingFile] = useState<AppFile | null>(null);
  const [movingFolder, setMovingFolder] = useState<Folder | null>(null);
  const [movingNote, setMovingNote] = useState<Note | null>(null);
  const [fileNameInput, setFileNameInput] = useState("");
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ type: "folder" | "note" | "file"; id: string } | null>(null);

  const currentFolder = folderId ? folders[folderId] : undefined;

  useEffect(() => {
    (async () => {
      const [childrenFolders, folderNotes, folderFiles] = await Promise.all([
        getFoldersByParent(folderId ?? null),
        getNotesByFolder(folderId ?? null),
        getFilesByFolder(folderId ?? null)
      ]);
      childrenFolders.forEach(upsertFolder);
      setNotes(folderNotes);
      setFiles(folderFiles);
      const pinned = await getPinnedItems();
      setPinnedItems(pinned);
    })();
  }, [folderId, setFiles, setNotes, setPinnedItems, upsertFolder]);

  const trailIds = useMemo(() => {
    if (routeTrail && routeTrail.length > 0) {
      const filtered = routeTrail.filter((id, idx, arr) => !!folders[id] && arr.indexOf(id) === idx);
      if (folderId && filtered[filtered.length - 1] !== folderId) {
        filtered.push(folderId);
      }
      return filtered;
    }

    const ids: string[] = [];
    const visited = new Set<string>();
    let cursor = folderId;
    while (cursor && folders[cursor] && !visited.has(cursor)) {
      ids.unshift(cursor);
      visited.add(cursor);
      cursor = folders[cursor].parentId;
    }
    return ids;
  }, [folderId, folders, routeTrail]);

  const breadcrumbItems = useMemo(
    () => [
      { id: null as string | null, label: "Home" },
      ...trailIds.map((id) => ({ id, label: folders[id]?.name ?? "Folder" }))
    ],
    [folders, trailIds]
  );

  const handleJumpTo = useCallback(
    (targetId: string | null, breadcrumbIndex: number) => {
      if (targetId === folderId) return;
      const nextTrail = targetId ? trailIds.slice(0, breadcrumbIndex) : [];
      navigation.setParams({ folderId: targetId, trail: nextTrail });
    },
    [folderId, navigation, trailIds]
  );

  const childFolders = useMemo(
    () => Object.values(folders).filter((f) => f.parentId === folderId),
    [folderId, folders]
  );

  const folderNotes = useMemo(
    () => Object.values(notes).filter((n) => n.folderId === folderId),
    [folderId, notes]
  );

  const folderFiles = useMemo(
    () => Object.values(files).filter((f) => f.parentFolderId === folderId),
    [files, folderId]
  );

  const mixedItems = useMemo<MixedItem[]>(
    () => [
      ...childFolders
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((folder) => ({ id: `folder-${folder.id}`, kind: "folder", folder })),
      ...folderNotes
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((note) => ({ id: `note-${note.id}`, kind: "note", note })),
      ...folderFiles
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((file) => ({ id: `file-${file.id}`, kind: "file", file }))
    ],
    [childFolders, folderFiles, folderNotes]
  );

  const isDescendantOf = useCallback(
    (candidateParentId: string | null, sourceId: string): boolean => {
      let cursor = candidateParentId;
      const visited = new Set<string>();
      while (cursor) {
        if (cursor === sourceId) return true;
        if (visited.has(cursor)) return false;
        visited.add(cursor);
        cursor = folders[cursor]?.parentId ?? null;
      }
      return false;
    },
    [folders]
  );

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text variant="title">{currentFolder?.name ?? "Home"}</Text>
          <Text muted>Subfolders and notes</Text>
        </View>
        <View style={styles.headerActions}>
          <PrimaryButton label="+ Folder" onPress={() => setShowCreateFolder(true)} />
          <PrimaryButton
            label="+ Note"
            onPress={() =>
              navigation.navigate("NoteEditor", {
                folderId: folderId ?? null
              })
            }
          />
          <PrimaryButton
            label="+ Add File"
            onPress={() => {
              Alert.alert("Add file", "Choose an option", [
                {
                  text: "Import from device",
                  onPress: async () => {
                    const created = await importFileFromDevice(folderId ?? null);
                    if (created) upsertFile(created);
                  }
                },
                {
                  text: "Scan document",
                  onPress: () => Alert.alert("Coming soon", "Document scanner will be available in a future update.")
                },
                { text: "Cancel", style: "cancel" }
              ]);
            }}
          />
        </View>
      </View>

      <View style={[styles.pathCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
        <View style={styles.pathHeaderRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbContent} style={{ flex: 1 }}>
            {breadcrumbItems.map((item, index) => {
              const isLast = index === breadcrumbItems.length - 1;
              return (
                <View key={item.id ?? "home"} style={styles.breadcrumbItemRow}>
                  <Pressable
                    onPress={() => handleJumpTo(item.id, index)}
                    style={styles.breadcrumbPressable}
                  >
                    <Ionicons
                      name={item.id ? "folder-outline" : "home-outline"}
                      size={13}
                      color={isLast ? theme.colors.primary : theme.colors.textSecondary}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.breadcrumbLabel,
                        {
                          color: isLast ? theme.colors.primary : theme.colors.textSecondary,
                          fontWeight: isLast ? "700" : "500"
                        }
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                  {!isLast && (
                    <Ionicons
                      name="chevron-forward"
                      size={12}
                      color={theme.colors.textSecondary}
                      style={styles.breadcrumbSeparator}
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Pressable
            onPress={() => setShowPathTree((prev) => !prev)}
            style={[styles.treeToggle, { borderColor: theme.colors.border }]}
          >
            <Ionicons
              name={showPathTree ? "chevron-up" : "chevron-down"}
              size={14}
              color={theme.colors.textSecondary}
            />
          </Pressable>
        </View>

        {showPathTree && (
          <View style={[styles.pathPanel, { borderTopColor: theme.colors.border }]}>
            {breadcrumbItems.map((item, index) => {
              const isLast = index === breadcrumbItems.length - 1;
              return (
                <Pressable
                  key={`${item.id ?? "home"}-panel`}
                  onPress={() => handleJumpTo(item.id, index)}
                  style={styles.pathRow}
                >
                  <View style={[styles.pathIndent, { width: index * 12 }]} />
                  <Ionicons
                    name={item.id ? "folder-outline" : "home-outline"}
                    size={14}
                    color={isLast ? theme.colors.primary : theme.colors.textSecondary}
                  />
                  <Text
                    style={{
                      marginLeft: 8,
                      color: isLast ? theme.colors.primary : theme.colors.textSecondary,
                      fontWeight: isLast ? "600" : "400"
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={[styles.section, { borderColor: theme.colors.border }]}>
        <Text variant="subtitle">Items</Text>
        <FlatList
          data={mixedItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            if (item.kind === "folder") {
              return (
                <Pressable
                  onLongPress={() => setSelectedFolder(item.folder)}
                  delayLongPress={260}
                  style={styles.row}
                  onPress={() =>
                    (async () => {
                      const nextRecent = await addRecentOpen("folder", item.folder.id);
                      setRecentItems(nextRecent);
                      navigation.push("FolderDetail", {
                        folderId: item.folder.id,
                        trail: [...trailIds, item.folder.id]
                      });
                    })()
                  }
                >
                  <FolderIcon color={item.folder.color} fallbackColor={theme.colors.primary} size={18} />
                  <Text style={styles.rowTitle}>{item.folder.name}</Text>
                </Pressable>
              );
            }

            if (item.kind === "note") {
              return (
                <Pressable
                  onLongPress={() => setSelectedNote(item.note)}
                  delayLongPress={260}
                  style={styles.row}
                  onPress={() =>
                    (async () => {
                      const nextRecent = await addRecentOpen("note", item.note.id);
                      setRecentItems(nextRecent);
                      navigation.navigate("NoteEditor", { noteId: item.note.id });
                    })()
                  }
                >
                  <Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} />
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>{item.note.title}</Text>
                    {!!firstLine(item.note.content) && (
                      <Text muted variant="caption" numberOfLines={1}>
                        {firstLine(item.note.content)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            }

            return (
              <Pressable
                onLongPress={() => setSelectedFile(item.file)}
                delayLongPress={260}
                style={styles.row}
                onPress={async () => {
                  if (item.file.type === "pdf") {
                    navigation.navigate("PdfViewer", { path: item.file.path, name: item.file.name });
                    return;
                  }
                  if (item.file.type === "image") {
                    navigation.navigate("ImageViewer", { path: item.file.path, name: item.file.name });
                    return;
                  }
                  await openExternalFile(item.file.path);
                }}
              >
                <FileIcon type={item.file.type} size={18} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowTitle}>{item.file.name}</Text>
                  <Text muted variant="caption">
                    {item.file.type.toUpperCase()} • {new Date(item.file.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <Ionicons name={getFileTypeIcon(item.file.type)} size={16} color={theme.colors.textSecondary} />
              </Pressable>
            );
          }}
          contentContainerStyle={styles.sectionListContent}
          ListEmptyComponent={
            <Text muted style={styles.emptyText}>
              No items yet.
            </Text>
          }
        />
      </View>

      <FolderNameModal
        visible={showCreateFolder}
        onCancel={() => setShowCreateFolder(false)}
        onConfirm={async (name, color) => {
          const created = await createFolder(name, folderId ?? null, color);
          upsertFolder(created);
          setShowCreateFolder(false);
        }}
      />

      <ContextActionMenu
        visible={!!selectedFolder}
        title={selectedFolder?.name}
        onClose={() => setSelectedFolder(null)}
        actions={[
          {
            key: "open",
            label: "Open",
            icon: "open-outline",
            onPress: () => {
              if (!selectedFolder) return;
              navigation.push("FolderDetail", {
                folderId: selectedFolder.id,
                trail: [...trailIds, selectedFolder.id]
              });
            }
          },
          {
            key: "pin",
            label:
              selectedFolder && pinnedItems.some((x) => x.type === "folder" && x.id === selectedFolder.id)
                ? "Unpin"
                : "Pin",
            icon:
              selectedFolder && pinnedItems.some((x) => x.type === "folder" && x.id === selectedFolder.id)
                ? "pin"
                : "pin-outline",
            onPress: async () => {
              if (!selectedFolder) return;
              const next = togglePinned("folder", selectedFolder.id);
              await savePinnedItems(next);
            }
          },
          {
            key: "move",
            label: "Move",
            icon: "swap-horizontal-outline",
            onPress: () => {
              if (!selectedFolder) return;
              setTargetFolderId(selectedFolder.parentId ?? null);
              setMovingFolder(selectedFolder);
            }
          },
          {
            key: "edit",
            label: "Edit",
            icon: "pencil",
            onPress: () => {
              if (!selectedFolder) return;
              setEditingFolder(selectedFolder);
            }
          },
          {
            key: "rename",
            label: "Rename",
            icon: "create-outline",
            onPress: () => {
              if (!selectedFolder) return;
              setEditingFolder(selectedFolder);
            }
          },
          {
            key: "color",
            label: "Change color",
            icon: "color-palette-outline",
            onPress: () => {
              if (!selectedFolder) return;
              setEditingFolder(selectedFolder);
            }
          },
          {
            key: "delete",
            label: "Delete",
            icon: "trash-outline",
            destructive: true,
            onPress: () => {
              if (!selectedFolder) return;
              setPendingDelete({ type: "folder", id: selectedFolder.id });
            }
          }
        ]}
      />

      <ContextActionMenu
        visible={!!selectedNote}
        title={selectedNote?.title || "Note"}
        onClose={() => setSelectedNote(null)}
        actions={[
          {
            key: "open",
            label: "Open",
            icon: "open-outline",
            onPress: () => {
              if (!selectedNote) return;
              navigation.navigate("NoteEditor", { noteId: selectedNote.id });
            }
          },
          {
            key: "pin",
            label:
              selectedNote && pinnedItems.some((x) => x.type === "note" && x.id === selectedNote.id)
                ? "Unpin"
                : "Pin",
            icon:
              selectedNote && pinnedItems.some((x) => x.type === "note" && x.id === selectedNote.id)
                ? "pin"
                : "pin-outline",
            onPress: async () => {
              if (!selectedNote) return;
              const next = togglePinned("note", selectedNote.id);
              await savePinnedItems(next);
            }
          },
          {
            key: "move",
            label: "Move",
            icon: "swap-horizontal-outline",
            onPress: () => {
              if (!selectedNote) return;
              setTargetFolderId(selectedNote.folderId ?? null);
              setMovingNote(selectedNote);
            }
          },
          {
            key: "edit",
            label: "Edit",
            icon: "pencil",
            onPress: () => {
              if (!selectedNote) return;
              setEditingNote(selectedNote);
            }
          },
          {
            key: "delete",
            label: "Delete",
            icon: "trash-outline",
            destructive: true,
            onPress: () => {
              if (!selectedNote) return;
              setPendingDelete({ type: "note", id: selectedNote.id });
            }
          }
        ]}
      />

      <ContextActionMenu
        visible={!!selectedFile}
        title={selectedFile?.name}
        onClose={() => setSelectedFile(null)}
        actions={[
          {
            key: "open",
            label: "Open",
            icon: "open-outline",
            onPress: async () => {
              if (!selectedFile) return;
              if (selectedFile.type === "pdf") {
                navigation.navigate("PdfViewer", { path: selectedFile.path, name: selectedFile.name });
                return;
              }
              if (selectedFile.type === "image") {
                navigation.navigate("ImageViewer", { path: selectedFile.path, name: selectedFile.name });
                return;
              }
              await openExternalFile(selectedFile.path);
            }
          },
          {
            key: "rename",
            label: "Rename",
            icon: "create-outline",
            onPress: () => {
              if (!selectedFile) return;
              setFileNameInput(selectedFile.name);
              setRenamingFile(selectedFile);
            }
          },
          {
            key: "move",
            label: "Move to folder",
            icon: "folder-open-outline",
            onPress: () => {
              if (!selectedFile) return;
              setTargetFolderId(selectedFile.parentFolderId ?? null);
              setMovingFile(selectedFile);
            }
          },
          {
            key: "share",
            label: "Share",
            icon: "share-social-outline",
            onPress: async () => {
              if (!selectedFile) return;
              await Share.share({
                title: selectedFile.name,
                message: selectedFile.name,
                url: selectedFile.path
              });
            }
          },
          {
            key: "delete",
            label: "Delete",
            icon: "trash-outline",
            destructive: true,
            onPress: () => {
              if (!selectedFile) return;
              setPendingDelete({ type: "file", id: selectedFile.id });
            }
          }
        ]}
      />

      <FolderNameModal
        visible={!!editingFolder}
        initialName={editingFolder?.name}
        initialColor={editingFolder?.color}
        title="Edit folder"
        confirmLabel="Save"
        onCancel={() => setEditingFolder(null)}
        onConfirm={async (name, color) => {
          if (!editingFolder) return;
          const updated = await updateFolder({ ...editingFolder, name, color });
          upsertFolder(updated);
          setEditingFolder(null);
        }}
      />

      <NoteEditModal
        visible={!!editingNote}
        initialTitle={editingNote?.title ?? ""}
        initialContent={editingNote?.content ?? ""}
        onCancel={() => setEditingNote(null)}
        onConfirm={async (title, content) => {
          if (!editingNote) return;
          const updated = await updateNote({
            ...editingNote,
            title,
            content
          });
          upsertNote(updated);
          setEditingNote(null);
        }}
      />

      <Modal transparent visible={!!renamingFile} animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <Text variant="subtitle">Rename file</Text>
            <TextInput
              value={fileNameInput}
              onChangeText={setFileNameInput}
              placeholder="File name"
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.modalInput, { borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setRenamingFile(null)} style={styles.secondaryButton}>
                <Text muted>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!renamingFile) return;
                  const nextName = fileNameInput.trim();
                  if (!nextName) return;
                  await renameFile(renamingFile.id, nextName);
                  upsertFile({ ...renamingFile, name: nextName });
                  setRenamingFile(null);
                }}
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
              >
                <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!movingFile} animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <Text variant="subtitle">Move file to folder</Text>

            <FlatList
              data={[{ id: "root", name: "Home", parentId: null as string | null }, ...Object.values(folders)]}
              keyExtractor={(item) => item.id}
              style={styles.moveList}
              renderItem={({ item }) => {
                const id = item.id === "root" ? null : item.id;
                const selected = targetFolderId === id;
                return (
                  <Pressable
                    onPress={() => setTargetFolderId(id)}
                    style={[styles.moveRow, selected && { backgroundColor: theme.colors.primary + "22" }]}
                  >
                    <Ionicons
                      name={item.id === "root" ? "home-outline" : "folder-outline"}
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                    <Text numberOfLines={1}>{item.name}</Text>
                  </Pressable>
                );
              }}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setMovingFile(null)} style={styles.secondaryButton}>
                <Text muted>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!movingFile) return;
                  await moveFileToFolder(movingFile.id, targetFolderId ?? null);
                  upsertFile({ ...movingFile, parentFolderId: targetFolderId ?? null });
                  setMovingFile(null);
                }}
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
              >
                <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Move</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!movingFolder} animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <Text variant="subtitle">Move folder</Text>

            <FlatList
              data={[{ id: "root", name: "Home", parentId: null as string | null }, ...Object.values(folders)]}
              keyExtractor={(item) => item.id}
              style={styles.moveList}
              renderItem={({ item }) => {
                const id = item.id === "root" ? null : item.id;
                const selected = targetFolderId === id;
                const disabled = !!movingFolder && (id === movingFolder.id || isDescendantOf(id, movingFolder.id));
                return (
                  <Pressable
                    disabled={disabled}
                    onPress={() => setTargetFolderId(id)}
                    style={[
                      styles.moveRow,
                      selected && { backgroundColor: theme.colors.primary + "22" },
                      disabled && { opacity: 0.35 }
                    ]}
                  >
                    <Ionicons
                      name={item.id === "root" ? "home-outline" : "folder-outline"}
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                    <Text numberOfLines={1}>{item.name}</Text>
                  </Pressable>
                );
              }}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setMovingFolder(null)} style={styles.secondaryButton}>
                <Text muted>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!movingFolder) return;
                  if (targetFolderId === movingFolder.id || isDescendantOf(targetFolderId, movingFolder.id)) {
                    Alert.alert("Invalid destination", "Cannot move a folder into itself or its descendants.");
                    return;
                  }
                  const updated = await updateFolder({ ...movingFolder, parentId: targetFolderId ?? null });
                  upsertFolder(updated);
                  setMovingFolder(null);
                }}
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
              >
                <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Move</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={!!movingNote} animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <Text variant="subtitle">Move note</Text>

            <FlatList
              data={[{ id: "root", name: "Home", parentId: null as string | null }, ...Object.values(folders)]}
              keyExtractor={(item) => item.id}
              style={styles.moveList}
              renderItem={({ item }) => {
                const id = item.id === "root" ? null : item.id;
                const selected = targetFolderId === id;
                return (
                  <Pressable
                    onPress={() => setTargetFolderId(id)}
                    style={[styles.moveRow, selected && { backgroundColor: theme.colors.primary + "22" }]}
                  >
                    <Ionicons
                      name={item.id === "root" ? "home-outline" : "folder-outline"}
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                    <Text numberOfLines={1}>{item.name}</Text>
                  </Pressable>
                );
              }}
            />

            <View style={styles.modalActions}>
              <Pressable onPress={() => setMovingNote(null)} style={styles.secondaryButton}>
                <Text muted>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!movingNote) return;
                  const updated = await updateNote({ ...movingNote, folderId: targetFolderId ?? null });
                  upsertNote(updated);
                  setMovingNote(null);
                }}
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
              >
                <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Move</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <DeleteConfirmModal
        visible={!!pendingDelete}
        itemLabel={pendingDelete?.type ?? "item"}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          if (pendingDelete.type === "folder") {
            await deleteFolder(pendingDelete.id);
            removeFolder(pendingDelete.id);
          } else if (pendingDelete.type === "note") {
            await deleteNote(pendingDelete.id);
            removeNote(pendingDelete.id);
          } else {
            const target = files[pendingDelete.id];
            if (target) {
              await deleteFile(target);
              removeFile(target.id);
            }
          }
          setPendingDelete(null);
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  pathCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 12
  },
  pathHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  treeToggle: {
    width: 24,
    height: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center"
  },
  breadcrumbContent: {
    alignItems: "center",
    paddingRight: 8
  },
  breadcrumbItemRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  breadcrumbPressable: {
    flexDirection: "row",
    alignItems: "center"
  },
  breadcrumbLabel: {
    marginLeft: 4,
    fontSize: 12,
    maxWidth: 120
  },
  breadcrumbSeparator: {
    marginHorizontal: 6
  },
  pathPanel: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6
  },
  pathRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2
  },
  pathIndent: {
    height: 1
  },
  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8
  },
  rowContent: {
    flex: 1
  },
  rowTitle: {
    flex: 1
  },
  sectionListContent: {
    paddingBottom: 8,
    gap: 8
  },
  emptyText: {
    marginTop: 8
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16
  },
  modalCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    maxHeight: "80%"
  },
  modalInput: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  moveList: {
    marginTop: 10,
    maxHeight: 260
  },
  moveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 12
  },
  secondaryButton: {
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  primaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999
  }
});

export default FolderDetailScreen;

