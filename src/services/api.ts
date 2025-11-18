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

export const fileApi = {
  openFile: async (): Promise<string | null> => {
    // TODO: Use Tauri's file dialog
    // For now, this is a placeholder
    return null;
  },
};
