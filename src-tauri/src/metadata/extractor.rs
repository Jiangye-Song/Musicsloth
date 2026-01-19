// Metadata extractor using lofty with id3 fallback for problematic MP3 files
use lofty::probe::Probe;
use lofty::prelude::{TaggedFileExt, ItemKey, Accessor, AudioFile};
use id3::TagLike;
use std::path::Path;
use anyhow::Result;

use crate::db::models::Track;

pub struct MetadataExtractor;

impl MetadataExtractor {
    pub fn extract_from_file(file_path: &Path) -> Result<Track> {
        // Try to read the file with lofty first
        let tagged_file = match Probe::open(file_path)?.guess_file_type()?.read() {
            Ok(f) => f,
            Err(e) => {
                eprintln!("Failed to read file with lofty: {:?}, error: {}", file_path, e);
                // Fallback: try id3 crate for MP3 files, otherwise return minimal track info
                return Self::extract_with_fallback(file_path);
            }
        };

        let tag = tagged_file.primary_tag().or(tagged_file.first_tag());
        let properties = tagged_file.properties();

        let title = tag
            .and_then(|t| t.title().map(|s| s.to_string()))
            .unwrap_or_else(|| {
                file_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string()
            });

        let artist = tag.and_then(|t| t.artist().map(|s| s.to_string()));
        let album = tag.and_then(|t| t.album().map(|s| s.to_string()));
        let album_artist = tag.and_then(|t| t.get_string(&ItemKey::AlbumArtist).map(|s| s.to_string()));
        
        // Try to get year - safely handle parsing errors for malformed year tags
        let year = tag.and_then(|t| {
            // First try the standard year() method
            if let Some(y) = t.year() {
                return Some(y);
            }
            // Try to parse from raw TYER or DATE tags if year() fails
            if let Some(year_str) = t.get_string(&ItemKey::Year)
                .or_else(|| t.get_string(&ItemKey::RecordingDate)) {
                // Extract just the year part (first 4 digits)
                if let Some(captures) = year_str.chars()
                    .take(4)
                    .collect::<String>()
                    .parse::<u32>()
                    .ok() {
                    return Some(captures);
                }
            }
            None
        });
        
        let track_number = tag.and_then(|t| t.track());
        let disc_number = tag.and_then(|t| t.disk());
        let genre = tag.and_then(|t| t.genre().map(|s| s.to_string()));

        let duration_ms = properties.duration().as_millis() as i64;
        let bitrate = properties.audio_bitrate().map(|b| b as i32);
        let sample_rate = properties.sample_rate().map(|s| s as i32);

        let file_size = std::fs::metadata(file_path)?.len() as i64;
        let file_format = file_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;

        Ok(Track {
            id: 0, // Will be set by database
            file_path: file_path.to_string_lossy().to_string(),
            title,
            artist,
            album,
            album_artist,
            year,
            track_number: track_number.map(|n| n as i32),
            disc_number: disc_number.map(|n| n as i32),
            duration_ms: Some(duration_ms),
            genre,
            file_size: Some(file_size),
            file_format: Some(file_format),
            bitrate,
            sample_rate,
            date_added: now,
            date_modified: now,
            play_count: 0,
            last_played: None,
            file_hash: None,
        })
    }
    
    /// Fallback extraction method - uses id3 crate for MP3 files, minimal info for others
    fn extract_with_fallback(file_path: &Path) -> Result<Track> {
        let extension = file_path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase());
        
        // Try id3 crate for MP3 files
        if extension.as_deref() == Some("mp3") {
            if let Ok(track) = Self::extract_with_id3(file_path) {
                eprintln!("Successfully extracted metadata using id3 fallback for: {:?}", file_path);
                return Ok(track);
            }
        }
        
        // Final fallback: minimal track info
        Self::create_minimal_track(file_path)
    }
    
    /// Extract metadata using the id3 crate (more lenient with malformed tags)
    fn extract_with_id3(file_path: &Path) -> Result<Track> {
        let tag = id3::Tag::read_from_path(file_path)?;
        
        let title = tag.title()
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                file_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string()
            });
        
        let artist = tag.artist().map(|s| s.to_string());
        let album = tag.album().map(|s| s.to_string());
        let album_artist = tag.album_artist().map(|s| s.to_string());
        let year = tag.year().map(|y| y as u32);
        let track_number = tag.track().map(|t| t as i32);
        let disc_number = tag.disc().map(|d| d as i32);
        let genre = tag.genre_parsed().map(|g| g.to_string());
        
        // id3 crate doesn't provide audio properties, so we'll leave duration/bitrate as None
        // The duration could be obtained from the TLEN frame if present
        let duration_ms = tag.duration().map(|d| d as i64 * 1000);
        
        let file_size = std::fs::metadata(file_path)?.len() as i64;
        let file_format = file_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;
        
        Ok(Track {
            id: 0,
            file_path: file_path.to_string_lossy().to_string(),
            title,
            artist,
            album,
            album_artist,
            year,
            track_number,
            disc_number,
            duration_ms,
            genre,
            file_size: Some(file_size),
            file_format: Some(file_format),
            bitrate: None, // id3 crate doesn't provide this
            sample_rate: None, // id3 crate doesn't provide this
            date_added: now,
            date_modified: now,
            play_count: 0,
            last_played: None,
            file_hash: None,
        })
    }
    
    /// Create a minimal track entry when all metadata extraction fails
    fn create_minimal_track(file_path: &Path) -> Result<Track> {
        let title = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();
        
        let file_size = std::fs::metadata(file_path)?.len() as i64;
        let file_format = file_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;
        
        Ok(Track {
            id: 0,
            file_path: file_path.to_string_lossy().to_string(),
            title,
            artist: None,
            album: None,
            album_artist: None,
            year: None,
            track_number: None,
            disc_number: None,
            duration_ms: None,
            genre: None,
            file_size: Some(file_size),
            file_format: Some(file_format),
            bitrate: None,
            sample_rate: None,
            date_added: now,
            date_modified: now,
            play_count: 0,
            last_played: None,
            file_hash: None,
        })
    }
}
