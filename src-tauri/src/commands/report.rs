use crate::domain::{CaseResult, CaseStatus, EvidenceItem, Session, StepStatus, TestCase};
use crate::util::atomic_write::atomic_write;
use std::collections::HashMap;
use std::fmt::Write;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

type CmdResult<T> = Result<T, String>;

const REPORT_FILE: &str = "report.html";
const SESSION_FILE: &str = "session.json";

#[tauri::command]
pub fn export_html_report(
    project_root: String,
    session_dir: String,
) -> CmdResult<String> {
    let project_path = PathBuf::from(&project_root);
    let session_path_dir = PathBuf::from(&session_dir);
    if !project_path.is_dir() {
        return Err(format!("project_root not a directory: {project_root}"));
    }
    if !session_path_dir.is_dir() {
        return Err(format!("session_dir not a directory: {session_dir}"));
    }
    let session_json = session_path_dir.join(SESSION_FILE);
    let bytes = std::fs::read(&session_json)
        .map_err(|e| format!("read session.json: {e}"))?;
    let session: Session = serde_json::from_slice(&bytes)
        .map_err(|e| format!("parse session.json: {e}"))?;

    let case_ids: Vec<String> = session
        .case_results
        .iter()
        .map(|c| c.case_id.clone())
        .collect();
    let cases = collect_cases_by_id(&project_path, &case_ids);
    let project_name = project_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("qastor")
        .to_string();

    let html = render(&project_name, &session, &cases);
    let target = session_path_dir.join(REPORT_FILE);
    atomic_write(&target, html.as_bytes())
        .map_err(|e| format!("write report.html: {e}"))?;
    Ok(target.to_string_lossy().to_string())
}

fn collect_cases_by_id(root: &Path, ids: &[String]) -> HashMap<String, TestCase> {
    use std::collections::HashSet;
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
    out
}

// ----- HTML rendering ------------------------------------------------------

fn render(
    project_name: &str,
    session: &Session,
    cases: &HashMap<String, TestCase>,
) -> String {
    let total = session.case_results.len();
    let passed = session
        .case_results
        .iter()
        .filter(|c| c.status == CaseStatus::Passed)
        .count();
    let failed = session
        .case_results
        .iter()
        .filter(|c| c.status == CaseStatus::Failed)
        .count();
    let blocked = session
        .case_results
        .iter()
        .filter(|c| c.status == CaseStatus::Blocked)
        .count();
    let pending = total - passed - failed - blocked;

    let mut html = String::with_capacity(8192);
    html.push_str("<!doctype html>\n<html lang=\"es\">\n<head>\n");
    html.push_str("<meta charset=\"utf-8\">\n");
    let _ = write!(
        html,
        "<title>{} — Reporte de sesión</title>\n",
        escape(project_name)
    );
    html.push_str(STYLES);
    html.push_str("</head>\n<body>\n");

    let _ = write!(
        html,
        "<header>\n<h1>{}</h1>\n",
        escape(project_name)
    );
    html.push_str("<div class=\"meta\">\n");
    let _ = write!(
        html,
        "<div>Sesión <code>{}</code></div>\n",
        escape(&session.session_id)
    );
    let _ = write!(
        html,
        "<div>Iniciada: {}</div>\n",
        escape(&session.started_at.to_rfc3339())
    );
    if let Some(ended) = session.ended_at {
        let _ = write!(
            html,
            "<div>Terminada: {}</div>\n",
            escape(&ended.to_rfc3339())
        );
    }
    html.push_str("</div>\n</header>\n");

    let _ = write!(
        html,
        r#"<section class="summary">
<span class="pill pill--muted">{total} caso{s}</span>
<span class="pill pill--ok">{passed} pasaron</span>
<span class="pill pill--err">{failed} fallaron</span>
<span class="pill pill--warn">{blocked} bloqueados</span>
<span class="pill">{pending} pendientes</span>
</section>
"#,
        s = if total == 1 { "" } else { "s" }
    );

    for cr in &session.case_results {
        render_case(&mut html, cr, cases.get(&cr.case_id));
    }

    html.push_str("</body>\n</html>\n");
    html
}

