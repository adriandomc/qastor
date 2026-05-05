use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::PathBuf;

pub const CURRENT_VERSION: &str = "0.1";
pub const DEFAULT_SESSION_DIR: &str = ".qastor-runs";

/// Configuration at the root of every qastor project (`qastor.json`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectConfig {
    pub qastor_version: String,
    pub project_name: String,
    pub created_at: DateTime<Utc>,

    /// Mapping ID prefix (e.g., "AUTH") to folder relative to project root
    /// (e.g., "auth"). Lets the semantic `module` field diverge from the
    /// on-disk folder layout — the folder is decided by ID prefix.
    #[serde(default)]
    pub module_folders: BTreeMap<String, String>,

    /// Named suites: name → array of case IDs to execute together.
    /// Editable from Settings. Sourced from index.json on initialization
    /// when present.
    #[serde(default)]
    pub suites: BTreeMap<String, Vec<String>>,

    #[serde(default = "default_session_dir")]
    pub default_session_dir: String,
}

fn default_session_dir() -> String {
    DEFAULT_SESSION_DIR.to_string()
}

impl ProjectConfig {
    pub fn new(project_name: String) -> Self {
        Self {
            qastor_version: CURRENT_VERSION.to_string(),
            project_name,
            created_at: Utc::now(),
            module_folders: BTreeMap::new(),
            suites: BTreeMap::new(),
            default_session_dir: DEFAULT_SESSION_DIR.to_string(),
        }
    }
}

/// Lightweight reference for the "recent projects" list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRef {
    pub path: PathBuf,
    pub project_name: String,
    pub last_opened: DateTime<Utc>,
}

/// Result of validating a folder for project compatibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ValidationResult {
    /// Folder has a valid qastor.json — open directly.
    Valid { config: ProjectConfig },
    /// No qastor.json, but contains test case JSONs that match the schema.
    /// Offer to initialize without touching the cases.
    InitializableExisting {
        case_count: usize,
        detected_modules: Vec<String>,
        has_index_json: bool,
    },
    /// Folder doesn't look like a qastor project.
    NotAProject { reason: String },
    /// qastor.json exists but is unparseable.
    Invalid { error: String },
}
