import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, EmptyState, StatusIndicator } from "@adc-ui/components";
import { FileText, Folder } from "lucide-react";
import { useProjectStore } from "@/lib/store";
import { api } from "@/lib/tauri";
import { formatPercent, sessionOutcome, type SessionOverall } from "@/lib/labels";
import type { SessionRef } from "@/lib/types";

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuration(startIso: string, endIso: string): string {
  try {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (ms < 0 || !Number.isFinite(ms)) return "";
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const restS = sec % 60;
    if (min < 60) return restS ? `${min}m ${restS}s` : `${min}m`;
    const h = Math.floor(min / 60);
    const restM = min % 60;
    return restM ? `${h}h ${restM}m` : `${h}h`;
  } catch {
    return "";
  }
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return "ahora";
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `hace ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `hace ${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h}h`;
    const d = Math.floor(h / 24);
    return `hace ${d}d`;
  } catch {
    return "";
  }
}

function statusBorderColor(overall: SessionOverall): string {
  switch (overall) {
    case "successful":
      return "var(--adc-accent-2)";
    case "failed":
      return "var(--adc-error)";
    case "blocked":
      return "var(--adc-warning)";
    case "in_progress":
      return "var(--adc-accent-1)";
    default:
      return "rgba(95, 112, 84, 0.4)";
  }
}

export default function SessionsHistory() {
  const projectPath = useProjectStore((s) => s.currentPath);
  const [sessions, setSessions] = useState<SessionRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.listSessions(projectPath);
      setSessions(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openReport(sess: SessionRef) {
    if (!projectPath) return;
    setBusyId(sess.session_id);
    setError(null);
    try {
      const reportPath = await api.exportReport(projectPath, sess.session_dir);
      await api.openPath(reportPath);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function openSessionDir(sess: SessionRef) {
    setError(null);
    try {
      await api.openPath(sess.session_dir);
    } catch (e) {
      setError(String(e));
    }
  }

  // Aggregate counts across the whole list.
  const aggregate = sessions.reduce(
    (acc, s) => {
      const o = sessionOutcome(s);
      if (o.overall === "successful") acc.successful += 1;
      else if (o.overall === "failed") acc.failed += 1;
      else if (o.overall === "blocked") acc.blocked += 1;
      else if (o.overall === "in_progress") acc.inProgress += 1;
      else acc.other += 1;
      return acc;
    },
    { successful: 0, failed: 0, blocked: 0, inProgress: 0, other: 0 },
  );

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
      <header
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
      >
        <h2 style={{ margin: 0, fontSize: "var(--adc-fs-2xl)" }}>Sesiones</h2>
        <span style={{ fontSize: "var(--adc-fs-sm)", color: "var(--adc-fg-muted-strong)" }}>
          {loading
            ? "cargando…"
            : `${sessions.length} ${sessions.length === 1 ? "sesión" : "sesiones"}`}
        </span>
      </header>

      {sessions.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--adc-space-5)",
            padding: "var(--adc-space-4) var(--adc-space-5)",
            border: "var(--adc-border-1)",
            borderRadius: "var(--adc-radius-md)",
            background: "var(--adc-bg-surface)",
            fontSize: "var(--adc-fs-sm)",
          }}
        >
          {aggregate.successful > 0 && (
            <StatusIndicator variant="passed">
              {aggregate.successful} exitosas
            </StatusIndicator>
          )}
          {aggregate.failed > 0 && (
            <StatusIndicator variant="failed">
              {aggregate.failed} con fallas
            </StatusIndicator>
          )}
          {aggregate.blocked > 0 && (
            <StatusIndicator variant="blocked">
              {aggregate.blocked} con bloqueos
            </StatusIndicator>
          )}
          {aggregate.inProgress > 0 && (
            <StatusIndicator variant="running">
              {aggregate.inProgress} en curso
            </StatusIndicator>
          )}
          {aggregate.other > 0 && (
            <StatusIndicator variant="pending">
              {aggregate.other} incompletas
            </StatusIndicator>
          )}
        </div>
      )}

      {error && (
        <Alert tone="error" title="Error">
          {error}
        </Alert>
      )}

      {!loading && sessions.length === 0
        ? (
          <EmptyState
            glyph="∅"
            title="Sin sesiones todavía"
            description="Cuando ejecutes una sesión, aparecerá aquí con su reporte y evidencia."
          />
        )
        : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--adc-space-3)",
            }}
          >
            {sessions.map((sess) => {
              const outcome = sessionOutcome(sess);
              const total = sess.case_count;
              const pending = total - sess.passed - sess.failed - sess.blocked;
              return (
                <Card
                  key={sess.session_id}
                  style={{
                    padding: "var(--adc-space-5)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--adc-space-4)",
                    borderLeft: `4px solid ${statusBorderColor(outcome.overall)}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "var(--adc-space-4)",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--adc-space-3)",
                          marginBottom: 4,
                          flexWrap: "wrap",
                        }}
                      >
                        <StatusIndicator variant={outcome.variant}>
                          {outcome.label}
                        </StatusIndicator>
                        <span
                          style={{
                            fontSize: "var(--adc-fs-md)",
                            fontWeight: "var(--adc-fw-bold)",
                          }}
                        >
                          {formatDateTime(sess.started_at)}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "var(--adc-fs-sm)",
                          color: "var(--adc-fg-muted-strong)",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "var(--adc-space-3)",
                          alignItems: "center",
                        }}
                      >
                        {sess.ended_at
                          ? (
                            <>
                              <span>
                                <span style={{ opacity: 0.7 }}>terminó</span>{" "}
                                {formatTime(sess.ended_at)}
                              </span>
                              <span style={{ opacity: 0.45 }}>·</span>
                              <span>
                                <span style={{ opacity: 0.7 }}>duró</span>{" "}
                                {formatDuration(sess.started_at, sess.ended_at) || "—"}
                              </span>
                            </>
                          )
                          : (
                            <span>
                              <span style={{ opacity: 0.7 }}>iniciada</span>{" "}
                              {formatRelative(sess.started_at)}
                            </span>
                          )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: "var(--adc-fs-xl)",
                          fontWeight: "var(--adc-fw-extrabold)",
                          color: "var(--adc-text)",
                          lineHeight: 1,
                        }}
                      >
                        {formatPercent(outcome.passRate)}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--adc-fs-sm)",
                          color: "var(--adc-fg-muted-strong)",
                          marginTop: 2,
                        }}
                      >
                        pasaron
                      </div>
                    </div>
                  </div>

                  {/* Stacked progress bar: pass / fail / blocked / pending */}
                  <div>
                    <div
                      className="adc-bar"
                      style={{
                        display: "flex",
                        overflow: "hidden",
                        background: "rgba(95,112,84,0.18)",
                        height: 10,
                      }}
                    >
                      {sess.passed > 0 && (
                        <span
                          style={{
                            width: `${(sess.passed / total) * 100}%`,
                            background: "var(--adc-accent-2)",
                            boxShadow: "inset 0 0 0 1px var(--adc-surface)",
                          }}
                        />
                      )}
                      {sess.failed > 0 && (
                        <span
                          style={{
                            width: `${(sess.failed / total) * 100}%`,
                            background: "var(--adc-error)",
                            boxShadow: "inset 0 0 0 1px var(--adc-surface)",
                          }}
                        />
                      )}
                      {sess.blocked > 0 && (
                        <span
                          style={{
                            width: `${(sess.blocked / total) * 100}%`,
                            background: "var(--adc-warning)",
                            boxShadow: "inset 0 0 0 1px var(--adc-surface)",
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "var(--adc-space-4)",
                        marginTop: 10,
                        fontSize: "var(--adc-fs-sm)",
                        color: "var(--adc-fg)",
                        alignItems: "center",
                      }}
                    >
                      <StatusIndicator variant="passed">
                        {sess.passed} pasaron
                      </StatusIndicator>
                      <StatusIndicator variant="failed">
                        {sess.failed} fallaron
                      </StatusIndicator>
                      <StatusIndicator variant="blocked">
                        {sess.blocked} bloqueados
                      </StatusIndicator>
                      {pending > 0 && (
                        <StatusIndicator variant="pending">
                          {pending} pendientes
                        </StatusIndicator>
                      )}
                      <span
                        style={{
                          marginLeft: "auto",
                          color: "var(--adc-fg-muted-strong)",
                        }}
                      >
                        {total} caso{total === 1 ? "" : "s"} · completado{" "}
                        {formatPercent(outcome.completion)}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                      gap: "var(--adc-space-2)",
                    }}
                  >
                    <Button
                      variant="ghost"
                      onClick={() => openSessionDir(sess)}
                      disabled={busyId === sess.session_id}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <Folder size={14} /> Abrir carpeta
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => openReport(sess)}
                      disabled={busyId === sess.session_id}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <FileText size={14} />
                      {busyId === sess.session_id ? "Generando…" : "Ver reporte"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
    </main>
  );
}
