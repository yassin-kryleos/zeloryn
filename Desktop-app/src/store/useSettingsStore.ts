import { create } from 'zustand';

interface SettingsState {
  apiKey: string;
  setApiKey: (key: string) => void;
  workspaceRoot: string;
  setWorkspaceRoot: (root: string) => void;
  theme: string;
  setTheme: (theme: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  apiKey: '',
  setApiKey: (key) => set({ apiKey: key }),
  workspaceRoot: '',
  setWorkspaceRoot: (root) => set({ workspaceRoot: root }),
  theme: localStorage.getItem('matrix_theme') || 'system',
  setTheme: (theme) => {
    localStorage.setItem('matrix_theme', theme);
    set({ theme });
  },
}));
