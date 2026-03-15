import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Alert, Share, ScrollView, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import { getAllFolders } from "@services/foldersService";
import { getAllNotes } from "@services/notesService";
import { getAllTasks } from "@services/tasksService";
import { getAllFiles } from "@services/filesService";
import { getPinnedItems, getRecentItems } from "@services/appMetaService";
import { getTaskPreferences, saveTaskPreferences } from "@services/settingsService";

const SettingsScreen: React.FC = () => {
  const { theme, mode, setMode, accentColor, setAccentColor, accentPresets } = useTheme();
  const [prefs, setPrefs] = useState({
    showCompleted: true,
    highlightRecurring: true,
    startWeekOnMonday: false
  });
  const [customAccent, setCustomAccent] = useState(accentColor);

  useEffect(() => {
    (async () => {
      const current = await getTaskPreferences();
      setPrefs(current);
    })();
  }, []);

  useEffect(() => {
    setCustomAccent(accentColor);
  }, [accentColor]);

  const togglePref = useCallback(
    async (key: keyof typeof prefs) => {
      const next = { ...prefs, [key]: !prefs[key] };
      setPrefs(next);
      await saveTaskPreferences(next);
    },
    [prefs]
  );

  const exportBackup = useCallback(async () => {
    try {
      const [folders, notes, tasks, files, pinned, recent] = await Promise.all([
        getAllFolders(),
        getAllNotes(),
        getAllTasks(),
        getAllFiles(),
        getPinnedItems(),
        getRecentItems()
      ]);

      const payload = {
        exportedAt: Date.now(),
        app: "Life Organizer",
        version: "v3",
        data: { folders, notes, tasks, files, pinned, recent }
      };

      const backupPath = `${FileSystem.cacheDirectory}life-organizer-backup-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(backupPath, JSON.stringify(payload, null, 2), {
        encoding: FileSystem.EncodingType.UTF8
      });

      await Share.share({
        title: "Life Organizer Backup",
        message: "Life Organizer local backup",
        url: backupPath
      });
    } catch {
      Alert.alert("Export failed", "Could not export local data backup.");
    }
  }, []);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title">Settings</Text>
        <Text muted style={styles.subtitle}>App preferences and tools</Text>

        <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <View style={styles.sectionHeader}>
            <Ionicons name="color-palette-outline" size={16} color={theme.colors.textSecondary} />
            <Text variant="subtitle">Theme</Text>
          </View>

          <View style={styles.rowWrap}>
            {([
              { key: "light", label: "Light" },
              { key: "dark", label: "Dark" },
              { key: "system", label: "Auto" }
            ] as const).map((item) => {
              const active = mode === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setMode(item.key)}
                  style={[
                    styles.optionChip,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: active ? theme.colors.primary + "22" : theme.colors.surfaceElevated
                    }
                  ]}
                >
                  <Text style={{ color: active ? theme.colors.primary : theme.colors.textPrimary }}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <View style={styles.sectionHeader}>
            <Ionicons name="color-wand-outline" size={16} color={theme.colors.textSecondary} />
            <Text variant="subtitle">Secondary / Accent Color</Text>
          </View>

          <View style={styles.paletteRow}>
            {accentPresets.map((hex) => {
              const selected = accentColor.toUpperCase() === hex.toUpperCase();
              return (
                <Pressable
                  key={hex}
                  onPress={() => setAccentColor(hex)}
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: hex,
                      borderColor: selected ? theme.colors.textPrimary : theme.colors.border
                    }
                  ]}
                >
                  {selected && <Ionicons name="checkmark" size={14} color={theme.colors.onPrimary} />}
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.customColorRow, { borderColor: theme.colors.border }]}> 
            <TextInput
              value={customAccent}
              onChangeText={setCustomAccent}
              placeholder="#6366F1"
              autoCapitalize="characters"
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.customColorInput, { color: theme.colors.textPrimary }]}
            />
            <Pressable
              onPress={() => {
                const normalized = customAccent.startsWith("#")
                  ? customAccent.toUpperCase()
                  : `#${customAccent.toUpperCase()}`;
                if (!/^#([0-9A-F]{6})$/.test(normalized)) {
                  Alert.alert("Invalid color", "Use HEX format like #22C55E");
                  return;
                }
                setAccentColor(normalized);
              }}
              style={[styles.applyButton, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Apply</Text>
            </Pressable>
          </View>

          <Text muted variant="caption">
            Accent color is used by action buttons, highlights, progress bars and selected states.
          </Text>
        </View>

        <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <View style={styles.sectionHeader}>
            <Ionicons name="archive-outline" size={16} color={theme.colors.textSecondary} />
            <Text variant="subtitle">Backup</Text>
          </View>

          <Pressable onPress={exportBackup} style={[styles.actionRow, { borderColor: theme.colors.border }]}> 
            <Ionicons name="download-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={{ flex: 1 }}>Export local data backup</Text>
            <Ionicons name="chevron-forward" size={15} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-done-outline" size={16} color={theme.colors.textSecondary} />
            <Text variant="subtitle">Task preferences</Text>
          </View>

          <Pressable onPress={() => togglePref("showCompleted")} style={[styles.actionRow, { borderColor: theme.colors.border }]}> 
            <Text style={{ flex: 1 }}>Show completed tasks</Text>
            <Ionicons name={prefs.showCompleted ? "toggle" : "toggle-outline"} size={24} color={theme.colors.primary} />
          </Pressable>
          <Pressable onPress={() => togglePref("highlightRecurring")} style={[styles.actionRow, { borderColor: theme.colors.border }]}> 
            <Text style={{ flex: 1 }}>Highlight recurring tasks</Text>
            <Ionicons name={prefs.highlightRecurring ? "toggle" : "toggle-outline"} size={24} color={theme.colors.primary} />
          </Pressable>
          <Pressable onPress={() => togglePref("startWeekOnMonday")} style={[styles.actionRow, { borderColor: theme.colors.border }]}> 
            <Text style={{ flex: 1 }}>Calendar starts on Monday</Text>
            <Ionicons name={prefs.startWeekOnMonday ? "toggle" : "toggle-outline"} size={24} color={theme.colors.primary} />
          </Pressable>
        </View>

        <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.textSecondary} />
            <Text variant="subtitle">About & Help</Text>
          </View>
          <Text muted>Life Organizer V3</Text>
          <Text muted style={{ marginTop: 4 }}>Manage notes, folders, tasks, files and PDFs with a clean workflow.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 10
  },
  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  optionChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  actionRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8
  },
  paletteRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  customColorRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  customColorInput: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  applyButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  }
});

export default SettingsScreen;
