import React from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { PrimaryButton } from "@components/PrimaryButton";
import { useTheme } from "@hooks/useTheme";
import { useAppStore } from "@store/useAppStore";
import type { ID } from "@models/types";

const FoldersScreen: React.FC = () => {
  const { theme } = useTheme();
  const folders = useAppStore((s) => s.folders);
  const selectedFolderId = useAppStore((s) => s.selectedFolderId);
  const selectFolder = useAppStore((s) => s.selectFolder);

  const currentFolderId: ID | null = selectedFolderId;
  const allFolders = Object.values(folders);
  const currentFolder = allFolders.find((f) => f.id === currentFolderId) ?? null;
  const children = allFolders.filter((f) => f.parentId === currentFolderId);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text variant="title">Folders</Text>
          <Text muted>
            {currentFolder ? currentFolder.name : "Root"}
          </Text>
        </View>
        <PrimaryButton label="+ Folder" onPress={() => {}} />
      </View>

      {currentFolder && (
        <Pressable
          onPress={() => selectFolder(currentFolder.parentId ?? null)}
          style={styles.backRow}
        >
          <Text>{"← Up one level"}</Text>
        </Pressable>
      )}

      <FlatList
        data={children}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => (
          <View
            style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }}
          />
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => selectFolder(item.id)}
            style={styles.folderRow}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text muted style={styles.emptyText}>
            No folders here yet.
          </Text>
        }
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
  backRow: {
    marginBottom: 8
  },
  folderRow: {
    paddingVertical: 12
  },
  emptyText: {
    marginTop: 24,
    textAlign: "center"
  }
});

export default FoldersScreen;

