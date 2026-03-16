import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, Pressable, Image, LayoutAnimation } from "react-native";
import { useFeedback } from "@components/FeedbackProvider";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { PrimaryButton } from "@components/PrimaryButton";
import { FolderIcon } from "@components/FolderIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { useTheme } from "@hooks/useTheme";
import { useAppStore } from "@store/useAppStore";
import { createFolder, deleteFolder, getFoldersByParent, reorderFolders, updateFolder } from "@services/foldersService";
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
import type { Folder } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";

type Nav = NativeStackNavigationProp<FoldersStackParamList, "FoldersRoot">;
type FolderSortMode = "custom" | "recent" | "name_asc" | "name_desc";
const FOLDER_ORDER_SCOPE = "folders.root";
const FOLDER_SORT_SCOPE = "folders.root.sort";

const FoldersScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
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

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<Folder | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMode, setSortMode] = useState<FolderSortMode>("custom");
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [folderDeleting, setFolderDeleting] = useState(false);

  // Debounce refs — ensure rapid drags only trigger one DB write (last-wins).
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOrderRef = useRef<string[]>([]);

  useEffect(() => {
    (async () => {
      const [rootFolders, pinned, savedSort] = await Promise.all([
        getFoldersByParent(null),
        getPinnedItems(),
        getSortPreference<FolderSortMode>(FOLDER_SORT_SCOPE, "custom")
      ]);
      setFolders(rootFolders);
      setPinnedItems(pinned);
      setSortMode(savedSort);
    })();
  }, [setFolders, setPinnedItems]);

  const rootFolders = Object.values(folders)
    .filter((f) => f.parentId == null)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  const visibleFolders = (() => {
    if (sortMode === "name_asc") return [...rootFolders].sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === "name_desc") return [...rootFolders].sort((a, b) => b.name.localeCompare(a.name));
    if (sortMode === "recent") return [...rootFolders].sort((a, b) => b.createdAt - a.createdAt);
    return [...rootFolders].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  })();

  const onChangeSort = async (mode: FolderSortMode) => {
    setSortMode(mode);
    await saveSortPreference(FOLDER_SORT_SCOPE, mode);
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text variant="title">Folders</Text>
          <Text muted>Root folders</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowSortMenu(true)}
            style={[styles.sortButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          >
            <Ionicons name="funnel-outline" size={16} color={theme.colors.textPrimary} />
          </Pressable>
          <PrimaryButton label="+ Folder" onPress={() => setShowCreateModal(true)} />
        </View>
      </View>

      <DraggableFlatList
        contentContainerStyle={styles.listContent}
        data={visibleFolders}
        keyExtractor={(item) => item.id}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={9}
        removeClippedSubviews
        activationDistance={12}
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
          return (
            <Pressable
              onLongPress={() => setSelectedFolder(item)}
              delayLongPress={260}
              style={({ pressed }) => [
                styles.folderCard,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  shadowColor: theme.colors.textPrimary,
                  transform: [{ scale: pressed ? 0.992 : 1 }],
                  opacity: pressed ? 0.96 : 1,
                  elevation: isActive ? 8 : 2,
                  shadowOpacity: isActive ? 0.24 : 0.08
                }
              ]}
              onPress={() =>
                withLock(() => {
                  navigation.navigate("FolderDetail", { folderId: item.id, trail: [item.id] });
                  addRecentOpen("folder", item.id).then((nextRecent) => setRecentItems(nextRecent));
                })
              }
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
        visible={!!selectedFolder}
        title={selectedFolder?.name}
        onClose={() => setSelectedFolder(null)}
        actions={[
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
              setPendingDeleteFolder(selectedFolder);
            }
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
  sortButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  folderCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2
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
  emptyText: {
    marginTop: 24,
    textAlign: "center"
  },
  listContent: {
    paddingVertical: 4,
    paddingBottom: 24,
    gap: 8
  }
});

export default FoldersScreen;

