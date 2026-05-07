import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, Modal, Tabs } from "@adc-ui/components";
import { ChevronDown, ChevronLeft, ChevronUp, Plus, Save, Trash2, X } from "lucide-react";
import { useCasesStore, useProjectStore } from "@/lib/store";
import { api } from "@/lib/tauri";
import { validateCase } from "@/lib/schema";
import { EVIDENCE_HINT_LABEL, PRIORITY_LABEL, TYPE_LABEL } from "@/lib/labels";
import type { EvidenceHint, Priority, TestCase, TestStep, TestType } from "@/lib/types";

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
        <p>No hay proyecto activo.</p>
      </main>
    );
  }

  if (isEdit && !existing) {
    return (
      <main style={{ padding: "var(--adc-space-6)" }}>
        <p>Cargando caso…</p>
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
        setJsonParseError(`JSON inválido: ${String(e)}. Corrige antes de cambiar a Form.`);
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
        setActionError(`JSON inválido: ${String(e)}`);
        return;
      }
    }
    const v = validateCase(toSave);
    if (!v.ok) {
      setActionError(
        `El caso no valida contra el schema (${v.errors.length} error${
          v.errors.length === 1 ? "" : "es"
        }).`,
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
        <ChevronLeft size={14} /> {isEdit ? "Volver al caso" : "Casos"}
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
          {isEdit ? "Editar caso" : "Nuevo caso"}
        </h2>
        <div style={{ display: "flex", gap: "var(--adc-space-2)" }}>
          {isEdit && (
            <Button
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Trash2 size={14} /> Borrar
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={busy}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Save size={14} /> Guardar
          </Button>
        </div>
      </header>

      <Tabs<TabKey> tabs={["Form", "JSON"]} active={tab} onChange={handleTabChange} />

      {actionError && <Alert tone="error" title="Error">{actionError}</Alert>}

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
        title="Borrar caso"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={busy}>
              Borrar
            </Button>
          </>
        }
      >
        <p>
          Vas a borrar <code>{draft.id}</code>{" "}
          del disco. Esta acción no se puede deshacer desde la app.
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
        <Alert tone="warn" title={`${validationErrors.length} problema(s) de schema`}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--adc-fs-xs)" }}>
            {validationErrors.slice(0, 6).map((e, i) => (
              <li key={i}>
                <code>{e.path}</code>: {e.message}
              </li>
            ))}
            {validationErrors.length > 6 && <li>… y {validationErrors.length - 6} más</li>}
          </ul>
        </Alert>
      )}

      <Section title="Identidad">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--adc-space-3)" }}>
          <Field label="ID">
            <input
              className="adc-input"
              value={draft.id}
              onChange={(e) => patch("id", e.target.value)}
              placeholder="TC-AUTH-009"
            />
          </Field>
          <Field label="Module">
            <input
              className="adc-input"
              list="known-modules"
              value={draft.module}
              onChange={(e) => patch("module", e.target.value)}
              placeholder="ej. ventas.pos"
            />
            <datalist id="known-modules">
              {knownModules.map((m) => <option key={m} value={m} />)}
            </datalist>
          </Field>
        </div>
        <Field label="Título">
          <input
            className="adc-input"
            value={draft.title}
            onChange={(e) => patch("title", e.target.value)}
            placeholder="Una línea descriptiva del caso"
          />
        </Field>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--adc-space-3)",
          }}
        >
          <Field label="Tipo">
            <select
              className="adc-select"
              value={draft.type}
              onChange={(e) => patch("type", e.target.value as TestType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad">
            <select
              className="adc-select"
              value={draft.priority}
              onChange={(e) => patch("priority", e.target.value as Priority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Minutos estimados">
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

      <Section title="Etiquetas">
        <ChipInput
          values={draft.tags ?? []}
          setValues={(v) => patch("tags", v)}
          placeholder="agregar etiqueta…"
        />
      </Section>

      <Section title="Precondiciones">
        <StringList
          items={draft.preconditions ?? []}
          setItems={(v) => patch("preconditions", v)}
          placeholder="ej. Hay caja abierta"
        />
      </Section>

      <Section title={`Pasos (${draft.steps.length})`}>
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
                <Field label="Acción">
                  <textarea
                    className="adc-textarea"
                    value={step.action}
                    onChange={(e) => patchStep(idx, { action: e.target.value })}
                    rows={2}
                  />
                </Field>
                <Field label="Esperado">
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
                  <Field label="Evidencia sugerida">
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
                          {EVIDENCE_HINT_LABEL[h]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Datos (JSON, opcional)">
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
                  aria-label="Subir"
                >
                  <ChevronUp size={14} />
                </IconButton>
                <IconButton
                  onClick={() => moveStep(idx, 1)}
                  disabled={idx === draft.steps.length - 1}
                  aria-label="Bajar"
                >
                  <ChevronDown size={14} />
                </IconButton>
                <IconButton onClick={() => removeStep(idx)} aria-label="Borrar paso">
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
            <Plus size={14} /> Agregar paso
          </Button>
        </div>
      </Section>

      <Section title="Criterios de aceptación">
        <StringList
          items={draft.acceptance_criteria}
          setItems={(v) => patch("acceptance_criteria", v)}
          placeholder="ej. La venta queda registrada con estado 'completada'"
        />
      </Section>

      <Section title="Archivos relacionados">
        <StringList
          items={draft.related_files ?? []}
          setItems={(v) => patch("related_files", v)}
          placeholder="ej. apps/desktop/src/routes/_app/ventas/pos.tsx"
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
          <Alert tone="error" title="JSON inválido">
            {parseError}
          </Alert>
        )
        : schemaErrors.length === 0
        ? (
          <Alert tone="success" title="OK">
            El JSON valida contra el schema.
          </Alert>
        )
        : (
          <Alert tone="warn" title={`${schemaErrors.length} problema(s) de schema`}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--adc-fs-xs)" }}>
              {schemaErrors.slice(0, 8).map((e, i) => (
                <li key={i}>
                  <code>{e.path}</code>: {e.message}
                </li>
              ))}
              {schemaErrors.length > 8 && <li>… y {schemaErrors.length - 8} más</li>}
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
          <IconButton onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Borrar">
            <X size={14} />
          </IconButton>
        </div>
      ))}
      <Button
        variant="ghost"
        onClick={() => setItems([...items, ""])}
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}
      >
        <Plus size={14} /> Agregar
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
  const [text, setText] = useState("");
  function commit() {
    const t = text.trim();
    if (!t) return;
    if (values.includes(t)) {
      setText("");
      return;
    }
    setValues([...values, t]);
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
            aria-label={`Quitar ${v}`}
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
        setErr("Debe ser un objeto JSON.");
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
