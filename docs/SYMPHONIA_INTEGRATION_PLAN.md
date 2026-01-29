# Symphonia Integration Plan for Musicsloth

## Overview

This document outlines the plan to replace the current HTML5 Audio frontend playback with Symphonia (pure Rust audio decoding) and cpal (cross-platform audio output) in the Rust backend.

**Scope**: Audio playback only. Metadata extraction remains with lofty/id3.

---

## Current Architecture

### Metadata Extraction (Keep As-Is)
- **Primary**: `lofty` crate (v0.22)
- **Fallback**: `id3` crate (v1.16) for problematic MP3 files
- **Location**: `src-tauri/src/metadata/extractor.rs`

### Audio Playback (To Be Replaced)
- **Current**: HTML5 `<audio>` element in frontend
- **Location**: `src/services/audioPlayer.ts`
- **Issues**: 
  - Format support depends on browser/system codecs
  - Limited control over audio pipeline
  - No gapless playback possible

---

## New Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  PlayerContext.tsx - UI State & Controls                    ││
│  │  - Play/Pause/Stop/Seek buttons                             ││
│  │  - Progress bar (receives position via events)              ││
│  │  - Volume slider                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │ Tauri IPC + Events                │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Rust + Tauri)                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  commands.rs - Tauri Commands                               ││
│  │  - player_play(path) / player_pause() / player_resume()     ││
│  │  - player_stop() / player_seek(ms) / player_set_volume()    ││
│  │  - player_get_state() -> PlayerState                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  audio/symphonia_player.rs - Audio Engine                   ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       ││
│  │  │  Symphonia   │→│   Resampler  │→│     cpal     │       ││
│  │  │   Decoder    │  │  (if needed) │  │   Output     │       ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  metadata/extractor.rs - Tag Reading (unchanged)            ││
│  │  Uses: lofty + id3                                          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Dependencies

### Add to `Cargo.toml`

```toml
[dependencies]
# Audio decoding (pure Rust)
symphonia = { version = "0.5", features = [
    "mp3",      # MP3 support
    "aac",      # AAC support  
    "flac",     # FLAC support
    "ogg",      # OGG container
    "wav",      # WAV support
    "pcm",      # PCM codec
    "vorbis",   # Vorbis codec
    "isomp4",   # MP4/M4A container
] }

# Cross-platform audio output
cpal = "0.15"

# Sample rate conversion (if device rate differs from file)
rubato = "0.15"

# Thread-safe ring buffer for audio samples
ringbuf = "0.4"

# Better locks for audio thread
parking_lot = "0.12"
```

### Keep existing
```toml
lofty = "0.22"      # Metadata extraction
id3 = "1.16"        # MP3 tag fallback
```

---

## Implementation Plan

### Phase 1: Core Audio Engine (Week 1)

#### 1.1 Create Symphonia Decoder Module

Create `src-tauri/src/audio/decoder.rs`:

