# FFmpeg Integration Plan for Musicsloth

## Overview

This document outlines the plan to replace the current audio handling stack (lofty/id3 for metadata, HTML5 Audio for playback) with FFmpeg for comprehensive audio format support and consistent cross-platform behavior.

---

## Current Architecture

### Metadata Extraction (Rust Backend)
- **Primary**: `lofty` crate (v0.22)
- **Fallback**: `id3` crate (v1.16) for problematic MP3 files
- **Location**: `src-tauri/src/metadata/extractor.rs`

### Audio Playback (TypeScript Frontend)
- **Engine**: HTML5 `<audio>` element via `HTMLAudioElement`
- **File serving**: Tauri's `convertFileSrc()` protocol
- **Location**: `src/services/audioPlayer.ts`

### Current Limitations
1. Format support depends on browser/system codecs
2. Some metadata formats not fully supported
3. No audio transcoding capabilities
4. Limited audio processing options

---

## FFmpeg Integration Options

### Option A: FFmpeg CLI Integration (Recommended for Quick Start)
**Approach**: Bundle FFmpeg binaries and call via subprocess

**Pros**:
- Quickest to implement
- Full FFmpeg feature set
- Easy to update FFmpeg version
- Well-documented CLI interface

**Cons**:
- Larger binary size (~50-100MB)
- Subprocess overhead
- Need to bundle for each platform

### Option B: FFmpeg Rust Bindings (Recommended for Production)
**Approach**: Use Rust crate bindings to FFmpeg libraries

**Pros**:
- Native integration, no subprocess overhead
- Better error handling
- Smaller binary (only needed codecs)
- Type-safe API

**Cons**:
- More complex build setup
- Need to compile FFmpeg or link to system libraries
- Learning curve for FFmpeg API

**Recommended Crates**:
- `ffmpeg-next` - Most popular, actively maintained
- `rsmpeg` - Rust-centric API design
- `ac-ffmpeg` - Pure Rust FFI bindings

### Option C: Hybrid Approach (Best of Both Worlds)
**Approach**: Use FFmpeg bindings for metadata/decoding, custom audio output

**Pros**:
- Optimal for each use case
- Can still use Rust audio output (cpal/rodio)
- Flexible architecture

---

## Recommended Implementation: Hybrid Approach

### Phase 1: Metadata Extraction with FFmpeg
Replace lofty/id3 with FFmpeg for consistent metadata across all formats.

### Phase 2: Audio Decoding with FFmpeg
Decode audio to raw PCM using FFmpeg, output via native audio API.

### Phase 3: Backend Audio Playback (optional)
Move playback from frontend to Rust backend for better control.

---

## Phase 1: FFmpeg Metadata Extraction

### 1.1 Add Dependencies

Update `Cargo.toml`:
```toml
[dependencies]
# Remove these:
# lofty = "0.22"
# id3 = "1.16"

# Add FFmpeg bindings:
ffmpeg-next = "7"
# OR for easier Windows setup:
# rsmpeg = "0.15"
```

### 1.2 Create FFmpeg Metadata Extractor

Create `src-tauri/src/metadata/ffmpeg_extractor.rs`:

