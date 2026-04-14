import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Alert, Share, ScrollView, TextInput, LayoutAnimation, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import ColorPicker from "react-native-wheel-color-picker";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import SyncPairingQrModal from "@components/SyncPairingQrModal";
import { useTheme } from "@hooks/useTheme";
import { getAllFolders } from "@services/foldersService";
import { getAllNotes } from "@services/notesService";
import { getAllTasks } from "@services/tasksService";
import { getAllFiles } from "@services/filesService";
import { getPinnedItems, getRecentItems } from "@services/appMetaService";
import { getTaskPreferences, saveTaskPreferences } from "@services/settingsService";
import { usePomodoroStore } from "@store/usePomodoroStore";

const PRESET_COLORS = [
  "#FFFFFF",
  "#6B7280",
  "#000000",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#22C55E",
  "#06B6D4",
  "#3B82F6",
  "#6366F1",
  "#A855F7",
  "#F472B6"
];

const SettingsScreen: React.FC = () => {
  const {
    theme,
    mode,
    setMode,
    primaryColor,
    setPrimaryColor,
    secondaryColor,
    setSecondaryColor
  } = useTheme();
  const [prefs, setPrefs] = useState({
    showCompleted: true,
    highlightRecurring: true,
    startWeekOnMonday: false
  });
  const [useAdvancedPicker, setUseAdvancedPicker] = useState(false);
  const [editing, setEditing] = useState<"primary" | "secondary">("primary");
  const [customHex, setCustomHex] = useState(primaryColor);
  const [openScanner, setOpenScanner] = useState(false);
  const pomodoroVisible = usePomodoroStore((state) => state.isVisible);
  const openPomodoro = usePomodoroStore((state) => state.openPomodoro);
  const closePomodoro = usePomodoroStore((state) => state.closePomodoro);

  useEffect(() => {
    (async () => {
      const current = await getTaskPreferences();
      setPrefs(current);
    })();
  }, []);

  const currentEditingColor = editing === "primary" ? primaryColor : secondaryColor;

  useEffect(() => {
    setCustomHex(currentEditingColor);
  }, [currentEditingColor]);

  const normalizePickerHex = useCallback((value: string, fallback: string) => {
    const normalized = value.startsWith("#") ? value.toUpperCase() : `#${value.toUpperCase()}`;
    return /^#([0-9A-F]{6})$/.test(normalized) ? normalized : fallback;
  }, []);

  const applyHexColor = useCallback((value: string, setter: (color: string) => void) => {
    const normalized = value.startsWith("#") ? value.toUpperCase() : `#${value.toUpperCase()}`;
    if (!/^#([0-9A-F]{6})$/.test(normalized)) {
      Alert.alert("Invalid color", "Use HEX format like #22C55E");
      return;
    }
    setter(normalized);
  }, []);

  const setEditingColor = useCallback(
    (value: string) => {
      if (editing === "primary") {
        setPrimaryColor(value);
      } else {
        setSecondaryColor(value);
      }
    },
    [editing, setPrimaryColor, setSecondaryColor]
  );

  const switchEditing = useCallback((target: "primary" | "secondary") => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditing(target);
  }, []);

  const toggleAdvanced = useCallback((next: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setUseAdvancedPicker(next);
  }, []);

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
              { key: "dark", label: "Dark" }
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
                      backgroundColor: active ? theme.colors.primaryAlpha20 : theme.colors.surfaceElevated
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
            <Text variant="subtitle">Theme colors</Text>
          </View>

          <View style={styles.rowWrap}>
            {([
              { key: "primary", label: "Primary" },
              { key: "secondary", label: "Secondary" }
            ] as const).map((item) => {
              const active = editing === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => switchEditing(item.key)}
                  style={[
                    styles.optionChip,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: active ? theme.colors.primaryAlpha20 : theme.colors.surfaceElevated
                    }
                  ]}
                >
                  <Text style={{ color: active ? theme.colors.primary : theme.colors.textPrimary }}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.previewRow}> 
            <View style={[styles.previewDot, { backgroundColor: primaryColor, borderColor: theme.colors.border }]} />
            <Text variant="caption" style={{ color: theme.colors.textSecondary }}>Primary {primaryColor}</Text>
            <View style={[styles.previewDot, { backgroundColor: secondaryColor, borderColor: theme.colors.border, marginLeft: 10 }]} />
            <Text variant="caption" style={{ color: theme.colors.textSecondary }}>Secondary {secondaryColor}</Text>
          </View>

          {!useAdvancedPicker && (
            <>
              <View style={styles.paletteRow}>
                {PRESET_COLORS.map((color) => {
                  const selected = currentEditingColor.toUpperCase() === color;
                  return (
                    <Pressable
                      key={`${editing}-${color}`}
                      onPress={() => setEditingColor(color)}
                      style={[
                        styles.colorSwatch,
                        {
                          backgroundColor: color,
                          borderColor: selected ? "#FFFFFF" : theme.colors.border,
                          borderWidth: selected ? 3 : 1,
                          shadowColor: "#000000",
                          shadowOpacity: selected ? 0.24 : 0,
                          shadowRadius: selected ? 4 : 0,
                          elevation: selected ? 3 : 0
                        }
                      ]}
                    >
                      {selected && <Ionicons name="checkmark" size={14} color={color === "#FFFFFF" ? "#000000" : "#FFFFFF"} />}
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => toggleAdvanced(true)}
                style={[styles.actionRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
              >
                <Ionicons name="color-palette-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={{ flex: 1 }}>Mais cores</Text>
                <Ionicons name="chevron-forward" size={15} color={theme.colors.textSecondary} />
              </Pressable>
            </>
          )}

          {useAdvancedPicker && (
            <>
              <View style={[styles.wheelWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
                <ColorPicker
                  color={currentEditingColor}
                  swatches={false}
                  noSnap
                  row={false}
                  sliderSize={22}
                  thumbSize={28}
                  gapSize={10}
                  onColorChange={(value) => setEditingColor(normalizePickerHex(value, currentEditingColor))}
                  onColorChangeComplete={(value) => setEditingColor(normalizePickerHex(value, currentEditingColor))}
                />
              </View>

              <View style={[styles.customColorRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}> 
                <TextInput
                  value={customHex}
                  onChangeText={setCustomHex}
                  placeholder="#EC4899"
                  autoCapitalize="characters"
                  placeholderTextColor={theme.colors.textSecondary}
                  style={[styles.customColorInput, { color: theme.colors.textPrimary }]}
                />
                <Pressable
                  onPress={() => applyHexColor(customHex, setEditingColor)}
                  style={[styles.applyButton, { backgroundColor: theme.colors.secondary }]}
                >
                  <Text style={{ color: theme.colors.onSecondary, fontWeight: "600" }}>Apply</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => toggleAdvanced(false)}
                style={[styles.actionRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
              >
                <Text style={{ flex: 1 }}>Voltar para paleta</Text>
                <Ionicons name="chevron-back" size={15} color={theme.colors.textSecondary} />
              </Pressable>
            </>
          )}

          <Text muted variant="caption">
            Choose quickly from presets or switch to the HSV wheel for advanced color control.
          </Text>
        </View>

        <View style={[styles.section, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <View style={styles.sectionHeader}>
            <Ionicons name="qr-code-outline" size={16} color={theme.colors.textSecondary} />
            <Text variant="subtitle">Web pairing</Text>
          </View>

          <Pressable onPress={() => setOpenScanner(true)} style={[styles.actionRow, { borderColor: theme.colors.border }]}> 
            <Ionicons name="qr-code-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={{ flex: 1 }}>Show pairing QR for Web</Text>
            <Ionicons name="chevron-forward" size={15} color={theme.colors.textSecondary} />
          </Pressable>
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
            <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
            <Text variant="subtitle">Pomodoro</Text>
          </View>

          <View style={[styles.actionRow, { borderColor: theme.colors.border, marginBottom: 0 }]}> 
            <Text style={{ flex: 1 }}>Enable Pomodoro</Text>
            <Switch
              value={pomodoroVisible}
              onValueChange={(next) => (next ? openPomodoro() : closePomodoro())}
              thumbColor={pomodoroVisible ? theme.colors.onPrimary : undefined}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
            />
          </View>
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

      <SyncPairingQrModal visible={openScanner} onClose={() => setOpenScanner(false)} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 200
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
  wheelWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 8,
    minHeight: 260,
    marginBottom: 10
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10
  },
  previewDot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1
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
