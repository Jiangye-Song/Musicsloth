// Tauri command handlers
use tauri::State;
use std::path::PathBuf;

use crate::state::AppState;
use crate::library::scanner::DirectoryScanner;
use crate::library::indexer::{LibraryIndexer, IndexingResult};
use crate::db::operations::DbOperations;
use crate::db::models::{Track, Album, Artist};

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
pub fn scan_library(
    directory: String,
    state: State<'_, AppState>,
) -> Result<IndexingResult, String> {
    // Scan directory for audio files
    let audio_files = DirectoryScanner::scan(&directory)
        .map_err(|e| format!("Failed to scan directory: {}", e))?;
    
    // Index files into database
    let result = LibraryIndexer::index_files(&audio_files, &state.db)
        .map_err(|e| format!("Failed to index files: {}", e))?;
    
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
pub fn get_all_genres(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    DbOperations::get_all_genres(&state.db)
        .map_err(|e| format!("Failed to get genres: {}", e))
}
