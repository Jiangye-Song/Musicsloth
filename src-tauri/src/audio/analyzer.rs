// Audio analyzer for real-time visualization
// Uses FFT to extract frequency bands and detect beats

use parking_lot::Mutex;
use rustfft::{num_complex::Complex, FftPlanner};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub const FFT_SIZE: usize = 2048; // ~42ms at 48kHz, good balance of time/frequency resolution
pub const NUM_BANDS: usize = 32; // Number of frequency bands for visualization
const SAMPLE_RATE: f32 = 48000.0;

/// Audio analysis results sent to frontend
#[derive(Clone, Debug, serde::Serialize)]
pub struct AudioAnalysis {
    pub frequency_bands: Vec<f32>, // NUM_BANDS values, 0.0 to 1.0 normalized
    pub peak_level: f32,           // Current peak amplitude (0.0 to 1.0)
    pub rms_level: f32,            // RMS level for loudness (0.0 to 1.0)
    pub beat_detected: bool,       // Beat detection flag
    pub beat_intensity: f32,       // Beat strength (0.0 to 1.0)
}

impl Default for AudioAnalysis {
    fn default() -> Self {
        Self {
            frequency_bands: vec![0.0; NUM_BANDS],
            peak_level: 0.0,
            rms_level: 0.0,
            beat_detected: false,
            beat_intensity: 0.0,
        }
    }
}

/// Real-time audio analyzer with FFT and beat detection
pub struct AudioAnalyzer {
    fft: Arc<dyn rustfft::Fft<f32>>,
    sample_buffer: Vec<f32>,
    window: Vec<f32>,             // Hann window for FFT
    band_ranges: Vec<(usize, usize)>, // FFT bin ranges for each frequency band
    
    // Beat detection state
    energy_history: Vec<f32>,
    energy_history_idx: usize,
    last_beat_energy: f32,
    beat_cooldown: usize,
    
    // Smoothing for visualization
    smoothed_bands: Vec<f32>,
}

