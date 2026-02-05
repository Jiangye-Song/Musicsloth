use std::path::Path;
use std::fs::File;
use std::io::Read;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use crate::db::connection::DatabaseConnection;
use crate::db::operations::DbOperations;
use crate::metadata::extractor::MetadataExtractor;
use crate::metadata::parser::{parse_artists, parse_genres};
use crate::metadata::loudness::analyze_loudness_sampled;
use blake3;
use rayon::prelude::*;

/// Result of an indexing operation
#[derive(Debug, Clone, serde::Serialize)]
pub struct IndexingResult {
    pub total_files: usize,
    pub successful: usize,
    pub failed: usize,
    pub skipped: usize,
    pub updated: usize,
    pub removed: usize,
    pub errors: Vec<String>,
}

/// Progress update for indexing
#[derive(Debug, Clone, serde::Serialize)]
pub struct IndexingProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

/// Progress update for loudness analysis
#[derive(Debug, Clone, serde::Serialize)]
pub struct LoudnessAnalysisProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
    pub analyzed: usize,
    pub failed: usize,
}

/// Library indexer for adding tracks to database
pub struct LibraryIndexer;

impl LibraryIndexer {
    /// Index a list of audio files into the database with progress callback
    pub fn index_files_with_progress<P: AsRef<Path>, F>(
        paths: &[P],
        db: &DatabaseConnection,
        last_scanned: Option<i64>,
        mut progress_callback: F,
    ) -> Result<IndexingResult, anyhow::Error>
    where
        F: FnMut(IndexingProgress),
    {
        let total_files = paths.len();
        let mut successful = 0;
        let mut failed = 0;
        let mut skipped = 0;
        let mut updated = 0;
        let mut errors = Vec::new();
        
        for (index, path) in paths.iter().enumerate() {
            let path_ref = path.as_ref();
            
            // Send progress update
            progress_callback(IndexingProgress {
                current: index + 1,
                total: total_files,
                current_file: path_ref.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string(),
            });
            
            match Self::index_single_file(path_ref, db, last_scanned) {
                Ok(was_updated) => {
                    if was_updated {
                        updated += 1;
                    } else {
                        skipped += 1;
                    }
                    successful += 1;
                }
                Err(e) => {
                    failed += 1;
                    errors.push(format!("{}: {}", path_ref.display(), e));
                    eprintln!("Failed to index {}: {}", path_ref.display(), e);
                }
            }
        }
        
        Ok(IndexingResult {
            total_files,
            successful,
            failed,
            skipped,
            updated,
            removed: 0, // Removal is now handled separately in the command
            errors,
        })
    }
    
    /// Calculate file hash using BLAKE3 (fast and secure)
    fn calculate_file_hash(path: &Path) -> Result<String, anyhow::Error> {
        let mut file = File::open(path)?;
        let mut hasher = blake3::Hasher::new();
        let mut buffer = [0; 8192];
        
        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }
        
