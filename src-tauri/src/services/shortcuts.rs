use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Default hotkey bindings for v0.1. Settings tab will allow rebinding in
/// Phase 9. Format follows Tauri's accelerator syntax (CmdOrCtrl maps to
/// Cmd on macOS and Ctrl on Win/Linux).
pub const DEFAULT_BINDINGS: &[(&str, &str)] = &[
    ("CmdOrCtrl+Shift+E", "capture-and-advance"),
    ("CmdOrCtrl+Shift+T", "paste-text-and-advance"),
    ("CmdOrCtrl+Shift+A", "attach-file-and-advance"),
    ("CmdOrCtrl+Shift+P", "mark-pass"),
    ("CmdOrCtrl+Shift+F", "mark-fail"),
    ("CmdOrCtrl+Shift+B", "mark-blocked"),
    ("CmdOrCtrl+Shift+Q", "toggle-window"),
];

pub fn register_defaults<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    let gs = app.global_shortcut();

    // Build a map from parsed shortcut → kind so the handler can dispatch
    // by id without needing per-binding closures.
    let mut shortcuts: Vec<(Shortcut, &'static str)> = Vec::new();
    for (accel, kind) in DEFAULT_BINDINGS {
        let parsed: Shortcut = accel
            .parse()
            .map_err(|e| format!("invalid accelerator {accel}: {e}"))?;
        shortcuts.push((parsed, *kind));
    }

    let app_clone = app.clone();
    let lookup = shortcuts.clone();
    gs.on_shortcuts(
        shortcuts.iter().map(|(s, _)| s.clone()).collect::<Vec<_>>(),
        move |_app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let Some((_, kind)) = lookup.iter().find(|(s, _)| s == shortcut) else {
                return;
            };
            handle_kind(&app_clone, kind);
        },
    )?;

    Ok(())
}

fn handle_kind<R: Runtime>(app: &AppHandle<R>, kind: &str) {
    if kind == "toggle-window" {
        if let Some(w) = app.get_webview_window("main") {
            let visible = w.is_visible().unwrap_or(false);
            if visible {
                let _ = w.hide();
            } else {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        return;
    }
    let _ = app.emit("qastor:hotkey", kind);
}
