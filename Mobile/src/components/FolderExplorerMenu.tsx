import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import FolderTree from "./FolderTree";
import type { Folder, Note, QuickNote } from "@models/types";

interface FolderExplorerMenuProps {
  visible: boolean;
  onClose: () => void;
  folders: Record<string, Folder>;
  notes: Record<string, Note>;
  quickNotes: Record<string, QuickNote>;
  expandedFolders: Set<string>;
  onToggleExpand: (folderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onSelectQuickNote: (quickNoteId: string) => void;
  currentFolderId?: string | null;
  // Theme colors
  backgroundColor: string;
  cardColor: string;
  textPrimary: string;
  textSecondary: string;
  primaryColor: string;
  borderColor: string;
}

const FolderExplorerMenu: React.FC<FolderExplorerMenuProps> = ({
  visible,
  onClose,
  folders,
  notes,
  quickNotes,
  expandedFolders,
  onToggleExpand,
  onSelectNote,
  onSelectQuickNote,
  currentFolderId,
  backgroundColor,
  cardColor,
  textPrimary,
  textSecondary,
  primaryColor,
  borderColor
}) => {
  const { width } = useWindowDimensions();
  const menuWidth = Math.min(width * 0.75, 320);
  const [mounted, setMounted] = useState(visible);
  const translateX = useRef(new Animated.Value(menuWidth)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      requestAnimationFrame(() => {
        translateX.setValue(menuWidth);
        Animated.timing(translateX, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true
        }).start();
      });
      return;
    }

    if (!mounted) return;

    Animated.timing(translateX, {
      toValue: menuWidth,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start(() => {
      setMounted(false);
    });
  }, [menuWidth, mounted, translateX, visible]);

  const handleSelectNote = (noteId: string) => {
    onSelectNote(noteId);
    onClose();
  };

  const handleSelectQuickNote = (quickNoteId: string) => {
    onSelectQuickNote(quickNoteId);
    onClose();
  };

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Menu container - slides from right */}
        <Animated.View
          style={[
            styles.menuContainer,
            {
              width: menuWidth,
              backgroundColor: cardColor,
              transform: [{ translateX }]
            }
          ]}
        >
          <Pressable style={styles.menuTouchBlock} onPress={(e) => e.stopPropagation()}>
          <SafeAreaView style={styles.safeArea}>
            {/* Header */}
            <View style={[styles.menuHeader, { borderBottomColor: borderColor }]}>
              <Text variant="subtitle" style={{ color: textPrimary }}>
                Folders
              </Text>
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
                <Ionicons name="close-outline" size={24} color={textPrimary} />
              </Pressable>
            </View>

            {/* Tree content */}
            <ScrollView style={styles.treeScrollView} showsVerticalScrollIndicator={false}>
              <FolderTree
                folders={folders}
                notes={notes}
                quickNotes={quickNotes}
                expandedFolders={expandedFolders}
                onToggleExpand={onToggleExpand}
                onSelectNote={handleSelectNote}
                onSelectQuickNote={handleSelectQuickNote}
                currentFolderId={currentFolderId}
                textColor={textPrimary}
                primaryColor={primaryColor}
                secondaryColor={textSecondary}
                backgroundColor={cardColor}
              />
            </ScrollView>
          </SafeAreaView>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "flex-end"
  },
  menuContainer: {
    height: "100%",
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    overflow: "hidden"
  },
  menuTouchBlock: {
    flex: 1
  },
  safeArea: {
    flex: 1
  },
  menuHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  closeButton: {
    padding: 4
  },
  treeScrollView: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4
  }
});

export default FolderExplorerMenu;
