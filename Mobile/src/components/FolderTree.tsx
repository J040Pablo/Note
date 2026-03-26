import React, { useMemo } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import type { Folder, Note, QuickNote } from "@models/types";

interface TreeItem {
  id: string;
  name: string;
  type: "folder" | "note" | "quickNote";
  parentId?: string | null;
  depth: number;
}

interface FolderTreeProps {
  folders: Record<string, Folder>;
  notes: Record<string, Note>;
  quickNotes: Record<string, QuickNote>;
  expandedFolders: Set<string>;
  onToggleExpand: (folderId: string) => void;
  onSelectNote: (noteId: string) => void;
  onSelectQuickNote: (quickNoteId: string) => void;
  onSelectFolder?: (folderId: string) => void;
  currentFolderId?: string | null;
  textColor: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
}

const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  notes,
  quickNotes,
  expandedFolders,
  onToggleExpand,
  onSelectNote,
  onSelectQuickNote,
  onSelectFolder,
  currentFolderId,
  textColor,
  primaryColor,
  secondaryColor,
  backgroundColor
}) => {
  // Get root folders (parentId is null)
  const rootFolders = useMemo(
    () => Object.values(folders).filter((f) => !f.parentId),
    [folders]
  );

  const renderFolderItem = (folder: Folder, depth: number): React.ReactNode => {
    const isExpanded = expandedFolders.has(folder.id);
    const childFolders = Object.values(folders).filter((f) => f.parentId === folder.id);
    const folderNotes = Object.values(notes).filter((n) => n.folderId === folder.id);
    const folderQuickNotes = Object.values(quickNotes).filter((qn) => qn.folderId === folder.id);
    const hasChildren = childFolders.length > 0 || folderNotes.length > 0 || folderQuickNotes.length > 0;
    const isCurrent = currentFolderId === folder.id;
    const folderColor = typeof folder.color === "string" && folder.color.trim() ? folder.color : primaryColor;

    const paddingLeft = depth * 12;

    return (
      <View key={`folder-${folder.id}`}>
        {/* Folder row */}
        <View style={[styles.treeRow, { paddingLeft, backgroundColor: isCurrent ? backgroundColor : "transparent" }]}>
          <Pressable
            onPress={() => onToggleExpand(folder.id)}
            style={[styles.expandButton, hasChildren ? {} : { opacity: 0 }]}
            hitSlop={6}
          >
            <Ionicons
              name={isExpanded ? "chevron-down-outline" : "chevron-forward-outline"}
              size={14}
              color={secondaryColor}
            />
          </Pressable>

          <View style={styles.folderIconWrap}>
            <Ionicons name="folder-outline" size={14} color={folderColor} />
          </View>

          <Pressable
            style={styles.labelWrap}
            onPress={() => {
              if (hasChildren) {
                onToggleExpand(folder.id);
              } else if (onSelectFolder) {
                onSelectFolder(folder.id);
              }
            }}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.treeLabel,
                {
                  color: textColor,
                  fontWeight: isCurrent ? "600" : "500"
                }
              ]}
            >
              {folder.name}
            </Text>
          </Pressable>
        </View>

        {/* Children */}
        {isExpanded && (
          <View>
            {/* Child folders */}
            {childFolders.map((child) => renderFolderItem(child, depth + 1))}

            {/* Notes */}
            {folderNotes.map((note) => (
              <View key={`note-${note.id}`} style={[styles.treeRow, { paddingLeft: (depth + 1) * 12 }]}>
                <View style={[styles.expandButton, { opacity: 0 }]} />
                <View style={styles.noteIconWrap}>
                  <Ionicons name="document-text-outline" size={14} color={secondaryColor} />
                </View>
                <Pressable style={styles.labelWrap} onPress={() => onSelectNote(note.id)}>
                  <Text numberOfLines={1} style={[styles.treeLabel, { color: textColor }]}>
                    {note.title}
                  </Text>
                </Pressable>
              </View>
            ))}

            {/* Quick Notes */}
            {folderQuickNotes.map((quickNote) => (
              <View key={`quicknote-${quickNote.id}`} style={[styles.treeRow, { paddingLeft: (depth + 1) * 12 }]}>
                <View style={[styles.expandButton, { opacity: 0 }]} />
                <View style={styles.noteIconWrap}>
                  <Ionicons name="flash-outline" size={14} color={secondaryColor} />
                </View>
                <Pressable style={styles.labelWrap} onPress={() => onSelectQuickNote(quickNote.id)}>
                  <Text numberOfLines={1} style={[styles.treeLabel, { color: textColor }]}>
                    {quickNote.title}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return <View style={styles.treeRoot}>{rootFolders.map((folder) => renderFolderItem(folder, 0))}</View>;
};

const styles = StyleSheet.create({
  treeRoot: {
    flex: 1
  },
  treeRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    paddingRight: 8
  },
  expandButton: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center"
  },
  folderIconWrap: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6
  },
  noteIconWrap: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 6
  },
  labelWrap: {
    flex: 1
  },
  treeLabel: {
    fontSize: 13,
    lineHeight: 16
  }
});

export default FolderTree;
