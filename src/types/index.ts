// TypeScript type definitions

export interface Track {
  id: number;
  file_path: string;
  title: string;
  artist?: string;
  album?: string;
  duration_ms?: number;
  /** ReplayGain normalization gain in dB (EBU R128 standard).
   * Positive = track needs boost, Negative = track needs reduction.
   * Target loudness is -14 LUFS. */
  normalization_gain_db?: number;
}

export interface Album {
  id: number;
  name: string;
  artist?: string;
  year?: number;
}

export interface Artist {
  id: number;
  name: string;
}

export interface Playlist {
  id: number;
  name: string;
  description?: string;
}

export interface Queue {
  id: number;
  name: string;
  is_active: boolean;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrack?: Track;
  volume: number;
  progress: number;
  duration: number;
}

export interface BackendPlayerState {
  is_playing: boolean;
  is_paused: boolean;
  current_file?: string;
  position_ms: number;
  duration_ms: number;
  volume: number;
  volume_db: number;
  normalization_enabled: boolean;
  track_gain_db: number;
}

export interface LoudnessAnalysisProgress {
  current: number;
  total: number;
  current_file: string;
  analyzed: number;
  failed: number;
}