```rust
use anyhow::Result;
use ffmpeg_next as ffmpeg;
use std::path::Path;

use crate::db::models::Track;

pub struct FFmpegMetadataExtractor;

impl FFmpegMetadataExtractor {
    pub fn init() -> Result<()> {
        ffmpeg::init()?;
        Ok(())
    }

    pub fn extract_from_file(file_path: &Path) -> Result<Track> {
        let context = ffmpeg::format::input(&file_path)?;
        
        // Get format metadata
        let metadata = context.metadata();
        
        // Extract common tags
        let title = metadata.get("title")
            .or_else(|| metadata.get("TITLE"))
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                file_path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string()
            });
        
        let artist = metadata.get("artist")
            .or_else(|| metadata.get("ARTIST"))
            .map(|s| s.to_string());
        
        let album = metadata.get("album")
            .or_else(|| metadata.get("ALBUM"))
            .map(|s| s.to_string());
        
        let album_artist = metadata.get("album_artist")
            .or_else(|| metadata.get("ALBUMARTIST"))
            .map(|s| s.to_string());
        
        let year = metadata.get("date")
            .or_else(|| metadata.get("DATE"))
            .or_else(|| metadata.get("year"))
            .and_then(|s| s.chars().take(4).collect::<String>().parse().ok());
        
        let track_number = metadata.get("track")
            .or_else(|| metadata.get("TRACKNUMBER"))
            .and_then(|s| {
                // Handle "3/12" format
                s.split('/').next()?.parse().ok()
            });
        
        let disc_number = metadata.get("disc")
            .or_else(|| metadata.get("DISCNUMBER"))
            .and_then(|s| {
                s.split('/').next()?.parse().ok()
            });
        
        let genre = metadata.get("genre")
            .or_else(|| metadata.get("GENRE"))
            .map(|s| s.to_string());
        
        // Get audio stream info
        let audio_stream = context.streams()
            .best(ffmpeg::media::Type::Audio)
            .ok_or_else(|| anyhow::anyhow!("No audio stream found"))?;
        
        let duration_ms = context.duration() as i64 / 1000; // FFmpeg uses microseconds
        
        let codec = audio_stream.parameters();
        let sample_rate = ffmpeg::codec::context::Context::from_parameters(codec.clone())?
            .decoder()
            .audio()?
            .rate() as i32;
        
        // Bitrate (in bits/sec, convert to kbps)
        let bitrate = if audio_stream.parameters().bit_rate() > 0 {
            Some((audio_stream.parameters().bit_rate() / 1000) as i32)
        } else if context.bit_rate() > 0 {
            Some((context.bit_rate() / 1000) as i32)
        } else {
            None
        };
        
        let file_metadata = std::fs::metadata(file_path)?;
        let file_size = file_metadata.len() as i64;
        let file_format = file_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;
        
        Ok(Track {
            id: 0,
            file_path: file_path.to_string_lossy().to_string(),
            title,
            artist,
            album,
            album_artist,
            year,
            track_number,
            disc_number,
            duration_ms: Some(duration_ms),
            genre,
            file_size: Some(file_size),
            file_format: Some(file_format),
            bitrate,
            sample_rate: Some(sample_rate),
            date_added: now,
            date_modified: now,
            play_count: 0,
            last_played: None,
            file_hash: None,
        })
    }
}
```

### 1.3 Extract Album Artwork

Update `src-tauri/src/metadata/artwork.rs`:

```rust
use anyhow::Result;
use ffmpeg_next as ffmpeg;
use std::path::Path;

pub struct ArtworkExtractor;

impl ArtworkExtractor {
    /// Extract embedded album artwork from audio file
    pub fn extract_embedded(file_path: &Path) -> Result<Option<Vec<u8>>> {
        let context = ffmpeg::format::input(&file_path)?;
        
        // Look for attached picture stream (video stream in audio file)
        for stream in context.streams() {
            if stream.parameters().medium() == ffmpeg::media::Type::Video {
                // This is typically the album art
                // For attached pictures, we need to read the stream data
                // The implementation depends on the container format
            }
        }
        
        Ok(None) // Placeholder
    }
    
    /// Check for cover.jpg/folder.jpg in same directory
    pub fn find_folder_artwork(file_path: &Path) -> Option<std::path::PathBuf> {
        let parent = file_path.parent()?;
        
        let candidates = [
            "cover.jpg", "cover.png", "Cover.jpg", "Cover.png",
            "folder.jpg", "folder.png", "Folder.jpg", "Folder.png",
            "album.jpg", "album.png", "Album.jpg", "Album.png",
            "front.jpg", "front.png", "Front.jpg", "Front.png",
        ];
        
        for name in candidates {
            let artwork_path = parent.join(name);
            if artwork_path.exists() {
                return Some(artwork_path);
            }
        }
        
        None
    }
}
```

---

## Phase 2: FFmpeg Audio Decoding

### 2.1 Architecture Decision: Backend vs Frontend Playback

**Option A: Keep Frontend Playback (Simpler)**
- Decode with FFmpeg → Transcode to WAV/MP3 → Serve to frontend
- Frontend continues using HTML5 Audio
- Good for browser compatibility

**Option B: Move to Backend Playback (Recommended)**
- Full control over audio pipeline
- Better format support
- Can use WASAPI/CoreAudio/ALSA directly
- Required for advanced features (EQ, gapless playback)

### 2.2 Backend Audio Playback Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  PlayerContext.tsx - UI State & Controls                │    │
│  │  - Play/Pause/Stop buttons                              │    │
│  │  - Progress bar (receives position from backend)        │    │
│  │  - Volume control                                        │    │
│  └───────────────────────────────────────────────────────────┘  │
│                              │ Tauri IPC                         │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Rust + Tauri)                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  commands.rs - Tauri Commands                           │    │
│  │  - play_file(path)                                       │    │
│  │  - pause(), resume(), stop()                            │    │
│  │  - seek(position)                                        │    │
│  │  - set_volume(level)                                     │    │
│  │  - get_player_state() -> PlayerState                    │    │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  audio/ffmpeg_player.rs - FFmpeg Audio Engine           │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │    │
│  │  │   Demuxer   │→│   Decoder    │→│  Audio Output   │  │    │
│  │  │  (FFmpeg)   │  │  (FFmpeg)    │  │  (cpal/rodio)  │  │    │
│  │  └─────────────┘  └──────────────┘  └────────────────┘  │    │
│  │                                                          │    │
│  │  Features:                                               │    │
│  │  - Gapless playback                                      │    │
│  │  - ReplayGain                                            │    │
│  │  - Sample rate conversion                                │    │
│  │  - Audio processing pipeline                             │    │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Create FFmpeg Audio Player

