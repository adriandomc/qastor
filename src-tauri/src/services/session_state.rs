use crate::domain::Session;
use std::path::PathBuf;
use std::sync::Mutex;

/// In-memory state for the currently running session.
///
/// `None` means no session is active. Wrapped in a `Mutex` so commands
/// from different async contexts can mutate it serially.
pub struct ActiveSession(pub Mutex<Option<ActiveSessionState>>);

#[derive(Debug, Clone)]
pub struct ActiveSessionState {
    pub session: Session,
    pub session_dir: PathBuf,
}

impl ActiveSession {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

impl Default for ActiveSession {
    fn default() -> Self {
        Self::new()
    }
}
