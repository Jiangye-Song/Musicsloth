use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// List of supported audio file extensions
const SUPPORTED_EXTENSIONS: &[&str] = &[
    "mp3", "flac", "ogg", "wav", "m4a", "aac", "opus", "wma",
];

/// Scanner for finding audio files in a directory tree
pub struct DirectoryScanner;

impl DirectoryScanner {
    /// Scan a directory recursively and return all audio file paths
    pub fn scan<P: AsRef<Path>>(directory: P) -> Result<Vec<PathBuf>, anyhow::Error> {
        let mut audio_files = Vec::new();
        
        for entry in WalkDir::new(directory)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            
            // Skip directories
            if !path.is_file() {
                continue;
            }
            
            // Check if file has a supported extension
            if let Some(extension) = path.extension() {
                let ext_str = extension.to_string_lossy().to_lowercase();
                if SUPPORTED_EXTENSIONS.contains(&ext_str.as_str()) {
                    audio_files.push(path.to_path_buf());
                }
            }
        }
        
        Ok(audio_files)
    }
}
