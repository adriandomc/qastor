// TypeScript mirror of the Rust domain types in src-tauri/src/domain/.
// Field names use snake_case to match JSON on disk (matches the schema).

export type TestType = "happy_path" | "error" | "edge_case";

export type Priority = "critical" | "high" | "medium" | "low";

export type EvidenceHint =
  | "none"
  | "screenshot"
  | "text_excerpt"
  | "db_query"
  | "file_attachment";

/**
 * Typed evidence stored in session.json. Mirrors the Rust `EvidenceItem`
 * enum (tagged by `kind`).
 */
export type EvidenceItem =
  | { kind: "screenshot"; path: string; captured_at: string }
  | {
      kind: "text";
      content: string;
      captured_at: string;
      label?: string;
    }
  | {
      kind: "file";
      path: string;
      filename: string;
      mime?: string;
      size_bytes?: number;
      captured_at: string;
    };

/**
 * Same shape as `EvidenceItem` but with absolute paths (ready for
 * `convertFileSrc` / `openPath`) plus the original relative path used as
 * the match key for delete operations.
 */
export type ResolvedEvidence =
  | {
      kind: "screenshot";
      path: string;
      relative_path: string;
      captured_at: string;
    }
  | {
      kind: "text";
      content: string;
      captured_at: string;
      label?: string;
    }
  | {
      kind: "file";
      path: string;
      relative_path: string;
      filename: string;
      mime?: string;
      size_bytes?: number;
      captured_at: string;
    };

export interface TestStep {
  step: number;
  action: string;
  expected: string;
  evidence_hint?: EvidenceHint;
  data?: Record<string, unknown>;
}

export interface TestCase {
  id: string;
  title: string;
  module: string;
  type: TestType;
  priority: Priority;
  preconditions?: string[];
  steps: TestStep[];
  acceptance_criteria: string[];
  related_files?: string[];
  tags?: string[];
  estimated_minutes?: number;
}

// --- Sessions ---------------------------------------------------------------

export type CaseStatus = "pending" | "running" | "passed" | "failed" | "blocked";
export type StepStatus = "pending" | "passed" | "failed" | "blocked";

export interface StepResult {
  step: number;
  status: StepStatus;
  evidence_paths?: string[];
  evidence_items?: EvidenceItem[];
  notes?: string;
  captured_at?: string; // ISO-8601
}

export interface CaseResult {
  case_id: string;
  status: CaseStatus;
  started_at?: string;
  ended_at?: string;
  steps: StepResult[];
}

export interface Session {
  session_id: string;
  started_at: string;
  ended_at?: string;
  executor?: string;
  build_version?: string;
  case_results: CaseResult[];
}

// --- Project ----------------------------------------------------------------

export interface ProjectConfig {
  qastor_version: string;
  project_name: string;
  created_at: string;
  module_folders: Record<string, string>;
  suites: Record<string, string[]>;
  default_session_dir: string;
}

export interface ProjectRef {
  path: string;
  project_name: string;
  last_opened: string;
}

export type ValidationResult =
  | { kind: "valid"; config: ProjectConfig }
  | {
      kind: "initializable_existing";
      case_count: number;
      detected_modules: string[];
      has_index_json: boolean;
    }
  | { kind: "not_a_project"; reason: string }
  | { kind: "invalid"; error: string };

// --- Case loading -----------------------------------------------------------

export interface LoadedCase {
  case: TestCase;
  path: string;
}

export interface CaseLoadError {
  path: string;
  error: string;
}

export interface ListCasesResult {
  cases: LoadedCase[];
  errors: CaseLoadError[];
}

export interface SaveCaseResult {
  path: string;
  config: ProjectConfig;
}

// --- Session results --------------------------------------------------------

export interface SessionRef {
  session_id: string;
  session_dir: string;
  started_at: string;
  ended_at?: string;
  case_count: number;
  passed: number;
  failed: number;
  blocked: number;
}

export interface ActiveSessionInfo {
  session: Session;
  session_dir: string;
}

export interface CaptureStepResult {
  absolute_path: string;
  relative_path: string;
  session: Session;
}

export interface CaseStepEvidence {
  step: number;
  status: StepStatus;
  /** Resolved evidence items merged from legacy paths + new typed items. */
  evidence_items: ResolvedEvidence[];
  captured_at?: string;
  notes?: string;
}

export interface CaseEvidenceFromSession {
  session_id: string;
  session_dir: string;
  started_at: string;
  ended_at?: string;
  case_status: CaseStatus;
  steps: CaseStepEvidence[];
}
