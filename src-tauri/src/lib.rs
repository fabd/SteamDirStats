//! The Tauri shell: plugins, commands, window.
//!
//! The window starts hidden and the front end shows it once the saved
//! placement has been applied (plan.md §8), so there is no jump from the
//! default position to the remembered one.

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::read_registry,
            commands::allow_steam_folder,
            commands::dir_sizes,
            commands::open_folder,
            commands::disk_usage,
            commands::data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SteamDirStats");
}
