// Metadata extractor using lofty
use lofty::probe::Probe;
use lofty::prelude::{TaggedFileExt, ItemKey, Accessor, AudioFile};
use std::path::Path;
use anyhow::Result;

use crate::db::models::Track;

pub struct MetadataExtractor;

impl MetadataExtractor {
    pub fn extract_from_file(file_path: &Path) -> Result<Track> {
        let tagged_file = Probe::open(file_path)?
            .guess_file_type()?
            .read()?;

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
        let year = tag.and_then(|t| t.year());
        let track_number = tag.and_then(|t| t.track());
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
            disc_number: None, // TODO: Extract disc number
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
        })
    }
}
