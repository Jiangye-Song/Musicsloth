// Loudness analysis using EBU R128 standard (LUFS measurement)
// Calculates the normalization gain needed to match a target loudness

use std::path::Path;
use ebur128::{EbuR128, Mode};
use crate::audio::decoder::AudioDecoder;

/// Target integrated loudness in LUFS (Loudness Units Full Scale)
/// -14 LUFS is the standard for streaming platforms (Spotify, YouTube, etc.)
const TARGET_LOUDNESS_LUFS: f64 = -14.0;

/// Maximum gain to apply (to prevent clipping on very quiet tracks)
const MAX_GAIN_DB: f32 = 12.0;

/// Minimum gain to apply (for very loud tracks)
const MIN_GAIN_DB: f32 = -12.0;

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
pub fn analyze_loudness(file_path: &Path) -> Result<LoudnessResult, String> {
    // Open the audio file with our decoder
    let mut decoder = AudioDecoder::open(file_path)?;
    
    let sample_rate = decoder.sample_rate();
    let channels = decoder.channels();
    
    // Initialize EBU R128 analyzer
    // Use Integrated, LoudnessRange, and TruePeak modes
    let mut ebu = EbuR128::new(
        channels as u32,
        sample_rate,
        Mode::I | Mode::LRA | Mode::TRUE_PEAK,
    ).map_err(|e| format!("Failed to create EBU R128 analyzer: {}", e))?;
    
    // Decode and analyze all samples
    loop {
        match decoder.decode_next() {
            Ok(Some(samples)) => {
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
    
    // Get loudness range (dynamic range)
    let loudness_range = ebu.loudness_range()
        .map_err(|e| format!("Failed to get loudness range: {}", e))?;
    
    // Get true peak (maximum sample value)
    let mut max_true_peak = f64::NEG_INFINITY;
    for ch in 0..channels {
        let peak = ebu.true_peak(ch as u32)
            .map_err(|e| format!("Failed to get true peak for channel {}: {}", ch, e))?;
        if peak > max_true_peak {
            max_true_peak = peak;
        }
    }
    // Convert linear to dB
    let true_peak_db = if max_true_peak > 0.0 {
        20.0 * max_true_peak.log10()
    } else {
        -96.0 // Silence
    };
    
    // Calculate normalization gain (difference between target and actual loudness)
    // Positive gain = track is quieter than target, needs boost
    // Negative gain = track is louder than target, needs reduction
    let raw_gain = (TARGET_LOUDNESS_LUFS - integrated_lufs) as f32;
    
    // Clamp the gain to prevent extreme adjustments
    // Also consider true peak to prevent clipping
    let peak_headroom = (-true_peak_db) as f32; // How much we can boost before clipping
    let normalization_gain_db = raw_gain
        .min(peak_headroom) // Don't boost past 0 dBTP
        .clamp(MIN_GAIN_DB, MAX_GAIN_DB);
    
    Ok(LoudnessResult {
        integrated_lufs,
        loudness_range,
        true_peak_db,
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
