// Musicsloth - Desktop Music Player
// Module declarations
mod audio;
mod commands;
mod db;
mod library;
mod metadata;
mod playlist;
mod queue;
mod state;

use audio::player::Player;
use db::connection::DatabaseConnection;
use state::AppState;
use tauri::Manager;

#[cfg(target_os = "windows")]
fn set_app_user_model_id() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    
    // Set Windows App User Model ID for proper media control display
    let app_id = "Musicsloth.MusicPlayer";
    let wide: Vec<u16> = OsStr::new(app_id)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    
    unsafe {
        // Use SetCurrentProcessExplicitAppUserModelID from shell32.dll
        #[link(name = "shell32")]
        extern "system" {
            fn SetCurrentProcessExplicitAppUserModelID(appid: *const u16) -> i32;
        }
        SetCurrentProcessExplicitAppUserModelID(wide.as_ptr());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    set_app_user_model_id();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Get app data directory
            let app_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            let db_path = app_dir.join("musicsloth.db");

            // Initialize database
            let db = DatabaseConnection::new(db_path)
                .expect("Failed to initialize database");

            // Initialize audio player
            let player = Player::new()
                .expect("Failed to initialize audio player");

            // Create and manage app state
            let app_state = AppState::new(player, db);
            app.manage(app_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_current_track,
            commands::clear_current_track,
            commands::scan_library,
            commands::get_all_tracks,
            commands::get_all_albums,
            commands::get_all_artists,
            commands::get_all_genres,
            commands::clear_library,
            commands::get_tracks_by_artist,
            commands::get_tracks_by_genre,
            commands::get_tracks_by_album,
            commands::get_current_track,
            commands::get_album_art,
            commands::create_queue_from_tracks,
            commands::get_all_queues,
            commands::get_queue_tracks,
            commands::set_active_queue,
            commands::get_active_queue,
            commands::delete_queue,
            commands::update_queue_current_index,
            commands::get_queue_current_index,
            commands::get_next_queue,
            commands::get_queue_track_at_position,
            commands::get_queue_length,
            commands::get_recent_tracks,
            commands::get_most_played_tracks,
            commands::get_unplayed_tracks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
