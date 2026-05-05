use std::process::Command;

type CmdResult<T> = Result<T, String>;

/// Open a local file or directory with the OS default application.
/// macOS uses `open`, Linux `xdg-open`, Windows `start`.
#[tauri::command]
pub fn open_path(path: String) -> CmdResult<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("open failed: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("xdg-open failed: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("start failed: {e}"))?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    Err("unsupported platform".to_string())
}
