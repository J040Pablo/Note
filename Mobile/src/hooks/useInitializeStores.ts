import { useEffect } from 'react';
import { useTasksStore } from '@store/useTasksStore';
import { useNotesStore } from '@store/useNotesStore';
import { useQuickNotesStore } from '@store/useQuickNotesStore';
import { useAppStore } from '@store/useAppStore';
import { getAllTasks } from '@services/tasksService';
import { getAllNotes, getAllQuickNotes } from '@services/notesService';
import { getAllFolders } from '@services/foldersService';

/**
 * Pre-load stores on app startup to ensure data is available for notification handlers
 * This prevents race conditions where notifications arrive before stores are populated
 */
export const useInitializeStores = () => {
  useEffect(() => {
    const initializeStores = async () => {
      try {
        const [tasks, notes, quickNotes, folders] = await Promise.all([
          getAllTasks(),
          getAllNotes(),
          getAllQuickNotes(),
          getAllFolders()
        ]);
        
        useTasksStore.getState().setTasks(tasks);
        useNotesStore.getState().setNotes(notes);
        useQuickNotesStore.getState().setQuickNotes(quickNotes);
        useAppStore.getState().setFolders(folders);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[INIT] Stores initialized at app startup');
        }
      } catch (error) {
        console.error('[INIT] Error initializing stores:', error);
      }
    };

    initializeStores();
  }, []);
};
