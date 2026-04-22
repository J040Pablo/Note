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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWindowDimensions } from "react-native";
import { Text } from "@components/Text";
import { FolderNameModal } from "@components/FolderNameModal";
import { FolderIcon } from "@components/FolderIcon";
import { FileIcon } from "@components/FileIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { NoteEditModal } from "@components/NoteEditModal";
import { FileDetailsModal } from "@components/FileDetailsModal";
import { SelectionIndicator } from "@components/SelectionIndicator";
import { FloatingButton } from "@components/FloatingButton";
import FolderExplorerMenu from "@components/FolderExplorerMenu";
import { useTheme } from "@hooks/useTheme";
import type { CompositeNavigationProp, RouteProp } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import type { FoldersStackParamList, RootStackParamList } from "@navigation/RootNavigator";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useAppStore } from "@store/useAppStore";
import { useNavigationLock } from "@hooks/useNavigationLock";
import { useGlobalSelection } from "@hooks/useGlobalSelection";
import { useItemActions } from "@hooks/useItemActions";
import { useUnifiedItems } from "@hooks/useUnifiedItems";
import { createTextBlock, getRichNotePreviewLine, serializeRichNoteContent } from "@utils/noteContent";
import { useNotesStore } from "@store/useNotesStore";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { useFilesStore } from "@store/useFilesStore";
import { createFolder, deleteFolder, getFoldersByParent, updateFolder, updateFolderGlobalOrder } from "@services/foldersService";
import { createNote, deleteNote, deleteQuickNote, getNotesByFolder, getQuickNotesByFolder, updateNote, updateNoteGlobalOrder, updateQuickNoteGlobalOrder } from "@services/notesService";
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
  updateFileDetails,
  updateFileGlobalOrder
} from "@services/filesService";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AppFile, Folder, ID, Note, QuickNote } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { DraggableGrid } from "react-native-draggable-grid";
import { useFolderFABActions } from "@hooks/useFolderFABActions";
import { log, warn, error as logError } from '@utils/logger';
 

const firstLine = (text: string): string => getRichNotePreviewLine(text, 80);

type FolderDetailRoute = RouteProp<FoldersStackParamList, "FolderDetail">;
type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<FoldersStackParamList, "FolderDetail">,
  NativeStackNavigationProp<RootStackParamList>
>;

type FileSortMode = "custom" | "recent" | "name_asc" | "name_desc" | "size_asc" | "size_desc";
type GridFolderItem = Folder & { key: string };
type GridNoteItem = Note & { key: string };
type GridQuickNoteItem = QuickNote & { key: string };
type GridFileItem = AppFile & { key: string };
type GridAllItem = 
  | (Folder & { key: string; itemType: "folder" })
  | (Note & { key: string; itemType: "note" })
  | (QuickNote & { key: string; itemType: "quick" })
  | (AppFile & { key: string; itemType: "file" });
const GRID_COLUMNS = 2;
const GRID_PADDING = 12;
const GRID_GAP = 20;
const GRID_ITEM_HEIGHT = 128;
const GRID_CELL_HEIGHT = GRID_ITEM_HEIGHT + 40;

const fileSortScopeForFolder = (folderId: string | null | undefined) => `files.sort.${folderId ?? "root"}`;
const TOP_PADDING_DEFAULT = 24;
const TOP_PADDING_WITH_SELECTION = 80;

// Custom LayoutAnimation com duracao 2x mais rapida (150ms ao inves de 300ms)
const FAST_LAYOUT_ANIMATION = {
  duration: 150,
  create: {
    type: LayoutAnimation.Types.linear,
    property: LayoutAnimation.Properties.opacity
  },
  update: {
    type: LayoutAnimation.Types.linear,
    property: LayoutAnimation.Properties.opacity
  },
  delete: {
    type: LayoutAnimation.Types.linear,
    property: LayoutAnimation.Properties.opacity
  }
};

