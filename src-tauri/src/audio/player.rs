// Audio player using Symphonia for decoding and cpal for output

use super::analyzer::{AudioAnalysis, SharedAnalyzer};
use super::decoder::AudioDecoder;
use super::output::AudioOutput;
use parking_lot::{Mutex, RwLock};
use rubato::{Resampler, SincFixedIn, SincInterpolationType, SincInterpolationParameters, WindowFunction};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicI32, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

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

/// A pre-opened decoder ready for gapless transition
struct PreloadedDecoder {
    decoder: AudioDecoder,
    file_path: PathBuf,
    gain_db: f32,
}

// Safety: AudioDecoder owns its data (File, Box<dyn FormatReader>, Box<dyn Decoder>)
// which are all Send. We transfer ownership across threads.
unsafe impl Send for PreloadedDecoder {}

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
    
    // Gapless playback: pre-opened decoder for the next track
    next_decoder: Arc<Mutex<Option<PreloadedDecoder>>>,
    // Signals that a gapless transition just occurred
    gapless_transition: Arc<AtomicBool>,
    
    // Fade settings
    fade_enabled: Arc<AtomicBool>,
    fade_in_ms: Arc<AtomicI32>,
    fade_out_ms: Arc<AtomicI32>,
    // Fade state: current fade multiplier (0.0 to 1.0)
    fade_multiplier: Arc<RwLock<f32>>,
    // Fade target: 1.0 for fade in, 0.0 for fade out
    fade_target: Arc<RwLock<f32>>,
    // Fade start time
    fade_start: Arc<RwLock<Option<Instant>>>,
    // Whether we're currently fading out before pause
    fading_to_pause: Arc<AtomicBool>,
    
    // Audio analyzer for visualization
    analyzer: Arc<SharedAnalyzer>,
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
            next_decoder: Arc::new(Mutex::new(None)),
            gapless_transition: Arc::new(AtomicBool::new(false)),
            // Fade settings
            fade_enabled: Arc::new(AtomicBool::new(false)),
            fade_in_ms: Arc::new(AtomicI32::new(0)),
            fade_out_ms: Arc::new(AtomicI32::new(0)),
            fade_multiplier: Arc::new(RwLock::new(1.0)),
            fade_target: Arc::new(RwLock::new(1.0)),
            fade_start: Arc::new(RwLock::new(None)),
            fading_to_pause: Arc::new(AtomicBool::new(false)),
            analyzer: Arc::new(SharedAnalyzer::new()),
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
        
        // Clear any preloaded next track
        *self.next_decoder.lock() = None;
        self.gapless_transition.store(false, Ordering::SeqCst);
        
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
        let track_gain_db_arc = self.track_gain_db.clone();
        let normalization_enabled = self.normalization_enabled.clone();
        let seek_request = self.seek_request.clone();
        let track_ended = self.track_ended.clone();
        let next_decoder = self.next_decoder.clone();
        let gapless_transition = self.gapless_transition.clone();
        let current_file = self.current_file.clone();
        
        // Clone fade-related Arcs
        let fade_enabled = self.fade_enabled.clone();
        let fade_in_ms = self.fade_in_ms.clone();
        let fade_out_ms = self.fade_out_ms.clone();
        let fade_multiplier = self.fade_multiplier.clone();
        let fade_target = self.fade_target.clone();
        let fade_start = self.fade_start.clone();
        let fading_to_pause = self.fading_to_pause.clone();
        
        // Clone analyzer for visualization
        let analyzer = self.analyzer.clone();
        
        // Reset fade state for new playback - start with fade in if enabled
        if self.fade_enabled.load(Ordering::SeqCst) && self.fade_in_ms.load(Ordering::SeqCst) > 0 {
            *self.fade_multiplier.write() = 0.0;
            *self.fade_target.write() = 1.0;
            *self.fade_start.write() = Some(Instant::now());
        } else {
            *self.fade_multiplier.write() = 1.0;
            *self.fade_target.write() = 1.0;
            *self.fade_start.write() = None;
        }
        self.fading_to_pause.store(false, Ordering::SeqCst);
        
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
                track_gain_db_arc,
                normalization_enabled,
                seek_request,
                track_ended.clone(),
                next_decoder,
                gapless_transition,
                current_file,
                fade_enabled,
                fade_in_ms,
                fade_out_ms,
                fade_multiplier,
                fade_target,
                fade_start,
                fading_to_pause,
                analyzer,
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
        track_gain_db_arc: Arc<RwLock<f32>>,
        normalization_enabled: Arc<AtomicBool>,
        seek_request: Arc<AtomicI64>,
        _track_ended: Arc<AtomicBool>,
        next_decoder: Arc<Mutex<Option<PreloadedDecoder>>>,
        gapless_transition: Arc<AtomicBool>,
        current_file: Arc<RwLock<Option<PathBuf>>>,
        fade_enabled: Arc<AtomicBool>,
        fade_in_ms: Arc<AtomicI32>,
        fade_out_ms: Arc<AtomicI32>,
        fade_multiplier: Arc<RwLock<f32>>,
        fade_target: Arc<RwLock<f32>>,
        fade_start: Arc<RwLock<Option<Instant>>>,
        fading_to_pause: Arc<AtomicBool>,
        analyzer: Arc<SharedAnalyzer>,
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
        let mut input_sample_rate = decoder.sample_rate();
        let mut input_channels = decoder.channels();
        let output_sample_rate = output.sample_rate();
        let output_channels = output.channels() as usize;
        
        eprintln!(
            "Audio: input {}Hz {}ch -> output {}Hz {}ch",
            input_sample_rate, input_channels, output_sample_rate, output_channels
        );
        
        // Create resampler if sample rates don't match
        let mut needs_resample = input_sample_rate != output_sample_rate;
        let chunk_size = 1024;
        let mut resampler: Option<SincFixedIn<f32>> = if needs_resample {
            Some(Self::create_resampler(input_sample_rate, output_sample_rate, input_channels, chunk_size)?)
        } else {
            None
        };
        
        // Calculate samples per millisecond for position tracking (at input rate)
        let mut samples_per_ms = (input_sample_rate as f64 * input_channels as f64) / 1000.0;
        
        let mut samples_decoded: i64 = 0;
        
        // Buffer for accumulating samples for the resampler (planar format)
        let mut input_buffer: Vec<Vec<f32>> = vec![Vec::new(); input_channels];
        
        // Main decode/playback loop
        while !should_stop.load(Ordering::SeqCst) {
            // Update fade multiplier if fading
            if fade_enabled.load(Ordering::SeqCst) {
                // Check if we have an active fade
                let fade_start_opt = *fade_start.read();
                if let Some(start_time) = fade_start_opt {
                    let elapsed_ms = start_time.elapsed().as_millis() as i32;
                    let target = *fade_target.read();
                    
                    // Determine fade direction based on target
                    let fading_in = target > 0.5; // target 1.0 = fade in, target 0.0 = fade out
                    let fade_duration = if fading_in {
                        fade_in_ms.load(Ordering::SeqCst)
                    } else {
                        fade_out_ms.load(Ordering::SeqCst)
                    };
                    
                    if fade_duration > 0 {
                        let progress = (elapsed_ms as f32 / fade_duration as f32).clamp(0.0, 1.0);
                        let new_mult = if fading_in {
                            progress
                        } else {
                            1.0 - progress
                        };
                        *fade_multiplier.write() = new_mult;
                        
                        // Check if fade completed
                        if progress >= 1.0 {
                            *fade_start.write() = None;
                            *fade_multiplier.write() = target;
                            
                            // If we were fading to pause, fade is complete - clear flag
                            if fading_to_pause.load(Ordering::SeqCst) && target == 0.0 {
                                fading_to_pause.store(false, Ordering::SeqCst);
                            }
                        }
                    } else {
                        // No fade duration, complete immediately
                        *fade_start.write() = None;
                        *fade_multiplier.write() = target;
                        if fading_to_pause.load(Ordering::SeqCst) && target == 0.0 {
                            fading_to_pause.store(false, Ordering::SeqCst);
                        }
                    }
                }
            }
            
            // Handle pause - but if we're fading out, keep playing until fade completes
            if is_paused.load(Ordering::SeqCst) && !fading_to_pause.load(Ordering::SeqCst) {
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
                        analyzer.clear();
                    }
                    Err(e) => {
                        eprintln!("Seek failed: {}", e);
                    }
                }
            }
            
            // Apply combined volume: user volume * track normalization gain * fade multiplier
            // If normalization is disabled, track_gain is treated as 1.0
            let user_vol = *volume.read();
            let norm_gain = if normalization_enabled.load(Ordering::SeqCst) {
                *track_gain.read()
            } else {
                1.0
            };
            let fade_mult = if fade_enabled.load(Ordering::SeqCst) {
                *fade_multiplier.read()
            } else {
                1.0
            };
            // Clamp the combined gain to prevent clipping (max 1.0)
            let combined_vol = (user_vol * norm_gain * fade_mult).min(1.0);
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
                        // Feed samples to analyzer for visualization
                        analyzer.push_samples(&output_samples, output_channels);
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
                                    // Feed samples to analyzer for visualization
                                    analyzer.push_samples(&final_samples, output_channels);
                                    output.write_blocking(&final_samples);
                                }
                            }
                        }
                    }
                    
                    // Check for gapless next track (pre-opened decoder)
                    let preloaded = next_decoder.lock().take();
                    if let Some(preloaded) = preloaded {
                        let next_gain = preloaded.gain_db;
                        let next_file = preloaded.file_path;
                        let new_decoder = preloaded.decoder;
                        
                        eprintln!("Gapless transition to: {:?}", next_file);
                        
                        // Update track gain for the new track
                        *track_gain_db_arc.write() = next_gain;
                        let gain_linear = if next_gain.abs() < 0.001 {
                            1.0
                        } else {
                            10.0_f32.powf(next_gain / 20.0)
                        };
                        *track_gain.write() = gain_linear;
                        
                        // Use the pre-opened decoder (no file I/O delay!)
                        {
                                // Update current file
                                *current_file.write() = Some(next_file);
                                
                                // Update duration
                                if let Some(dur) = new_decoder.duration_ms() {
                                    duration_ms.store(dur, Ordering::SeqCst);
                                }
                                
                                // Reset position
                                samples_decoded = 0;
                                position_ms.store(0, Ordering::SeqCst);
                                
                                // Check if resampler needs to be recreated
                                let new_input_sr = new_decoder.sample_rate();
                                let new_input_ch = new_decoder.channels();
                                
                                if new_input_sr != input_sample_rate || new_input_ch != input_channels {
                                    input_sample_rate = new_input_sr;
                                    input_channels = new_input_ch;
                                    samples_per_ms = (input_sample_rate as f64 * input_channels as f64) / 1000.0;
                                    
                                    needs_resample = input_sample_rate != output_sample_rate;
                                    resampler = if needs_resample {
                                        match Self::create_resampler(input_sample_rate, output_sample_rate, input_channels, chunk_size) {
                                            Ok(rs) => Some(rs),
                                            Err(e) => {
                                                eprintln!("Failed to create resampler for gapless: {}", e);
                                                None
                                            }
                                        }
                                    } else {
                                        None
                                    };
                                } else if let Some(ref mut rs) = resampler {
                                    rs.reset();
                                }
                                
                                // Reset input buffer for new channel count
                                input_buffer = vec![Vec::new(); input_channels];
                                
                                // Replace decoder and continue the loop
                                decoder = new_decoder;
                                
                                // Signal the gapless transition
                                gapless_transition.store(true, Ordering::SeqCst);
                                
                                eprintln!("Audio: gapless input {}Hz {}ch -> output {}Hz {}ch",
                                    input_sample_rate, input_channels, output_sample_rate, output_channels);
                                
                                continue; // Continue the main decode loop seamlessly
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
    
    /// Create a resampler with the given parameters
    fn create_resampler(
        input_sample_rate: u32,
        output_sample_rate: u32,
        input_channels: usize,
        chunk_size: usize,
    ) -> Result<SincFixedIn<f32>, String> {
        let params = SincInterpolationParameters {
            sinc_len: 256,
            f_cutoff: 0.95,
            interpolation: SincInterpolationType::Linear,
            oversampling_factor: 256,
            window: WindowFunction::BlackmanHarris2,
        };
        
        let resample_ratio = output_sample_rate as f64 / input_sample_rate as f64;
        
        SincFixedIn::new(
            resample_ratio,
            2.0,
            params,
            chunk_size,
            input_channels,
        ).map_err(|e| format!("Failed to create resampler: {}", e))
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
    
    /// Pause playback with optional fade out
    pub fn pause(&self) {
        // If fade is enabled and fade_out_ms > 0, start fading out
        if self.fade_enabled.load(Ordering::SeqCst) {
            let fade_out = self.fade_out_ms.load(Ordering::SeqCst);
            if fade_out > 0 && self.is_playing.load(Ordering::SeqCst) && !self.is_paused.load(Ordering::SeqCst) {
                // Start fade out - set is_paused immediately so UI updates
                // but fading_to_pause lets the playback loop continue until fade completes
                *self.fade_target.write() = 0.0;
                *self.fade_start.write() = Some(Instant::now());
                self.fading_to_pause.store(true, Ordering::SeqCst);
                self.is_paused.store(true, Ordering::SeqCst);
                return;
            }
        }
        // Immediate pause
        self.is_paused.store(true, Ordering::SeqCst);
    }
    
    /// Resume playback with optional fade in
    pub fn resume(&self) {
        // If fade is enabled and fade_in_ms > 0, start fading in
        if self.fade_enabled.load(Ordering::SeqCst) {
            let fade_in = self.fade_in_ms.load(Ordering::SeqCst);
            if fade_in > 0 && self.is_paused.load(Ordering::SeqCst) {
                // Start from silence and fade in
                *self.fade_multiplier.write() = 0.0;
                *self.fade_target.write() = 1.0;
                *self.fade_start.write() = Some(Instant::now());
            }
        }
        // Unpause immediately - the fade in happens while playing
        self.is_paused.store(false, Ordering::SeqCst);
        self.fading_to_pause.store(false, Ordering::SeqCst);
    }
    
    /// Stop playback completely
    pub fn stop(&self) {
        // Signal the playback thread to stop
        self.should_stop.store(true, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst); // Unpause so thread can exit
        
        // Clear preloaded next track
        *self.next_decoder.lock() = None;
        self.gapless_transition.store(false, Ordering::SeqCst);
        
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
    
    /// Set fade settings
    pub fn set_fade_settings(&self, enabled: bool, fade_in_ms: i32, fade_out_ms: i32) {
        self.fade_enabled.store(enabled, Ordering::SeqCst);
        self.fade_in_ms.store(fade_in_ms.clamp(0, 2000), Ordering::SeqCst);
        self.fade_out_ms.store(fade_out_ms.clamp(0, 2000), Ordering::SeqCst);
        
        // If disabling fade, reset fade state to full volume
        if !enabled {
            *self.fade_multiplier.write() = 1.0;
            *self.fade_target.write() = 1.0;
            *self.fade_start.write() = None;
            self.fading_to_pause.store(false, Ordering::SeqCst);
        }
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
    
    /// Preload the next track for gapless playback by opening the decoder in the background
    pub fn preload_next_track(&self, file_path: PathBuf, gain_db: Option<f32>) {
        let next_decoder = self.next_decoder.clone();
        let gain = gain_db.unwrap_or(0.0);
        let path = file_path.clone();
        
        // Open the decoder in a background thread so it's ready instantly at EOF
        thread::spawn(move || {
            match AudioDecoder::open(&path) {
                Ok(decoder) => {
                    eprintln!("[Gapless] Pre-opened decoder for: {:?}", path);
                    *next_decoder.lock() = Some(PreloadedDecoder {
                        decoder,
                        file_path: path,
                        gain_db: gain,
                    });
                }
                Err(e) => {
                    eprintln!("[Gapless] Failed to pre-open decoder: {}", e);
                }
            }
        });
    }
    
    /// Clear any preloaded next track
    pub fn clear_preloaded_track(&self) {
        *self.next_decoder.lock() = None;
    }
    
    /// Check if a gapless transition just occurred (atomically checks and clears)
    pub fn has_gapless_transition(&self) -> bool {
        self.gapless_transition.swap(false, Ordering::SeqCst)
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
    
    // ===== Audio Analysis Methods =====
    
    /// Enable or disable audio analysis for visualization
    pub fn set_analysis_enabled(&self, enabled: bool) {
        self.analyzer.set_enabled(enabled);
    }
    
    /// Check if audio analysis is enabled
    pub fn is_analysis_enabled(&self) -> bool {
        self.analyzer.is_enabled()
    }
    
    /// Get current audio analysis data
    /// Returns None if analysis is disabled or no data available
    pub fn get_analysis(&self) -> Option<AudioAnalysis> {
        if !self.analyzer.is_enabled() {
            return None;
        }
        self.analyzer.analyze()
    }
    
    /// Get the last available analysis (even if no new data)
    pub fn get_last_analysis(&self) -> AudioAnalysis {
        self.analyzer.get_last_analysis()
    }
}
