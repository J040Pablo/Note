import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Share,
  Image,
  Animated,
  LayoutAnimation
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useFeedback } from "@components/FeedbackProvider";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { FolderNameModal } from "@components/FolderNameModal";
import { FolderIcon } from "@components/FolderIcon";
import { FileIcon } from "@components/FileIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { NoteEditModal } from "@components/NoteEditModal";
import { FileDetailsModal } from "@components/FileDetailsModal";
import { useTheme } from "@hooks/useTheme";
import type { CompositeNavigationProp, RouteProp } from "@react-navigation/native";
import type { FoldersStackParamList, RootStackParamList } from "@navigation/RootNavigator";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useAppStore } from "@store/useAppStore";
import { useNotesStore } from "@store/useNotesStore";
import { useFilesStore } from "@store/useFilesStore";
import { createFolder, deleteFolder, getFoldersByParent, updateFolder } from "@services/foldersService";
import { deleteNote, getNotesByFolder, updateNote } from "@services/notesService";
import {
  addRecentOpen,
  getPinnedItems,
  getSortPreference,
  savePinnedItems,
  saveSortPreference
} from "@services/appMetaService";
import {
  deleteFile,
  getFilesByFolder,
  getFileTypeIcon,
  importFileFromDevice,
  moveFileToFolder,
  openExternalFile,
  reorderFiles,
  updateFileDetails
} from "@services/filesService";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppFile, Folder, Note } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";

const firstLine = (text: string): string => {
  const line = (text || "").split(/\r?\n/).find((x) => x.trim().length > 0) ?? "";
  return line.length > 80 ? line.slice(0, 77).trimEnd() + "…" : line;
};

type FolderDetailRoute = RouteProp<FoldersStackParamList, "FolderDetail">;
type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<FoldersStackParamList, "FolderDetail">,
  NativeStackNavigationProp<RootStackParamList>
>;

type FileSortMode = "custom" | "recent" | "name_asc" | "name_desc" | "size_asc" | "size_desc";

const fileSortScopeForFolder = (folderId: string | null | undefined) => `files.sort.${folderId ?? "root"}`;

