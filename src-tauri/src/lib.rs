mod commands;
mod domain;
mod services;
mod util;

use services::session_state::ActiveSession;
use services::watcher::AppWatcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppWatcher::new())
        .manage(ActiveSession::new())
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(e) = services::shortcuts::register_defaults(&handle) {
                log::warn!("global shortcuts registration failed: {e}");
            }
            if let Err(e) = services::tray::setup_tray(&handle) {
                log::warn!("tray setup failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::project::create_project,
            commands::project::open_project,
            commands::project::validate_project,
            commands::project::initialize_existing_folder,
            commands::project::update_project_config,
            commands::project::get_recent_projects,
            commands::project::record_recent_project,
            commands::project::forget_recent_project,
            commands::cases::list_cases,
            commands::cases::load_case,
            commands::cases::save_case,
            commands::cases::delete_case,
            commands::cases::regenerate_index,
            commands::capture::capture_region,
            commands::capture::capture_full_screen,
            commands::capture::capture_window,
            commands::capture::capture_step,
            commands::capture::paste_clipboard_to_step,
            commands::capture::attach_step_file,
            commands::capture::delete_step_evidence,
            commands::capture::update_step_text_evidence,
            commands::session::start_session,
            commands::session::get_active_session,
            commands::session::mark_step,
            commands::session::end_session,
            commands::session::list_sessions,
            commands::session::list_case_evidence,
            commands::report::export_html_report,
            commands::system::open_path,
            services::tray::set_tray_status,
            services::watcher::start_watch,
            services::watcher::stop_watch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
