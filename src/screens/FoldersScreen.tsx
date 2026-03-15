import React, { useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { PrimaryButton } from "@components/PrimaryButton";
import { FolderIcon } from "@components/FolderIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { useTheme } from "@hooks/useTheme";
import { useAppStore } from "@store/useAppStore";
import { createFolder, deleteFolder, getFoldersByParent, updateFolder } from "@services/foldersService";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { FoldersStackParamList } from "@navigation/RootNavigator";
import { FolderNameModal } from "@components/FolderNameModal";
import type { Folder } from "@models/types";

type Nav = NativeStackNavigationProp<FoldersStackParamList, "FoldersRoot">;

const FoldersScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const folders = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);
  const upsertFolder = useAppStore((s) => s.upsertFolder);
  const removeFolder = useAppStore((s) => s.removeFolder);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<Folder | null>(null);

  useEffect(() => {
    (async () => {
      const rootFolders = await getFoldersByParent(null);
      setFolders(rootFolders);
    })();
  }, [setFolders]);

  const rootFolders = Object.values(folders)
    .filter((f) => f.parentId == null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text variant="title">Folders</Text>
          <Text muted>Root folders</Text>
        </View>
        <PrimaryButton label="+ Folder" onPress={() => setShowCreateModal(true)} />
      </View>

      <FlatList
        contentContainerStyle={styles.listContent}
        data={rootFolders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          return (
            <Pressable
              onLongPress={() => setSelectedFolder(item)}
              delayLongPress={260}
              onPress={() =>
                navigation.navigate("FolderDetail", { folderId: item.id, trail: [item.id] })
              }
              style={[styles.folderRow, { backgroundColor: theme.colors.card }]}
            >
              <FolderIcon color={item.color} fallbackColor={theme.colors.primary} size={18} />
              <View style={{ flex: 1 }}>
                <Text>{item.name}</Text>
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
        visible={!!selectedFolder}
        title={selectedFolder?.name}
        onClose={() => setSelectedFolder(null)}
        actions={[
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
        onCancel={() => setShowCreateModal(false)}
        onConfirm={async (name, color) => {
          const folder = await createFolder(name, null, color);
          upsertFolder(folder);
          setShowCreateModal(false);
        }}
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

      <DeleteConfirmModal
        visible={!!pendingDeleteFolder}
        itemLabel="folder"
        onCancel={() => setPendingDeleteFolder(null)}
        onConfirm={async () => {
          if (!pendingDeleteFolder) return;
          await deleteFolder(pendingDeleteFolder.id);
          removeFolder(pendingDeleteFolder.id);
          setPendingDeleteFolder(null);
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
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12
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