fn render_case(html: &mut String, cr: &CaseResult, case: Option<&TestCase>) {
    let title = case.map(|c| c.title.as_str()).unwrap_or("(caso no disponible en el proyecto)");
    let module = case.map(|c| c.module.as_str()).unwrap_or("—");
    let case_status_class = case_status_class(&cr.status);

    let _ = write!(
        html,
        "<section class=\"case\">\n<div class=\"case__header\">\n<div>\n"
    );
    let _ = write!(
        html,
        "<div class=\"case__id\"><code>{}</code> · {}</div>\n",
        escape(&cr.case_id),
        escape(module)
    );
    let _ = write!(
        html,
        "<div class=\"case__title\">{}</div>\n",
        escape(title)
    );
    html.push_str("</div>\n");
    let _ = write!(
        html,
        "<span class=\"pill {}\">{}</span>\n</div>\n",
        case_status_class,
        case_status_label(&cr.status)
    );

    html.push_str("<ol class=\"steps\">\n");
    for sr in &cr.steps {
        let def = case.and_then(|c| c.steps.iter().find(|s| s.step == sr.step));
        let action = def.map(|d| d.action.as_str()).unwrap_or("");
        let expected = def.map(|d| d.expected.as_str()).unwrap_or("");
        let step_class = step_status_class(&sr.status);
        let step_label = step_status_label(&sr.status);

        let _ = write!(
            html,
            "<li class=\"step\">\n<div class=\"step__head\">\n<span class=\"step__num\">paso {}</span>\n<span class=\"pill {}\">{}</span>\n</div>\n",
            sr.step, step_class, step_label
        );
        if !action.is_empty() {
            let _ = write!(
                html,
                "<div class=\"step__action\">{}</div>\n",
                escape(action)
            );
        }
        if !expected.is_empty() {
            let _ = write!(
                html,
                "<div class=\"step__expected\">{}</div>\n",
                escape(expected)
            );
        }
        if let Some(notes) = &sr.notes {
            let _ = write!(
                html,
                "<div class=\"step__notes\">Nota: {}</div>\n",
                escape(notes)
            );
        }
        // Combine legacy evidence_paths (treated as screenshots) with the new
        // typed evidence_items. Legacy ones first to preserve old reports.
        let mut emitted_paths: std::collections::HashSet<&str> =
            std::collections::HashSet::new();
        if !sr.evidence_paths.is_empty() || !sr.evidence_items.is_empty() {
            html.push_str("<div class=\"evidence\">\n");
            for item in &sr.evidence_items {
                match item {
                    EvidenceItem::Screenshot { path, .. } => {
                        emitted_paths.insert(path.as_str());
                        let _ = write!(
                            html,
                            "<a class=\"evidence-shot\" href=\"{rel}\" target=\"_blank\"><img src=\"{rel}\" alt=\"evidencia paso {step}\"></a>\n",
                            rel = escape(path),
                            step = sr.step
                        );
                    }
                    EvidenceItem::Text { content, label, .. } => {
                        let _ = write!(html, "<div class=\"evidence-text\">\n");
                        if let Some(l) = label {
                            let _ = write!(
                                html,
                                "<div class=\"evidence-text__label\">{}</div>\n",
                                escape(l)
                            );
                        }
                        let _ = write!(html, "<pre>{}</pre>\n</div>\n", escape(content));
                    }
                    EvidenceItem::File {
                        path,
                        filename,
                        mime,
                        size_bytes,
                        ..
                    } => {
                        emitted_paths.insert(path.as_str());
                        let size = size_bytes
                            .map(|b| format!(" · {}", human_bytes(b)))
                            .unwrap_or_default();
                        let mime_str = mime.as_deref().unwrap_or("archivo");
                        let _ = write!(
                            html,
                            "<a class=\"evidence-file\" href=\"{rel}\" target=\"_blank\">📎 {name} <span>{mime}{size}</span></a>\n",
                            rel = escape(path),
                            name = escape(filename),
                            mime = escape(mime_str),
                            size = escape(&size)
                        );
                    }
                }
            }
            for rel in &sr.evidence_paths {
                if emitted_paths.contains(rel.as_str()) {
                    continue;
                }
                let _ = write!(
                    html,
                    "<a class=\"evidence-shot\" href=\"{rel}\" target=\"_blank\"><img src=\"{rel}\" alt=\"evidencia paso {step}\"></a>\n",
                    rel = escape(rel),
                    step = sr.step
                );
            }
            html.push_str("</div>\n");
        }
        html.push_str("</li>\n");
    }
    html.push_str("</ol>\n</section>\n");
}

fn human_bytes(b: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let bf = b as f64;
    if bf >= GB {
        format!("{:.1} GB", bf / GB)
    } else if bf >= MB {
        format!("{:.1} MB", bf / MB)
    } else if bf >= KB {
        format!("{:.0} KB", bf / KB)
    } else {
        format!("{b} B")
    }
}

