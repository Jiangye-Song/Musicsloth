// Audio player using Symphonia for decoding and cpal for output

#![allow(dead_code)] // Methods will be used in Phase 2

use super::decoder::AudioDecoder;
use super::output::AudioOutput;
use parking_lot::{Mutex, RwLock};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

/// Player state that can be serialized and sent to frontend
#[derive(Clone, Debug, serde::Serialize)]
pub struct PlayerState {
    pub is_playing: bool,
    pub is_paused: bool,
    pub current_file: Option<String>,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub volume: f32,
}

/// Audio player with Symphonia decoding and cpal output
pub struct Player {
    // Playback state flags
    is_playing: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    should_stop: Arc<AtomicBool>,
    
    // Position tracking
    position_ms: Arc<AtomicI64>,
    duration_ms: Arc<AtomicI64>,
    
    // Volume (0.0 to 1.0)
    volume: Arc<RwLock<f32>>,
    
    // Current file path
    current_file: Arc<RwLock<Option<PathBuf>>>,
    
    // Seek request (-1 = no seek, >= 0 = seek to position)
    seek_request: Arc<AtomicI64>,
    
    // Playback thread handle
    playback_thread: Mutex<Option<JoinHandle<()>>>,
    
    // Track ended callback trigger
    track_ended: Arc<AtomicBool>,
}

impl Player {
    /// Create a new player instance
    pub fn new() -> Self {
        Self {
            is_playing: Arc::new(AtomicBool::new(false)),
            is_paused: Arc::new(AtomicBool::new(false)),
            should_stop: Arc::new(AtomicBool::new(false)),
            position_ms: Arc::new(AtomicI64::new(0)),
            duration_ms: Arc::new(AtomicI64::new(0)),
            volume: Arc::new(RwLock::new(1.0)),
            current_file: Arc::new(RwLock::new(None)),
            seek_request: Arc::new(AtomicI64::new(-1)),
            playback_thread: Mutex::new(None),
            track_ended: Arc::new(AtomicBool::new(false)),
        }
    }
    
    /// Start playing a file
    pub fn play(&self, file_path: PathBuf) -> Result<(), String> {
        // Stop any current playback first
        self.stop();
        
        // Reset track ended flag
        self.track_ended.store(false, Ordering::SeqCst);
        
        // Update current file
        *self.current_file.write() = Some(file_path.clone());
        
        // Reset state
        self.is_playing.store(true, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);
        self.should_stop.store(false, Ordering::SeqCst);
        self.position_ms.store(0, Ordering::SeqCst);
        self.seek_request.store(-1, Ordering::SeqCst);
        
        // Clone Arcs for the playback thread
        let is_playing = self.is_playing.clone();
        let is_paused = self.is_paused.clone();
        let should_stop = self.should_stop.clone();
        let position_ms = self.position_ms.clone();
        let duration_ms = self.duration_ms.clone();
        let volume = self.volume.clone();
        let seek_request = self.seek_request.clone();
        let track_ended = self.track_ended.clone();
        
        // Spawn playback thread
        let handle = thread::spawn(move || {
            if let Err(e) = Self::playback_loop(
                file_path,
                is_playing.clone(),
                is_paused,
                should_stop,
                position_ms,
                duration_ms,
                volume,
                seek_request,
                track_ended.clone(),
            ) {
                eprintln!("Playback error: {}", e);
            }
            
            // Mark as not playing when thread exits
            is_playing.store(false, Ordering::SeqCst);
            track_ended.store(true, Ordering::SeqCst);
        });
        
        *self.playback_thread.lock() = Some(handle);
        
        Ok(())
    }
    
    /// The main playback loop running in a separate thread
    fn playback_loop(
        file_path: PathBuf,
        is_playing: Arc<AtomicBool>,
        is_paused: Arc<AtomicBool>,
        should_stop: Arc<AtomicBool>,
        position_ms: Arc<AtomicI64>,
        duration_ms: Arc<AtomicI64>,
        volume: Arc<RwLock<f32>>,
        seek_request: Arc<AtomicI64>,
        _track_ended: Arc<AtomicBool>,
    ) -> Result<(), String> {
        // Open the audio file
        let mut decoder = AudioDecoder::open(&file_path)?;
        
        // Set duration
        if let Some(dur) = decoder.duration_ms() {
            duration_ms.store(dur, Ordering::SeqCst);
        }
        
        // Initialize audio output
        let output = AudioOutput::new()?;
        
        // Calculate samples per millisecond for position tracking
        let sample_rate = decoder.sample_rate();
        let channels = decoder.channels();
        let samples_per_ms = (sample_rate as f64 * channels as f64) / 1000.0;
        
        let mut samples_decoded: i64 = 0;
        
        // Main decode/playback loop
        while !should_stop.load(Ordering::SeqCst) {
            // Handle pause
            if is_paused.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(10));
                continue;
            }
            
