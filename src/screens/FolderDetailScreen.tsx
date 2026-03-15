import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, FlatList, Pressable, ScrollView } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { PrimaryButton } from "@components/PrimaryButton";
import { FolderNameModal } from "@components/FolderNameModal";
import { FolderIcon } from "@components/FolderIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { NoteEditModal } from "@components/NoteEditModal";
import { useTheme } from "@hooks/useTheme";
import type { CompositeNavigationProp, RouteProp } from "@react-navigation/native";
import type { FoldersStackParamList, RootStackParamList } from "@navigation/RootNavigator";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useAppStore } from "@store/useAppStore";
import { useNotesStore } from "@store/useNotesStore";
import { createFolder, deleteFolder, getFoldersByParent, updateFolder } from "@services/foldersService";
import { deleteNote, getNotesByFolder, updateNote } from "@services/notesService";
import { addRecentOpen, getPinnedItems, savePinnedItems } from "@services/appMetaService";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Folder, Note } from "@models/types";
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
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ type: "folder" | "note"; id: string } | null>(null);

  const currentFolder = folderId ? folders[folderId] : undefined;

  useEffect(() => {
    (async () => {
      const [childrenFolders, folderNotes] = await Promise.all([
        getFoldersByParent(folderId ?? null),
        getNotesByFolder(folderId ?? null)
      ]);
      childrenFolders.forEach(upsertFolder);
      setNotes(folderNotes);
      const pinned = await getPinnedItems();
      setPinnedItems(pinned);
    })();
  }, [folderId, setNotes, setPinnedItems, upsertFolder]);

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
        </View>
      </View>

      <View style={[styles.pathCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumbContent}>
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
      </View>

      <View style={[styles.section, { borderColor: theme.colors.border }]}>
        <Text variant="subtitle">Subfolders</Text>
        <FlatList
          data={childFolders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => setSelectedFolder(item)}
              delayLongPress={260}
              style={styles.row}
              onPress={() =>
                (async () => {
                  const nextRecent = await addRecentOpen("folder", item.id);
                  setRecentItems(nextRecent);
                  navigation.push("FolderDetail", { folderId: item.id, trail: [...trailIds, item.id] });
                })()
              }
            >
              <FolderIcon color={item.color} fallbackColor={theme.colors.primary} size={18} />
              <Text>{item.name}</Text>
            </Pressable>
          )}
          contentContainerStyle={styles.sectionListContent}
          ListEmptyComponent={
            <Text muted style={styles.emptyText}>
              No subfolders.
            </Text>
          }
        />
      </View>

      <View style={[styles.section, { borderColor: theme.colors.border }]}>
        <Text variant="subtitle">Notes</Text>
        <FlatList
          data={folderNotes}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => setSelectedNote(item)}
              delayLongPress={260}
              style={styles.row}
              onPress={() =>
                (async () => {
                  const nextRecent = await addRecentOpen("note", item.id);
                  setRecentItems(nextRecent);
                  navigation.navigate("NoteEditor", { noteId: item.id });
                })()
              }
            >
              <View>
                <Text>{item.title}</Text>
                {!!firstLine(item.content) && (
                  <Text muted variant="caption" numberOfLines={1}>
                    {firstLine(item.content)}
                  </Text>
                )}
                <Text muted variant="caption">
                  {new Date(item.updatedAt).toLocaleString()}
                </Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={styles.sectionListContent}
          ListEmptyComponent={
            <Text muted style={styles.emptyText}>
              No notes yet.
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

      <DeleteConfirmModal
        visible={!!pendingDelete}
        itemLabel={pendingDelete?.type ?? "item"}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          if (pendingDelete.type === "folder") {
            await deleteFolder(pendingDelete.id);
            removeFolder(pendingDelete.id);
          } else {
            await deleteNote(pendingDelete.id);
            removeNote(pendingDelete.id);
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
    paddingHorizontal: 10
  },
  sectionListContent: {
    paddingBottom: 8,
    gap: 8
  },
  emptyText: {
    marginTop: 8
  }
});

export default FolderDetailScreen;