impl AudioAnalyzer {
    pub fn new() -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT_SIZE);
        
        // Create Hann window for smooth FFT
        let window: Vec<f32> = (0..FFT_SIZE)
            .map(|i| {
                let t = i as f32 / (FFT_SIZE - 1) as f32;
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * t).cos())
            })
            .collect();
        
        // Calculate frequency band ranges (logarithmic scale)
        let band_ranges = Self::calculate_band_ranges(FFT_SIZE, SAMPLE_RATE);
        
        Self {
            fft,
            sample_buffer: Vec::with_capacity(FFT_SIZE),
            window,
            band_ranges,
            energy_history: vec![0.0; 43], // ~1 second of history at 43 analysis frames/sec
            energy_history_idx: 0,
            last_beat_energy: 0.0,
            beat_cooldown: 0,
            smoothed_bands: vec![0.0; NUM_BANDS],
        }
    }
    
    /// Calculate logarithmically-spaced frequency band ranges
    fn calculate_band_ranges(fft_size: usize, sample_rate: f32) -> Vec<(usize, usize)> {
        let mut ranges = Vec::with_capacity(NUM_BANDS);
        let nyquist = sample_rate / 2.0;
        let bin_freq = sample_rate / fft_size as f32;
        
        // Frequency range: 20Hz to 16kHz (log scale)
        let min_freq = 20.0_f32;
        let max_freq = 16000.0_f32.min(nyquist);
        
        for i in 0..NUM_BANDS {
            let t0 = i as f32 / NUM_BANDS as f32;
            let t1 = (i + 1) as f32 / NUM_BANDS as f32;
            
            // Logarithmic interpolation
            let freq0 = min_freq * (max_freq / min_freq).powf(t0);
            let freq1 = min_freq * (max_freq / min_freq).powf(t1);
            
            let bin0 = (freq0 / bin_freq).round() as usize;
            let bin1 = (freq1 / bin_freq).round() as usize;
            
            // Ensure at least one bin per band
            let bin1 = bin1.max(bin0 + 1).min(fft_size / 2);
            
            ranges.push((bin0, bin1));
        }
        
        ranges
    }
    
    /// Add samples to the analysis buffer
    /// Call this from the playback loop with each chunk of samples
    pub fn push_samples(&mut self, samples: &[f32], channels: usize) {
        // Mix to mono and add to buffer
        let frame_count = samples.len() / channels;
        
        for frame in 0..frame_count {
            let mut sum = 0.0;
            for ch in 0..channels {
                sum += samples[frame * channels + ch];
            }
            self.sample_buffer.push(sum / channels as f32);
        }
        
        // Keep buffer from growing too large
        if self.sample_buffer.len() > FFT_SIZE * 4 {
            let excess = self.sample_buffer.len() - FFT_SIZE * 2;
            self.sample_buffer.drain(0..excess);
        }
    }
    
    /// Perform FFT analysis and return results
    /// Call this at regular intervals (e.g., 30-60 fps)
    pub fn analyze(&mut self) -> Option<AudioAnalysis> {
        if self.sample_buffer.len() < FFT_SIZE {
            return None;
        }
        
        // Take the most recent FFT_SIZE samples
        let start = self.sample_buffer.len() - FFT_SIZE;
        let samples = &self.sample_buffer[start..];
        
        // Calculate peak and RMS
        let mut peak = 0.0_f32;
        let mut rms_sum = 0.0_f32;
        
        for &s in samples {
            peak = peak.max(s.abs());
            rms_sum += s * s;
        }
        
        let rms = (rms_sum / FFT_SIZE as f32).sqrt();
        
        // Apply window and prepare for FFT
        let mut fft_buffer: Vec<Complex<f32>> = samples
            .iter()
            .zip(self.window.iter())
            .map(|(&s, &w)| Complex::new(s * w, 0.0))
            .collect();
        
        // Perform FFT
        self.fft.process(&mut fft_buffer);
        
        // Calculate magnitude for each frequency band
        let mut frequency_bands = vec![0.0_f32; NUM_BANDS];
        
        for (band_idx, &(start_bin, end_bin)) in self.band_ranges.iter().enumerate() {
            let mut band_magnitude = 0.0_f32;
            let mut bin_count = 0;
            
            for bin in start_bin..end_bin {
                if bin < fft_buffer.len() / 2 {
                    let mag = fft_buffer[bin].norm();
                    band_magnitude += mag;
                    bin_count += 1;
                }
            }
            
            if bin_count > 0 {
                band_magnitude /= bin_count as f32;
            }
            
            // Normalize magnitude (empirically tuned)
            let normalized = (band_magnitude / FFT_SIZE as f32 * 50.0).min(1.0);
            
            // Apply smoothing (attack fast, decay slow)
            let prev = self.smoothed_bands[band_idx];
            if normalized > prev {
                self.smoothed_bands[band_idx] = prev * 0.3 + normalized * 0.7; // Fast attack
            } else {
                self.smoothed_bands[band_idx] = prev * 0.85 + normalized * 0.15; // Slow decay
            }
            
            frequency_bands[band_idx] = self.smoothed_bands[band_idx];
        }
        
        // Beat detection using bass energy (bands 0-3, ~20-150Hz)
        let bass_energy: f32 = frequency_bands[0..4].iter().sum::<f32>() / 4.0;
        
        // Update energy history
        self.energy_history[self.energy_history_idx] = bass_energy;
        self.energy_history_idx = (self.energy_history_idx + 1) % self.energy_history.len();
        
        // Calculate average energy
        let avg_energy: f32 = self.energy_history.iter().sum::<f32>() / self.energy_history.len() as f32;
        
        // Beat detection: energy spike above average with cooldown
        let (beat_detected, beat_intensity) = if self.beat_cooldown > 0 {
            self.beat_cooldown -= 1;
            (false, (self.last_beat_energy * 0.9).max(0.0))
        } else {
            let threshold = avg_energy * 1.5 + 0.05; // Dynamic threshold
            let is_beat = bass_energy > threshold && bass_energy > self.last_beat_energy * 0.8;
            
            if is_beat {
                self.beat_cooldown = 5; // ~100ms cooldown at 50fps
                let intensity = ((bass_energy - avg_energy) / avg_energy.max(0.01)).clamp(0.0, 1.0);
                self.last_beat_energy = intensity;
                (true, intensity)
            } else {
                self.last_beat_energy *= 0.85; // Decay
                (false, self.last_beat_energy)
            }
        };
        
        // Remove processed samples (keep some overlap for smoothness)
        let remove_count = FFT_SIZE / 4; // 75% overlap
        if self.sample_buffer.len() > remove_count {
            self.sample_buffer.drain(0..remove_count);
        }
        
        Some(AudioAnalysis {
            frequency_bands,
            peak_level: peak.min(1.0),
            rms_level: (rms * 3.0).min(1.0), // Scale for visibility
            beat_detected,
            beat_intensity,
        })
    }
    
    /// Clear the analysis buffer (call when seeking or stopping)
    pub fn clear(&mut self) {
        self.sample_buffer.clear();
        self.energy_history.fill(0.0);
        self.smoothed_bands.fill(0.0);
        self.last_beat_energy = 0.0;
        self.beat_cooldown = 0;
    }
}

/// Shared analyzer state that can be accessed from commands
pub struct SharedAnalyzer {
    analyzer: Mutex<AudioAnalyzer>,
    enabled: AtomicBool,
    last_analysis: Mutex<AudioAnalysis>,
}

impl SharedAnalyzer {
    pub fn new() -> Self {
        Self {
            analyzer: Mutex::new(AudioAnalyzer::new()),
            enabled: AtomicBool::new(false),
            last_analysis: Mutex::new(AudioAnalysis::default()),
        }
    }
    
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }
    
    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
        if !enabled {
            self.analyzer.lock().clear();
            *self.last_analysis.lock() = AudioAnalysis::default();
        }
    }
    
    pub fn push_samples(&self, samples: &[f32], channels: usize) {
        if self.is_enabled() {
            self.analyzer.lock().push_samples(samples, channels);
        }
    }
    
    pub fn analyze(&self) -> Option<AudioAnalysis> {
        if !self.is_enabled() {
            return None;
        }
        
        let result = self.analyzer.lock().analyze();
        if let Some(ref analysis) = result {
            *self.last_analysis.lock() = analysis.clone();
        }
        result
    }
    
    pub fn get_last_analysis(&self) -> AudioAnalysis {
        self.last_analysis.lock().clone()
    }
    
    pub fn clear(&self) {
        self.analyzer.lock().clear();
        *self.last_analysis.lock() = AudioAnalysis::default();
    }
}
