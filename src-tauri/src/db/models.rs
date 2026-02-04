// Data models
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: i64,
    pub file_path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub year: Option<u32>,
    pub track_number: Option<i32>,
    pub disc_number: Option<i32>,
    pub duration_ms: Option<i64>,
    pub genre: Option<String>,
    pub file_size: Option<i64>,
    pub file_format: Option<String>,
    pub bitrate: Option<i32>,
    pub sample_rate: Option<i32>,
    pub date_added: i64,
    pub date_modified: i64,
    pub play_count: i32,
    pub last_played: Option<i64>,
    pub file_hash: Option<String>,
    /// ReplayGain normalization gain in dB (EBU R128 standard).
    /// Positive values = track is quieter than reference, needs boost.
    /// Negative values = track is louder than reference, needs reduction.
    /// Target loudness is -14 LUFS (streaming standard).
    #[serde(default)]
    pub normalization_gain_db: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanPath {
    pub id: i64,
    pub path: String,
    pub date_added: i64,
    pub last_scanned: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    pub id: i64,
    pub name: String,
    pub artist: Option<String>,
    pub year: Option<i32>,
    pub song_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artist {
    pub id: i64,
    pub name: String,
    pub song_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Genre {
    pub id: i64,
    pub name: String,
    pub song_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Queue {
    pub id: i64,
    pub name: String,
    pub is_active: bool,
    #[serde(default = "default_shuffle_seed")]
    pub shuffle_seed: i64,
    /// JSON array of track IDs representing the original order before shuffling.
    /// Only populated when shuffle is enabled.
    #[serde(default)]
    pub original_order: Option<String>,
}

fn default_shuffle_seed() -> i64 {
    1
}
