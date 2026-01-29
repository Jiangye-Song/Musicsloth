// Frontend audio player - uses Rust backend via Tauri IPC
// Symphonia decoding + cpal output in backend
import { invoke } from '@tauri-apps/api/core';

interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentFile: string | null;
  duration: number;
  position: number;
  volume: number;
}

// Backend response format (snake_case)
interface BackendPlayerState {
  is_playing: boolean;
  is_paused: boolean;
  current_file: string | null;
  position_ms: number;
  duration_ms: number;
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

// Singleton instance
export const audioPlayer = new AudioPlayer();
