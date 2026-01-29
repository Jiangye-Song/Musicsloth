// SMTC (System Media Transport Controls) service for Windows
// Communicates with the Rust backend to update Windows media controls

import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface SmtcMetadata {
  title: string;
  artist?: string;
  album?: string;
  artworkPath?: string;
}

type SmtcButtonCallback = () => void;

interface SmtcCallbacks {
  onPlay?: SmtcButtonCallback;
  onPause?: SmtcButtonCallback;
  onStop?: SmtcButtonCallback;
  onNext?: SmtcButtonCallback;
  onPrevious?: SmtcButtonCallback;
}

class SmtcService {
  private unlisteners: UnlistenFn[] = [];
  private callbacks: SmtcCallbacks = {};
  private initialized = false;

  /**
   * Initialize SMTC event listeners
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Listen for SMTC button events from backend
      const unlistenPlay = await listen('smtc-play', () => {
        console.log('[SMTC] Play button pressed');
        this.callbacks.onPlay?.();
      });
      this.unlisteners.push(unlistenPlay);

      const unlistenPause = await listen('smtc-pause', () => {
        console.log('[SMTC] Pause button pressed');
        this.callbacks.onPause?.();
      });
      this.unlisteners.push(unlistenPause);

      const unlistenStop = await listen('smtc-stop', () => {
        console.log('[SMTC] Stop button pressed');
        this.callbacks.onStop?.();
      });
      this.unlisteners.push(unlistenStop);

      const unlistenNext = await listen('smtc-next', () => {
        console.log('[SMTC] Next button pressed');
        this.callbacks.onNext?.();
      });
      this.unlisteners.push(unlistenNext);

      const unlistenPrevious = await listen('smtc-previous', () => {
        console.log('[SMTC] Previous button pressed');
        this.callbacks.onPrevious?.();
      });
      this.unlisteners.push(unlistenPrevious);

      this.initialized = true;
      console.log('[SMTC] Service initialized');
    } catch (error) {
      console.error('[SMTC] Failed to initialize:', error);
    }
  }

  /**
   * Set callbacks for SMTC button events
   */
  setCallbacks(callbacks: SmtcCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Update SMTC metadata (title, artist, album, artwork)
   */
  async updateMetadata(metadata: SmtcMetadata): Promise<void> {
    try {
      await invoke('smtc_update_metadata', {
        title: metadata.title,
        artist: metadata.artist || null,
        album: metadata.album || null,
        artworkPath: metadata.artworkPath || null,
      });
      console.log('[SMTC] Metadata updated:', metadata.title);
    } catch (error) {
      console.error('[SMTC] Failed to update metadata:', error);
    }
  }

  /**
   * Set playback status (playing or paused)
   */
  async setPlaybackStatus(isPlaying: boolean): Promise<void> {
    try {
      await invoke('smtc_set_playback_status', { isPlaying });
    } catch (error) {
      console.error('[SMTC] Failed to set playback status:', error);
    }
  }

  /**
   * Set timeline position (for seek bar in media overlay)
   */
  async setTimeline(positionMs: number, durationMs: number): Promise<void> {
    try {
      await invoke('smtc_set_timeline', { positionMs, durationMs });
    } catch (error) {
      console.error('[SMTC] Failed to set timeline:', error);
    }
  }

  /**
   * Get temp artwork path for a file (saves to cache)
   */
  async getArtworkTempPath(filePath: string): Promise<string | null> {
    try {
      return await invoke<string | null>('get_artwork_temp_path', { filePath });
    } catch (error) {
      console.error('[SMTC] Failed to get artwork temp path:', error);
      return null;
    }
  }

  /**
   * Cleanup listeners
   */
  destroy(): void {
    this.unlisteners.forEach(unlisten => unlisten());
    this.unlisteners = [];
    this.initialized = false;
    console.log('[SMTC] Service destroyed');
  }
}

// Singleton instance
export const smtcService = new SmtcService();
