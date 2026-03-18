// React hook for audio analysis data
// Provides real-time frequency and beat data for visualization

import { useState, useEffect, useRef } from "react";
import { audioAnalysis, AudioAnalysis } from "../services/audioAnalysis";

interface UseAudioAnalysisOptions {
  /**
   * Whether analysis should be active
   */
  enabled?: boolean;
  /**
   * Target frame rate for analysis updates (default 30)
   */
  frameRate?: number;
}

interface AudioAnalysisState {
  frequencyBands: number[];
  peakLevel: number;
  rmsLevel: number;
  beatDetected: boolean;
  beatIntensity: number;
  isActive: boolean;
}

/**
 * Hook for accessing real-time audio analysis data
 *
 * @param options Configuration options
 * @returns Current audio analysis state
 *
 * @example
 * ```tsx
 * function Visualizer() {
 *   const { frequencyBands, beatIntensity } = useAudioAnalysis({ enabled: true });
 *   // Use data to render visualization
 * }
 * ```
 */
export function useAudioAnalysis(
  options: UseAudioAnalysisOptions = {}
): AudioAnalysisState {
  const { enabled = true, frameRate = 30 } = options;

  const [state, setState] = useState<AudioAnalysisState>({
    frequencyBands: new Array(32).fill(0),
    peakLevel: 0,
    rmsLevel: 0,
    beatDetected: false,
    beatIntensity: 0,
    isActive: false,
  });

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      // If disabled, reset state and ensure service is disabled
      audioAnalysis.disable();
      setState((prev) => ({
        ...prev,
        frequencyBands: new Array(32).fill(0),
        peakLevel: 0,
        rmsLevel: 0,
        beatDetected: false,
        beatIntensity: 0,
        isActive: false,
      }));
      return;
    }

    // Enable analysis
    audioAnalysis.enable(frameRate);
    setState((prev) => ({ ...prev, isActive: true }));

    // Subscribe to updates
    const unsubscribe = audioAnalysis.subscribe((analysis: AudioAnalysis) => {
      if (!enabledRef.current) return;

      setState({
        frequencyBands: analysis.frequency_bands,
        peakLevel: analysis.peak_level,
        rmsLevel: analysis.rms_level,
        beatDetected: analysis.beat_detected,
        beatIntensity: analysis.beat_intensity,
        isActive: true,
      });
    });

    return () => {
      unsubscribe();
      audioAnalysis.disable();
    };
  }, [enabled, frameRate]);

  return state;
}

export default useAudioAnalysis;
