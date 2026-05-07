use crate::domain::{
    CaseResult, CaseStatus, EvidenceItem, ProjectConfig, Session, StepResult, StepStatus, TestCase,
};
use crate::services::session_state::{ActiveSession, ActiveSessionState};
use crate::util::atomic_write::atomic_write;
use crate::util::paths::config_path;
use chrono::DateTime;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::State;
use walkdir::WalkDir;

type CmdResult<T> = Result<T, String>;

const SESSION_FILE: &str = "session.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSessionInfo {
    pub session: Session,
    pub session_dir: String,
}

#[tauri::command]
pub fn start_session(
    state: State<'_, ActiveSession>,
    project_root: String,
    case_ids: Vec<String>,
) -> CmdResult<ActiveSessionInfo> {
    if case_ids.is_empty() {
        return Err("se requiere al menos un caso".to_string());
    }
    let root = PathBuf::from(&project_root);
    if !root.is_dir() {
        return Err(format!(
            "project root no es un directorio: {}",
            root.display()
        ));
    }

    // Read project config for default_session_dir
    let cfg_bytes =
        std::fs::read(config_path(&root)).map_err(|e| format!("read qastor.json: {e}"))?;
    let config: ProjectConfig =
        serde_json::from_slice(&cfg_bytes).map_err(|e| format!("parse qastor.json: {e}"))?;

    // Collect referenced cases in a single pass
    let cases = collect_cases_by_id(&root, &case_ids)?;

    // Build CaseResults preserving requested order
    let mut case_results: Vec<CaseResult> = Vec::with_capacity(case_ids.len());
    for id in &case_ids {
        let test_case = cases
            .get(id)
            .ok_or_else(|| format!("caso {id} no encontrado en el proyecto"))?;
        let steps: Vec<StepResult> = test_case
            .steps
            .iter()
            .map(|s| StepResult {
                step: s.step,
                status: StepStatus::Pending,
                evidence_paths: Vec::new(),
                evidence_items: Vec::new(),
                notes: None,
                captured_at: None,
            })
            .collect();
        case_results.push(CaseResult {
            case_id: id.clone(),
            status: CaseStatus::Pending,
            started_at: None,
            ended_at: None,
            steps,
        });
    }

    let now = Utc::now();
    let session = Session {
        session_id: uuid::Uuid::new_v4().to_string(),
        started_at: now,
        ended_at: None,
        executor: None,
        build_version: None,
        case_results,
    };

    // Create session dir: <root>/<default_session_dir>/<timestamp>/
    let dir_name = now.format("%Y-%m-%dT%H-%M-%SZ").to_string();
    let session_dir = root.join(&config.default_session_dir).join(&dir_name);
    std::fs::create_dir_all(&session_dir).map_err(|e| format!("create session dir: {e}"))?;
    std::fs::create_dir_all(session_dir.join("evidence"))
        .map_err(|e| format!("create evidence dir: {e}"))?;

    write_session(&session_dir, &session)?;

    let session_dir_str = session_dir.to_string_lossy().to_string();
    *state.0.lock().map_err(|e| e.to_string())? = Some(ActiveSessionState {
        session: session.clone(),
        session_dir,
    });

    Ok(ActiveSessionInfo {
        session,
        session_dir: session_dir_str,
    })
}

#[tauri::command]
pub fn get_active_session(state: State<'_, ActiveSession>) -> CmdResult<Option<ActiveSessionInfo>> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|s| ActiveSessionInfo {
        session: s.session.clone(),
        session_dir: s.session_dir.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub fn mark_step(
    state: State<'_, ActiveSession>,
    case_id: String,
    step: u32,
    status: StepStatus,
    notes: Option<String>,
) -> CmdResult<Session> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let active = guard
        .as_mut()
        .ok_or_else(|| "no hay sesión activa".to_string())?;

    let case = active
        .session
        .case_results
        .iter_mut()
        .find(|c| c.case_id == case_id)
        .ok_or_else(|| format!("caso {case_id} no está en la sesión"))?;

    if case.started_at.is_none() {
        case.started_at = Some(Utc::now());
    }

    let step_result = case
        .steps
        .iter_mut()
        .find(|s| s.step == step)
        .ok_or_else(|| format!("step {step} no encontrado en {case_id}"))?;

    step_result.status = status.clone();
    if notes.is_some() {
        step_result.notes = notes;
    }

    // Update overall case status: if any failed/blocked → that wins; else if all passed → passed; else running.
    let all_done = case.steps.iter().all(|s| s.status != StepStatus::Pending);
    let any_failed = case.steps.iter().any(|s| s.status == StepStatus::Failed);
    let any_blocked = case.steps.iter().any(|s| s.status == StepStatus::Blocked);

    case.status = if all_done {
        if any_failed {
            CaseStatus::Failed
        } else if any_blocked {
            CaseStatus::Blocked
        } else {
            CaseStatus::Passed
        }
    } else {
        CaseStatus::Running
    };

    if matches!(
        case.status,
        CaseStatus::Passed | CaseStatus::Failed | CaseStatus::Blocked
    ) && case.ended_at.is_none()
    {
        case.ended_at = Some(Utc::now());
    }

    write_session(&active.session_dir, &active.session)?;
    Ok(active.session.clone())
}