```rust
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error;
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
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
    pub fn open(path: &Path) -> Result<Self, Error> {
        let file = File::open(path).map_err(|e| Error::IoError(e))?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());
        
        // Create a hint using the file extension
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }
        
        // Probe the media source
        let probed = symphonia::default::get_probe()
            .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())?;
        
        let format = probed.format;
        
        // Find the first audio track
        let track = format.tracks()
            .iter()
            .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .ok_or(Error::Unsupported("no audio track found"))?;
        
        let track_id = track.id;
        let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
        let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2);
        
        // Calculate duration
        let duration_ms = track.codec_params.n_frames.map(|frames| {
            (frames as f64 / sample_rate as f64 * 1000.0) as i64
        });
        
        // Create decoder
        let decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())?;
        
        Ok(Self {
            format,
            decoder,
            track_id,
            sample_rate,
            channels,
            duration_ms,
        })
    }
    
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    
    pub fn channels(&self) -> usize {
        self.channels
    }
    
    pub fn duration_ms(&self) -> Option<i64> {
        self.duration_ms
    }
    
    /// Decode next packet, returns interleaved f32 samples
    pub fn decode_next(&mut self) -> Result<Option<Vec<f32>>, Error> {
        loop {
            let packet = match self.format.next_packet() {
                Ok(p) => p,
                Err(Error::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                    return Ok(None); // End of stream
                }
                Err(e) => return Err(e),
            };
            
            // Skip packets from other tracks
            if packet.track_id() != self.track_id {
                continue;
            }
            
            let decoded = self.decoder.decode(&packet)?;
            return Ok(Some(Self::audio_buf_to_f32(&decoded)));
        }
    }
    
    /// Seek to position in milliseconds
    pub fn seek(&mut self, position_ms: i64) -> Result<(), Error> {
        use symphonia::core::formats::SeekMode;
        use symphonia::core::units::Time;
        
        let time = Time::new(position_ms as u64 / 1000, (position_ms % 1000) as f64 / 1000.0);
        self.format.seek(SeekMode::Accurate, symphonia::core::formats::SeekTo::Time { 
            time,
            track_id: Some(self.track_id),
        })?;
        
        // Reset decoder state after seek
        self.decoder.reset();
        
        Ok(())
    }
    
    /// Convert any AudioBufferRef to interleaved f32 samples
    fn audio_buf_to_f32(buf: &AudioBufferRef) -> Vec<f32> {
        match buf {
            AudioBufferRef::F32(b) => {
                Self::interleave_planes(b.planes(), b.frames())
            }
            AudioBufferRef::S16(b) => {
                let scale = 1.0 / 32768.0;
                Self::interleave_planes_scaled(b.planes(), b.frames(), scale)
            }
            AudioBufferRef::S32(b) => {
                let scale = 1.0 / 2147483648.0;
                Self::interleave_planes_scaled(b.planes(), b.frames(), scale)
            }
            AudioBufferRef::U8(b) => {
                let samples: Vec<f32> = b.planes().planes().iter()
                    .flat_map(|plane| plane.iter())
                    .map(|&s| (s as f32 - 128.0) / 128.0)
                    .collect();
                samples
            }
            _ => vec![], // Handle other formats as needed
        }
    }
    
    fn interleave_planes(planes: &symphonia::core::audio::AudioPlanes<f32>, frames: usize) -> Vec<f32> {
        let channels = planes.planes().len();
        let mut interleaved = Vec::with_capacity(frames * channels);
        
        for frame in 0..frames {
            for ch in 0..channels {
                interleaved.push(planes.planes()[ch][frame]);
            }
        }
        
        interleaved
    }
    
    fn interleave_planes_scaled<T: Copy + Into<f64>>(
        planes: &symphonia::core::audio::AudioPlanes<T>,
        frames: usize,
        scale: f64,
    ) -> Vec<f32> {
        let channels = planes.planes().len();
        let mut interleaved = Vec::with_capacity(frames * channels);
        
        for frame in 0..frames {
            for ch in 0..channels {
                let sample: f64 = planes.planes()[ch][frame].into();
                interleaved.push((sample * scale) as f32);
            }
        }
        
        interleaved
    }
}
```

#### 1.2 Create Audio Output Module

Create `src-tauri/src/audio/output.rs`:

```rust
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use parking_lot::Mutex;
use ringbuf::{HeapRb, Producer, Consumer};
use std::sync::Arc;

const BUFFER_SIZE: usize = 4096 * 4; // Ring buffer size

pub struct AudioOutput {
    stream: Stream,
    producer: Arc<Mutex<Producer<f32, Arc<HeapRb<f32>>>>>,
    sample_rate: u32,
    channels: u16,
}

impl AudioOutput {
    pub fn new() -> Result<Self, String> {
        let host = cpal::default_host();
        let device = host.default_output_device()
            .ok_or("No output device available")?;
        
        let config = device.default_output_config()
            .map_err(|e| e.to_string())?;
        
        let sample_rate = config.sample_rate().0;
        let channels = config.channels();
        
        // Create ring buffer
        let rb = HeapRb::new(BUFFER_SIZE);
        let (producer, consumer) = rb.split();
        let producer = Arc::new(Mutex::new(producer));
        let consumer = Arc::new(Mutex::new(consumer));
        
        let stream = Self::build_stream(&device, &config.into(), consumer)?;
        stream.play().map_err(|e| e.to_string())?;
        
        Ok(Self {
            stream,
            producer,
            sample_rate,
            channels,
        })
    }
    
    fn build_stream(
        device: &Device,
        config: &StreamConfig,
        consumer: Arc<Mutex<Consumer<f32, Arc<HeapRb<f32>>>>>,
    ) -> Result<Stream, String> {
        let channels = config.channels as usize;
        
        let stream = device.build_output_stream(
            config,
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                let mut consumer = consumer.lock();
                for sample in data.iter_mut() {
                    *sample = consumer.pop().unwrap_or(0.0);
                }
            },
            |err| eprintln!("Audio output error: {}", err),
            None,
        ).map_err(|e| e.to_string())?;
        
        Ok(stream)
    }
    
    /// Write samples to the output buffer
    pub fn write(&self, samples: &[f32]) {
        let mut producer = self.producer.lock();
        for &sample in samples {
            // Drop samples if buffer is full (shouldn't happen normally)
            let _ = producer.push(sample);
        }
    }
    
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    
    pub fn channels(&self) -> u16 {
        self.channels
    }
    
    pub fn pause(&self) {
        let _ = self.stream.pause();
    }
    
    pub fn resume(&self) {
        let _ = self.stream.play();
    }
}
```

#### 1.3 Create Main Player Module

Create `src-tauri/src/audio/player.rs` (replace existing):

