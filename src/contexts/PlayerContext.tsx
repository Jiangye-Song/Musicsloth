import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { playerApi, libraryApi, queueApi, Track } from "../services/api";
import { audioPlayer } from "../services/audioPlayer";

interface PlayerContextType {
  currentTrack: Track | null;
  albumArt: string | null;
  currentQueueId: number | null;
  currentTrackIndex: number | null;
  setCurrentTrack: (track: Track | null) => void;
  setAlbumArt: (art: string | null) => void;
  updateQueuePosition: (queueId: number, trackIndex: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  console.log('[PlayerContext] Render');
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [albumArt, setAlbumArt] = useState<string | null>(null);
  const [currentQueueId, setCurrentQueueId] = useState<number | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);

  const updateQueuePosition = async (queueId: number, trackIndex: number) => {
    console.log(`[PlayerContext] updateQueuePosition - queueId: ${queueId}, trackIndex: ${trackIndex}`);
    setCurrentQueueId(queueId);
    setCurrentTrackIndex(trackIndex);
    await queueApi.updateQueueCurrentIndex(queueId, trackIndex);
  };

  const playNext = useCallback(async () => {
    if (currentQueueId === null || currentTrackIndex === null) {
      console.log('[PlayerContext] playNext - no active queue or track index');
      return;
    }

    try {
      const queueLength = await queueApi.getQueueLength(currentQueueId);
      const nextIndex = currentTrackIndex + 1;

      if (nextIndex >= queueLength) {
        console.log('[PlayerContext] playNext - reached end of queue');
        return;
      }

      const nextTrack = await queueApi.getQueueTrackAtPosition(currentQueueId, nextIndex);
      if (nextTrack) {
        console.log(`[PlayerContext] playNext - playing track at index ${nextIndex}: ${nextTrack.title}`);
        await updateQueuePosition(currentQueueId, nextIndex);
        setCurrentTrack(nextTrack);
        
        // Load album art
        try {
          const artBytes = await libraryApi.getAlbumArt(nextTrack.file_path);
          if (artBytes && artBytes.length > 0) {
            const blob = new Blob([new Uint8Array(artBytes)], { type: "image/jpeg" });
            const url = URL.createObjectURL(blob);
            setAlbumArt(prevArt => {
              if (prevArt) {
                URL.revokeObjectURL(prevArt);
              }
              return url;
            });
          } else {
            setAlbumArt(null);
          }
        } catch (error) {
          console.error("Failed to load album art:", error);
          setAlbumArt(null);
        }

        // Play the track
        await playerApi.playFile(nextTrack.file_path);
      }
    } catch (error) {
      console.error('Failed to play next track:', error);
    }
  }, [currentQueueId, currentTrackIndex, albumArt, updateQueuePosition]);

  const playPrevious = useCallback(async () => {
    if (currentQueueId === null || currentTrackIndex === null) {
      console.log('[PlayerContext] playPrevious - no active queue or track index');
      return;
    }

    try {
      const prevIndex = currentTrackIndex - 1;

      if (prevIndex < 0) {
        console.log('[PlayerContext] playPrevious - at start of queue');
        return;
      }

      const prevTrack = await queueApi.getQueueTrackAtPosition(currentQueueId, prevIndex);
      if (prevTrack) {
        console.log(`[PlayerContext] playPrevious - playing track at index ${prevIndex}: ${prevTrack.title}`);
        await updateQueuePosition(currentQueueId, prevIndex);
        setCurrentTrack(prevTrack);
        
        // Load album art
        try {
          const artBytes = await libraryApi.getAlbumArt(prevTrack.file_path);
          if (artBytes && artBytes.length > 0) {
            const blob = new Blob([new Uint8Array(artBytes)], { type: "image/jpeg" });
            const url = URL.createObjectURL(blob);
            setAlbumArt(prevArt => {
              if (prevArt) {
                URL.revokeObjectURL(prevArt);
              }
              return url;
            });
          } else {
            setAlbumArt(null);
          }
        } catch (error) {
          console.error("Failed to load album art:", error);
          setAlbumArt(null);
        }

        // Play the track
        await playerApi.playFile(prevTrack.file_path);
      }
    } catch (error) {
      console.error('Failed to play previous track:', error);
    }
  }, [currentQueueId, currentTrackIndex, albumArt, updateQueuePosition]);