#[tauri::command]
pub fn end_session(state: State<'_, ActiveSession>) -> CmdResult<Session> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    let active = guard
        .as_mut()
        .ok_or_else(|| "no hay sesión activa".to_string())?;

    active.session.ended_at = Some(Utc::now());
    // Mark any running cases as blocked? Or leave as-is? Master plan
    // doesn't say. Leave as-is — user explicitly ended without finishing.
    write_session(&active.session_dir, &active.session)?;

    let final_session = active.session.clone();
    *guard = None;
    Ok(final_session)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRef {
    pub session_id: String,
    pub session_dir: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub ended_at: Option<chrono::DateTime<chrono::Utc>>,
    pub case_count: usize,
    pub passed: usize,
    pub failed: usize,
    pub blocked: usize,
}

#[tauri::command]
pub fn list_sessions(project_root: String) -> CmdResult<Vec<SessionRef>> {
    let root = PathBuf::from(&project_root);
    let cfg_bytes =
        std::fs::read(config_path(&root)).map_err(|e| format!("read qastor.json: {e}"))?;
    let config: ProjectConfig =
        serde_json::from_slice(&cfg_bytes).map_err(|e| format!("parse qastor.json: {e}"))?;
    let runs_dir = root.join(&config.default_session_dir);
    if !runs_dir.is_dir() {
        return Ok(vec![]);
    }
    let mut out: Vec<SessionRef> = Vec::new();
    for entry in std::fs::read_dir(&runs_dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let p = entry.path();
        if !p.is_dir() {
            continue;
        }
        let session_path = p.join(SESSION_FILE);
        if !session_path.is_file() {
            continue;
        }
        let bytes = match std::fs::read(&session_path) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let s: Session = match serde_json::from_slice(&bytes) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let passed = s
            .case_results
            .iter()
            .filter(|c| c.status == CaseStatus::Passed)
            .count();
        let failed = s
            .case_results
            .iter()
            .filter(|c| c.status == CaseStatus::Failed)
            .count();
        let blocked = s
            .case_results
            .iter()
            .filter(|c| c.status == CaseStatus::Blocked)
            .count();
        out.push(SessionRef {
            session_id: s.session_id,
            session_dir: p.to_string_lossy().to_string(),
            started_at: s.started_at,
            ended_at: s.ended_at,
            case_count: s.case_results.len(),
            passed,
            failed,
            blocked,
        });
    }
    out.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(out)
}

// --- Per-case evidence aggregator -------------------------------------------

/// Resolved evidence item: paths are absolute so the frontend can pass them
/// straight to `convertFileSrc`. Mirrors the disk-side `EvidenceItem` enum
/// but with absolute paths.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ResolvedEvidence {
    Screenshot {
        /// Absolute path on disk, ready for `convertFileSrc` / `openPath`.
        path: String,
        /// Path relative to `session_dir` — used as the match key when the
        /// frontend asks the backend to delete this item.
        relative_path: String,
        captured_at: DateTime<chrono::Utc>,
    },
    Text {
        content: String,
        captured_at: DateTime<chrono::Utc>,
        label: Option<String>,
    },
    File {
        path: String,
        relative_path: String,
        filename: String,
        mime: Option<String>,
        size_bytes: Option<u64>,
        captured_at: DateTime<chrono::Utc>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseStepEvidence {
    pub step: u32,
    pub status: StepStatus,
    /// Resolved (absolute) evidence items, merged from both legacy
    /// `evidence_paths` and the new `evidence_items`. Order: items first
    /// (in their stored order), then any legacy paths not already represented.
    pub evidence_items: Vec<ResolvedEvidence>,
    pub captured_at: Option<DateTime<chrono::Utc>>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseEvidenceFromSession {
    pub session_id: String,
    pub session_dir: String,
    pub started_at: DateTime<chrono::Utc>,
    pub ended_at: Option<DateTime<chrono::Utc>>,
    pub case_status: CaseStatus,
    pub steps: Vec<CaseStepEvidence>,
}

/// Walks `.qastor-runs/` and returns every session that recorded evidence for
/// the given case_id, with absolute paths. Most recent session first.
#[tauri::command]
pub fn list_case_evidence(
    project_root: String,
    case_id: String,
) -> CmdResult<Vec<CaseEvidenceFromSession>> {
    let root = PathBuf::from(&project_root);
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root.display()));
    }
    let cfg_bytes =
        std::fs::read(config_path(&root)).map_err(|e| format!("read qastor.json: {e}"))?;
    let config: ProjectConfig =
        serde_json::from_slice(&cfg_bytes).map_err(|e| format!("parse qastor.json: {e}"))?;
    let runs_dir = root.join(&config.default_session_dir);
    if !runs_dir.is_dir() {
        return Ok(vec![]);
    }

    let mut results: Vec<CaseEvidenceFromSession> = Vec::new();
    let entries = std::fs::read_dir(&runs_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let session_dir_path = entry.path();
        if !session_dir_path.is_dir() {
            continue;
        }
        let session_path = session_dir_path.join(SESSION_FILE);
        if !session_path.is_file() {
            continue;
        }
        let bytes = match std::fs::read(&session_path) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let s: Session = match serde_json::from_slice(&bytes) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let case = match s.case_results.iter().find(|c| c.case_id == case_id) {
            Some(c) => c,
            None => continue,
        };
        let has_evidence = case
            .steps
            .iter()
            .any(|st| !st.evidence_paths.is_empty() || !st.evidence_items.is_empty());
        if !has_evidence {
            continue;
        }

        let session_dir_str = session_dir_path.to_string_lossy().to_string();
        let steps: Vec<CaseStepEvidence> = case
            .steps
            .iter()
            .filter(|st| !st.evidence_paths.is_empty() || !st.evidence_items.is_empty())
            .map(|st| CaseStepEvidence {
                step: st.step,
                status: st.status.clone(),
                evidence_items: resolve_step_evidence(&session_dir_str, st),
                captured_at: st.captured_at,
                notes: st.notes.clone(),
            })
            .collect();

        results.push(CaseEvidenceFromSession {
            session_id: s.session_id,
            session_dir: session_dir_str,
            started_at: s.started_at,
            ended_at: s.ended_at,
            case_status: case.status.clone(),
            steps,
        });
    }
    results.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(results)
}