Create `src-tauri/src/audio/ffmpeg_player.rs`:

```rust
use anyhow::Result;
use ffmpeg_next as ffmpeg;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::thread;

pub struct FFmpegPlayer {
    state: Arc<Mutex<PlayerState>>,
    is_playing: Arc<AtomicBool>,
    playback_thread: Option<thread::JoinHandle<()>>,
}

#[derive(Clone, Debug)]
pub struct PlayerState {
    pub current_file: Option<PathBuf>,
    pub position_ms: i64,
    pub duration_ms: i64,
    pub volume: f32,
    pub is_playing: bool,
    pub is_paused: bool,
}

impl FFmpegPlayer {
    pub fn new() -> Result<Self> {
        ffmpeg::init()?;
        
        Ok(Self {
            state: Arc::new(Mutex::new(PlayerState {
                current_file: None,
                position_ms: 0,
                duration_ms: 0,
                volume: 1.0,
                is_playing: false,
                is_paused: false,
            })),
            is_playing: Arc::new(AtomicBool::new(false)),
            playback_thread: None,
        })
    }

    pub fn play(&mut self, file_path: PathBuf) -> Result<()> {
        self.stop();
        
        let state = self.state.clone();
        let is_playing = self.is_playing.clone();
        
        is_playing.store(true, Ordering::SeqCst);
        
        let handle = thread::spawn(move || {
            if let Err(e) = Self::playback_loop(file_path, state, is_playing) {
                eprintln!("Playback error: {}", e);
            }
        });
        
        self.playback_thread = Some(handle);
        Ok(())
    }

    fn playback_loop(
        file_path: PathBuf,
        state: Arc<Mutex<PlayerState>>,
        is_playing: Arc<AtomicBool>,
    ) -> Result<()> {
        let mut input = ffmpeg::format::input(&file_path)?;
        
        let stream_index = input.streams()
            .best(ffmpeg::media::Type::Audio)
            .ok_or_else(|| anyhow::anyhow!("No audio stream"))?
            .index();
        
        let context = ffmpeg::codec::context::Context::from_parameters(
            input.stream(stream_index).unwrap().parameters()
        )?;
        
        let mut decoder = context.decoder().audio()?;
        
        // Set up audio resampler for consistent output format
        let mut resampler = ffmpeg::software::resampling::Context::get(
            decoder.format(),
            decoder.channel_layout(),
            decoder.rate(),
            ffmpeg::format::Sample::I16(ffmpeg::format::sample::Type::Packed),
            ffmpeg::ChannelLayout::STEREO,
            44100, // Output sample rate
        )?;
        
        // Initialize audio output (cpal)
        // ... cpal setup code ...
        
        // Decode and play loop
        for (stream, packet) in input.packets() {
            if !is_playing.load(Ordering::SeqCst) {
                break;
            }
            
            if stream.index() == stream_index {
                decoder.send_packet(&packet)?;
                
                let mut decoded = ffmpeg::frame::Audio::empty();
                while decoder.receive_frame(&mut decoded).is_ok() {
                    let mut resampled = ffmpeg::frame::Audio::empty();
                    resampler.run(&decoded, &mut resampled)?;
                    
                    // Send resampled audio to output device
                    // ... audio output code ...
                    
                    // Update position
                    let pts = decoded.pts().unwrap_or(0);
                    let time_base = input.stream(stream_index).unwrap().time_base();
                    let position_ms = pts * 1000 * time_base.numerator() as i64 
                        / time_base.denominator() as i64;
                    
                    state.lock().unwrap().position_ms = position_ms;
                }
            }
        }
        
        Ok(())
    }

    pub fn pause(&mut self) {
        self.is_playing.store(false, Ordering::SeqCst);
        self.state.lock().unwrap().is_paused = true;
    }

    pub fn resume(&mut self) {
        // Re-seek to current position and continue
    }

    pub fn stop(&mut self) {
        self.is_playing.store(false, Ordering::SeqCst);
        if let Some(handle) = self.playback_thread.take() {
            let _ = handle.join();
        }
        let mut state = self.state.lock().unwrap();
        state.current_file = None;
        state.position_ms = 0;
        state.is_playing = false;
        state.is_paused = false;
    }

    pub fn seek(&mut self, position_ms: i64) -> Result<()> {
        // Seek implementation
        Ok(())
    }

    pub fn set_volume(&mut self, volume: f32) {
        self.state.lock().unwrap().volume = volume.clamp(0.0, 1.0);
    }

    pub fn get_state(&self) -> PlayerState {
        self.state.lock().unwrap().clone()
    }
}
```

