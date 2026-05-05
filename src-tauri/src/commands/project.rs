use crate::domain::{ProjectConfig, ProjectRef, ValidationResult};
use crate::util::atomic_write::atomic_write;
use crate::util::paths::{
    config_path, index_path, readme_path, schema_path, QASTOR_INDEX_FILE,
};
use chrono::Utc;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

const SCHEMA_JSON: &str = include_str!("../../../schema/test-case.schema.json");
const SAMPLE_CASE_JSON: &str =
    include_str!("../../templates/TC-EJEMPLO-001-mi-primer-caso.json");
const PROJECT_README: &str = include_str!("../../templates/PROJECT_README.md");

const SETTINGS_STORE: &str = "settings.json";
const RECENT_PROJECTS_KEY: &str = "recent_projects";
const MAX_RECENT: usize = 10;

type CmdResult<T> = Result<T, String>;

// --- Project lifecycle ------------------------------------------------------

#[tauri::command]
pub fn create_project(parent_dir: String, name: String) -> CmdResult<ProjectConfig> {
    let parent = PathBuf::from(parent_dir);
    if !parent.is_dir() {
        return Err(format!(
            "parent dir does not exist or is not a directory: {}",
            parent.display()
        ));
    }
    let project_root = parent.join(&name);
    if project_root.exists() {
        return Err(format!(
            "path already exists: {}",
            project_root.display()
        ));
    }
    std::fs::create_dir_all(&project_root).map_err(|e| e.to_string())?;

    let mut config = ProjectConfig::new(name);
    // Seed with the example module so the sample case has somewhere to live.
    config
        .module_folders
        .insert("EJEMPLO".to_string(), "ejemplo".to_string());

    write_project_files(&project_root, &config, true)?;
    Ok(config)
}

#[tauri::command]
pub fn open_project(dir: String) -> CmdResult<ProjectConfig> {
    let root = PathBuf::from(dir);
    let cfg_path = config_path(&root);
    if !cfg_path.is_file() {
        return Err(format!(
            "no qastor.json found at {}",
            root.display()
        ));
    }
    let bytes = std::fs::read(&cfg_path).map_err(|e| e.to_string())?;
    let config: ProjectConfig =
        serde_json::from_slice(&bytes).map_err(|e| format!("parse qastor.json: {e}"))?;
    Ok(config)
}

#[tauri::command]
pub fn validate_project(dir: String) -> CmdResult<ValidationResult> {
    let root = PathBuf::from(dir);
    if !root.is_dir() {
        return Ok(ValidationResult::NotAProject {
            reason: format!("not a directory: {}", root.display()),
        });
    }

    let cfg_path = config_path(&root);
    if cfg_path.is_file() {
        let bytes = match std::fs::read(&cfg_path) {
            Ok(b) => b,
            Err(e) => {
                return Ok(ValidationResult::Invalid {
                    error: format!("read qastor.json: {e}"),
                });
            }
        };
        return match serde_json::from_slice::<ProjectConfig>(&bytes) {
            Ok(config) => Ok(ValidationResult::Valid { config }),
            Err(e) => Ok(ValidationResult::Invalid {
                error: format!("parse qastor.json: {e}"),
            }),
        };
    }

    // No qastor.json — does the folder look like a case dataset?
    let (count, modules) = scan_existing_cases(&root);
    if count == 0 {
        return Ok(ValidationResult::NotAProject {
            reason: "no qastor.json and no test case JSONs found".to_string(),
        });
    }
    let has_index = root.join(QASTOR_INDEX_FILE).is_file();
    Ok(ValidationResult::InitializableExisting {
        case_count: count,
        detected_modules: modules,
        has_index_json: has_index,
    })
}

