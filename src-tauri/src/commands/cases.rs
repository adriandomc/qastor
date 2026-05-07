use crate::domain::{Priority, ProjectConfig, TestCase, TestType};
use crate::util::atomic_write::atomic_write;
use crate::util::paths::{config_path, index_path};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadedCase {
    pub case: TestCase,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseLoadError {
    pub path: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListCasesResult {
    pub cases: Vec<LoadedCase>,
    pub errors: Vec<CaseLoadError>,
}

type CmdResult<T> = Result<T, String>;

#[tauri::command]
pub fn list_cases(project_root: String) -> CmdResult<ListCasesResult> {
    let root = PathBuf::from(&project_root);
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root.display()));
    }
    let mut cases: Vec<LoadedCase> = Vec::new();
    let mut errors: Vec<CaseLoadError> = Vec::new();

    let walker = WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_hidden_entry(e.path()))
        .filter_map(|r| r.ok());

    for entry in walker {
        let p = entry.path();
        if !p.is_file() {
            continue;
        }
        if !is_case_json(p) {
            continue;
        }
        let path_str = p.to_string_lossy().to_string();
        match std::fs::read_to_string(p) {
            Ok(content) => match serde_json::from_str::<TestCase>(&content) {
                Ok(case) => cases.push(LoadedCase {
                    case,
                    path: path_str,
                }),
                Err(e) => errors.push(CaseLoadError {
                    path: path_str,
                    error: format!("parse: {e}"),
                }),
            },
            Err(e) => errors.push(CaseLoadError {
                path: path_str,
                error: format!("read: {e}"),
            }),
        }
    }

    // Stable order: by id ascending.
    cases.sort_by_key(|c| c.case.id.clone());
    errors.sort_by_key(|e| e.path.clone());

    Ok(ListCasesResult { cases, errors })
}

#[tauri::command]
pub fn load_case(path: String) -> CmdResult<TestCase> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| format!("parse: {e}"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveCaseResult {
    pub path: String,
    pub config: ProjectConfig,
}

/// Saves a test case as JSON to the project. Resolves the target folder via:
/// 1. `config.module_folders[id_prefix]` if it exists, OR
/// 2. The first segment of `case.module` (`module_top()`).
///
/// If neither yields a non-empty folder, falls back to `_unsorted`.
/// If `previous_path` is provided and differs from the new path, removes
/// the old file (rename semantics). If a new ID prefix is registered, the
/// project config is updated and saved.
#[tauri::command]
pub fn save_case(
    project_root: String,
    test_case: TestCase,
    previous_path: Option<String>,
) -> CmdResult<SaveCaseResult> {
    let root = PathBuf::from(&project_root);
    if !root.is_dir() {
        return Err(format!("project root not a directory: {}", root.display()));
    }

    let cfg_path = config_path(&root);
    let cfg_bytes = std::fs::read(&cfg_path).map_err(|e| format!("read qastor.json: {e}"))?;
    let mut config: ProjectConfig =
        serde_json::from_slice(&cfg_bytes).map_err(|e| format!("parse qastor.json: {e}"))?;

    let id_prefix = test_case
        .id_prefix()
        .ok_or_else(|| "case ID does not match TC-<PREFIX>-<NUM>".to_string())?
        .to_string();

    let folder = match config.module_folders.get(&id_prefix) {
        Some(f) if !f.is_empty() => f.clone(),
        _ => {
            let top = test_case.module_top();
            if top.is_empty() {
                "_unsorted".to_string()
            } else {
                top.to_string()
            }
        }
    };

    // Register new prefix if not seen before.
    let mut config_changed = false;
    if !config.module_folders.contains_key(&id_prefix) {
        config
            .module_folders
            .insert(id_prefix.clone(), folder.clone());
        config_changed = true;
    }

    let target_dir = root.join(&folder);
    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("create dir {}: {e}", target_dir.display()))?;

    let slug = slugify(&test_case.title);
    let filename = if slug.is_empty() {
        format!("{}.json", test_case.id)
    } else {
        format!("{}-{}.json", test_case.id, slug)
    };
    let target_path = target_dir.join(&filename);

    let json_bytes =
        serde_json::to_vec_pretty(&test_case).map_err(|e| format!("serialize: {e}"))?;
    atomic_write(&target_path, &json_bytes)
        .map_err(|e| format!("write {}: {e}", target_path.display()))?;

    // Move semantics: if previous path exists and differs, delete it.
    if let Some(prev) = previous_path {
        if !prev.is_empty() {
            let prev_path = PathBuf::from(prev);
            if prev_path.is_file()
                && prev_path.canonicalize().ok() != target_path.canonicalize().ok()
            {
                let _ = std::fs::remove_file(&prev_path);
            }
        }
    }

    if config_changed {
        let new_cfg_bytes = serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?;
        atomic_write(&cfg_path, &new_cfg_bytes).map_err(|e| e.to_string())?;
    }

    // Regenerate index.json so external tooling stays in sync.
    let _ = regenerate_index_inner(&root, &config);

    Ok(SaveCaseResult {
        path: target_path.to_string_lossy().to_string(),
        config,
    })
}

