/**
 * 🎯 CONFIGURAÇÃO CENTRALIZADA E IMUTÁVEL DAS AÇÕES DO FAB
 * 
 * ✅ Array FIXO com ordem GARANTIDA (não usar Object.keys(), map direto, etc)
 * ✅ Ordem NUNCA muda entre telas
 * ✅ Reutilizável em FoldersScreen e FolderDetailScreen
 * 
 * ORDEM CORRETA (OBRIGATÓRIA):
 * 1. Import Package
 * 2. Add File
 * 3. Create Folder
 * 4. Quick Note
 * 5. Create Note (Note a Log)
 */

export const FOLDER_FAB_ACTIONS_ORDER = [
  "import-package",
  "add-file",
  "create-folder",
  "quick-note",
  "create-note"
] as const;

export type FABActionKey = typeof FOLDER_FAB_ACTIONS_ORDER[number];

export interface FABActionConfig {
  key: FABActionKey;
  label: string;
  icon: string;
  order: number;
}

/**
 * Array FIXO com ordem GARANTIDA - NUNCA MUDE A ORDEM!
 */
export const FOLDER_FAB_ACTIONS_CONFIG: FABActionConfig[] = [
  {
    key: "import-package",
    label: "Import Package",
    icon: "download-outline",
    order: 1
  },
  {
    key: "add-file",
    label: "Add File",
    icon: "attach-outline",
    order: 2
  },
  {
    key: "create-folder",
    label: "Create Folder",
    icon: "folder-outline",
    order: 3
  },
  {
    key: "quick-note",
    label: "Quick Note",
    icon: "flash-outline",
    order: 4
  },
  {
    key: "create-note",
    label: "Create Note",
    icon: "document-text-outline",
    order: 5
  }
];

/**
 * Garante que as ações sempre estão na ordem correta
 * (Segurança extra - mesmo que alguém tente reordenar)
 */
export const getSortedFABActions = (): FABActionConfig[] => {
  return [...FOLDER_FAB_ACTIONS_CONFIG].sort((a, b) => a.order - b.order);
};
