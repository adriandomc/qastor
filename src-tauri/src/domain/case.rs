use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TestType {
    HappyPath,
    Error,
    EdgeCase,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    Critical,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceHint {
    None,
    Screenshot,
    TextExcerpt,
    DbQuery,
    FileAttachment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestStep {
    pub step: u32,
    pub action: String,
    pub expected: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub evidence_hint: Option<EvidenceHint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCase {
    pub id: String,
    pub title: String,
    pub module: String,
    #[serde(rename = "type")]
    pub case_type: TestType,
    pub priority: Priority,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub preconditions: Vec<String>,
    pub steps: Vec<TestStep>,
    pub acceptance_criteria: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub related_files: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_minutes: Option<u32>,
}

impl TestCase {
    /// Top-level segment of `module` (e.g., "ventas.pos" -> "ventas").
    /// Used to derive a folder when `module_folders` mapping has no entry.
    pub fn module_top(&self) -> &str {
        self.module.split('.').next().unwrap_or(&self.module)
    }

    /// Parses the alphabetic prefix from the ID (e.g., "TC-AUTH-003" -> "AUTH").
    pub fn id_prefix(&self) -> Option<&str> {
        let stripped = self.id.strip_prefix("TC-")?;
        let dash = stripped.find('-')?;
        Some(&stripped[..dash])
    }
}
