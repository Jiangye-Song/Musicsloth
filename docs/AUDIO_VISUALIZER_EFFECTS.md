# Audio Visualizer & Beat Effects Implementation Plan

## Overview

This document outlines the implementation plan for adding audio visualization effects to Musicsloth:
1. **Waveform Visualizer** - A dynamic frequency visualization in the Now Playing tab (above the seekbar)
2. **Beat Pulse Effect** - A pulsing glow effect in the Now Playing bar that responds to beat detection

![Reference Visualizer](../public/visualizer-reference.png)

---

## Current Architecture Analysis

### Frontend (React + TypeScript + MUI)
- **NowPlayingView.tsx** - Full-screen now playing view with tabs (album art, lyrics, details)
- **PlayerControls.tsx** - Bottom now playing bar with controls, seekbar, and track info
- **audioPlayer.ts** - Frontend service that communicates with Rust backend via Tauri IPC
- **PlayerContext.tsx** - React context managing playback state

### Backend (Rust + Tauri)
- **audio/player.rs** - Main audio player with playback loop, handles decoding and output
- **audio/output.rs** - cpal-based audio output with ring buffer (`RING_BUFFER_SIZE: ~250ms`)
- **audio/decoder.rs** - Symphonia-based audio decoder
- Audio flows: File → Decoder → Resampler (if needed) → Ring Buffer → cpal Output Stream

### Key Observations
- No current mechanism to stream audio data to frontend for analysis
- Audio runs entirely in Rust backend - frontend only receives state (position, duration, playing status)
- Ring buffer size is ~250ms at 48kHz stereo (~24K samples)

---

## Implementation Strategy

### Option A: Backend Analysis + Event Streaming (Recommended)
Perform audio analysis in Rust and stream results to frontend via Tauri events.

**Pros:**
- More efficient - analysis happens close to audio data
- Lower latency between audio and visual
- No need to duplicate audio stream
- Can use optimized Rust FFT libraries

**Cons:**
- More complex Rust code
- Need to balance analysis frequency vs performance

### Option B: Dual Audio Stream (Web Audio API)
Create a secondary audio stream to Web Audio API for frontend analysis.

**Pros:**
- Native Web Audio API AnalyserNode
- Familiar web development patterns

**Cons:**
- Audio sync issues between Rust playback and Web Audio
- Higher memory usage (duplicate audio data)
- More complex architecture

### Decision: **Option A** - Backend Analysis with Event Streaming

---

## Implementation Plan

### Phase 1: Backend Audio Analysis Infrastructure

#### 1.1 Add FFT Analysis Module
Create new Rust module for real-time audio analysis.

**File: `src-tauri/src/audio/analyzer.rs`**
```rust
use rustfft::{FftPlanner, num_complex::Complex};
use std::sync::Arc;
use parking_lot::Mutex;

pub const FFT_SIZE: usize = 2048;  // ~42ms at 48kHz
pub const NUM_BANDS: usize = 32;    // Frequency bands for visualization

#[derive(Clone, Debug, serde::Serialize)]
pub struct AudioAnalysis {
    pub frequency_bands: Vec<f32>,  // 0.0 to 1.0 normalized
    pub peak_level: f32,            // Current peak amplitude
    pub rms_level: f32,             // RMS level (loudness)
    pub beat_detected: bool,        // Beat detection flag
    pub beat_intensity: f32,        // 0.0 to 1.0 beat strength
}

pub struct AudioAnalyzer {
    fft_planner: FftPlanner<f32>,
    sample_buffer: Vec<f32>,
    window: Vec<f32>,  // Hann window
    beat_threshold: f32,
    last_energy: f32,
}
```

#### 1.2 Integrate Analyzer into Audio Pipeline
Modify `audio/player.rs` playback loop to feed samples to analyzer.

```rust
// In playback_loop, after resampling:
let analysis = analyzer.analyze(&output_samples);
if let Some(app_handle) = &app_handle {
    app_handle.emit("audio-analysis", analysis).ok();
}
```

#### 1.3 Add Tauri Event Commands
**File: `src-tauri/src/commands.rs`**
```rust
#[tauri::command]
pub fn enable_audio_analysis(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    state.player.set_analysis_enabled(enabled);
    Ok(())
}
```

#### 1.4 Dependencies
Add to `Cargo.toml`:
```toml
rustfft = "6.1"
```

---

### Phase 2: Beat Detection Algorithm

#### 2.1 Energy-Based Beat Detection
Implement beat detection using energy flux analysis:

