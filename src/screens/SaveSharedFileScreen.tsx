import React, { useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, Alert } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { useAppStore } from "@store/useAppStore";
import { getAllFolders } from "@services/foldersService";
import { importFileFromUri } from "@services/filesService";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme } from "@hooks/useTheme";

type SaveSharedRoute = RouteProp<RootStackParamList, "SaveSharedFile">;
type Nav = NativeStackNavigationProp<RootStackParamList, "SaveSharedFile">;

const SaveSharedFileScreen: React.FC = () => {
  const route = useRoute<SaveSharedRoute>();
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const foldersMap = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const all = await getAllFolders();
      setFolders(all);
    })();
  }, [setFolders]);

  const folders = useMemo(() => Object.values(foldersMap).sort((a, b) => a.name.localeCompare(b.name)), [foldersMap]);

  const handleSave = async () => {
    if (!route.params?.uri) return;
    setSaving(true);
    try {
      await importFileFromUri(route.params.uri, {
        fileName: route.params.name,
        mimeType: route.params.mimeType,
        parentFolderId: selectedFolderId
      });
      navigation.navigate("Tabs", {
        screen: "Folders",
        params: {
          screen: "FolderDetail",
          params: { folderId: selectedFolderId, trail: selectedFolderId ? [selectedFolderId] : [] }
        }
      });
    } catch (e) {
      Alert.alert("Could not save file", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Text variant="title">Save shared file</Text>
      <Text muted style={styles.sub}>Where do you want to save this file?</Text>

      <Pressable
        onPress={() => setSelectedFolderId(null)}
        style={[
          styles.row,
          { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          selectedFolderId === null && { backgroundColor: theme.colors.primary + "22" }
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
              selectedFolderId === item.id && { backgroundColor: theme.colors.primary + "22" }
            ]}
          >
            <Text numberOfLines={1}>{item.name}</Text>
          </Pressable>
        )}
      />

      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[styles.button, { backgroundColor: theme.colors.primary }, saving && { opacity: 0.6 }]}
      >
        <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>{saving ? "Saving..." : "Save file"}</Text>
      </Pressable>
    </Screen>
  );
};

const styles = StyleSheet.create({
  sub: {
    marginTop: 6,
    marginBottom: 12
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
  }
});

export default SaveSharedFileScreen;