```rust
use super::decoder::AudioDecoder;
use super::output::AudioOutput;
use parking_lot::{Mutex, RwLock};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};

#[derive(Clone, Debug, serde::Serialize)]
pub struct PlayerState {
    pub is_playing: bool,
    pub is_paused: bool,
    pub current_file: Option<String>,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub volume: f32,
}

pub struct Player {
    // Playback state
    is_playing: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    position_ms: Arc<AtomicI64>,
    duration_ms: Arc<AtomicI64>,
    volume: Arc<RwLock<f32>>,
    current_file: Arc<RwLock<Option<PathBuf>>>,
    
    // Thread management
    playback_thread: Mutex<Option<JoinHandle<()>>>,
    
    // Audio output
    output: Arc<Mutex<Option<AudioOutput>>>,
    
    // Seek request
    seek_request: Arc<AtomicI64>, // -1 = no seek, >= 0 = seek to this position
}

impl Player {
    pub fn new() -> Self {
        Self {
            is_playing: Arc::new(AtomicBool::new(false)),
            is_paused: Arc::new(AtomicBool::new(false)),
            position_ms: Arc::new(AtomicI64::new(0)),
            duration_ms: Arc::new(AtomicI64::new(0)),
            volume: Arc::new(RwLock::new(1.0)),
            current_file: Arc::new(RwLock::new(None)),
            playback_thread: Mutex::new(None),
            output: Arc::new(Mutex::new(None)),
            seek_request: Arc::new(AtomicI64::new(-1)),
        }
    }
    
    pub fn play(&self, file_path: PathBuf) -> Result<(), String> {
        // Stop any current playback
        self.stop();
        
        // Initialize audio output if needed
        {
            let mut output = self.output.lock();
            if output.is_none() {
                *output = Some(AudioOutput::new()?);
            }
        }
        
        // Update state
        *self.current_file.write() = Some(file_path.clone());
        self.is_playing.store(true, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);
        self.position_ms.store(0, Ordering::SeqCst);
        
        // Clone Arcs for the playback thread
        let is_playing = self.is_playing.clone();
        let is_paused = self.is_paused.clone();
        let position_ms = self.position_ms.clone();
        let duration_ms = self.duration_ms.clone();
        let volume = self.volume.clone();
        let output = self.output.clone();
        let seek_request = self.seek_request.clone();
        
        // Spawn playback thread
        let handle = thread::spawn(move || {
            if let Err(e) = Self::playback_loop(
                file_path,
                is_playing,
                is_paused,
                position_ms,
                duration_ms,
                volume,
                output,
                seek_request,
            ) {
                eprintln!("Playback error: {}", e);
            }
        });
        
        *self.playback_thread.lock() = Some(handle);
        
        Ok(())
    }
    
    fn playback_loop(
        file_path: PathBuf,
        is_playing: Arc<AtomicBool>,
        is_paused: Arc<AtomicBool>,
        position_ms: Arc<AtomicI64>,
        duration_ms: Arc<AtomicI64>,
        volume: Arc<RwLock<f32>>,
        output: Arc<Mutex<Option<AudioOutput>>>,
        seek_request: Arc<AtomicI64>,
    ) -> Result<(), String> {
        let mut decoder = AudioDecoder::open(&file_path)
            .map_err(|e| format!("Failed to open file: {}", e))?;
        
        // Set duration
        if let Some(dur) = decoder.duration_ms() {
            duration_ms.store(dur, Ordering::SeqCst);
        }
        
        let sample_rate = decoder.sample_rate();
        let channels = decoder.channels();
        let samples_per_ms = (sample_rate as f64 * channels as f64) / 1000.0;
        let mut samples_played: i64 = 0;
        
        while is_playing.load(Ordering::SeqCst) {
            // Handle pause
            if is_paused.load(Ordering::SeqCst) {
                thread::sleep(std::time::Duration::from_millis(10));
                continue;
            }
            
            // Handle seek request
            let seek_pos = seek_request.swap(-1, Ordering::SeqCst);
            if seek_pos >= 0 {
                if decoder.seek(seek_pos).is_ok() {
                    samples_played = (seek_pos as f64 * samples_per_ms) as i64;
                    position_ms.store(seek_pos, Ordering::SeqCst);
                }
            }
            
            // Decode next packet
            match decoder.decode_next() {
                Ok(Some(mut samples)) => {
                    // Apply volume
                    let vol = *volume.read();
                    if vol != 1.0 {
                        for sample in &mut samples {
                            *sample *= vol;
                        }
                    }
                    
                    // Write to output
                    if let Some(ref out) = *output.lock() {
                        out.write(&samples);
                    }
                    
                    // Update position
                    samples_played += samples.len() as i64;
                    let pos = (samples_played as f64 / samples_per_ms) as i64;
                    position_ms.store(pos, Ordering::SeqCst);
                }
                Ok(None) => {
                    // End of file
                    break;
                }
                Err(e) => {
                    eprintln!("Decode error: {:?}", e);
                    break;
                }
            }
        }
        
        is_playing.store(false, Ordering::SeqCst);
        Ok(())
    }
    
    pub fn pause(&self) {
        self.is_paused.store(true, Ordering::SeqCst);
        if let Some(ref output) = *self.output.lock() {
            output.pause();
        }
    }
    
    pub fn resume(&self) {
        self.is_paused.store(false, Ordering::SeqCst);
        if let Some(ref output) = *self.output.lock() {
            output.resume();
        }
    }
    
    pub fn stop(&self) {
        self.is_playing.store(false, Ordering::SeqCst);
        self.is_paused.store(false, Ordering::SeqCst);
        
        // Wait for playback thread to finish
        if let Some(handle) = self.playback_thread.lock().take() {
            let _ = handle.join();
        }
        
        *self.current_file.write() = None;
        self.position_ms.store(0, Ordering::SeqCst);
        self.duration_ms.store(0, Ordering::SeqCst);
    }
    
    pub fn seek(&self, position_ms: i64) {
        self.seek_request.store(position_ms, Ordering::SeqCst);
    }
    
    pub fn set_volume(&self, vol: f32) {
        *self.volume.write() = vol.clamp(0.0, 1.0);
    }
    
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
}
```