```rust
impl AudioAnalyzer {
    pub fn detect_beat(&mut self, samples: &[f32]) -> (bool, f32) {
        // Calculate current frame energy
        let energy: f32 = samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32;
        
        // Compare with historical average (energy flux)
        let energy_ratio = energy / (self.last_energy + 0.0001);
        
        // Adaptive threshold
        let is_beat = energy_ratio > self.beat_threshold;
        let intensity = ((energy_ratio - 1.0) / 2.0).clamp(0.0, 1.0);
        
        // Update history with decay
        self.last_energy = self.last_energy * 0.95 + energy * 0.05;
        
        (is_beat, intensity)
    }
}
```

#### 2.2 Frequency-Weighted Detection
Enhance beat detection by weighting bass frequencies (20-200Hz):

```rust
// Weight the low frequency bands more heavily for beat detection
let bass_energy: f32 = frequency_bands[0..4]
    .iter()
    .enumerate()
    .map(|(i, &v)| v * (4.0 - i as f32))
    .sum();
```

---

### Phase 3: Frontend Audio Analysis Service

#### 3.1 Create Analysis Service
**File: `src/services/audioAnalysis.ts`**
```typescript
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface AudioAnalysis {
  frequency_bands: number[];  // 32 bands, 0-1 normalized
  peak_level: number;
  rms_level: number;
  beat_detected: boolean;
  beat_intensity: number;
}

type AnalysisCallback = (analysis: AudioAnalysis) => void;

class AudioAnalysisService {
  private listeners: Set<AnalysisCallback> = new Set();
  private unlistenFn: UnlistenFn | null = null;
  private enabled: boolean = false;

  async enable(): Promise<void> {
    if (this.enabled) return;
    
    await invoke("enable_audio_analysis", { enabled: true });
    this.unlistenFn = await listen<AudioAnalysis>("audio-analysis", (event) => {
      this.listeners.forEach(cb => cb(event.payload));
    });
    this.enabled = true;
  }

  async disable(): Promise<void> {
    if (!this.enabled) return;
    
    await invoke("enable_audio_analysis", { enabled: false });
    this.unlistenFn?.();
    this.unlistenFn = null;
    this.enabled = false;
  }

  subscribe(callback: AnalysisCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}

export const audioAnalysis = new AudioAnalysisService();
```

#### 3.2 Create React Hook
**File: `src/hooks/useAudioAnalysis.ts`**
```typescript
import { useState, useEffect, useRef } from "react";
import { audioAnalysis } from "../services/audioAnalysis";

interface AudioAnalysisState {
  frequencyBands: number[];
  peakLevel: number;
  rmsLevel: number;
  beatDetected: boolean;
  beatIntensity: number;
}

export function useAudioAnalysis(enabled: boolean = true): AudioAnalysisState {
  const [state, setState] = useState<AudioAnalysisState>({
    frequencyBands: new Array(32).fill(0),
    peakLevel: 0,
    rmsLevel: 0,
    beatDetected: false,
    beatIntensity: 0,
  });

  useEffect(() => {
    if (!enabled) return;

    audioAnalysis.enable();
    
    const unsubscribe = audioAnalysis.subscribe((analysis) => {
      setState({
        frequencyBands: analysis.frequency_bands,
        peakLevel: analysis.peak_level,
        rmsLevel: analysis.rms_level,
        beatDetected: analysis.beat_detected,
        beatIntensity: analysis.beat_intensity,
      });
    });

    return () => {
      unsubscribe();
      audioAnalysis.disable();
    };
  }, [enabled]);

  return state;
}
```

---

### Phase 4: Visualizer Component

#### 4.1 Audio Visualizer Component
**File: `src/components/AudioVisualizer.tsx`**

Create a wave/frequency visualizer similar to the reference image:

```typescript
import { useRef, useEffect, useMemo } from "react";
import { Box } from "@mui/material";
import { useAudioAnalysis } from "../hooks/useAudioAnalysis";

interface AudioVisualizerProps {
  width?: number | string;
  height?: number;
  barCount?: number;
  colorPrimary?: string;
  colorSecondary?: string;
  smoothing?: number;
}

export default function AudioVisualizer({
  width = "100%",
  height = 80,
  barCount = 48,
  colorPrimary = "#E040FB",   // Purple/pink
  colorSecondary = "#F44336", // Red
  smoothing = 0.8,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { frequencyBands, rmsLevel } = useAudioAnalysis();
  const smoothedBands = useRef<number[]>(new Array(barCount).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Interpolate frequency bands to bar count
    const interpolated = interpolateBands(frequencyBands, barCount);
    
    // Apply smoothing (decay)
    smoothedBands.current = smoothedBands.current.map((prev, i) =>
      Math.max(interpolated[i], prev * smoothing)
    );

    // Render
    renderVisualizer(ctx, canvas.width, canvas.height, smoothedBands.current, {
      colorPrimary,
      colorSecondary,
      rmsLevel,
    });
  }, [frequencyBands, rmsLevel]);

  return (
    <Box sx={{ width, height, position: "relative" }}>
      <canvas
        ref={canvasRef}
        width={typeof width === "number" ? width : 400}
        height={height}
        style={{ width: "100%", height: "100%" }}
      />
    </Box>
  );
}

function renderVisualizer(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bands: number[],
  options: { colorPrimary: string; colorSecondary: string; rmsLevel: number }
) {
  const { colorPrimary, colorSecondary, rmsLevel } = options;
  
  ctx.clearRect(0, 0, width, height);
  
  const centerY = height / 2;
  const barCount = bands.length;
  const barWidth = width / barCount;
  const maxBarHeight = (height / 2) * 0.9;
  
  // Create gradient
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, colorSecondary);
  gradient.addColorStop(0.3, colorPrimary);
  gradient.addColorStop(0.5, colorPrimary);
  gradient.addColorStop(0.7, colorPrimary);
  gradient.addColorStop(1, colorSecondary);

  // Draw mirrored waveform bars
  bands.forEach((value, i) => {
    const barHeight = value * maxBarHeight;
    const x = i * barWidth;
    
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.6 + value * 0.4;
    
    // Upper half
    ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight);
    // Lower half (mirrored)
    ctx.fillRect(x, centerY, barWidth - 1, barHeight);
  });
  
  ctx.globalAlpha = 1;
}

function interpolateBands(source: number[], targetCount: number): number[] {
  const result: number[] = [];
  const ratio = source.length / targetCount;
  
  for (let i = 0; i < targetCount; i++) {
    const srcIndex = i * ratio;
    const low = Math.floor(srcIndex);
    const high = Math.min(low + 1, source.length - 1);
    const t = srcIndex - low;
    result.push(source[low] * (1 - t) + source[high] * t);
  }
  
  return result;
}
```

#### 4.2 Integrate into NowPlayingView
Modify `src/views/NowPlayingView.tsx`:

```typescript
import AudioVisualizer from "../components/AudioVisualizer";

// In renderControls(), above the seekbar:
const renderControls = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2, px: isNarrow ? 2 : 0 }}>
    {/* Audio Visualizer */}
    <AudioVisualizer 
      height={60} 
      colorPrimary={theme.palette.primary.main}
      colorSecondary={theme.palette.secondary.main}
    />
    
    {/* Time and Seekbar */}
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      {/* ... existing seekbar code ... */}
    </Box>
    {/* ... rest of controls ... */}
  </Box>
);
```

---

### Phase 5: Beat Pulse Effect

#### 5.1 Create Beat Pulse Component
**File: `src/components/BeatPulse.tsx`**

```typescript
import { Box } from "@mui/material";
import { useAudioAnalysis } from "../hooks/useAudioAnalysis";
import { useTheme } from "@mui/material/styles";

interface BeatPulseProps {
  children: React.ReactNode;
}

export default function BeatPulse({ children }: BeatPulseProps) {
  const theme = useTheme();
  const { beatIntensity, rmsLevel } = useAudioAnalysis();
  
  // Combine beat intensity with RMS for smoother visual
  const glowIntensity = Math.max(beatIntensity * 0.7, rmsLevel * 0.3);
  const glowColor = theme.palette.primary.main;
  
  return (
    <Box
      sx={{
        position: "relative",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(180deg, 
            ${glowColor}${Math.round(glowIntensity * 40).toString(16).padStart(2, '0')} 0%, 
            transparent 100%)`,
          opacity: glowIntensity,
          transition: "opacity 0.05s ease-out",
          pointerEvents: "none",
        },
      }}
    >
      {children}
    </Box>
  );
}
```

#### 5.2 Alternative: CSS Animation Approach
For smoother performance, use CSS variables and animations:

```typescript
import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { useAudioAnalysis } from "../hooks/useAudioAnalysis";

export default function BeatPulse({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { beatIntensity } = useAudioAnalysis();

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.style.setProperty("--beat-intensity", String(beatIntensity));
    }
  }, [beatIntensity]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: "relative",
        "--beat-intensity": 0,
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(224, 64, 251, calc(var(--beat-intensity) * 0.3)) 0%, transparent 100%)",
          pointerEvents: "none",
          transition: "background 0.08s ease-out",
        },
      }}
    >
      {children}
    </Box>
  );
}
```

#### 5.3 Integrate into PlayerControls
Wrap the now playing bar content with BeatPulse:

```typescript
// In PlayerControls.tsx
import BeatPulse from "./BeatPulse";

