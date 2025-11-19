// API service for Tauri commands
import { invoke } from "@tauri-apps/api/core";

export interface PlayerState {
  is_playing: boolean;
  is_paused: boolean;
  current_file: string | null;
}

export const playerApi = {
  playFile: async (filePath: string): Promise<void> => {
    return await invoke("play_file", { filePath });
  },

  pause: async (): Promise<void> => {
    return await invoke("pause_playback");
  },

  resume: async (): Promise<void> => {
    return await invoke("resume_playback");
  },

  stop: async (): Promise<void> => {
    return await invoke("stop_playback");
  },

  setVolume: async (volume: number): Promise<void> => {
    return await invoke("set_volume", { volume });
  },

  getState: async (): Promise<PlayerState> => {
    return await invoke("get_player_state");
  },
};

export interface Track {
  id: number;
  file_path: string;
  title: string;
  artist: string | null;
  album: string | null;
  album_artist: string | null;
  year: number | null;
  track_number: number | null;
  disc_number: number | null;
  duration_ms: number | null;
  genre: string | null;
  file_size: number | null;
  file_format: string | null;
  bitrate: number | null;
  sample_rate: number | null;
  play_count: number;
  last_played: number | null;
  date_added: number;
  date_modified: number;
}

export interface Album {
  id: number;
  name: string;
  artist: string | null;
  year: number | null;
  song_count: number;
}

export interface Artist {
  id: number;
  name: string;
  song_count: number;
}

export interface Genre {
  id: number;
  name: string;
  song_count: number;
}

export interface IndexingResult {
  total_files: number;
  successful: number;
  failed: number;
  errors: string[];
}

export const libraryApi = {
  scanLibrary: async (directory: string): Promise<IndexingResult> => {
    return await invoke("scan_library", { directory });
  },

  getAllTracks: async (): Promise<Track[]> => {
    return await invoke("get_all_tracks");
  },

  getAllAlbums: async (): Promise<Album[]> => {
    return await invoke("get_all_albums");
  },

  getAllArtists: async (): Promise<Artist[]> => {
    return await invoke("get_all_artists");
  },

  getAllGenres: async (): Promise<Genre[]> => {
    return await invoke("get_all_genres");
  },

  getTracksByArtist: async (artistId: number): Promise<Track[]> => {
    return await invoke("get_tracks_by_artist", { artistId });
  },

  getTracksByGenre: async (genreId: number): Promise<Track[]> => {
    return await invoke("get_tracks_by_genre", { genreId });
  },

  getTracksByAlbum: async (albumName: string): Promise<Track[]> => {
    return await invoke("get_tracks_by_album", { albumName });
  },

  clearLibrary: async (): Promise<void> => {
    return await invoke("clear_library");
  },

  getCurrentTrack: async (): Promise<Track | null> => {
    return await invoke("get_current_track");
  },

  getAlbumArt: async (filePath: string): Promise<number[] | null> => {
    return await invoke("get_album_art", { filePath });
  },
};

export const fileApi = {
  openFile: async (): Promise<string | null> => {
    // TODO: Use Tauri's file dialog
    // For now, this is a placeholder
    return null;
  },
};