fn case_status_class(s: &CaseStatus) -> &'static str {
    match s {
        CaseStatus::Passed => "pill--ok",
        CaseStatus::Failed => "pill--err",
        CaseStatus::Blocked => "pill--warn",
        _ => "pill--muted",
    }
}

fn case_status_label(s: &CaseStatus) -> &'static str {
    match s {
        CaseStatus::Pending => "Pendiente",
        CaseStatus::Running => "En curso",
        CaseStatus::Passed => "Pasó",
        CaseStatus::Failed => "Falló",
        CaseStatus::Blocked => "Bloqueado",
    }
}

fn step_status_class(s: &StepStatus) -> &'static str {
    match s {
        StepStatus::Passed => "pill--ok",
        StepStatus::Failed => "pill--err",
        StepStatus::Blocked => "pill--warn",
        StepStatus::Pending => "pill--muted",
    }
}

fn step_status_label(s: &StepStatus) -> &'static str {
    match s {
        StepStatus::Pending => "Pendiente",
        StepStatus::Passed => "Pasó",
        StepStatus::Failed => "Falló",
        StepStatus::Blocked => "Bloqueado",
    }
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

const STYLES: &str = r#"<style>
:root {
  --adc-primary: #9cc69b;
  --adc-secondary: #bde4a8;
  --adc-tertiary: #d7f2ba;
  --adc-accent-1: #5F7054;
  --adc-accent-2: #79b4a9;
  --adc-error: #ca5e5e;
  --adc-warning: #dbc665;
  --adc-text: #253207;
  --adc-surface: #f3fadf;
  --adc-font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--adc-font-mono);
  color: var(--adc-text);
  background: var(--adc-tertiary);
  padding: 32px;
  line-height: 1.55;
  font-size: 14px;
  font-feature-settings: "tnum" 1;
}
header { margin-bottom: 24px; }
h1 { font-size: 28px; margin: 0 0 8px; letter-spacing: -0.01em; }
.meta { color: var(--adc-accent-1); font-size: 12px; display: flex; flex-direction: column; gap: 2px; }
.meta code { font-size: 11px; }
.summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
.pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--adc-accent-2);
  color: var(--adc-text);
  font-size: 12px;
  font-weight: 700;
  border: 1px solid var(--adc-accent-1);
}
.pill--ok { background: var(--adc-secondary); }
.pill--err { background: var(--adc-error); color: var(--adc-surface); }
.pill--warn { background: var(--adc-warning); }
.pill--muted { background: transparent; color: var(--adc-accent-1); }
.case {
  background: var(--adc-primary);
  border: 1px solid var(--adc-accent-1);
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
}
.case__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.case__id { font-size: 11px; color: var(--adc-accent-1); margin-bottom: 4px; }
.case__title { font-size: 16px; font-weight: 700; }
.steps { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.step {
  background: var(--adc-surface);
  border: 1px solid var(--adc-accent-1);
  border-radius: 5px;
  padding: 10px 12px;
}
.step__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.step__num { font-weight: 700; color: var(--adc-accent-1); }
.step__action { font-weight: 700; margin-bottom: 2px; }
.step__expected { color: var(--adc-accent-1); }
.step__notes { font-size: 12px; color: var(--adc-error); margin-top: 4px; }
.evidence { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; }
.evidence-shot { display: inline-block; }
.evidence-shot img {
  max-width: 320px;
  max-height: 240px;
  border: 1px solid var(--adc-accent-1);
  border-radius: 4px;
  display: block;
}
.evidence-text {
  flex: 1 1 100%;
  background: var(--adc-tertiary);
  border: 1px solid var(--adc-accent-1);
  border-radius: 5px;
  padding: 10px 12px;
}
.evidence-text__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--adc-accent-1);
  margin-bottom: 4px;
  font-weight: 700;
}
.evidence-text pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--adc-font-mono);
  font-size: 13px;
}
.evidence-file {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--adc-surface);
  border: 1px solid var(--adc-accent-1);
  border-radius: 5px;
  text-decoration: none;
  color: var(--adc-text);
  font-weight: 700;
}
.evidence-file span {
  font-weight: 400;
  font-size: 12px;
  color: var(--adc-accent-1);
}
.evidence-file:hover { background: var(--adc-tertiary); }
@media print {
  body { background: white; padding: 16px; }
  .case { page-break-inside: avoid; }
  .evidence img { max-height: 200px; }
}
</style>
"#;
