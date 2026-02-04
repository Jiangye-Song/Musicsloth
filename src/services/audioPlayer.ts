// Frontend audio player - uses Rust backend via Tauri IPC
// Symphonia decoding + cpal output in backend
import { invoke } from '@tauri-apps/api/core';

interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentFile: string | null;
  duration: number;
  position: number;
  volume: number;     // Linear gain 0.0-1.0
  volumeDb: number;   // Volume in dB (-60 to 0)
}

// Backend response format (snake_case)
interface BackendPlayerState {
  is_playing: boolean;
  is_paused: boolean;
  current_file: string | null;
  position_ms: number;
  duration_ms: number;
  volume: number;
  volume_db: number;
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
      const backendState = await invoke<BackendPlayerState>('player_get_state');

      const state: PlayerState = {
        isPlaying: backendState.is_playing && !backendState.is_paused,
        isPaused: backendState.is_paused,
        currentFile: backendState.current_file,
        duration: backendState.duration_ms,
        position: backendState.position_ms,
        volume: backendState.volume,
        volumeDb: backendState.volume_db,
      };

      // Always check if track ended - don't rely on state transitions
      // This is more robust against race conditions
      const trackEnded = await invoke<boolean>('player_has_track_ended');
      if (trackEnded) {
        console.log('[AudioPlayer] Track ended signal received');
        this.notifyTrackEnded();
      }
      
      this.lastState = state;
      this.notifyStateChange(state);
      
      // Update Media Session position state for Windows SMTC seekbar sync
      this.updateMediaSessionPosition(state);
    } catch (error) {
      console.error('Failed to poll player state:', error);
    }
  }

  private updateMediaSessionPosition(state: PlayerState): void {
    if ("mediaSession" in navigator) {
      try {
        const duration = state.duration / 1000; // Convert ms to seconds
        const position = state.position / 1000;
        
        // Only update if we have valid duration
        if (duration && !isNaN(duration) && duration > 0) {
          navigator.mediaSession.setPositionState({
            duration: duration,
            playbackRate: 1,
            position: Math.min(position, duration),
          });
        }
      } catch (e) {
        // Ignore errors - some browsers don't support setPositionState
      }
    }
  }

  async play(filePath: string): Promise<void> {
    try {
      await invoke('player_play', { filePath });
    } catch (error) {
      console.error('Failed to play audio:', error);
      throw error;
    }
  }

  pause(): void {
    invoke('player_pause').catch(e => console.error('Failed to pause:', e));
  }

  resume(): void {
    invoke('player_resume').catch(e => console.error('Failed to resume:', e));
  }

  stop(): void {
    invoke('player_stop').catch(e => console.error('Failed to stop:', e));
  }

  seek(positionMs: number): void {
    invoke('player_seek', { positionMs: Math.floor(positionMs) })
      .catch(e => console.error('Failed to seek:', e));
  }

  setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    invoke('player_set_volume', { volume: this.currentVolume })
      .catch(e => console.error('Failed to set volume:', e));
  }

  /**
   * Set volume in decibels (-60 to +15)
   * -60 dB = essentially mute
   * 0 dB = unity gain (no boost/cut)
   * +15 dB = maximum boost (~5.6x)
   */
  setVolumeDb(db: number): void {
    const dbClamped = Math.max(-60, Math.min(15, db));
    invoke('player_set_volume_db', { db: dbClamped })
      .catch(e => console.error('Failed to set volume:', e));
  }

  /**
   * Convert slider position (0-100) to dB
   * 0% = -∞ (mute, represented as -60dB)
   * 80% = 0dB (unity gain)
   * 100% = +15dB (max boost)
   * Uses logarithmic curve below 80% for natural volume feel
   */
  static sliderToDb(slider: number): number {
    if (slider <= 0) return -60; // Mute
    if (slider >= 100) return 15; // Max boost
    
    if (slider < 80) {
      // 0-80% maps to -60dB to 0dB with logarithmic curve
      // Use quadratic for more control at low volumes
      const normalized = slider / 80; // 0 to 1
      return -60 * Math.pow(1 - normalized, 2);
    } else {
      // 80-100% maps linearly to 0dB to +15dB
      const normalized = (slider - 80) / 20; // 0 to 1
      return normalized * 15;
    }
  }

  /**
   * Convert dB to slider position (0-100)
   * -60dB = 0%, 0dB = 80%, +15dB = 100%
   */
  static dbToSlider(db: number): number {
    if (db <= -60) return 0;
    if (db >= 15) return 100;
    
    if (db <= 0) {
      // -60dB to 0dB maps to 0-80% with inverse of logarithmic curve
      // db = -60 * (1 - normalized)^2
      // (1 - normalized)^2 = -db / 60
      // normalized = 1 - sqrt(-db / 60)
      const normalized = 1 - Math.sqrt(-db / 60);
      return normalized * 80;
    } else {
      // 0dB to +15dB maps to 80-100%
      const normalized = db / 15; // 0 to 1
      return 80 + normalized * 20;
    }
  }

  /**
   * Get the default slider position (80% = 0dB unity gain)
   */
  static getDefaultSliderPosition(): number {
    return 80;
  }

  getState(): PlayerState {
    return this.lastState || {
      isPlaying: false,
      isPaused: false,
      currentFile: null,
      duration: 0,
      position: 0,
      volume: this.currentVolume,
      volumeDb: -60,
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

// Export class for static method access
export { AudioPlayer };

// Singleton instance
export const audioPlayer = new AudioPlayer();