#[tauri::command]
pub fn delete_case(project_root: String, path: String) -> CmdResult<()> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(format!("not a file: {}", p.display()));
    }
    std::fs::remove_file(&p).map_err(|e| e.to_string())?;

    // Best-effort index refresh.
    let root = PathBuf::from(&project_root);
    if let Ok(cfg_bytes) = std::fs::read(config_path(&root)) {
        if let Ok(config) = serde_json::from_slice::<ProjectConfig>(&cfg_bytes) {
            let _ = regenerate_index_inner(&root, &config);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn regenerate_index(project_root: String) -> CmdResult<String> {
    let root = PathBuf::from(&project_root);
    if !root.is_dir() {
        return Err(format!("not a directory: {}", root.display()));
    }
    let cfg_bytes =
        std::fs::read(config_path(&root)).map_err(|e| format!("read qastor.json: {e}"))?;
    let config: ProjectConfig =
        serde_json::from_slice(&cfg_bytes).map_err(|e| format!("parse qastor.json: {e}"))?;
    regenerate_index_inner(&root, &config)
}

fn regenerate_index_inner(root: &Path, config: &ProjectConfig) -> CmdResult<String> {
    let cases_result = list_cases(root.to_string_lossy().to_string())?;
    let cases: Vec<&LoadedCase> = cases_result.cases.iter().collect();

    // Summary
    let mut by_priority: BTreeMap<&'static str, usize> = BTreeMap::new();
    let mut by_type: BTreeMap<&'static str, usize> = BTreeMap::new();
    for k in ["critical", "high", "medium", "low"] {
        by_priority.insert(k, 0);
    }
    for k in ["happy_path", "error", "edge_case"] {
        by_type.insert(k, 0);
    }
    for lc in &cases {
        *by_priority
            .entry(priority_key(&lc.case.priority))
            .or_default() += 1;
        *by_type.entry(type_key(&lc.case.case_type)).or_default() += 1;
    }

    // Group cases by their on-disk top-level folder under root.
    let mut by_folder: BTreeMap<String, Vec<&LoadedCase>> = BTreeMap::new();
    for lc in &cases {
        let p = Path::new(&lc.path);
        let rel = p.strip_prefix(root).unwrap_or(p);
        let top = rel
            .components()
            .next()
            .and_then(|c| c.as_os_str().to_str())
            .map(|s| {
                if s.ends_with(".json") {
                    "_root".to_string()
                } else {
                    s.to_string()
                }
            })
            .unwrap_or_else(|| "_root".to_string());
        by_folder.entry(top).or_default().push(lc);
    }

    let modules: Vec<serde_json::Value> = by_folder
        .iter()
        .map(|(folder, cs)| {
            let mut sorted = cs.clone();
            sorted.sort_by_key(|c| c.case.id.clone());
            let directory = if folder == "_root" {
                "./".into()
            } else {
                format!("{folder}/")
            };
            let entries: Vec<serde_json::Value> = sorted
                .iter()
                .map(|lc| {
                    let p = Path::new(&lc.path);
                    let rel = p
                        .strip_prefix(root)
                        .unwrap_or(p)
                        .to_string_lossy()
                        .to_string();
                    json!({
                        "id": lc.case.id,
                        "title": lc.case.title,
                        "type": type_key(&lc.case.case_type),
                        "priority": priority_key(&lc.case.priority),
                        "file": rel,
                    })
                })
                .collect();
            json!({
                "module": folder,
                "directory": directory,
                "cases": entries,
            })
        })
        .collect();

    let index = json!({
        "$schema": "./schema.json",
        "version": "0.1.0",
        "generated_at": Utc::now().format("%Y-%m-%d").to_string(),
        "summary": {
            "total": cases.len(),
            "by_priority": by_priority,
            "by_type": by_type,
        },
        "modules": modules,
        "suites": &config.suites,
    });

    let path = index_path(root);
    let bytes = serde_json::to_vec_pretty(&index).map_err(|e| e.to_string())?;
    atomic_write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn priority_key(p: &Priority) -> &'static str {
    match p {
        Priority::Critical => "critical",
        Priority::High => "high",
        Priority::Medium => "medium",
        Priority::Low => "low",
    }
}

fn type_key(t: &TestType) -> &'static str {
    match t {
        TestType::HappyPath => "happy_path",
        TestType::Error => "error",
        TestType::EdgeCase => "edge_case",
    }
}

/// Convert a string into a URL/filename-safe slug. Lowercase ASCII only;
/// non-alphanumerics collapse to single dashes; trims leading/trailing dashes.
/// Loses accents (`á` → `-`), which is acceptable for filename slugs since
/// the original `title` is preserved inside the JSON.
fn slugify(s: &str) -> String {
    let mut out = String::new();
    let mut prev_dash = false;
    for c in s.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

fn is_hidden_entry(p: &Path) -> bool {
    p.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.') && n != "." && n != "..")
        .unwrap_or(false)
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
