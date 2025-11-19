use std::path::Path;
use crate::db::connection::DatabaseConnection;
use crate::db::operations::DbOperations;
use crate::metadata::extractor::MetadataExtractor;
use crate::metadata::parser::{parse_artists, parse_genres};

/// Result of an indexing operation
#[derive(Debug, Clone, serde::Serialize)]
pub struct IndexingResult {
    pub total_files: usize,
    pub successful: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

/// Progress update for indexing
#[derive(Debug, Clone, serde::Serialize)]
pub struct IndexingProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

/// Library indexer for adding tracks to database
pub struct LibraryIndexer;

impl LibraryIndexer {
    /// Index a list of audio files into the database with progress callback
    pub fn index_files_with_progress<P: AsRef<Path>, F>(
        paths: &[P],
        db: &DatabaseConnection,
        mut progress_callback: F,
    ) -> Result<IndexingResult, anyhow::Error>
    where
        F: FnMut(IndexingProgress),
    {
        let total_files = paths.len();
        let mut successful = 0;
        let mut failed = 0;
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
            
            match Self::index_single_file(path_ref, db) {
                Ok(_) => successful += 1,
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
            errors,
        })
    }
    
    /// Index a list of audio files into the database (without progress)
    pub fn index_files<P: AsRef<Path>>(
        paths: &[P],
        db: &DatabaseConnection,
    ) -> Result<IndexingResult, anyhow::Error> {
        Self::index_files_with_progress(paths, db, |_| {})
    }
    
    /// Index a single audio file
    fn index_single_file(
        path: &Path,
        db: &DatabaseConnection,
    ) -> Result<i64, anyhow::Error> {
        // Extract metadata - this already creates a Track struct
        // Fallback is now handled inside extract_from_file
        let track = MetadataExtractor::extract_from_file(path)?;
        
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
        
        // Insert track
        let track_id = DbOperations::insert_track(db, &track)?;
        
        // Link track with multiple artists via junction table
        if !artist_names.is_empty() {
            DbOperations::link_track_artists(db, track_id, &artist_names)?;
        }
        
        // Link track with multiple genres via junction table
        if !genre_names.is_empty() {
            DbOperations::link_track_genres(db, track_id, &genre_names)?;
        }
        
        Ok(track_id)
    }
}