// --- helpers ---------------------------------------------------------------

fn resolve_step_evidence(session_dir: &str, st: &StepResult) -> Vec<ResolvedEvidence> {
    let mut out: Vec<ResolvedEvidence> = Vec::new();
    let mut seen_paths: std::collections::HashSet<String> = std::collections::HashSet::new();

    for item in &st.evidence_items {
        match item {
            EvidenceItem::Screenshot { path, captured_at } => {
                seen_paths.insert(path.clone());
                out.push(ResolvedEvidence::Screenshot {
                    path: format!("{session_dir}/{path}"),
                    relative_path: path.clone(),
                    captured_at: *captured_at,
                });
            }
            EvidenceItem::Text {
                content,
                captured_at,
                label,
            } => {
                out.push(ResolvedEvidence::Text {
                    content: content.clone(),
                    captured_at: *captured_at,
                    label: label.clone(),
                });
            }
            EvidenceItem::File {
                path,
                filename,
                mime,
                size_bytes,
                captured_at,
            } => {
                seen_paths.insert(path.clone());
                out.push(ResolvedEvidence::File {
                    path: format!("{session_dir}/{path}"),
                    relative_path: path.clone(),
                    filename: filename.clone(),
                    mime: mime.clone(),
                    size_bytes: *size_bytes,
                    captured_at: *captured_at,
                });
            }
        }
    }

    // Backfill legacy `evidence_paths` that weren't already emitted by typed
    // items (sessions from before the dual-write refactor).
    for rel in &st.evidence_paths {
        if seen_paths.contains(rel) {
            continue;
        }
        out.push(ResolvedEvidence::Screenshot {
            path: format!("{session_dir}/{rel}"),
            relative_path: rel.clone(),
            captured_at: st.captured_at.unwrap_or_else(chrono::Utc::now),
        });
    }
    out
}

fn write_session(session_dir: &Path, session: &Session) -> CmdResult<()> {
    let path = session_dir.join(SESSION_FILE);
    let bytes = serde_json::to_vec_pretty(session).map_err(|e| e.to_string())?;
    atomic_write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

fn collect_cases_by_id(root: &Path, ids: &[String]) -> Result<HashMap<String, TestCase>, String> {
    let want: HashSet<&str> = ids.iter().map(String::as_str).collect();
    let mut out: HashMap<String, TestCase> = HashMap::new();

    for entry in WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            !e.file_name()
                .to_str()
                .map(|n| n.starts_with('.') && n != "." && n != "..")
                .unwrap_or(false)
        })
        .filter_map(|r| r.ok())
    {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let name = match p.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };
        if !name.starts_with("TC-") {
            continue;
        }
        // Quick filter: extract id-ish prefix from filename (TC-XXX-NNN)
        let bytes = match std::fs::read(p) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let case: TestCase = match serde_json::from_slice(&bytes) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if want.contains(case.id.as_str()) {
            out.insert(case.id.clone(), case);
        }
        if out.len() == want.len() {
            break;
        }
    }
    Ok(out)
}
