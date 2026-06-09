import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Alert, Button, Card, Modal, Pill, StatusIndicator } from "@adc-ui/components";
import { Camera, Check, ClipboardPaste, FileText, Paperclip, Square, X } from "lucide-react";
import { useCasesStore, useProjectStore, useSessionStore } from "@/lib/store";
import { type HotkeyKind, onHotkey } from "@/lib/events";
import { api } from "@/lib/tauri";
import {
  CASE_STATUS_LABEL,
  CASE_STATUS_VARIANT,
  STEP_STATUS_LABEL,
  STEP_STATUS_VARIANT,
} from "@/lib/labels";
import type { CaseStatus, EvidenceItem, Session, StepResult, StepStatus } from "@/lib/types";
import { useTranslation } from "react-i18next";

function caseDotColor(status: CaseStatus): string {
  switch (status) {
    case "passed":
      return "var(--adc-accent-2)";
    case "failed":
      return "var(--adc-error)";
    case "blocked":
      return "var(--adc-warning)";
    case "running":
      return "var(--adc-accent-1)";
    case "pending":
    default:
      return "rgba(95, 112, 84, 0.4)";
  }
}

export default function SessionRunner() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { current: project, currentPath: projectPath } = useProjectStore();
  const cases = useCasesStore((s) => s.cases);
  const {
    session,
    sessionDir,
    cursorCaseId,
    cursorStep,
    setActiveSession,
    patchSession,
    setCursor,
    clearCursor,
  } = useSessionStore();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const hotkeyHandlerRef = useRef<(kind: HotkeyKind) => void>(() => {});

  useEffect(() => {
    if (!session) navigate("/project/cases", { replace: true });
  }, [session, navigate]);

  // Single global hotkey listener. The handler ref is reassigned on every
  // render so it always sees the freshest cursor + session state.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onHotkey((kind) => {
      if (!cancelled) hotkeyHandlerRef.current(kind);
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  if (!session || !cursorCaseId || cursorStep == null || !project) return null;

  const currentCase = session.case_results.find((c) => c.case_id === cursorCaseId);
  const baseCase = cases.find((lc) => lc.case.id === cursorCaseId)?.case;
  const currentStepResult = currentCase?.steps.find((s) => s.step === cursorStep);
  const currentStepDef = baseCase?.steps.find((s) => s.step === cursorStep);

  if (!currentCase || !baseCase || !currentStepResult || !currentStepDef) {
    return (
      <main style={{ padding: "var(--adc-space-6)" }}>
        <Alert tone="error" title={t("sessionRunner.inconsistentStateTitle", "Estado inconsistente")}>
          {t("sessionRunner.inconsistentState", "El cursor de sesión apunta a un caso/paso que ya no existe en el proyecto. Cierra la sesión y vuelve a iniciar.")}
        </Alert>
        <Button
          variant="primary"
          onClick={() => setConfirmEnd(true)}
          style={{ marginTop: "var(--adc-space-4)" }}
        >
          {t("sessionRunner.endSession", "Terminar sesión")}
        </Button>
      </main>
    );
  }

  function advanceCursor(s: Session) {
    const caseIdx = s.case_results.findIndex((c) => c.case_id === cursorCaseId);
    if (caseIdx < 0) return;
    const cur = s.case_results[caseIdx];
    const stepIdx = cur.steps.findIndex((sr) => sr.step === cursorStep);
    if (stepIdx >= 0 && stepIdx < cur.steps.length - 1) {
      setCursor(cursorCaseId!, cur.steps[stepIdx + 1].step);
      return;
    }
    // Move to first step of the next case that still has pending steps.
    const order = [
      ...s.case_results.slice(caseIdx + 1),
      ...s.case_results.slice(0, caseIdx),
    ];
    for (const next of order) {
      if (next.steps.some((sr) => sr.status === "pending")) {
        const firstPending = next.steps.find((sr) => sr.status === "pending");
        setCursor(next.case_id, firstPending ? firstPending.step : next.steps[0].step);
        return;
      }
    }
    // No pending left — leave cursor where it is.
  }

  async function mark(status: StepStatus) {
    setError(null);
    setBusy(true);
    try {
      const updated = await api.markStep(currentCase!.case_id, cursorStep!, status);
      patchSession(updated);
      if (status !== "pending") advanceCursor(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCapture() {
    setError(null);
    setBusy(true);
    try {
      const result = await api.captureStep(cursorCaseId!, cursorStep!);
      patchSession(result.session);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePasteText() {
    setError(null);
    setBusy(true);
    try {
      const updated = await api.pasteClipboardToStep(
        cursorCaseId!,
        cursorStep!,
      );
      patchSession(updated);
      const marked = await api.markStep(cursorCaseId!, cursorStep!, "passed");
      patchSession(marked);
      advanceCursor(marked);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleAttachFile() {
    setError(null);
    setBusy(true);
    try {
      const picked = await openDialog({
        directory: false,
        multiple: false,
        title: t("sessionRunner.attachFileTitle", "Adjuntar archivo como evidencia"),
      });
      if (!picked || typeof picked !== "string") {
        setBusy(false);
        return;
      }
      const updated = await api.attachStepFile(
        cursorCaseId!,
        cursorStep!,
        picked,
      );
      patchSession(updated);
      const marked = await api.markStep(cursorCaseId!, cursorStep!, "passed");
      patchSession(marked);
      advanceCursor(marked);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEvidence(
    caseId: string,
    step: number,
    matchKey:
      | { kind: "path"; path: string }
      | { kind: "text"; captured_at: string },
  ) {
    if (!sessionDir) return;
    setError(null);
    setBusy(true);
    try {
      await api.deleteStepEvidence(sessionDir, caseId, step, matchKey);
      const fresh = await api.getActiveSession();
      if (fresh) patchSession(fresh.session);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd() {
    setBusy(true);
    try {
      const dirSnapshot = sessionDir;
      const projectSnapshot = projectPath;
      await api.endSession();
      // Generate and open the HTML report before clearing the session.
      if (projectSnapshot && dirSnapshot) {
        try {
          const reportPath = await api.exportReport(
            projectSnapshot,
            dirSnapshot,
          );
          try {
            await api.openPath(reportPath);
          } catch (openErr) {
            console.warn("openPath failed, report saved at:", reportPath, openErr);
          }
        } catch (e) {
          setError(t("sessionRunner.reportError", "No se pudo generar el reporte HTML: {{error}}", { error: e }));
        }
      }
      setActiveSession(null, null);
      clearCursor();
      setConfirmEnd(false);
      navigate("/project/sessions", { replace: true });
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  // Reassign on every render so the hotkey listener always sees the
  // freshest cursor + handlers.
  hotkeyHandlerRef.current = async (kind: HotkeyKind) => {
    if (busy) return;
    switch (kind) {
      case "capture-and-advance": {
        try {
          const result = await api.captureStep(cursorCaseId!, cursorStep!);
          patchSession(result.session);
          const updated = await api.markStep(cursorCaseId!, cursorStep!, "passed");
          patchSession(updated);
          advanceCursor(updated);
        } catch (e) {
          setError(String(e));
        }
        break;
      }
      case "paste-text-and-advance":
        await handlePasteText();
        break;
      case "attach-file-and-advance":
        await handleAttachFile();
        break;
      case "mark-pass":
        await mark("passed");
        break;
      case "mark-fail":
        await mark("failed");
        break;
      case "mark-blocked":
        await mark("blocked");
        break;
      case "end-session":
        setConfirmEnd(true);
        break;
    }
  };

  // Update the tray title with the current cursor: "TC-AUTH-003 · 1/3".
  useEffect(() => {
    const cur = session.case_results.find((c) => c.case_id === cursorCaseId);
    if (!cur) return;
    api
      .setTrayStatus(`${cursorCaseId} · ${cursorStep}/${cur.steps.length}`)
      .catch(() => {});
  }, [session, cursorCaseId, cursorStep]);

  // Clear the tray title when this view unmounts (session finished or user
  // navigated away).
  useEffect(() => {
    return () => {
      api.setTrayStatus(null).catch(() => {});
    };
  }, []);

  const totalSteps = session.case_results.reduce((a, c) => a + c.steps.length, 0);
  const doneSteps = session.case_results.reduce(
    (a, c) => a + c.steps.filter((s) => s.status !== "pending").length,
    0,
  );
  const passed = session.case_results.filter((c) => c.status === "passed").length;
  const failed = session.case_results.filter((c) => c.status === "failed").length;
  const blocked = session.case_results.filter((c) => c.status === "blocked").length;

  const caseIdx = session.case_results.findIndex((c) => c.case_id === cursorCaseId);
  const stepCountLabel = `${cursorStep}/${currentCase.steps.length}`;
  const caseProgressLabel = `${caseIdx + 1}/${session.case_results.length}`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        gridTemplateRows: "auto 1fr auto",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--adc-space-4) var(--adc-space-6)",
          borderBottom: "var(--adc-border-1)",
          background: "var(--adc-bg-bar)",
          color: "var(--adc-fg-on-bar)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--adc-space-4)",
          }}
        >
          <strong style={{ fontSize: "var(--adc-fs-md)" }}>
            {project.project_name}
          </strong>
          <code style={{ fontSize: "var(--adc-fs-sm)", opacity: 0.9 }}>
            {currentCase.case_id} · {caseProgressLabel} · {t("common.step", "paso")} {stepCountLabel}
          </code>
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--adc-space-4)",
            fontSize: "var(--adc-fs-sm)",
            alignItems: "center",
          }}
        >
          <span>
            {doneSteps}/{totalSteps} {t("common.steps", "pasos")}
          </span>
          <span style={{ opacity: 0.6 }}>·</span>
          <StatusIndicator variant="passed">{passed}</StatusIndicator>
          <StatusIndicator variant="failed">{failed}</StatusIndicator>
          <StatusIndicator variant="blocked">{blocked}</StatusIndicator>
          <Button
            variant="ghost"
            onClick={() => setConfirmEnd(true)}
            disabled={busy}
            style={{
              background: "transparent",
              borderColor: "var(--adc-fg-on-bar)",
              color: "var(--adc-fg-on-bar)",
            }}
          >
            {t("sessionRunner.endSession", "Terminar sesión")}
          </Button>
        </div>
      </header>

      <aside
        style={{
          borderRight: "var(--adc-border-1)",
          padding: "var(--adc-space-4)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--adc-space-2)",
          background: "var(--adc-bg-app)",
        }}
      >
        {session.case_results.map((cr) => {
          const isCurrent = cr.case_id === cursorCaseId;
          return (
            <button
              type="button"
              key={cr.case_id}
              onClick={() => {
                const firstPending = cr.steps.find((s) => s.status === "pending");
                setCursor(cr.case_id, (firstPending ?? cr.steps[0]).step);
              }}
              style={{
                textAlign: "left",
                padding: "10px 12px",
                border: "var(--adc-border-1)",
                background: isCurrent ? "var(--adc-accent-1)" : "var(--adc-bg-surface)",
                color: isCurrent ? "var(--adc-fg-on-bar)" : "var(--adc-fg)",
                borderRadius: "var(--adc-radius-sm)",
                cursor: busy ? "wait" : "pointer",
                fontFamily: "var(--adc-font-mono)",
                fontSize: "var(--adc-fs-sm)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: caseDotColor(cr.status),
                  flex: "0 0 8px",
                }}
              />
              <span
                style={{
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {cr.case_id}
              </span>
              <span
                style={{
                  fontSize: "var(--adc-fs-xs)",
                  fontVariantNumeric: "tabular-nums",
                  opacity: 0.85,
                }}
              >
                {cr.steps.filter((s) => s.status !== "pending").length}/{cr.steps.length}
              </span>
            </button>
          );
        })}
      </aside>

      <main
        style={{
          padding: "var(--adc-space-6)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--adc-space-4)",
        }}
      >
        {error && <Alert tone="error" title={t("common.error", "Error")}>{error}</Alert>}

        <div>
          <code style={{ fontSize: "var(--adc-fs-xs)", color: "var(--adc-fg-muted-strong)" }}>
            {baseCase.id}
          </code>
          <h2
            style={{ margin: "0", fontSize: "var(--adc-fs-2xl)", lineHeight: "var(--adc-lh-snug)" }}
          >
            {baseCase.title}
          </h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--adc-space-3)",
              alignItems: "center",
              marginTop: "var(--adc-space-2)",
            }}
          >
            <Pill tone="muted">{baseCase.module}</Pill>
            <StatusIndicator variant={CASE_STATUS_VARIANT[currentCase.status]}>
              {t(CASE_STATUS_LABEL[currentCase.status])}
            </StatusIndicator>
          </div>
        </div>

        {baseCase.preconditions && baseCase.preconditions.length > 0 && (
          <Card style={{ padding: "var(--adc-space-4)" }}>
            <div
              style={{
                fontSize: "var(--adc-fs-xs)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--adc-fg-muted-strong)",
                marginBottom: 4,
              }}
            >
              {t("caseEditor.preconditions", "Precondiciones")}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--adc-fs-sm)" }}>
              {baseCase.preconditions.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </Card>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-2)" }}>
          {currentCase.steps.map((sr) => {
            const def = baseCase.steps.find((s) => s.step === sr.step);
            if (!def) return null;
            const isCurrent = sr.step === cursorStep;
            return (
              <Card
                key={sr.step}
                onClick={() => setCursor(currentCase.case_id, sr.step)}
                style={{
                  padding: "var(--adc-space-3)",
                  cursor: "pointer",
                  border: isCurrent ? "2px solid var(--adc-accent-2)" : "var(--adc-border-1)",
                  display: "flex",
                  gap: "var(--adc-space-3)",
                  alignItems: "flex-start",
                  opacity: sr.status === "pending" && !isCurrent ? 0.85 : 1,
                }}
              >
                <div
                  className="adc-num"
                  style={{
                    minWidth: 24,
                    fontWeight: "var(--adc-fw-bold)",
                    color: isCurrent ? "var(--adc-accent-1)" : "var(--adc-fg-muted-strong)",
                  }}
                >
                  {sr.step}
                </div>
                <div style={{ flex: 1, fontSize: "var(--adc-fs-sm)" }}>
                  <div style={{ fontWeight: "var(--adc-fw-bold)" }}>{def.action}</div>
                  <div style={{ color: "var(--adc-fg-muted-strong)", marginTop: 2 }}>
                    {def.expected}
                  </div>
                  {sessionDir && (
                    <StepEvidenceStrip
                      step={sr}
                      sessionDir={sessionDir}
                      caseId={currentCase.case_id}
                      onDelete={handleDeleteEvidence}
                    />
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 4,
                  }}
                >
                  <StatusIndicator variant={STEP_STATUS_VARIANT[sr.status]}>
                    {t(STEP_STATUS_LABEL[sr.status])}
                  </StatusIndicator>
                </div>
              </Card>
            );
          })}
        </div>
      </main>

      <footer
        style={{
          gridColumn: "1 / -1",
          padding: "var(--adc-space-4) var(--adc-space-6)",
          borderTop: "var(--adc-border-1)",
          display: "flex",
          gap: "var(--adc-space-3)",
          alignItems: "center",
          background: "var(--adc-bg-surface)",
        }}
      >
        <Button
          variant="primary"
          onClick={handleCapture}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Camera size={14} /> {t("caseDetail.capture", "Capturar")}
        </Button>
        <Button
          variant="secondary"
          onClick={handlePasteText}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <ClipboardPaste size={14} /> {t("sessionRunner.pasteText", "Pegar texto")}
        </Button>
        <Button
          variant="secondary"
          onClick={handleAttachFile}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Paperclip size={14} /> {t("sessionRunner.attachFile", "Adjuntar archivo")}
        </Button>
        <span
          style={{ flex: 1, fontSize: "var(--adc-fs-xs)", color: "var(--adc-fg-muted-strong)" }}
        >
          {t("sessionRunner.markCurrentStep", "Marca el paso actual:")}
        </span>
        <Button
          variant="secondary"
          onClick={() => mark("passed")}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Check size={14} /> Pass
        </Button>
        <Button
          variant="danger"
          onClick={() => mark("failed")}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <X size={14} /> Fail
        </Button>
        <Button
          variant="ghost"
          onClick={() => mark("blocked")}
          disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Square size={14} /> Blocked
        </Button>
      </footer>

      <Modal
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title={t("sessionRunner.endSession", "Terminar sesión")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
              {t("common.cancel", "Cancelar")}
            </Button>
            <Button variant="danger" onClick={handleEnd} disabled={busy}>
              {t("sessionRunner.finish", "Terminar")}
            </Button>
          </>
        }
      >
        <p dangerouslySetInnerHTML={{ __html: t("sessionRunner.endSessionDesc", "{{done}} de {{total}} pasos completados. Los pasos sin marcar quedarán como <code>pending</code> en session.json.", { done: doneSteps, total: totalSteps }) }} />
      </Modal>
    </div>
  );
}

// ----- Evidence strip (inline thumbnails inside each step card) -----------

function StepEvidenceStrip({
  step,
  sessionDir,
  caseId,
  onDelete,
}: {
  step: StepResult;
  sessionDir: string;
  caseId: string;
  onDelete: (
    caseId: string,
    step: number,
    matchKey:
      | { kind: "path"; path: string }
      | { kind: "text"; captured_at: string },
  ) => void;
}) {
  const { t } = useTranslation();
  const items = mergedEvidence(step);
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
      {items.map((it, i) => {
        const matchKey = it.kind === "text"
          ? ({ kind: "text", captured_at: it.captured_at } as const)
          : ({ kind: "path", path: it.path } as const);
        const remove = (e: React.MouseEvent) => {
          e.stopPropagation();
          onDelete(caseId, step.step, matchKey);
        };
        switch (it.kind) {
          case "screenshot":
            return (
              <Removable key={`s-${i}`} onRemove={remove}>
                <img
                  src={convertFileSrc(`${sessionDir}/${it.path}`, "asset")}
                  alt={t("sessionRunner.screenshotAlt", "paso {{step}} captura", { step: step.step })}
                  style={{
                    width: 110,
                    height: 70,
                    objectFit: "cover",
                    border: "var(--adc-border-1)",
                    borderRadius: "var(--adc-radius-sm)",
                    display: "block",
                  }}
                />
              </Removable>
            );
          case "text":
            return (
              <Removable key={`t-${i}`} onRemove={remove}>
                <div
                  style={{
                    maxWidth: 220,
                    padding: "6px 8px",
                    border: "var(--adc-border-1)",
                    borderRadius: "var(--adc-radius-sm)",
                    background: "var(--adc-bg-surface)",
                    fontSize: "var(--adc-fs-xs)",
                    color: "var(--adc-fg-muted-strong)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                  title={it.content}
                >
                  <FileText size={12} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.content.slice(0, 40)}
                    {it.content.length > 40 ? "…" : ""}
                  </span>
                </div>
              </Removable>
            );
          case "file":
            return (
              <Removable key={`f-${i}`} onRemove={remove}>
                <div
                  style={{
                    padding: "6px 8px",
                    border: "var(--adc-border-1)",
                    borderRadius: "var(--adc-radius-sm)",
                    background: "var(--adc-bg-surface)",
                    fontSize: "var(--adc-fs-xs)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  title={`${it.filename}${it.mime ? ` (${it.mime})` : ""}`}
                >
                  <Paperclip size={12} />
                  <span
                    style={{
                      maxWidth: 180,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {it.filename}
                  </span>
                </div>
              </Removable>
            );
        }
      })}
    </div>
  );
}

function Removable({
  onRemove,
  children,
}: {
  onRemove: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("caseDetail.removeEvidence", "Quitar evidencia")}
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          border: 0,
          background: "rgba(0,0,0,0.55)",
          color: "white",
          borderRadius: 4,
          padding: 2,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
        }}
      >
        <X size={10} />
      </button>
    </div>
  );
}

/**
 * Merge `evidence_items` (new typed) with legacy `evidence_paths` not already
 * represented. Returns items in original order — typed first, then any
 * leftover legacy screenshot paths.
 */
function mergedEvidence(sr: StepResult): EvidenceItem[] {
  const items = sr.evidence_items ?? [];
  const seenPaths = new Set<string>();
  for (const it of items) {
    if (it.kind === "screenshot" || it.kind === "file") {
      seenPaths.add(it.path);
    }
  }
  const out: EvidenceItem[] = [...items];
  for (const rel of sr.evidence_paths ?? []) {
    if (seenPaths.has(rel)) continue;
    out.push({
      kind: "screenshot",
      path: rel,
      captured_at: sr.captured_at ?? new Date().toISOString(),
    });
  }
  return out;
}
