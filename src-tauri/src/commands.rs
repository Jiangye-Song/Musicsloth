// Tauri command handlers
use tauri::{State, AppHandle, Emitter, Manager};
use std::path::PathBuf;

use crate::state::AppState;
use crate::library::scanner::DirectoryScanner;
use crate::library::indexer::{LibraryIndexer, IndexingResult, IndexingProgress, LoudnessAnalysisProgress};
use crate::metadata::loudness::analyze_loudness;
use crate::db::operations::DbOperations;
use crate::db::models::{Track, Album, Artist, Genre, Queue, ScanPath, Playlist};
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
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<IndexingResult, String> {
    // Clone what we need for the async task
    let db = state.db.clone();
    
    // Spawn blocking task to avoid blocking the event loop
    let result = tokio::task::spawn_blocking(move || {
        // Get all configured scan paths
        let scan_paths = DbOperations::get_all_scan_paths(&db)
            .map_err(|e| format!("Failed to get scan paths: {}", e))?;
        
        if scan_paths.is_empty() {
            return Err("No scan paths configured. Please add at least one directory to scan.".to_string());
        }
        
        // Accumulate results from all scan paths
        let mut total_files = 0;
        let mut successful = 0;
        let mut failed = 0;
        let mut skipped = 0;
        let mut updated = 0;
        let mut all_errors = Vec::new();
        
        // Scan each path individually with its last_scanned timestamp
        for scan_path in &scan_paths {
            // Scan this directory for audio files
            let audio_files = DirectoryScanner::scan(&scan_path.path)
                .map_err(|e| format!("Failed to scan directory {}: {}", scan_path.path, e))?;
            
            // Index files with last_scanned check
            let result = LibraryIndexer::index_files_with_progress(
                &audio_files, 
                &db, 
                scan_path.last_scanned,
                |progress| {
                    // Emit progress event to frontend
                    let _ = app.emit("scan-progress", progress);
                }
            )
            .map_err(|e| format!("Failed to index files from {}: {}", scan_path.path, e))?;
            
            // Accumulate results
            total_files += result.total_files;
            successful += result.successful;
            failed += result.failed;
            skipped += result.skipped;
            updated += result.updated;
            all_errors.extend(result.errors);
            
            // Update last_scanned timestamp for this path
            DbOperations::update_scan_path_last_scanned(&db, scan_path.id)
                .map_err(|e| format!("Failed to update last_scanned for {}: {}", scan_path.path, e))?;
        }
        
        // Final cleanup: remove tracks outside all scan paths and missing files
        let removed = DbOperations::remove_tracks_outside_scan_paths(&db, |current, total| {
            let _ = app.emit("scan-progress", IndexingProgress {
                current: total_files + current,
                total: total_files + total,
                current_file: format!("Removing orphaned tracks: {} / {}", current, total),
            });
        })
        .unwrap_or(0);
        
        let removed_missing = DbOperations::remove_missing_files(&db, |current, total| {
            let _ = app.emit("scan-progress", IndexingProgress {
                current: total_files + current,
                total: total_files + total,
                current_file: format!("Checking file existence: {} / {}", current, total),
            });
        })
        .unwrap_or(0);
        
        // Analyze loudness for tracks that don't have normalization data yet
        // This is CPU-intensive but essential for ReplayGain-style volume normalization
        let (loudness_analyzed, loudness_failed) = LibraryIndexer::analyze_loudness_with_progress(&db, |progress| {
            let _ = app.emit("loudness-analysis-progress", progress);
        })
        .unwrap_or((0, 0));
        
        if loudness_analyzed > 0 || loudness_failed > 0 {
            eprintln!("[Scan] Loudness analysis: {} analyzed, {} failed", loudness_analyzed, loudness_failed);
        }
        
        Ok::<IndexingResult, String>(IndexingResult {
            total_files,
            successful,
            failed,
            skipped,
            updated,
            removed: removed + removed_missing,
            errors: all_errors,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;
    
    Ok(result)
}

#[tauri::command]
pub fn add_scan_path(path: String, state: State<'_, AppState>) -> Result<i64, String> {
    // Check if path is a subdirectory of existing paths
    if DbOperations::is_subdirectory_of_existing_path(&state.db, &path)
        .map_err(|e| format!("Failed to check subdirectory: {}", e))? 
    {
        return Err("This directory is already covered by an existing scan path.".to_string());
    }
    
    DbOperations::add_scan_path(&state.db, &path)
        .map_err(|e| format!("Failed to add scan path: {}", e))
}

#[tauri::command]
pub fn get_all_scan_paths(state: State<'_, AppState>) -> Result<Vec<ScanPath>, String> {
    DbOperations::get_all_scan_paths(&state.db)
        .map_err(|e| format!("Failed to get scan paths: {}", e))
}

#[tauri::command]
pub fn remove_scan_path(path_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    DbOperations::remove_scan_path(&state.db, path_id)
        .map_err(|e| format!("Failed to remove scan path: {}", e))
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let folder = app.dialog()
        .file()
        .blocking_pick_folder();
    
    match folder {
        Some(file_path) => {
            match file_path.into_path() {
                Ok(path) => Ok(Some(path.to_string_lossy().to_string())),
                Err(e) => Err(format!("Failed to get path: {}", e)),
            }
        }
        None => Ok(None),
    }
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
pub async fn get_album_art(file_path: String) -> Result<Option<Vec<u8>>, String> {
    use lofty::probe::Probe;
    use lofty::picture::PictureType;
    use std::path::Path;
    
    // Run file I/O in a blocking task to avoid blocking the async runtime
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&file_path);
        
        // Try lofty first
        let lofty_result = Probe::open(&file_path)
            .and_then(|p| p.read());
        
        if let Ok(tagged_file) = lofty_result {
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
            
            return Ok(None);
        }
        
        // Fallback: try id3 crate for MP3 files if lofty failed
        let extension = path.extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase());
        
        if extension.as_deref() == Some("mp3") {
            if let Ok(tag) = id3::Tag::read_from_path(&file_path) {
                // id3 crate picture type priority (similar to lofty)
                use id3::frame::PictureType as Id3PictureType;
                let id3_priority = [
                    Id3PictureType::CoverFront,
                    Id3PictureType::Media,
                    Id3PictureType::CoverBack,
                    Id3PictureType::Leaflet,
                    Id3PictureType::Other,
                    Id3PictureType::Icon,
                    Id3PictureType::OtherIcon,
                    Id3PictureType::Artist,
                    Id3PictureType::Band,
                    Id3PictureType::Composer,
                    Id3PictureType::Lyricist,
                    Id3PictureType::RecordingLocation,
                    Id3PictureType::DuringRecording,
                    Id3PictureType::DuringPerformance,
                    Id3PictureType::ScreenCapture,
                    Id3PictureType::BrightFish,
                    Id3PictureType::Illustration,
                    Id3PictureType::BandLogo,
                    Id3PictureType::PublisherLogo,
                ];
                
                for pic_type in &id3_priority {
                    for picture in tag.pictures() {
                        if picture.picture_type == *pic_type {
                            return Ok(Some(picture.data.clone()));
                        }
                    }
                }
            }
        }
        
        Ok(None)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_lyrics(file_path: String) -> Result<Option<String>, String> {
    use lofty::probe::Probe;
    use lofty::tag::ItemKey;
    use std::path::Path;
    use std::fs;
    
    // Run file I/O in a blocking task to avoid blocking the async runtime
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&file_path);
        
        // First, try to read .lrc file with the same name
        if let Some(parent) = path.parent() {
            if let Some(stem) = path.file_stem() {
                let lrc_path = parent.join(format!("{}.lrc", stem.to_string_lossy()));
                if lrc_path.exists() {
                    match fs::read_to_string(&lrc_path) {
                        Ok(content) => {
                            if !content.trim().is_empty() {
                                return Ok(Some(content));
                            }
                        }
                        Err(e) => {
                            eprintln!("Failed to read .lrc file: {}", e);
                        }
                    }
                }
            }
        }
        
        // If no .lrc file, try to read lyrics from audio file tags
        let tagged_file = Probe::open(&file_path)
            .map_err(|e| format!("Failed to open file: {}", e))?
            .read()
            .map_err(|e| format!("Failed to read file: {}", e))?;
        
        // Try to get lyrics from primary tag first
        if let Some(tag) = tagged_file.primary_tag() {
            // Try the Lyrics ItemKey
            if let Some(lyrics) = tag.get_string(&ItemKey::Lyrics) {
                if !lyrics.trim().is_empty() {
                    return Ok(Some(lyrics.to_string()));
                }
            }
            
            // Iterate through all items to find lyrics-related fields
            for item in tag.items() {
                let key_str = format!("{:?}", item.key());
                if key_str.to_lowercase().contains("lyric") {
                    if let Some(text) = item.value().text() {
                        if !text.trim().is_empty() {
                            return Ok(Some(text.to_string()));
                        }
                    }
                }
            }
        }
        
        // Try all tags if primary tag didn't have lyrics
        for tag in tagged_file.tags() {
            if let Some(lyrics) = tag.get_string(&ItemKey::Lyrics) {
                if !lyrics.trim().is_empty() {
                    return Ok(Some(lyrics.to_string()));
                }
            }
            
            for item in tag.items() {
                let key_str = format!("{:?}", item.key());
                if key_str.to_lowercase().contains("lyric") {
                    if let Some(text) = item.value().text() {
                        if !text.trim().is_empty() {
                            return Ok(Some(text.to_string()));
                        }
                    }
                }
            }
        }
        
        Ok(None)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ===== Queue Management Commands =====

#[tauri::command]
pub fn create_queue_from_tracks(
    name: String,
    track_ids: Vec<i64>,
    clicked_index: usize,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    println!("[Queue] Starting queue creation with {} tracks", track_ids.len());
    
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
    
    // Check if queue with same name (source) already exists
    println!("[Queue] Checking for existing queue with name: {}", name);
    if let Some(existing_queue_id) = DbOperations::find_queue_by_name(&state.db, &name)
        .map_err(|e| format!("Failed to check for existing queue: {}", e))? 
    {
        println!("[Queue] Found existing queue ID: {}, replacing tracks", existing_queue_id);
        // Replace tracks in existing queue
        DbOperations::replace_queue_tracks(&state.db, existing_queue_id, &reordered_tracks)
            .map_err(|e| format!("Failed to replace queue tracks: {}", e))?;
        // Set as active
        DbOperations::set_active_queue(&state.db, existing_queue_id)
            .map_err(|e| format!("Failed to set active queue: {}", e))?;
        println!("[Queue] Replaced tracks in existing queue");
        return Ok(existing_queue_id);
    }
    
    println!("[Queue] No existing queue found, creating new one");
    
    // Create new queue (name is unique, so this should succeed)
    let queue_id = DbOperations::create_queue(&state.db, &name)
        .map_err(|e| format!("Failed to create queue: {}", e))?;
    println!("[Queue] Created queue '{}' with ID: {}", name, queue_id);
    
    println!("[Queue] Adding {} tracks to queue...", reordered_tracks.len());
    DbOperations::add_tracks_to_queue(&state.db, queue_id, &reordered_tracks)
        .map_err(|e| format!("Failed to add tracks to queue: {}", e))?;
    
    println!("[Queue] Queue creation complete, ID: {}", queue_id);
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

#[tauri::command]
pub fn update_queue_current_index(queue_id: i64, track_index: i32, state: State<'_, AppState>) -> Result<(), String> {
    DbOperations::update_queue_current_index(&state.db, queue_id, track_index)
        .map_err(|e| format!("Failed to update queue current index: {}", e))
}

#[tauri::command]
pub fn get_queue_current_index(queue_id: i64, state: State<'_, AppState>) -> Result<i32, String> {
    DbOperations::get_queue_current_index(&state.db, queue_id)
        .map_err(|e| format!("Failed to get queue current index: {}", e))
}

#[tauri::command]
pub fn get_next_queue(excluded_queue_id: i64, state: State<'_, AppState>) -> Result<Option<Queue>, String> {
    DbOperations::get_next_queue(&state.db, excluded_queue_id)
        .map_err(|e| format!("Failed to get next queue: {}", e))
}

#[tauri::command]
pub fn get_queue_track_at_position(queue_id: i64, position: i32, state: State<'_, AppState>) -> Result<Option<Track>, String> {
    DbOperations::get_queue_track_at_position(&state.db, queue_id, position)
        .map_err(|e| format!("Failed to get queue track at position: {}", e))
}

#[tauri::command]
pub fn get_queue_track_at_shuffled_position(queue_id: i64, shuffled_position: i32, shuffle_seed: i64, anchor_position: i32, state: State<'_, AppState>) -> Result<Option<Track>, String> {
    DbOperations::get_queue_track_at_shuffled_position(&state.db, queue_id, shuffled_position, shuffle_seed, anchor_position)
        .map_err(|e| format!("Failed to get queue track at shuffled position: {}", e))
}

#[tauri::command]
pub fn get_queue_length(queue_id: i64, state: State<'_, AppState>) -> Result<i32, String> {
    DbOperations::get_queue_length(&state.db, queue_id)
        .map_err(|e| format!("Failed to get queue length: {}", e))
}

#[tauri::command]
pub fn toggle_queue_shuffle(queue_id: i64, current_track_id: Option<i64>, state: State<'_, AppState>) -> Result<(i64, i32), String> {
    DbOperations::toggle_queue_shuffle(&state.db, queue_id, current_track_id)
        .map_err(|e| format!("Failed to toggle queue shuffle: {}", e))
}

#[tauri::command]
pub fn set_queue_shuffle_seed(queue_id: i64, shuffle_seed: i64, state: State<'_, AppState>) -> Result<(), String> {
    DbOperations::set_queue_shuffle_seed(&state.db, queue_id, shuffle_seed)
        .map_err(|e| format!("Failed to set queue shuffle seed: {}", e))
}

#[tauri::command]
pub fn get_queue_shuffle_seed(queue_id: i64, state: State<'_, AppState>) -> Result<i64, String> {
    DbOperations::get_queue_shuffle_seed(&state.db, queue_id)
        .map_err(|e| format!("Failed to get queue shuffle seed: {}", e))
}

#[tauri::command]
pub fn set_queue_shuffle_anchor(queue_id: i64, shuffle_anchor: i64, state: State<'_, AppState>) -> Result<(), String> {
    DbOperations::set_queue_shuffle_anchor(&state.db, queue_id, shuffle_anchor)
        .map_err(|e| format!("Failed to set queue shuffle anchor: {}", e))
}

#[tauri::command]
pub fn get_queue_shuffle_anchor(queue_id: i64, state: State<'_, AppState>) -> Result<i64, String> {
    DbOperations::get_queue_shuffle_anchor(&state.db, queue_id)
        .map_err(|e| format!("Failed to get queue shuffle anchor: {}", e))
}

#[tauri::command]
pub fn find_shuffled_position(original_index: i32, seed: i64, queue_length: i32, anchor_position: i32) -> Result<i32, String> {
    DbOperations::find_shuffled_position(original_index, seed, queue_length, anchor_position)
        .map_err(|e| format!("Failed to find shuffled position: {}", e))
}

// ===== System Playlists Commands =====

#[tauri::command]
pub fn get_recent_tracks(state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    DbOperations::get_recent_tracks(&state.db)
        .map_err(|e| format!("Failed to get recent tracks: {}", e))
}

#[tauri::command]
pub fn get_most_played_tracks(state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    DbOperations::get_most_played_tracks(&state.db)
        .map_err(|e| format!("Failed to get most played tracks: {}", e))
}

#[tauri::command]
pub fn get_unplayed_tracks(state: State<'_, AppState>) -> Result<Vec<Track>, String> {
    DbOperations::get_unplayed_tracks(&state.db)
        .map_err(|e| format!("Failed to get unplayed tracks: {}", e))
}

// ===== User Playlists Commands =====

#[tauri::command]
pub fn get_all_playlists(state: State<'_, AppState>) -> Result<Vec<Playlist>, String> {
    DbOperations::get_all_playlists(&state.db)
        .map_err(|e| format!("Failed to get playlists: {}", e))
}

#[tauri::command]
pub fn create_playlist(state: State<'_, AppState>, name: String, description: Option<String>) -> Result<i64, String> {
    DbOperations::create_playlist(&state.db, &name, description.as_deref())
        .map_err(|e| format!("Failed to create playlist: {}", e))
}

#[tauri::command]
pub fn rename_playlist(state: State<'_, AppState>, playlist_id: i64, new_name: String) -> Result<(), String> {
    DbOperations::rename_playlist(&state.db, playlist_id, &new_name)
        .map_err(|e| format!("Failed to rename playlist: {}", e))
}

#[tauri::command]
pub fn add_track_to_playlist(state: State<'_, AppState>, playlist_id: i64, track_id: i64) -> Result<(), String> {
    DbOperations::add_track_to_playlist(&state.db, playlist_id, track_id)
        .map_err(|e| format!("Failed to add track to playlist: {}", e))
}

#[tauri::command]
pub fn get_playlist_tracks(state: State<'_, AppState>, playlist_id: i64) -> Result<Vec<Track>, String> {
    DbOperations::get_playlist_tracks(&state.db, playlist_id)
        .map_err(|e| format!("Failed to get playlist tracks: {}", e))
}

#[tauri::command]
pub fn remove_track_from_playlist(state: State<'_, AppState>, playlist_id: i64, track_id: i64) -> Result<(), String> {
    DbOperations::remove_track_from_playlist(&state.db, playlist_id, track_id)
        .map_err(|e| format!("Failed to remove track from playlist: {}", e))
}

#[tauri::command]
pub fn delete_playlist(state: State<'_, AppState>, playlist_id: i64) -> Result<(), String> {
    DbOperations::delete_playlist(&state.db, playlist_id)
        .map_err(|e| format!("Failed to delete playlist: {}", e))
}

#[tauri::command]
pub fn reorder_playlist_track(state: State<'_, AppState>, playlist_id: i64, from_position: i32, to_position: i32) -> Result<(), String> {
    DbOperations::reorder_playlist_track(&state.db, playlist_id, from_position, to_position)
        .map_err(|e| format!("Failed to reorder playlist track: {}", e))
}

#[tauri::command]
pub fn reorder_queue_track(state: State<'_, AppState>, queue_id: i64, from_position: i32, to_position: i32) -> Result<i32, String> {
    DbOperations::reorder_queue_track(&state.db, queue_id, from_position, to_position)
        .map_err(|e| format!("Failed to reorder queue track: {}", e))
}

#[tauri::command]
pub fn append_tracks_to_queue(state: State<'_, AppState>, queue_id: i64, track_ids: Vec<i64>) -> Result<(), String> {
    DbOperations::append_tracks_to_queue(&state.db, queue_id, &track_ids)
        .map_err(|e| format!("Failed to append tracks to queue: {}", e))
}

#[tauri::command]
pub fn insert_tracks_after_position(state: State<'_, AppState>, queue_id: i64, track_ids: Vec<i64>, after_position: i32) -> Result<(), String> {
    DbOperations::insert_tracks_after_position(&state.db, queue_id, &track_ids, after_position)
        .map_err(|e| format!("Failed to insert tracks after position: {}", e))
}

#[tauri::command]
pub fn remove_track_at_position(state: State<'_, AppState>, queue_id: i64, position: i32) -> Result<i32, String> {
    DbOperations::remove_track_at_position(&state.db, queue_id, position)
        .map_err(|e| format!("Failed to remove track at position: {}", e))
}

#[tauri::command]
pub async fn save_album_art(app: AppHandle, file_path: String, default_name: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    use lofty::probe::Probe;
    use lofty::picture::PictureType;
    use std::fs;
    
    // First, get the album art data
    let art_data = tokio::task::spawn_blocking(move || {
        let lofty_result = Probe::open(&file_path)
            .and_then(|p| p.read());
        
        if let Ok(tagged_file) = lofty_result {
            let picture_priority = [
                PictureType::CoverFront,
                PictureType::Media,
                PictureType::CoverBack,
                PictureType::Leaflet,
                PictureType::Other,
            ];
            
            if let Some(tag) = tagged_file.primary_tag() {
                for pic_type in &picture_priority {
                    for picture in tag.pictures() {
                        if picture.pic_type() == *pic_type {
                            return Some(picture.data().to_vec());
                        }
                    }
                }
                // If no specific type matched, return first picture
                if let Some(picture) = tag.pictures().first() {
                    return Some(picture.data().to_vec());
                }
            }
        }
        None
    }).await.map_err(|e| format!("Failed to get album art: {}", e))?;
    
    let Some(data) = art_data else {
        return Err("No album art found".to_string());
    };
    
    // Show save dialog using callback-based approach
    let (tx, rx) = std::sync::mpsc::channel();
    let data_clone = data.clone();
    
    app.dialog()
        .file()
        .set_file_name(&format!("{}.jpg", default_name))
        .add_filter("JPEG Image", &["jpg", "jpeg"])
        .add_filter("PNG Image", &["png"])
        .save_file(move |file_path_opt| {
            let result = if let Some(path) = file_path_opt {
                match fs::write(path.as_path().unwrap(), &data_clone) {
                    Ok(_) => Ok(true),
                    Err(e) => Err(format!("Failed to write file: {}", e)),
                }
            } else {
                Ok(false) // User cancelled
            };
            let _ = tx.send(result);
        });
    
    rx.recv().map_err(|e| format!("Dialog error: {}", e))?
}

// ===== Audio Player Commands =====

use crate::audio::player::PlayerState;

#[tauri::command]
pub fn player_play(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.play(PathBuf::from(file_path))
}

#[tauri::command]
pub fn player_pause(state: State<'_, AppState>) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.pause();
    Ok(())
}

#[tauri::command]
pub fn player_resume(state: State<'_, AppState>) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.resume();
    Ok(())
}

#[tauri::command]
pub fn player_stop(state: State<'_, AppState>) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.stop();
    Ok(())
}

#[tauri::command]
pub fn player_seek(
    position_ms: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.seek(position_ms);
    Ok(())
}

#[tauri::command]
pub fn player_set_volume(
    volume: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.set_volume(volume);
    Ok(())
}

#[tauri::command]
pub fn player_set_volume_db(
    db: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.set_volume_db(db);
    Ok(())
}

#[tauri::command]
pub fn player_get_state(state: State<'_, AppState>) -> Result<PlayerState, String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(player.get_state())
}

#[tauri::command]
pub fn player_has_track_ended(state: State<'_, AppState>) -> Result<bool, String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(player.has_track_ended())
}

#[tauri::command]
pub fn player_play_with_normalization(
    file_path: String,
    normalization_gain_db: Option<f32>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.play_with_gain(PathBuf::from(file_path), normalization_gain_db)
}

#[tauri::command]
pub fn player_set_track_gain(
    gain_db: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.set_track_gain(gain_db);
    Ok(())
}

#[tauri::command]
pub fn player_set_normalization_enabled(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    player.set_normalization_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub fn player_get_normalization_enabled(state: State<'_, AppState>) -> Result<bool, String> {
    let player = state.player.lock().map_err(|e| format!("Lock error: {}", e))?;
    Ok(player.is_normalization_enabled())
}

/// Analyze loudness for all tracks that don't have normalization data yet
/// This is CPU-intensive and runs as a background task after the main scan
#[tauri::command]
pub async fn analyze_library_loudness(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(usize, usize), String> {
    let db = state.db.clone();
    
    let result = tokio::task::spawn_blocking(move || {
        LibraryIndexer::analyze_loudness_with_progress(&db, |progress| {
            let _ = app.emit("loudness-analysis-progress", progress);
        })
        .map_err(|e| format!("Loudness analysis failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;
    
    Ok(result)
}

/// Recalculate ReplayGain for a specific track using FULL analysis (not sampled)
/// This is slower but more accurate than the sampled version used during scanning.
/// Use this when a user wants to recalculate the gain for a specific track.
#[tauri::command]
pub async fn recalculate_track_replaygain(
    track_id: i64,
    state: State<'_, AppState>,
) -> Result<f32, String> {
    let db = state.db.clone();
    
    // Get the track's file path
    let track = DbOperations::get_track_by_id(&db, track_id)
        .map_err(|e| format!("Failed to get track: {}", e))?
        .ok_or_else(|| "Track not found".to_string())?;
    
    let file_path = track.file_path.clone();
    
    // Run full analysis in blocking task
    let result = tokio::task::spawn_blocking(move || {
        let path = std::path::Path::new(&file_path);
        analyze_loudness(path)
            .map_err(|e| format!("Loudness analysis failed: {}", e))
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;
    
    // Update the track with the new normalization gain
    DbOperations::update_track_normalization_gain(&db, track_id, result.normalization_gain_db)
        .map_err(|e| format!("Failed to update normalization gain: {}", e))?;
    
    Ok(result.normalization_gain_db)
}

// ============================================================================
// SMTC (System Media Transport Controls) Commands
// ============================================================================

#[tauri::command]
pub fn smtc_update_metadata(
    title: String,
    artist: Option<String>,
    album: Option<String>,
    artwork_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    eprintln!("[SMTC] update_metadata called - title: {}, artwork_path: {:?}", title, artwork_path);
    let smtc_guard = state.smtc.lock().map_err(|e| format!("Lock error: {}", e))?;
    if let Some(ref smtc) = *smtc_guard {
        let artwork = artwork_path.as_ref().map(std::path::Path::new);
        smtc.update_metadata(
            &title,
            artist.as_deref(),
            album.as_deref(),
            artwork,
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn smtc_set_playback_status(
    is_playing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let smtc_guard = state.smtc.lock().map_err(|e| format!("Lock error: {}", e))?;
    if let Some(ref smtc) = *smtc_guard {
        smtc.set_playback_status(is_playing)?;
    }
    Ok(())
}

#[tauri::command]
pub fn smtc_set_timeline(
    position_ms: i64,
    duration_ms: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let smtc_guard = state.smtc.lock().map_err(|e| format!("Lock error: {}", e))?;
    if let Some(ref smtc) = *smtc_guard {
        smtc.set_timeline(position_ms, duration_ms)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_artwork_temp_path(app: AppHandle, file_path: String) -> Result<Option<String>, String> {
    use lofty::probe::Probe;
    use lofty::picture::PictureType;
    
    // Get album art data
    let art_data = tokio::task::spawn_blocking(move || {
        let lofty_result = Probe::open(&file_path)
            .and_then(|p| p.read());
        
        if let Ok(tagged_file) = lofty_result {
            let picture_priority = [
                PictureType::CoverFront,
                PictureType::Media,
                PictureType::CoverBack,
                PictureType::Leaflet,
                PictureType::Other,
            ];
            
            if let Some(tag) = tagged_file.primary_tag() {
                for pic_type in &picture_priority {
                    for picture in tag.pictures() {
                        if picture.pic_type() == *pic_type {
                            return Some(picture.data().to_vec());
                        }
                    }
                }
            }
            
            // Check all tags if primary tag didn't have art
            for tag in tagged_file.tags() {
                if let Some(picture) = tag.pictures().first() {
                    return Some(picture.data().to_vec());
                }
            }
        }
        None
    }).await.map_err(|e| format!("Task join error: {}", e))?;
    
    if let Some(data) = art_data {
        eprintln!("[SMTC] Found artwork data: {} bytes", data.len());
        // Save to temp directory
        let cache_dir = app.path().app_cache_dir()
            .map_err(|e| format!("Failed to get cache dir: {}", e))?;
        
        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("Failed to create cache dir: {}", e))?;
        
        let temp_path = cache_dir.join("smtc_artwork.jpg");
        
        std::fs::write(&temp_path, &data)
            .map_err(|e| format!("Failed to write artwork: {}", e))?;
        
        eprintln!("[SMTC] Saved artwork to: {:?}", temp_path);
        Ok(Some(temp_path.to_string_lossy().to_string()))
    } else {
        eprintln!("[SMTC] No artwork found in file");
        Ok(None)
    }
}

// ============================================================================
// Settings Commands
// ============================================================================

use crate::settings::AppSettings;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    AppSettings::load(&state.app_dir)
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, state: State<'_, AppState>) -> Result<(), String> {
    settings.save(&state.app_dir)
}
