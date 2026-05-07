import type { CaseStatus, EvidenceHint, Priority, SessionRef, StepStatus, TestType } from "./types";

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export const TYPE_LABEL: Record<TestType, string> = {
  happy_path: "Flujo feliz",
  error: "Error",
  edge_case: "Caso límite",
};

export const TYPE_LABEL_SHORT: Record<TestType, string> = {
  happy_path: "Feliz",
  error: "Error",
  edge_case: "Límite",
};

export const EVIDENCE_HINT_LABEL: Record<EvidenceHint, string> = {
  none: "Sin evidencia",
  screenshot: "Captura de pantalla",
  text_excerpt: "Extracto de texto",
  db_query: "Consulta a base de datos",
  file_attachment: "Archivo adjunto",
};

export const EVIDENCE_HINT_LABEL_SHORT: Record<EvidenceHint, string> = {
  none: "—",
  screenshot: "Captura",
  text_excerpt: "Texto",
  db_query: "BD",
  file_attachment: "Archivo",
};

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: "Pendiente",
  passed: "Pasó",
  failed: "Falló",
  blocked: "Bloqueado",
};

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  pending: "Pendiente",
  running: "En curso",
  passed: "Pasó",
  failed: "Falló",
  blocked: "Bloqueado",
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
      label: "Sin casos",
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
      label: "En curso",
      tone: "default",
      variant: "running",
    };
  }
  if (s.failed > 0) {
    return {
      overall: "failed",
      passRate,
      completion,
      label: "Con fallas",
      tone: "err",
      variant: "failed",
    };
  }
  if (s.blocked > 0) {
    return {
      overall: "blocked",
      passRate,
      completion,
      label: "Con bloqueos",
      tone: "warn",
      variant: "blocked",
    };
  }
  if (completed < total) {
    return {
      overall: "incomplete",
      passRate,
      completion,
      label: "Incompleta",
      tone: "muted",
      variant: "pending",
    };
  }
  return {
    overall: "successful",
    passRate,
    completion,
    label: "Exitosa",
    tone: "ok",
    variant: "passed",
  };
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}