#[tauri::command]
pub fn initialize_existing_folder(dir: String) -> CmdResult<ProjectConfig> {
    let root = PathBuf::from(dir);
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root.display()));
    }
    let cfg_path = config_path(&root);
    if cfg_path.is_file() {
        return Err("qastor.json already exists; use open_project instead".to_string());
    }
    let project_name = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Untitled")
        .to_string();

    let (case_count, _modules) = scan_existing_cases(&root);
    if case_count == 0 {
        return Err("no parseable test cases found in this folder".to_string());
    }

    let mut config = ProjectConfig::new(project_name);
    config.module_folders = derive_prefix_map(&root);

    // If index.json exists with `suites`, copy them as initial seed.
    let idx_path = root.join(QASTOR_INDEX_FILE);
    if idx_path.is_file() {
        if let Ok(bytes) = std::fs::read(&idx_path) {
            if let Ok(idx) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                if let Some(suites_obj) = idx.get("suites").and_then(|v| v.as_object()) {
                    for (name, value) in suites_obj {
                        if let Some(arr) = value.as_array() {
                            let ids: Vec<String> = arr
                                .iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect();
                            if !ids.is_empty() {
                                config.suites.insert(name.clone(), ids);
                            }
                        }
                    }
                }
            }
        }
    }

    write_project_files(&root, &config, false)?;
    Ok(config)
}

// --- Recent projects --------------------------------------------------------

#[tauri::command]
pub async fn get_recent_projects<R: Runtime>(app: AppHandle<R>) -> CmdResult<Vec<ProjectRef>> {
    let store = app.store(SETTINGS_STORE).map_err(|e| e.to_string())?;
    let value = store.get(RECENT_PROJECTS_KEY);
    match value {
        Some(v) => serde_json::from_value::<Vec<ProjectRef>>(v).map_err(|e| e.to_string()),
        None => Ok(vec![]),
    }
}

#[tauri::command]
pub async fn record_recent_project<R: Runtime>(
    app: AppHandle<R>,
    project_path: String,
    project_name: String,
) -> CmdResult<()> {
    let store = app.store(SETTINGS_STORE).map_err(|e| e.to_string())?;
    let mut list: Vec<ProjectRef> = match store.get(RECENT_PROJECTS_KEY) {
        Some(v) => serde_json::from_value(v).unwrap_or_default(),
        None => vec![],
    };
    let path = PathBuf::from(&project_path);
    list.retain(|p| p.path != path);
    list.insert(
        0,
        ProjectRef {
            path,
            project_name,
            last_opened: Utc::now(),
        },
    );
    list.truncate(MAX_RECENT);
    let v = serde_json::to_value(&list).map_err(|e| e.to_string())?;
    store.set(RECENT_PROJECTS_KEY, v);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_project_config(
    project_root: String,
    config: ProjectConfig,
) -> CmdResult<()> {
    let root = PathBuf::from(&project_root);
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root.display()));
    }
    let cfg_path = config_path(&root);
    let bytes = serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?;
    atomic_write(&cfg_path, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn forget_recent_project<R: Runtime>(
    app: AppHandle<R>,
    project_path: String,
) -> CmdResult<()> {
    let store = app.store(SETTINGS_STORE).map_err(|e| e.to_string())?;
    let mut list: Vec<ProjectRef> = match store.get(RECENT_PROJECTS_KEY) {
        Some(v) => serde_json::from_value(v).unwrap_or_default(),
        None => vec![],
    };
    let path = PathBuf::from(&project_path);
    list.retain(|p| p.path != path);
    let v = serde_json::to_value(&list).map_err(|e| e.to_string())?;
    store.set(RECENT_PROJECTS_KEY, v);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// --- Helpers ----------------------------------------------------------------

fn write_project_files(
    project_root: &Path,
    config: &ProjectConfig,
    include_sample_case: bool,
) -> CmdResult<()> {
    let cfg_bytes = serde_json::to_vec_pretty(config).map_err(|e| e.to_string())?;
    atomic_write(&config_path(project_root), &cfg_bytes).map_err(|e| e.to_string())?;

    // schema.json (always written; overwrite is safe — schema shouldn't drift).
    atomic_write(&schema_path(project_root), SCHEMA_JSON.as_bytes())
        .map_err(|e| e.to_string())?;

    // README.md only if missing — don't clobber user notes.
    let readme = readme_path(project_root);
    if !readme.is_file() {
        atomic_write(&readme, PROJECT_README.as_bytes()).map_err(|e| e.to_string())?;
    }

    if include_sample_case {
        let ejemplo_dir = project_root.join("ejemplo");
        std::fs::create_dir_all(&ejemplo_dir).map_err(|e| e.to_string())?;
        let sample_path = ejemplo_dir.join("TC-EJEMPLO-001-mi-primer-caso.json");
        if !sample_path.is_file() {
            atomic_write(&sample_path, SAMPLE_CASE_JSON.as_bytes())
                .map_err(|e| e.to_string())?;
        }
    }

    let _ = index_path; // keep the import alive; index.json is generated in Phase 9.
    Ok(())
}

/// Walk the root one level deep, collecting test-case-looking JSONs.
/// Returns (count, sorted list of top-level folder names containing cases).
fn scan_existing_cases(root: &Path) -> (usize, Vec<String>) {
    let mut count = 0usize;
    let mut modules = std::collections::BTreeSet::<String>::new();

    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return (0, vec![]),
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if let Ok(sub) = std::fs::read_dir(&p) {
                let mut found_in_sub = false;
                for s in sub.flatten() {
                    let sp = s.path();
                    if sp.is_file() && is_case_json(&sp) {
                        count += 1;
                        found_in_sub = true;
                    }
                }
                if found_in_sub {
                    if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
                        modules.insert(name.to_string());
                    }
                }
            }
        } else if p.is_file() && is_case_json(&p) {
            count += 1;
        }
    }
    (count, modules.into_iter().collect())
}

