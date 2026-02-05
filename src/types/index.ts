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

// ============================================================================
// Settings Types
// ============================================================================

export interface TabConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface LanguageSettings {
  language: string; // Currently only "en" supported
}

export interface ThemeSettings {
  mode: "dark" | "light";
  accent_color: string; // Hex color code e.g. "#4CAF50"
  font_family: string;
}

export interface InterfaceSettings {
  theme: ThemeSettings;
  tabs: TabConfig[];
  quick_actions: string[]; // Placeholder for future quick actions
}

export interface FadeSettings {
  enabled: boolean;
  fade_in_ms: number;  // 0-2000ms
  fade_out_ms: number; // 0-2000ms
}

export interface ReplayGainSettings {
  enabled: boolean;
  calculate_unanalyzed: boolean;
  analyze_on_scan: boolean;
  segments_per_minute: number; // 1-60
}

export interface PlaybackSettings {
  gapless: boolean;
  fade: FadeSettings;
  equalizer_enabled: boolean;
  equalizer_preset: string;
  replay_gain: ReplayGainSettings;
}

export interface AppSettings {
  version: number;
  language: LanguageSettings;
  interface: InterfaceSettings;
  playback: PlaybackSettings;
}

export const defaultSettings: AppSettings = {
  version: 1,
  language: {
    language: "en",
  },
  interface: {
    theme: {
      mode: "dark",
      accent_color: "#4CAF50",
      font_family: "system-ui",
    },
    tabs: [
      { id: "queues", label: "Queues", visible: true, order: 0 },
      { id: "library", label: "Library", visible: true, order: 1 },
      { id: "playlists", label: "Playlists", visible: true, order: 2 },
      { id: "artists", label: "Artists", visible: true, order: 3 },
      { id: "albums", label: "Albums", visible: true, order: 4 },
      { id: "genres", label: "Genres", visible: true, order: 5 },
    ],
    quick_actions: [],
  },
  playback: {
    gapless: false,
    fade: {
      enabled: false,
      fade_in_ms: 0,
      fade_out_ms: 0,
    },
    equalizer_enabled: false,
    equalizer_preset: "flat",
    replay_gain: {
      enabled: true,
      calculate_unanalyzed: true,
      analyze_on_scan: true,
      segments_per_minute: 10,
    },
  },
};
