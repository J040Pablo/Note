import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
  ActivityIndicator
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@hooks/useTheme";
import { Text } from "@components/Text";
import type { Link, InternalLinkType } from "@utils/linkUtils";
import { isValidUrl, normalizeUrl } from "@utils/linkUtils";

export interface LinkSearchResult {
  id: string;
  title: string;
  type: InternalLinkType;
  description?: string;
}

interface LinkModalProps {
  visible: boolean;
  selectedText: string;
  existingLink?: Link;
  onClose: () => void;
  onInsertExternal: (url: string, text: string) => void;
  onInsertInternal: (link: Link, text: string) => void;
  onSearchInternalItems: (query: string) => Promise<LinkSearchResult[]>;
}

type LinkType = "external" | "internal";

const LinkModal = memo(function LinkModal({
  visible,
  selectedText,
  existingLink,
  onClose,
  onInsertExternal,
  onInsertInternal,
  onSearchInternalItems
}: LinkModalProps) {
  const { theme } = useTheme();
  const [linkType, setLinkType] = useState<LinkType>(
    existingLink?.type === "internal" ? "internal" : "external"
  );
  const [url, setUrl] = useState(
    existingLink?.type === "external" ? existingLink.url : ""
  );
  const [linkText, setLinkText] = useState(selectedText);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LinkSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedInternalItem, setSelectedInternalItem] =
    useState<LinkSearchResult | null>(
      existingLink?.type === "internal"
        ? {
            id: existingLink.id,
            title: "Selected Item",
            type: existingLink.entity
          }
        : null
    );

  useEffect(() => {
    if (!visible) {
      setUrl("");
      setLinkText(selectedText);
      setSearchQuery("");
      setSearchResults([]);
      setSelectedInternalItem(null);
      setIsSearching(false);
    }
  }, [visible, selectedText]);

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query);

      if (!query.trim()) {
        setSearchResults([]);
        setSelectedInternalItem(null);
        return;
      }

      setIsSearching(true);
      try {
        const results = await onSearchInternalItems(query);
        setSearchResults(results);
      } catch (error) {
        console.error("Error searching internal items:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [onSearchInternalItems]
  );

  const isValidExternalLink = useMemo(() => {
    return url.trim() === "" || isValidUrl(normalizeUrl(url) || "");
  }, [url]);

  const canSave = useMemo(() => {
    if (linkType === "external") {
      return isValidExternalLink && linkText.trim() !== "";
    }

    return selectedInternalItem !== null && linkText.trim() !== "";
  }, [linkType, isValidExternalLink, linkText, selectedInternalItem]);

  const handleSave = useCallback(() => {
    if (linkType === "external") {
      if (isValidExternalLink && url.trim() !== "") {
        onInsertExternal(url, linkText || url);
      }
    } else {
      if (selectedInternalItem) {
        const link: Link = {
          type: "internal",
          entity: selectedInternalItem.type,
          id: selectedInternalItem.id
        };
        onInsertInternal(link, linkText);
      }
    }
  }, [
    linkType,
    isValidExternalLink,
    url,
    linkText,
    selectedInternalItem,
    onInsertExternal,
    onInsertInternal
  ]);

  if (!visible) return null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.overlay, { backgroundColor: "rgba(0, 0, 0, 0.5)" }]}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: theme.colors.surface }
        ]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: theme.colors.border }
          ]}
        >
          <Text style={styles.title}>Insert Link</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons
              name="close"
              size={24}
              color={theme.colors.textPrimary}
            />
          </Pressable>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Link Text Input */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
              Display Text
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.background,
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary
                }
              ]}
              placeholderTextColor={theme.colors.textSecondary}
              value={linkText}
              onChangeText={setLinkText}
              placeholder="Enter link display text"
            />
          </View>

          {/* Link Type Selector */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
              Link Type
            </Text>
            <View style={styles.typeSelector}>
              <Pressable
                onPress={() => setLinkType("external")}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor:
                      linkType === "external"
                        ? theme.colors.primary
                        : theme.colors.background,
                    borderColor: theme.colors.border
                  }
                ]}
              >
                <Ionicons
                  name="globe"
                  size={16}
                  color={
                    linkType === "external"
                      ? "#fff"
                      : theme.colors.primary
                  }
                />
                <Text
                  style={[
                    styles.typeButtonText,
                    {
                      color:
                        linkType === "external"
                          ? "#fff"
                          : theme.colors.textPrimary
                    }
                  ]}
                >
                  External
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setLinkType("internal")}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor:
                      linkType === "internal"
                        ? theme.colors.primary
                        : theme.colors.background,
                    borderColor: theme.colors.border
                  }
                ]}
              >
                <Ionicons
                  name="folder"
                  size={16}
                  color={
                    linkType === "internal"
                      ? "#fff"
                      : theme.colors.primary
                  }
                />
                <Text
                  style={[
                    styles.typeButtonText,
                    {
                      color:
                        linkType === "internal"
                          ? "#fff"
                          : theme.colors.textPrimary
                    }
                  ]}
                >
                  Internal
                </Text>
              </Pressable>
            </View>
          </View>

          {/* External Link Input */}
          {linkType === "external" && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                URL
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: !isValidExternalLink
                      ? "#ef4444"
                      : theme.colors.border,
                    color: theme.colors.textPrimary
                  }
                ]}
                placeholderTextColor={theme.colors.textSecondary}
                value={url}
                onChangeText={setUrl}
                placeholder="https://example.com"
                keyboardType="url"
                autoCapitalize="none"
              />
              {!isValidExternalLink && url.trim() !== "" && (
                <Text style={styles.errorText}>Invalid URL</Text>
              )}
            </View>
          )}

          {/* Internal Link Search */}
          {linkType === "internal" && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.colors.textPrimary }]}>
                Search Items
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                    color: theme.colors.textPrimary
                  }
                ]}
                placeholderTextColor={theme.colors.textSecondary}
                value={searchQuery}
                onChangeText={handleSearch}
                placeholder="Search notes, folders, tasks..."
              />

              {isSearching && (
                <View style={styles.searchingContainer}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              )}

              {selectedInternalItem && (
                <View
                  style={[
                    styles.selectedItem,
                    { backgroundColor: theme.colors.primary }
                  ]}
                >
                  <View>
                    <Text style={styles.selectedItemTitle}>
                      {selectedInternalItem.title}
                    </Text>
                    <Text style={styles.selectedItemType}>
                      {selectedInternalItem.type}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setSelectedInternalItem(null)}
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={20} color="#fff" />
                  </Pressable>
                </View>
              )}

              {searchResults.length > 0 && !selectedInternalItem && (
                <FlatList
                  data={searchResults}
                  keyExtractor={(item) => `${item.type}-${item.id}`}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => setSelectedInternalItem(item)}
                      style={[
                        styles.resultItem,
                        {
                          backgroundColor: theme.colors.background,
                          borderColor: theme.colors.border
                        }
                      ]}
                    >
                      <View>
                        <Text
                          style={[
                            styles.resultTitle,
                            { color: theme.colors.textPrimary }
                          ]}
                        >
                          {item.title}
                        </Text>
                        <Text
                          style={[
                            styles.resultType,
                            { color: theme.colors.textSecondary }
                          ]}
                        >
                          {item.type}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={theme.colors.primary}
                      />
                    </Pressable>
                  )}
                  ItemSeparatorComponent={() => (
                    <View
                      style={[
                        styles.separator,
                        { backgroundColor: theme.colors.border }
                      ]}
                    />
                  )}
                />
              )}
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View
          style={[styles.footer, { borderTopColor: theme.colors.border }]}
        >
          <Pressable
            onPress={onClose}
            style={[
              styles.button,
              { backgroundColor: theme.colors.background }
            ]}
          >
            <Text style={[styles.buttonText, { color: theme.colors.primary }]}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={!canSave}
            style={[
              styles.button,
              {
                backgroundColor: canSave
                  ? theme.colors.primary
                  : theme.colors.border
              }
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                { color: canSave ? "#fff" : theme.colors.textSecondary }
              ]}
            >
              Insert Link
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end"
  },
  container: {
    maxHeight: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1
  },
  title: {
    fontSize: 18,
    fontWeight: "600"
  },
  content: {
    padding: 16,
    maxHeight: "70%"
  },
  section: {
    marginBottom: 20
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14
  },
  errorText: {
    color: "#ef4444",
    fontSize: 12,
    marginTop: 4
  },
  typeSelector: {
    flexDirection: "row",
    gap: 12
  },
  typeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: "500"
  },
  searchingContainer: {
    paddingVertical: 16,
    alignItems: "center"
  },
  selectedItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12
  },
  selectedItemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff"
  },
  selectedItemType: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    marginTop: 2
  },
  resultItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 4
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "500"
  },
  resultType: {
    fontSize: 12,
    marginTop: 2
  },
  separator: {
    height: 1,
    marginVertical: 0
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600"
  }
});

export default LinkModal;