export default function PlayerControls({ onExpandClick, onQueueClick }: PlayerControlsProps) {
  // ... existing code ...

  return (
    <BeatPulse>
      <Box sx={{ display: "flex", alignItems: "stretch", gap: 0, pr: isMobile ? 0 : 2, height: "80px" }}>
        {/* ... existing content ... */}
      </Box>
    </BeatPulse>
  );
}
```

---

### Phase 6: Performance Optimizations

#### 6.1 Analysis Rate Limiting
- Backend: Emit analysis events at 30-60 FPS max (~16-33ms intervals)
- Frontend: Use `requestAnimationFrame` for rendering
- Skip analysis when app is in background

#### 6.2 Canvas Optimization
```typescript
// Use OffscreenCanvas if available
const canvas = document.createElement("canvas");
const offscreen = canvas.transferControlToOffscreen?.();

// Or use requestAnimationFrame batching
const rafRef = useRef<number>();

useEffect(() => {
  const animate = () => {
    renderVisualizer(/* ... */);
    rafRef.current = requestAnimationFrame(animate);
  };
  rafRef.current = requestAnimationFrame(animate);
  
  return () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };
}, []);
```

#### 6.3 Conditional Activation
Only enable analysis when visualization is visible:

```typescript
// In NowPlayingView or PlayerControls
const isVisualizerVisible = showNowPlaying && activeTab === "albumart";
const { frequencyBands } = useAudioAnalysis(isVisualizerVisible);
```

---

## File Structure Summary

```
src/
├── components/
│   ├── AudioVisualizer.tsx      # New - Frequency visualizer
│   └── BeatPulse.tsx            # New - Pulse effect wrapper
├── hooks/
│   └── useAudioAnalysis.ts      # New - Audio analysis hook
├── services/
│   └── audioAnalysis.ts         # New - Analysis service
└── views/
    └── NowPlayingView.tsx       # Modified - Add visualizer

src-tauri/src/
├── audio/
│   ├── analyzer.rs              # New - FFT analysis
│   ├── mod.rs                   # Modified - Add analyzer module
│   └── player.rs                # Modified - Integrate analysis
├── commands.rs                   # Modified - Add analysis commands
└── lib.rs                       # Modified - Register commands
```

---

## Dependencies

### Rust (Cargo.toml)
```toml
rustfft = "6.1"     # FFT analysis
```

### Frontend (package.json)
No new dependencies required - uses native Canvas API.

---

## Implementation Order

1. **Week 1: Backend Analysis**
   - [ ] Create `analyzer.rs` with FFT and beat detection
   - [ ] Integrate analyzer into `player.rs` playback loop
   - [ ] Add Tauri event emission for analysis data
   - [ ] Add enable/disable commands

2. **Week 2: Frontend Services**
   - [ ] Create `audioAnalysis.ts` service
   - [ ] Create `useAudioAnalysis` hook
   - [ ] Test event reception and state updates

3. **Week 3: Visualizer Component**
   - [ ] Create `AudioVisualizer.tsx` with canvas rendering
   - [ ] Implement frequency band interpolation and smoothing
   - [ ] Add to NowPlayingView above seekbar
   - [ ] Style with gradient matching reference image

4. **Week 4: Beat Pulse Effect**
   - [ ] Create `BeatPulse.tsx` component
   - [ ] Integrate into PlayerControls
   - [ ] Fine-tune timing and visual appearance

5. **Week 5: Polish & Optimization**
   - [ ] Performance testing and optimization
   - [ ] Add settings to enable/disable visualizations
   - [ ] Add color customization options
   - [ ] Documentation updates

---

## Settings Integration

Add to `src/services/settings.ts` and `OptionsView.tsx`:

```typescript
interface VisualizerSettings {
  enabled: boolean;
  visualizerType: "bars" | "wave" | "circle";
  beatPulseEnabled: boolean;
  sensitivity: number;  // 0-100
  colorScheme: "theme" | "custom";
  customColors?: {
    primary: string;
    secondary: string;
  };
}
```

---

## Future Enhancements

1. **Multiple visualizer styles** - Bars, circular, waveform
2. **Audio reactive background** - Subtle background color shifts
3. **Album art pulse** - Make album art subtly pulse with beat
4. **Spectrum peak meters** - Add peak indicators to visualizer
5. **3D visualizations** - WebGL-based 3D effects
