use crate::domain::{EvidenceItem, Session};
use crate::services::session_state::ActiveSession;
use crate::util::atomic_write::atomic_write;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

type CmdResult<T> = Result<T, String>;

#[cfg(target_os = "macos")]
#[derive(Debug)]
pub enum CaptureFailure {
    UserCancelled,
    PermissionLikelyDenied,
    Other(String),
}

#[cfg(target_os = "macos")]
impl std::fmt::Display for CaptureFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UserCancelled => write!(f, "captura cancelada (cerraste la selección con Esc)"),
            Self::PermissionLikelyDenied => write!(
                f,
                "macOS no le dio permiso de Screen Recording a qastor. \
                Abre System Settings → Privacy & Security → Screen Recording \
                y agrega/activa qastor (o el binario de cargo en dev). Reinicia la app."
            ),
            Self::Other(m) => write!(f, "{m}"),
        }
    }
}

/// Capture an interactive region selection (macOS native picker for now).
/// Returns the absolute path of the resulting PNG.
#[tauri::command]
pub fn capture_region() -> CmdResult<String> {
    let path = make_temp_path("region")?;
    run_screencapture(&["-i", "-s", "-t", "png"], &path)
}

#[tauri::command]
pub fn capture_full_screen() -> CmdResult<String> {
    let path = make_temp_path("full")?;
    run_screencapture(&["-x", "-t", "png"], &path)
}

#[tauri::command]
pub fn capture_window() -> CmdResult<String> {
    let path = make_temp_path("window")?;
    run_screencapture(&["-W", "-t", "png"], &path)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureStepResult {
    pub absolute_path: String,
    pub relative_path: String,
    pub session: Session,
}

/// Capture a region into the active session's evidence directory and
/// register the path on the corresponding step. Requires an active session.
#[tauri::command]
pub fn capture_step(
    state: State<'_, ActiveSession>,
    case_id: String,
    step: u32,
) -> CmdResult<CaptureStepResult> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let active = guard
        .as_mut()
        .ok_or_else(|| "no hay sesión activa".to_string())?;

    let evidence_dir = active.session_dir.join("evidence").join(&case_id);
    std::fs::create_dir_all(&evidence_dir).map_err(|e| format!("create evidence dir: {e}"))?;

    // Allow multiple captures per step: step-N.png, step-N-2.png, …
    let case = active
        .session
        .case_results
        .iter()
        .find(|c| c.case_id == case_id)
        .ok_or_else(|| format!("caso {case_id} no está en la sesión"))?;
    let existing_for_step = case
        .steps
        .iter()
        .find(|s| s.step == step)
        .map(|s| s.evidence_paths.len())
        .unwrap_or(0);
    let suffix = if existing_for_step == 0 {
        String::new()
    } else {
        format!("-{}", existing_for_step + 1)
    };
    let filename = format!("step-{step}{suffix}.png");
    let absolute = evidence_dir.join(&filename);

    run_screencapture(&["-i", "-s", "-t", "png"], &absolute)?;

    let relative = format!("evidence/{case_id}/{filename}");
    let now = Utc::now();

    // Update the step in session
    let case = active
        .session
        .case_results
        .iter_mut()
        .find(|c| c.case_id == case_id)
        .ok_or_else(|| format!("caso {case_id} no está en la sesión"))?;
    if case.started_at.is_none() {
        case.started_at = Some(now);
    }
    let step_result = case
        .steps
        .iter_mut()
        .find(|s| s.step == step)
        .ok_or_else(|| format!("step {step} no encontrado"))?;
    // Dual write: legacy paths (for older readers) + typed item.
    step_result.evidence_paths.push(relative.clone());
    step_result.evidence_items.push(EvidenceItem::Screenshot {
        path: relative.clone(),
        captured_at: now,
    });
    step_result.captured_at = Some(now);

    let session_path = active.session_dir.join("session.json");
    let bytes = serde_json::to_vec_pretty(&active.session).map_err(|e| e.to_string())?;
    atomic_write(&session_path, &bytes).map_err(|e| e.to_string())?;

    Ok(CaptureStepResult {
        absolute_path: absolute.to_string_lossy().to_string(),
        relative_path: relative,
        session: active.session.clone(),
    })
}