  // Load active queue's current track on startup
  useEffect(() => {
    const loadActiveQueueTrack = async () => {
      try {
        console.log('[PlayerContext] Loading active queue track on startup');
        const queues = await queueApi.getAllQueues();
        const activeQueue = queues.find(q => q.is_active);
        
        if (activeQueue) {
          console.log(`[PlayerContext] Found active queue: ${activeQueue.name} (ID: ${activeQueue.id})`);
          setCurrentQueueId(activeQueue.id);
          
          // Get the saved position in this queue
          const currentIndex = await queueApi.getQueueCurrentIndex(activeQueue.id);
          console.log(`[PlayerContext] Active queue current index: ${currentIndex}`);
          setCurrentTrackIndex(currentIndex);
          
          // Get the track at that position
          const track = await queueApi.getQueueTrackAtPosition(activeQueue.id, currentIndex);
          
          if (track) {
            console.log(`[PlayerContext] Loaded track metadata: ${track.title}`);
            setCurrentTrack(track);
            
            // Load album art
            try {
              const artBytes = await libraryApi.getAlbumArt(track.file_path);
              if (artBytes && artBytes.length > 0) {
                const blob = new Blob([new Uint8Array(artBytes)], { type: "image/jpeg" });
                const url = URL.createObjectURL(blob);
                setAlbumArt(url);
                
                // Update media session
                if ("mediaSession" in navigator) {
                  navigator.mediaSession.metadata = new MediaMetadata({
                    title: track.title,
                    artist: track.artist || "Unknown Artist",
                    album: track.album || "Unknown Album",
                    artwork: [
                      { src: url, sizes: "512x512", type: "image/jpeg" },
                    ],
                  });
                }
              }
            } catch (error) {
              console.error("Failed to load album art:", error);
            }
          }
        } else {
          console.log('[PlayerContext] No active queue found');
        }
      } catch (error) {
        console.error("Failed to load active queue track:", error);
      }
    };
    
    loadActiveQueueTrack();
  }, []); // Run only once on mount

  // Set up track ended listener to auto-play next track
  useEffect(() => {
    const unsubscribe = audioPlayer.onTrackEnded(() => {
      console.log('[PlayerContext] Track ended, playing next track');
      playNext();
    });

    return () => {
      unsubscribe();
    };
  }, [playNext]);

  useEffect(() => {
    console.log('[PlayerContext] Setting up polling interval');
    // Poll for current track and album art
    const interval = setInterval(async () => {
      try {
        const state = await playerApi.getState();
        
        // Update media session playback state
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = state.is_playing ? "playing" : "paused";
        }
        
        if (state.current_file) {
          try {
            const track = await libraryApi.getCurrentTrack();
            
            // Only update if track changed
            if (!currentTrack || currentTrack.file_path !== track?.file_path) {
              console.log(`[PlayerContext] Track changed: ${track?.title}`);
              setCurrentTrack(track);
              
              // Fetch album art
              if (track && track.file_path) {
                try {
                  const artBytes = await libraryApi.getAlbumArt(track.file_path);
                  if (artBytes && artBytes.length > 0) {
                    const blob = new Blob([new Uint8Array(artBytes)], { type: "image/jpeg" });
                    const url = URL.createObjectURL(blob);
                    
                    setAlbumArt(prevArt => {
                      // Clean up old URL
                      if (prevArt) {
                        URL.revokeObjectURL(prevArt);
                      }
                      return url;
                    });
                    
                    // Update media session
                    if ("mediaSession" in navigator && track) {
                      navigator.mediaSession.metadata = new MediaMetadata({
                        title: track.title,
                        artist: track.artist || "Unknown Artist",
                        album: track.album || "Unknown Album",
                        artwork: [
                          { src: url, sizes: "512x512", type: "image/jpeg" },
                        ],
                      });
                    }
                  } else {
                    setAlbumArt(null);
                  }
                } catch {
                  setAlbumArt(null);
                }
              }
            }
          } catch (err) {
            console.error("Failed to fetch track:", err);
          }
        } else {
          // Don't clear track/art when nothing is playing - keep last track
        }
      } catch (error) {
        console.error("Failed to get player state:", error);
      }
    }, 500);

    // Set up media session action handlers
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", async () => {
        try {
          await playerApi.resume();
        } catch (error) {
          console.error("Failed to play:", error);
        }
      });

      navigator.mediaSession.setActionHandler("pause", async () => {
        try {
          await playerApi.pause();
        } catch (error) {
          console.error("Failed to pause:", error);
        }
      });

      navigator.mediaSession.setActionHandler("seekto", async (details) => {
        if (details.seekTime !== undefined) {
          try {
            await playerApi.seekTo(details.seekTime * 1000);
          } catch (error) {
            console.error("Failed to seek:", error);
          }
        }
      });

      navigator.mediaSession.setActionHandler("previoustrack", async () => {
        try {
          await playPrevious();
        } catch (error) {
          console.error("Failed to play previous track:", error);
        }
      });

      navigator.mediaSession.setActionHandler("nexttrack", async () => {
        try {
          await playNext();
        } catch (error) {
          console.error("Failed to play next track:", error);
        }
      });
    }

    return () => {
      clearInterval(interval);
    };
  }, [currentTrack?.file_path, playNext, playPrevious]);

  // Cleanup blob URLs only on unmount
  useEffect(() => {
    return () => {
      if (albumArt) {
        URL.revokeObjectURL(albumArt);
      }
    };
  }, []);

  return (
    <PlayerContext.Provider value={{ 
      currentTrack, 
      albumArt, 
      currentQueueId, 
      currentTrackIndex, 
      setCurrentTrack, 
      setAlbumArt,
      updateQueuePosition,
      playNext,
      playPrevious
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error("usePlayer must be used within a PlayerProvider");
  }
  return context;
}
