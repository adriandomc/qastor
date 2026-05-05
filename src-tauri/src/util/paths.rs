use std::path::{Path, PathBuf};

pub const QASTOR_CONFIG_FILE: &str = "qastor.json";
pub const QASTOR_SCHEMA_FILE: &str = "schema.json";
pub const QASTOR_INDEX_FILE: &str = "index.json";
pub const QASTOR_README_FILE: &str = "README.md";

pub fn config_path(project_root: &Path) -> PathBuf {
    project_root.join(QASTOR_CONFIG_FILE)
}

pub fn schema_path(project_root: &Path) -> PathBuf {
    project_root.join(QASTOR_SCHEMA_FILE)
}

pub fn index_path(project_root: &Path) -> PathBuf {
    project_root.join(QASTOR_INDEX_FILE)
}

pub fn readme_path(project_root: &Path) -> PathBuf {
    project_root.join(QASTOR_README_FILE)
}
