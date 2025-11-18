// Tauri command handlers
use tauri::State;
use std::path::PathBuf;

use crate::state::AppState;

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
