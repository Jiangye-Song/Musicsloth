// Audio player using Symphonia for decoding and cpal for output

use super::decoder::AudioDecoder;
use super::output::AudioOutput;
use parking_lot::{Mutex, RwLock};
use rubato::{Resampler, SincFixedIn, SincInterpolationType, SincInterpolationParameters, WindowFunction};
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
    pub volume: f32,      // Linear gain (0.0 to 1.0)
    pub volume_db: f32,   // Volume in dB (-60 to 0)
    pub normalization_enabled: bool,
    pub track_gain_db: f32, // Current track's normalization gain
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
    
    // Volume in dB (-60 to 0, where 0 is full volume)
    volume_db: Arc<RwLock<f32>>,
    // Linear gain computed from dB (0.0 to 1.0)
    volume_linear: Arc<RwLock<f32>>,
    
    // Track-specific normalization gain in dB (ReplayGain)
    track_gain_db: Arc<RwLock<f32>>,
    // Track normalization gain as linear multiplier
    track_gain_linear: Arc<RwLock<f32>>,
    // Whether normalization is enabled
    normalization_enabled: Arc<AtomicBool>,
    
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
            volume_db: Arc::new(RwLock::new(0.0)),      // 0 dB = full volume
            volume_linear: Arc::new(RwLock::new(1.0)),   // gain = 1.0
            track_gain_db: Arc::new(RwLock::new(0.0)),   // No track gain by default
            track_gain_linear: Arc::new(RwLock::new(1.0)), // gain = 1.0
            normalization_enabled: Arc::new(AtomicBool::new(true)), // Enabled by default
            current_file: Arc::new(RwLock::new(None)),
            seek_request: Arc::new(AtomicI64::new(-1)),
            playback_thread: Mutex::new(None),
            track_ended: Arc::new(AtomicBool::new(false)),
        }
    }
    
    /// Start playing a file with optional track-specific normalization gain
    pub fn play_with_gain(&self, file_path: PathBuf, track_gain_db: Option<f32>) -> Result<(), String> {
        // Set track gain before starting playback
        let gain_db = track_gain_db.unwrap_or(0.0);
        *self.track_gain_db.write() = gain_db;
        // Convert dB to linear: gain = 10^(dB/20)
        let gain_linear = if gain_db.abs() < 0.001 {
            1.0
        } else {
            10.0_f32.powf(gain_db / 20.0)
        };
        *self.track_gain_linear.write() = gain_linear;
        
        // Now play the file
        self.play(file_path)
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
        let volume = self.volume_linear.clone();
        let track_gain = self.track_gain_linear.clone();
        let normalization_enabled = self.normalization_enabled.clone();
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
                track_gain,
                normalization_enabled,
                seek_request,
                track_ended.clone(),
            ) {
                eprintln!("Playback error: {}", e);
            }
            
            // Mark track as ended BEFORE marking as not playing
            // This prevents race condition where frontend sees is_playing=false
            // but track_ended hasn't been set yet
            track_ended.store(true, Ordering::SeqCst);
            is_playing.store(false, Ordering::SeqCst);
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
        track_gain: Arc<RwLock<f32>>,
        normalization_enabled: Arc<AtomicBool>,
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
        
        // Get rates and channels
        let input_sample_rate = decoder.sample_rate();
        let input_channels = decoder.channels();
        let output_sample_rate = output.sample_rate();
        let output_channels = output.channels() as usize;
        
        eprintln!(
            "Audio: input {}Hz {}ch -> output {}Hz {}ch",
            input_sample_rate, input_channels, output_sample_rate, output_channels
        );
        
        // Create resampler if sample rates don't match
        let needs_resample = input_sample_rate != output_sample_rate;
        let mut resampler: Option<SincFixedIn<f32>> = if needs_resample {
            let params = SincInterpolationParameters {
                sinc_len: 256,
                f_cutoff: 0.95,
                interpolation: SincInterpolationType::Linear,
                oversampling_factor: 256,
                window: WindowFunction::BlackmanHarris2,
            };
            
            let resample_ratio = output_sample_rate as f64 / input_sample_rate as f64;
            
            Some(SincFixedIn::new(
                resample_ratio,
                2.0, // max relative ratio (for seeking)
                params,
                1024, // chunk size
                input_channels,
            ).map_err(|e| format!("Failed to create resampler: {}", e))?)
        } else {
            None
        };
        
        // Calculate samples per millisecond for position tracking (at input rate)
        let samples_per_ms = (input_sample_rate as f64 * input_channels as f64) / 1000.0;
        
        let mut samples_decoded: i64 = 0;
        
        // Buffer for accumulating samples for the resampler (planar format)
        let chunk_size = 1024;
        let mut input_buffer: Vec<Vec<f32>> = vec![Vec::new(); input_channels];
        
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
                        // Clear buffers
                        for buf in &mut input_buffer {
                            buf.clear();
                        }
                        if let Some(ref mut rs) = resampler {
                            rs.reset();
                        }
                        output.clear();
                    }
                    Err(e) => {
                        eprintln!("Seek failed: {}", e);
                    }
                }
            }
            
            // Apply combined volume: user volume * track normalization gain
            // If normalization is disabled, track_gain is treated as 1.0
            let user_vol = *volume.read();
            let norm_gain = if normalization_enabled.load(Ordering::SeqCst) {
                *track_gain.read()
            } else {
                1.0
            };
            // Clamp the combined gain to prevent clipping (max 1.0)
            let combined_vol = (user_vol * norm_gain).min(1.0);
            output.set_volume(combined_vol);
            
            // Decode next packet
            match decoder.decode_next() {
                Ok(Some(interleaved_samples)) => {
                    // Update position based on input samples
                    samples_decoded += interleaved_samples.len() as i64;
                    let pos = (samples_decoded as f64 / samples_per_ms) as i64;
                    position_ms.store(pos, Ordering::SeqCst);
                    
                    // Convert interleaved to planar for resampling
                    let frame_count = interleaved_samples.len() / input_channels;
                    
                    // Prepare output samples
                    let output_samples = if needs_resample {
                        // De-interleave and accumulate into planar buffers
                        for frame in 0..frame_count {
                            for ch in 0..input_channels {
                                input_buffer[ch].push(interleaved_samples[frame * input_channels + ch]);
                            }
                        }
                        
                        // Process in chunks when we have enough samples
                        let mut all_resampled: Vec<f32> = Vec::new();
                        
                        while input_buffer[0].len() >= chunk_size {
                            // Extract exactly chunk_size frames
                            let mut chunk: Vec<Vec<f32>> = vec![Vec::with_capacity(chunk_size); input_channels];
                            for ch in 0..input_channels {
                                chunk[ch] = input_buffer[ch].drain(..chunk_size).collect();
                            }
                            
                            // Resample the chunk
                            if let Some(ref mut rs) = resampler {
                                match rs.process(&chunk, None) {
                                    Ok(resampled) => {
                                        let interleaved = Self::interleave_and_convert_channels(&resampled, output_channels);
                                        all_resampled.extend(interleaved);
                                    }
                                    Err(e) => {
                                        eprintln!("Resample error: {}", e);
                                    }
                                }
                            }
                        }
                        
                        all_resampled
                    } else {
                        // No resampling needed, but might need channel conversion
                        Self::convert_channels(&interleaved_samples, input_channels, output_channels)
                    };
                    
                    // Write samples to output (blocking to prevent buffer overrun)
                    if !output_samples.is_empty() {
                        output.write_blocking(&output_samples);
                    }
                }
                Ok(None) => {
                    // End of file - flush remaining samples in resampler buffer
                    if needs_resample && !input_buffer[0].is_empty() {
                        // Pad remaining samples to chunk size
                        let remaining = input_buffer[0].len();
                        for ch in 0..input_channels {
                            input_buffer[ch].resize(chunk_size, 0.0);
                        }
                        
                        if let Some(ref mut rs) = resampler {
                            if let Ok(resampled) = rs.process(&input_buffer, None) {
                                // Only output the valid portion
                                let valid_ratio = remaining as f64 / chunk_size as f64;
                                let valid_frames = (resampled[0].len() as f64 * valid_ratio) as usize;
                                
                                let mut final_samples: Vec<f32> = Vec::with_capacity(valid_frames * output_channels);
                                for frame in 0..valid_frames {
                                    for out_ch in 0..output_channels {
                                        if out_ch < resampled.len() {
                                            final_samples.push(resampled[out_ch][frame]);
                                        } else if !resampled.is_empty() {
                                            final_samples.push(resampled[0][frame]);
                                        }
                                    }
                                }
                                
                                if !final_samples.is_empty() {
                                    output.write_blocking(&final_samples);
                                }
                            }
                        }
                    }
                    
                    // Wait for buffer to drain before exiting
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
    
    /// Interleave planar audio and convert channels if needed
    fn interleave_and_convert_channels(planar: &[Vec<f32>], output_channels: usize) -> Vec<f32> {
        if planar.is_empty() || planar[0].is_empty() {
            return vec![];
        }
        
        let input_channels = planar.len();
        let frame_count = planar[0].len();
        let mut output = Vec::with_capacity(frame_count * output_channels);
        
        for frame in 0..frame_count {
            for out_ch in 0..output_channels {
                if out_ch < input_channels {
                    output.push(planar[out_ch][frame]);
                } else if input_channels == 1 {
                    // Mono to stereo: duplicate
                    output.push(planar[0][frame]);
                } else {
                    // More output channels than input: use first channel
                    output.push(planar[0][frame]);
                }
            }
        }
        
        output
    }
    
    /// Convert interleaved audio between channel counts
    fn convert_channels(samples: &[f32], input_channels: usize, output_channels: usize) -> Vec<f32> {
        if input_channels == output_channels {
            return samples.to_vec();
        }
        
        let frame_count = samples.len() / input_channels;
        let mut output = Vec::with_capacity(frame_count * output_channels);
        
        for frame in 0..frame_count {
            for out_ch in 0..output_channels {
                if out_ch < input_channels {
                    output.push(samples[frame * input_channels + out_ch]);
                } else if input_channels == 1 {
                    // Mono to stereo: duplicate
                    output.push(samples[frame * input_channels]);
                } else {
                    // More output channels than input: use first channel
                    output.push(samples[frame * input_channels]);
                }
            }
        }
        
        output
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
    
    /// Set volume in dB (-60 to +15)
    /// 0 dB = unity gain (no boost/cut)
    /// +15 dB = max boost (~5.6x gain)
    /// -60 dB = essentially mute
    pub fn set_volume_db(&self, db: f32) {
        let db_clamped = db.clamp(-60.0, 15.0);
        *self.volume_db.write() = db_clamped;
        // Convert dB to linear gain: gain = 10^(dB/20)
        let linear = if db_clamped <= -60.0 {
            0.0 // Treat -60 dB as mute
        } else {
            10.0_f32.powf(db_clamped / 20.0)
        };
        *self.volume_linear.write() = linear;
    }
    
    /// Set volume using linear gain (0.0 to ~5.6) - converts to dB internally
    /// 1.0 = 0dB (unity), ~5.6 = +15dB (max boost)
    pub fn set_volume(&self, linear: f32) {
        let linear_clamped = linear.clamp(0.0, 5.623); // 10^(15/20) ≈ 5.623
        // Convert linear to dB: dB = 20 * log10(gain)
        let db = if linear_clamped <= 0.001 {
            -60.0 // Treat very small values as mute
        } else {
            20.0 * linear_clamped.log10()
        };
        *self.volume_db.write() = db.clamp(-60.0, 15.0);
        *self.volume_linear.write() = linear_clamped;
    }
    
    /// Get current volume in dB
    pub fn volume_db(&self) -> f32 {
        *self.volume_db.read()
    }
    
    /// Set whether volume normalization is enabled
    pub fn set_normalization_enabled(&self, enabled: bool) {
        self.normalization_enabled.store(enabled, Ordering::SeqCst);
    }
    
    /// Get whether normalization is enabled
    pub fn is_normalization_enabled(&self) -> bool {
        self.normalization_enabled.load(Ordering::SeqCst)
    }
    
    /// Set the track-specific normalization gain in dB
    pub fn set_track_gain(&self, gain_db: f32) {
        *self.track_gain_db.write() = gain_db;
        // Convert dB to linear: gain = 10^(dB/20)
        let gain_linear = if gain_db.abs() < 0.001 {
            1.0
        } else {
            10.0_f32.powf(gain_db / 20.0)
        };
        *self.track_gain_linear.write() = gain_linear;
    }
    
    /// Get the current track's normalization gain in dB
    pub fn track_gain_db(&self) -> f32 {
        *self.track_gain_db.read()
    }
    
    /// Get current player state
    pub fn get_state(&self) -> PlayerState {
        PlayerState {
            is_playing: self.is_playing.load(Ordering::SeqCst),
            is_paused: self.is_paused.load(Ordering::SeqCst),
            current_file: self.current_file.read().as_ref().map(|p| p.to_string_lossy().to_string()),
            position_ms: self.position_ms.load(Ordering::SeqCst),
            duration_ms: self.duration_ms.load(Ordering::SeqCst),
            volume: *self.volume_linear.read(),
            volume_db: *self.volume_db.read(),
            normalization_enabled: self.normalization_enabled.load(Ordering::SeqCst),
            track_gain_db: *self.track_gain_db.read(),
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
