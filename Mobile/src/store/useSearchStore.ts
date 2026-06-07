import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SearchState {
  history: string[];
}

interface SearchActions {
  addSearch: (query: string) => void;
  removeSearch: (query: string) => void;
  clearHistory: () => void;
}

const MAX_HISTORY = 20;

export const useSearchStore = create<SearchState & SearchActions>()(
  persist(
    (set) => ({
      history: [],

      addSearch: (query) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;

        set((state) => {
          // Remove if already exists to move it to top
          const filtered = state.history.filter((h) => h !== trimmedQuery);
          // Add to top and limit
          const nextHistory = [trimmedQuery, ...filtered].slice(0, MAX_HISTORY);
          return { history: nextHistory };
        });
      },

      removeSearch: (query) => {
        set((state) => ({
          history: state.history.filter((h) => h !== query),
        }));
      },

      clearHistory: () => {
        set({ history: [] });
      },
    }),
    {
      name: "search-history-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
