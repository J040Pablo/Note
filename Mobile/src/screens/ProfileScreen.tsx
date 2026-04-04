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
  saveProfileState,
  type ProfileSection,
  type ProfileSectionItem,
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
              <Image source={{ uri: profile.user.banner }} style={styles.bannerImage} />
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
                      {item.imageUri ? (
                        <Image source={{ uri: item.imageUri }} style={styles.itemImage} />
                      ) : (
                        <View style={[styles.itemImagePlaceholder, { backgroundColor: theme.colors.background }]}> 
                          <Ionicons
                            name={
                              section.type === "folder"
                                ? "folder-outline"
                                : section.type === "files"
                                  ? "document-outline"
                                  : "document-text-outline"
                            }
                            size={16}
                            color={theme.colors.textSecondary}
                          />
                        </View>
                      )}
                      <Text numberOfLines={1} style={styles.itemTitle}>{item.title}</Text>
                      {!!item.subtitle && (
                        <Text numberOfLines={2} muted variant="caption" style={styles.itemSubtitle}>{item.subtitle}</Text>
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
                    </View>
                  ))}
                </View>
              </>
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
    height: 112,
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
    width: 150,
    height: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  itemCard: {
    width: 136,
    minHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 8
  },
  itemImage: {
    width: "100%",
    height: 58,
    borderRadius: 8,
    marginBottom: 8
  },
  itemImagePlaceholder: {
    width: "100%",
    height: 58,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center"
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
  }
});

export default ProfileScreen;
