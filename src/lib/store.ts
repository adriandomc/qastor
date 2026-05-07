import { create } from "zustand";
import { api } from "./tauri";
import type { CaseLoadError, LoadedCase, ProjectConfig, ProjectRef, Session } from "./types";

// --- Project store ----------------------------------------------------------

interface ProjectState {
  current: ProjectConfig | null;
  currentPath: string | null;
  recent: ProjectRef[];
  openProject: (path: string, config: ProjectConfig) => void;
  updateConfig: (config: ProjectConfig) => void;
  closeProject: () => void;
  setRecent: (list: ProjectRef[]) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  current: null,
  currentPath: null,
  recent: [],
  openProject: (path, config) => set({ current: config, currentPath: path }),
  updateConfig: (config) => set({ current: config }),
  closeProject: () => set({ current: null, currentPath: null }),
  setRecent: (list) => set({ recent: list }),
}));

// --- Cases store ------------------------------------------------------------

interface CasesState {
  cases: LoadedCase[];
  errors: CaseLoadError[];
  loading: boolean;
  lastError: string | null;
  refresh: (projectRoot: string) => Promise<void>;
  clear: () => void;
}

export const useCasesStore = create<CasesState>((set) => ({
  cases: [],
  errors: [],
  loading: false,
  lastError: null,
  refresh: async (projectRoot) => {
    set({ loading: true, lastError: null });
    try {
      const result = await api.listCases(projectRoot);
      set({ cases: result.cases, errors: result.errors, loading: false });
    } catch (e) {
      set({ loading: false, lastError: String(e) });
    }
  },
  clear: () => set({ cases: [], errors: [], lastError: null }),
}));

// --- Session store ----------------------------------------------------------

interface SessionStateSlice {
  session: Session | null;
  sessionDir: string | null;
  cursorCaseId: string | null;
  cursorStep: number | null;
  setActiveSession: (s: Session | null, dir: string | null) => void;
  patchSession: (s: Session) => void;
  setCursor: (caseId: string, step: number) => void;
  clearCursor: () => void;
}

export const useSessionStore = create<SessionStateSlice>((set) => ({
  session: null,
  sessionDir: null,
  cursorCaseId: null,
  cursorStep: null,
  setActiveSession: (s, dir) => set({ session: s, sessionDir: dir }),
  patchSession: (s) => set({ session: s }),
  setCursor: (caseId, step) => set({ cursorCaseId: caseId, cursorStep: step }),
  clearCursor: () => set({ cursorCaseId: null, cursorStep: null }),
}));
