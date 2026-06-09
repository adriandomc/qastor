import type { CaseStatus, EvidenceHint, Priority, SessionRef, StepStatus, TestType } from "./types";

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "labels.priority.critical",
  high: "labels.priority.high",
  medium: "labels.priority.medium",
  low: "labels.priority.low",
};

export const TYPE_LABEL: Record<TestType, string> = {
  happy_path: "labels.type.happy_path",
  error: "labels.type.error",
  edge_case: "labels.type.edge_case",
};

export const TYPE_LABEL_SHORT: Record<TestType, string> = {
  happy_path: "labels.typeShort.happy_path",
  error: "labels.typeShort.error",
  edge_case: "labels.typeShort.edge_case",
};

export const EVIDENCE_HINT_LABEL: Record<EvidenceHint, string> = {
  none: "labels.evidenceHint.none",
  screenshot: "labels.evidenceHint.screenshot",
  text_excerpt: "labels.evidenceHint.text_excerpt",
  db_query: "labels.evidenceHint.db_query",
  file_attachment: "labels.evidenceHint.file_attachment",
};

export const EVIDENCE_HINT_LABEL_SHORT: Record<EvidenceHint, string> = {
  none: "labels.evidenceHintShort.none",
  screenshot: "labels.evidenceHintShort.screenshot",
  text_excerpt: "labels.evidenceHintShort.text_excerpt",
  db_query: "labels.evidenceHintShort.db_query",
  file_attachment: "labels.evidenceHintShort.file_attachment",
};

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: "labels.stepStatus.pending",
  passed: "labels.stepStatus.passed",
  failed: "labels.stepStatus.failed",
  blocked: "labels.stepStatus.blocked",
};

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  pending: "labels.caseStatus.pending",
  running: "labels.caseStatus.running",
  passed: "labels.caseStatus.passed",
  failed: "labels.caseStatus.failed",
  blocked: "labels.caseStatus.blocked",
};

export type StatusTone = "ok" | "err" | "warn" | "default" | "muted";

/**
 * Variants accepted by `<StatusIndicator>` in the design system. Use these
 * for workflow states; keep colored pills only for true emphasis (errors,
 * critical priority).
 */
export type StatusVariant =
  | "passed"
  | "failed"
  | "blocked"
  | "pending"
  | "running";

export const STEP_STATUS_VARIANT: Record<StepStatus, StatusVariant> = {
  pending: "pending",
  passed: "passed",
  failed: "failed",
  blocked: "blocked",
};

export const CASE_STATUS_VARIANT: Record<CaseStatus, StatusVariant> = {
  pending: "pending",
  running: "running",
  passed: "passed",
  failed: "failed",
  blocked: "blocked",
};

export const PRIORITY_TONE: Record<Priority, StatusTone> = {
  critical: "err",
  high: "warn",
  medium: "default",
  low: "muted",
};

export const TYPE_TONE: Record<TestType, StatusTone> = {
  happy_path: "ok",
  error: "err",
  edge_case: "warn",
};

export const STEP_STATUS_TONE: Record<StepStatus, StatusTone> = {
  pending: "default",
  passed: "ok",
  failed: "err",
  blocked: "warn",
};

export const CASE_STATUS_TONE: Record<CaseStatus, StatusTone> = {
  pending: "muted",
  running: "default",
  passed: "ok",
  failed: "err",
  blocked: "warn",
};

// --- Session-level overall status -------------------------------------------

export type SessionOverall =
  | "successful"
  | "failed"
  | "blocked"
  | "incomplete"
  | "in_progress"
  | "empty";

export interface SessionOutcome {
  overall: SessionOverall;
  /** 0–100 — % of cases that ended in `passed`. */
  passRate: number;
  /** 0–100 — % of cases with any terminal status (passed/failed/blocked). */
  completion: number;
  label: string;
  tone: StatusTone;
  /** StatusIndicator variant for the dot color. */
  variant: StatusVariant;
}

export function sessionOutcome(s: SessionRef): SessionOutcome {
  const total = s.case_count;
  if (total === 0) {
    return {
      overall: "empty",
      passRate: 0,
      completion: 0,
      label: "labels.sessionOutcome.empty",
      tone: "muted",
      variant: "pending",
    };
  }
  const completed = s.passed + s.failed + s.blocked;
  const passRate = Math.round((s.passed / total) * 100);
  const completion = Math.round((completed / total) * 100);

  if (!s.ended_at) {
    return {
      overall: "in_progress",
      passRate,
      completion,
      label: "labels.sessionOutcome.inProgress",
      tone: "default",
      variant: "running",
    };
  }
  if (s.failed > 0) {
    return {
      overall: "failed",
      passRate,
      completion,
      label: "labels.sessionOutcome.failed",
      tone: "err",
      variant: "failed",
    };
  }
  if (s.blocked > 0) {
    return {
      overall: "blocked",
      passRate,
      completion,
      label: "labels.sessionOutcome.blocked",
      tone: "warn",
      variant: "blocked",
    };
  }
  if (completed < total) {
    return {
      overall: "incomplete",
      passRate,
      completion,
      label: "labels.sessionOutcome.incomplete",
      tone: "muted",
      variant: "pending",
    };
  }
  return {
    overall: "successful",
    passRate,
    completion,
    label: "labels.sessionOutcome.successful",
    tone: "ok",
    variant: "passed",
  };
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}
