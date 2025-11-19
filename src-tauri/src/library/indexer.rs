use std::path::Path;
use crate::db::connection::DatabaseConnection;
use crate::db::operations::DbOperations;
use crate::metadata::extractor::MetadataExtractor;

/// Result of an indexing operation
#[derive(Debug, Clone, serde::Serialize)]
pub struct IndexingResult {
    pub total_files: usize,
    pub successful: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

/// Library indexer for adding tracks to database
pub struct LibraryIndexer;

impl LibraryIndexer {
    /// Index a list of audio files into the database
    pub fn index_files<P: AsRef<Path>>(
        paths: &[P],
        db: &DatabaseConnection,
    ) -> Result<IndexingResult, anyhow::Error> {
        let total_files = paths.len();
        let mut successful = 0;
        let mut failed = 0;
        let mut errors = Vec::new();
        
        for path in paths {
            let path_ref = path.as_ref();
            
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
    
    /// Index a single audio file
    fn index_single_file(
        path: &Path,
        db: &DatabaseConnection,
    ) -> Result<i64, anyhow::Error> {
        // Extract metadata - this already creates a Track struct
        // Fallback is now handled inside extract_from_file
        let track = MetadataExtractor::extract_from_file(path)?;
        
        // Insert artist if present (for relational queries later)
        if let Some(ref artist_name) = track.artist {
            let _ = DbOperations::insert_or_get_artist(db, artist_name)?;
        }
        
        // Insert genre if present (for relational queries later)
        if let Some(ref genre_name) = track.genre {
            let _ = DbOperations::insert_or_get_genre(db, genre_name)?;
        }
        
        // Insert album if present (for relational queries later)
        if let Some(ref album_title) = track.album {
            let _ = DbOperations::insert_or_get_album(
                db,
                album_title,
                track.artist.as_deref(),
                track.year,
            )?;
        }
        
        // Insert track
        let track_id = DbOperations::insert_track(db, &track)?;
        
        Ok(track_id)
    }
}
