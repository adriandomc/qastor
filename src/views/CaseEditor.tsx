import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, Modal, Tabs } from "@adc-ui/components";
import { ChevronDown, ChevronLeft, ChevronUp, Plus, Save, Trash2, X } from "lucide-react";
import { useCasesStore, useProjectStore } from "@/lib/store";
import { api } from "@/lib/tauri";
import { validateCase } from "@/lib/schema";
import { EVIDENCE_HINT_LABEL, PRIORITY_LABEL, TYPE_LABEL } from "@/lib/labels";
import type { EvidenceHint, Priority, TestCase, TestStep, TestType } from "@/lib/types";
import { useTranslation } from "react-i18next";

type TabKey = "Form" | "JSON";

const EVIDENCE_HINTS: EvidenceHint[] = [
  "none",
  "screenshot",
  "text_excerpt",
  "db_query",
  "file_attachment",
];

const PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];
const TYPES: TestType[] = ["happy_path", "error", "edge_case"];

const blankCase = (): TestCase => ({
  id: "TC-NEW-001",
  title: "",
  module: "",
  type: "happy_path",
  priority: "medium",
  preconditions: [],
  steps: [{ step: 1, action: "", expected: "", evidence_hint: "screenshot" }],
  acceptance_criteria: [""],
  tags: [],
});

function renumber(steps: TestStep[]): TestStep[] {
  return steps.map((s, i) => ({ ...s, step: i + 1 }));
}

