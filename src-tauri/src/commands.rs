//! The five things the TypeScript side cannot do for itself.
//!
//! Everything else — parsing, totals, settings, the window placement — is in
//! `core/` (plan.md, "What Rust is for"). What is left here is the registry,
//! the file-scope grants, the directory walk that would otherwise cost one IPC
//! call per file, free disk space, and where our own files live.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_fs::FsExt;
use tauri_plugin_opener::OpenerExt;
use walkdir::WalkDir;

const APP_NAME: &str = "SteamDirStats";

#[derive(Serialize, Clone)]
pub struct DiskUsage {
    total: u64,
    free: u64,
}

#[derive(Serialize, Clone)]
struct SizeProgress {
    done: usize,
    total: usize,
}

/// A string value from the Windows registry, or None.
///
/// Only the two hives the Steam locations live in, and only string values:
/// the front end never gets to name a hive of its own.
#[tauri::command]
pub fn read_registry(hive: String, key: String, value: String) -> Option<String> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        use winreg::RegKey;

        let root = match hive.as_str() {
            "HKCU" => HKEY_CURRENT_USER,
            "HKLM" => HKEY_LOCAL_MACHINE,
            _ => return None,
        };

        RegKey::predef(root)
            .open_subkey(key)
            .ok()?
            .get_value::<String, _>(value)
            .ok()
            .filter(|found| !found.is_empty())
    }

    #[cfg(not(windows))]
    {
        let _ = (hive, key, value);
        None
    }
}

/// Allow reading one Steam folder, and say whether it was allowed.
///
/// This is the only way the window gains file access (plan.md §7d): it starts
/// with none, and each folder has to prove itself a Steam folder — it must
/// exist and hold a `steamapps` directory. A page that asked for `C:\Users`
/// gets `false` and no access.
///
/// Grants are not persisted: every launch starts closed again.
#[tauri::command]
pub fn allow_steam_folder<R: Runtime>(app: AppHandle<R>, path: String) -> bool {
    let folder = PathBuf::from(&path);

    if !folder.join("steamapps").is_dir() {
        return false;
    }

    app.fs_scope().allow_directory(&folder, true).is_ok()
}

/// Total bytes under each folder, in the order given; None for one that cannot
/// be read.
///
/// The fs plugin's readDir carries no sizes, so measuring from TypeScript would
/// mean one IPC call per file. Progress is emitted as `scan-progress` so the
/// status bar can follow a long accurate scan.
///
/// Only folders already in the read scope are measured, so this cannot be used
/// to size up the rest of the disk.
#[tauri::command]
pub async fn dir_sizes<R: Runtime>(app: AppHandle<R>, paths: Vec<String>) -> Vec<Option<u64>> {
    let total = paths.len();
    let done = AtomicUsize::new(0);

    // Walking is blocking work; keep it off the main thread.
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|path| {
                let _ = app.emit(
                    "scan-progress",
                    SizeProgress {
                        done: done.fetch_add(1, Ordering::Relaxed),
                        total,
                    },
                );

                if app.fs_scope().is_allowed(path) {
                    folder_size(Path::new(path))
                } else {
                    None
                }
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

/// Show one scanned folder in the file manager.
///
/// The opener plugin's own path scope has to be written in the capability file,
/// where the library drives are not known, so the window asks Rust instead and
/// the gate is the one the scan already passed: only a folder inside a granted
/// Steam library can be opened (plan.md 7d).
#[tauri::command]
pub fn open_folder<R: Runtime>(app: AppHandle<R>, path: String) -> Result<(), String> {
    let folder = PathBuf::from(&path);

    if !app.fs_scope().is_allowed(&folder) {
        return Err(format!("Not an allowed folder: {path}"));
    }

    if !folder.is_dir() {
        return Err(format!("Folder not found: {path}"));
    }

    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map_err(|err| err.to_string())
}

/// Total and free bytes of the volume holding `path`.
#[tauri::command]
pub fn disk_usage(path: String) -> Option<DiskUsage> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

        let wide: Vec<u16> = Path::new(&path)
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let mut free_for_caller = 0u64;
        let mut total = 0u64;
        let mut free = 0u64;

        // SAFETY: `wide` is a NUL-terminated UTF-16 path and the three outputs
        // are valid for the call's lifetime.
        let ok = unsafe {
            GetDiskFreeSpaceExW(wide.as_ptr(), &mut free_for_caller, &mut total, &mut free)
        };

        if ok == 0 {
            return None;
        }

        Some(DiskUsage {
            total,
            // What this user may actually fill, which is what Explorer shows.
            free: free_for_caller,
        })
    }

    #[cfg(not(windows))]
    {
        let _ = path;
        None
    }
}

/// Where settings.json and workshop-names.json live, with that one folder
/// allowed for reading and writing.
///
/// Portable by default (plan.md §9): next to the executable when that folder
/// takes a write, `%APPDATA%\SteamDirStats` otherwise.
#[tauri::command]
pub fn data_dir<R: Runtime>(app: AppHandle<R>) -> String {
    let folder = resolve_data_dir();

    // Our own folder, not a Steam one, so it is granted here rather than
    // through allow_steam_folder.
    let _ = app.fs_scope().allow_directory(&folder, false);

    folder.to_string_lossy().into_owned()
}

fn resolve_data_dir() -> PathBuf {
    if let Some(local) = exe_folder() {
        if local.join("settings.json").exists() || is_writable(&local) {
            return local;
        }
    }

    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let folder = base.join(APP_NAME);
    let _ = fs::create_dir_all(&folder);

    folder
}

fn exe_folder() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()?
        .parent()
        .map(Path::to_path_buf)
}

/// Writable is tested by writing: Windows permissions are not something to
/// predict from metadata.
fn is_writable(folder: &Path) -> bool {
    let probe = folder.join(".sds-write-test");

    match fs::write(&probe, b"") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Total size of every file under `path`, or None if it is not a folder.
///
/// Never fails on one bad entry: a folder that disappears mid-walk (Steam
/// updating a game) or one we may not read is skipped and the rest still
/// counted. Symlinks and junctions are not followed, so content shared between
/// libraries is not counted twice.
fn folder_size(path: &Path) -> Option<u64> {
    if !path.is_dir() {
        return None;
    }

    let mut total = 0u64;

    for entry in WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if entry.file_type().is_file() {
            if let Ok(metadata) = entry.metadata() {
                total += metadata.len();
            }
        }
    }

    Some(total)
}
