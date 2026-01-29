// Audio decoder using Symphonia
// Decodes audio files to raw PCM samples

#![allow(dead_code)] // Methods will be used in Phase 2

use symphonia::core::audio::{AudioBufferRef, AudioPlanes, Signal};
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::sample::Sample;
use symphonia::core::units::Time;
use std::fs::File;
use std::path::Path;

pub struct AudioDecoder {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    sample_rate: u32,
    channels: usize,
    duration_ms: Option<i64>,
}

impl AudioDecoder {
    /// Open an audio file and prepare for decoding
    pub fn open(path: &Path) -> Result<Self, String> {
        let file = File::open(path)
            .map_err(|e| format!("Failed to open file: {}", e))?;
        
        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        
        // Create a hint using the file extension
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }
        
        // Probe the media source
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
            .map_err(|e| format!("Failed to probe file format: {}", e))?;
        
        let format = probed.format;
        
        // Find the first audio track
        let track = format.tracks()
            .iter()
            .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .ok_or_else(|| "No audio track found".to_string())?;
        
        let track_id = track.id;
        let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
        let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2);
        
        // Calculate duration in milliseconds
        let duration_ms = track.codec_params.n_frames.map(|frames| {
            (frames as f64 / sample_rate as f64 * 1000.0) as i64
        });
        
        // Create decoder for the track
        let decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| format!("Failed to create decoder: {}", e))?;
        
        Ok(Self {
            format,
            decoder,
            track_id,
            sample_rate,
            channels,
            duration_ms,
        })
    }
    
    /// Get the sample rate of the audio
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    
    /// Get the number of channels
    pub fn channels(&self) -> usize {
        self.channels
    }
    
    /// Get the duration in milliseconds (if known)
    pub fn duration_ms(&self) -> Option<i64> {
        self.duration_ms
    }
    
    /// Decode next packet, returns interleaved f32 samples
    /// Returns None when end of stream is reached
    pub fn decode_next(&mut self) -> Result<Option<Vec<f32>>, String> {
        loop {
            let packet = match self.format.next_packet() {
                Ok(p) => p,
                Err(SymphoniaError::IoError(ref e)) 
                    if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                    return Ok(None); // End of stream
                }
                Err(SymphoniaError::ResetRequired) => {
                    // Reset the decoder and try again
                    self.decoder.reset();
                    continue;
                }
                Err(e) => return Err(format!("Failed to read packet: {}", e)),
            };
            
            // Skip packets from other tracks
            if packet.track_id() != self.track_id {
                continue;
            }
            
            // Decode the packet
            match self.decoder.decode(&packet) {
                Ok(decoded) => {
                    return Ok(Some(Self::audio_buf_to_f32(&decoded)));
                }
                Err(SymphoniaError::DecodeError(e)) => {
                    // Log decode errors but continue
                    eprintln!("Decode error (skipping): {}", e);
                    continue;
                }
                Err(e) => return Err(format!("Decode failed: {}", e)),
            }
        }
    }
    
    /// Seek to position in milliseconds
    pub fn seek(&mut self, position_ms: i64) -> Result<u64, String> {
        let seconds = position_ms as f64 / 1000.0;
        let time = Time::new(seconds as u64, seconds.fract());
        
        let seeked_to = self.format.seek(
            SeekMode::Coarse, // Use coarse for speed, accurate if needed
            SeekTo::Time { 
                time,
                track_id: Some(self.track_id),
            }
        ).map_err(|e| format!("Seek failed: {}", e))?;
        
        // Reset decoder state after seek
        self.decoder.reset();
        
        // Return the actual position we seeked to (in ms)
        let actual_ms = (seeked_to.actual_ts as f64 / self.sample_rate as f64 * 1000.0) as u64;
        Ok(actual_ms)
    }
    
    /// Convert any AudioBufferRef to interleaved f32 samples
    fn audio_buf_to_f32(buf: &AudioBufferRef) -> Vec<f32> {
        match buf {
            AudioBufferRef::F32(b) => {
                Self::interleave_f32(b.planes(), b.frames())
            }
            AudioBufferRef::F64(b) => {
                Self::interleave_convert(b.planes(), b.frames(), |s: f64| s as f32)
            }
            AudioBufferRef::S8(b) => {
                let scale = 1.0 / 128.0;
                Self::interleave_convert(b.planes(), b.frames(), |s: i8| s as f32 * scale)
            }
            AudioBufferRef::S16(b) => {
                let scale = 1.0 / 32768.0;
                Self::interleave_convert(b.planes(), b.frames(), |s: i16| s as f32 * scale)
            }
            AudioBufferRef::S24(b) => {
                let scale = 1.0 / 8388608.0;
                Self::interleave_convert(b.planes(), b.frames(), |s| s.inner() as f32 * scale)
            }
            AudioBufferRef::S32(b) => {
                let scale = 1.0 / 2147483648.0;
                Self::interleave_convert(b.planes(), b.frames(), |s: i32| s as f32 * scale)
            }
            AudioBufferRef::U8(b) => {
                Self::interleave_convert(b.planes(), b.frames(), |s: u8| (s as f32 - 128.0) / 128.0)
            }
            AudioBufferRef::U16(b) => {
                Self::interleave_convert(b.planes(), b.frames(), |s: u16| (s as f32 - 32768.0) / 32768.0)
            }
            AudioBufferRef::U24(b) => {
                Self::interleave_convert(b.planes(), b.frames(), |s| (s.inner() as f32 - 8388608.0) / 8388608.0)
            }
            AudioBufferRef::U32(b) => {
                Self::interleave_convert(b.planes(), b.frames(), |s: u32| (s as f64 - 2147483648.0) as f32 / 2147483648.0)
            }
        }
    }
    
    fn interleave_f32(planes: AudioPlanes<f32>, frames: usize) -> Vec<f32> {
        let num_channels = planes.planes().len();
        if num_channels == 0 || frames == 0 {
            return vec![];
        }
        
        let mut interleaved = Vec::with_capacity(frames * num_channels);
        
        for frame in 0..frames {
            for ch in 0..num_channels {
                interleaved.push(planes.planes()[ch][frame]);
            }
        }
        
        interleaved
    }
    
    fn interleave_convert<T: Sample + Copy, F: Fn(T) -> f32>(
        planes: AudioPlanes<T>,
        frames: usize,
        convert: F,
    ) -> Vec<f32> {
        let num_channels = planes.planes().len();
        if num_channels == 0 || frames == 0 {
            return vec![];
        }
        
        let mut interleaved = Vec::with_capacity(frames * num_channels);
        
        for frame in 0..frames {
            for ch in 0..num_channels {
                interleaved.push(convert(planes.planes()[ch][frame]));
            }
        }
        
        interleaved
    }
}