export default function CaseEditor() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { caseId } = useParams<{ caseId: string }>();
  const { current: project, currentPath, updateConfig } = useProjectStore();
  const allCases = useCasesStore((s) => s.cases);
  const refresh = useCasesStore((s) => s.refresh);

  const isEdit = !!caseId;
  const decoded = caseId ? decodeURIComponent(caseId) : "";
  const existing = isEdit ? allCases.find((lc) => lc.case.id === decoded) : null;

  const [draft, setDraft] = useState<TestCase>(existing?.case ?? blankCase());
  const [previousPath, setPreviousPath] = useState<string | undefined>(
    existing?.path,
  );
  const [tab, setTab] = useState<TabKey>("Form");
  const [jsonText, setJsonText] = useState(JSON.stringify(draft, null, 2));
  const [jsonParseError, setJsonParseError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reload draft when navigating between edit targets or when cases load late.
  useEffect(() => {
    if (isEdit && existing && existing.case.id !== draft.id) {
      setDraft(existing.case);
      setJsonText(JSON.stringify(existing.case, null, 2));
      setPreviousPath(existing.path);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, existing?.case.id]);

  const validation = useMemo(() => validateCase(draft), [draft]);

  const knownModules = useMemo(() => {
    const set = new Set<string>();
    for (const c of allCases) set.add(c.case.module);
    return Array.from(set).sort();
  }, [allCases]);

  if (!project || !currentPath) {
    return (
      <main style={{ padding: "var(--adc-space-6)" }}>
        <p>{t("settings.noActiveProject", "No hay proyecto activo.")}</p>
      </main>
    );
  }

  if (isEdit && !existing) {
    return (
      <main style={{ padding: "var(--adc-space-6)" }}>
        <p>{t("caseEditor.loadingCase", "Cargando caso…")}</p>
      </main>
    );
  }

  function handleTabChange(next: TabKey) {
    if (tab === next) return;
    if (tab === "Form" && next === "JSON") {
      setJsonText(JSON.stringify(draft, null, 2));
      setJsonParseError(null);
    } else if (tab === "JSON" && next === "Form") {
      try {
        const parsed = JSON.parse(jsonText) as TestCase;
        setDraft(parsed);
        setJsonParseError(null);
      } catch (e) {
        setJsonParseError(t("caseEditor.invalidJsonToForm", "JSON inválido: {{error}}. Corrige antes de cambiar a Form.", { error: String(e) }));
        return;
      }
    }
    setTab(next);
  }

  async function handleSave() {
    setActionError(null);
    let toSave: TestCase = draft;
    if (tab === "JSON") {
      try {
        toSave = JSON.parse(jsonText) as TestCase;
      } catch (e) {
        setActionError(t("caseEditor.invalidJson", "JSON inválido: {{error}}", { error: String(e) }));
        return;
      }
    }
    const v = validateCase(toSave);
    if (!v.ok) {
      setActionError(
        t("caseEditor.validationError", "El caso no valida contra el schema ({{count}} errores).", { count: v.errors.length })
      );
      return;
    }
    setBusy(true);
    try {
      const result = await api.saveCase(currentPath!, toSave, previousPath);
      updateConfig(result.config);
      await refresh(currentPath!);
      navigate(`/project/cases/${encodeURIComponent(toSave.id)}`);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!previousPath || !currentPath) return;
    setBusy(true);
    try {
      await api.deleteCase(currentPath, previousPath);
      await refresh(currentPath);
      setConfirmDelete(false);
      navigate("/project/cases");
    } catch (e) {
      setActionError(String(e));
      setBusy(false);
    }
  }

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
      <Button
        variant="ghost"
        onClick={() =>
          navigate(isEdit ? `/project/cases/${encodeURIComponent(decoded)}` : "/project/cases")}
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4 }}
      >
        <ChevronLeft size={14} /> {isEdit ? t("caseEditor.backToCase", "Volver al caso") : t("caseList.title", "Casos")}
      </Button>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--adc-space-4)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "var(--adc-fs-2xl)" }}>
          {isEdit ? t("caseEditor.editCase", "Editar caso") : t("caseEditor.newCase", "Nuevo caso")}
        </h2>
        <div style={{ display: "flex", gap: "var(--adc-space-2)" }}>
          {isEdit && (
            <Button
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Trash2 size={14} /> {t("common.delete", "Borrar")}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Save size={14} /> {t("common.save", "Guardar")}
          </Button>
        </div>
      </header>

      <Tabs<TabKey> tabs={["Form", "JSON"]} active={tab} onChange={handleTabChange} />

      {actionError && <Alert tone="error" title={t("common.error", "Error")}>{actionError}</Alert>}

      {tab === "Form" && (
        <FormView
          draft={draft}
          setDraft={setDraft}
          knownModules={knownModules}
          validationErrors={validation.ok ? [] : validation.errors}
        />
      )}

      {tab === "JSON" && (
        <JSONView
          text={jsonText}
          setText={(t) => {
            setJsonText(t);
            try {
              JSON.parse(t);
              setJsonParseError(null);
            } catch (e) {
              setJsonParseError(String(e));
            }
          }}
          parseError={jsonParseError}
        />
      )}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("caseEditor.deleteCase", "Borrar caso")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("common.cancel", "Cancelar")}
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={busy}>
              {t("common.delete", "Borrar")}
            </Button>
          </>
        }
      >
        <p>
          {t("caseEditor.deleteCaseDesc", "Vas a borrar {{id}} del disco. Esta acción no se puede deshacer desde la app.", { id: draft.id })}
        </p>
      </Modal>
    </main>
  );
}

// ----- Form view -----------------------------------------------------------

