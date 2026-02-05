// Musicsloth - Desktop Music Player
// Module declarations
mod audio;
mod commands;
mod db;
mod library;
mod metadata;
mod playlist;
mod queue;
mod settings;
mod smtc;
mod state;

use audio::player::Player;
use db::connection::DatabaseConnection;
use smtc::{SmtcButton, SmtcManager};
use state::AppState;
use tauri::{image::Image, Emitter, Manager};

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
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Get app data directory
            let app_dir = app.path().app_data_dir()
                .expect("Failed to get app data directory");
            let db_path = app_dir.join("musicsloth.db");

            // Initialize database
            let db = DatabaseConnection::new(db_path)
                .expect("Failed to initialize database");

            // Initialize audio player
            let player = Player::new();

            // Initialize SMTC (Windows only)
            let smtc = match SmtcManager::new() {
                Ok(s) => {
                    eprintln!("SMTC initialized successfully");
                    Some(s)
                }
                Err(e) => {
                    eprintln!("Failed to initialize SMTC: {}", e);
                    None
                }
            };

            // Set up SMTC button callback to emit events
            if let Some(ref smtc) = smtc {
                let app_handle = app.handle().clone();
                let _ = smtc.set_button_callback(move |button| {
                    let event_name = match button {
                        SmtcButton::Play => "smtc-play",
                        SmtcButton::Pause => "smtc-pause",
                        SmtcButton::Stop => "smtc-stop",
                        SmtcButton::Next => "smtc-next",
                        SmtcButton::Previous => "smtc-previous",
                    };
                    let _ = app_handle.emit(event_name, ());
                });
            }

            // Create and manage app state (now includes app_dir for settings)
            let app_state = AppState::new(player, db, smtc, app_dir);
            app.manage(app_state);

            // Set window icon
            if let Some(window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/icon.png");
                if let Ok(img) = image::load_from_memory(icon_bytes) {
                    let rgba = img.to_rgba8();
                    let (width, height) = rgba.dimensions();
                    let icon = Image::new_owned(rgba.into_raw(), width, height);
                    let _ = window.set_icon(icon);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_current_track,
            commands::clear_current_track,
            commands::scan_library,
            commands::add_scan_path,
            commands::get_all_scan_paths,
            commands::remove_scan_path,
            commands::pick_folder,
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
            commands::get_lyrics,
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
            commands::get_queue_track_at_shuffled_position,
            commands::get_queue_length,
            commands::toggle_queue_shuffle,
            commands::find_shuffled_position,
            commands::set_queue_shuffle_seed,
            commands::get_queue_shuffle_seed,
            commands::set_queue_shuffle_anchor,
            commands::get_queue_shuffle_anchor,
            commands::get_recent_tracks,
            commands::get_most_played_tracks,
            commands::get_unplayed_tracks,
            commands::get_all_playlists,
            commands::create_playlist,
            commands::rename_playlist,
            commands::add_track_to_playlist,
            commands::get_playlist_tracks,
            commands::remove_track_from_playlist,
            commands::delete_playlist,
            commands::reorder_playlist_track,
            commands::reorder_queue_track,
            commands::append_tracks_to_queue,
            commands::insert_tracks_after_position,
            commands::remove_track_at_position,
            commands::save_album_art,
            // Audio player commands
            commands::player_play,
            commands::player_pause,
            commands::player_resume,
            commands::player_stop,
            commands::player_seek,
            commands::player_set_volume,
            commands::player_set_volume_db,
            commands::player_get_state,
            commands::player_has_track_ended,
            // Audio player normalization commands
            commands::player_play_with_normalization,
            commands::player_set_track_gain,
            commands::player_set_normalization_enabled,
            commands::player_get_normalization_enabled,
            commands::analyze_library_loudness,
            commands::recalculate_track_replaygain,
            // SMTC commands
            commands::smtc_update_metadata,
            commands::smtc_set_playback_status,
            commands::smtc_set_timeline,
            commands::get_artwork_temp_path,
            // Settings commands
            commands::get_settings,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
