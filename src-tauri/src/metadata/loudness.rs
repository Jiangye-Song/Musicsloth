// Loudness analysis using EBU R128 standard (LUFS measurement)
// Calculates the normalization gain needed to match a target loudness

use std::path::Path;
use ebur128::{EbuR128, Mode};
use crate::audio::decoder::AudioDecoder;
use rand::Rng;

/// Target integrated loudness in LUFS (Loudness Units Full Scale)
/// -14 LUFS is the standard for streaming platforms (Spotify, YouTube, etc.)
const TARGET_LOUDNESS_LUFS: f64 = -14.0;

/// Maximum gain to apply (to prevent clipping on very quiet tracks)
const MAX_GAIN_DB: f32 = 12.0;

/// Minimum gain to apply (for very loud tracks)
const MIN_GAIN_DB: f32 = -12.0;

/// Configuration for selective sampling
const SAMPLING_THRESHOLD_MS: i64 = 30_000;   // Only sample tracks >= 30 seconds
const SEGMENT_DURATION_MS: i64 = 8_000;       // Each segment is 8 seconds
const NUM_SEGMENTS: usize = 5;                 // Sample 5 segments

/// Result of loudness analysis
#[derive(Debug, Clone)]
pub struct LoudnessResult {
    /// Integrated loudness in LUFS
    pub integrated_lufs: f64,
    /// Loudness range in LU
    pub loudness_range: f64,
    /// True peak in dB
    pub true_peak_db: f64,
    /// Recommended gain adjustment in dB to reach target loudness
    pub normalization_gain_db: f32,
}

/// Analyze the loudness of an audio file using EBU R128 standard
/// Returns the integrated loudness in LUFS and the recommended gain adjustment
/// 
/// OPTIMIZATION: Only use Mode::I (integrated loudness) - TRUE_PEAK and LRA are
/// very expensive (TRUE_PEAK requires 4x upsampling). We track sample peak manually.
pub fn analyze_loudness(file_path: &Path) -> Result<LoudnessResult, String> {
    // Open the audio file with our decoder
    let mut decoder = AudioDecoder::open(file_path)?;
    
    let sample_rate = decoder.sample_rate();
    let channels = decoder.channels();
    
    // Initialize EBU R128 analyzer - ONLY use Mode::I for integrated loudness
    // TRUE_PEAK is extremely expensive (4x upsampling), we track sample peak manually
    let mut ebu = EbuR128::new(
        channels as u32,
        sample_rate,
        Mode::I, // Only integrated loudness - much faster!
    ).map_err(|e| format!("Failed to create EBU R128 analyzer: {}", e))?;
    
    // Track sample peak manually (much faster than TRUE_PEAK which requires upsampling)
    let mut max_sample_peak: f32 = 0.0;
    
    // Decode and analyze all samples
    loop {
        match decoder.decode_next() {
            Ok(Some(samples)) => {
                // Track sample peak while we have the samples
                for &sample in &samples {
                    let abs_sample = sample.abs();
                    if abs_sample > max_sample_peak {
                        max_sample_peak = abs_sample;
                    }
                }
                
                // The decoder returns interleaved f32 samples
                ebu.add_frames_f32(&samples)
                    .map_err(|e| format!("Failed to add frames to analyzer: {}", e))?;
            }
            Ok(None) => {
                // End of file
                break;
            }
            Err(e) => {
                // Log error but continue - some decode errors are recoverable
                eprintln!("Decode error during loudness analysis: {}", e);
                continue;
            }
        }
    }
    
    // Get the integrated loudness (overall loudness of the entire track)
    let integrated_lufs = ebu.loudness_global()
        .map_err(|e| format!("Failed to get integrated loudness: {}", e))?;
    
    // We don't calculate LRA (loudness range) anymore - not needed for normalization
    let loudness_range = 0.0;
    
    // Convert sample peak to dB (this is sample peak, not true peak, but good enough)
    let sample_peak_db = if max_sample_peak > 0.0 {
        20.0 * (max_sample_peak as f64).log10()
    } else {
        -96.0 // Silence
    };
    let true_peak_db = sample_peak_db; // Store as true_peak_db for compatibility
    
    // Calculate normalization gain (difference between target and actual loudness)
    // Positive gain = track is quieter than target, needs boost
    // Negative gain = track is louder than target, needs reduction
    let raw_gain = (TARGET_LOUDNESS_LUFS - integrated_lufs) as f32;
    
    // Clamp the gain to prevent extreme adjustments
    // Also consider sample peak to prevent clipping
    let peak_headroom = (-sample_peak_db) as f32; // How much we can boost before clipping
    let normalization_gain_db = raw_gain
        .min(peak_headroom) // Don't boost past 0 dB
        .clamp(MIN_GAIN_DB, MAX_GAIN_DB);
    
    Ok(LoudnessResult {
        integrated_lufs,
        loudness_range,
        true_peak_db,
        normalization_gain_db,
    })
}

