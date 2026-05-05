use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, Runtime,
};

pub const TRAY_ID: &str = "main";

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let capture = MenuItem::with_id(app, "tray-capture", "Capturar", true, None::<&str>)?;
    let pass = MenuItem::with_id(app, "tray-pass", "Pass", true, None::<&str>)?;
    let fail = MenuItem::with_id(app, "tray-fail", "Fail", true, None::<&str>)?;
    let blocked = MenuItem::with_id(app, "tray-blocked", "Blocked", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let end_session = MenuItem::with_id(
        app,
        "tray-end",
        "Finalizar sesión",
        true,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let open = MenuItem::with_id(app, "tray-open", "Abrir qastor", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray-quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&capture, &pass, &fail, &blocked, &sep1, &end_session, &sep2, &open, &quit],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::Anyhow(anyhow::anyhow!("missing default window icon")))?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-capture" => {
                let _ = app.emit("qastor:hotkey", "capture-and-advance");
            }
            "tray-pass" => {
                let _ = app.emit("qastor:hotkey", "mark-pass");
            }
            "tray-fail" => {
                let _ = app.emit("qastor:hotkey", "mark-fail");
            }
            "tray-blocked" => {
                let _ = app.emit("qastor:hotkey", "mark-blocked");
            }
            "tray-end" => {
                let _ = app.emit("qastor:hotkey", "end-session");
            }
            "tray-open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "tray-quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[tauri::command]
pub fn set_tray_status<R: Runtime>(
    app: AppHandle<R>,
    text: Option<String>,
) -> Result<(), String> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Err("tray not initialized".to_string());
    };
    tray.set_title(text.as_deref()).map_err(|e| e.to_string())?;
    tray.set_tooltip(text.as_deref()).map_err(|e| e.to_string())?;
    Ok(())
}
