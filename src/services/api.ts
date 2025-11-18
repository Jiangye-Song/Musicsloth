// API service for Tauri commands
import { invoke } from "@tauri-apps/api/core";

export const api = {
  // Example command
  greet: async (name: string): Promise<string> => {
    return await invoke("greet", { name });
  },
  
  // TODO: Add more Tauri commands here
  // library: {
  //   scanLibrary: async (paths: string[]) => { ... },
  //   getTracks: async () => { ... },
  // },
  // player: {
  //   play: async (trackId: number) => { ... },
  //   pause: async () => { ... },
  // },
};