fn is_case_json(p: &Path) -> bool {
    if p.extension().and_then(|e| e.to_str()) != Some("json") {
        return false;
    }
    let name = match p.file_name().and_then(|n| n.to_str()) {
        Some(n) => n,
        None => return false,
    };
    if matches!(name, "qastor.json" | "schema.json" | "index.json") {
        return false;
    }
    name.starts_with("TC-")
}

/// For each top-level folder under `root`, find the most common ID prefix
/// (e.g., "AUTH" for `auth/TC-AUTH-*`) and emit `prefix → folder`.
fn derive_prefix_map(root: &Path) -> BTreeMap<String, String> {
    let mut counts: BTreeMap<String, BTreeMap<String, usize>> = BTreeMap::new();
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() {
                continue;
            }
            let folder = match p.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            if let Ok(sub) = std::fs::read_dir(&p) {
                for s in sub.flatten() {
                    let sp = s.path();
                    if !sp.is_file() || !is_case_json(&sp) {
                        continue;
                    }
                    if let Some(name) = sp.file_name().and_then(|n| n.to_str()) {
                        if let Some(prefix) = parse_prefix(name) {
                            *counts
                                .entry(prefix)
                                .or_default()
                                .entry(folder.clone())
                                .or_default() += 1;
                        }
                    }
                }
            }
        }
    }

    let mut out = BTreeMap::new();
    for (prefix, folders) in counts {
        if let Some((folder, _)) = folders.iter().max_by_key(|(_, c)| **c) {
            out.insert(prefix, folder.clone());
        }
    }
    out
}

fn parse_prefix(filename: &str) -> Option<String> {
    let stem = filename.strip_suffix(".json").unwrap_or(filename);
    let mut parts = stem.split('-');
    if parts.next()? != "TC" {
        return None;
    }
    let prefix = parts.next()?;
    if prefix.is_empty() || !prefix.chars().all(|c| c.is_ascii_uppercase()) {
        return None;
    }
    Some(prefix.to_string())
}