const FolderDetailScreen: React.FC = () => {
  const { theme } = useTheme();
  const route = useRoute<FolderDetailRoute>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { withLock } = useNavigationLock();
  const { showToast } = useFeedback();
  const actions = useItemActions();
  const folderId = route.params?.folderId ?? null;
  const routeTrail = route.params?.trail;

  log("Current route:", route.name, route.params);

  const folders = useAppStore((s) => s.folders);
  const upsertFolder = useAppStore((s) => s.upsertFolder);
  const removeFolder = useAppStore((s) => s.removeFolder);
  const pinnedItems = useAppStore((s) => s.pinnedItems);
  const togglePinned = useAppStore((s) => s.togglePinned);
  const setPinnedItems = useAppStore((s) => s.setPinnedItems);
  const setRecentItems = useAppStore((s) => s.setRecentItems);
  const folderViewModes = useAppStore((s) => s.folderViewModes);
  const setFolderViewMode = useAppStore((s) => s.setFolderViewMode);
  const notes = useNotesStore((s) => s.notes);
  const upsertNote = useNotesStore((s) => s.upsertNote);
  const removeNote = useNotesStore((s) => s.removeNote);
  const quickNotes = useQuickNotesStore((s) => s.quickNotes);
  const upsertQuickNote = useQuickNotesStore((s) => s.upsertQuickNote);
  const removeQuickNote = useQuickNotesStore((s) => s.removeQuickNote);
  const files = useFilesStore((s) => s.files);
  const upsertFile = useFilesStore((s) => s.upsertFile);
  const removeFile = useFilesStore((s) => s.removeFile);
  const reorderFilesInStore = useFilesStore((s) => s.reorderFilesInStore);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [showExplorerMenu, setShowExplorerMenu] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
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
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [showMoveSelectedModal, setShowMoveSelectedModal] = useState(false);
  const [moveSelectedTargetFolderId, setMoveSelectedTargetFolderId] = useState<string | null>(null);
  const [draggingFolders, setDraggingFolders] = useState(false);
  const [draggingNotes, setDraggingNotes] = useState(false);
  const [draggingQuickNotes, setDraggingQuickNotes] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [draggingGridItem, setDraggingGridItem] = useState(false);
  const [fileSortMode, setFileSortMode] = useState<FileSortMode>("custom");
  const [fileSizes, setFileSizes] = useState<Record<string, number>>({});
  const [fabOpen, setFabOpen] = useState(false);
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const isDraggingRef = useRef(false);

  const currentFolder = folderId ? folders[folderId] : undefined;
  const currentViewMode = folderViewModes[folderId ?? "root"] ?? "grid";

  // Reset the navigation stack when focusing back on FolderDetail from another screen
  // This ensures we can navigate back properly
  useFocusEffect(
    useCallback(() => {
      // Just ensure the screen is properly focused
      return;
    }, [])
  );

  useEffect(() => {
    (async () => {
      const [childrenFolders, folderNotes, folderQuickNotes, folderFiles] = await Promise.all([
        getFoldersByParent(folderId ?? null),
        getNotesByFolder(folderId ?? null),
        getQuickNotesByFolder(folderId ?? null),
        getFilesByFolder(folderId ?? null)
      ]);
      childrenFolders.forEach(upsertFolder);
      // Keep global stores immutable and additive so previous screens don't lose items.
      folderNotes.forEach(upsertNote);
      folderQuickNotes.forEach(upsertQuickNote);
      folderFiles.forEach(upsertFile);
      const [pinned, savedSort] = await Promise.all([
        getPinnedItems(),
        getSortPreference<FileSortMode>(fileSortScopeForFolder(folderId), "custom")
      ]);
      setPinnedItems(pinned);
      setFileSortMode(savedSort);
    })();
  }, [folderId, setPinnedItems, upsertFile, upsertFolder, upsertNote, upsertQuickNote]);

  useEffect(() => {
    (async () => {
      const visible = Object.values(files).filter((f) => ((f as AppFile).parentFolderId ?? null) === folderId);
      const pairs = await Promise.all(
        visible.map(async (file) => {
          try {
            const appFile = file as AppFile;
            const info = await FileSystem.getInfoAsync(appFile.path);
            return [appFile.id, info.exists && "size" in info ? Number(info.size || 0) : 0] as const;
          } catch {
            return [(file as AppFile).id, 0] as const;
          }
        })
      );
      setFileSizes(Object.fromEntries(pairs));
    })();
  }, [files, folderId]);

  const {
    folders: childFolders,
    notes: folderNotes,
    quickNotes: folderQuickNotes,
    selectableItems
  } = useUnifiedItems({ scope: "folder", parentId: folderId });

  const fabActions = useFolderFABActions({
    folderId: folderId ?? null,
    onShowCreateFolder: () => setShowCreateFolder(true),
    onShowAddFile: () => setShowAddFileMenu(true),
    isDetailScreen: true
  });

  const folderFiles = useMemo(
    () => Object.values(files).filter((f) => ((f as AppFile).parentFolderId ?? null) === folderId) as AppFile[],
    [files, folderId]
  );

  const {
    selectedItems,
    selectionCount,
    selectionMode,
    isSelected,
    toggleSelection,
    startSelection,
    clearSelection,
    selectAllVisible
  } = useGlobalSelection(selectableItems, {
    onSelectionStart: () => showToast("Modo de seleção ativado")
  });

  const topContentPadding = selectionMode ? TOP_PADDING_WITH_SELECTION : TOP_PADDING_DEFAULT;
  const isDraggingAny = draggingFolders || draggingNotes || draggingQuickNotes || draggingFiles || draggingGridItem;

  const ensureItemSelectedForDrag = useCallback(
    (item: { kind: "folder" | "note" | "quick"; id: string; parentId: string | null; label: string }) => {
      if (selectionMode) {
        if (!isSelected(item)) {
          toggleSelection(item);
        }
        return;
      }
      startSelection(item);
    },
    [isSelected, selectionMode, startSelection, toggleSelection]
  );

  const gridItemWidth = useMemo(() => {
    return (width - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  }, [width]);

  const gridHeightFor = useCallback((count: number) => Math.ceil(count / GRID_COLUMNS) * GRID_CELL_HEIGHT, []);

  const handleClearSelection = useCallback(() => {
    LayoutAnimation.configureNext(FAST_LAYOUT_ANIMATION);
    clearSelection();
    setShowSelectionMenu(false);
  }, [clearSelection]);

  const handlePinSelected = useCallback(async () => {
    const items = selectedItems;
    try {
      for (const item of items) {
        await actions.pin({ kind: item.kind, id: item.id, parentId: folderId });
      }
      showToast("Pins atualizados");
    } finally {
      handleClearSelection();
    }
  }, [actions, folderId, handleClearSelection, selectedItems, showToast]);

  const handleEditSelected = useCallback(() => {
    if (selectedItems.length !== 1) return;
    const item = selectedItems[0];
    handleClearSelection();
    if (item.kind === "folder") {
      const folder = folders[item.id];
      if (folder) setEditingFolder(folder);
      return;
    }
    if (item.kind === "note") {
      const note = notes[item.id];
      if (note) setEditingNote(note);
      return;
    }
    withLock(() => {
      navigation.push("QuickNote", { quickNoteId: item.id, folderId: folderId ?? null });
    });
  }, [folderId, folders, handleClearSelection, navigation, notes, selectedItems, withLock]);

  const handleShareSelected = useCallback(async () => {
    const items = selectedItems;
    if (!items.length) return;
    try {
      await Share.share({
        title: items.length === 1 ? items[0].label : `${items.length} itens`,
        message: items.map((item) => `${item.kind.toUpperCase()}: ${item.label}`).join("\n")
      });
    } finally {
      handleClearSelection();
    }
  }, [handleClearSelection, selectedItems]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedItems.length) return;
    Alert.alert(
      "Apagar itens",
      selectedItems.length === 1 ? "Deseja apagar o item selecionado?" : `Deseja apagar ${selectedItems.length} itens selecionados?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: async () => {
            for (const item of selectedItems) {
              await actions.delete({ kind: item.kind, id: item.id, parentId: folderId });
            }
            handleClearSelection();
            showToast(selectedItems.length === 1 ? "Item apagado" : `${selectedItems.length} itens apagados`);
          }
        }
      ]
    );
  }, [actions, folderId, handleClearSelection, selectedItems, showToast]);

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

  const visibleFiles = useMemo(() => {
    const sortedFiles = folderFiles as AppFile[];
    if (fileSortMode === "name_asc") return [...sortedFiles].sort((a, b) => a.name.localeCompare(b.name));
    if (fileSortMode === "name_desc") return [...sortedFiles].sort((a, b) => b.name.localeCompare(a.name));
    if (fileSortMode === "recent") return [...sortedFiles].sort((a, b) => b.createdAt - a.createdAt);
    if (fileSortMode === "size_asc") return [...sortedFiles].sort((a, b) => (fileSizes[a.id] ?? 0) - (fileSizes[b.id] ?? 0));
    if (fileSortMode === "size_desc") return [...sortedFiles].sort((a, b) => (fileSizes[b.id] ?? 0) - (fileSizes[a.id] ?? 0));
    return [...sortedFiles].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [fileSizes, fileSortMode, folderFiles]);

  const visibleChildFolders = useMemo(
    () => [...(childFolders ?? [])].sort((a, b) => (a.globalOrder ?? 0) - (b.globalOrder ?? 0)),
    [childFolders]
  );

  const visibleFolderNotes = useMemo(
    () => [...(folderNotes ?? [])].sort((a, b) => (a.globalOrder ?? 0) - (b.globalOrder ?? 0)),
    [folderNotes]
  );

  const visibleFolderQuickNotes = useMemo(
    () => [...(folderQuickNotes ?? [])].sort((a, b) => (a.globalOrder ?? 0) - (b.globalOrder ?? 0)),
    [folderQuickNotes]
  );

  const gridAllItems = useMemo(() => {
    if (currentViewMode !== "grid") return [];

    const allItems: GridAllItem[] = [
      ...visibleChildFolders.map((folder) => ({
        ...folder,
        key: folder.id,
        itemType: "folder" as const
      })),
      ...visibleFolderNotes.map((note) => ({
        ...note,
        key: note.id,
        itemType: "note" as const
      })),
      ...visibleFolderQuickNotes.map((quick) => ({
        ...quick,
        key: quick.id,
        itemType: "quick" as const
      })),
      ...visibleFiles.map((file) => ({
        ...file,
        key: file.id,
        itemType: "file" as const
      }))
    ];

    // Ensure every item has a valid globalOrder (9999 for new items to sort them to the end)
    const itemsWithOrder = allItems.map((item, index) => ({
      ...item,
      globalOrder: item.globalOrder ?? (9999 + index)
    }));

    // Sort by globalOrder, with tie-breaking by ID for stable ordering
    return itemsWithOrder.sort((a, b) => {
      if (a.globalOrder === b.globalOrder) {
        return a.id.localeCompare(b.id);
      }
      return a.globalOrder - b.globalOrder;
    });
  }, [currentViewMode, visibleChildFolders, visibleFolderNotes, visibleFolderQuickNotes, visibleFiles]);

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

  const handleMoveSelected = useCallback(() => {
    if (!selectedItems.length) return;
    setMoveSelectedTargetFolderId(folderId ?? null);
    setShowSelectionMenu(false);
    setShowMoveSelectedModal(true);
  }, [folderId, selectedItems.length]);

  const handleConfirmMoveSelected = useCallback(async () => {
    if (!selectedItems.length) return;

    for (const item of selectedItems) {
      if (item.kind === "folder") {
        if (moveSelectedTargetFolderId === item.id || isDescendantOf(moveSelectedTargetFolderId, item.id)) {
          showToast("Destino inválido para pasta", "error");
          return;
        }
      }
    }

    try {
      for (const item of selectedItems) {
        await actions.move({ kind: item.kind, id: item.id, toParentId: moveSelectedTargetFolderId ?? null });
      }
      setShowMoveSelectedModal(false);
      handleClearSelection();
      showToast(selectedItems.length === 1 ? "Item movido" : `${selectedItems.length} itens movidos`);
    } catch (error) {
      logError("[items] move failed", error);
      showToast("Não foi possível mover os itens", "error");
    }
  }, [actions, handleClearSelection, isDescendantOf, moveSelectedTargetFolderId, selectedItems, showToast]);

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

  const handleBackPress = useCallback(() => {
    // Se há histórico de navegação, voltar
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Se não há histórico, navegar para a raiz da stack de Folders
      navigation.navigate("FoldersRoot" as never);
    }
  }, [navigation]);

  const toggleExpandedFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleSelectNoteFromMenu = useCallback(
    (noteId: string) => {
      withLock(() => {
        navigation.push("NoteEditor", { noteId, folderId: folderId ?? null });
        addRecentOpen("note", noteId).then((nextRecent) => setRecentItems(nextRecent));
      });
    },
    [navigation, withLock]
  );

  const handleSelectQuickNoteFromMenu = useCallback(
    (quickNoteId: string) => {
      withLock(() => {
        navigation.push("QuickNote", { quickNoteId, folderId: folderId ?? null });
      });
    },
    [folderId, navigation, withLock]
  );

  return (
    <Screen edges={["top", "right", "left"]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={handleBackPress}
          style={[styles.backButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={16} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <>
            <Text variant="title">{currentFolder?.name ?? "Home"}</Text>
            <Text muted>Subfolders, notes and files</Text>
          </>
        </View>
        <Pressable
          onPress={() => setShowExplorerMenu(true)}
          style={[styles.menuButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          hitSlop={8}
        >
          <Ionicons name="menu-outline" size={18} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {selectionMode && (
        <View style={[styles.selectionBarOverlay, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <Pressable onPress={handleClearSelection} style={styles.headerIconBtn} hitSlop={8}>
            <Ionicons name="close" size={18} color={theme.colors.textPrimary} />
          </Pressable>
          <Text style={styles.selectionCountText}>{selectionCount}</Text>
          <View style={styles.selectionActions}>
            <Pressable onPress={handleShareSelected} style={styles.headerIconBtn} hitSlop={8}>
              <Ionicons name="share-social-outline" size={18} color={theme.colors.textPrimary} />
            </Pressable>
            <Pressable onPress={handleDeleteSelected} style={styles.headerIconBtn} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            </Pressable>
            {selectionCount === 1 && (
              <Pressable onPress={handleEditSelected} style={styles.headerIconBtn} hitSlop={8}>
                <Ionicons name="pencil-outline" size={18} color={theme.colors.textPrimary} />
              </Pressable>
            )}
            <Pressable onPress={() => setShowSelectionMenu(true)} style={styles.headerIconBtn} hitSlop={8}>
              <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      )}

      <View style={[styles.section, { borderColor: theme.colors.border }]}>
        <View style={styles.sectionHeaderRow}>
          <Text variant="subtitle">Items</Text>
          <View style={styles.headerActions}>
            <View style={[styles.viewToggleWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
              <Pressable
                onPress={() => setFolderViewMode(folderId ?? "root", "list")}
                style={[
                  styles.viewToggleBtn,
                  folderViewModes[folderId ?? "root"] === "list" && { backgroundColor: theme.colors.primaryAlpha20 }
                ]}
              >
                <Ionicons name="list-outline" size={14} color={folderViewModes[folderId ?? "root"] === "list" ? theme.colors.primary : theme.colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => setFolderViewMode(folderId ?? "root", "grid")}
                style={[
                  styles.viewToggleBtn,
                  folderViewModes[folderId ?? "root"] === "grid" && { backgroundColor: theme.colors.primaryAlpha20 }
                ]}
              >
                <Ionicons name="grid-outline" size={14} color={folderViewModes[folderId ?? "root"] === "grid" ? theme.colors.primary : theme.colors.textSecondary} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => setShowFileSortMenu(true)}
              style={[styles.sortButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            >
              <Ionicons name="funnel-outline" size={15} color={theme.colors.textPrimary} />
            </Pressable>
          </View>
        </View>
        <ScrollView
          key={`${folderId}-${currentViewMode}`}
          style={styles.sectionListContent}
          contentContainerStyle={[
            styles.sectionListContentContainer,
            currentViewMode === "grid" ? styles.gridContentContainer : undefined
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isDraggingAny}
          nestedScrollEnabled={true}
        >
          <View>
            {currentViewMode === "grid" ? (
              // UNIFIED GRID for folders, notes, and quick notes in GRID MODE
              <View style={[styles.gridSectionBlock, { height: gridHeightFor(gridAllItems.length), width: "100%" }]}>
                <DraggableGrid<GridAllItem>
                  disabled={false}
                  numColumns={GRID_COLUMNS}
                  itemHeight={GRID_CELL_HEIGHT}
                  style={styles.gridSurface}
                  data={gridAllItems}
                  delayLongPress={250}
                  onDragStart={(item) => {
                    isDraggingRef.current = true;
                    setDraggingGridItem(true);
                    // Determine the item kind based on itemType
                    if (item.itemType === "folder") {
                      ensureItemSelectedForDrag({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name });
                    } else if (item.itemType === "note") {
                      ensureItemSelectedForDrag({ kind: "note", id: item.id, parentId: item.folderId ?? null, label: item.title });
                    } else if (item.itemType === "quick") {
                      ensureItemSelectedForDrag({ kind: "quick", id: item.id, parentId: item.folderId ?? null, label: item.title });
                    }
                    // Files don't have selection mode in the current implementation, so skip for now
                  }}
                  onDragRelease={(data) => {
                    data.forEach((item, index) => {
                      switch (item.itemType) {
                        case "folder":
                          updateFolderGlobalOrder(item.id, index).catch(err => 
                            logError("[FolderDetail] Failed to persist folder order:", err)
                          );
                          upsertFolder({ ...(item as Folder), globalOrder: index });
                          break;
                        case "note":
                          updateNoteGlobalOrder(item.id, index).catch(err => 
                            logError("[FolderDetail] Failed to persist note order:", err)
                          );
                          upsertNote({ ...(item as Note), globalOrder: index });
                          break;
                        case "quick":
                          updateQuickNoteGlobalOrder(item.id, index).catch(err => 
                            logError("[FolderDetail] Failed to persist quick note order:", err)
                          );
                          upsertQuickNote({ ...(item as QuickNote), globalOrder: index });
                          break;
                        case "file":
                          updateFileGlobalOrder(item.id, index).catch(err => 
                            logError("[FolderDetail] Failed to persist file order:", err)
                          );
                          upsertFile({ ...(item as AppFile), globalOrder: index });
                          break;
                      }
                    });

                    isDraggingRef.current = false;
                    setDraggingGridItem(false);
                  }}
                  onItemPress={(item) => {
                    if (item.itemType === "folder") {
                      if (selectionMode) {
                        toggleSelection({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name });
                        return;
                      }
                      withLock(() => {
                        navigation.push("FolderDetail", {
                          folderId: item.id,
                          trail: [...trailIds, item.id]
                        });
                        addRecentOpen("folder", item.id).then((nextRecent) => setRecentItems(nextRecent));
                      });
                    } else if (item.itemType === "note") {
                      if (selectionMode) {
                        toggleSelection({ kind: "note", id: item.id, parentId: item.folderId ?? null, label: item.title });
                        return;
                      }
                      withLock(() => {
                        navigation.push("NoteEditor", { noteId: item.id, folderId: folderId ?? null });
                        addRecentOpen("note", item.id).then((nextRecent) => setRecentItems(nextRecent));
                      });
                    } else if (item.itemType === "quick") {
                      if (selectionMode) {
                        toggleSelection({ kind: "quick", id: item.id, parentId: item.folderId ?? null, label: item.title });
                        return;
                      }
                      withLock(() => {
                        navigation.push("QuickNote", { quickNoteId: item.id, folderId: folderId ?? null });
                      });
                    } else if (item.itemType === "file") {
                      const file = item as AppFile & { key: string; itemType: "file" };
                      openExternalFile(file.path);
                    }
                  }}
                  onItemLongPress={(item) => {
                    if (item.itemType === "file") {
                      // Files don't have selection mode, just open context menu or do nothing
                      return;
                    }
                    
                    const kind = item.itemType === "folder" ? "folder" : item.itemType === "note" ? "note" : "quick";
                    const parentId = item.itemType === "folder" ? item.parentId ?? null : item.folderId ?? null;
                    const label = item.itemType === "folder" ? item.name : item.title;

                    if (!selectionMode) {
                      startSelection({ kind, id: item.id, parentId, label });
                      return;
                    }
                    toggleSelection({ kind, id: item.id, parentId, label });
                  }}
                  renderItem={(item: GridAllItem, index: number) => {
                    // Render item based on its type
                    if (item.itemType === "folder") {
                      const folder = item as Folder & { key: string; itemType: "folder" };
                      return (
                        <View
                          style={[
                            styles.gridItem,
                            {
                              width: gridItemWidth,
                              height: GRID_CELL_HEIGHT,
                              marginRight: index % GRID_COLUMNS === GRID_COLUMNS - 1 ? 0 : GRID_GAP
                            }
                          ]}
                        >
                          <View
                            style={[
                              styles.folderGridCard,
                              {
                                minHeight: GRID_ITEM_HEIGHT,
                                height: GRID_ITEM_HEIGHT,
                                marginHorizontal: 0,
                                backgroundColor: theme.colors.card,
                                borderWidth: 2,
                                borderColor: isSelected({ kind: "folder", id: folder.id, parentId: folder.parentId ?? null, label: folder.name }) ? theme.colors.primary : theme.colors.border
                              }
                            ]}
                          >
                            {/* Banner - always render if path exists */}
                            {!!folder.bannerPath ? (
                              <Image source={{ uri: folder.bannerPath }} style={styles.cardBanner} resizeMode="cover" />
                            ) : (
                              <View style={[styles.cardBanner, { backgroundColor: theme.colors.surfaceElevated }]} />
                            )}
                            
                            {/* Content row - standardized layout */}
                            <View style={styles.cardBody}>
                              {/* Avatar or Icon */}
                              {folder.photoPath ? (
                                <Image source={{ uri: folder.photoPath }} style={styles.cardAvatar} resizeMode="cover" />
                              ) : (
                                <View style={[styles.noteIconWrap, { backgroundColor: theme.colors.surfaceElevated }]}>
                                  <FolderIcon color={folder.color} fallbackColor={theme.colors.primary} size={20} plain />
                                </View>
                              )}
                              
                              {/* Text content */}
                              <View style={styles.rowContent}>
                                <Text style={styles.rowTitle} numberOfLines={1}>{folder.name}</Text>
                                {!!folder.description && (
                                  <Text muted variant="caption" numberOfLines={1}>
                                    {folder.description}
                                  </Text>
                                )}
                              </View>
                            </View>
                            
                            {/* Selection indicator */}
                            <SelectionIndicator visible={isSelected({ kind: "folder", id: folder.id, parentId: folder.parentId ?? null, label: folder.name })} />
                          </View>
                        </View>
                      );
                    } else if (item.itemType === "note") {
                      const note = item as Note & { key: string; itemType: "note" };
                      return (
                        <View
                          style={[
                            styles.gridItem,
                            {
                              width: gridItemWidth,
                              height: GRID_CELL_HEIGHT,
                              marginRight: index % GRID_COLUMNS === GRID_COLUMNS - 1 ? 0 : GRID_GAP
                            }
                          ]}
                        >
                          <View
                            style={[
                              styles.folderGridCard,
                              {
                                minHeight: GRID_ITEM_HEIGHT,
                                height: GRID_ITEM_HEIGHT,
                                marginHorizontal: 0,
                                backgroundColor: theme.colors.card,
                                borderWidth: 2,
                                borderColor: isSelected({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title }) ? theme.colors.primary : theme.colors.border
                              }
                            ]}
                          >
                            {/* Banner - always render */}
                            <View style={[styles.cardBanner, { backgroundColor: theme.colors.surfaceElevated }]} />
                            
                            {/* Content row - standardized layout */}
                            <View style={styles.cardBody}>
                              {/* Icon */}
                              <View style={[styles.noteIconWrap, { backgroundColor: theme.colors.surfaceElevated }]}>
                                <Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} />
                              </View>
                              
                              {/* Text content */}
                              <View style={styles.rowContent}>
                                <Text style={styles.rowTitle} numberOfLines={1}>{note.title || "Sem título"}</Text>
                                {!!firstLine(note.content) && (
                                  <Text muted variant="caption" numberOfLines={1}>
                                    {firstLine(note.content)}
                                  </Text>
                                )}
                              </View>
                            </View>
                            
                            {/* Selection indicator */}
                            <SelectionIndicator visible={isSelected({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title })} />
                          </View>
                        </View>
                      );
                    } else if (item.itemType === "quick") {
                      const quickNote = item as QuickNote & { key: string; itemType: "quick" };
                      return (
                        <View
                          style={[
                            styles.gridItem,
                            {
                              width: gridItemWidth,
                              height: GRID_CELL_HEIGHT,
                              marginRight: index % GRID_COLUMNS === GRID_COLUMNS - 1 ? 0 : GRID_GAP
                            }
                          ]}
                        >
                          <View
                            style={[
                              styles.folderGridCard,
                              {
                                minHeight: GRID_ITEM_HEIGHT,
                                height: GRID_ITEM_HEIGHT,
                                marginHorizontal: 0,
                                backgroundColor: theme.colors.card,
                                borderWidth: 2,
                                borderColor: isSelected({ kind: "quick", id: quickNote.id, parentId: quickNote.folderId ?? null, label: quickNote.title }) ? theme.colors.primary : theme.colors.border
                              }
                            ]}
                          >
                            {/* Banner - always render */}
                            <View style={[styles.cardBanner, { backgroundColor: theme.colors.surfaceElevated }]} />
                            
                            {/* Content row - standardized layout */}
                            <View style={styles.cardBody}>
                              {/* Icon */}
                              <View style={[styles.noteIconWrap, { backgroundColor: theme.colors.surfaceElevated }]}>
                                <Ionicons name="flash-outline" size={18} color={theme.colors.textSecondary} />
                              </View>
                              
                              {/* Text content */}
                              <View style={styles.rowContent}>
                                <Text style={styles.rowTitle} numberOfLines={1}>{quickNote.title || "Sem título"}</Text>
                                {!!firstLine(quickNote.content) && (
                                  <Text muted variant="caption" numberOfLines={1}>
                                    {firstLine(quickNote.content)}
                                  </Text>
                                )}
                              </View>
                            </View>
                            
                            {/* Selection indicator */}
                            <SelectionIndicator visible={isSelected({ kind: "quick", id: quickNote.id, parentId: quickNote.folderId ?? null, label: quickNote.title })} />
                          </View>
                        </View>
                      );
                    } else if (item.itemType === "file") {
                      const file = item as AppFile & { key: string; itemType: "file" };
                      return (
                        <View
                          style={[
                            styles.gridItem,
                            {
                              width: gridItemWidth,
                              height: GRID_CELL_HEIGHT,
                              marginRight: index % GRID_COLUMNS === GRID_COLUMNS - 1 ? 0 : GRID_GAP
                            }
                          ]}
                        >
                          <View
                            style={[
                              styles.folderGridCard,
                              {
                                minHeight: GRID_ITEM_HEIGHT,
                                height: GRID_ITEM_HEIGHT,
                                marginHorizontal: 0,
                                backgroundColor: theme.colors.card,
                                borderWidth: 2,
                                borderColor: theme.colors.border
                              }
                            ]}
                          >
                            {/* Banner - show thumbnail if available */}
                            {file.bannerPath && (
                              <Image source={{ uri: file.bannerPath }} style={styles.cardBanner} resizeMode="cover" />
                            )}
                            {!file.bannerPath && (
                              <View style={[styles.cardBanner, { backgroundColor: theme.colors.surfaceElevated }]} />
                            )}
                            
                            {/* Content row - standardized layout */}
                            <View style={styles.cardBody}>
                              {/* Icon */}
                              <View style={[styles.noteIconWrap, { backgroundColor: theme.colors.surfaceElevated }]}>
                                <Ionicons name={getFileTypeIcon(file.type)} size={18} color={theme.colors.textSecondary} />
                              </View>
                              
                              {/* Text content */}
                              <View style={styles.rowContent}>
                                <Text style={styles.rowTitle} numberOfLines={1}>{file.name}</Text>
                                {!!file.description && (
                                  <Text muted variant="caption" numberOfLines={1}>
                                    {file.description}
                                  </Text>
                                )}
                              </View>
                            </View>
                            
                            {/* Selection indicator */}
                            <SelectionIndicator visible={false} />
                          </View>
                        </View>
                      );
                    }
                    return null;
                  }}
                />
              </View>
            ) : (
              // LIST MODE - keep three separate DraggableFlatList components
              <>
                {/* Folders list */}
                <DraggableFlatList
                  data={visibleChildFolders}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  nestedScrollEnabled
                  containerStyle={{ flexGrow: 0, width: "100%" }}
                  dragItemOverflow
                  activationDistance={12}
                  onDragBegin={() => setDraggingFolders(true)}
                  onRelease={() => setDraggingFolders(false)}
                  onDragEnd={({ data }) => {
                    setDraggingFolders(false);
                    const orderedIds = data.map((folder) => folder.id);
                    actions.reorder({ kind: "folder", parentId: folderId ?? null, orderedIds });
                    data.forEach((item, index) => upsertFolder({ ...item, globalOrder: index }));
                  }}
                  renderItem={({ item: folder, drag, isActive }: RenderItemParams<Folder>) => (
                    <Pressable
                      onLongPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: "folder", id: folder.id, parentId: folder.parentId ?? null, label: folder.name });
                          return;
                        }
                        ensureItemSelectedForDrag({ kind: "folder", id: folder.id, parentId: folder.parentId ?? null, label: folder.name });
                        drag();
                      }}
                      delayLongPress={260}
                      style={({ pressed }) => [
                        styles.itemCard,
                        styles.listItemCard,
                        {
                          backgroundColor: theme.colors.card,
                          shadowColor: theme.colors.textPrimary,
                          transform: [{ scale: isActive ? 1.02 : pressed ? 0.992 : 1 }],
                          opacity: isActive ? 0.96 : pressed ? 0.96 : 1,
                          borderWidth: 2,
                          borderColor: isSelected({ kind: "folder", id: folder.id, parentId: folder.parentId ?? null, label: folder.name }) ? theme.colors.primary : theme.colors.border
                        }
                      ]}
                      onPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: "folder", id: folder.id, parentId: folder.parentId ?? null, label: folder.name });
                          return;
                        }
                        withLock(() => {
                          navigation.push("FolderDetail", {
                            folderId: folder.id,
                            trail: [...trailIds, folder.id]
                          });
                          addRecentOpen("folder", folder.id).then((nextRecent) => setRecentItems(nextRecent));
                        });
                      }}
                    >
                      {!!folder.bannerPath && (
                        <Image source={{ uri: folder.bannerPath }} style={styles.cardBanner} resizeMode="cover" />
                      )}
                      <View style={styles.cardBody}>
                        {folder.photoPath ? (
                          <Image source={{ uri: folder.photoPath }} style={styles.cardAvatar} resizeMode="cover" />
                        ) : (
                          <View style={[styles.noteIconWrap, { backgroundColor: theme.colors.surfaceElevated }]}> 
                            <FolderIcon color={folder.color} fallbackColor={theme.colors.primary} size={20} plain />
                          </View>
                        )}
                        <View style={styles.rowContent}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{folder.name}</Text>
                          {!!folder.description && (
                            <Text muted variant="caption" numberOfLines={2} style={{ flexShrink: 1 }}>
                              {folder.description}
                            </Text>
                          )}
                        </View>
                      </View>
                      <SelectionIndicator visible={isSelected({ kind: "folder", id: folder.id, parentId: folder.parentId ?? null, label: folder.name })} />
                    </Pressable>
                  )}
                />

                {/* Notes list */}
                <DraggableFlatList
                  data={visibleFolderNotes}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  nestedScrollEnabled
                  containerStyle={{ flexGrow: 0, width: "100%" }}
                  dragItemOverflow
                  activationDistance={12}
                  onDragBegin={() => setDraggingNotes(true)}
                  onRelease={() => setDraggingNotes(false)}
                  onDragEnd={({ data }) => {
                    setDraggingNotes(false);
                    const orderedIds = data.map((note) => note.id);
                    actions.reorder({ kind: "note", parentId: folderId ?? null, orderedIds });
                    data.forEach((note, index) => upsertNote({ ...note, globalOrder: index }));
                  }}
                  renderItem={({ item: note, drag, isActive }: RenderItemParams<Note>) => (
                    <Pressable
                      onLongPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title });
                          return;
                        }
                        ensureItemSelectedForDrag({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title });
                        drag();
                      }}
                      delayLongPress={260}
                      style={({ pressed }) => [
                        styles.itemCard,
                        styles.listItemCard,
                        {
                          backgroundColor: theme.colors.card,
                          shadowColor: theme.colors.textPrimary,
                          transform: [{ scale: isActive ? 1.02 : pressed ? 0.992 : 1 }],
                          opacity: isActive ? 0.96 : pressed ? 0.96 : 1,
                          borderWidth: 2,
                          borderColor: isSelected({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title }) ? theme.colors.primary : theme.colors.border
                        }
                      ]}
                      onPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title });
                          return;
                        }
                        withLock(() => {
                          navigation.push("NoteEditor", { noteId: note.id, folderId: folderId ?? null });
                          addRecentOpen("note", note.id).then((nextRecent) => setRecentItems(nextRecent));
                        });
                      }}
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
                      <SelectionIndicator visible={isSelected({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title })} />
                    </Pressable>
                  )}
                />

                {/* Quick notes list */}
                <DraggableFlatList
                  data={visibleFolderQuickNotes}
                  keyExtractor={(item) => `quick-${item.id}`}
                  scrollEnabled={false}
                  nestedScrollEnabled
                  containerStyle={{ flexGrow: 0, width: "100%" }}
                  dragItemOverflow
                  activationDistance={12}
                  onDragBegin={() => setDraggingQuickNotes(true)}
                  onRelease={() => setDraggingQuickNotes(false)}
                  onDragEnd={({ data }) => {
                    setDraggingQuickNotes(false);
                    const orderedIds = data.map((quick) => quick.id);
                    actions.reorder({ kind: "quick", parentId: folderId ?? null, orderedIds });
                    data.forEach((quick, index) => upsertQuickNote({ ...quick, globalOrder: index }));
                  }}
                  renderItem={({ item: quickNote, drag, isActive }: RenderItemParams<QuickNote>) => (
                    <Pressable
                      onLongPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: "quick", id: quickNote.id, parentId: quickNote.folderId ?? null, label: quickNote.title });
                          return;
                        }
                        ensureItemSelectedForDrag({ kind: "quick", id: quickNote.id, parentId: quickNote.folderId ?? null, label: quickNote.title });
                        drag();
                      }}
                      delayLongPress={260}
                      style={({ pressed }) => [
                        styles.itemCard,
                        styles.listItemCard,
                        {
                          backgroundColor: theme.colors.card,
                          shadowColor: theme.colors.textPrimary,
                          transform: [{ scale: isActive ? 1.02 : pressed ? 0.992 : 1 }],
                          opacity: isActive ? 0.96 : pressed ? 0.96 : 1,
                          borderWidth: 2,
                          borderColor: isSelected({ kind: "quick", id: quickNote.id, parentId: quickNote.folderId ?? null, label: quickNote.title }) ? theme.colors.primary : theme.colors.border
                        }
                      ]}
                      onPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: "quick", id: quickNote.id, parentId: quickNote.folderId ?? null, label: quickNote.title });
                          return;
                        }
                        withLock(() => {
                          navigation.push("QuickNote", { quickNoteId: quickNote.id, folderId: folderId ?? null });
                        });
                      }}
                    >
                      <View style={styles.cardBody}>
                        <View style={[styles.noteIconWrap, { backgroundColor: theme.colors.surfaceElevated }]}> 
                          <Ionicons name="flash-outline" size={18} color={theme.colors.textSecondary} />
                        </View>
                        <View style={styles.rowContent}>
                          <Text style={styles.rowTitle}>{quickNote.title}</Text>
                          {!!firstLine(quickNote.content) && (
                            <Text muted variant="caption" numberOfLines={2}>
                              {firstLine(quickNote.content)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <SelectionIndicator visible={isSelected({ kind: "quick", id: quickNote.id, parentId: quickNote.folderId ?? null, label: quickNote.title })} />
                    </Pressable>
                  )}
                />
              </>
            )}

            {/* File list */}
            {currentViewMode === "list" && visibleFiles.length > 0 && (
              <DraggableFlatList
                data={visibleFiles}
                keyExtractor={(item) => `file-${item.id}`}
                scrollEnabled={false}
                nestedScrollEnabled
                containerStyle={{ flexGrow: 0, width: "100%" }}
                dragItemOverflow
                activationDistance={12}
                onDragBegin={() => setDraggingFiles(true)}
                onRelease={() => setDraggingFiles(false)}
                onDragEnd={({ data }) => {
                  setDraggingFiles(false);
                  const orderedIds = data.map((file) => file.id);
                  reorderFilesInStore(orderedIds as ID[]);
                  reorderFiles(folderId ?? null, orderedIds as ID[]);
                  if (fileSortMode !== "custom") {
                    setFileSortMode("custom");
                    saveSortPreference(fileSortScopeForFolder(folderId), "custom");
                  }
                }}
                renderItem={({ item, drag, isActive }: RenderItemParams<AppFile>) => (
                  <Pressable
                    onLongPress={() => {
                      if (selectionMode) {
                        setSelectedFile(item);
                        return;
                      }
                      if (fileSortMode === "custom") {
                        drag();
                        return;
                      }
                      showToast("Use ordenação: Custom order para reordenar arquivos");
                    }}
                    delayLongPress={260}
                    style={({ pressed }) => [
                      styles.itemCard,
                      styles.listItemCard,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.card,
                        shadowColor: theme.colors.textPrimary,
                        transform: [{ scale: isActive ? 1.02 : pressed ? 0.992 : 1 }],
                        opacity: isActive ? 0.96 : pressed ? 0.96 : 1,
                        elevation: 2,
                        shadowOpacity: 0.08
                      }
                    ]}
                    onPress={() =>
                      withLock(() => {
                        if (item.type === "pdf") {
                          navigation.push("PdfViewer", { path: item.path, name: item.name });
                          return;
                        }
                        if (item.type === "image") {
                          navigation.push("ImageViewer", { path: item.path, name: item.name });
                          return;
                        }
                        openExternalFile(item.path);
                      })
                    }
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
                      <Ionicons name={getFileTypeIcon(item.type)} size={16} color={theme.colors.textSecondary} />
                    </View>
                  </Pressable>
                )}
              />
            )}

            {childFolders.length === 0 && folderNotes.length === 0 && folderQuickNotes.length === 0 && folderFiles.length === 0 && (
              <Text muted style={styles.emptyText}>
                No items yet.
              </Text>
            )}
          </View>
        </ScrollView>
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

      <ContextActionMenu
        visible={showSelectionMenu}
        title="Ações secundárias"
        onClose={() => setShowSelectionMenu(false)}
        actions={[
          {
            key: "pin",
            label: "Pinar",
            icon: "pin-outline",
            onPress: handlePinSelected
          },
          {
            key: "duplicate",
            label: "Duplicar / Copiar",
            icon: "copy-outline",
            onPress: () => {
              showToast("Duplicação em breve");
              handleClearSelection();
            }
          },
          {
            key: "move",
            label: "Mover",
            icon: "folder-open-outline",
            onPress: () => {
              handleMoveSelected();
            }
          },
          {
            key: "archive",
            label: "Arquivar / Desarquivar",
            icon: "archive-outline",
            onPress: () => {
              showToast("Arquivo em breve");
              handleClearSelection();
            }
          },
          {
            key: "tag",
            label: "Tag / Label",
            icon: "pricetag-outline",
            onPress: () => {
              showToast("Tags em breve");
              handleClearSelection();
            }
          },
          {
            key: "edit",
            label: "Editar",
            icon: "pencil-outline",
            onPress: () => {
              if (selectionCount !== 1) {
                showToast("Selecione apenas 1 item para editar");
                return;
              }
              handleEditSelected();
            }
          },
          {
            key: "selectAll",
            label: "Selecionar tudo",
            icon: "checkmark-done-outline",
            onPress: selectAllVisible
          },
          {
            key: "clear",
            label: "Desmarcar tudo",
            icon: "close-circle-outline",
            onPress: handleClearSelection
          }
        ]}
      />

      {fabOpen && <Pressable style={styles.fabBackdrop} onPress={closeFab} />}

      <View style={[styles.fabRoot, { bottom: Math.max(insets.bottom + 8, 16) + 68 + 20 }]} pointerEvents="box-none">
        {fabActions.map((item, index) => (
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
              onPress={() => {
                item.onPress();
                closeFab();
              }}
              style={[
                styles.fabMenuItem,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border
                }
              ]}
            >
              <Ionicons name={item.icon as any} size={16} color={theme.colors.primary} />
              <Text style={[styles.fabMenuLabel, { color: theme.colors.textPrimary }]}>{item.label}</Text>
            </Pressable>
          </Animated.View>
        ))}

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
          <FloatingButton onPress={toggleFab} icon="add" />
        </Animated.View>
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
          LayoutAnimation.configureNext(FAST_LAYOUT_ANIMATION);
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
            logError("[folder] create failed", error);
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
              await actions.pin({ kind: "folder", id: selectedFolder.id, parentId: folderId });
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
              navigation.push("NoteEditor", { noteId: selectedNote.id, folderId: folderId ?? null });
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
              await actions.pin({ kind: "note", id: selectedNote.id, parentId: folderId });
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
                navigation.push("PdfViewer", { path: selectedFile.path, name: selectedFile.name });
                return;
              }
              if (selectedFile.type === "image") {
                navigation.push("ImageViewer", { path: selectedFile.path, name: selectedFile.name });
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
          handleClearSelection();
          setEditingFolder(null);
        }}
        submitting={folderSubmitting}
        onConfirm={async (payload) => {
          if (!editingFolder || folderSubmitting) return;
          setFolderSubmitting(true);
          LayoutAnimation.configureNext(FAST_LAYOUT_ANIMATION);
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
            handleClearSelection();
            setEditingFolder(null);
            showToast("Folder saved ✓");
          } catch (error) {
            logError("[folder] update failed", error);
            showToast("Could not save folder", "error");
          } finally {
            setFolderSubmitting(false);
          }
        }}
      />

      <NoteEditModal
        visible={!!editingNote}
        initialTitle={editingNote?.title ?? ""}
        submitting={noteSubmitting}
        onCancel={() => {
          if (noteSubmitting) return;
          handleClearSelection();
          setEditingNote(null);
        }}
        onConfirm={async (title) => {
          if (!editingNote || noteSubmitting) return;
          setNoteSubmitting(true);
          try {
            const updated = await updateNote({
              ...editingNote,
              title,
              content: editingNote.content
            });
            upsertNote(updated);
            handleClearSelection();
            setEditingNote(null);
            showToast("Note saved ✓");
          } catch (error) {
            logError("[note] update failed", error);
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
                    style={[styles.moveRow, selected && { backgroundColor: theme.colors.primaryAlpha20 }]}
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

      <Modal transparent visible={showMoveSelectedModal} animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <Text variant="subtitle">Mover itens selecionados</Text>

            <FlatList
              data={[{ id: "root", name: "Home", parentId: null as string | null }, ...Object.values(folders)]}
              keyExtractor={(item) => item.id}
              style={styles.moveList}
              renderItem={({ item }) => {
                const id = item.id === "root" ? null : item.id;
                const selected = moveSelectedTargetFolderId === id;
                const disabled = selectedItems.some(
                  (selectedItem) =>
                    selectedItem.kind === "folder" &&
                    (id === selectedItem.id || isDescendantOf(id, selectedItem.id))
                );

                return (
                  <Pressable
                    disabled={disabled}
                    onPress={() => setMoveSelectedTargetFolderId(id)}
                    style={[
                      styles.moveRow,
                      selected && { backgroundColor: theme.colors.primaryAlpha20 },
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
              <Pressable onPress={() => setShowMoveSelectedModal(false)} style={styles.secondaryButton}>
                <Text muted>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleConfirmMoveSelected} style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}> 
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
                      selected && { backgroundColor: theme.colors.primaryAlpha20 },
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
                    style={[styles.moveRow, selected && { backgroundColor: theme.colors.primaryAlpha20 }]}
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
              await actions.delete({ kind: "folder", id: pendingDelete.id, parentId: folderId });
            } else if (pendingDelete.type === "note") {
              await actions.delete({ kind: "note", id: pendingDelete.id, parentId: folderId });
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
            logError("[item] delete failed", error);
            showToast("Could not delete item", "error");
          } finally {
            setDeleteSubmitting(false);
          }
        }}
      />

      <FolderExplorerMenu
        visible={showExplorerMenu}
        onClose={() => setShowExplorerMenu(false)}
        folders={folders}
        notes={notes}
        quickNotes={quickNotes}
        expandedFolders={expandedFolders}
        onToggleExpand={toggleExpandedFolder}
        onSelectNote={handleSelectNoteFromMenu}
        onSelectQuickNote={handleSelectQuickNoteFromMenu}
        currentFolderId={folderId}
        backgroundColor={theme.colors.background}
        cardColor={theme.colors.card}
        textPrimary={theme.colors.textPrimary}
        textSecondary={theme.colors.textSecondary}
        primaryColor={theme.colors.primary}
        borderColor={theme.colors.border}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  screenRoot: {
    paddingTop: 0
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
    marginBottom: 12,
    zIndex: 4,
    elevation: 4
  },
  selectionBarOverlay: {
    position: "absolute",
    top: 2,
    left: 0,
    right: 0,
    height: 56,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 1000,
    elevation: 8
  },
  selectionCountText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700"
  },
  selectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center"
  },
  backButton: {
    width: 34,
    height: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  menuButton: {
    width: 34,
    height: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  section: {
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 0,
    marginBottom: 16,
    marginTop: 2,
    flex: 1,
    minHeight: 300
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 2
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  viewToggleWrap: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: "hidden"
  },
  viewToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  sortButton: {
    width: 30,
    height: 30,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  sectionListContent: {
    flex: 1,
    minHeight: 200
  },
  sectionListContentContainer: {
    paddingBottom: 200
  },
  gridContentContainer: {
    paddingHorizontal: GRID_PADDING
  },
  gridSectionBlock: {
    marginBottom: 8
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between"
  },
  gridSurface: {
    width: "100%"
  },
  gridItem: {
    justifyContent: "flex-start",
    paddingBottom: 10
  },
  folderGridCard: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 120,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 0
  },
  fileGridCard: {
    marginTop: 2,
    marginBottom: 14
  },
  fileGridBody: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4
  },
  fileGridHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  fileGridTitle: {
    fontWeight: "700",
    lineHeight: 19,
    minHeight: 38
  },
  itemCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 88,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 0
  },
  gridItemCard: {
    width: "48%",
    marginBottom: 10
  },
  listItemCard: {
    width: "100%",
    marginBottom: 8
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
    flex: 1,
    flexShrink: 1
  },
  rowTitle: {
    fontWeight: "600",
    marginBottom: 2,
    flexShrink: 1
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
    right: 20,
    zIndex: 999,
    elevation: 12
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
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12
  }
});

export default FolderDetailScreen;

