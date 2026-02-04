use std::path::Path;
use std::fs::File;
use std::io::Read;
use crate::db::connection::DatabaseConnection;
use crate::db::operations::DbOperations;
use crate::metadata::extractor::MetadataExtractor;
use crate::metadata::parser::{parse_artists, parse_genres};
use crate::metadata::loudness::analyze_loudness;
use blake3;

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
    /// This is CPU-intensive and should be run as a separate phase after indexing
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
        
        let mut analyzed = 0;
        let mut failed = 0;
        
        for (index, track) in tracks.iter().enumerate() {
            let file_name = std::path::Path::new(&track.file_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            
            // Send progress update
            progress_callback(LoudnessAnalysisProgress {
                current: index + 1,
                total,
                current_file: file_name,
                analyzed,
                failed,
            });
            
            // Analyze loudness
            let path = std::path::Path::new(&track.file_path);
            match analyze_loudness(path) {
                Ok(result) => {
                    // Update the track with normalization gain
                    if let Err(e) = DbOperations::update_track_normalization_gain(
                        db,
                        track.id,
                        result.normalization_gain_db,
                    ) {
                        eprintln!("Failed to update normalization gain for {}: {}", track.file_path, e);
                        failed += 1;
                    } else {
                        analyzed += 1;
                        eprintln!(
                            "Loudness analysis: {} -> {:.1} LUFS, gain: {:.1} dB",
                            track.title,
                            result.integrated_lufs,
                            result.normalization_gain_db
                        );
                    }
                }
                Err(e) => {
                    eprintln!("Loudness analysis failed for {}: {}", track.file_path, e);
                    // Set gain to 0 dB to prevent re-analyzing failed files every scan
                    let _ = DbOperations::update_track_normalization_gain(db, track.id, 0.0);
                    failed += 1;
                }
            }
        }
        
        Ok((analyzed, failed))
    }
}
