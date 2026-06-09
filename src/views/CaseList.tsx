import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Checkbox, EmptyState, Pill, Table } from "@adc-ui/components";
import { Play, Plus, Search } from "lucide-react";
import { useCasesStore, useProjectStore, useSessionStore } from "@/lib/store";
import { api } from "@/lib/tauri";
import { PRIORITY_LABEL, TYPE_LABEL, TYPE_LABEL_SHORT } from "@/lib/labels";
import type { LoadedCase, Priority, TestType } from "@/lib/types";
import { useTranslation } from "react-i18next";

export default function CaseList() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { cases, errors, loading } = useCasesStore();
  const project = useProjectStore((s) => s.current);
  const projectPath = useProjectStore((s) => s.currentPath);
  const { setActiveSession, setCursor } = useSessionStore();

  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [typeFilter, setTypeFilter] = useState<TestType | "">("");
  const [selectedSuite, setSelectedSuite] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [startError, setStartError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const c of cases) set.add(c.case.module);
    return Array.from(set).sort();
  }, [cases]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter(({ case: c }) => {
      if (q) {
        const hay = `${c.id} ${c.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (moduleFilter && c.module !== moduleFilter) return false;
      if (priorityFilter && c.priority !== priorityFilter) return false;
      if (typeFilter && c.type !== typeFilter) return false;
      return true;
    });
  }, [cases, search, moduleFilter, priorityFilter, typeFilter]);

  const suiteNames = useMemo(
    () => (project ? Object.keys(project.suites) : []),
    [project],
  );

  function rowClick(lc: LoadedCase) {
    navigate(`/project/cases/${encodeURIComponent(lc.case.id)}`);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedSuite("");
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const allSelected = filtered.every((lc) => prev.has(lc.case.id));
      if (allSelected) return new Set();
      const next = new Set(prev);
      filtered.forEach((lc) => next.add(lc.case.id));
      return next;
    });
    setSelectedSuite("");
  }

  function pickSuite(name: string) {
    setSelectedSuite(name);
    if (!project || !name) {
      setSelectedIds(new Set());
      return;
    }
    const ids = project.suites[name] ?? [];
    setSelectedIds(new Set(ids));
  }

  async function startSession() {
    if (!projectPath) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setStartError(t("caseList.errorSelectCaseOrSuite", "Selecciona al menos un caso o una suite."));
      return;
    }
    setStartError(null);
    setBusy(true);
    try {
      const info = await api.startSession(projectPath, ids);
      setActiveSession(info.session, info.session_dir);
      const firstCase = info.session.case_results[0];
      if (firstCase) setCursor(firstCase.case_id, firstCase.steps[0].step);
      navigate("/session");
    } catch (e) {
      setStartError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const allVisibleSelected = filtered.length > 0 &&
    filtered.every((lc) => selectedIds.has(lc.case.id));

  return (
    <main
      style={{
        padding: "var(--adc-space-6)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--adc-space-5)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: "var(--adc-fs-2xl)" }}>{t("caseList.title", "Casos")}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--adc-space-3)" }}>
          <span style={{ fontSize: "var(--adc-fs-sm)", color: "var(--adc-fg-muted-strong)" }}>
            {loading ? t("common.loading", "cargando…") : t("caseList.caseCounts", { filtered: filtered.length, total: cases.length, defaultValue: "{{filtered}} de {{total}}" })}
          </span>
          <Button
            variant="secondary"
            onClick={() => navigate("/project/cases/new")}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={14} /> {t("caseList.newCase", "Nuevo caso")}
          </Button>
        </div>
      </header>

      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--adc-space-3)",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--adc-fg-muted-strong)",
            }}
          />
          <input
            className="adc-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("caseList.searchPlaceholder", "Buscar por ID o título…")}
            style={{ paddingLeft: 32, width: "100%" }}
          />
        </div>
        <select
          className="adc-select"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          style={{ minWidth: 140 }}
        >
          <option value="">{t("caseList.allModules", "Todos los módulos")}</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          className="adc-select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as Priority | "")}
          style={{ minWidth: 150 }}
        >
          <option value="">{t("caseList.allPriorities", "Todas las prioridades")}</option>
          <option value="critical">{t(PRIORITY_LABEL.critical)}</option>
          <option value="high">{t(PRIORITY_LABEL.high)}</option>
          <option value="medium">{t(PRIORITY_LABEL.medium)}</option>
          <option value="low">{t(PRIORITY_LABEL.low)}</option>
        </select>
        <select
          className="adc-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TestType | "")}
          style={{ minWidth: 150 }}
        >
          <option value="">{t("caseList.allTypes", "Todos los tipos")}</option>
          <option value="happy_path">{t(TYPE_LABEL.happy_path)}</option>
          <option value="error">{t(TYPE_LABEL.error)}</option>
          <option value="edge_case">{t(TYPE_LABEL.edge_case)}</option>
        </select>
      </section>

      {startError && <Alert tone="error" title={t("caseList.errorStartSessionTitle", "No se pudo iniciar la sesión")}>{startError}</Alert>}

      {errors.length > 0 && (
        <Alert tone="warn" title={t("caseList.unparseableFiles", { count: errors.length, defaultValue: "{{count}} archivo(s) no parseables" })}>
          {t("caseList.unparseableFilesDesc", "Estos archivos están mal formateados o no validan contra el schema.")}
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--adc-fs-xs)" }}>
            {errors.slice(0, 5).map((err) => (
              <li key={err.path}>
                <code>{err.path.split("/").pop()}</code>: {err.error}
              </li>
            ))}
            {errors.length > 5 && <li>{t("caseList.unparseableFilesMore", { more: errors.length - 5, defaultValue: "… y {{more}} más" })}</li>}
          </ul>
        </Alert>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--adc-space-3)",
          flexWrap: "wrap",
          padding: "var(--adc-space-3) var(--adc-space-4)",
          border: "var(--adc-border-1)",
          borderRadius: "var(--adc-radius-md)",
          background: "var(--adc-bg-card)",
        }}
      >
        <span style={{ fontSize: "var(--adc-fs-sm)" }}>
          {t("caseList.selectedCount", { count: selectedIds.size, defaultValue: "<strong>{{count}}</strong> seleccionado(s)" , interpolation: { escapeValue: false }})}
        </span>
        {suiteNames.length > 0 && (
          <select
            className="adc-select"
            value={selectedSuite}
            onChange={(e) => pickSuite(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <option value="">{t("caseList.suitePlaceholder", "Suite…")}</option>
            {suiteNames.map((s) => (
              <option key={s} value={s}>
                {s} ({project!.suites[s].length})
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setSelectedIds(new Set())}
          disabled={selectedIds.size === 0}
          className="adc-btn adc-btn--ghost"
        >
          {t("common.clear", "Limpiar")}
        </button>
        <div style={{ flex: 1 }} />
        <Button
          variant="primary"
          onClick={startSession}
          disabled={busy || selectedIds.size === 0}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <Play size={14} /> {t("caseList.startSession", "Iniciar sesión")}
        </Button>
      </div>

      {!loading && cases.length === 0
        ? (
          <EmptyState
            glyph="∅"
            title={t("caseList.noCasesTitle", "Este proyecto no tiene casos todavía")}
            description={t("caseList.noCasesDesc", "Crea uno desde el editor o agrega archivos JSON con prefijo TC-.")}
          />
        )
        : (
          <Table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <Checkbox
                    checked={allVisibleSelected}
                    onChange={() => toggleAllVisible()}
                    aria-label={t("caseList.selectAllVisible", "Seleccionar todos los visibles")}
                  />
                </th>
                <th style={{ width: 130 }}>{t("common.id", "ID")}</th>
                <th>{t("common.title", "Título")}</th>
                <th style={{ width: 160 }}>{t("common.module", "Módulo")}</th>
                <th style={{ width: 110 }}>{t("common.priority", "Prioridad")}</th>
                <th style={{ width: 100 }}>{t("common.type", "Tipo")}</th>
                <th style={{ width: 60, textAlign: "right" }}>{t("common.min", "Min")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lc) => (
                <tr key={lc.case.id} style={{ cursor: "pointer" }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(lc.case.id)}
                      onChange={() => toggleSelected(lc.case.id)}
                      aria-label={t("caseList.selectId", { id: lc.case.id, defaultValue: "Seleccionar {{id}}" })}
                    />
                  </td>
                  <td onClick={() => rowClick(lc)}>
                    <code>{lc.case.id}</code>
                  </td>
                  <td onClick={() => rowClick(lc)}>{lc.case.title}</td>
                  <td
                    onClick={() => rowClick(lc)}
                    style={{ fontSize: "var(--adc-fs-xs)", color: "var(--adc-fg-muted-strong)" }}
                  >
                    {lc.case.module}
                  </td>
                  <td onClick={() => rowClick(lc)}>
                    <Pill tone={lc.case.priority === "critical" ? "err" : "default"}>
                      {t(PRIORITY_LABEL[lc.case.priority])}
                    </Pill>
                  </td>
                  <td onClick={() => rowClick(lc)}>
                    <Pill>{t(TYPE_LABEL_SHORT[lc.case.type])}</Pill>
                  </td>
                  <td
                    onClick={() => rowClick(lc)}
                    className="adc-num"
                    style={{ textAlign: "right" }}
                  >
                    {lc.case.estimated_minutes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
    </main>
  );
}