#### 1.4 Update Audio Module

Update `src-tauri/src/audio/mod.rs`:

```rust
pub mod decoder;
pub mod output;
pub mod player;

pub use player::{Player, PlayerState};
```

---

### Phase 2: Tauri Commands (Week 1-2)

#### 2.1 Add Player Commands

Update `src-tauri/src/commands.rs` - add these commands:

```rust
use crate::audio::{Player, PlayerState};
use tauri::State;

#[tauri::command]
pub async fn player_play(
    file_path: String,
    player: State<'_, Player>,
) -> Result<(), String> {
    player.play(file_path.into())
}

#[tauri::command]
pub async fn player_pause(player: State<'_, Player>) -> Result<(), String> {
    player.pause();
    Ok(())
}

#[tauri::command]
pub async fn player_resume(player: State<'_, Player>) -> Result<(), String> {
    player.resume();
    Ok(())
}

#[tauri::command]
pub async fn player_stop(player: State<'_, Player>) -> Result<(), String> {
    player.stop();
    Ok(())
}

#[tauri::command]
pub async fn player_seek(
    position_ms: i64,
    player: State<'_, Player>,
) -> Result<(), String> {
    player.seek(position_ms);
    Ok(())
}

#[tauri::command]
pub async fn player_set_volume(
    volume: f32,
    player: State<'_, Player>,
) -> Result<(), String> {
    player.set_volume(volume);
    Ok(())
}

#[tauri::command]
pub async fn player_get_state(
    player: State<'_, Player>,
) -> Result<PlayerState, String> {
    Ok(player.get_state())
}
```

#### 2.2 Register Commands and State

Update `src-tauri/src/lib.rs`:

```rust
use audio::Player;

pub fn run() {
    tauri::Builder::default()
        .manage(Player::new())
        // ... existing state
        .invoke_handler(tauri::generate_handler![
            // ... existing commands
            commands::player_play,
            commands::player_pause,
            commands::player_resume,
            commands::player_stop,
            commands::player_seek,
            commands::player_set_volume,
            commands::player_get_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

### Phase 3: Frontend Integration (Week 2)

#### 3.1 Update Audio Service

Replace `src/services/audioPlayer.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';

interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentFile: string | null;
  duration: number;
  position: number;
  volume: number;
}

type StateChangeCallback = (state: PlayerState) => void;
type TrackEndedCallback = () => void;

class AudioPlayer {
  private stateCallbacks: Set<StateChangeCallback> = new Set();
  private trackEndedCallbacks: Set<TrackEndedCallback> = new Set();
  private pollInterval: number | null = null;
  private lastState: PlayerState | null = null;
  private currentVolume: number = 1.0;

  constructor() {
    // Poll backend for state updates
    this.startPolling();
  }

  private startPolling(): void {
    this.pollInterval = window.setInterval(() => {
      this.pollState();
    }, 50); // 50ms for smooth progress bar
  }

  private async pollState(): Promise<void> {
    try {
      const backendState = await invoke<{
        is_playing: boolean;
        is_paused: boolean;
        position_ms: number;
        duration_ms: number;
        volume: number;
        current_file: string | null;
      }>('player_get_state');

      const state: PlayerState = {
        isPlaying: backendState.is_playing && !backendState.is_paused,
        isPaused: backendState.is_paused,
        currentFile: backendState.current_file,
        duration: backendState.duration_ms,
        position: backendState.position_ms,
        volume: backendState.volume,
      };

      // Detect track ended
      if (this.lastState?.isPlaying && 
          !state.isPlaying && 
          !state.isPaused &&
          this.lastState.currentFile) {
        this.notifyTrackEnded();
      }

      this.lastState = state;
      this.notifyStateChange(state);
    } catch (error) {
      console.error('Failed to poll player state:', error);
    }
  }

