import { invoke } from "@tauri-apps/api/core";
import type {
  ActiveSessionInfo,
  CaptureStepResult,
  CaseEvidenceFromSession,
  ListCasesResult,
  ProjectConfig,
  ProjectRef,
  SaveCaseResult,
  Session,
  SessionRef,
  StepStatus,
  TestCase,
  ValidationResult,
} from "./types";

export const api = {
  // Project lifecycle
  createProject: (parentDir: string, name: string) =>
    invoke<ProjectConfig>("create_project", { parentDir, name }),
  openProject: (dir: string) => invoke<ProjectConfig>("open_project", { dir }),
  validateProject: (dir: string) => invoke<ValidationResult>("validate_project", { dir }),
  initializeExistingFolder: (dir: string) =>
    invoke<ProjectConfig>("initialize_existing_folder", { dir }),

  // Recent projects
  getRecentProjects: () => invoke<ProjectRef[]>("get_recent_projects"),
  recordRecentProject: (projectPath: string, projectName: string) =>
    invoke<void>("record_recent_project", { projectPath, projectName }),
  forgetRecentProject: (projectPath: string) =>
    invoke<void>("forget_recent_project", { projectPath }),

  // Project config (suites + module_folders)
  updateProjectConfig: (projectRoot: string, config: ProjectConfig) =>
    invoke<void>("update_project_config", { projectRoot, config }),

  // Cases
  listCases: (projectRoot: string) => invoke<ListCasesResult>("list_cases", { projectRoot }),
  loadCase: (path: string) => invoke<TestCase>("load_case", { path }),
  saveCase: (
    projectRoot: string,
    testCase: TestCase,
    previousPath?: string,
  ) =>
    invoke<SaveCaseResult>("save_case", {
      projectRoot,
      testCase,
      previousPath: previousPath ?? null,
    }),
  deleteCase: (projectRoot: string, path: string) =>
    invoke<void>("delete_case", { projectRoot, path }),
  regenerateIndex: (projectRoot: string) => invoke<string>("regenerate_index", { projectRoot }),

  // Capture
  captureRegion: () => invoke<string>("capture_region"),
  captureFullScreen: () => invoke<string>("capture_full_screen"),
  captureWindow: () => invoke<string>("capture_window"),
  captureStep: (caseId: string, step: number) =>
    invoke<CaptureStepResult>("capture_step", { caseId, step }),
  pasteClipboardToStep: (caseId: string, step: number, label?: string) =>
    invoke<Session>("paste_clipboard_to_step", {
      caseId,
      step,
      label: label ?? null,
    }),
  attachStepFile: (caseId: string, step: number, sourcePath: string) =>
    invoke<Session>("attach_step_file", { caseId, step, sourcePath }),
  deleteStepEvidence: (
    sessionDir: string,
    caseId: string,
    step: number,
    matchKey:
      | { kind: "path"; path: string }
      | { kind: "text"; captured_at: string },
  ) =>
    invoke<void>("delete_step_evidence", {
      sessionDir,
      caseId,
      step,
      matchKey,
    }),
  updateStepTextEvidence: (
    sessionDir: string,
    caseId: string,
    step: number,
    capturedAt: string,
    content: string,
  ) =>
    invoke<void>("update_step_text_evidence", {
      sessionDir,
      caseId,
      step,
      capturedAt,
      content,
    }),

  // Sessions
  startSession: (projectRoot: string, caseIds: string[]) =>
    invoke<ActiveSessionInfo>("start_session", { projectRoot, caseIds }),
  getActiveSession: () => invoke<ActiveSessionInfo | null>("get_active_session"),
  markStep: (
    caseId: string,
    step: number,
    status: StepStatus,
    notes?: string,
  ) =>
    invoke<Session>("mark_step", {
      caseId,
      step,
      status,
      notes: notes ?? null,
    }),
  endSession: () => invoke<Session>("end_session"),
  listSessions: (projectRoot: string) => invoke<SessionRef[]>("list_sessions", { projectRoot }),
  listCaseEvidence: (projectRoot: string, caseId: string) =>
    invoke<CaseEvidenceFromSession[]>("list_case_evidence", {
      projectRoot,
      caseId,
    }),

  // Watcher
  startWatch: (projectRoot: string) => invoke<void>("start_watch", { projectRoot }),
  stopWatch: () => invoke<void>("stop_watch"),

  // Tray
  setTrayStatus: (text: string | null) => invoke<void>("set_tray_status", { text }),

  // Report
  exportReport: (projectRoot: string, sessionDir: string) =>
    invoke<string>("export_html_report", { projectRoot, sessionDir }),

  // System
  openPath: (path: string) => invoke<void>("open_path", { path }),
};