function FormView({
  draft,
  setDraft,
  knownModules,
  validationErrors,
}: {
  draft: TestCase;
  setDraft: (c: TestCase) => void;
  knownModules: string[];
  validationErrors: { path: string; message: string }[];
}) {
  const { t } = useTranslation();
  
  function patch<K extends keyof TestCase>(key: K, value: TestCase[K]) {
    setDraft({ ...draft, [key]: value });
  }

  function setSteps(steps: TestStep[]) {
    setDraft({ ...draft, steps: renumber(steps) });
  }

  function addStep() {
    setSteps([
      ...draft.steps,
      { step: draft.steps.length + 1, action: "", expected: "", evidence_hint: "screenshot" },
    ]);
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= draft.steps.length) return;
    const next = [...draft.steps];
    [next[idx], next[j]] = [next[j], next[idx]];
    setSteps(next);
  }

  function removeStep(idx: number) {
    setSteps(draft.steps.filter((_, i) => i !== idx));
  }

  function patchStep(idx: number, partial: Partial<TestStep>) {
    setSteps(
      draft.steps.map((s, i) => (i === idx ? { ...s, ...partial } : s)),
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-5)" }}>
      {validationErrors.length > 0 && (
        <Alert tone="warn" title={t("caseEditor.schemaProblems", "{{count}} problema(s) de schema", { count: validationErrors.length })}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--adc-fs-xs)" }}>
            {validationErrors.slice(0, 6).map((e, i) => (
              <li key={i}>
                <code>{e.path}</code>: {e.message}
              </li>
            ))}
            {validationErrors.length > 6 && <li>{t("caseEditor.andMore", "… y {{more}} más", { more: validationErrors.length - 6 })}</li>}
          </ul>
        </Alert>
      )}

      <Section title={t("caseEditor.identity", "Identidad")}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--adc-space-3)" }}>
          <Field label={t("common.id", "ID")}>
            <input
              className="adc-input"
              value={draft.id}
              onChange={(e) => patch("id", e.target.value)}
              placeholder="TC-AUTH-009"
            />
          </Field>
          <Field label={t("common.module", "Module")}>
            <input
              className="adc-input"
              list="known-modules"
              value={draft.module}
              onChange={(e) => patch("module", e.target.value)}
              placeholder={t("caseEditor.modulePlaceholder", "ej. ventas.pos")}
            />
            <datalist id="known-modules">
              {knownModules.map((m) => <option key={m} value={m} />)}
            </datalist>
          </Field>
        </div>
        <Field label={t("common.title", "Título")}>
          <input
            className="adc-input"
            value={draft.title}
            onChange={(e) => patch("title", e.target.value)}
            placeholder={t("caseEditor.titlePlaceholder", "Una línea descriptiva del caso")}
          />
        </Field>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--adc-space-3)",
          }}
        >
          <Field label={t("common.type", "Tipo")}>
            <select
              className="adc-select"
              value={draft.type}
              onChange={(e) => patch("type", e.target.value as TestType)}
            >
              {TYPES.map((t_key) => (
                <option key={t_key} value={t_key}>
                  {t(TYPE_LABEL[t_key])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("common.priority", "Prioridad")}>
            <select
              className="adc-select"
              value={draft.priority}
              onChange={(e) => patch("priority", e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(PRIORITY_LABEL[p])}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("caseEditor.estimatedMinutes", "Minutos estimados")}>
            <input
              className="adc-input"
              type="number"
              min={1}
              value={draft.estimated_minutes ?? ""}
              onChange={(e) =>
                patch(
                  "estimated_minutes",
                  e.target.value === "" ? undefined : Number(e.target.value),
                )}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("caseEditor.tags", "Etiquetas")}>
        <ChipInput
          values={draft.tags ?? []}
          setValues={(v) => patch("tags", v)}
          placeholder={t("caseEditor.addTag", "agregar etiqueta…")}
        />
      </Section>

      <Section title={t("caseEditor.preconditions", "Precondiciones")}>
        <StringList
          items={draft.preconditions ?? []}
          setItems={(v) => patch("preconditions", v)}
          placeholder={t("caseEditor.preconditionPlaceholder", "ej. Hay caja abierta")}
        />
      </Section>

      <Section title={t("caseEditor.steps", "Pasos ({{count}})", { count: draft.steps.length })}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-3)" }}>
          {draft.steps.map((step, idx) => (
            <Card
              key={idx}
              style={{
                padding: "var(--adc-space-4)",
                display: "flex",
                gap: "var(--adc-space-3)",
                alignItems: "flex-start",
              }}
            >
              <div
                className="adc-num"
                style={{
                  minWidth: 28,
                  fontWeight: "var(--adc-fw-bold)",
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
                <Field label={t("caseEditor.action", "Acción")}>
                  <textarea
                    className="adc-textarea"
                    value={step.action}
                    onChange={(e) => patchStep(idx, { action: e.target.value })}
                    rows={2}
                  />
                </Field>
                <Field label={t("caseEditor.expected", "Esperado")}>
                  <textarea
                    className="adc-textarea"
                    value={step.expected}
                    onChange={(e) => patchStep(idx, { expected: e.target.value })}
                    rows={2}
                  />
                </Field>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "240px 1fr",
                    gap: "var(--adc-space-3)",
                  }}
                >
                  <Field label={t("caseEditor.suggestedEvidence", "Evidencia sugerida")}>
                    <select
                      className="adc-select"
                      value={step.evidence_hint ?? "none"}
                      onChange={(e) =>
                        patchStep(idx, {
                          evidence_hint: e.target.value as EvidenceHint,
                        })}
                    >
                      {EVIDENCE_HINTS.map((h) => (
                        <option key={h} value={h}>
                          {t(EVIDENCE_HINT_LABEL[h])}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("caseEditor.dataField", "Datos (JSON, opcional)")}>
                    <DataField
                      value={step.data}
                      onChange={(v) => patchStep(idx, { data: v })}
                    />
                  </Field>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <IconButton
                  onClick={() => moveStep(idx, -1)}
                  disabled={idx === 0}
                  aria-label={t("caseEditor.moveUp", "Subir")}
                >
                  <ChevronUp size={14} />
                </IconButton>
                <IconButton
                  onClick={() => moveStep(idx, 1)}
                  disabled={idx === draft.steps.length - 1}
                  aria-label={t("caseEditor.moveDown", "Bajar")}
                >
                  <ChevronDown size={14} />
                </IconButton>
                <IconButton onClick={() => removeStep(idx)} aria-label={t("caseEditor.deleteStep", "Borrar paso")}>
                  <X size={14} />
                </IconButton>
              </div>
            </Card>
          ))}
          <Button
            variant="ghost"
            onClick={addStep}
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={14} /> {t("caseEditor.addStep", "Agregar paso")}
          </Button>
        </div>
      </Section>

      <Section title={t("caseEditor.acceptanceCriteria", "Criterios de aceptación")}>
        <StringList
          items={draft.acceptance_criteria}
          setItems={(v) => patch("acceptance_criteria", v)}
          placeholder={t("caseEditor.acPlaceholder", "ej. La venta queda registrada con estado 'completada'")}
        />
      </Section>

      <Section title={t("caseEditor.relatedFiles", "Archivos relacionados")}>
        <StringList
          items={draft.related_files ?? []}
          setItems={(v) => patch("related_files", v)}
          placeholder={t("caseEditor.relatedFilesPlaceholder", "ej. apps/desktop/src/routes/_app/ventas/pos.tsx")}
        />
      </Section>
    </div>
  );
}

// ----- JSON view -----------------------------------------------------------

function JSONView({
  text,
  setText,
  parseError,
}: {
  text: string;
  setText: (t: string) => void;
  parseError: string | null;
}) {
  const { t } = useTranslation();
  let schemaErrors: { path: string; message: string }[] = [];
  if (!parseError) {
    try {
      const parsed = JSON.parse(text);
      const v = validateCase(parsed);
      if (!v.ok) schemaErrors = v.errors;
    } catch {
      // already covered by parseError
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-3)" }}>
      {parseError
        ? (
          <Alert tone="error" title={t("caseEditor.invalidJsonTitle", "JSON inválido")}>
            {parseError}
          </Alert>
        )
        : schemaErrors.length === 0
        ? (
          <Alert tone="success" title="OK">
            {t("caseEditor.jsonOk", "El JSON valida contra el schema.")}
          </Alert>
        )
        : (
          <Alert tone="warn" title={t("caseEditor.schemaProblems", "{{count}} problema(s) de schema", { count: schemaErrors.length })}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--adc-fs-xs)" }}>
              {schemaErrors.slice(0, 8).map((e, i) => (
                <li key={i}>
                  <code>{e.path}</code>: {e.message}
                </li>
              ))}
              {schemaErrors.length > 8 && <li>{t("caseEditor.andMore", "… y {{more}} más", { more: schemaErrors.length - 8 })}</li>}
            </ul>
          </Alert>
        )}
      <textarea
        className="adc-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        style={{
          minHeight: 480,
          fontFamily: "var(--adc-font-mono)",
          fontSize: "var(--adc-fs-sm)",
          tabSize: 2,
        }}
      />
    </div>
  );
}

