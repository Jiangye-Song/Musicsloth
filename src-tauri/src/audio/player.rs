// Simple player state tracker - actual audio playback is handled in frontend
use std::path::PathBuf;
use std::sync::Mutex;
use anyhow::Result;

pub struct Player {
    current_file: Mutex<Option<PathBuf>>,
}

impl Player {
    pub fn new() -> Result<Self> {
        Ok(Self {
            current_file: Mutex::new(None),
        })
    }

    pub fn set_current_file(&self, file_path: PathBuf) {
        *self.current_file.lock().unwrap() = Some(file_path);
    }

    pub fn current_file(&self) -> Option<PathBuf> {
        self.current_file.lock().unwrap().clone()
    }

    pub fn clear_current_file(&self) {
        *self.current_file.lock().unwrap() = None;
    }
}