/// Read the system clipboard as text and attach it to the given step. Empty
/// clipboard results in an error so the user knows nothing was captured.
#[tauri::command]
pub fn paste_clipboard_to_step<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ActiveSession>,
    case_id: String,
    step: u32,
    label: Option<String>,
) -> CmdResult<Session> {
    let content = app
        .clipboard()
        .read_text()
        .map_err(|e| format!("no se pudo leer el clipboard: {e}"))?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err("el clipboard está vacío. Copia texto primero (Cmd+C).".to_string());
    }

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let active = guard
        .as_mut()
        .ok_or_else(|| "no hay sesión activa".to_string())?;

    let now = Utc::now();
    let case = active
        .session
        .case_results
        .iter_mut()
        .find(|c| c.case_id == case_id)
        .ok_or_else(|| format!("caso {case_id} no está en la sesión"))?;
    if case.started_at.is_none() {
        case.started_at = Some(now);
    }
    let step_result = case
        .steps
        .iter_mut()
        .find(|s| s.step == step)
        .ok_or_else(|| format!("step {step} no encontrado"))?;

    step_result.evidence_items.push(EvidenceItem::Text {
        content: content.clone(),
        captured_at: now,
        label,
    });
    step_result.captured_at = Some(now);

    let session_path = active.session_dir.join("session.json");
    let bytes = serde_json::to_vec_pretty(&active.session).map_err(|e| e.to_string())?;
    atomic_write(&session_path, &bytes).map_err(|e| e.to_string())?;

    Ok(active.session.clone())
}

/// Copy a user-chosen file into the active session's evidence directory and
/// register it on the step. The frontend opens the native dialog and passes
/// the chosen absolute path to this command.
#[tauri::command]
pub fn attach_step_file(
    state: State<'_, ActiveSession>,
    case_id: String,
    step: u32,
    source_path: String,
) -> CmdResult<Session> {
    let source = PathBuf::from(&source_path);
    if !source.is_file() {
        return Err(format!("no es un archivo: {}", source.display()));
    }

    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let active = guard
        .as_mut()
        .ok_or_else(|| "no hay sesión activa".to_string())?;

    let evidence_dir = active.session_dir.join("evidence").join(&case_id);
    std::fs::create_dir_all(&evidence_dir).map_err(|e| format!("create evidence dir: {e}"))?;

    let original_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment")
        .to_string();

    // Compute a unique destination filename: step-N-<filename> (or with -2,
    // -3 if a file with the same basename already exists for this step).
    let dest_name = unique_dest_name(&evidence_dir, step, &original_name);
    let dest_path = evidence_dir.join(&dest_name);
    std::fs::copy(&source, &dest_path).map_err(|e| format!("copy file: {e}"))?;

    let size_bytes = std::fs::metadata(&dest_path).ok().map(|m| m.len());
    let mime = detect_mime(&dest_path);
    let relative = format!("evidence/{case_id}/{dest_name}");
    let now = Utc::now();

    let case = active
        .session
        .case_results
        .iter_mut()
        .find(|c| c.case_id == case_id)
        .ok_or_else(|| format!("caso {case_id} no está en la sesión"))?;
    if case.started_at.is_none() {
        case.started_at = Some(now);
    }
    let step_result = case
        .steps
        .iter_mut()
        .find(|s| s.step == step)
        .ok_or_else(|| format!("step {step} no encontrado"))?;

    step_result.evidence_items.push(EvidenceItem::File {
        path: relative,
        filename: original_name,
        mime,
        size_bytes,
        captured_at: now,
    });
    step_result.captured_at = Some(now);

    let session_path = active.session_dir.join("session.json");
    let bytes = serde_json::to_vec_pretty(&active.session).map_err(|e| e.to_string())?;
    atomic_write(&session_path, &bytes).map_err(|e| e.to_string())?;

    Ok(active.session.clone())
}

