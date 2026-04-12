import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Image, LayoutAnimation, Animated, Share, Alert, useWindowDimensions, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFeedback } from "@components/FeedbackProvider";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { FolderIcon } from "@components/FolderIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { SelectionIndicator } from "@components/SelectionIndicator";
import { FloatingButton } from "@components/FloatingButton";
import { useTheme } from "@hooks/useTheme";
import { useAppStore } from "@store/useAppStore";
import { createFolder, getFoldersByParent, updateFolder } from "@services/foldersService";
import { useNotesStore } from "@store/useNotesStore";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { useFilesStore } from "@store/useFilesStore";
import { getAllNotes, getAllQuickNotes } from "@services/notesService";
import { importFileFromDevice } from "@services/filesService";
import { useFolderFABActions } from "@hooks/useFolderFABActions";
import {
  addRecentOpen,
  getPinnedItems,
  getSortPreference,
  saveSortPreference
} from "@services/appMetaService";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { FoldersStackParamList } from "@navigation/RootNavigator";
import { useNavigationLock } from "@hooks/useNavigationLock";
import { FolderNameModal } from "@components/FolderNameModal";
import type { Folder, ID } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { DraggableGrid } from "react-native-draggable-grid";
import { useGlobalSelection } from "@hooks/useGlobalSelection";
import { useItemActions } from "@hooks/useItemActions";
import { useUnifiedItems } from "@hooks/useUnifiedItems";
import type { AppItem } from "@domain/items/types";
const firstLine = (text: string): string => {
  if (!text) return "";
  return text.split("\n")[0].slice(0, 90);
};

type SelectedItem = AppItem & { label: string };
type GridFolderItem = Folder & { key: string; disabledDrag?: boolean };

type Nav = NativeStackNavigationProp<FoldersStackParamList, "FoldersRoot">;
type FolderSortMode = "custom" | "recent" | "name_asc" | "name_desc";
type FolderViewMode = "list" | "grid";
const FOLDER_ORDER_SCOPE = "folders.root";
const FOLDER_SORT_SCOPE = "folders.root.sort";
const FLOATING_TAB_BAR_HEIGHT = 68;
const FLOATING_TAB_BAR_MARGIN = 8;
const FLOATING_TAB_BAR_MIN_BOTTOM = 16;
const LIST_BOTTOM_EXTRA = 140;
const TOP_PADDING_DEFAULT = 24;
const TOP_PADDING_WITH_SELECTION = 80;
const GRID_COLUMNS = 2;
const GRID_PADDING = 20;
const GRID_GAP = 20;
const GRID_ITEM_HEIGHT = 180;
const GRID_CELL_HEIGHT = GRID_ITEM_HEIGHT + GRID_GAP;

const FoldersScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { withLock } = useNavigationLock();
  const { showToast } = useFeedback();
  const actions = useItemActions();
  const folders = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);
  const upsertFolder = useAppStore((s) => s.upsertFolder);
  const pinnedItems = useAppStore((s) => s.pinnedItems);
  const setPinnedItems = useAppStore((s) => s.setPinnedItems);
  const setRecentItems = useAppStore((s) => s.setRecentItems);

  const notesMap = useNotesStore((s) => s.notes);
  const setNotes = useNotesStore((s) => s.setNotes);
  const quickNotesMap = useQuickNotesStore((s) => s.quickNotes);
  const setQuickNotes = useQuickNotesStore((s) => s.setQuickNotes);

  const upsertFile = useFilesStore((s) => s.upsertFile);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<Folder | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showAddFileMenu, setShowAddFileMenu] = useState(false);
  const [sortMode, setSortMode] = useState<FolderSortMode>("custom");
  const [viewMode, setViewMode] = useState<FolderViewMode>("grid");
  const [fabOpen, setFabOpen] = useState(false);
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);
  const [dragState, setDragState] = useState<{ activeId: ID | null; isDragging: boolean }>({
    activeId: null,
    isDragging: false
  });
  const [gridFoldersData, setGridFoldersData] = useState<GridFolderItem[]>([]);
  const fabAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const [rootFolders, pinned, savedSort, allNotes, allQuickNotes] = await Promise.all([
        getFoldersByParent(null),
        getPinnedItems(),
        getSortPreference<FolderSortMode>(FOLDER_SORT_SCOPE, "custom"),
        getAllNotes(),
        getAllQuickNotes()
      ]);
      setFolders(rootFolders);
      setPinnedItems(pinned);
      setSortMode(savedSort);
      setNotes(allNotes);
      setQuickNotes(allQuickNotes);
    })();
  }, [setFolders, setPinnedItems, setNotes, setQuickNotes]);

  const {
    folders: rootFolders,
    notes: looseNotes,
    quickNotes: looseQuickNotes,
    selectableItems
  } = useUnifiedItems({ scope: "root" });

  const visibleFolders = useMemo(() => {
    if (sortMode === "name_asc") return [...rootFolders].sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === "name_desc") return [...rootFolders].sort((a, b) => b.name.localeCompare(a.name));
    if (sortMode === "recent") return [...rootFolders].sort((a, b) => b.createdAt - a.createdAt);
    return [...rootFolders].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [rootFolders, sortMode]);

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

  const listBottomPadding = useMemo(
    () =>
      Math.max(insets.bottom + FLOATING_TAB_BAR_MARGIN, FLOATING_TAB_BAR_MIN_BOTTOM) +
      FLOATING_TAB_BAR_HEIGHT +
      LIST_BOTTOM_EXTRA,
    [insets.bottom]
  );

  const gridItemWidth = useMemo(() => {
    return (width - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  }, [width]);

  const fabActions = useFolderFABActions({
    folderId: null,
    onShowCreateFolder: () => setShowCreateModal(true),
    onShowAddFile: () => {
      setShowAddFileMenu(true);
      setFabOpen(false);
    },
    isDetailScreen: false
  });

  const canDragReorder = sortMode === "custom";
  const isScrollLocked = dragState.isDragging;

  const ensureFolderSelectedForDrag = useCallback(
    (folder: Pick<Folder, "id" | "name" | "parentId">) => {
      const item = { kind: "folder" as const, id: folder.id, parentId: folder.parentId ?? null, label: folder.name };
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

  const handleStartSelection = useCallback(
    (item: SelectedItem) => {
      if (dragState.isDragging) return;
      startSelection(item);
    },
    [dragState.isDragging, startSelection]
  );

  const tryStartDrag = useCallback(
    (folder: Pick<Folder, "id" | "name" | "parentId">, drag: () => void) => {
      if (sortMode !== "custom") {
        showToast("Use ordenação: Custom order para reordenar");
        return;
      }
      ensureFolderSelectedForDrag(folder);
      setShowSelectionMenu(false);
      setDragState({ activeId: folder.id, isDragging: true });
      drag();
    },
    [ensureFolderSelectedForDrag, showToast, sortMode]
  );

  useEffect(() => {
    if (!canDragReorder) {
      setDragState({ activeId: null, isDragging: false });
    }
  }, [canDragReorder]);

  useEffect(() => {
    if (viewMode !== "grid") return;
    setGridFoldersData(
      visibleFolders.map((folder) => ({
        ...folder,
        key: folder.id
      }))
    );
  }, [viewMode, visibleFolders]);

  const handleClearSelection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    clearSelection();
    setShowSelectionMenu(false);
  }, [clearSelection]);

  const handlePinSelected = useCallback(async () => {
    const items = selectedItems;
    try {
      for (const item of items) {
        await actions.pin(item);
      }
      showToast("Pins atualizados");
    } finally {
      handleClearSelection();
    }
  }, [actions, handleClearSelection, selectedItems, showToast]);

  const handleEditSelected = useCallback(() => {
    if (selectedItems.length !== 1) return;
    const item = selectedItems[0];
    handleClearSelection();
    if (item.kind === "folder") {
      const folder = folders[item.id];
      if (!folder) return;
      setEditingFolder(folder);
      return;
    }
    if (item.kind === "note") {
      const note = notesMap[item.id];
      if (!note) return;
      withLock(() => {
        navigation.getParent()?.getParent()?.navigate("NoteEditor", { noteId: note.id, folderId: null });
      });
      return;
    }
    const quick = quickNotesMap[item.id];
    if (!quick) return;
    withLock(() => {
      navigation.getParent()?.getParent()?.navigate("QuickNote", { quickNoteId: quick.id, folderId: null });
    });
  }, [folders, handleClearSelection, navigation, notesMap, quickNotesMap, selectedItems, withLock]);

  const handleShareSelected = useCallback(async () => {
    const items = selectedItems;
    if (!items.length) return;

    if (items.length === 1) {
      try {
        await actions.share(items[0]);
      } finally {
        handleClearSelection();
      }
      return;
    }

    // For non-folder/mixed selections, keep the current text share behavior.
    const message = items
      .map((item) => {
        if (item.kind === "folder") return `Pasta: ${item.label}`;
        if (item.kind === "note") return `Nota: ${item.label}`;
        return `Quick Note: ${item.label}`;
      })
      .join("\n");
    try {
      await Share.share({
        title: items.length === 1 ? items[0].label : `${items.length} itens`,
        message
      });
    } finally {
      handleClearSelection();
    }
  }, [handleClearSelection, selectedItems, showToast]);

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
              await actions.delete(item);
            }
            handleClearSelection();
            showToast(selectedItems.length === 1 ? "Item apagado" : `${selectedItems.length} itens apagados`);
          }
        }
      ]
    );
  }, [actions, handleClearSelection, selectedItems, showToast]);

  const onChangeSort = async (mode: FolderSortMode) => {
    setSortMode(mode);
    await saveSortPreference(FOLDER_SORT_SCOPE, mode);
  };

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

  const looseNotesSection = (looseNotes.length || looseQuickNotes.length) ? (
    <View style={{ marginTop: 10 }}>
      <Text variant="subtitle">Loose notes</Text>
      {looseNotes.map((note) => (
        <Pressable
          key={`note-${note.id}`}
            onLongPress={() => handleStartSelection({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title })}
          delayLongPress={260}
          onPress={() => {
            if (selectionMode) {
              toggleSelection({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title });
              return;
            }
            withLock(() => {
              navigation.getParent()?.getParent()?.navigate("NoteEditor", { noteId: note.id, folderId: null });
            });
          }}
          style={[
            styles.folderCard,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              shadowColor: theme.colors.textPrimary,
              marginBottom: 6,
              borderWidth: 2
            },
            isSelected({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title }) && {
              borderColor: theme.colors.primary
            }
          ]}
        >
          <View style={styles.folderBody}>
            <View
              style={[
                styles.avatar,
                {
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.colors.surfaceElevated
                }
              ]}
            >
              <Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.folderTitle} numberOfLines={1}>
                {note.title}
              </Text>
              {!!firstLine(note.content) && (
                <Text muted variant="caption" numberOfLines={1}>
                  {firstLine(note.content)}
                </Text>
              )}
            </View>
          </View>
          <SelectionIndicator visible={isSelected({ kind: "note", id: note.id, parentId: note.folderId ?? null, label: note.title })} />
        </Pressable>
      ))}
      {looseQuickNotes.map((quick) => (
        <Pressable
          key={`quick-${quick.id}`}
          onLongPress={() => handleStartSelection({ kind: "quick", id: quick.id, parentId: quick.folderId ?? null, label: quick.title })}
          delayLongPress={260}
          onPress={() => {
            if (selectionMode) {
              toggleSelection({ kind: "quick", id: quick.id, parentId: quick.folderId ?? null, label: quick.title });
              return;
            }
            withLock(() => {
              navigation.getParent()?.getParent()?.navigate("QuickNote", {
                quickNoteId: quick.id,
                folderId: null
              });
            });
          }}
          style={[
            styles.folderCard,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              shadowColor: theme.colors.textPrimary,
              marginBottom: 6,
              borderWidth: 2
            },
            isSelected({ kind: "quick", id: quick.id, parentId: quick.folderId ?? null, label: quick.title }) && {
              borderColor: theme.colors.primary
            }
          ]}
        >
          <View style={styles.folderBody}>
            <View
              style={[
                styles.avatar,
                {
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.colors.surfaceElevated
                }
              ]}
            >
              <Ionicons name="flash-outline" size={18} color={theme.colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.folderTitle} numberOfLines={1}>
                {quick.title}
              </Text>
              {!!firstLine(quick.content) && (
                <Text muted variant="caption" numberOfLines={1}>
                  {firstLine(quick.content)}
                </Text>
              )}
            </View>
          </View>
          <SelectionIndicator visible={isSelected({ kind: "quick", id: quick.id, parentId: quick.folderId ?? null, label: quick.title })} />
        </Pressable>
      ))}
    </View>
  ) : null;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <>
          <View>
            <Text variant="title">Folders</Text>
            <Text muted>Root folders</Text>
          </View>
          <View style={styles.headerActions}>
            <View style={[styles.viewToggleWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
              <Pressable
                onPress={() => setViewMode("list")}
                style={[
                  styles.viewToggleBtn,
                  viewMode === "list" && { backgroundColor: theme.colors.primaryAlpha20 }
                ]}
              >
                <Ionicons name="list-outline" size={16} color={viewMode === "list" ? theme.colors.primary : theme.colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => setViewMode("grid")}
                style={[
                  styles.viewToggleBtn,
                  viewMode === "grid" && { backgroundColor: theme.colors.primaryAlpha20 }
                ]}
              >
                <Ionicons name="grid-outline" size={16} color={viewMode === "grid" ? theme.colors.primary : theme.colors.textSecondary} />
              </Pressable>
            </View>
            <Pressable
              onLongPress={() => {
                if (sortMode !== "custom") {
                  showToast("Use ordenação: Custom order para reordenar");
                  return;
                }
                if (dragState.isDragging) {
                  setDragState({ activeId: null, isDragging: false });
                  return;
                }
                showToast("Segure um item para mover");
              }}
              delayLongPress={220}
              onPress={() => setShowSortMenu(true)}
              style={[styles.sortButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            >
              <Ionicons name="funnel-outline" size={16} color={theme.colors.textPrimary} />
            </Pressable>
          </View>
        </>

        {selectionMode && (
          <View style={[styles.selectionBar, styles.selectionBarOverlay, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
            <Pressable onPress={handleClearSelection} style={styles.selectionTopAction} hitSlop={8}>
              <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
            </Pressable>
            <Text style={[styles.selectionCount, { color: theme.colors.textPrimary }]}> 
              {selectionCount}
            </Text>
            <View style={styles.selectionActions}>
              <Pressable onPress={handleShareSelected} style={styles.selectionActionBtn} hitSlop={8}>
                <Ionicons name="share-social-outline" size={18} color={theme.colors.textPrimary} />
              </Pressable>
              <Pressable onPress={handleDeleteSelected} style={styles.selectionActionBtn} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              </Pressable>
              {selectionCount === 1 && (
                <Pressable onPress={handleEditSelected} style={styles.selectionActionBtn} hitSlop={8}>
                  <Ionicons name="pencil-outline" size={18} color={theme.colors.textPrimary} />
                </Pressable>
              )}
              <Pressable onPress={() => setShowSelectionMenu(true)} style={styles.selectionActionBtn} hitSlop={8}>
                <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textPrimary} />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {viewMode === "grid" ? (
        <ScrollView
          scrollEnabled={!isScrollLocked}
          contentContainerStyle={{ paddingTop: 8, paddingHorizontal: GRID_PADDING, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {gridFoldersData.length ? (
            <DraggableGrid<GridFolderItem>
              disabled={!canDragReorder}
              numColumns={GRID_COLUMNS}
              itemHeight={GRID_CELL_HEIGHT}
              style={styles.gridSurface}
              data={gridFoldersData}
              delayLongPress={250}
              onDragStart={(item) => {
                setDragState({ activeId: item.id, isDragging: true });
                ensureFolderSelectedForDrag(item);
              }}
              onDragItemActive={(item) => {
                setDragState({ activeId: item.id, isDragging: true });
              }}
              onDragRelease={(data) => {
                const orderedIds = data.map((folder) => folder.id);
                setGridFoldersData(
                  data.map((folder) => ({
                    ...folder,
                    key: folder.id
                  }))
                );
                actions.reorder({ kind: "folder", parentId: null, orderedIds });
                setSortMode("custom");
                saveSortPreference(FOLDER_SORT_SCOPE, "custom");
                setDragState({ activeId: null, isDragging: false });
              }}
              onItemPress={(item) => {
                if (dragState.isDragging) return;
                if (selectionMode) {
                  toggleSelection({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name });
                  return;
                }
                withLock(() => {
                  navigation.navigate("FolderDetail", { folderId: item.id, trail: [item.id], from: "folders" });
                  addRecentOpen("folder", item.id).then((nextRecent) => setRecentItems(nextRecent));
                });
              }}
              onItemLongPress={(item) => {
                if (dragState.isDragging) return;
                if (!selectionMode) {
                  handleStartSelection({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name });
                  return;
                }
                toggleSelection({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name });
              }}
              renderItem={(item: GridFolderItem, index: number) => (
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
                        flex: 0,
                        minHeight: GRID_ITEM_HEIGHT,
                        height: GRID_ITEM_HEIGHT,
                        marginHorizontal: 0
                      },
                      {
                        borderColor: theme.colors.border,
                        borderWidth: 2,
                        backgroundColor: theme.colors.card,
                        shadowColor: theme.colors.textPrimary
                      },
                      isSelected({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name }) && {
                        borderColor: theme.colors.primary
                      },
                      dragState.activeId === item.id && {
                        opacity: 0.96,
                        backgroundColor: theme.colors.primaryAlpha20,
                        transform: [{ scale: 1.03 }],
                        shadowOpacity: 0.24,
                        shadowRadius: 10,
                        shadowOffset: { width: 0, height: 6 },
                        elevation: 10,
                      },
                      selectionMode && {
                        transform: [{ scale: 0.98 }]
                      }
                    ]}
                  >
                    {item.bannerPath ? (
                      <Image source={{ uri: item.bannerPath }} style={styles.gridBanner} resizeMode="cover" />
                    ) : (
                      <View style={[styles.gridBanner, { backgroundColor: theme.colors.surfaceElevated }]} />
                    )}
                    <View style={styles.gridFolderBody}>
                      {item.photoPath ? (
                        <Image source={{ uri: item.photoPath }} style={styles.gridAvatar} resizeMode="cover" />
                      ) : (
                        <View style={[styles.gridAvatarPlaceholder, { backgroundColor: theme.colors.surfaceElevated }]}> 
                          <FolderIcon color={item.color} fallbackColor={theme.colors.primary} size={18} plain />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.gridFolderTitle} numberOfLines={1}>
                          {item.name}
                        </Text>
                        {!!item.description && (
                          <Text muted variant="caption" numberOfLines={2} style={styles.gridDescription}>
                            {item.description}
                          </Text>
                        )}
                      </View>
                    </View>

                    <SelectionIndicator visible={isSelected({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name })} />
                  </View>
                </View>
              )}
            />
          ) : (
            <Text muted style={styles.emptyText}>
              No folders here yet.
            </Text>
          )}

          {/* LOOSE NOTES - renderizado dentro do ScrollView */}
          <View style={{ marginTop: 16 }}>{looseNotesSection}</View>
        </ScrollView>
      ) : (
        <DraggableFlatList
          key={viewMode}
          scrollEnabled={!isScrollLocked}
          contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPadding }]}
          data={visibleFolders}
          keyExtractor={(item) => item.id}
          numColumns={1}
          dragItemOverflow
          animationConfig={{ damping: 22, mass: 0.35, stiffness: 190 }}
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={9}
          removeClippedSubviews
          activationDistance={12}
          onDragBegin={(index) => {
            const dragged = visibleFolders[index];
            setDragState({ activeId: dragged?.id ?? null, isDragging: true });
            // Não chamar ensureFolderSelectedForDrag aqui: altera selectionMode → flicker
          }}
          renderPlaceholder={() => <View style={styles.staticDragPlaceholder} />}
          ListFooterComponent={looseNotesSection}
          onRelease={() => {
            setDragState((current) => ({ ...current, isDragging: false, activeId: null }));
          }}
          onDragEnd={(params) => {
            const orderedIds = params.data.map((folder) => folder.id);
            actions.reorder({ kind: "folder", parentId: null, orderedIds });
            setSortMode("custom");
            saveSortPreference(FOLDER_SORT_SCOPE, "custom");
            setDragState({ activeId: null, isDragging: false });
          }}
          renderItem={({ item, drag, isActive }: RenderItemParams<Folder>) => (
            <Pressable
              onLongPress={() => {
                if (dragState.isDragging) return;
                if (sortMode === "custom") {
                  tryStartDrag(item, drag);
                  return;
                }
                handleStartSelection({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name });
              }}
              delayLongPress={260}
              onPress={() => {
                if (dragState.isDragging) return;
                if (selectionMode) {
                  toggleSelection({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name });
                  return;
                }
                withLock(() => {
                  navigation.navigate("FolderDetail", { folderId: item.id, trail: [item.id], from: "folders" });
                  addRecentOpen("folder", item.id).then((nextRecent) => setRecentItems(nextRecent));
                });
              }}
              style={[
                styles.folderCard,
                { borderColor: theme.colors.border, borderWidth: 2, backgroundColor: theme.colors.card, shadowColor: theme.colors.textPrimary },
                isSelected({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name }) && {
                  borderColor: theme.colors.primary
                },
                (isActive || dragState.activeId === item.id) && {
                  opacity: 0.96,
                  backgroundColor: theme.colors.primaryAlpha20,
                  transform: [{ scale: 1.03 }],
                  shadowOpacity: 0.24,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 10,
                }
              ]}
            >
              {!!item.bannerPath && <Image source={{ uri: item.bannerPath }} style={styles.banner} resizeMode="cover" />}
              <View style={styles.folderBody}>
                {item.photoPath ? (
                  <Image source={{ uri: item.photoPath }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <FolderIcon color={item.color} fallbackColor={theme.colors.primary} size={20} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.folderTitle}>{item.name}</Text>
                  {!!item.description && (
                    <Text muted variant="caption" numberOfLines={2}>
                      {item.description}
                    </Text>
                  )}
                </View>
              </View>
              <SelectionIndicator visible={isSelected({ kind: "folder", id: item.id, parentId: item.parentId ?? null, label: item.name })} />
            </Pressable>
          )}
          ListEmptyComponent={
            <Text muted style={styles.emptyText}>
              No folders here yet.
            </Text>
          }
        />
      )}

      <ContextActionMenu
        visible={showSortMenu}
        title="Sort folders"
        onClose={() => setShowSortMenu(false)}
        actions={[
          { key: "custom", label: "Custom order", icon: "reorder-three-outline", onPress: () => onChangeSort("custom") },
          { key: "recent", label: "Most recent", icon: "time-outline", onPress: () => onChangeSort("recent") },
          { key: "az", label: "Name (A-Z)", icon: "text-outline", onPress: () => onChangeSort("name_asc") },
          { key: "za", label: "Name (Z-A)", icon: "text-outline", onPress: () => onChangeSort("name_desc") }
        ]}
      />

      <ContextActionMenu
        visible={showSelectionMenu}
        title="Ações secundárias"
        onClose={() => setShowSelectionMenu(false)}
        actions={[
          (() => {
            const pinnable = selectedItems.filter(i => i.kind !== "quick");
            const allPinned = pinnable.length > 0 && pinnable.every(i => {
              const type = i.kind === "folder" ? "folder" : "note";
              return pinnedItems.some(p => p.type === type && p.id === i.id);
            });
            return {
              key: "pin",
              label: allPinned ? "Despinar" : "Pinar",
              icon: allPinned ? "pin" : "pin-outline" as const,
              onPress: handlePinSelected
            };
          })(),
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
              showToast("Segure o item para mover");
              handleClearSelection();
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
                showToast("Selecione apenas 1 pasta para editar");
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
              const created = await importFileFromDevice(null);
              if (created) upsertFile(created);
              setShowAddFileMenu(false);
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

      <FolderNameModal
        visible={showCreateModal}
        onCancel={() => {
          if (folderSubmitting) return;
          setShowCreateModal(false);
        }}
        submitting={folderSubmitting}
        onConfirm={async (payload) => {
          if (folderSubmitting) return;
          setFolderSubmitting(true);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          try {
            const folder = await createFolder(
              payload.name,
              null,
              payload.color,
              payload.description,
              payload.photoPath,
              payload.bannerPath
            );
            upsertFolder(folder);
            setShowCreateModal(false);
            showToast("Folder saved ✓");
          } catch (error) {
            console.error("[folder] create failed", error);
            showToast("Could not save folder", "error");
          } finally {
            setFolderSubmitting(false);
          }
        }}
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
            handleClearSelection();
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

      <DeleteConfirmModal
        visible={!!pendingDeleteFolder}
        itemLabel="folder"
        loading={folderDeleting}
        onCancel={() => {
          if (folderDeleting) return;
          setPendingDeleteFolder(null);
        }}
        onConfirm={async () => {
          if (!pendingDeleteFolder || folderDeleting) return;
          setFolderDeleting(true);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          try {
            await actions.deleteItem({ kind: "folder", id: pendingDeleteFolder.id, parentId: pendingDeleteFolder.parentId ?? null });
            setPendingDeleteFolder(null);
            showToast("Deleted ✓");
          } catch (error) {
            console.error("[folder] delete failed", error);
            showToast("Could not delete folder", "error");
          } finally {
            setFolderDeleting(false);
          }
        }}
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

    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    marginBottom: 12
  },
  selectionBar: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center"
  },
  selectionBarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000
  },
  selectionTopAction: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  selectionCount: {
    flex: 1,
    marginLeft: 4,
    fontSize: 15,
    fontWeight: "700"
  },
  selectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  selectionActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  viewToggleWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden"
  },
  viewToggleBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center"
  },
  sortButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  listContent: {
    paddingVertical: 4,
    gap: 8
  },
  gridSurface: {
    width: "100%"
  },
  gridItem: {
    justifyContent: "flex-start"
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
  gridBanner: {
    width: "100%",
    height: 86
  },
  gridFolderBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12
  },
  gridAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12
  },
  gridAvatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden"
  },
  gridFolderTitle: {
    fontWeight: "600",
    marginBottom: 2
  },
  gridDescription: {
    marginTop: 0
  },
  emptyText: {
    marginTop: 24,
    textAlign: "center"
  },
  folderCard: {
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 0
  },
  staticDragPlaceholder: {
    height: 0,
    minHeight: 0,
    opacity: 0,
    borderWidth: 0,
    margin: 0,
    padding: 0
  },
  banner: {
    width: "100%",
    height: 86
  },
  folderBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 11
  },
  folderTitle: {
    fontWeight: "600",
    marginBottom: 2
  },
  dragHandle: {
    paddingHorizontal: 2,
    paddingVertical: 4
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

export default FoldersScreen;

