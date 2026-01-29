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
  private wasPlaying: boolean = false;

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

      // Detect track ended: was playing, now not playing and not paused
      if (this.wasPlaying && !state.isPlaying && !state.isPaused) {
        // Check if backend signals track ended
        const trackEnded = await invoke<boolean>('player_has_track_ended');
        if (trackEnded) {
          this.notifyTrackEnded();
        }
      }
      
      this.wasPlaying = state.isPlaying;
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
   * Set volume in decibels (-60 to 0)
   * -60 dB = essentially mute
   * 0 dB = full volume
   */
  setVolumeDb(db: number): void {
    const dbClamped = Math.max(-60, Math.min(0, db));
    invoke('player_set_volume_db', { db: dbClamped })
      .catch(e => console.error('Failed to set volume:', e));
  }

  /**
   * Convert slider position (0-100) to dB using logarithmic curve
   * This gives a more natural volume feel
   */
  static sliderToDb(slider: number): number {
    if (slider <= 0) return -60;
    if (slider >= 100) return 0;
    // Logarithmic curve: slider 0-100 maps to -60dB to 0dB
    // Using a curve that feels natural for audio
    return (slider / 100) * 60 - 60;
  }

  /**
   * Convert dB to slider position (0-100)
   */
  static dbToSlider(db: number): number {
    if (db <= -60) return 0;
    if (db >= 0) return 100;
    return ((db + 60) / 60) * 100;
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
