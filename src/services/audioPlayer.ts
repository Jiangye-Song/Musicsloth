// Frontend audio player using Web Audio API
import { convertFileSrc } from '@tauri-apps/api/core';

interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  currentFile: string | null;
  duration: number;
  position: number;
  volume: number;
}

type StateChangeCallback = (state: PlayerState) => void;

class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private currentFile: string | null = null;
  private stateCallbacks: Set<StateChangeCallback> = new Set();
  private updateInterval: number | null = null;

  constructor() {
    // Create audio element
    this.audio = new Audio();
    this.audio.volume = 1.0;
    
    // Set up event listeners
    this.audio.addEventListener('play', () => this.notifyStateChange());
    this.audio.addEventListener('pause', () => this.notifyStateChange());
    this.audio.addEventListener('ended', () => this.notifyStateChange());
    this.audio.addEventListener('loadedmetadata', () => this.notifyStateChange());
    this.audio.addEventListener('timeupdate', () => this.notifyStateChange());
    this.audio.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      this.notifyStateChange();
    });
    
    // Update position every 100ms
    this.updateInterval = window.setInterval(() => {
      if (this.audio && !this.audio.paused) {
        this.notifyStateChange();
      }
    }, 100);
  }

  async play(filePath: string): Promise<void> {
    if (!this.audio) return;
    
    // Convert file path to URL that Tauri can serve
    const fileUrl = convertFileSrc(filePath);
    
    // If it's a new file, load it
    if (this.currentFile !== filePath) {
      this.audio.src = fileUrl;
      this.currentFile = filePath;
    }
    
    try {
      await this.audio.play();
    } catch (error) {
      console.error('Failed to play audio:', error);
      throw error;
    }
  }

  pause(): void {
    if (!this.audio) return;
    this.audio.pause();
  }

  resume(): void {
    if (!this.audio) return;
    this.audio.play();
  }

  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.currentFile = null;
    this.audio.src = '';
  }

  seek(positionMs: number): void {
    if (!this.audio) return;
    this.audio.currentTime = positionMs / 1000;
  }

  setVolume(volume: number): void {
    if (!this.audio) return;
    this.audio.volume = Math.max(0, Math.min(1, volume));
    this.notifyStateChange();
  }

  getState(): PlayerState {
    if (!this.audio) {
      return {
        isPlaying: false,
        isPaused: false,
        currentFile: null,
        duration: 0,
        position: 0,
        volume: 1.0,
      };
    }

    return {
      isPlaying: !this.audio.paused && !this.audio.ended,
      isPaused: this.audio.paused && this.audio.currentTime > 0,
      currentFile: this.currentFile,
      duration: (this.audio.duration || 0) * 1000, // Convert to ms
      position: (this.audio.currentTime || 0) * 1000, // Convert to ms
      volume: this.audio.volume,
    };
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.stateCallbacks.add(callback);
    // Return unsubscribe function
    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  private notifyStateChange(): void {
    const state = this.getState();
    this.stateCallbacks.forEach(callback => callback(state));
  }

  destroy(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.stateCallbacks.clear();
  }
}

// Singleton instance
export const audioPlayer = new AudioPlayer();