            // Handle seek request
            let seek_pos = seek_request.swap(-1, Ordering::SeqCst);
            if seek_pos >= 0 {
                match decoder.seek(seek_pos) {
                    Ok(actual_pos) => {
                        // Update position and sample count
                        position_ms.store(actual_pos as i64, Ordering::SeqCst);
                        samples_decoded = (actual_pos as f64 * samples_per_ms) as i64;
                        // Clear output buffer to prevent old audio playing
                        output.clear();
                    }
                    Err(e) => {
                        eprintln!("Seek failed: {}", e);
                    }
                }
            }
            
            // Apply volume to output
            output.set_volume(*volume.read());
            
            // Decode next packet
            match decoder.decode_next() {
                Ok(Some(samples)) => {
                    // Write samples to output (blocking to prevent buffer overrun)
                    output.write_blocking(&samples);
                    
                    // Update position
                    samples_decoded += samples.len() as i64;
                    let pos = (samples_decoded as f64 / samples_per_ms) as i64;
                    position_ms.store(pos, Ordering::SeqCst);
                }
                Ok(None) => {
                    // End of file - wait for buffer to drain a bit before exiting
                    thread::sleep(Duration::from_millis(100));
                    break;
                }
                Err(e) => {
                    eprintln!("Decode error: {}", e);
                    break;
                }
            }
        }
        
        is_playing.store(false, Ordering::SeqCst);
        Ok(())
    }
    
    /// Pause playback
    pub fn pause(&self) {
        self.is_paused.store(true, Ordering::SeqCst);
    }
    
    /// Resume playback
    pub fn resume(&self) {
        self.is_paused.store(false, Ordering::SeqCst);
    }
    
    /// Stop playback completely
    pub fn stop(&self) {
        // Signal the playback thread to stop
        self.should_stop.store(true, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst); // Unpause so thread can exit
        
        // Wait for playback thread to finish
        if let Some(handle) = self.playback_thread.lock().take() {
            let _ = handle.join();
        }
        
        // Reset state
        self.is_playing.store(false, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);
        self.should_stop.store(false, Ordering::SeqCst);
        *self.current_file.write() = None;
        self.position_ms.store(0, Ordering::SeqCst);
        self.duration_ms.store(0, Ordering::SeqCst);
    }
    
    /// Seek to a position in milliseconds
    pub fn seek(&self, position_ms: i64) {
        self.seek_request.store(position_ms.max(0), Ordering::SeqCst);
    }
    
    /// Set volume (0.0 to 1.0)
    pub fn set_volume(&self, vol: f32) {
        *self.volume.write() = vol.clamp(0.0, 1.0);
    }
    
    /// Get current player state
    pub fn get_state(&self) -> PlayerState {
        PlayerState {
            is_playing: self.is_playing.load(Ordering::SeqCst),
            is_paused: self.is_paused.load(Ordering::SeqCst),
            current_file: self.current_file.read().as_ref().map(|p| p.to_string_lossy().to_string()),
            position_ms: self.position_ms.load(Ordering::SeqCst),
            duration_ms: self.duration_ms.load(Ordering::SeqCst),
            volume: *self.volume.read(),
        }
    }
    
    /// Check if the current track has ended
    pub fn has_track_ended(&self) -> bool {
        self.track_ended.swap(false, Ordering::SeqCst)
    }
    
    // Legacy compatibility methods
    
    pub fn set_current_file(&self, file_path: PathBuf) {
        *self.current_file.write() = Some(file_path);
    }

    pub fn current_file(&self) -> Option<PathBuf> {
        self.current_file.read().clone()
    }

    pub fn clear_current_file(&self) {
        *self.current_file.write() = None;
    }
}
