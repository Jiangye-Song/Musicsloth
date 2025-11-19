// Tauri command handlers
use tauri::{State, AppHandle, Emitter};
use std::path::PathBuf;

use crate::state::AppState;
use crate::library::scanner::DirectoryScanner;
use crate::library::indexer::{LibraryIndexer, IndexingResult};
use crate::db::operations::DbOperations;
use crate::db::models::{Track, Album, Artist, Genre, Queue};
use lofty::file::TaggedFileExt;

// Backend now only tracks current file - playback is in frontend
#[tauri::command]
pub fn set_current_track(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = PathBuf::from(file_path);
    let player = state.player.lock().unwrap();
    player.set_current_file(path);
    Ok(())
}

#[tauri::command]
pub fn clear_current_track(state: State<'_, AppState>) -> Result<(), String> {
    let player = state.player.lock().unwrap();
    player.clear_current_file();
    Ok(())
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

// ===== Queue Management Commands =====

#[tauri::command]
pub fn create_queue_from_tracks(
    name: String,
    track_ids: Vec<i64>,
    clicked_index: usize,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    // Check if queue with same tracks already exists
    if let Some(existing_queue_id) = DbOperations::find_queue_with_tracks(&state.db, &track_ids)
        .map_err(|e| format!("Failed to check for existing queue: {}", e))? 
    {
        // Set as active and return existing queue ID
        DbOperations::set_active_queue(&state.db, existing_queue_id)
            .map_err(|e| format!("Failed to set active queue: {}", e))?;
        return Ok(existing_queue_id);
    }
    
    // Create new queue
    let queue_id = DbOperations::create_queue(&state.db, &name)
        .map_err(|e| format!("Failed to create queue: {}", e))?;
    
    // Reorder tracks: clicked track first, then remaining after, then before clicked
    let mut reordered_tracks = Vec::new();
    reordered_tracks.push(track_ids[clicked_index]);
    
    // Add tracks after clicked track
    for i in (clicked_index + 1)..track_ids.len() {
        reordered_tracks.push(track_ids[i]);
    }
    
    // Add tracks before clicked track
    for i in 0..clicked_index {
        reordered_tracks.push(track_ids[i]);
    }
    
    // Add only first 100 tracks immediately for responsiveness
    const INITIAL_BATCH_SIZE: usize = 100;
    let initial_batch: Vec<i64> = reordered_tracks.iter()
        .take(INITIAL_BATCH_SIZE)
        .copied()
        .collect();
    
    DbOperations::add_tracks_to_queue(&state.db, queue_id, &initial_batch)
        .map_err(|e| format!("Failed to add initial tracks to queue: {}", e))?;
    
    // Add remaining tracks in background if there are more
    if reordered_tracks.len() > INITIAL_BATCH_SIZE {
        let remaining_tracks: Vec<i64> = reordered_tracks.iter()
            .skip(INITIAL_BATCH_SIZE)
            .copied()
            .collect();
        let db = state.db.clone();
        
        std::thread::spawn(move || {
            // Add remaining tracks in chunks of 500
            const CHUNK_SIZE: usize = 500;
            let mut position = INITIAL_BATCH_SIZE;
            
            for chunk in remaining_tracks.chunks(CHUNK_SIZE) {
                if let Err(e) = DbOperations::add_tracks_to_queue_at_position(&db, queue_id, chunk, position) {
                    eprintln!("Failed to add track chunk to queue: {}", e);
                    break;
                }
                position += chunk.len();
            }
        });
    }
    
    Ok(queue_id)
}

#[tauri::command]
pub fn get_all_queues(state: State<'_, AppState>) -> Result<Vec<Queue>, String> {
    DbOperations::get_all_queues(&state.db)
        .map_err(|e| format!("Failed to get queues: {}", e))
}

#[tauri::command]
pub fn get_queue_tracks(queue_id: i64, state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    DbOperations::get_queue_tracks(&state.db, queue_id)
        .map_err(|e| format!("Failed to get queue tracks: {}", e))
}

#[tauri::command]
pub fn set_active_queue(queue_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    DbOperations::set_active_queue(&state.db, queue_id)
        .map_err(|e| format!("Failed to set active queue: {}", e))
}

#[tauri::command]
pub fn get_active_queue(state: State<'_, AppState>) -> Result<Option<Queue>, String> {
    DbOperations::get_active_queue(&state.db)
        .map_err(|e| format!("Failed to get active queue: {}", e))
}

#[tauri::command]
pub fn delete_queue(queue_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    DbOperations::delete_queue(&state.db, queue_id)
        .map_err(|e| format!("Failed to delete queue: {}", e))
}