  async play(filePath: string): Promise<void> {
    await invoke('player_play', { filePath });
  }

  pause(): void {
    invoke('player_pause');
  }

  resume(): void {
    invoke('player_resume');
  }

  stop(): void {
    invoke('player_stop');
  }

  seek(positionMs: number): void {
    invoke('player_seek', { positionMs: Math.floor(positionMs) });
  }

  setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    invoke('player_set_volume', { volume: this.currentVolume });
  }

  getState(): PlayerState {
    return this.lastState || {
      isPlaying: false,
      isPaused: false,
      currentFile: null,
      duration: 0,
      position: 0,
      volume: this.currentVolume,
    };
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  onTrackEnded(callback: TrackEndedCallback): () => void {
    this.trackEndedCallbacks.add(callback);
    return () => this.trackEndedCallbacks.delete(callback);
  }

  private notifyStateChange(state: PlayerState): void {
    this.stateCallbacks.forEach(callback => callback(state));
  }

  private notifyTrackEnded(): void {
    this.trackEndedCallbacks.forEach(callback => callback());
  }

  destroy(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
    }
    this.stateCallbacks.clear();
    this.trackEndedCallbacks.clear();
  }
}

export const audioPlayer = new AudioPlayer();
```

---

## File Changes Summary

### Files to Create
| File | Description |
|------|-------------|
| `src-tauri/src/audio/decoder.rs` | Symphonia decoder wrapper |
| `src-tauri/src/audio/output.rs` | cpal audio output wrapper |

### Files to Modify
| File | Changes |
|------|---------|
| `src-tauri/Cargo.toml` | Add symphonia, cpal, rubato, ringbuf, parking_lot |
| `src-tauri/src/audio/mod.rs` | Export new modules |
| `src-tauri/src/audio/player.rs` | Replace with Symphonia-based player |
| `src-tauri/src/commands.rs` | Add player commands |
| `src-tauri/src/lib.rs` | Register Player state and commands |
| `src/services/audioPlayer.ts` | Use backend playback via IPC |

### Files to Keep Unchanged
| File | Reason |
|------|--------|
| `src-tauri/src/metadata/extractor.rs` | lofty/id3 for metadata is fine |
| `src/contexts/PlayerContext.tsx` | Should work with new audioPlayer |

---

## Testing Checklist

### Phase 1 Tests
- [ ] MP3 files play correctly
- [ ] FLAC files play correctly
- [ ] AAC/M4A files play correctly
- [ ] OGG files play correctly
- [ ] WAV files play correctly
- [ ] Audio output has no glitches/pops

### Phase 2 Tests
- [ ] Play command works
- [ ] Pause/resume works
- [ ] Stop works
- [ ] Seek works accurately
- [ ] Volume control works
- [ ] State polling returns correct values

### Phase 3 Tests
- [ ] Progress bar updates smoothly
- [ ] Play/pause buttons work
- [ ] Seek bar works
- [ ] Volume slider works
- [ ] Track auto-advances when finished
- [ ] Media Session integration still works

---

## Future Enhancements

After basic playback works, consider:

1. **Gapless Playback**: Pre-decode next track
2. **ReplayGain**: Normalize volume across tracks
3. **Sample Rate Conversion**: Use rubato when device rate differs
4. **Equalizer**: Add DSP processing in the audio pipeline
5. **Crossfade**: Smooth transitions between tracks
6. **Audio Device Selection**: Let user choose output device

---

## Timeline

| Week | Tasks |
|------|-------|
| Week 1 | Core audio engine (decoder, output, player) |
| Week 2 | Tauri commands + frontend integration |
| Week 3 | Testing, bug fixes, polish |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Audio glitches | Use larger ring buffer, optimize decode loop |
| Seek inaccuracy | Symphonia seeking can be slow on some formats; cache seek points |
| High CPU usage | Ensure decode happens in separate thread |
| Memory leaks | Properly clean up on stop/track change |