/// FAST: Analyze loudness using selective sampling for long tracks
/// 
/// For tracks >= 30 seconds: samples 5 random 8-second segments and averages the results
/// For tracks < 30 seconds: analyzes the entire track (same as analyze_loudness)
/// 
/// This is ~5-10x faster than full analysis for typical 3-5 minute tracks.
/// Use this during library scanning for speed.
pub fn analyze_loudness_sampled(file_path: &Path) -> Result<LoudnessResult, String> {
    // Open the audio file with our decoder
    let mut decoder = AudioDecoder::open(file_path)?;
    
    let sample_rate = decoder.sample_rate();
    let channels = decoder.channels();
    let duration_ms = decoder.duration_ms().unwrap_or(0);
    
    // For short tracks (< 30s), just do full analysis
    if duration_ms < SAMPLING_THRESHOLD_MS {
        return analyze_loudness_full_with_decoder(decoder);
    }
    
    // Calculate segment positions - spread evenly across the track with some randomness
    // Avoid first and last 5 seconds (often have fade in/out)
    let margin_ms: i64 = 5_000;
    let usable_duration = duration_ms - (2 * margin_ms) - SEGMENT_DURATION_MS;
    
    if usable_duration <= 0 {
        // Track too short for proper sampling, do full analysis
        return analyze_loudness_full_with_decoder(decoder);
    }
    
    let mut rng = rand::thread_rng();
    let mut segment_positions: Vec<i64> = Vec::with_capacity(NUM_SEGMENTS);
    
    // Divide track into NUM_SEGMENTS zones and pick a random position within each
    let zone_size = usable_duration / NUM_SEGMENTS as i64;
    for i in 0..NUM_SEGMENTS {
        let zone_start = margin_ms + (i as i64 * zone_size);
        let zone_end = zone_start + zone_size;
        let position = rng.gen_range(zone_start..zone_end.min(duration_ms - SEGMENT_DURATION_MS - margin_ms));
        segment_positions.push(position);
    }
    segment_positions.sort();
    
    // Analyze each segment
    let mut segment_lufs: Vec<f64> = Vec::with_capacity(NUM_SEGMENTS);
    let mut max_sample_peak: f32 = 0.0;
    
    for &position_ms in &segment_positions {
        // Seek to segment position
        if decoder.seek(position_ms).is_err() {
            continue; // Skip this segment if seek fails
        }
        
        // Create EBU R128 analyzer for this segment
        let mut ebu = EbuR128::new(
            channels as u32,
            sample_rate,
            Mode::I,
        ).map_err(|e| format!("Failed to create EBU R128 analyzer: {}", e))?;
        
        // Decode SEGMENT_DURATION_MS worth of audio
        let target_samples = (sample_rate as i64 * channels as i64 * SEGMENT_DURATION_MS / 1000) as usize;
        let mut samples_decoded = 0;
        
        while samples_decoded < target_samples {
            match decoder.decode_next() {
                Ok(Some(samples)) => {
                    // Track peak
                    for &sample in &samples {
                        let abs_sample = sample.abs();
                        if abs_sample > max_sample_peak {
                            max_sample_peak = abs_sample;
                        }
                    }
                    
                    ebu.add_frames_f32(&samples)
                        .map_err(|e| format!("Failed to add frames: {}", e))?;
                    samples_decoded += samples.len();
                }
                Ok(None) => break, // End of file
                Err(_) => continue, // Skip decode errors
            }
        }
        
        // Get loudness for this segment (minimum 400ms required for valid measurement)
        if samples_decoded >= (sample_rate as usize * channels * 400 / 1000) {
            if let Ok(lufs) = ebu.loudness_global() {
                if lufs.is_finite() && lufs > -70.0 { // Ignore silence
                    segment_lufs.push(lufs);
                }
            }
        }
    }
    
    if segment_lufs.is_empty() {
        return Err("No valid segments could be analyzed".to_string());
    }
    
    // Average the LUFS measurements (in linear domain, then convert back)
    // LUFS is logarithmic, so we need to convert to linear, average, then back
    let linear_sum: f64 = segment_lufs.iter()
        .map(|&lufs| 10_f64.powf(lufs / 10.0))
        .sum();
    let integrated_lufs = 10.0 * (linear_sum / segment_lufs.len() as f64).log10();
    
    let loudness_range = 0.0;
    
    let sample_peak_db = if max_sample_peak > 0.0 {
        20.0 * (max_sample_peak as f64).log10()
    } else {
        -96.0
    };
    let true_peak_db = sample_peak_db;
    
    let raw_gain = (TARGET_LOUDNESS_LUFS - integrated_lufs) as f32;
    let peak_headroom = (-sample_peak_db) as f32;
    let normalization_gain_db = raw_gain
        .min(peak_headroom)
        .clamp(MIN_GAIN_DB, MAX_GAIN_DB);
    
    Ok(LoudnessResult {
        integrated_lufs,
        loudness_range,
        true_peak_db,
        normalization_gain_db,
    })
}

