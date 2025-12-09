// API service for Tauri commands
import { invoke } from "@tauri-apps/api/core";
import { audioPlayer } from "./audioPlayer";

export interface PlayerState {
  is_playing: boolean;
  is_paused: boolean;
  current_file: string | null;
  position_ms: number;
  duration_ms: number | null;
}

// Player API now uses frontend audio player
export const playerApi = {
  playFile: async (filePath: string): Promise<void> => {
    await audioPlayer.play(filePath);
    // Notify backend of current track
    await invoke("set_current_track", { filePath });
  },

  pause: async (): Promise<void> => {
    audioPlayer.pause();
  },

  resume: async (): Promise<void> => {
    audioPlayer.resume();
  },

  stop: async (): Promise<void> => {
    audioPlayer.stop();
    // Clear backend current track
    await invoke("clear_current_track");
  },

  setVolume: async (volume: number): Promise<void> => {
    audioPlayer.setVolume(volume);
  },

  seekTo: async (positionMs: number): Promise<void> => {
    audioPlayer.seek(positionMs);
  },

  getState: async (): Promise<PlayerState> => {
    const state = audioPlayer.getState();
    return {
      is_playing: state.isPlaying,
      is_paused: state.isPaused,
      current_file: state.currentFile,
      position_ms: state.position,
      duration_ms: state.duration > 0 ? state.duration : null,
    };
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

export interface Queue {
  id: number;
  name: string;
  is_active: boolean;
  shuffle_seed: number; // 1 = sequential, other = shuffled
}

export interface Playlist {
  id: number;
  name: string;
  description?: string;
}

export interface IndexingResult {
  total_files: number;
  successful: number;
  failed: number;
  skipped: number;
  updated: number;
  removed: number;
  errors: string[];
}

export interface ScanPath {
  id: number;
  path: string;
  date_added: number;
  last_scanned: number | null;
}

export const libraryApi = {
  scanLibrary: async (): Promise<IndexingResult> => {
    return await invoke("scan_library");
  },

  addScanPath: async (path: string): Promise<number> => {
    return await invoke("add_scan_path", { path });
  },

  getAllScanPaths: async (): Promise<ScanPath[]> => {
    return await invoke("get_all_scan_paths");
  },

  removeScanPath: async (pathId: number): Promise<void> => {
    return await invoke("remove_scan_path", { pathId });
  },

  pickFolder: async (): Promise<string | null> => {
    return await invoke("pick_folder");
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

  getLyrics: async (filePath: string): Promise<string | null> => {
    return await invoke("get_lyrics", { filePath });
  },
};

export const queueApi = {
  createQueueFromTracks: async (
    name: string,
    trackIds: number[],
    clickedIndex: number
  ): Promise<number> => {
    return await invoke("create_queue_from_tracks", {
      name,
      trackIds,
      clickedIndex,
    });
  },

  getAllQueues: async (): Promise<Queue[]> => {
    return await invoke("get_all_queues");
  },

  getQueueTracks: async (queueId: number): Promise<Track[]> => {
    return await invoke("get_queue_tracks", { queueId });
  },

  setActiveQueue: async (queueId: number): Promise<void> => {
    return await invoke("set_active_queue", { queueId });
  },

  getActiveQueue: async (): Promise<Queue | null> => {
    return await invoke("get_active_queue");
  },

  deleteQueue: async (queueId: number): Promise<void> => {
    return await invoke("delete_queue", { queueId });
  },

  updateQueueCurrentIndex: async (queueId: number, trackIndex: number): Promise<void> => {
    return await invoke("update_queue_current_index", { queueId, trackIndex });
  },

  getQueueCurrentIndex: async (queueId: number): Promise<number> => {
    return await invoke("get_queue_current_index", { queueId });
  },

  getNextQueue: async (excludedQueueId: number): Promise<Queue | null> => {
    return await invoke("get_next_queue", { excludedQueueId });
  },

  getQueueTrackAtPosition: async (queueId: number, position: number): Promise<Track | null> => {
    return await invoke("get_queue_track_at_position", { queueId, position });
  },

  getQueueTrackAtShuffledPosition: async (queueId: number, shuffledPosition: number, shuffleSeed: number, anchorPosition: number): Promise<Track | null> => {
    return await invoke("get_queue_track_at_shuffled_position", { queueId, shuffledPosition, shuffleSeed, anchorPosition });
  },

  getQueueLength: async (queueId: number): Promise<number> => {
    return await invoke("get_queue_length", { queueId });
  },

  toggleQueueShuffle: async (queueId: number): Promise<number> => {
    return await invoke("toggle_queue_shuffle", { queueId });
  },

  setQueueShuffleSeed: async (queueId: number, shuffleSeed: number): Promise<void> => {
    return await invoke("set_queue_shuffle_seed", { queueId, shuffleSeed });
  },

  getQueueShuffleSeed: async (queueId: number): Promise<number> => {
    return await invoke("get_queue_shuffle_seed", { queueId });
  },

  setQueueShuffleAnchor: async (queueId: number, shuffleAnchor: number): Promise<void> => {
    return await invoke("set_queue_shuffle_anchor", { queueId, shuffleAnchor });
  },

  getQueueShuffleAnchor: async (queueId: number): Promise<number> => {
    return await invoke("get_queue_shuffle_anchor", { queueId });
  },

  findShuffledPosition: async (originalIndex: number, seed: number, queueLength: number, anchorPosition: number): Promise<number> => {
    return await invoke("find_shuffled_position", { originalIndex, seed, queueLength, anchorPosition });
  },

  appendTracksToQueue: async (queueId: number, trackIds: number[]): Promise<void> => {
    return await invoke("append_tracks_to_queue", { queueId, trackIds });
  },

  insertTracksAfterPosition: async (queueId: number, trackIds: number[], afterPosition: number): Promise<void> => {
    return await invoke("insert_tracks_after_position", { queueId, trackIds, afterPosition });
  },

  removeTrackAtPosition: async (queueId: number, position: number): Promise<void> => {
    return await invoke("remove_track_at_position", { queueId, position });
  },
};

export const playlistApi = {
  getRecentTracks: async (): Promise<Track[]> => {
    return await invoke("get_recent_tracks");
  },

  getMostPlayedTracks: async (): Promise<Track[]> => {
    return await invoke("get_most_played_tracks");
  },

  getUnplayedTracks: async (): Promise<Track[]> => {
    return await invoke("get_unplayed_tracks");
  },

  getAllPlaylists: async (): Promise<Playlist[]> => {
    return await invoke("get_all_playlists");
  },

  createPlaylist: async (name: string, description?: string): Promise<number> => {
    return await invoke("create_playlist", { name, description });
  },

  renamePlaylist: async (playlistId: number, newName: string): Promise<void> => {
    return await invoke("rename_playlist", { playlistId, newName });
  },

  addTrackToPlaylist: async (playlistId: number, trackId: number): Promise<void> => {
    return await invoke("add_track_to_playlist", { playlistId, trackId });
  },

  getPlaylistTracks: async (playlistId: number): Promise<Track[]> => {
    return await invoke("get_playlist_tracks", { playlistId });
  },
};

export const fileApi = {
  openFile: async (): Promise<string | null> => {
    // TODO: Use Tauri's file dialog
    // For now, this is a placeholder
    return null;
  },
};
