// Tauri command handlers
use tauri::{State, AppHandle, Emitter};
use std::path::PathBuf;

use crate::state::AppState;
use crate::library::scanner::DirectoryScanner;
use crate::library::indexer::{LibraryIndexer, IndexingResult};
use crate::db::operations::DbOperations;
use crate::db::models::{Track, Album, Artist, Genre};
use lofty::file::TaggedFileExt;

#[tauri::command]
pub fn play_file(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = PathBuf::from(file_path);
    let player = state.player.lock().unwrap();
    
    player.play(path)
        .map_err(|e| format!("Failed to play file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn pause_playback(state: State<'_, AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.pause();
    Ok(())
}

#[tauri::command]
pub fn resume_playback(state: State<'_, AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.resume();
    Ok(())
}

#[tauri::command]
pub fn stop_playback(state: State<'_, AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.stop();
    Ok(())
}

#[tauri::command]
pub fn set_volume(
    volume: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.set_volume(volume);
    Ok(())
}

#[tauri::command]
pub fn get_player_state(state: State<'_, AppState>) -> Result<PlayerStateResponse, String> {
    let player = state.player.lock().unwrap();
    
    Ok(PlayerStateResponse {
        is_playing: player.is_playing(),
        is_paused: player.is_paused(),
        current_file: player.current_file().map(|p| p.to_string_lossy().to_string()),
    })
}

#[derive(serde::Serialize)]
pub struct PlayerStateResponse {
    pub is_playing: bool,
    pub is_paused: bool,
    pub current_file: Option<String>,
}

// ===== Library Management Commands =====

#[tauri::command]
pub async fn scan_library(
    directory: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<IndexingResult, String> {
    // Clone what we need for the async task
    let db = state.db.clone();
    
    // Spawn blocking task to avoid blocking the event loop
    let result = tokio::task::spawn_blocking(move || {
        // Scan directory for audio files
        let audio_files = DirectoryScanner::scan(&directory)
            .map_err(|e| format!("Failed to scan directory: {}", e))?;
        
        // Index files into database with progress updates
        let result = LibraryIndexer::index_files_with_progress(&audio_files, &db, |progress| {
            // Emit progress event to frontend
            let _ = app.emit("scan-progress", progress);
        })
        .map_err(|e| format!("Failed to index files: {}", e))?;
        
        Ok::<IndexingResult, String>(result)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;
    
    Ok(result)
}

#[tauri::command]
pub fn get_all_tracks(state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    DbOperations::get_all_tracks(&state.db)
        .map_err(|e| format!("Failed to get tracks: {}", e))
}

#[tauri::command]
pub fn get_all_albums(state: State<'_, AppState>) -> Result<Vec<Album>, String> {
    DbOperations::get_all_albums(&state.db)
        .map_err(|e| format!("Failed to get albums: {}", e))
}

#[tauri::command]
pub fn get_all_artists(state: State<'_, AppState>) -> Result<Vec<Artist>, String> {
    DbOperations::get_all_artists(&state.db)
        .map_err(|e| format!("Failed to get artists: {}", e))
}

#[tauri::command]
pub fn get_all_genres(state: State<'_, AppState>) -> Result<Vec<Genre>, String> {
    DbOperations::get_all_genres(&state.db)
        .map_err(|e| format!("Failed to get genres: {}", e))
}

#[tauri::command]
pub fn clear_library(state: State<'_, AppState>) -> Result<(), String> {
    DbOperations::clear_library(&state.db)
        .map_err(|e| format!("Failed to clear library: {}", e))
}

#[tauri::command]
pub fn get_tracks_by_artist(state: State<'_, AppState>, artist_id: i64) -> Result<Vec<Track>, String> {
    DbOperations::get_tracks_by_artist(&state.db, artist_id)
        .map_err(|e| format!("Failed to get tracks by artist: {}", e))
}

#[tauri::command]
pub fn get_tracks_by_genre(state: State<'_, AppState>, genre_id: i64) -> Result<Vec<Track>, String> {
    DbOperations::get_tracks_by_genre(&state.db, genre_id)
        .map_err(|e| format!("Failed to get tracks by genre: {}", e))
}

#[tauri::command]
pub fn get_tracks_by_album(state: State<'_, AppState>, album_name: String) -> Result<Vec<Track>, String> {
    DbOperations::get_tracks_by_album(&state.db, &album_name)
        .map_err(|e| format!("Failed to get tracks by album: {}", e))
}

#[tauri::command]
pub fn get_current_track(state: State<'_, AppState>) -> Result<Option<Track>, String> {
    let player = state.player.lock().unwrap();
    
    if let Some(file_path) = player.current_file() {
        let file_path_str = file_path.to_string_lossy().to_string();
        DbOperations::get_track_by_file_path(&state.db, &file_path_str)
            .map_err(|e| format!("Failed to get track: {}", e))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_album_art(file_path: String) -> Result<Option<Vec<u8>>, String> {
    use lofty::probe::Probe;
    use lofty::picture::PictureType;
    
    let tagged_file = Probe::open(&file_path)
        .map_err(|e| format!("Failed to open file: {}", e))?
        .read()
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Priority order for picture types (matching foobar2000 behavior)
    let picture_priority = [
        PictureType::CoverFront,      // Front Cover (most common)
        PictureType::Media,            // Media (e.g., label side of CD)
        PictureType::CoverBack,        // Back Cover
        PictureType::Leaflet,          // Leaflet page
        PictureType::Other,            // Other/Undefined
        PictureType::Icon,             // Icon
        PictureType::OtherIcon,        // Other Icon
        PictureType::Artist,           // Artist/Performer
        PictureType::Band,             // Band/Orchestra
        PictureType::Composer,         // Composer
        PictureType::Lyricist,         // Lyricist/Text writer
        PictureType::RecordingLocation, // Recording Location
        PictureType::DuringRecording,  // During Recording
        PictureType::DuringPerformance, // During Performance
        PictureType::ScreenCapture,    // Screen Capture
        PictureType::BrightFish,       // Bright Colored Fish
        PictureType::Illustration,     // Illustration
        PictureType::BandLogo,         // Band/Artist Logotype
        PictureType::PublisherLogo,    // Publisher/Studio Logotype
    ];
    
    // Try to get the primary tag first
    if let Some(tag) = tagged_file.primary_tag() {
        // Try each picture type in priority order
        for pic_type in &picture_priority {
            for picture in tag.pictures() {
                if picture.pic_type() == *pic_type {
                    return Ok(Some(picture.data().to_vec()));
                }
            }
        }
    }
    
    // Try all tags if primary tag didn't have cover art
    for tag in tagged_file.tags() {
        // Try each picture type in priority order
        for pic_type in &picture_priority {
            for picture in tag.pictures() {
                if picture.pic_type() == *pic_type {
                    return Ok(Some(picture.data().to_vec()));
                }
            }
        }
    }
    
    Ok(None)
}