/// Identifies an evidence item for delete/update operations. Frontend
/// passes one of these match keys; the backend resolves it against the
/// step's `evidence_items` first, falling back to `evidence_paths` for
/// legacy screenshots that haven't been migrated.
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EvidenceMatchKey {
    /// Match a screenshot or file by its path relative to session_dir.
    Path { path: String },
    /// Match a text item by its captured_at ISO timestamp.
    Text { captured_at: String },
}

#[tauri::command]
pub fn delete_step_evidence(
    state: State<'_, ActiveSession>,
    session_dir: String,
    case_id: String,
    step: u32,
    match_key: EvidenceMatchKey,
) -> CmdResult<()> {
    mutate_session_evidence(state, &session_dir, &case_id, step, |sr| {
        delete_one(sr, &session_dir, &match_key)
    })
}

#[tauri::command]
pub fn update_step_text_evidence(
    state: State<'_, ActiveSession>,
    session_dir: String,
    case_id: String,
    step: u32,
    captured_at: String,
    content: String,
) -> CmdResult<()> {
    mutate_session_evidence(state, &session_dir, &case_id, step, |sr| {
        for item in sr.evidence_items.iter_mut() {
            if let EvidenceItem::Text {
                captured_at: ts,
                content: c,
                ..
            } = item
            {
                if ts.to_rfc3339() == captured_at {
                    *c = content.clone();
                    return Ok(());
                }
            }
        }
        Err(format!(
            "evidencia de texto con timestamp {captured_at} no encontrada"
        ))
    })
}

fn delete_one(
    sr: &mut crate::domain::StepResult,
    session_dir: &str,
    key: &EvidenceMatchKey,
) -> CmdResult<()> {
    match key {
        EvidenceMatchKey::Path { path } => {
            // Try evidence_items first.
            if let Some(idx) = sr.evidence_items.iter().position(|it| match it {
                EvidenceItem::Screenshot { path: p, .. } => p == path,
                EvidenceItem::File { path: p, .. } => p == path,
                _ => false,
            }) {
                let _ = sr.evidence_items.remove(idx);
            }
            // Always also remove from legacy paths (dual-write back-compat).
            sr.evidence_paths.retain(|p| p != path);
            // Remove the file from disk.
            let abs = std::path::PathBuf::from(session_dir).join(path);
            if abs.is_file() {
                let _ = std::fs::remove_file(&abs);
            }
            Ok(())
        }
        EvidenceMatchKey::Text { captured_at } => {
            let before = sr.evidence_items.len();
            sr.evidence_items.retain(|it| match it {
                EvidenceItem::Text {
                    captured_at: ts, ..
                } => ts.to_rfc3339() != *captured_at,
                _ => true,
            });
            if sr.evidence_items.len() == before {
                return Err(format!(
                    "evidencia de texto con timestamp {captured_at} no encontrada"
                ));
            }
            Ok(())
        }
    }
}

/// Open `<session_dir>/session.json`, mutate the matching step in place,
/// persist atomically, and if that session is currently active also update
/// the in-memory state so SessionRunner sees the change next render.
fn mutate_session_evidence<F>(
    state: State<'_, ActiveSession>,
    session_dir: &str,
    case_id: &str,
    step: u32,
    mutate: F,
) -> CmdResult<()>
where
    F: FnOnce(&mut crate::domain::StepResult) -> CmdResult<()>,
{
    let session_path = std::path::PathBuf::from(session_dir).join("session.json");
    let bytes = std::fs::read(&session_path).map_err(|e| format!("read session.json: {e}"))?;
    let mut session: Session =
        serde_json::from_slice(&bytes).map_err(|e| format!("parse session.json: {e}"))?;

    {
        let case = session
            .case_results
            .iter_mut()
            .find(|c| c.case_id == case_id)
            .ok_or_else(|| format!("caso {case_id} no está en la sesión"))?;
        let sr = case
            .steps
            .iter_mut()
            .find(|s| s.step == step)
            .ok_or_else(|| format!("step {step} no encontrado"))?;
        mutate(sr)?;
    }

    let new_bytes = serde_json::to_vec_pretty(&session).map_err(|e| e.to_string())?;
    atomic_write(&session_path, &new_bytes).map_err(|e| e.to_string())?;

    // Sync the active state if this is the active session.
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(active) = guard.as_mut() {
        if active.session_dir.to_string_lossy() == session_dir {
            active.session = session;
        }
    }
    Ok(())
}

