import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Image, LayoutAnimation, Animated, Share, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFeedback } from "@components/FeedbackProvider";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { FolderIcon } from "@components/FolderIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { useTheme } from "@hooks/useTheme";
import { useAppStore } from "@store/useAppStore";
import { createFolder, deleteFolder, getFoldersByParent, reorderFolders, updateFolder } from "@services/foldersService";
import { useNotesStore } from "@store/useNotesStore";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { getAllNotes, getAllQuickNotes, deleteNote, deleteQuickNote } from "@services/notesService";
import {
  addRecentOpen,
  getPinnedItems,
  getSortPreference,
  savePinnedItems,
  saveSortPreference
} from "@services/appMetaService";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { FoldersStackParamList } from "@navigation/RootNavigator";
import { useNavigationLock } from "@hooks/useNavigationLock";
import { FolderNameModal } from "@components/FolderNameModal";
import type { Folder, Note, QuickNote, ID } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { useSelection } from "@hooks/useSelection";
import { exportFolderPackageAndShare } from "@services/folderPackageService";

const firstLine = (text: string): string => {
  if (!text) return "";
  return text.split("\n")[0].slice(0, 90);
};

type SelectableKind = "folder" | "note" | "quick";
type SelectedItem = { kind: SelectableKind; id: ID; label: string };

type Nav = NativeStackNavigationProp<FoldersStackParamList, "FoldersRoot">;
type FolderSortMode = "custom" | "recent" | "name_asc" | "name_desc";
type FolderViewMode = "list" | "grid";
const FOLDER_ORDER_SCOPE = "folders.root";
const FOLDER_SORT_SCOPE = "folders.root.sort";

const FoldersScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { withLock } = useNavigationLock();
  const { showToast } = useFeedback();
  const folders = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);
  const upsertFolder = useAppStore((s) => s.upsertFolder);
  const removeFolder = useAppStore((s) => s.removeFolder);
  const reorderFoldersInStore = useAppStore((s) => s.reorderFoldersInStore);
  const pinnedItems = useAppStore((s) => s.pinnedItems);
  const togglePinned = useAppStore((s) => s.togglePinned);
  const setPinnedItems = useAppStore((s) => s.setPinnedItems);
  const setRecentItems = useAppStore((s) => s.setRecentItems);

  const notesMap = useNotesStore((s) => s.notes);
  const setNotes = useNotesStore((s) => s.setNotes);
  const removeNote = useNotesStore((s) => s.removeNote);
  const quickNotesMap = useQuickNotesStore((s) => s.quickNotes);
  const setQuickNotes = useQuickNotesStore((s) => s.setQuickNotes);
  const removeQuickNote = useQuickNotesStore((s) => s.removeQuickNote);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<Folder | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMode, setSortMode] = useState<FolderSortMode>("custom");
  const [viewMode, setViewMode] = useState<FolderViewMode>("grid");
  const [fabOpen, setFabOpen] = useState(false);
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;

  // Debounce refs — ensure rapid drags only trigger one DB write (last-wins).
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOrderRef = useRef<string[]>([]);

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

  const rootFolders = Object.values(folders)
    .filter((f) => f.parentId == null)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  const visibleFolders = (() => {
    if (sortMode === "name_asc") return [...rootFolders].sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === "name_desc") return [...rootFolders].sort((a, b) => b.name.localeCompare(a.name));
    if (sortMode === "recent") return [...rootFolders].sort((a, b) => b.createdAt - a.createdAt);
    return [...rootFolders].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  })();

  const looseNotes = useMemo(
    () => Object.values(notesMap).filter((n) => n.folderId == null),
    [notesMap]
  );

  const looseQuickNotes = useMemo(
    () => Object.values(quickNotesMap).filter((q) => q.folderId == null),
    [quickNotesMap]
  );

  const selectableItems = useMemo<SelectedItem[]>(
    () => [
      ...visibleFolders.map((folder) => ({ kind: "folder" as const, id: folder.id, label: folder.name })),
      ...looseNotes.map((note) => ({ kind: "note" as const, id: note.id, label: note.title })),
      ...looseQuickNotes.map((q) => ({ kind: "quick" as const, id: q.id, label: q.title }))
    ],
    [visibleFolders, looseNotes, looseQuickNotes]
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
  } = useSelection(selectableItems, {
    getKey: (item) => `${item.kind}:${item.id}`,
    onSelectionStart: () => showToast("Modo de seleção ativado")
  });

  const handleClearSelection = useCallback(() => {
    clearSelection();
    setShowSelectionMenu(false);
  }, [clearSelection]);

  const handlePinSelected = useCallback(async () => {
    for (const item of selectedItems) {
      if (item.kind === "quick") continue;
      const type = item.kind === "folder" ? "folder" : "note";
      const next = togglePinned(type, item.id);
      await savePinnedItems(next);
    }
    showToast("Pins atualizados");
  }, [selectedItems, showToast, togglePinned]);

  const handleEditSelected = useCallback(() => {
    if (selectedItems.length !== 1) return;
    const item = selectedItems[0];
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
  }, [folders, navigation, notesMap, quickNotesMap, selectedItems, withLock]);

  const handleShareSelected = useCallback(async () => {
    if (!selectedItems.length) return;

    // If a single folder is selected, export full subtree as ZIP and share it.
    if (selectedItems.length === 1 && selectedItems[0].kind === "folder") {
      const selectedFolder = selectedItems[0];
      try {
        await exportFolderPackageAndShare(selectedFolder.id, {
          onProgress: (event) => {
            if (event.step === "zipping" || event.step === "sharing") {
              showToast(`${event.message} ${Math.round(event.progress * 100)}%`);
            }
          },
          onMessage: (message, tone = "success") => showToast(message, tone)
        });
      } catch (error) {
        console.error("[folder-package] share failed", error);
        showToast("Nao foi possivel compartilhar a pasta", "error");
      }
      return;
    }

    // For non-folder/mixed selections, keep the current text share behavior.
    const message = selectedItems
      .map((item) => {
        if (item.kind === "folder") return `Pasta: ${item.label}`;
        if (item.kind === "note") return `Nota: ${item.label}`;
        return `Quick Note: ${item.label}`;
      })
      .join("\n");
    await Share.share({
      title: selectedItems.length === 1 ? selectedItems[0].label : `${selectedItems.length} itens`,
      message
    });
  }, [selectedItems, showToast]);

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
              if (item.kind === "folder") {
                await deleteFolder(item.id);
                removeFolder(item.id);
                continue;
              }
              if (item.kind === "note") {
                await deleteNote(item.id);
                removeNote(item.id);
                continue;
              }
              await deleteQuickNote(item.id);
              removeQuickNote(item.id);
            }
            handleClearSelection();
            showToast(selectedItems.length === 1 ? "Item apagado" : `${selectedItems.length} itens apagados`);
          }
        }
      ]
    );
  }, [handleClearSelection, removeFolder, selectedItems, showToast]);

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

  return (
    <Screen>
      <View style={styles.headerRow}>
        {selectionMode ? (
          <View style={[styles.selectionBar, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
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
        ) : (
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
                onPress={() => setShowSortMenu(true)}
                style={[styles.sortButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
              >
                <Ionicons name="funnel-outline" size={16} color={theme.colors.textPrimary} />
              </Pressable>
            </View>
          </>
        )}
      </View>

      <DraggableFlatList
        key={viewMode}
        contentContainerStyle={styles.listContent}
        data={visibleFolders}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === "grid" ? 2 : 1}
        columnWrapperStyle={viewMode === "grid" ? styles.gridColumn : undefined}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={9}
        removeClippedSubviews
        activationDistance={12}
        ListFooterComponent={
          (looseNotes.length || looseQuickNotes.length) ? (
            <View style={{ marginTop: 10 }}>
              <Text variant="subtitle">Loose notes</Text>
              {looseNotes.map((note) => (
                <Pressable
                  key={`note-${note.id}`}
                  onLongPress={() => startSelection({ kind: "note", id: note.id, label: note.title })}
                  delayLongPress={260}
                  onPress={() => {
                    if (selectionMode) {
                      toggleSelection({ kind: "note", id: note.id, label: note.title });
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
                      marginBottom: 6
                    },
                    isSelected({ kind: "note", id: note.id, label: note.title }) && {
                      borderColor: theme.colors.primary,
                      borderWidth: 1.5
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
                </Pressable>
              ))}
              {looseQuickNotes.map((quick) => (
                <Pressable
                  key={`quick-${quick.id}`}
                  onLongPress={() => startSelection({ kind: "quick", id: quick.id, label: quick.title })}
                  delayLongPress={260}
                  onPress={() => {
                    if (selectionMode) {
                      toggleSelection({ kind: "quick", id: quick.id, label: quick.title });
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
                      marginBottom: 6
                    },
                    isSelected({ kind: "quick", id: quick.id, label: quick.title }) && {
                      borderColor: theme.colors.primary,
                      borderWidth: 1.5
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
                </Pressable>
              ))}
            </View>
          ) : null
        }
        onDragEnd={useCallback(({ data }: { data: typeof visibleFolders }) => {
          const orderedIds = data.map((x) => x.id);

          // 1. Optimistic UI: update orderIndex in-place — no full map replace, no flicker.
          reorderFoldersInStore(orderedIds);
          setSortMode("custom");

          // 2. Debounced persist: last-wins so rapid drags never race.
          latestOrderRef.current = orderedIds;
          if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
          reorderTimerRef.current = setTimeout(() => {
            reorderTimerRef.current = null;
            const ids = latestOrderRef.current;
            saveSortPreference(FOLDER_SORT_SCOPE, "custom");
            reorderFolders(null, ids);
          }, 300);
        }, [reorderFoldersInStore])}
        renderItem={({ item, drag, isActive }: RenderItemParams<Folder>) => {
          if (viewMode === "list") {
            return (
              <Pressable
                onLongPress={() => {
                  startSelection({ kind: "folder", id: item.id, label: item.name });
                }}
                delayLongPress={260}
                onPress={() => {
                  if (selectionMode) {
                    toggleSelection({ kind: "folder", id: item.id, label: item.name });
                    return;
                  }
                  withLock(() => {
                    navigation.navigate("FolderDetail", { folderId: item.id, trail: [item.id], from: "folders" });
                    addRecentOpen("folder", item.id).then((nextRecent) => setRecentItems(nextRecent));
                  });
                }}
                style={[
                  styles.folderCard,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.card, shadowColor: theme.colors.textPrimary },
                  isSelected({ kind: "folder", id: item.id, label: item.name }) && {
                    borderColor: theme.colors.primary,
                    borderWidth: 1.5
                  },
                  isActive && { opacity: 0.6, backgroundColor: theme.colors.primaryAlpha20 }
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
                </View>
              </Pressable>
            );
          }

          return (
            <View style={[styles.gridItem, { flex: 1 }]}>
              <Pressable
                onLongPress={() => {
                  startSelection({ kind: "folder", id: item.id, label: item.name });
                }}
                delayLongPress={260}
                onPress={() => {
                  if (selectionMode) {
                    toggleSelection({ kind: "folder", id: item.id, label: item.name });
                    return;
                  }
                  withLock(() => {
                    navigation.navigate("FolderDetail", { folderId: item.id, trail: [item.id], from: "folders" });
                    addRecentOpen("folder", item.id).then((nextRecent) => setRecentItems(nextRecent));
                  });
                }}
                style={[
                  styles.folderGridCard,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.card,
                    shadowColor: theme.colors.textPrimary
                  },
                  isSelected({ kind: "folder", id: item.id, label: item.name }) && {
                    borderColor: theme.colors.primary,
                    borderWidth: 1.5
                  },
                  isActive && { opacity: 0.6, backgroundColor: theme.colors.primaryAlpha20 }
                ]}
              >
                {item.bannerPath ? (
                  <Image
                    source={{ uri: item.bannerPath }}
                    style={styles.gridBanner}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.gridBanner, { backgroundColor: theme.colors.surfaceElevated }]} />
                )}
                <View style={styles.gridFolderBody}>
                  {item.photoPath ? (
                    <Image
                      source={{ uri: item.photoPath }}
                      style={styles.gridAvatar}
                      resizeMode="cover"
                    />
                  ) : (
                      <View style={[styles.gridAvatarPlaceholder, { backgroundColor: theme.colors.surfaceElevated }]}> 
                      <FolderIcon
                        color={item.color}
                        fallbackColor={theme.colors.primary}
                        size={18}
                          plain
                      />
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
              </Pressable>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text muted style={styles.emptyText}>
            No folders here yet.
          </Text>
        }
      />

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
            onPress: () => showToast("Duplicação em breve")
          },
          {
            key: "move",
            label: "Mover",
            icon: "folder-open-outline",
            onPress: () => showToast("Mover em breve")
          },
          {
            key: "archive",
            label: "Arquivar / Desarquivar",
            icon: "archive-outline",
            onPress: () => showToast("Arquivo em breve")
          },
          {
            key: "tag",
            label: "Tag / Label",
            icon: "pricetag-outline",
            onPress: () => showToast("Tags em breve")
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
            await deleteFolder(pendingDeleteFolder.id);
            removeFolder(pendingDeleteFolder.id);
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
        {([
          {
            key: "note",
            label: "Create Note",
            icon: "document-text-outline" as const,
            onPress: () => {
              closeFab();
              withLock(() => {
                navigation.getParent()?.getParent()?.navigate("NoteEditor", { folderId: null });
              });
            }
          },
          {
            key: "quick-note",
            label: "Quick Note",
            icon: "flash-outline" as const,
            onPress: () => {
              closeFab();
              withLock(() => {
                navigation.getParent()?.getParent()?.navigate("QuickNote", { folderId: null });
              });
            }
          },
          {
            key: "folder",
            label: "Create Folder",
            icon: "folder-outline" as const,
            onPress: () => {
              closeFab();
              setShowCreateModal(true);
            }
          },
          {
            key: "import-package",
            label: "Import Package",
            icon: "download-outline" as const,
            onPress: () => {
              closeFab();
              withLock(() => {
                navigation.getParent()?.getParent()?.navigate("ImportFolderPackage");
              });
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
  selectionBar: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center"
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
    paddingBottom: 120,
    gap: 8
  },
  gridColumn: {
    gap: 12,
    marginHorizontal: 0,
    alignItems: "stretch"
  },
  gridItem: {
    paddingHorizontal: 0,
    alignSelf: "stretch"
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

