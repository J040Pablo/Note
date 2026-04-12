import { useCallback, useMemo } from "react";
import { useNavigation } from "@react-navigation/native";
import { useNavigationLock } from "./useNavigationLock";
import { FOLDER_FAB_ACTIONS_CONFIG, getSortedFABActions, type FABActionKey, type FABActionConfig } from "../config/folderFABActions";

export type FABAction = FABActionConfig & {
  onPress: () => void;
};

interface UseFolderFABActionsProps {
  folderId: string | null;
  onShowCreateFolder: () => void;
  onShowAddFile: () => void;
  isDetailScreen?: boolean;
}

/**
 * ✅ Retorna as ações do FAB em ordem FIXA e GARANTIDA
 * Usa configuração centralizada de folderFABActions.ts
 * Ordem NUNCA muda: Import Package → Add File → Create Folder → Quick Note → Create Note
 */
export const useFolderFABActions = ({
  folderId,
  onShowCreateFolder,
  onShowAddFile,
  isDetailScreen = false
}: UseFolderFABActionsProps): FABAction[] => {
  const { withLock } = useNavigationLock();
  const navigation = useNavigation<any>();

  const actions = useMemo(() => {
    // Map com handlers por action key
    const actionHandlers: Record<FABActionKey, () => void> = {
      "import-package": () => {
        withLock(() => {
          if (isDetailScreen) {
            navigation.navigate("ImportFolderPackage", { destinationFolderId: folderId ?? null });
          } else {
            navigation.getParent()?.getParent()?.navigate("ImportFolderPackage");
          }
        });
      },
      "add-file": () => {
        onShowAddFile();
      },
      "create-folder": () => {
        onShowCreateFolder();
      },
      "quick-note": () => {
        withLock(() => {
          if (isDetailScreen) {
            navigation.getParent()?.getParent()?.navigate("QuickNote", { folderId: folderId ?? null });
          } else {
            navigation.getParent()?.getParent()?.navigate("QuickNote", { folderId: null });
          }
        });
      },
      "create-note": () => {
        withLock(() => {
          if (isDetailScreen) {
            navigation.navigate("NoteEditor", { folderId: folderId ?? null });
          } else {
            navigation.getParent()?.getParent()?.navigate("NoteEditor", { folderId: null });
          }
        });
      }
    };

    // Pega as ações em ordem garantida e adiciona handlers
    const sortedConfig = getSortedFABActions();
    const fabActions: FABAction[] = sortedConfig.map((config: FABActionConfig) => ({
      ...config,
      onPress: actionHandlers[config.key]
    }));

    return fabActions;
  }, [folderId, onShowCreateFolder, onShowAddFile, withLock, navigation, isDetailScreen]);

  return actions;
};