fn unique_dest_name(dir: &Path, step: u32, original: &str) -> String {
    let prefix = format!("step-{step}-");
    let candidate = format!("{prefix}{original}");
    if !dir.join(&candidate).exists() {
        return candidate;
    }
    // Append numeric suffix before the extension.
    let (stem, ext) = match original.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (original.to_string(), String::new()),
    };
    for n in 2..1000 {
        let alt = format!("{prefix}{stem}-{n}{ext}");
        if !dir.join(&alt).exists() {
            return alt;
        }
    }
    format!("{prefix}{}-{}", uuid_like(), original)
}

fn uuid_like() -> String {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{ts:x}")
}

fn detect_mime(path: &Path) -> Option<String> {
    if let Ok(Some(kind)) = infer::get_from_path(path) {
        return Some(kind.mime_type().to_string());
    }
    // Fallback by extension for text-like files (infer often can't detect them).
    let ext = path
        .extension()
        .and_then(|e| e.to_str())?
        .to_ascii_lowercase();
    let mime = match ext.as_str() {
        "txt" | "log" => "text/plain",
        "md" => "text/markdown",
        "json" => "application/json",
        "xml" => "application/xml",
        "csv" => "text/csv",
        "html" | "htm" => "text/html",
        _ => return None,
    };
    Some(mime.to_string())
}

#[cfg(target_os = "macos")]
fn run_screencapture(args: &[&str], path: &PathBuf) -> CmdResult<String> {
    let mut cmd = Command::new("screencapture");
    cmd.args(args).arg(path);
    log::info!("screencapture {:?} {}", args, path.display());
    let output = cmd
        .output()
        .map_err(|e| format!("no se pudo lanzar screencapture: {e}"))?;

    let exit_code = output.status.code();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    log::info!(
        "screencapture exit={:?} stdout={:?} stderr={:?} file_exists={}",
        exit_code,
        stdout,
        stderr,
        path.is_file()
    );

    if !output.status.success() {
        // Non-zero exit: probably TCC denial.
        let stderr_lower = stderr.to_lowercase();
        if stderr_lower.contains("not authorized") || stderr_lower.contains("permission") {
            return Err(CaptureFailure::PermissionLikelyDenied.to_string());
        }
        return Err(CaptureFailure::Other(format!(
            "screencapture exit {} — stderr: {}",
            exit_code
                .map(|c| c.to_string())
                .unwrap_or_else(|| "?".into()),
            if stderr.is_empty() {
                "(vacío)"
            } else {
                stderr.as_str()
            }
        ))
        .to_string());
    }

    if !path.is_file() {
        // exit 0 but no file: macOS distinguishes Esc-cancel (silent) from
        // permission denial (which sometimes also exits 0 but writes nothing).
        // Heuristic: if the temp dir is writable and we can't pin down a
        // permission error, assume user cancellation.
        if !output.stderr.is_empty() {
            return Err(CaptureFailure::PermissionLikelyDenied.to_string());
        }
        return Err(CaptureFailure::UserCancelled.to_string());
    }

    Ok(path.to_string_lossy().to_string())
}

#[cfg(not(target_os = "macos"))]
fn run_screencapture(_args: &[&str], _path: &PathBuf) -> CmdResult<String> {
    Err("captura sólo implementada para macOS en v0.1 (Linux/Windows en Phase 9)".to_string())
}

fn make_temp_path(kind: &str) -> CmdResult<PathBuf> {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let dir = std::env::temp_dir().join("qastor-captures");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("qastor-{kind}-{ts}.png")))
}
