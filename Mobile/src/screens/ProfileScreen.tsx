import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Modal,
  Animated,
  Easing,
  TextInput,
  Alert,
  ActivityIndicator
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import { pickAndStoreImage } from "@utils/mediaPicker";
import {
  buildSectionItems,
  createEmptySection,
  getProfileState,
  getProfileSelectableItems,
  saveProfileState,
  type ProfileSection,
  type ProfileSectionItem,
  type ProfileSelectableItem,
  type ProfileSectionType,
  type ProfileState
} from "@services/profileService";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const subtractDays = (date: Date, days: number): Date => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - days);
  return copy;
};

const toDateKey = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const cloneProfileState = (state: ProfileState): ProfileState => ({
  ...state,
  user: { ...state.user },
  sections: state.sections.map((section) => ({ ...section, itemIds: [...section.itemIds] })),
  contributions: { ...state.contributions },
  meta: { ...state.meta }
});

interface ContributionDay {
  key: string;
  level: number;
  dayOfWeek: number;
  month: number;
}

type PickerFilter = "all" | "folder" | "files" | "notes";

const buildContributionColumns = (contributions: Record<string, number>, weeks = 17): ContributionDay[][] => {
  const totalDays = weeks * 7;
  const today = new Date();
  const start = subtractDays(today, totalDays - 1);
  const allDays: ContributionDay[] = [];

  for (let i = 0; i < totalDays; i += 1) {
    const current = subtractDays(start, -i);
    const key = toDateKey(current);
    const value = Math.max(0, Math.min(4, Math.round(contributions[key] ?? 0)));
    allDays.push({
      key,
      level: value,
      dayOfWeek: current.getDay(),
      month: current.getMonth()
    });
  }

  const columns: ContributionDay[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    columns.push(allDays.slice(i, i + 7));
  }

  return columns;
};

const ProfileScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [draft, setDraft] = useState<ProfileState | null>(null);
  const [sectionItems, setSectionItems] = useState<Record<string, ProfileSectionItem[]>>({});
  const [itemManagerVisible, setItemManagerVisible] = useState(false);
  const [managingSectionId, setManagingSectionId] = useState<string | null>(null);
  const [pickerFilter, setPickerFilter] = useState<PickerFilter>("all");
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);
  const [availableItems, setAvailableItems] = useState<ProfileSelectableItem[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);

  const menuAnim = useRef(new Animated.Value(0)).current;

  const hydrateItems = useCallback(async (sections: ProfileSection[]) => {
    const entries = await Promise.all(
      sections.map(async (section) => {
        const items = await buildSectionItems(section, 10);
        return [section.id, items] as const;
      })
    );

    const mapped: Record<string, ProfileSectionItem[]> = {};
    entries.forEach(([id, items]) => {
      mapped[id] = items;
    });
    setSectionItems(mapped);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const state = await getProfileState();
    setProfile(state);
    await hydrateItems(state.sections);
    setLoading(false);
  }, [hydrateItems]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  useEffect(() => {
    if (menuVisible) {
      Animated.timing(menuAnim, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start();
      return;
    }

    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [menuAnim, menuVisible]);

  const openEdit = useCallback(() => {
    if (!profile) return;
    setDraft(cloneProfileState(profile));
    setEditVisible(true);
  }, [profile]);

  const closeEdit = useCallback(() => {
    setEditVisible(false);
    setDraft(null);
  }, []);

  const onSaveDraft = useCallback(async () => {
    if (!draft) return;

    const safeName = draft.user.name.trim();
    const safeUsername = draft.user.username.trim().replace(/^@+/, "");
    if (!safeName || !safeUsername) {
      Alert.alert("Perfil incompleto", "Preencha nome e username para salvar.");
      return;
    }

    setSaving(true);
    const nextState: ProfileState = {
      ...draft,
      user: {
        ...draft.user,
        name: safeName,
        username: safeUsername
      }
    };
    const saved = await saveProfileState(nextState);
    setProfile(saved);
    await hydrateItems(saved.sections);
    setSaving(false);
    closeEdit();
  }, [closeEdit, draft, hydrateItems]);

  const onPickImage = useCallback(
    async (target: "avatar" | "banner") => {
      if (!draft) return;
      const picked = await pickAndStoreImage(target);
      if (!picked) return;

      setDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          user: {
            ...prev.user,
            [target]: picked
          }
        };
      });
    },
    [draft]
  );

  const moveSection = useCallback((index: number, direction: -1 | 1) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.sections.length) return prev;

      const sections = [...prev.sections];
      const [item] = sections.splice(index, 1);
      sections.splice(nextIndex, 0, item);
      return { ...prev, sections };
    });
  }, []);

  const updateSection = useCallback(
    (sectionId: string, patch: Partial<ProfileSection>) => {
      setDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sections: prev.sections.map((section) =>
            section.id === sectionId
              ? {
                  ...section,
                  ...patch
                }
              : section
          )
        };
      });
    },
    []
  );

  const removeSection = useCallback((sectionId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.sections.length <= 1) return prev;
      return {
        ...prev,
        sections: prev.sections.filter((section) => section.id !== sectionId)
      };
    });
  }, []);

  const addSection = useCallback((type: ProfileSectionType) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sections: [...prev.sections, createEmptySection(type)]
      };
    });
  }, []);

  const openMenu = useCallback(() => setMenuVisible(true), []);
  const closeMenu = useCallback(() => setMenuVisible(false), []);

  const loadSelectableItems = useCallback(async () => {
    setPickerLoading(true);
    const items = await getProfileSelectableItems();
    setAvailableItems(items);
    setPickerLoading(false);
  }, []);

  const openItemManager = useCallback(
    async (sectionId: string) => {
      if (!draft) return;
      const section = draft.sections.find((item) => item.id === sectionId);
      if (!section) return;

      setManagingSectionId(sectionId);
      setSelectedRefs(section.itemIds ?? []);
      setPickerFilter("all");
      setPickerQuery("");
      setItemManagerVisible(true);
      await loadSelectableItems();
    },
    [draft, loadSelectableItems]
  );

  const closeItemManager = useCallback(() => {
    setItemManagerVisible(false);
    setManagingSectionId(null);
    setPickerQuery("");
    setSelectedRefs([]);
  }, []);

  const toggleRefSelection = useCallback((refId: string) => {
    setSelectedRefs((prev) => (prev.includes(refId) ? prev.filter((id) => id !== refId) : [...prev, refId]));
  }, []);

  const moveSelectedRef = useCallback((refId: string, direction: -1 | 1) => {
    setSelectedRefs((prev) => {
      const index = prev.indexOf(refId);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }, []);

  const confirmManagedItems = useCallback(() => {
    if (!managingSectionId) return;
    updateSection(managingSectionId, { itemIds: selectedRefs });
    closeItemManager();
  }, [closeItemManager, managingSectionId, selectedRefs, updateSection]);

  const goSettings = useCallback(() => {
    closeMenu();
    const parent = navigation.getParent?.();
    if (parent?.navigate) {
      parent.navigate("Settings");
    }
  }, [closeMenu, navigation]);

  const heatmapColumns = useMemo(() => {
    if (!profile) return [] as ContributionDay[][];
    return buildContributionColumns(profile.contributions, 17);
  }, [profile]);

  const monthAnchors = useMemo(() => {
    const anchors: Array<{ index: number; label: string }> = [];
    heatmapColumns.forEach((column, idx) => {
      const first = column[0];
      if (!first) return;
      const previous = heatmapColumns[idx - 1]?.[0];
      if (!previous || previous.month !== first.month) {
        anchors.push({ index: idx, label: MONTH_LABELS[first.month] });
      }
    });
    return anchors;
  }, [heatmapColumns]);

  const contributionColor = useCallback(
    (level: number): string => {
      if (level <= 0) return theme.colors.surfaceElevated;
      if (level === 1) return theme.colors.primaryAlpha20;
      if (level === 2) return theme.colors.primaryLight;
      if (level === 3) return theme.colors.primary;
      return theme.colors.secondary;
    },
    [theme.colors.primary, theme.colors.primaryAlpha20, theme.colors.primaryLight, theme.colors.secondary, theme.colors.surfaceElevated]
  );

  if (loading || !profile) {
    return (
      <Screen>
        <View style={[styles.centered, { backgroundColor: theme.colors.background }]}> 
          <ActivityIndicator color={theme.colors.primary} />
          <Text muted style={{ marginTop: 8 }}>Carregando perfil...</Text>
        </View>
      </Screen>
    );
  }

  const filteredAvailableItems = availableItems.filter((item) => {
    if (pickerFilter !== "all" && item.sourceType !== pickerFilter) return false;
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return true;
    return (`${item.title} ${item.subtitle ?? ""}`).toLowerCase().includes(q);
  });

  const selectedItemObjects = selectedRefs
    .map((refId) => availableItems.find((item) => item.refId === refId))
    .filter((item): item is ProfileSelectableItem => !!item);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}> 
        <View style={[styles.profileCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <View style={styles.headerOverlay}> 
            <Pressable
              onPress={() => navigation.navigate("Home")}
              style={styles.bannerIconButton}
            >
              <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
            </Pressable>

            <View style={styles.headerActions}> 
              <Pressable
                onPress={openEdit}
                style={styles.bannerIconButton}
              >
                <Ionicons name="pencil" size={17} color="#FFFFFF" />
              </Pressable>
              <Pressable
                onPress={menuVisible ? closeMenu : openMenu}
                style={styles.bannerIconButton}
              >
                <Ionicons name={menuVisible ? "close" : "menu"} size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={openEdit}
            style={[styles.banner, { backgroundColor: theme.colors.surfaceElevated }]}
          >
            {profile.user.banner ? (
              <Image source={{ uri: profile.user.banner }} style={styles.bannerImage} resizeMode="cover" />
            ) : (
              <View style={[styles.bannerFallback, { backgroundColor: theme.colors.surfaceElevated }]} />
            )}
          </Pressable>

          <Pressable onPress={openEdit} style={[styles.avatarWrap, { borderColor: theme.colors.card, backgroundColor: theme.colors.surface }]}> 
            {profile.user.avatar ? (
              <Image source={{ uri: profile.user.avatar }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person" size={34} color={theme.colors.textSecondary} />
            )}
          </Pressable>

          <View style={styles.userInfo}> 
            <Text variant="title">{profile.user.name || "Seu Nome"}</Text>
            <Text muted>@{profile.user.username || "username"}</Text>
            <Text style={styles.bio}>{profile.user.bio}</Text>
          </View>
        </View>

        {profile.sections.map((section) => {
          const items = sectionItems[section.id] ?? [];

          return (
            <View
              key={section.id}
              style={[styles.sectionCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            >
              <View style={styles.sectionHeader}> 
                <Text variant="subtitle">{section.title}</Text>
                <Text muted variant="caption">
                  {section.type === "folder" ? "Pastas" : section.type === "files" ? "Arquivos" : "Anotações"}
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionItemsRow}>
                {items.length === 0 ? (
                  <View style={[styles.emptyItem, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}> 
                    <Ionicons name="sparkles-outline" size={16} color={theme.colors.textSecondary} />
                    <Text muted style={{ marginTop: 4 }}>Sem itens ainda</Text>
                  </View>
                ) : (
                  items.map((item) => (
                    <View
                      key={item.id}
                      style={[styles.itemCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                    >
                      {(item.sourceType ?? section.type) === "folder" ? (
                        <View style={{ flex: 1 }}>
                          {item.bannerUri || item.imageUri ? (
                            <Image source={{ uri: item.bannerUri || item.imageUri }} style={styles.itemImage} />
                          ) : (
                            <View style={[styles.itemImagePlaceholder, { backgroundColor: theme.colors.background }]}> 
                              <Ionicons name="folder-outline" size={16} color={theme.colors.textSecondary} />
                            </View>
                          )}
                          <View style={styles.itemMainRow}>
                            <View style={[styles.itemFolderAvatarWrap, { backgroundColor: theme.colors.card }]}> 
                              {item.avatarUri || item.imageUri ? (
                                <Image source={{ uri: item.avatarUri || item.imageUri }} style={styles.itemFolderAvatarImage} />
                              ) : (
                                <Ionicons name="folder-outline" size={15} color={theme.colors.textSecondary} />
                              )}
                            </View>
                            <View style={styles.itemTextCol}>
                              <Text numberOfLines={1} style={styles.itemTitle}>{item.title}</Text>
                              {!!item.subtitle && (
                                <Text numberOfLines={2} muted variant="caption" style={styles.itemSubtitle}>{item.subtitle}</Text>
                              )}
                            </View>
                          </View>
                        </View>
                      ) : item.imageUri ? (
                        <Image source={{ uri: item.imageUri }} style={styles.itemImage} />
                      ) : (
                        <View style={[styles.itemImagePlaceholder, { backgroundColor: theme.colors.background }]}> 
                          <Ionicons
                            name={(item.sourceType ?? section.type) === "files" ? "document-outline" : "document-text-outline"}
                            size={16}
                            color={theme.colors.textSecondary}
                          />
                        </View>
                      )}
                      {(item.sourceType ?? section.type) !== "folder" && (
                        <>
                          <Text numberOfLines={1} style={styles.itemTitle}>{item.title}</Text>
                          {!!item.subtitle && (
                            <Text numberOfLines={2} muted variant="caption" style={styles.itemSubtitle}>{item.subtitle}</Text>
                          )}
                        </>
                      )}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          );
        })}

        <View style={[styles.sectionCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <View style={styles.sectionHeader}> 
            <Text variant="subtitle">Work Hard</Text>
            <Text muted variant="caption">Dias com tasks concluídas</Text>
          </View>

          <View style={styles.monthsRow}> 
            {monthAnchors.map((anchor) => (
              <Text key={`${anchor.index}-${anchor.label}`} variant="caption" muted style={{ width: 24 }}>
                {anchor.label}
              </Text>
            ))}
          </View>

          <View style={styles.heatmapWrap}> 
            <View style={styles.weekdayCol}> 
              {WEEKDAY_LABELS.filter((_, idx) => idx % 2 === 0).map((label) => (
                <Text key={label} variant="caption" muted style={styles.weekdayText}>{label}</Text>
              ))}
            </View>
            <View style={styles.columnsRow}> 
              {heatmapColumns.map((column, idx) => (
                <View key={`column-${idx}`} style={styles.column}> 
                  {column.map((day) => (
                    <View
                      key={day.key}
                      style={[
                        styles.dayCell,
                        {
                          backgroundColor: contributionColor(day.level),
                          borderColor: theme.colors.border
                        }
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal visible={menuVisible} transparent animationType="none" onRequestClose={closeMenu}>
        <Pressable style={styles.menuBackdrop} onPress={closeMenu}> 
          <Animated.View
            style={[
              styles.menuPanel,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                transform: [
                  {
                    translateX: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [260, 0]
                    })
                  }
                ],
                opacity: menuAnim
              }
            ]}
          >
            <Text variant="subtitle" style={{ marginBottom: 12 }}>Menu</Text>

            <Pressable
              onPress={goSettings}
              style={[styles.menuItem, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
            >
              <Ionicons name="settings-outline" size={16} color={theme.colors.textPrimary} />
              <Text style={{ flex: 1 }}>Configurações</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
            </Pressable>

            <View style={[styles.menuItem, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
              <Ionicons name="cloud-download-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={{ flex: 1, color: theme.colors.textSecondary }}>Backup (em breve)</Text>
              <Text variant="caption" muted>coming soon</Text>
            </View>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={editVisible} animationType="slide" onRequestClose={closeEdit}>
        <Screen>
          <View style={styles.editHeader}> 
            <Pressable
              onPress={closeEdit}
              style={[styles.iconButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
            >
              <Ionicons name="close" size={18} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="subtitle">Editar perfil</Text>
            <Pressable
              onPress={onSaveDraft}
              disabled={saving}
              style={[
                styles.saveButton,
                {
                  backgroundColor: saving ? theme.colors.surfaceElevated : theme.colors.primary,
                  borderColor: theme.colors.border
                }
              ]}
            >
              <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>{saving ? "Salvando" : "Salvar"}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.editContent}> 
            {draft && (
              <>
                <View style={[styles.editCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
                  <Text variant="subtitle" style={{ marginBottom: 10 }}>Mídia do perfil</Text>

                  <View style={styles.rowGap}> 
                    <Pressable
                      onPress={() => onPickImage("banner")}
                      style={[styles.pickButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                    >
                      <Ionicons name="image-outline" size={16} color={theme.colors.textPrimary} />
                      <Text>Alterar banner</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onPickImage("avatar")}
                      style={[styles.pickButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                    >
                      <Ionicons name="person-circle-outline" size={16} color={theme.colors.textPrimary} />
                      <Text>Alterar avatar</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.editCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
                  <Text variant="subtitle" style={{ marginBottom: 10 }}>Dados do usuário</Text>

                  <Text muted variant="caption">Nome</Text>
                  <TextInput
                    value={draft.user.name}
                    onChangeText={(value) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              user: {
                                ...prev.user,
                                name: value
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="João"
                    placeholderTextColor={theme.colors.textSecondary}
                    style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated }]}
                  />

                  <Text muted variant="caption" style={styles.inputLabel}>Username</Text>
                  <TextInput
                    value={draft.user.username}
                    onChangeText={(value) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              user: {
                                ...prev.user,
                                username: value.replace(/^@+/, "")
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="username"
                    autoCapitalize="none"
                    placeholderTextColor={theme.colors.textSecondary}
                    style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated }]}
                  />

                  <Text muted variant="caption" style={styles.inputLabel}>Bio</Text>
                  <TextInput
                    value={draft.user.bio}
                    onChangeText={(value) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              user: {
                                ...prev.user,
                                bio: value
                              }
                            }
                          : prev
                      )
                    }
                    placeholder="Sobre você..."
                    multiline
                    textAlignVertical="top"
                    placeholderTextColor={theme.colors.textSecondary}
                    style={[
                      styles.input,
                      styles.bioInput,
                      { borderColor: theme.colors.border, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated }
                    ]}
                  />
                </View>

                <View style={[styles.editCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
                  <Text variant="subtitle" style={{ marginBottom: 10 }}>Seções do perfil</Text>

                  <View style={styles.addRow}> 
                    <Pressable
                      onPress={() => addSection("folder")}
                      style={[styles.smallAction, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                    >
                      <Text variant="caption">+ Pasta</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => addSection("files")}
                      style={[styles.smallAction, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                    >
                      <Text variant="caption">+ Arquivos</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => addSection("notes")}
                      style={[styles.smallAction, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                    >
                      <Text variant="caption">+ Notas</Text>
                    </Pressable>
                  </View>

                  {draft.sections.map((section, index) => (
                    <View
                      key={section.id}
                      style={[styles.sectionEditor, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
                    >
                      <View style={styles.sectionEditorHeader}> 
                        <Text variant="caption" muted>Bloco {index + 1}</Text>
                        <View style={styles.sectionEditorActions}> 
                          <Pressable onPress={() => moveSection(index, -1)} style={styles.sortIconButton}>
                            <Ionicons name="chevron-up" size={16} color={theme.colors.textPrimary} />
                          </Pressable>
                          <Pressable onPress={() => moveSection(index, 1)} style={styles.sortIconButton}>
                            <Ionicons name="chevron-down" size={16} color={theme.colors.textPrimary} />
                          </Pressable>
                          <Pressable onPress={() => removeSection(section.id)} style={styles.sortIconButton}>
                            <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                          </Pressable>
                        </View>
                      </View>

                      <TextInput
                        value={section.title}
                        onChangeText={(value) => updateSection(section.id, { title: value })}
                        placeholder="Título da seção"
                        placeholderTextColor={theme.colors.textSecondary}
                        style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.textPrimary, backgroundColor: theme.colors.card }]}
                      />

                      <View style={styles.typeRow}> 
                        {(["folder", "files", "notes"] as const).map((type) => {
                          const active = section.type === type;
                          return (
                            <Pressable
                              key={`${section.id}-${type}`}
                              onPress={() => updateSection(section.id, { type })}
                              style={[
                                styles.typeChip,
                                {
                                  borderColor: theme.colors.border,
                                  backgroundColor: active ? theme.colors.primaryAlpha20 : theme.colors.card
                                }
                              ]}
                            >
                              <Text variant="caption" style={{ color: active ? theme.colors.primary : theme.colors.textPrimary }}>
                                {type === "folder" ? "Pasta" : type === "files" ? "Arquivo" : "Nota"}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <Pressable
                        onPress={() => openItemManager(section.id)}
                        style={[styles.manageItemsButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                      >
                        <Ionicons name="albums-outline" size={15} color={theme.colors.textPrimary} />
                        <Text variant="caption" style={{ flex: 1 }}>Gerenciar itens</Text>
                        <Text variant="caption" muted>{section.itemIds.length} vinculados</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </Screen>
      </Modal>

      <Modal visible={itemManagerVisible} animationType="slide" onRequestClose={closeItemManager}>
        <Screen>
          <View style={styles.editHeader}> 
            <Pressable
              onPress={closeItemManager}
              style={[styles.iconButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
            >
              <Ionicons name="close" size={18} color={theme.colors.textPrimary} />
            </Pressable>
            <Text variant="subtitle">Gerenciar itens</Text>
            <Pressable
              onPress={confirmManagedItems}
              style={[styles.saveButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.primary }]}
            >
              <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Adicionar à seção</Text>
            </Pressable>
          </View>

          <View style={styles.filterRow}> 
            {(["all", "folder", "files", "notes"] as const).map((filter) => {
              const active = pickerFilter === filter;
              return (
                <Pressable
                  key={filter}
                  onPress={() => setPickerFilter(filter)}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: active ? theme.colors.primaryAlpha20 : theme.colors.surfaceElevated
                    }
                  ]}
                >
                  <Text variant="caption" style={{ color: active ? theme.colors.primary : theme.colors.textPrimary }}>
                    {filter === "all" ? "Todos" : filter === "folder" ? "Pastas" : filter === "files" ? "Arquivos" : "Anotações"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={pickerQuery}
            onChangeText={setPickerQuery}
            placeholder="Buscar por nome"
            placeholderTextColor={theme.colors.textSecondary}
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated, marginBottom: 10 }]}
          />

          <Pressable
            onPress={() => {
              const allIds = filteredAvailableItems.map((item) => item.refId);
              setSelectedRefs((prev) => Array.from(new Set([...prev, ...allIds])));
            }}
            style={[styles.selectAllButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
          >
            <Ionicons name="checkmark-done-outline" size={15} color={theme.colors.textPrimary} />
            <Text variant="caption">Selecionar tudo ({filteredAvailableItems.length})</Text>
          </Pressable>

          {selectedItemObjects.length > 0 && (
            <View style={[styles.selectedWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
              <Text variant="caption" muted style={{ marginBottom: 8 }}>Ordem da seção</Text>
              {selectedItemObjects.map((item) => (
                <View key={`selected-${item.refId}`} style={styles.selectedRow}> 
                  <Text numberOfLines={1} style={{ flex: 1 }}>{item.title}</Text>
                  <Pressable onPress={() => moveSelectedRef(item.refId, -1)} style={styles.sortIconButton}>
                    <Ionicons name="chevron-up" size={16} color={theme.colors.textPrimary} />
                  </Pressable>
                  <Pressable onPress={() => moveSelectedRef(item.refId, 1)} style={styles.sortIconButton}>
                    <Ionicons name="chevron-down" size={16} color={theme.colors.textPrimary} />
                  </Pressable>
                  <Pressable onPress={() => toggleRefSelection(item.refId)} style={styles.sortIconButton}>
                    <Ionicons name="close" size={16} color={theme.colors.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <ScrollView contentContainerStyle={styles.managerListContent}> 
            {pickerLoading ? (
              <View style={styles.centered}> 
                <ActivityIndicator color={theme.colors.primary} />
                <Text muted style={{ marginTop: 8 }}>Carregando itens...</Text>
              </View>
            ) : (
              filteredAvailableItems.map((item) => {
                const selected = selectedRefs.includes(item.refId);
                return (
                  <Pressable
                    key={item.refId}
                    onPress={() => toggleRefSelection(item.refId)}
                    onLongPress={() => Alert.alert(item.title, item.subtitle || "Sem preview disponível")}
                    style={[
                      styles.managerItem,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected ? theme.colors.primaryAlpha20 : theme.colors.card
                      }
                    ]}
                  >
                    <View style={[styles.managerItemIcon, { backgroundColor: theme.colors.surfaceElevated }]}> 
                      <Ionicons
                        name={item.sourceType === "folder" ? "folder-outline" : item.sourceType === "files" ? "document-outline" : "document-text-outline"}
                        size={16}
                        color={theme.colors.textSecondary}
                      />
                    </View>
                    <View style={{ flex: 1 }}> 
                      <Text numberOfLines={1}>{item.title}</Text>
                      {!!item.subtitle && <Text numberOfLines={1} muted variant="caption">{item.subtitle}</Text>}
                    </View>
                    {selected ? (
                      <Ionicons name="checkbox" size={20} color={theme.colors.primary} />
                    ) : (
                      <Ionicons name="square-outline" size={20} color={theme.colors.textSecondary} />
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  headerOverlay: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    zIndex: 5,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  headerActions: {
    flexDirection: "row",
    gap: 8
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  bannerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center"
  },
  content: {
    paddingBottom: 180
  },
  profileCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 12
  },
  banner: {
    height: 156,
    width: "100%"
  },
  bannerImage: {
    width: "100%",
    height: "100%"
  },
  bannerFallback: {
    width: "100%",
    height: "100%"
  },
  avatarWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 4,
    marginTop: -42,
    marginLeft: 14,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center"
  },
  avatarImage: {
    width: "100%",
    height: "100%"
  },
  userInfo: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 8
  },
  bio: {
    marginTop: 8,
    lineHeight: 19
  },
  sectionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  sectionItemsRow: {
    gap: 10
  },
  emptyItem: {
    width: 180,
    height: 132,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  itemCard: {
    width: 176,
    minHeight: 168,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10
  },
  itemImage: {
    width: "100%",
    height: 92,
    borderRadius: 8,
    marginBottom: 8
  },
  itemImagePlaceholder: {
    width: "100%",
    height: 92,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  itemMainRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  itemTextCol: {
    flex: 1
  },
  itemFolderAvatarWrap: {
    position: "relative",
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2
  },
  itemFolderAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 8
  },
  itemTitle: {
    fontWeight: "600"
  },
  itemSubtitle: {
    marginTop: 4,
    lineHeight: 15
  },
  monthsRow: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 6,
    marginLeft: 34
  },
  heatmapWrap: {
    flexDirection: "row"
  },
  weekdayCol: {
    width: 28,
    paddingTop: 4,
    justifyContent: "space-between"
  },
  weekdayText: {
    marginBottom: 12
  },
  columnsRow: {
    flexDirection: "row",
    gap: 4
  },
  column: {
    gap: 4
  },
  dayCell: {
    width: 11,
    height: 11,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-start",
    alignItems: "flex-end"
  },
  menuPanel: {
    marginTop: 66,
    marginRight: 12,
    width: 250,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8
  },
  menuItem: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  saveButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  editContent: {
    paddingBottom: 80,
    gap: 12
  },
  editCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12
  },
  rowGap: {
    gap: 10
  },
  pickButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  inputLabel: {
    marginTop: 8,
    marginBottom: 4
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  bioInput: {
    minHeight: 96,
    maxHeight: 160
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10
  },
  smallAction: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7
  },
  sectionEditor: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10
  },
  sectionEditorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  sectionEditorActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  sortIconButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  typeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  typeChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  manageItemsButton: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10
  },
  filterChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  selectAllButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10
  },
  selectedWrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: 4
  },
  managerListContent: {
    paddingBottom: 120,
    gap: 8
  },
  managerItem: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  managerItemIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  }
});

export default ProfileScreen;
