import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ADCMark, Alert, Button, Card, EmptyState, Modal } from "@adc-ui/components";
import { FolderOpen, FolderPlus, History, X } from "lucide-react";
import { api } from "@/lib/tauri";
import { useProjectStore } from "@/lib/store";
import type { ProjectConfig, ProjectRef, ValidationResult } from "@/lib/types";

type CreateModalState = { open: boolean; name: string };
type InitModalState = {
  dir: string;
  caseCount: number;
  detectedModules: string[];
  hasIndexJson: boolean;
} | null;

export default function Welcome() {
  const navigate = useNavigate();
  const { recent, setRecent, openProject } = useProjectStore();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createModal, setCreateModal] = useState<CreateModalState>({ open: false, name: "" });
  const [initModal, setInitModal] = useState<InitModalState>(null);

  useEffect(() => {
    api.getRecentProjects().then(setRecent).catch((e) => setError(String(e)));
  }, [setRecent]);

  async function landOpenedProject(path: string, config: ProjectConfig) {
    await api.recordRecentProject(path, config.project_name);
    const updated = await api.getRecentProjects();
    setRecent(updated);
    openProject(path, config);
    navigate("/project");
  }

  async function handleCreate() {
    setError(null);
    if (createModal.name.trim().length === 0) {
      setError("Nombre del proyecto requerido.");
      return;
    }
    const parent = await openDialog({ directory: true, multiple: false });
    if (!parent || typeof parent !== "string") return;
    setBusy(true);
    try {
      const config = await api.createProject(parent, createModal.name.trim());
      const path = `${parent}/${createModal.name.trim()}`;
      setCreateModal({ open: false, name: "" });
      await landOpenedProject(path, config);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenExisting() {
    setError(null);
    const dir = await openDialog({ directory: true, multiple: false });
    if (!dir || typeof dir !== "string") return;
    await openOrInitialize(dir);
  }

  async function openOrInitialize(dir: string) {
    setBusy(true);
    try {
      const result: ValidationResult = await api.validateProject(dir);
      switch (result.kind) {
        case "valid":
          await landOpenedProject(dir, result.config);
          break;
        case "initializable_existing":
          setInitModal({
            dir,
            caseCount: result.case_count,
            detectedModules: result.detected_modules,
            hasIndexJson: result.has_index_json,
          });
          break;
        case "invalid":
          setError(`qastor.json inválido: ${result.error}`);
          break;
        case "not_a_project":
          setError(`No es un proyecto qastor: ${result.reason}`);
          break;
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleInitialize() {
    if (!initModal) return;
    setBusy(true);
    try {
      const config = await api.initializeExistingFolder(initModal.dir);
      const dir = initModal.dir;
      setInitModal(null);
      await landOpenedProject(dir, config);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRecentClick(ref: ProjectRef) {
    await openOrInitialize(ref.path);
  }

  async function handleForget(ref: ProjectRef, ev: React.MouseEvent) {
    ev.stopPropagation();
    setBusy(true);
    try {
      await api.forgetRecentProject(ref.path);
      const updated = await api.getRecentProjects();
      setRecent(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "var(--adc-space-9)",
        paddingBottom: "var(--adc-space-9)",
      }}
    >
      <div
        style={{ width: 720, display: "flex", flexDirection: "column", gap: "var(--adc-space-7)" }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: "var(--adc-space-5)" }}>
          <ADCMark size={56} label="Q" />
          <div>
            <h1 style={{ margin: 0, fontSize: "var(--adc-fs-3xl)", letterSpacing: "-0.01em" }}>
              Qastor
            </h1>
            <p
              style={{
                margin: 0,
                color: "var(--adc-fg-muted-strong)",
                fontSize: "var(--adc-fs-sm)",
              }}
            >
              Gestor de casos de prueba manuales con captura de evidencia.
            </p>
          </div>
        </header>

        {error && <Alert tone="error" title="Algo salió mal">{error}</Alert>}

        <section style={{ display: "flex", gap: "var(--adc-space-4)" }}>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              setError(null);
              setCreateModal({ open: true, name: "" });
            }}
            style={{
              flex: 1,
              justifyContent: "center",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <FolderPlus size={16} /> Crear nuevo proyecto
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={handleOpenExisting}
            style={{
              flex: 1,
              justifyContent: "center",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <FolderOpen size={16} /> Abrir proyecto existente
          </Button>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-3)" }}>
          <h2
            style={{
              margin: 0,
              fontSize: "var(--adc-fs-sm)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--adc-fg-muted-strong)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <History size={14} /> Recientes
          </h2>
          {recent.length === 0
            ? (
              <EmptyState
                glyph="∅"
                title="Sin proyectos recientes"
                description="Cuando crees o abras un proyecto, aparecerá aquí."
              />
            )
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-2)" }}>
                {recent.map((p) => (
                  <Card
                    key={p.path}
                    onClick={() => handleRecentClick(p)}
                    style={{
                      cursor: busy ? "wait" : "pointer",
                      padding: "var(--adc-space-4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--adc-space-4)",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{ fontWeight: "var(--adc-fw-bold)", fontSize: "var(--adc-fs-md)" }}
                      >
                        {p.project_name}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--adc-fs-xs)",
                          color: "var(--adc-fg-muted-strong)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {p.path}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(ev) => handleForget(p, ev)}
                      aria-label="Olvidar proyecto"
                      style={{
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                        color: "var(--adc-fg-muted-strong)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        height: 28,
                      }}
                    >
                      <X size={16} />
                    </button>
                  </Card>
                ))}
              </div>
            )}
        </section>
      </div>

      <Modal
        open={createModal.open}
        onClose={() => setCreateModal({ open: false, name: "" })}
        title="Nuevo proyecto qastor"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateModal({ open: false, name: "" })}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={busy}>
              Continuar
            </Button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-4)" }}>
          <p
            style={{ margin: 0, fontSize: "var(--adc-fs-sm)", color: "var(--adc-fg-muted-strong)" }}
          >
            Después de elegir nombre, te pediré una carpeta padre donde crear el proyecto.
          </p>
          <div className="adc-field">
            <label className="adc-label">Nombre del proyecto</label>
            <input
              autoFocus
              className="adc-input"
              value={createModal.name}
              onChange={(e) => setCreateModal({ open: true, name: e.target.value })}
              placeholder="ej. mi-app-pos"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!initModal}
        onClose={() => setInitModal(null)}
        title="Inicializar carpeta existente"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInitModal(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleInitialize} disabled={busy}>
              Inicializar aquí
            </Button>
          </>
        }
      >
        {initModal && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--adc-space-3)" }}>
            <p style={{ margin: 0 }}>
              Esta carpeta tiene casos de prueba pero no es un proyecto qastor todavía. Voy a crear
              <code style={{ marginLeft: 4, marginRight: 4 }}>qastor.json</code> aquí
              {!initModal.detectedModules.length ? "" : " con los módulos detectados"}
              {initModal.hasIndexJson ? " y a importar las suites de index.json" : ""}. No toco tus
              archivos existentes.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--adc-fs-sm)" }}>
              <li>
                Carpeta: <code>{initModal.dir}</code>
              </li>
              <li>Casos detectados: {initModal.caseCount}</li>
              {initModal.detectedModules.length > 0 && (
                <li>Módulos: {initModal.detectedModules.join(", ")}</li>
              )}
              {initModal.hasIndexJson && <li>Detecté index.json — copiaré las suites.</li>}
            </ul>
          </div>
        )}
      </Modal>
    </main>
  );
}
