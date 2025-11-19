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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
