import { useMemo, useState } from "react";
import { Alert, Button, Card, Checkbox, Modal, Pill } from "@adc-ui/components";
import { Pencil, Plus, RefreshCw, Trash2, X, Globe } from "lucide-react";
import { useCasesStore, useProjectStore } from "@/lib/store";
import { api } from "@/lib/tauri";
import type { ProjectConfig } from "@/lib/types";
import { useTranslation } from "react-i18next";

interface SuiteEditorState {
  originalName: string | null; // null = creating
  name: string;
  caseIds: Set<string>;
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const project = useProjectStore((s) => s.current);
  const projectPath = useProjectStore((s) => s.currentPath);
  const updateConfig = useProjectStore((s) => s.updateConfig);
  const cases = useCasesStore((s) => s.cases);

  const [editor, setEditor] = useState<SuiteEditorState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reindexMessage, setReindexMessage] = useState<string | null>(null);

  if (!project || !projectPath) {
    return (
      <main style={{ padding: "var(--adc-space-6)" }}>
        <p>{t("settings.noActiveProject", "No active project.")}</p>
      </main>
    );
  }

  function openCreate() {
    setError(null);
    setEditor({ originalName: null, name: "", caseIds: new Set() });
  }

  function openEdit(name: string) {
    setError(null);
    setEditor({
      originalName: name,
      name,
      caseIds: new Set(project!.suites[name] ?? []),
    });
  }

  async function persistConfig(next: ProjectConfig) {
    await api.updateProjectConfig(projectPath!, next);
    updateConfig(next);
  }

  async function handleSaveSuite() {
    if (!editor) return;
    const trimmed = editor.name.trim();
    if (!trimmed) {
      setError(t("settings.suiteNameEmptyError", "Suite name cannot be empty."));
      return;
    }
    setBusy(true);
    try {
      const nextSuites = { ...project!.suites };
      if (editor.originalName && editor.originalName !== trimmed) {
        delete nextSuites[editor.originalName];
      }
      nextSuites[trimmed] = Array.from(editor.caseIds);
      await persistConfig({ ...project!, suites: nextSuites });
      setEditor(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSuite() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const nextSuites = { ...project!.suites };
      delete nextSuites[confirmDelete];
      await persistConfig({ ...project!, suites: nextSuites });
      setConfirmDelete(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleReindex() {
    setBusy(true);
    setReindexMessage(null);
    try {
      const path = await api.regenerateIndex(projectPath!);
      setReindexMessage(t("settings.reindexSuccess", "index.json regenerated at {{path}}", { path }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const suiteEntries = Object.entries(project.suites);

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
      <h2 style={{ margin: 0, fontSize: "var(--adc-fs-2xl)" }}>{t("settings.title", "Settings")}</h2>

      {error && <Alert tone="error" title={t("common.error", "Error")}>{error}</Alert>}
      {reindexMessage && <Alert tone="success" title={t("common.ready", "Ready")}>{reindexMessage}</Alert>}

      <section>
        <SectionHeader title={t("settings.language", "Language")} />
        <Card style={{ padding: "var(--adc-space-4)", display: "flex", alignItems: "center", gap: "var(--adc-space-3)" }}>
          <Globe size={16} />
          <select
            className="adc-input"
            style={{ width: 150 }}
            value={i18n.language.split('-')[0]}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </Card>
      </section>

      <section>
        <SectionHeader
          title={t("settings.suites", "Suites")}
          right={
            <Button
              variant="primary"
              onClick={openCreate}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={14} /> {t("settings.newSuite", "New Suite")}
            </Button>
          }
        />
        {suiteEntries.length === 0
          ? (
            <Card style={{ padding: "var(--adc-space-4)", color: "var(--adc-fg-muted-strong)" }}>
              {t("settings.noSuitesDesc", "No suites yet. Create one to group cases and run them together from the Cases tab.")}
            </Card>
          )
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-3)" }}>
              {suiteEntries.map(([name, ids]) => (
                <Card
                  key={name}
                  style={{
                    padding: "var(--adc-space-4)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--adc-space-3)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--adc-space-3)" }}>
                    <Pill tone="ok">{name}</Pill>
                    <span
                      style={{ fontSize: "var(--adc-fs-xs)", color: "var(--adc-fg-muted-strong)" }}
                    >
                      {t("settings.caseCount", { count: ids.length, defaultValue: "{{count}} case" })}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "var(--adc-space-2)" }}>
                    <Button
                      variant="ghost"
                      onClick={() => openEdit(name)}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <Pencil size={14} /> {t("common.edit", "Edit")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setConfirmDelete(name)}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <Trash2 size={14} /> {t("common.delete", "Delete")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
      </section>

      <section>
        <SectionHeader title={t("settings.mappingPrefixTitle", "Mapping ID prefix → folder")} />
        <Card style={{ padding: "var(--adc-space-4)" }}>
          {Object.keys(project.module_folders).length > 0
            ? (
              <table
                style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--adc-fs-sm)" }}
              >
                <tbody>
                  {Object.entries(project.module_folders).map(([prefix, folder]) => (
                    <tr key={prefix}>
                      <td style={{ padding: "4px 8px 4px 0", fontWeight: "var(--adc-fw-bold)" }}>
                        <code>{prefix}</code>
                      </td>
                      <td style={{ padding: "4px 0", color: "var(--adc-fg-muted-strong)" }}>→</td>
                      <td style={{ padding: "4px 0 4px 8px" }}>
                        <code>{folder}/</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
            : <span style={{ color: "var(--adc-fg-muted-strong)" }}>({t("common.empty", "empty")})</span>}
        </Card>
        <p
          style={{
            fontSize: "var(--adc-fs-sm)",
            color: "var(--adc-fg-muted-strong)",
            margin: "var(--adc-space-2) 0 0",
          }}
        >
          {t("settings.mappingDesc", "Automatically updates when you create cases with new prefixes.")}
        </p>
      </section>

      <section>
        <SectionHeader
          title={t("settings.index", "Index")}
          right={
            <Button
              variant="secondary"
              onClick={handleReindex}
              disabled={busy}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <RefreshCw size={14} /> {t("settings.regenerateIndex", "Regenerate index.json")}
            </Button>
          }
        />
        <Card
          style={{
            padding: "var(--adc-space-4)",
            fontSize: "var(--adc-fs-sm)",
            color: "var(--adc-fg-muted-strong)",
            lineHeight: "var(--adc-lh-body)",
          }}
        >
          <code>index.json</code>{" "}
          {t("settings.indexDesc", "is automatically regenerated when creating, editing, or deleting cases. Useful for CI/external scripts. Click 'Regenerate' if you edited it manually.")}
        </Card>
      </section>

      <Modal
        open={!!editor}
        onClose={() => setEditor(null)}
        title={editor?.originalName ? t("settings.editSuiteTitle", "Edit suite") : t("settings.newSuiteTitle", "New suite")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button variant="primary" onClick={handleSaveSuite} disabled={busy}>{t("common.save", "Save")}</Button>
          </>
        }
      >
        {editor && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-3)" }}>
            <div className="adc-field">
              <label className="adc-label">{t("settings.suiteName", "Name")}</label>
              <input
                className="adc-input"
                value={editor.name}
                onChange={(e) =>
                  setEditor({ ...editor, name: e.target.value })}
                placeholder={t("settings.suiteNamePlaceholder", "e.g. smoke")}
                autoFocus
              />
            </div>
            <div className="adc-field">
              <label className="adc-label">
                {t("settings.casesSelected", { count: editor.caseIds.size, defaultValue: "Cases ({{count}} selected)" })}
              </label>
              <SuiteCaseSelector
                cases={cases}
                selected={editor.caseIds}
                setSelected={(s) => setEditor({ ...editor, caseIds: s })}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t("settings.deleteSuiteTitle", "Delete suite")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>{t("common.cancel", "Cancel")}</Button>
            <Button variant="danger" onClick={handleDeleteSuite} disabled={busy}>{t("common.delete", "Delete")}</Button>
          </>
        }
      >
        <p>
          {t("settings.deleteSuiteDesc", { name: confirmDelete, defaultValue: "You are about to delete suite {{name}}. Individual cases will not be touched." })}
        </p>
      </Modal>
    </main>
  );
}

function SectionHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "var(--adc-space-3)",
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: "var(--adc-fs-sm)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--adc-fg-muted-strong)",
        }}
      >
        {title}
      </h3>
      {right}
    </div>
  );
}

function SuiteCaseSelector({
  cases,
  selected,
  setSelected,
}: {
  cases: ReturnType<typeof useCasesStore.getState>["cases"];
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter(
      (lc) =>
        lc.case.id.toLowerCase().includes(q) ||
        lc.case.title.toLowerCase().includes(q),
    );
  }, [cases, filter]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <div>
      <input
        className="adc-input"
        placeholder={t("settings.filterCases", "Filter cases...")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ marginBottom: 6 }}
      />
      <div
        style={{
          maxHeight: 260,
          overflowY: "auto",
          border: "var(--adc-border-1)",
          borderRadius: "var(--adc-radius-sm)",
          padding: 4,
          background: "var(--adc-bg-surface)",
        }}
      >
        {filtered.length === 0
          ? (
            <div
              style={{
                padding: 12,
                fontSize: "var(--adc-fs-xs)",
                color: "var(--adc-fg-muted-strong)",
              }}
            >
              {t("settings.noMatches", "No matches.")}
            </div>
          )
          : (
            filtered.map((lc) => (
              <label
                key={lc.case.id}
                className="adc-check-row"
                style={{
                  display: "flex",
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "var(--adc-fs-sm)",
                }}
              >
                <Checkbox
                  checked={selected.has(lc.case.id)}
                  onChange={() => toggle(lc.case.id)}
                />
                <code style={{ fontSize: "var(--adc-fs-xs)" }}>{lc.case.id}</code>
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {lc.case.title}
                </span>
              </label>
            ))
          )}
      </div>
      {selected.size > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {Array.from(selected).map((id) => (
            <span key={id} className="adc-chip">
              <code style={{ fontSize: "var(--adc-fs-xs)" }}>{id}</code>
              <button
                type="button"
                className="adc-chip__x"
                onClick={() => toggle(id)}
                aria-label={t("common.remove", { id, defaultValue: "Remove {{id}}" })}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
