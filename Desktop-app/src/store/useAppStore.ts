import { create } from 'zustand';

interface AppState {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activeSpace: 'vibe' | 'code' | 'chat' | 'cowork' | 'project' | 'plan';
  setActiveSpace: (space: 'vibe' | 'code' | 'chat' | 'cowork' | 'project' | 'plan') => void;
  isProjectModalOpen: boolean;
  setIsProjectModalOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  activeSpace: (localStorage.getItem('matrix_active_space') as any) || 'chat',
  setActiveSpace: (space) => {
    localStorage.setItem('matrix_active_space', space);
    set({ activeSpace: space });
  },
  isProjectModalOpen: false,
  setIsProjectModalOpen: (open) => set({ isProjectModalOpen: open }),
}));