// ----- Helpers --------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3
        style={{
          margin: "0 0 var(--adc-space-3)",
          fontSize: "var(--adc-fs-sm)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--adc-fg-muted-strong)",
        }}
      >
        {title}
      </h3>
      <Card
        style={{
          padding: "var(--adc-space-4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--adc-space-3)",
        }}
      >
        {children}
      </Card>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="adc-field">
      <label className="adc-label">{label}</label>
      {children}
    </div>
  );
}

function StringList({
  items,
  setItems,
  placeholder,
}: {
  items: string[];
  setItems: (v: string[]) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <input
            className="adc-input"
            value={s}
            onChange={(e) => setItems(items.map((it, j) => (j === i ? e.target.value : it)))}
            placeholder={placeholder}
            style={{ flex: 1 }}
          />
          <IconButton onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={t("common.delete", "Borrar")}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      <Button
        variant="ghost"
        onClick={() => setItems([...items, ""])}
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}
      >
        <Plus size={14} /> {t("common.add", "Agregar")}
      </Button>
    </div>
  );
}

function ChipInput({
  values,
  setValues,
  placeholder,
}: {
  values: string[];
  setValues: (v: string[]) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  function commit() {
    const t_val = text.trim();
    if (!t_val) return;
    if (values.includes(t_val)) {
      setText("");
      return;
    }
    setValues([...values, t_val]);
    setText("");
  }
  return (
    <div className="adc-chips" style={{ minHeight: "var(--adc-h-md)", flexWrap: "wrap" }}>
      {values.map((v, i) => (
        <span key={i} className="adc-chip">
          {v}
          <button
            type="button"
            className="adc-chip__x"
            onClick={() => setValues(values.filter((_, j) => j !== i))}
            aria-label={t("common.remove", { id: v, defaultValue: "Quitar {{id}}" })}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !text && values.length) {
            setValues(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        style={{
          border: 0,
          background: "transparent",
          outline: "none",
          flex: 1,
          minWidth: 100,
          fontFamily: "var(--adc-font-mono)",
          fontSize: "var(--adc-fs-sm)",
        }}
      />
    </div>
  );
}

function DataField({
  value,
  onChange,
}: {
  value: Record<string, unknown> | undefined;
  onChange: (v: Record<string, unknown> | undefined) => void;
}) {
  const { t } = useTranslation();
  const initial = value ? JSON.stringify(value, null, 0) : "";
  const [text, setText] = useState(initial);
  const [err, setErr] = useState<string | null>(null);

  function commit() {
    if (text.trim() === "") {
      onChange(undefined);
      setErr(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        setErr(t("caseEditor.jsonMustBeObject", "Debe ser un objeto JSON."));
        return;
      }
      onChange(parsed as Record<string, unknown>);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <input
        className="adc-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder='{"recibido":"100.00"}'
      />
      {err && <span style={{ fontSize: "var(--adc-fs-xs)", color: "var(--adc-error)" }}>{err}
      </span>}
    </div>
  );
}

function IconButton({
  children,
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      {...rest}
      style={{
        height: "var(--adc-h-icon)",
        width: "var(--adc-h-icon)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "var(--adc-border-1)",
        background: "var(--adc-bg-surface)",
        color: "var(--adc-fg)",
        borderRadius: "var(--adc-radius-sm)",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.4 : 1,
        ...rest.style,
      }}
    >
      {children}
    </button>
  );
}
