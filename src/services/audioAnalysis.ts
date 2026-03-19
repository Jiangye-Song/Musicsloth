// Audio analysis service for visualization
// Polls the backend for FFT and beat data

import { invoke } from "@tauri-apps/api/core";

export interface AudioAnalysis {
  frequency_bands: number[]; // 32 bands, 0-1 normalized
  peak_level: number; // 0.0 to 1.0
  rms_level: number; // 0.0 to 1.0
  beat_detected: boolean;
  beat_intensity: number; // 0.0 to 1.0
}

type AnalysisCallback = (analysis: AudioAnalysis) => void;

class AudioAnalysisService {
  private listeners: Set<AnalysisCallback> = new Set();
  private pollInterval: number | null = null;
  private enabled: boolean = false;
  private enabling: boolean = false; // Prevent double initialization
  private refCount: number = 0; // Track how many consumers are using the service
  private lastAnalysis: AudioAnalysis = {
    frequency_bands: new Array(32).fill(0),
    peak_level: 0,
    rms_level: 0,
    beat_detected: false,
    beat_intensity: 0,
  };

  /**
   * Enable audio analysis and start polling
   * Uses reference counting to support multiple consumers
   * @param frameRate Target frames per second (default 30)
   */
  async enable(frameRate: number = 30): Promise<void> {
    this.refCount++;
    
    // Already enabled or currently enabling
    if (this.enabled || this.enabling) return;
    
    this.enabling = true;

    try {
      await invoke("enable_audio_analysis", { enabled: true });
      this.enabled = true;
      console.log("[AudioAnalysis] Enabled, starting polling at", frameRate, "fps");

      // Start polling at the specified frame rate
      const intervalMs = Math.floor(1000 / frameRate);
      this.pollInterval = window.setInterval(() => {
        this.poll();
      }, intervalMs);
    } catch (error) {
      console.error("[AudioAnalysis] Failed to enable:", error);
      this.refCount--;
      throw error;
    } finally {
      this.enabling = false;
    }
  }

  /**
   * Disable audio analysis and stop polling
   * Only actually disables when all consumers have called disable
   */
  async disable(): Promise<void> {
    this.refCount = Math.max(0, this.refCount - 1);
    
    // Only disable if no more consumers
    if (this.refCount > 0 || !this.enabled) return;

    try {
      console.log("[AudioAnalysis] All consumers disabled, stopping");
      
      if (this.pollInterval !== null) {
        window.clearInterval(this.pollInterval);
        this.pollInterval = null;
      }

      await invoke("enable_audio_analysis", { enabled: false });
      this.enabled = false;

      // Reset to default state
      this.lastAnalysis = {
        frequency_bands: new Array(32).fill(0),
        peak_level: 0,
        rms_level: 0,
        beat_detected: false,
        beat_intensity: 0,
      };

      // Notify listeners with empty state
      this.notifyListeners(this.lastAnalysis);
    } catch (error) {
      console.error("[AudioAnalysis] Failed to disable:", error);
    }
  }

  /**
   * Check if analysis is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Subscribe to analysis updates
   * @returns Unsubscribe function
   */
  subscribe(callback: AnalysisCallback): () => void {
    this.listeners.add(callback);
    // Immediately call with last known state
    callback(this.lastAnalysis);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get the last analysis data (without subscribing)
   */
  getLastAnalysis(): AudioAnalysis {
    return this.lastAnalysis;
  }

  private pollCount = 0;
  
  private async poll(): Promise<void> {
    try {
      const analysis = await invoke<AudioAnalysis | null>("get_audio_analysis");
      if (analysis) {
        this.lastAnalysis = analysis;
        this.notifyListeners(analysis);
        
        // Log occasionally to show it's working
        this.pollCount++;
        if (this.pollCount % 60 === 0) {
          const maxBand = Math.max(...analysis.frequency_bands);
          console.log("[AudioAnalysis] Data received, max band:", maxBand.toFixed(3), "rms:", analysis.rms_level.toFixed(3));
        }
      }
    } catch (error) {
      console.error("[AudioAnalysis] Poll error:", error);
    }
  }

  private notifyListeners(analysis: AudioAnalysis): void {
    this.listeners.forEach((callback) => {
      try {
        callback(analysis);
      } catch (e) {
        console.error("[AudioAnalysis] Listener error:", e);
      }
    });
  }
}

// Export singleton instance
export const audioAnalysis = new AudioAnalysisService();