### 2.4 Add Audio Output Dependencies

Update `Cargo.toml`:
```toml
[dependencies]
# FFmpeg bindings
ffmpeg-next = "7"

# Cross-platform audio output
cpal = "0.15"
# OR
rodio = "0.19"
```

---

## Phase 3: Update Tauri Commands

### 3.1 Update Backend Commands

Modify `src-tauri/src/commands.rs`:

```rust
use crate::audio::ffmpeg_player::FFmpegPlayer;
use tauri::State;
use std::sync::Mutex;

// Add player state
pub struct AppState {
    pub player: Mutex<FFmpegPlayer>,
    // ... other state
}

#[tauri::command]
pub async fn play_file(
    file_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut player = state.player.lock().map_err(|e| e.to_string())?;
    player.play(file_path.into()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pause(state: State<'_, AppState>) -> Result<(), String> {
    let mut player = state.player.lock().map_err(|e| e.to_string())?;
    player.pause();
    Ok(())
}

#[tauri::command]
pub async fn resume(state: State<'_, AppState>) -> Result<(), String> {
    let mut player = state.player.lock().map_err(|e| e.to_string())?;
    player.resume();
    Ok(())
}

#[tauri::command]
pub async fn stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut player = state.player.lock().map_err(|e| e.to_string())?;
    player.stop();
    Ok(())
}

#[tauri::command]
pub async fn seek(
    position_ms: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut player = state.player.lock().map_err(|e| e.to_string())?;
    player.seek(position_ms).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_volume(
    volume: f32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut player = state.player.lock().map_err(|e| e.to_string())?;
    player.set_volume(volume);
    Ok(())
}

#[tauri::command]
pub async fn get_player_state(
    state: State<'_, AppState>,
) -> Result<PlayerStateResponse, String> {
    let player = state.player.lock().map_err(|e| e.to_string())?;
    let state = player.get_state();
    Ok(PlayerStateResponse {
        is_playing: state.is_playing,
        is_paused: state.is_paused,
        position_ms: state.position_ms,
        duration_ms: state.duration_ms,
        volume: state.volume,
        current_file: state.current_file.map(|p| p.to_string_lossy().to_string()),
    })
}
```