        Ok(hasher.finalize().to_hex().to_string())
    }
    
    /// Index a single audio file, returns true if updated/inserted, false if skipped
    fn index_single_file(
        path: &Path,
        db: &DatabaseConnection,
        last_scanned: Option<i64>,
    ) -> Result<bool, anyhow::Error> {
        // If last_scanned is provided, check file modification time
        if let Some(last_scan_time) = last_scanned {
            if let Ok(metadata) = std::fs::metadata(path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(modified_duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                        let modified_timestamp = modified_duration.as_secs() as i64;
                        // Skip if file wasn't modified since last scan
                        if modified_timestamp < last_scan_time {
                            return Ok(false);
                        }
                    }
                }
            }
        }
        
        // Calculate file hash first
        let file_hash = Self::calculate_file_hash(path)?;
        
        // Extract metadata - this already creates a Track struct
        // Fallback is now handled inside extract_from_file
        let track = MetadataExtractor::extract_from_file(path)?;
        
        // Upsert track with hash comparison
        let (track_id, was_updated) = DbOperations::upsert_track_with_hash(db, &track, &file_hash)?;
        
        // Only update relationships if track was actually updated/inserted
        if was_updated {
            // Parse multi-value artist field
            let artist_names = if let Some(ref artist_name) = track.artist {
                parse_artists(artist_name)
            } else {
                vec![]
            };
            
            // Parse multi-value genre field
            let genre_names = if let Some(ref genre_name) = track.genre {
                parse_genres(genre_name)
            } else {
                vec![]
            };
            
            // Insert individual artists
            for artist in &artist_names {
                let _ = DbOperations::insert_or_get_artist(db, artist)?;
            }
            
            // Insert individual genres
            for genre in &genre_names {
                let _ = DbOperations::insert_or_get_genre(db, genre)?;
            }
            
            // Insert album if present (use first artist from multi-value field)
            if let Some(ref album_title) = track.album {
                let album_artist = artist_names.first().map(|s| s.as_str());
                let _ = DbOperations::insert_or_get_album(
                    db,
                    album_title,
                    album_artist,
                    track.year,
                )?;
            }
            
            // Clear existing relationships
            let conn = db.get_connection();
            let conn = conn.lock().unwrap();
            conn.execute("DELETE FROM track_artists WHERE track_id = ?1", rusqlite::params![track_id])?;
            conn.execute("DELETE FROM track_genres WHERE track_id = ?1", rusqlite::params![track_id])?;
            drop(conn);
            
            // Link track with multiple artists via junction table
            if !artist_names.is_empty() {
                DbOperations::link_track_artists(db, track_id, &artist_names)?;
            }
            
            // Link track with multiple genres via junction table
            if !genre_names.is_empty() {
                DbOperations::link_track_genres(db, track_id, &genre_names)?;
            }
        }
        
        Ok(was_updated)
    }
    
    /// Analyze loudness for all tracks that don't have normalization data yet
    /// This is CPU-intensive and runs in PARALLEL using all available cores
    pub fn analyze_loudness_with_progress<F>(
        db: &DatabaseConnection,
        mut progress_callback: F,
    ) -> Result<(usize, usize), anyhow::Error>
    where
        F: FnMut(LoudnessAnalysisProgress),
    {
        // Get all tracks that need loudness analysis
        let tracks = DbOperations::get_tracks_needing_loudness_analysis(db)?;
        let total = tracks.len();
        
        if total == 0 {
            return Ok((0, 0));
        }
        
        // Atomic counters for thread-safe progress tracking
        let processed = Arc::new(AtomicUsize::new(0));
        let analyzed_count = Arc::new(AtomicUsize::new(0));
        let failed_count = Arc::new(AtomicUsize::new(0));
        
        // Clone Arcs for the parallel thread
        let processed_clone = processed.clone();
        let analyzed_clone = analyzed_count.clone();
        let failed_clone = failed_count.clone();
        
        // Store current file name for progress display
        let current_file_name = Arc::new(parking_lot::Mutex::new(String::new()));
        let current_file_clone = current_file_name.clone();
        
        // Send initial progress
        progress_callback(LoudnessAnalysisProgress {
            current: 0,
            total,
            current_file: "Starting parallel analysis...".to_string(),
            analyzed: 0,
            failed: 0,
        });
        
        // Spawn the parallel analysis in a separate thread so we can report progress
        let tracks_clone = tracks.clone();
        let analysis_handle = std::thread::spawn(move || {
            // Analyze tracks in parallel and collect results
            // Result: (track_id, Option<normalization_gain_db>)
            let results: Vec<(i64, Option<f32>)> = tracks_clone
                .par_iter()
                .map(|track| {
                    // Update current file name for progress display
                    {
                        let file_name = std::path::Path::new(&track.file_path)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("unknown")
                            .to_string();
                        *current_file_clone.lock() = file_name;
                    }
                    
                    let path = std::path::Path::new(&track.file_path);
                    
                    // Use sampled analysis for speed during scanning (5-10x faster)
                    let result = match analyze_loudness_sampled(path) {
                        Ok(loudness_result) => {
                            analyzed_clone.fetch_add(1, Ordering::Relaxed);
                            Some(loudness_result.normalization_gain_db)
                        }
                        Err(e) => {
                            eprintln!("Loudness analysis failed for {}: {}", track.file_path, e);
                            failed_clone.fetch_add(1, Ordering::Relaxed);
                            None // Will set to 0.0 dB to mark as processed
                        }
                    };
                    
                    // Increment processed counter
                    processed_clone.fetch_add(1, Ordering::Relaxed);
                    
                    (track.id, result)
                })
                .collect();
            
            results
        });
        
        // Poll progress while analysis runs
        loop {
            let current = processed.load(Ordering::Relaxed);
            let analyzed = analyzed_count.load(Ordering::Relaxed);
            let failed = failed_count.load(Ordering::Relaxed);
            let file_name = current_file_name.lock().clone();
            
            progress_callback(LoudnessAnalysisProgress {
                current,
                total,
                current_file: file_name,
                analyzed,
                failed,
            });
            
            // Check if analysis thread is done
            if analysis_handle.is_finished() {
                break;
            }
            
            // Sleep briefly before next poll
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        
        // Get the results from the analysis thread
        let results = analysis_handle.join().map_err(|_| anyhow::anyhow!("Analysis thread panicked"))?;
        
        // Now update the database sequentially (database is not thread-safe)
        let mut final_analyzed = 0;
        let mut final_failed = 0;
        
        for (index, (track_id, gain_result)) in results.iter().enumerate() {
            // Periodic progress update during DB writes
            if index % 100 == 0 || index == results.len() - 1 {
                progress_callback(LoudnessAnalysisProgress {
                    current: index + 1,
                    total,
                    current_file: format!("Saving results to database... ({}/{})", index + 1, total),
                    analyzed: final_analyzed,
                    failed: final_failed,
                });
            }
            
            match gain_result {
                Some(gain_db) => {
                    if let Err(e) = DbOperations::update_track_normalization_gain(db, *track_id, *gain_db) {
                        eprintln!("Failed to update normalization gain for track {}: {}", track_id, e);
                        final_failed += 1;
                    } else {
                        final_analyzed += 1;
                    }
                }
                None => {
                    // Analysis failed - set to 0.0 dB to prevent re-analyzing every scan
                    let _ = DbOperations::update_track_normalization_gain(db, *track_id, 0.0);
                    final_failed += 1;
                }
            }
        }
        
        Ok((final_analyzed, final_failed))
    }
}
