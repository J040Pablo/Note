import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, Alert } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { useAppStore } from "@store/useAppStore";
import { FolderNameModal } from "@components/FolderNameModal";
import { createFolder, getAllFolders } from "@services/foldersService";
import { importFileFromUri } from "@services/filesService";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "@hooks/useTheme";
import { useFilesStore } from "@store/useFilesStore";
import { useFeedback } from "@components/FeedbackProvider";
import type { ID } from "@models/types";

type SaveSharedRoute = RouteProp<RootStackParamList, "SaveSharedFile">;
type Nav = NativeStackNavigationProp<RootStackParamList, "SaveSharedFile">;

const COMMON_ALLOWED_EXTENSIONS = new Set([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "doc",
  "docx",
  "txt",
  "csv",
  "xlsx",
  "ppt",
  "pptx",
  "zip"
]);

const getFileExtension = (name?: string): string => {
  if (!name) return "";
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const isSupportedSharedFile = (mimeType?: string | null, fileName?: string): boolean => {
  const extension = getFileExtension(fileName);
  if (COMMON_ALLOWED_EXTENSIONS.has(extension)) return true;
  if (!mimeType) return false;
  return (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType.startsWith("application/")
  );
};

const SaveSharedFileScreen: React.FC = () => {
  const route = useRoute<SaveSharedRoute>();
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { showToast } = useFeedback();
  const foldersMap = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);
  const upsertFolder = useAppStore((s) => s.upsertFolder);
  const upsertFile = useFilesStore((s) => s.upsertFile);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    (async () => {
      const all = await getAllFolders();
      setFolders(all);
    })();
  }, [setFolders]);

  const folders = useMemo(() => Object.values(foldersMap).sort((a, b) => a.name.localeCompare(b.name)), [foldersMap]);

  const handleOpenSavedFile = (targetFolderId: ID | null) => {
    navigation.navigate("Tabs", {
      screen: "Folders",
      params: {
        screen: "FolderDetail",
        params: { folderId: targetFolderId, trail: targetFolderId ? [targetFolderId] : [] }
      }
    });
  };

  const handleSave = async () => {
    const sharedUri = route.params?.uri;
    const sharedName = route.params?.name;
    const sharedMimeType = route.params?.mimeType;
    if (!sharedUri?.trim()) {
      showToast("Arquivo compartilhado invalido", "error");
      return;
    }
    if (!isSupportedSharedFile(sharedMimeType, sharedName)) {
      showToast("Tipo de arquivo nao suportado", "error");
      return;
    }

    setSaving(true);
    try {
      const saved = await importFileFromUri(sharedUri, {
        fileName: sharedName,
        mimeType: sharedMimeType,
        parentFolderId: selectedFolderId ?? null
      });
      upsertFile(saved);
      showToast("Arquivo salvo com sucesso");
      handleOpenSavedFile(selectedFolderId ?? null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message.toLowerCase() : "";
      if (message.includes("permission") || message.includes("denied")) {
        Alert.alert("Permissao negada", "Nao foi possivel acessar o arquivo compartilhado.");
      } else if (message.includes("copy") || message.includes("not found") || message.includes("invalid")) {
        Alert.alert("Arquivo invalido", "O arquivo compartilhado nao pode ser salvo.");
      } else {
        Alert.alert("Erro ao salvar", "Nao foi possivel salvar o arquivo. Tente novamente.");
      }
      showToast("Falha ao salvar arquivo", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Text variant="title">Save shared file</Text>
      <Text muted style={styles.sub}>Where do you want to save this file?</Text>
      <View style={[styles.metaBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
        <Text numberOfLines={1}>Name: {route.params?.name || "shared-file"}</Text>
        <Text muted numberOfLines={1}>Type: {route.params?.mimeType || "unknown"}</Text>
      </View>

      <Pressable
        onPress={() => setSelectedFolderId(null)}
        style={[
          styles.row,
          { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          selectedFolderId === null && { backgroundColor: theme.colors.primaryAlpha20 }
        ]}
      >
        <Text>Home (root)</Text>
      </Pressable>

      <FlatList
        data={folders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedFolderId(item.id)}
            style={[
              styles.row,
              { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
              selectedFolderId === item.id && { backgroundColor: theme.colors.primaryAlpha20 }
            ]}
          >
            <Text numberOfLines={1}>{item.name}</Text>
          </Pressable>
        )}
      />
      <Pressable
        onPress={() => setShowCreateFolderModal(true)}
        style={[styles.newFolderButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
      >
        <Text>Create new folder</Text>
      </Pressable>

      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[styles.button, { backgroundColor: theme.colors.primary }, saving && { opacity: 0.6 }]}
      >
        <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>{saving ? "Saving..." : "Save file"}</Text>
      </Pressable>

      <FolderNameModal
        visible={showCreateFolderModal}
        title="New folder"
        confirmLabel="Create"
        submitting={creatingFolder}
        onCancel={() => {
          if (creatingFolder) return;
          setShowCreateFolderModal(false);
        }}
        onConfirm={async (payload) => {
          if (creatingFolder) return;
          setCreatingFolder(true);
          try {
            const created = await createFolder(
              payload.name,
              null,
              payload.color,
              payload.description,
              payload.photoPath,
              payload.bannerPath
            );
            upsertFolder(created);
            setSelectedFolderId(created.id);
            setShowCreateFolderModal(false);
            showToast("Pasta criada");
          } catch (error) {
            showToast("Erro ao criar pasta", "error");
          } finally {
            setCreatingFolder(false);
          }
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  sub: {
    marginTop: 6,
    marginBottom: 12
  },
  metaBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 2
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth
  },
  button: {
    marginTop: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12
  },
  newFolderButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    marginTop: 4
  }
});

export default SaveSharedFileScreen;
