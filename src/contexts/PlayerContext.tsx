import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { playerApi, libraryApi, queueApi, Track } from "../services/api";
import { audioPlayer } from "../services/audioPlayer";
import { smtcService } from "../services/smtcService";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface PlayerContextType {
  currentTrack: Track | null;
  albumArt: string | null;
  currentQueueId: number | null;
  currentTrackIndex: number | null;
  isShuffled: boolean;
  shuffleSeed: number;
  isRepeating: boolean;
  setCurrentTrack: (track: Track | null) => void;
  setAlbumArt: (art: string | null) => void;
  updateQueuePosition: (queueId: number, trackIndex: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  toggleShuffle: () => Promise<void>;
  toggleRepeat: () => void;
  clearPlayer: () => void;
  loadShuffleStateFromQueue: (queueId: number) => Promise<void>;
  setShuffleStateForNewQueue: (queueId: number, inheritShuffle: boolean) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  console.log('[PlayerContext] Render');
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [albumArt, setAlbumArt] = useState<string | null>(null);
  const [currentQueueId, setCurrentQueueId] = useState<number | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
  const [shuffleSeed, setShuffleSeed] = useState<number>(1);
  const [isShuffled, setIsShuffled] = useState<boolean>(false);
  const [isRepeating, setIsRepeating] = useState<boolean>(false); // true = repeat track, false = repeat queue

  const updateQueuePosition = async (queueId: number, trackIndex: number) => {
    console.log(`[PlayerContext] updateQueuePosition - queueId: ${queueId}, trackIndex: ${trackIndex}`);
    setCurrentQueueId(queueId);
    setCurrentTrackIndex(trackIndex);
    await queueApi.updateQueueCurrentIndex(queueId, trackIndex);
  };

  // Helper function to update Media Session metadata
  const updateMediaSessionMetadata = useCallback((track: Track, artUrl: string | null) => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist || "Unknown Artist",
        album: track.album || "Unknown Album",
        artwork: artUrl ? [{ src: artUrl, sizes: "512x512", type: "image/jpeg" }] : [],
      });
      console.log(`[PlayerContext] Updated Media Session metadata: ${track.title}`);
    }
  }, []);

  const playNext = useCallback(async () => {
    if (currentQueueId === null || currentTrackIndex === null) {
      console.log('[PlayerContext] playNext - no active queue or track index');
      return;
    }

    try {
      // Simply move to next track in the queue (shuffle is handled by track order in DB)
      let nextIndex = currentTrackIndex + 1;
      const queueLength = await queueApi.getQueueLength(currentQueueId);
      
      // If reached end of queue, loop back to start (queue loop)
      if (nextIndex >= queueLength) {
        console.log('[PlayerContext] playNext - reached end of queue, looping to start');
        nextIndex = 0;
      }

      // Get track directly at position (shuffle is already applied to queue order)
      const nextTrack = await queueApi.getQueueTrackAtPosition(currentQueueId, nextIndex);
      if (nextTrack) {
        console.log(`[PlayerContext] playNext - playing track at index ${nextIndex}: ${nextTrack.title}`);
        await updateQueuePosition(currentQueueId, nextIndex);
        setCurrentTrack(nextTrack);
        
        // Load album art and update Media Session
        let artUrl: string | null = null;
        try {
          const artBytes = await libraryApi.getAlbumArt(nextTrack.file_path);
          if (artBytes && artBytes.length > 0) {
            const blob = new Blob([new Uint8Array(artBytes)], { type: "image/jpeg" });
            artUrl = URL.createObjectURL(blob);
            setAlbumArt(prevArt => {
              if (prevArt) {
                URL.revokeObjectURL(prevArt);
              }
              return artUrl;
            });
          } else {
            setAlbumArt(null);
          }
        } catch (error) {
          console.error("Failed to load album art:", error);
          setAlbumArt(null);
        }

        // Update Media Session metadata immediately
        updateMediaSessionMetadata(nextTrack, artUrl);

        // Play the track with ReplayGain normalization (if available)
        await playerApi.playFile(nextTrack.file_path, nextTrack.normalization_gain_db);
      }
    } catch (error) {
      console.error('Failed to play next track:', error);
    }
  }, [currentQueueId, currentTrackIndex, updateQueuePosition, updateMediaSessionMetadata]);

  const playPrevious = useCallback(async () => {
    if (currentQueueId === null || currentTrackIndex === null) {
      console.log('[PlayerContext] playPrevious - no active queue or track index');
      return;
    }

    try {
      // Simply move to previous track in the queue (shuffle is handled by track order in DB)
      let prevIndex = currentTrackIndex - 1;
      
      // If at start of queue, loop to end
      if (prevIndex < 0) {
        const queueLength = await queueApi.getQueueLength(currentQueueId);
        prevIndex = queueLength - 1;
        console.log('[PlayerContext] playPrevious - at start of queue, looping to end');
      }

      // Get track directly at position (shuffle is already applied to queue order)
      const prevTrack = await queueApi.getQueueTrackAtPosition(currentQueueId, prevIndex);
      if (prevTrack) {
        console.log(`[PlayerContext] playPrevious - playing track at index ${prevIndex}: ${prevTrack.title}`);
        await updateQueuePosition(currentQueueId, prevIndex);
        setCurrentTrack(prevTrack);
        
        // Load album art and update Media Session
        let artUrl: string | null = null;
        try {
          const artBytes = await libraryApi.getAlbumArt(prevTrack.file_path);
          if (artBytes && artBytes.length > 0) {
            const blob = new Blob([new Uint8Array(artBytes)], { type: "image/jpeg" });
            artUrl = URL.createObjectURL(blob);
            setAlbumArt(prevArt => {
              if (prevArt) {
                URL.revokeObjectURL(prevArt);
              }
              return artUrl;
            });
          } else {
            setAlbumArt(null);
          }
        } catch (error) {
          console.error("Failed to load album art:", error);
          setAlbumArt(null);
        }

        // Update Media Session metadata immediately
        updateMediaSessionMetadata(prevTrack, artUrl);

        // Play the track with ReplayGain normalization (if available)
        await playerApi.playFile(prevTrack.file_path, prevTrack.normalization_gain_db);
      }
    } catch (error) {
      console.error('Failed to play previous track:', error);
    }
  }, [currentQueueId, currentTrackIndex, updateQueuePosition, updateMediaSessionMetadata]);

  const toggleShuffle = useCallback(async () => {
    if (currentQueueId === null || !currentTrack) {
      console.log('[PlayerContext] toggleShuffle - no active queue or track');
      return;
    }

    try {
      console.log(`[PlayerContext] Toggling shuffle for queue ${currentQueueId}, current state: ${isShuffled ? 'enabled' : 'disabled'}`);
      
      // Toggle shuffle - backend handles everything (reordering tracks, saving original order)
      const [newSeed, newIndex] = await queueApi.toggleQueueShuffle(currentQueueId, currentTrack.id);
      
      // Update state
      setShuffleSeed(newSeed);
      setIsShuffled(newSeed !== 1);
      setCurrentTrackIndex(newIndex);
      
      console.log(`[PlayerContext] Shuffle toggled successfully: ${newSeed !== 1 ? 'ENABLED' : 'DISABLED'}, seed: ${newSeed}, new position: ${newIndex}`);
    } catch (error) {
      console.error('Failed to toggle shuffle:', error);
    }
  }, [currentQueueId, isShuffled, currentTrack]);

  const toggleRepeat = useCallback(() => {
    setIsRepeating(prev => {
      const newState = !prev;
      console.log(`[PlayerContext] Repeat toggled: ${newState ? 'Track Loop' : 'Queue Loop'}`);
      return newState;
    });
  }, []);

  const clearPlayer = useCallback(() => {
    console.log('[PlayerContext] Clearing player state');
    setCurrentTrack(null);
    setAlbumArt(prevArt => {
      if (prevArt) {
        URL.revokeObjectURL(prevArt);
      }
      return null;
    });
    setCurrentQueueId(null);
    setCurrentTrackIndex(null);
    setShuffleSeed(1);
    setIsShuffled(false);
    
    // Clear media session
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
  }, []);

  // Load shuffle state from a queue (used when switching queues)
  const loadShuffleStateFromQueue = useCallback(async (queueId: number) => {
    try {
      console.log(`[PlayerContext] Loading shuffle state for queue ${queueId}`);
      const seed = await queueApi.getQueueShuffleSeed(queueId);
      console.log(`[PlayerContext] Queue ${queueId} has shuffle seed: ${seed}`);
      setShuffleSeed(seed);
      setIsShuffled(seed !== 1);
    } catch (error) {
      console.error('Failed to load shuffle state from queue:', error);
      // Default to unshuffled if there's an error
      setShuffleSeed(1);
      setIsShuffled(false);
    }
  }, []);

  // Set shuffle state for a new queue (inheriting from previous queue if needed)
  const setShuffleStateForNewQueue = useCallback(async (queueId: number, inheritShuffle: boolean) => {
    try {
      if (inheritShuffle && isShuffled) {
        // For new queues with shuffle inheritance, shuffle the queue using the backend
        // Get the first track ID (which is the clicked track at position 0)
        const firstTrack = await queueApi.getQueueTrackAtPosition(queueId, 0);
        if (firstTrack) {
          const [newSeed, _newIndex] = await queueApi.toggleQueueShuffle(queueId, firstTrack.id);
          console.log(`[PlayerContext] Shuffled new queue ${queueId} with seed ${newSeed}`);
          setShuffleSeed(newSeed);
          setIsShuffled(true);
        }
      } else {
        console.log(`[PlayerContext] New queue ${queueId} will be sequential (no shuffle inheritance)`);
        setShuffleSeed(1);
        setIsShuffled(false);
      }
    } catch (error) {
      console.error('Failed to set shuffle state for new queue:', error);
    }
  }, [isShuffled]);

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
          
          // Load shuffle state (seed of 1 means sequential, anything else means shuffled)
          const seed = activeQueue.shuffle_seed || 1;
          setShuffleSeed(seed);
          setIsShuffled(seed !== 1);
          console.log(`[PlayerContext] Shuffle state: ${seed !== 1 ? 'enabled' : 'disabled'}, seed: ${seed}`);
          
          // Get the saved position in this queue
          const currentIndex = await queueApi.getQueueCurrentIndex(activeQueue.id);
          console.log(`[PlayerContext] Active queue current index: ${currentIndex}`);
          setCurrentTrackIndex(currentIndex);
          
          // Get the track at that position (shuffle is already applied to queue order)
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

  // Update window title when current track changes
  useEffect(() => {
    const updateWindowTitle = async () => {
      try {
        const window = getCurrentWindow();
        if (currentTrack) {
          const artist = currentTrack.artist || "Unknown Artist";
          await window.setTitle(`${currentTrack.title} by ${artist} - Musicsloth`);
        } else {
          await window.setTitle("Musicsloth");
        }
      } catch (error) {
        console.error("Failed to update window title:", error);
      }
    };
    
    updateWindowTitle();
  }, [currentTrack]);

  // Set up track ended listener to auto-play next track or repeat
  useEffect(() => {
    const unsubscribe = audioPlayer.onTrackEnded(async () => {
      if (isRepeating) {
        // Track loop: replay the same track
        console.log('[PlayerContext] Track ended, repeating current track');
        if (currentTrack) {
          try {
            await playerApi.playFile(currentTrack.file_path, currentTrack.normalization_gain_db);
          } catch (error) {
            console.error('Failed to repeat track:', error);
          }
        }
      } else {
        // Queue loop: play next track (will loop to start when reaching end)
        console.log('[PlayerContext] Track ended, playing next track');
        playNext();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [playNext, isRepeating, currentTrack]);

  // Initialize SMTC (Windows System Media Transport Controls)
  useEffect(() => {
    const initSmtc = async () => {
      await smtcService.init();
      
      // Set up button callbacks
      smtcService.setCallbacks({
        onPlay: async () => {
          try {
            await playerApi.resume();
          } catch (error) {
            console.error('[SMTC] Failed to play:', error);
          }
        },
        onPause: async () => {
          try {
            await playerApi.pause();
          } catch (error) {
            console.error('[SMTC] Failed to pause:', error);
          }
        },
        onStop: async () => {
          try {
            await playerApi.stop();
          } catch (error) {
            console.error('[SMTC] Failed to stop:', error);
          }
        },
        onNext: async () => {
          try {
            await playNext();
          } catch (error) {
            console.error('[SMTC] Failed to play next:', error);
          }
        },
        onPrevious: async () => {
          try {
            await playPrevious();
          } catch (error) {
            console.error('[SMTC] Failed to play previous:', error);
          }
        },
      });
    };
    
    initSmtc();
    
    return () => {
      smtcService.destroy();
    };
  }, [playNext, playPrevious]);

  // Update SMTC when track or playback state changes
  useEffect(() => {
    const updateSmtc = async () => {
      if (currentTrack) {
        // Get artwork temp path for SMTC
        const artworkPath = await smtcService.getArtworkTempPath(currentTrack.file_path);
        console.log('[PlayerContext] SMTC artwork path:', artworkPath);
        
        await smtcService.updateMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist || undefined,
          album: currentTrack.album || undefined,
          artworkPath: artworkPath || undefined,
        });
      }
    };
    
    updateSmtc();
  }, [currentTrack]);

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
        
        // Update SMTC playback status
        smtcService.setPlaybackStatus(state.is_playing);
        
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
      isShuffled,
      shuffleSeed,
      isRepeating,
      setCurrentTrack, 
      setAlbumArt,
      updateQueuePosition,
      playNext,
      playPrevious,
      toggleShuffle,
      toggleRepeat,
      clearPlayer,
      loadShuffleStateFromQueue,
      setShuffleStateForNewQueue
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
