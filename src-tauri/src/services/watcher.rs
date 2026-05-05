use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime, State};

/// Holds the active filesystem watcher (if any). Stored as Tauri-managed state.
pub struct AppWatcher(pub Mutex<Option<RecommendedWatcher>>);

impl AppWatcher {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

impl Default for AppWatcher {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub fn start_watch<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppWatcher>,
    project_root: String,
) -> Result<(), String> {
    let path = Path::new(&project_root);
    if !path.is_dir() {
        return Err(format!("not a directory: {}", path.display()));
    }
    let app_emit = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(event) = res {
            if matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
            ) {
                let _ = app_emit.emit("qastor:cases-changed", ());
            }
        }
    })
    .map_err(|e| e.to_string())?;
    watcher
        .watch(path, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn stop_watch(state: State<'_, AppWatcher>) -> Result<(), String> {
    *state.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}