const FolderDetailScreen: React.FC = () => {
  const { theme } = useTheme();
  const route = useRoute<FolderDetailRoute>();
  const navigation = useNavigation<Nav>();
  const { showToast } = useFeedback();
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
  const [editingFile, setEditingFile] = useState<AppFile | null>(null);
  const [movingFile, setMovingFile] = useState<AppFile | null>(null);
  const [movingFolder, setMovingFolder] = useState<Folder | null>(null);
  const [movingNote, setMovingNote] = useState<Note | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ type: "folder" | "note" | "file"; id: string } | null>(null);
  const [showAddFileMenu, setShowAddFileMenu] = useState(false);
  const [showFileSortMenu, setShowFileSortMenu] = useState(false);
  const [fileSortMode, setFileSortMode] = useState<FileSortMode>("custom");
  const [fileSizes, setFileSizes] = useState<Record<string, number>>({});
  const [fabOpen, setFabOpen] = useState(false);
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;

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
      const [pinned, savedSort] = await Promise.all([
        getPinnedItems(),
        getSortPreference<FileSortMode>(fileSortScopeForFolder(folderId), "custom")
      ]);
      setPinnedItems(pinned);
      setFileSortMode(savedSort);
    })();
  }, [folderId, setFiles, setNotes, setPinnedItems, upsertFolder]);

  useEffect(() => {
    (async () => {
      const visible = Object.values(files).filter((f) => f.parentFolderId === folderId);
      const pairs = await Promise.all(
        visible.map(async (file) => {
          try {
            const info = await FileSystem.getInfoAsync(file.path);
            return [file.id, info.exists && "size" in info ? Number(info.size || 0) : 0] as const;
          } catch {
            return [file.id, 0] as const;
          }
        })
      );
      setFileSizes(Object.fromEntries(pairs));
    })();
  }, [files, folderId]);

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

  const visibleFiles = useMemo(() => {
    if (fileSortMode === "name_asc") return [...folderFiles].sort((a, b) => a.name.localeCompare(b.name));
    if (fileSortMode === "name_desc") return [...folderFiles].sort((a, b) => b.name.localeCompare(a.name));
    if (fileSortMode === "recent") return [...folderFiles].sort((a, b) => b.createdAt - a.createdAt);
    if (fileSortMode === "size_asc") return [...folderFiles].sort((a, b) => (fileSizes[a.id] ?? 0) - (fileSizes[b.id] ?? 0));
    if (fileSortMode === "size_desc") return [...folderFiles].sort((a, b) => (fileSizes[b.id] ?? 0) - (fileSizes[a.id] ?? 0));
    return [...folderFiles].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [fileSizes, fileSortMode, folderFiles]);

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

  const handleAddFile = useCallback(() => {
    setShowAddFileMenu(true);
  }, []);

  const openFab = useCallback(() => {
    setFabOpen(true);
    Animated.spring(fabAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 24,
      bounciness: 6
    }).start();
  }, [fabAnim]);

  const closeFab = useCallback(() => {
    Animated.timing(fabAnim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) setFabOpen(false);
    });
  }, [fabAnim]);

  const toggleFab = useCallback(() => {
    if (fabOpen) {
      closeFab();
    } else {
      openFab();
    }
  }, [closeFab, fabOpen, openFab]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text variant="title">{currentFolder?.name ?? "Home"}</Text>
          <Text muted>Subfolders, notes and files</Text>
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
        <View style={styles.sectionHeaderRow}>
          <Text variant="subtitle">Items</Text>
          <Pressable
            onPress={() => setShowFileSortMenu(true)}
            style={[styles.sortButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          >
            <Ionicons name="funnel-outline" size={15} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.sectionListContent}>
          {childFolders
            .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
            .map((folder) => (
              <Pressable
                key={folder.id}
                onLongPress={() => setSelectedFolder(folder)}
                delayLongPress={260}
                style={({ pressed }) => [
                  styles.itemCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.card,
                    shadowColor: theme.colors.textPrimary,
                    transform: [{ scale: pressed ? 0.992 : 1 }],
                    opacity: pressed ? 0.96 : 1
                  }
                ]}
                onPress={() =>
                  (async () => {
                    const nextRecent = await addRecentOpen("folder", folder.id);
                    setRecentItems(nextRecent);
                    navigation.push("FolderDetail", {
                      folderId: folder.id,
                      trail: [...trailIds, folder.id]
                    });
                  })()
                }
              >
                {!!folder.bannerPath && (
                  <Image source={{ uri: folder.bannerPath }} style={styles.cardBanner} resizeMode="cover" />
                )}
                <View style={styles.cardBody}>
                  {folder.photoPath ? (
                    <Image source={{ uri: folder.photoPath }} style={styles.cardAvatar} resizeMode="cover" />
                  ) : (
                    <FolderIcon color={folder.color} fallbackColor={theme.colors.primary} size={20} />
                  )}
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>{folder.name}</Text>
                    {!!folder.description && (
                      <Text muted variant="caption" numberOfLines={2}>
                        {folder.description}
                      </Text>
                    )}
                  </View>
                </View>
              </Pressable>
            ))}

          {folderNotes
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((note) => (
              <Pressable
                key={note.id}
                onLongPress={() => setSelectedNote(note)}
                delayLongPress={260}
                style={({ pressed }) => [
                  styles.itemCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.card,
                    shadowColor: theme.colors.textPrimary,
                    transform: [{ scale: pressed ? 0.992 : 1 }],
                    opacity: pressed ? 0.96 : 1
                  }
                ]}
                onPress={() =>
                  (async () => {
                    const nextRecent = await addRecentOpen("note", note.id);
                    setRecentItems(nextRecent);
                    navigation.navigate("NoteEditor", { noteId: note.id });
                  })()
                }
              >
                <View style={styles.cardBody}>
                  <View style={[styles.noteIconWrap, { backgroundColor: theme.colors.surfaceElevated }]}> 
                    <Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} />
                  </View>
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>{note.title}</Text>
                    {!!firstLine(note.content) && (
                      <Text muted variant="caption" numberOfLines={2}>
                        {firstLine(note.content)}
                      </Text>
                    )}
                  </View>
                </View>
              </Pressable>
            ))}

          <DraggableFlatList
            data={visibleFiles}
            keyExtractor={(item) => item.id}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={9}
            removeClippedSubviews
            activationDistance={12}
            scrollEnabled={false}
            onDragEnd={async ({ data }) => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setFileSortMode("custom");
              await saveSortPreference(fileSortScopeForFolder(folderId), "custom");
              await reorderFiles(folderId ?? null, data.map((x) => x.id));
              const refreshedFiles = await getFilesByFolder(folderId ?? null);
              setFiles(refreshedFiles);
            }}
            renderItem={({ item, drag, isActive }: RenderItemParams<AppFile>) => (
              <Pressable
                onLongPress={() => setSelectedFile(item)}
                delayLongPress={260}
                style={({ pressed }) => [
                  styles.itemCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.card,
                    shadowColor: theme.colors.textPrimary,
                    transform: [{ scale: isActive ? 1.01 : pressed ? 0.992 : 1 }],
                    opacity: pressed ? 0.96 : 1,
                    elevation: isActive ? 8 : 2,
                    shadowOpacity: isActive ? 0.24 : 0.08
                  }
                ]}
                onPress={async () => {
                  if (item.type === "pdf") {
                    navigation.navigate("PdfViewer", { path: item.path, name: item.name });
                    return;
                  }
                  if (item.type === "image") {
                    navigation.navigate("ImageViewer", { path: item.path, name: item.name });
                    return;
                  }
                  await openExternalFile(item.path);
                }}
              >
                {!!item.bannerPath && (
                  <Image source={{ uri: item.bannerPath }} style={styles.cardBanner} resizeMode="cover" />
                )}
                <View style={styles.cardBody}>
                  {item.thumbnailPath ? (
                    <Image source={{ uri: item.thumbnailPath }} style={styles.cardAvatar} resizeMode="cover" />
                  ) : (
                    <View style={[styles.noteIconWrap, { backgroundColor: theme.colors.surfaceElevated }]}>
                      <FileIcon type={item.type} size={18} />
                    </View>
                  )}
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    {!!item.description && (
                      <Text muted variant="caption" numberOfLines={2}>
                        {item.description}
                      </Text>
                    )}
                    <Text muted variant="caption">
                      {item.type.toUpperCase()} • {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <Pressable
                    onPressIn={(event) => event.stopPropagation()}
                    onLongPress={(event) => {
                      event.stopPropagation();
                      drag();
                    }}
                    delayLongPress={220}
                    hitSlop={8}
                    style={styles.dragHandle}
                  >
                    <Ionicons name="reorder-three-outline" size={18} color={theme.colors.textSecondary} />
                  </Pressable>
                  <Ionicons name={getFileTypeIcon(item.type)} size={16} color={theme.colors.textSecondary} />
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              childFolders.length === 0 && folderNotes.length === 0 ? (
                <Text muted style={styles.emptyText}>
                  No items yet.
                </Text>
              ) : null
            }
          />
        </View>
      </View>

      <ContextActionMenu
        visible={showAddFileMenu}
        title="Add file"
        onClose={() => setShowAddFileMenu(false)}
        actions={[
          {
            key: "import",
            label: "Import from device",
            icon: "download-outline",
            onPress: async () => {
              const created = await importFileFromDevice(folderId ?? null);
              if (created) upsertFile(created);
            }
          },
          {
            key: "scan",
            label: "Scan document",
            icon: "scan-outline",
            onPress: () => Alert.alert("Coming soon", "Document scanner will be available in a future update.")
          }
        ]}
      />

      <ContextActionMenu
        visible={showFileSortMenu}
        title="Sort files"
        onClose={() => setShowFileSortMenu(false)}
        actions={[
          {
            key: "custom",
            label: "Custom order",
            icon: "reorder-three-outline",
            onPress: async () => {
              setFileSortMode("custom");
              await saveSortPreference(fileSortScopeForFolder(folderId), "custom");
            }
          },
          {
            key: "recent",
            label: "Most recent",
            icon: "time-outline",
            onPress: async () => {
              setFileSortMode("recent");
              await saveSortPreference(fileSortScopeForFolder(folderId), "recent");
            }
          },
          {
            key: "az",
            label: "Name (A-Z)",
            icon: "text-outline",
            onPress: async () => {
              setFileSortMode("name_asc");
              await saveSortPreference(fileSortScopeForFolder(folderId), "name_asc");
            }
          },
          {
            key: "za",
            label: "Name (Z-A)",
            icon: "text-outline",
            onPress: async () => {
              setFileSortMode("name_desc");
              await saveSortPreference(fileSortScopeForFolder(folderId), "name_desc");
            }
          },
          {
            key: "sizeAsc",
            label: "Size (ascending)",
            icon: "stats-chart-outline",
            onPress: async () => {
              setFileSortMode("size_asc");
              await saveSortPreference(fileSortScopeForFolder(folderId), "size_asc");
            }
          },
          {
            key: "sizeDesc",
            label: "Size (descending)",
            icon: "stats-chart",
            onPress: async () => {
              setFileSortMode("size_desc");
              await saveSortPreference(fileSortScopeForFolder(folderId), "size_desc");
            }
          }
        ]}
      />

      {fabOpen && <Pressable style={styles.fabBackdrop} onPress={closeFab} />}

      <View style={styles.fabRoot} pointerEvents="box-none">
        {([
          {
            key: "folder",
            label: "Create Folder",
            icon: "folder-outline" as const,
            onPress: () => {
              closeFab();
              setShowCreateFolder(true);
            }
          },
          {
            key: "note",
            label: "Create Note",
            icon: "document-text-outline" as const,
            onPress: () => {
              closeFab();
              navigation.navigate("NoteEditor", { folderId: folderId ?? null });
            }
          },
          {
            key: "file",
            label: "Add File",
            icon: "attach-outline" as const,
            onPress: () => {
              closeFab();
              handleAddFile();
            }
          }
        ] as const).map((item, index) => (
          <Animated.View
            key={item.key}
            pointerEvents={fabOpen ? "auto" : "none"}
            style={[
              styles.fabMenuItemWrap,
              {
                transform: [
                  {
                    translateY: fabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -((index + 1) * 58)]
                    })
                  },
                  {
                    scale: fabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.84, 1]
                    })
                  }
                ],
                opacity: fabAnim
              }
            ]}
          >
            <Pressable
              onPress={item.onPress}
              style={[
                styles.fabMenuItem,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border
                }
              ]}
            >
              <Ionicons name={item.icon} size={16} color={theme.colors.primary} />
              <Text style={[styles.fabMenuLabel, { color: theme.colors.textPrimary }]}>{item.label}</Text>
            </Pressable>
          </Animated.View>
        ))}

        <Pressable
          onPress={toggleFab}
          style={[
            styles.fabMain,
            {
              backgroundColor: theme.colors.primary,
              shadowColor: theme.colors.textPrimary
            }
          ]}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", "45deg"]
                  })
                }
              ]
            }}
          >
            <Ionicons name="add" size={24} color={theme.colors.onPrimary} />
          </Animated.View>
        </Pressable>
      </View>

      <FolderNameModal
        visible={showCreateFolder}
        onCancel={() => {
          if (folderSubmitting) return;
          setShowCreateFolder(false);
        }}
        submitting={folderSubmitting}
        onConfirm={async (payload) => {
          if (folderSubmitting) return;
          setFolderSubmitting(true);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          try {
            const created = await createFolder(
              payload.name,
              folderId ?? null,
              payload.color,
              payload.description,
              payload.photoPath,
              payload.bannerPath
            );
            upsertFolder(created);
            setShowCreateFolder(false);
            showToast("Folder saved ✓");
          } catch (error) {
            console.error("[folder] create failed", error);
            showToast("Could not save folder", "error");
          } finally {
            setFolderSubmitting(false);
          }
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
            key: "edit",
            label: "Edit details",
            icon: "pencil",
            onPress: () => {
              if (!selectedFile) return;
              setEditingFile(selectedFile);
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
        initialDescription={editingFolder?.description}
        initialPhotoPath={editingFolder?.photoPath}
        initialBannerPath={editingFolder?.bannerPath}
        title="Edit folder"
        confirmLabel="Save"
        onCancel={() => {
          if (folderSubmitting) return;
          setEditingFolder(null);
        }}
        submitting={folderSubmitting}
        onConfirm={async (payload) => {
          if (!editingFolder || folderSubmitting) return;
          setFolderSubmitting(true);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          try {
            const updated = await updateFolder({
              ...editingFolder,
              name: payload.name,
              color: payload.color,
              description: payload.description,
              photoPath: payload.photoPath,
              bannerPath: payload.bannerPath
            });
            upsertFolder(updated);
            setEditingFolder(null);
            showToast("Folder saved ✓");
          } catch (error) {
            console.error("[folder] update failed", error);
            showToast("Could not save folder", "error");
          } finally {
            setFolderSubmitting(false);
          }
        }}
      />

      <NoteEditModal
        visible={!!editingNote}
        initialTitle={editingNote?.title ?? ""}
        initialContent={editingNote?.content ?? ""}
        submitting={noteSubmitting}
        onCancel={() => {
          if (noteSubmitting) return;
          setEditingNote(null);
        }}
        onConfirm={async (title, content) => {
          if (!editingNote || noteSubmitting) return;
          setNoteSubmitting(true);
          try {
            const updated = await updateNote({
              ...editingNote,
              title,
              content
            });
            upsertNote(updated);
            setEditingNote(null);
            showToast("Note saved ✓");
          } catch (error) {
            console.error("[note] update failed", error);
            showToast("Could not save note", "error");
          } finally {
            setNoteSubmitting(false);
          }
        }}
      />

      <FileDetailsModal
        visible={!!editingFile}
        initialName={editingFile?.name}
        initialDescription={editingFile?.description}
        initialThumbnailPath={editingFile?.thumbnailPath}
        initialBannerPath={editingFile?.bannerPath}
        onCancel={() => setEditingFile(null)}
        onConfirm={async (payload) => {
          if (!editingFile) return;
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          const updated = await updateFileDetails({
            ...editingFile,
            name: payload.name,
            description: payload.description,
            thumbnailPath: payload.thumbnailPath,
            bannerPath: payload.bannerPath
          });
          upsertFile(updated);
          setEditingFile(null);
        }}
      />

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
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
        loading={deleteSubmitting}
        onCancel={() => {
          if (deleteSubmitting) return;
          setPendingDelete(null);
        }}
        onConfirm={async () => {
          if (!pendingDelete || deleteSubmitting) return;
          setDeleteSubmitting(true);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          try {
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
            showToast("Deleted ✓");
          } catch (error) {
            console.error("[item] delete failed", error);
            showToast("Could not delete item", "error");
          } finally {
            setDeleteSubmitting(false);
          }
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  sortButton: {
    width: 30,
    height: 30,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  itemCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2
  },
  cardBanner: {
    width: "100%",
    height: 86
  },
  cardBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12
  },
  cardAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12
  },
  noteIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  rowContent: {
    flex: 1
  },
  rowTitle: {
    flex: 1,
    fontWeight: "600",
    marginBottom: 2
  },
  dragHandle: {
    paddingHorizontal: 2,
    paddingVertical: 4,
    marginRight: 2
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
  },
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)"
  },
  fabRoot: {
    position: "absolute",
    right: 16,
    bottom: 24
  },
  fabMenuItemWrap: {
    position: "absolute",
    right: 0,
    bottom: 0
  },
  fabMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 156
  },
  fabMenuLabel: {
    fontSize: 13,
    fontWeight: "600"
  },
  fabMain: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  }
});

export default FolderDetailScreen;

