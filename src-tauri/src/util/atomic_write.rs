use std::fs;
use std::io::{self, Write};
use std::path::Path;

/// Write `contents` to `path` atomically.
///
/// Strategy: write to a sibling `.tmp` file in the same directory, fsync,
/// then rename over the target. If the process is interrupted, the
/// destination file is either the previous version or the new one — never
/// a half-written file.
pub fn atomic_write(path: &Path, contents: &[u8]) -> io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        io::Error::new(io::ErrorKind::InvalidInput, "path has no parent directory")
    })?;
    fs::create_dir_all(parent)?;

    let file_name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "path has no file name"))?
        .to_string_lossy();
    let tmp_path = parent.join(format!(".{file_name}.tmp.{}", std::process::id()));

    {
        let mut tmp = fs::File::create(&tmp_path)?;
        tmp.write_all(contents)?;
        tmp.sync_all()?;
    }

    fs::rename(&tmp_path, path)?;
    Ok(())
}
