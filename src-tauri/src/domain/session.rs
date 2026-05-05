use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CaseStatus {
    Pending,
    Running,
    Passed,
    Failed,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    Pending,
    Passed,
    Failed,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum EvidenceItem {
    Screenshot {
        /// Path relative to the session_dir (e.g., "evidence/TC-X-001/step-1.png").
        path: String,
        captured_at: DateTime<Utc>,
    },
    Text {
        content: String,
        captured_at: DateTime<Utc>,
        #[serde(skip_serializing_if = "Option::is_none")]
        label: Option<String>,
    },
    File {
        path: String,
        filename: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        mime: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        size_bytes: Option<u64>,
        captured_at: DateTime<Utc>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step: u32,
    pub status: StepStatus,
    /// Legacy: relative paths to screenshots, kept for backwards compatibility
    /// with sessions created before the rich-evidence model. New captures
    /// also write to `evidence_items`. The aggregator in `list_case_evidence`
    /// merges both into a single typed stream for the frontend.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence_paths: Vec<String>,
    /// Typed evidence items: screenshot, text, or file.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence_items: Vec<EvidenceItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub captured_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseResult {
    pub case_id: String,
    pub status: CaseStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<DateTime<Utc>>,
    pub steps: Vec<StepResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub session_id: String,
    pub started_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build_version: Option<String>,
    pub case_results: Vec<CaseResult>,
}
