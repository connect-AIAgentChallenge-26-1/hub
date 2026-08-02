import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type WorkspaceUiState = {
  activeCategory: string;
  globalQuery: string;
  retrieveQuery: string;
  selectedSituation: string;
};

type WorkspaceUiActions = {
  setActiveCategory: (activeCategory: string) => void;
  setGlobalQuery: (globalQuery: string) => void;
  setRetrieveQuery: (retrieveQuery: string) => void;
  setSelectedSituation: (selectedSituation: string) => void;
};

type WorkspaceUiStoreState = WorkspaceUiState & WorkspaceUiActions;
export type WorkspaceUiStore = StoreApi<WorkspaceUiStoreState>;

const INITIAL_STATE: WorkspaceUiState = {
  activeCategory: 'all',
  globalQuery: '',
  retrieveQuery: '',
  selectedSituation: '',
};

export function createWorkspaceUiStore() {
  return createStore<WorkspaceUiStoreState>()((set) => ({
    ...INITIAL_STATE,
    setActiveCategory: (activeCategory) => set({ activeCategory }),
    setGlobalQuery: (globalQuery) => set({ globalQuery }),
    setRetrieveQuery: (retrieveQuery) => set({ retrieveQuery }),
    setSelectedSituation: (selectedSituation) => set({ selectedSituation }),
  }));
}

const WorkspaceUiContext = createContext<WorkspaceUiStore | null>(null);

export function WorkspaceUiProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createWorkspaceUiStore);

  return (
    <WorkspaceUiContext.Provider value={store}>
      {children}
    </WorkspaceUiContext.Provider>
  );
}

export function useWorkspaceUiStore<T>(
  selector: (state: WorkspaceUiStoreState) => T
) {
  const store = useContext(WorkspaceUiContext);

  if (!store) {
    throw new Error('WorkspaceUiProvider 안에서 사용해야 합니다.');
  }

  return useStore(store, selector);
}
