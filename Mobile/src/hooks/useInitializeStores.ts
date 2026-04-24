import { useEffect } from 'react';
import { useTasksStore } from '@store/useTasksStore';
import { useNotesStore } from '@store/useNotesStore';
import { useQuickNotesStore } from '@store/useQuickNotesStore';
import { useAppStore } from '@store/useAppStore';
import { getAllTasks } from '@services/tasksService';
import { getAllNotes, getAllQuickNotes } from '@services/notesService';
import { getAllFolders } from '@services/foldersService';
import { getAllFiles } from '@services/filesService';
import { useFilesStore } from '@store/useFilesStore';
import { getPinnedItems, getRecentItems } from '@services/appMetaService';
import { log, warn, error as logError } from '@utils/logger';

/**
 * Reads all data from the database and updates all global stores.
 * Useful for initial app startup and after restoring a full backup.
 */
export const reloadAllStoresFromDatabase = async () => {
  try {
    const [tasks, notes, quickNotes, folders, files, pinned, recent] = await Promise.all([
      getAllTasks(),
      getAllNotes(),
      getAllQuickNotes(),
      getAllFolders(),
      getAllFiles(),
      getPinnedItems(),
      getRecentItems()
    ]);
    
    useTasksStore.getState().setTasks(tasks);
    useNotesStore.getState().setNotes(notes);
    useQuickNotesStore.getState().setQuickNotes(quickNotes);
    useFilesStore.getState().setFiles(files);
    
    useAppStore.getState().setInitialData({
      folders: Object.fromEntries(folders.map(f => [f.id, f])),
      pinnedItems: pinned,
      recentItems: recent
    });
    
    log('[INIT] Stores synchronized with database');
  } catch (error) {
    logError('[INIT] Error synchronizing stores:', error);
    throw error;
  }
};
export const useInitializeStores = () => {
  useEffect(() => {
    reloadAllStoresFromDatabase();
  }, []);
};
