import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Alert, Button, Card, EmptyState, Modal, Pill, StatusIndicator } from "@adc-ui/components";
import {
  Camera,
  ChevronLeft,
  ClipboardCopy,
  FileText as FileTextIcon,
  Paperclip,
  Pencil,
  X,
} from "lucide-react";
import { useCasesStore, useProjectStore, useSessionStore } from "@/lib/store";
import { onCasesChanged } from "@/lib/events";
import { api } from "@/lib/tauri";
import {
  EVIDENCE_HINT_LABEL,
  PRIORITY_LABEL,
  STEP_STATUS_LABEL,
  STEP_STATUS_VARIANT,
  TYPE_LABEL,
} from "@/lib/labels";
import type { CaseEvidenceFromSession, ResolvedEvidence, StepStatus } from "@/lib/types";
import { useTranslation } from "react-i18next";

interface EvidenceWithContext {
  item: ResolvedEvidence;
  sessionId: string;
  sessionDir: string;
  sessionStartedAt: string;
  stepStatus: StepStatus;
  index: number;
}

type LightboxState =
  | { kind: "image"; src: string; caption: string }
  | { kind: "text"; content: string; caption: string };

function formatDateTime(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function CaseDetail() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { caseId } = useParams<{ caseId: string }>();
  const cases = useCasesStore((s) => s.cases);
  const projectPath = useProjectStore((s) => s.currentPath);
  const session = useSessionStore((s) => s.session);
  const patchSession = useSessionStore((s) => s.patchSession);

  const decoded = caseId ? decodeURIComponent(caseId) : "";
  const found = useMemo(
    () => cases.find((lc) => lc.case.id === decoded) ?? null,
    [cases, decoded],
  );

  const [provisional, setProvisional] = useState<Record<number, string[]>>({});
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    {
      sessionDir: string;
      caseId: string;
      step: number;
      label: string;
      matchKey:
        | { kind: "path"; path: string }
        | { kind: "text"; captured_at: string };
    } | null
  >(null);
  const [editText, setEditText] = useState<
    {
      sessionDir: string;
      caseId: string;
      step: number;
      capturedAt: string;
      content: string;
    } | null
  >(null);
  const [busyEvidence, setBusyEvidence] = useState(false);
  const [evidenceBySession, setEvidenceBySession] = useState<
    CaseEvidenceFromSession[]
  >([]);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const sessionHasThisCase = !!session && session.case_results.some((c) => c.case_id === decoded);

  const refreshEvidence = useCallback(async () => {
    if (!projectPath || !decoded) return;
    try {
      const list = await api.listCaseEvidence(projectPath, decoded);
      setEvidenceBySession(list);
    } catch {
      /* swallow — panel just stays empty */
    }
  }, [projectPath, decoded]);

  useEffect(() => {
    refreshEvidence();
  }, [refreshEvidence]);

  // Re-fetch when the active session updates (a capture in SessionRunner
  // writes session.json from Rust, but we also want to mirror the new
  // evidence into this view immediately).
  useEffect(() => {
    refreshEvidence();
  }, [session, refreshEvidence]);

  // Re-fetch on filesystem-level changes the project watcher emits.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    onCasesChanged(() => {
      if (!cancelled) refreshEvidence();
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [refreshEvidence]);

  // Close lightbox on Escape.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  /** Flat per-step evidence index, newest sessions first. */
  const evidenceByStep = useMemo<Record<number, EvidenceWithContext[]>>(() => {
    const out: Record<number, EvidenceWithContext[]> = {};
    for (const sess of evidenceBySession) {
      for (const step of sess.steps) {
        const arr = out[step.step] ?? (out[step.step] = []);
        step.evidence_items.forEach((item, i) => {
          arr.push({
            item,
            sessionId: sess.session_id,
            sessionDir: sess.session_dir,
            sessionStartedAt: sess.started_at,
            stepStatus: step.status,
            index: i + 1,
          });
        });
      }
    }
    for (const k of Object.keys(out)) {
      out[Number(k)].sort((a, b) => b.sessionStartedAt.localeCompare(a.sessionStartedAt));
    }
    return out;
  }, [evidenceBySession]);

  async function handleCapture(stepNumber: number) {
    setCaptureError(null);
    setCapturing(stepNumber);
    try {
      if (sessionHasThisCase) {
        const result = await api.captureStep(decoded, stepNumber);
        patchSession(result.session);
      } else {
        const path = await api.captureRegion();
        setProvisional((prev) => ({
          ...prev,
          [stepNumber]: [...(prev[stepNumber] ?? []), path],
        }));
      }
      refreshEvidence();
    } catch (e) {
      setCaptureError(String(e));
    } finally {
      setCapturing(null);
    }
  }

  function removeProvisional(stepNumber: number, idx: number) {
    setProvisional((prev) => ({
      ...prev,
      [stepNumber]: (prev[stepNumber] ?? []).filter((_, i) => i !== idx),
    }));
  }

  async function performDelete() {
    if (!confirmDelete) return;
    setBusyEvidence(true);
    try {
      await api.deleteStepEvidence(
        confirmDelete.sessionDir,
        confirmDelete.caseId,
        confirmDelete.step,
        confirmDelete.matchKey,
      );
      // If this is the active session, refresh the in-memory state too.
      const fresh = await api.getActiveSession();
      if (fresh) patchSession(fresh.session);
      await refreshEvidence();
      setConfirmDelete(null);
    } catch (e) {
      setCaptureError(String(e));
    } finally {
      setBusyEvidence(false);
    }
  }

  async function saveEditText() {
    if (!editText) return;
    setBusyEvidence(true);
    try {
      await api.updateStepTextEvidence(
        editText.sessionDir,
        editText.caseId,
        editText.step,
        editText.capturedAt,
        editText.content,
      );
      const fresh = await api.getActiveSession();
      if (fresh) patchSession(fresh.session);
      await refreshEvidence();
      setEditText(null);
    } catch (e) {
      setCaptureError(String(e));
    } finally {
      setBusyEvidence(false);
    }
  }

  if (!found) {
    return (
      <main style={{ padding: "var(--adc-space-6)" }}>
        <Button
          variant="ghost"
          onClick={() => navigate("/project/cases")}
          style={{
            marginBottom: "var(--adc-space-4)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <ChevronLeft size={14} /> {t("caseList.title", "Casos")}
        </Button>
        <EmptyState
          glyph="∅"
          title={t("caseDetail.notFound", "Caso no encontrado")}
          description={decoded ? t("caseDetail.notFoundDesc", "No hay un caso con id {{id}}", { id: decoded }) : t("caseDetail.invalidId", "ID inválido")}
        />
      </main>
    );
  }

  const c = found.case;

  return (
    <main
      style={{
        padding: "var(--adc-space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--adc-space-5)",
        maxWidth: 880,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Button
          variant="ghost"
          onClick={() => navigate("/project/cases")}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft size={14} /> {t("caseList.title", "Casos")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate(`/project/cases/${encodeURIComponent(c.id)}/edit`)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Pencil size={14} /> {t("common.edit", "Editar")}
        </Button>
      </div>

      <header style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-3)" }}>
        <code style={{ fontSize: "var(--adc-fs-xs)", color: "var(--adc-fg-muted-strong)" }}>
          {c.id}
        </code>
        <h2
          style={{
            margin: 0,
            fontSize: "var(--adc-fs-xl)",
            lineHeight: "var(--adc-lh-snug)",
          }}
        >
          {c.title}
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--adc-space-2)" }}>
          <Pill tone="muted">{c.module}</Pill>
          <Pill>{t(TYPE_LABEL[c.type])}</Pill>
          <Pill tone={c.priority === "critical" ? "err" : "default"}>
            {t(PRIORITY_LABEL[c.priority])}
          </Pill>
          {typeof c.estimated_minutes === "number" && (
            <Pill tone="count">{t("caseDetail.minutes", "{{count}} min", { count: c.estimated_minutes })}</Pill>
          )}
        </div>
        {(c.tags?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {c.tags!.map((t) => (
              <span key={t} className="adc-chip" style={{ cursor: "default" }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      {c.preconditions && c.preconditions.length > 0 && (
        <section>
          <SectionTitle>{t("caseEditor.preconditions", "Precondiciones")}</SectionTitle>
          <Card style={{ padding: "var(--adc-space-4)" }}>
            <ul
              style={{
                margin: 0,
                paddingLeft: 20,
                display: "flex",
                flexDirection: "column",
                gap: "var(--adc-space-2)",
              }}
            >
              {c.preconditions.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>{t("common.steps", "Pasos")}</SectionTitle>
        {captureError && (
          <Alert tone="error" title={t("caseDetail.captureFailed", "Captura falló")}>
            {captureError}
          </Alert>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-3)" }}>
          {c.steps.map((step) => {
            const stepEvidence = evidenceByStep[step.step] ?? [];
            const stepProvisional = provisional[step.step] ?? [];
            return (
              <Card
                key={step.step}
                style={{
                  padding: "var(--adc-space-4)",
                  display: "flex",
                  gap: "var(--adc-space-4)",
                  alignItems: "flex-start",
                }}
              >
                <div
                  className="adc-num"
                  style={{
                    minWidth: 28,
                    fontWeight: "var(--adc-fw-bold)",
                    fontSize: "var(--adc-fs-md)",
                    color: "var(--adc-accent-1)",
                  }}
                >
                  {step.step}
                </div>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--adc-space-2)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: "var(--adc-fw-bold)", fontSize: "var(--adc-fs-sm)" }}>
                      {t("caseEditor.action", "Acción")}
                    </div>
                    <div style={{ fontSize: "var(--adc-fs-sm)" }}>{step.action}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: "var(--adc-fw-bold)", fontSize: "var(--adc-fs-sm)" }}>
                      {t("caseEditor.expected", "Esperado")}
                    </div>
                    <div
                      style={{ fontSize: "var(--adc-fs-sm)", color: "var(--adc-fg-muted-strong)" }}
                    >
                      {step.expected}
                    </div>
                  </div>
                  {step.data && (
                    <details>
                      <summary
                        style={{
                          fontSize: "var(--adc-fs-xs)",
                          color: "var(--adc-fg-muted-strong)",
                          cursor: "pointer",
                        }}
                      >
                        {t("caseDetail.data", "Datos")}
                      </summary>
                      <pre
                        className="adc-code"
                        style={{ marginTop: 6, padding: 10, fontSize: "var(--adc-fs-xs)" }}
                      >
                        {JSON.stringify(step.data, null, 2)}
                      </pre>
                    </details>
                  )}

                  {(stepEvidence.length > 0 || stepProvisional.length > 0) && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "var(--adc-space-3)",
                        marginTop: "var(--adc-space-2)",
                      }}
                    >
                      {stepEvidence.map((ev) => {
                        const matchKeyForItem = matchKeyOf(ev.item);
                        const itemLabel = t(labelOf(ev.item));
                        return (
                          <EvidenceCard
                            key={`${ev.sessionId}-${ev.index}`}
                            ev={ev}
                            caption={`${c.id} · ${t("common.step", "paso")} ${step.step} · ${
                              formatDateTime(
                                ev.item.captured_at ?? ev.sessionStartedAt,
                              )
                            }`}
                            openLightbox={setLightbox}
                            onDelete={() =>
                              setConfirmDelete({
                                sessionDir: ev.sessionDir,
                                caseId: c.id,
                                step: step.step,
                                label: itemLabel,
                                matchKey: matchKeyForItem,
                              })}
                            onEdit={ev.item.kind === "text"
                              ? () =>
                                setEditText({
                                  sessionDir: ev.sessionDir,
                                  caseId: c.id,
                                  step: step.step,
                                  capturedAt: ev.item.captured_at,
                                  content: ev.item.kind === "text" ? ev.item.content : "",
                                })
                              : undefined}
                          />
                        );
                      })}
                      {stepProvisional.map((path, idx) => (
                        <ProvisionalThumb
                          key={`prov-${idx}`}
                          path={path}
                          stepNumber={step.step}
                          caseId={c.id}
                          openLightbox={setLightbox}
                          onRemove={() => removeProvisional(step.step, idx)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    alignItems: "flex-end",
                  }}
                >
                  <Pill tone="muted">
                    {t(EVIDENCE_HINT_LABEL[step.evidence_hint ?? "none"])}
                  </Pill>
                  <Button
                    variant="secondary"
                    onClick={() => handleCapture(step.step)}
                    disabled={capturing !== null}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Camera size={14} />
                    {capturing === step.step ? "…" : t("caseDetail.capture", "Capturar")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
        <p
          style={{
            fontSize: "var(--adc-fs-xs)",
            color: "var(--adc-fg-muted-strong)",
            margin: "var(--adc-space-3) 0 0",
          }}
        >
          {sessionHasThisCase
            ? t("caseDetail.activeSessionHint", "Hay una sesión activa con este caso — capturar aquí persiste en .qastor-runs/.")
            : t("caseDetail.noSessionHint", "Sin sesión activa, las capturas son provisionales (tempdir). Inicia una sesión desde Casos para persistirlas.")}
        </p>
      </section>

      <section>
        <SectionTitle>{t("caseEditor.acceptanceCriteria", "Criterios de aceptación")}</SectionTitle>
        <Card style={{ padding: "var(--adc-space-4)" }}>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              display: "flex",
              flexDirection: "column",
              gap: "var(--adc-space-2)",
            }}
          >
            {c.acceptance_criteria.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Card>
      </section>

      {(c.related_files?.length ?? 0) > 0 && (
        <section>
          <SectionTitle>{t("caseEditor.relatedFiles", "Archivos relacionados")}</SectionTitle>
          <Card style={{ padding: "var(--adc-space-4)" }}>
            <ul
              style={{
                margin: 0,
                paddingLeft: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              {c.related_files!.map((p) => (
                <li key={p}>
                  <code style={{ fontSize: "var(--adc-fs-xs)" }}>{p}</code>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>{t("caseDetail.origin", "Origen")}</SectionTitle>
        <Alert tone="info" title={t("caseDetail.diskPath", "Path en disco")}>
          <code style={{ wordBreak: "break-all" }}>{found.path}</code>
        </Alert>
      </section>

      {lightbox && <Lightbox state={lightbox} onClose={() => setLightbox(null)} />}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t("caseDetail.removeEvidence", "Quitar evidencia")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              {t("common.cancel", "Cancelar")}
            </Button>
            <Button variant="danger" onClick={performDelete} disabled={busyEvidence}>
              {t("common.remove", "Quitar")}
            </Button>
          </>
        }
      >
        <p>
          {confirmDelete
            ? t("caseDetail.removeEvidenceDesc", "Vas a quitar la {{label}} del paso {{step}}. Si es captura o archivo, también se borra del disco.", { label: confirmDelete.label, step: confirmDelete.step })
            : ""}
        </p>
      </Modal>

      <Modal
        open={!!editText}
        onClose={() => setEditText(null)}
        title={t("caseDetail.editText", "Editar texto")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditText(null)}>
              {t("common.cancel", "Cancelar")}
            </Button>
            <Button variant="primary" onClick={saveEditText} disabled={busyEvidence}>
              {t("common.save", "Guardar")}
            </Button>
          </>
        }
      >
        {editText && (
          <textarea
            className="adc-textarea"
            value={editText.content}
            onChange={(e) => setEditText({ ...editText, content: e.target.value })}
            rows={10}
            style={{
              width: "100%",
              fontFamily: "var(--adc-font-mono)",
              fontSize: "var(--adc-fs-sm)",
            }}
            autoFocus
          />
        )}
      </Modal>
    </main>
  );
}

// ----- Helpers --------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: "var(--adc-fs-sm)",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: "var(--adc-fg-muted-strong)",
        margin: "0 0 var(--adc-space-3)",
      }}
    >
      {children}
    </h3>
  );
}

function EvidenceCard({
  ev,
  caption,
  openLightbox,
  onDelete,
  onEdit,
}: {
  ev: EvidenceWithContext;
  caption: string;
  openLightbox: (s: LightboxState) => void;
  onDelete: () => void;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  switch (ev.item.kind) {
    case "screenshot": {
      const src = convertFileSrc(ev.item.path, "asset");
      return (
        <ThumbFrame
          status={ev.stepStatus}
          captionTop={caption}
          onClick={() => openLightbox({ kind: "image", src, caption })}
          onDelete={onDelete}
        >
          <img
            src={src}
            alt={caption}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        </ThumbFrame>
      );
    }
    case "text":
      return (
        <CardFrame
          status={ev.stepStatus}
          captionTop={ev.item.label ?? t("caseDetail.text", "Texto")}
          onClick={() =>
            openLightbox({
              kind: "text",
              content: ev.item.kind === "text" ? ev.item.content : "",
              caption,
            })}
          icon={<FileTextIcon size={16} />}
          onDelete={onDelete}
          onEdit={onEdit}
        >
          <div
            style={{
              padding: "8px 10px",
              fontSize: "var(--adc-fs-xs)",
              color: "var(--adc-fg)",
              fontFamily: "var(--adc-font-mono)",
              lineHeight: 1.4,
              maxHeight: 70,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical" as const,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {ev.item.content}
          </div>
        </CardFrame>
      );
    case "file":
      return (
        <CardFrame
          status={ev.stepStatus}
          captionTop={ev.item.filename}
          onClick={() => api.openPath(ev.item.kind === "file" ? ev.item.path : "").catch(() => {})}
          icon={<Paperclip size={16} />}
          onDelete={onDelete}
        >
          <div
            style={{
              padding: "8px 10px",
              fontSize: "var(--adc-fs-xs)",
              color: "var(--adc-fg-muted-strong)",
            }}
          >
            {ev.item.mime ?? t("caseDetail.file", "archivo")}
            {ev.item.size_bytes ? ` · ${humanBytes(ev.item.size_bytes)}` : ""}
          </div>
        </CardFrame>
      );
  }
}

function matchKeyOf(
  item: ResolvedEvidence,
):
  | { kind: "path"; path: string }
  | { kind: "text"; captured_at: string } {
  switch (item.kind) {
    case "screenshot":
    case "file":
      return { kind: "path", path: item.relative_path };
    case "text":
      return { kind: "text", captured_at: item.captured_at };
  }
}

function labelOf(item: ResolvedEvidence): string {
  switch (item.kind) {
    case "screenshot":
      return "caseDetail.labelScreenshot";
    case "text":
      return "caseDetail.labelTextSnippet";
    case "file":
      return `caseDetail.labelFile`; // We'll pass it to t() like t("caseDetail.labelFile", { name: item.filename }) later. Wait, this returns a string. Let's return just the key and handle it in the caller.
  }
}

function ProvisionalThumb({
  path,
  stepNumber,
  caseId,
  openLightbox,
  onRemove,
}: {
  path: string;
  stepNumber: number;
  caseId: string;
  openLightbox: (s: LightboxState) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const src = convertFileSrc(path, "asset");
  const caption = `${caseId} · ${t("common.step", "paso")} ${stepNumber} · ${t("caseDetail.provisional", "provisional")}`;
  return (
    <ThumbFrame
      status="pending"
      captionTop={t("caseDetail.provisional", "provisional")}
      onClick={() => openLightbox({ kind: "image", src, caption })}
      onRemove={onRemove}
    >
      <img
        src={src}
        alt={caption}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </ThumbFrame>
  );
}

function ThumbFrame({
  status,
  captionTop,
  onClick,
  onDelete,
  onRemove,
  children,
}: {
  status: StepStatus;
  captionTop: string;
  onClick: () => void;
  onDelete?: () => void;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        position: "relative",
        width: 160,
        height: 100,
        borderRadius: "var(--adc-radius-sm)",
        overflow: "hidden",
        border: "var(--adc-border-1)",
        background: "var(--adc-bg-surface)",
        cursor: "zoom-in",
      }}
      onClick={onClick}
      role="button"
      aria-label={t("caseDetail.viewFullImage", "Ver captura completa")}
    >
      {children}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "4px 6px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          color: "var(--adc-surface)",
          fontSize: "var(--adc-fs-xs)",
          fontFamily: "var(--adc-font-mono)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <span
          style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", flex: 1 }}
        >
          {captionTop}
        </span>
        <StatusIndicator variant={STEP_STATUS_VARIANT[status]}>
          {t(STEP_STATUS_LABEL[status])}
        </StatusIndicator>
      </div>
      {(onRemove || onDelete) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            (onRemove ?? onDelete)?.();
          }}
          aria-label={t("common.remove", "Quitar")}
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            border: 0,
            background: "rgba(0,0,0,0.55)",
            color: "white",
            borderRadius: 4,
            padding: 3,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

function CardFrame({
  status,
  captionTop,
  onClick,
  onDelete,
  onEdit,
  icon,
  children,
}: {
  status: StepStatus;
  captionTop: string;
  onClick: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={captionTop}
      style={{
        width: 220,
        minHeight: 100,
        borderRadius: "var(--adc-radius-sm)",
        border: "var(--adc-border-1)",
        background: "var(--adc-bg-surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          background: "var(--adc-bg-card)",
          borderBottom: "1px solid var(--adc-accent-1)",
          fontSize: "var(--adc-fs-xs)",
          fontWeight: "var(--adc-fw-bold)",
          color: "var(--adc-fg)",
        }}
      >
        {icon}
        <span
          style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
        >
          {captionTop}
        </span>
        <StatusIndicator variant={STEP_STATUS_VARIANT[status]}>
          {t(STEP_STATUS_LABEL[status])}
        </StatusIndicator>
      </div>
      <button
        type="button"
        onClick={onClick}
        style={{
          flex: 1,
          minHeight: 60,
          background: "transparent",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
          padding: 0,
          color: "inherit",
          font: "inherit",
        }}
        aria-label={t("caseDetail.viewEvidence", "Ver evidencia")}
      >
        {children}
      </button>
      {(onEdit || onDelete) && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 4,
            padding: 4,
            borderTop: "1px solid var(--adc-accent-1)",
            background: "var(--adc-bg-app)",
          }}
        >
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={t("common.edit", "Editar")}
              className="adc-btn adc-btn--ghost"
              style={{ height: "var(--adc-h-sm)", fontSize: 11, padding: "0 8px" }}
            >
              {t("common.edit", "Editar")}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={t("common.remove", "Quitar")}
              className="adc-btn adc-btn--ghost"
              style={{ height: "var(--adc-h-sm)", fontSize: 11, padding: "0 8px" }}
            >
              {t("common.remove", "Quitar")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function humanBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

function Lightbox({
  state,
  onClose,
}: {
  state: LightboxState;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(37, 50, 7, 0.92)",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--adc-space-4)",
        padding: "var(--adc-space-6)",
        cursor: state.kind === "image" ? "zoom-out" : "default",
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={t("common.close", "Cerrar")}
        className="adc-btn adc-btn--ghost"
        style={{
          position: "absolute",
          top: "var(--adc-space-5)",
          right: "var(--adc-space-5)",
          background: "var(--adc-bg-surface)",
          color: "var(--adc-fg)",
        }}
      >
        <X size={14} />
      </button>

      {state.kind === "image"
        ? (
          <img
            src={state.src}
            alt={state.caption}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "calc(100vh - 160px)",
              objectFit: "contain",
              border: "var(--adc-border-1)",
              borderRadius: "var(--adc-radius-md)",
              background: "var(--adc-bg-surface)",
              cursor: "default",
            }}
          />
        )
        : (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--adc-bg-surface)",
              border: "var(--adc-border-1)",
              borderRadius: "var(--adc-radius-md)",
              padding: "var(--adc-space-5)",
              maxWidth: "min(900px, 100%)",
              maxHeight: "calc(100vh - 220px)",
              overflow: "auto",
              position: "relative",
              cursor: "default",
            }}
          >
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(state.content).catch(() => {});
              }}
              className="adc-btn adc-btn--ghost"
              style={{
                position: "sticky",
                top: 0,
                float: "right",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginLeft: 8,
              }}
            >
              <ClipboardCopy size={14} /> {t("common.copy", "Copiar")}
            </button>
            <pre
              style={{
                margin: 0,
                fontFamily: "var(--adc-font-mono)",
                fontSize: "var(--adc-fs-sm)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: "var(--adc-fg)",
              }}
            >
            {state.content}
            </pre>
          </div>
        )}

      <div
        style={{
          color: "var(--adc-surface)",
          fontFamily: "var(--adc-font-mono)",
          fontSize: "var(--adc-fs-sm)",
          textAlign: "center",
          maxWidth: 720,
        }}
      >
        {state.caption}
      </div>
    </div>
  );
}
