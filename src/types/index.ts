// TypeScript type definitions

export interface Track {
  id: number;
  file_path: string;
  title: string;
  artist?: string;
  album?: string;
  duration_ms?: number;
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