### 3.2 Update Frontend Audio Service

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
  private currentFile: string | null = null;

  constructor() {
    // Poll backend for state updates
    this.pollInterval = window.setInterval(() => {
      this.pollState();
    }, 100);
  }

  private async pollState(): Promise<void> {
    try {
      const state = await invoke<{
        is_playing: boolean;
        is_paused: boolean;
        position_ms: number;
        duration_ms: number;
        volume: number;
        current_file: string | null;
      }>('get_player_state');
      
      // Detect track ended
      if (this.currentFile && !state.current_file && !state.is_playing) {
        this.notifyTrackEnded();
      }
      this.currentFile = state.current_file;
      
      this.notifyStateChange({
        isPlaying: state.is_playing,
        isPaused: state.is_paused,
        currentFile: state.current_file,
        duration: state.duration_ms,
        position: state.position_ms,
        volume: state.volume,
      });
    } catch (error) {
      console.error('Failed to poll player state:', error);
    }
  }

  async play(filePath: string): Promise<void> {
    await invoke('play_file', { filePath });
  }

  async pause(): Promise<void> {
    await invoke('pause');
  }

  async resume(): Promise<void> {
    await invoke('resume');
  }

  async stop(): Promise<void> {
    await invoke('stop');
  }

  async seek(positionMs: number): Promise<void> {
    await invoke('seek', { positionMs });
  }

  async setVolume(volume: number): Promise<void> {
    await invoke('set_volume', { volume: Math.max(0, Math.min(1, volume)) });
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

## Build Configuration

### Windows

1. **Install vcpkg**:
```powershell
git clone https://github.com/microsoft/vcpkg
cd vcpkg
.\bootstrap-vcpkg.bat
.\vcpkg install ffmpeg:x64-windows
```

2. **Set environment variables**:
```powershell
$env:VCPKG_ROOT = "C:\path\to\vcpkg"
$env:FFMPEG_DIR = "$env:VCPKG_ROOT\installed\x64-windows"
```

3. **Alternative: Use pre-built FFmpeg**:
   - Download from https://www.gyan.dev/ffmpeg/builds/
   - Set `FFMPEG_DIR` to the extracted folder

### macOS

```bash
brew install ffmpeg
export FFMPEG_DIR=$(brew --prefix ffmpeg)
```

### Linux

```bash
sudo apt install libavcodec-dev libavformat-dev libavutil-dev libswresample-dev
# Or on Fedora:
sudo dnf install ffmpeg-devel
```

---

## Implementation Timeline

### Week 1: Setup & Metadata
- [ ] Set up FFmpeg build environment on Windows
- [ ] Add `ffmpeg-next` dependency
- [ ] Create `FFmpegMetadataExtractor`
- [ ] Replace `lofty`/`id3` with FFmpeg metadata extraction
- [ ] Test with various audio formats

### Week 2: Audio Decoding
- [ ] Create `FFmpegDecoder` for audio decoding
- [ ] Add `cpal` for audio output
- [ ] Implement basic playback loop
- [ ] Handle sample rate conversion

### Week 3: Player Features
- [ ] Implement seek functionality
- [ ] Add pause/resume support
- [ ] Implement volume control
- [ ] Add gapless playback support

### Week 4: Integration & Testing
- [ ] Update Tauri commands
- [ ] Modify frontend to use new backend playback
- [ ] Test all audio formats
- [ ] Performance optimization
- [ ] Remove old dependencies (lofty, id3)

---

## Supported Audio Formats with FFmpeg

| Format | Extension | Notes |
|--------|-----------|-------|
| MP3 | .mp3 | MPEG Layer 3 |
| AAC | .m4a, .aac | Apple Lossless container too |
| FLAC | .flac | Free Lossless Audio Codec |
| WAV | .wav | Uncompressed PCM |
| OGG Vorbis | .ogg | Open format |
| Opus | .opus | Modern, highly efficient |
| WMA | .wma | Windows Media Audio |
| ALAC | .m4a | Apple Lossless |
| APE | .ape | Monkey's Audio |
| WavPack | .wv | Hybrid lossless |
| DSD | .dsf, .dff | High-resolution audio |

---

## Migration Checklist

### Files to Modify
- [ ] `src-tauri/Cargo.toml` - Update dependencies
- [ ] `src-tauri/src/metadata/extractor.rs` - Replace with FFmpeg
- [ ] `src-tauri/src/metadata/artwork.rs` - Implement artwork extraction
- [ ] `src-tauri/src/audio/player.rs` - Replace with FFmpeg player
- [ ] `src-tauri/src/commands.rs` - Add playback commands
- [ ] `src-tauri/src/lib.rs` - Register new commands
- [ ] `src/services/audioPlayer.ts` - Use backend playback

### Files to Create
- [ ] `src-tauri/src/metadata/ffmpeg_extractor.rs`
- [ ] `src-tauri/src/audio/ffmpeg_player.rs`
- [ ] `src-tauri/src/audio/decoder.rs`
- [ ] `src-tauri/src/audio/output.rs`

### Files to Remove (after migration)
- [ ] Remove `lofty` and `id3` from Cargo.toml dependencies

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| FFmpeg build complexity on Windows | High | Use vcpkg or pre-built binaries |
| Larger binary size | Medium | Use FFmpeg static linking with minimal codecs |
| Threading issues | High | Use proper synchronization, consider `parking_lot` |
| Audio latency | Medium | Use ring buffers, optimize buffer sizes |
| Memory usage | Medium | Stream audio, don't load entire file |

---

## Alternative: Symphonia (Pure Rust)

If FFmpeg build complexity is too high, consider `symphonia` - a pure Rust audio decoding library:

```toml
[dependencies]
symphonia = { version = "0.5", features = ["all"] }
```

**Pros**:
- Pure Rust, no native dependencies
- Easy to build on all platforms
- Good format support

**Cons**:
- Not as comprehensive as FFmpeg
- No encoding support
- Less battle-tested

---

## Questions to Consider

1. **Do you need audio encoding/transcoding?** If yes, FFmpeg is required.
2. **How important is build simplicity?** Symphonia is easier, FFmpeg is more powerful.
3. **Do you need DRM/protected content support?** FFmpeg has better support.
4. **Is binary size a concern?** FFmpeg adds ~50-100MB, Symphonia adds ~5-10MB.