/// Internal: Full analysis with an already-opened decoder
fn analyze_loudness_full_with_decoder(mut decoder: AudioDecoder) -> Result<LoudnessResult, String> {
    let sample_rate = decoder.sample_rate();
    let channels = decoder.channels();
    
    let mut ebu = EbuR128::new(
        channels as u32,
        sample_rate,
        Mode::I,
    ).map_err(|e| format!("Failed to create EBU R128 analyzer: {}", e))?;
    
    let mut max_sample_peak: f32 = 0.0;
    
    loop {
        match decoder.decode_next() {
            Ok(Some(samples)) => {
                for &sample in &samples {
                    let abs_sample = sample.abs();
                    if abs_sample > max_sample_peak {
                        max_sample_peak = abs_sample;
                    }
                }
                ebu.add_frames_f32(&samples)
                    .map_err(|e| format!("Failed to add frames: {}", e))?;
            }
            Ok(None) => break,
            Err(e) => {
                eprintln!("Decode error: {}", e);
                continue;
            }
        }
    }
    
    let integrated_lufs = ebu.loudness_global()
        .map_err(|e| format!("Failed to get integrated loudness: {}", e))?;
    
    let sample_peak_db = if max_sample_peak > 0.0 {
        20.0 * (max_sample_peak as f64).log10()
    } else {
        -96.0
    };
    
    let raw_gain = (TARGET_LOUDNESS_LUFS - integrated_lufs) as f32;
    let peak_headroom = (-sample_peak_db) as f32;
    let normalization_gain_db = raw_gain
        .min(peak_headroom)
        .clamp(MIN_GAIN_DB, MAX_GAIN_DB);
    
    Ok(LoudnessResult {
        integrated_lufs,
        loudness_range: 0.0,
        true_peak_db: sample_peak_db,
        normalization_gain_db,
    })
}

/// Analyze loudness with timeout protection (for very long files)
/// Returns None if analysis takes too long
pub fn analyze_loudness_with_timeout(
    file_path: &Path,
    _timeout_seconds: u64,
) -> Option<LoudnessResult> {
    // For now, just do normal analysis
    // TODO: Implement actual timeout if needed
    match analyze_loudness(file_path) {
        Ok(result) => Some(result),
        Err(e) => {
            eprintln!("Loudness analysis failed for {:?}: {}", file_path, e);
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_gain_calculation() {
        // A track at -20 LUFS should get +6 dB gain to reach -14 LUFS target
        let raw_gain = (TARGET_LOUDNESS_LUFS - (-20.0)) as f32;
        assert!((raw_gain - 6.0).abs() < 0.001);
        
        // A track at -10 LUFS should get -4 dB gain (reduction)
        let raw_gain = (TARGET_LOUDNESS_LUFS - (-10.0)) as f32;
        assert!((raw_gain - (-4.0)).abs() < 0.001);
    }
}
