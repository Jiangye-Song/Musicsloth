import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { queueApi, Queue, Track, playerApi } from "../services/api";
import VirtualTrackList, { VirtualTrackListRef } from "../components/VirtualTrackList";
import { Box, IconButton, List, ListItem, ListItemButton, ListItemText, Typography, CircularProgress, useMediaQuery, Select, MenuItem, FormControl } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import CloseIcon from "@mui/icons-material/Close";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import { usePlayer } from "../contexts/PlayerContext";

interface QueuesViewProps {
  searchQuery?: string;
  onClearSearch?: () => void;
}

export interface QueuesViewRef {
  scrollToActiveTrack: () => void;
}

const QueuesView = forwardRef<QueuesViewRef, QueuesViewProps>(({ searchQuery = "", onClearSearch }, ref) => {
  const { currentQueueId, shuffleSeed, currentTrackIndex, clearPlayer, loadShuffleStateFromQueue, updateQueuePosition, toggleShuffle } = usePlayer();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [filteredQueues, setFilteredQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);
  const [queueTracks, setQueueTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const trackListRef = useRef<VirtualTrackListRef>(null);
  const isMobile = useMediaQuery('(max-width:660px)');

  // Expose scrollToActiveTrack to parent via ref
  useImperativeHandle(ref, () => ({
    scrollToActiveTrack: async () => {
      // Find and select active queue first
      const activeQueue = queues.find(q => q.is_active);
      if (activeQueue) {
        // If not already selected, select it and load tracks
        if (selectedQueue?.id !== activeQueue.id) {
          setSelectedQueue(activeQueue);
          await loadQueueTracks(activeQueue.id);
        }
        // Wait a bit for the tracks to render, then scroll
        setTimeout(() => {
          trackListRef.current?.scrollToActiveTrack();
        }, 150);
      }
    }
  }));

  useEffect(() => {
    loadQueues();
  }, []);

  // Reload queue tracks when shuffle state changes for the active queue
  useEffect(() => {
    if (selectedQueue && selectedQueue.id === currentQueueId) {
      console.log(`[QueuesView] Shuffle seed changed to ${shuffleSeed}, reloading tracks`);
      loadQueueTracks(selectedQueue.id, true);
    }
  }, [shuffleSeed]);

  useEffect(() => {
    const updatePlayingState = async () => {
      try {
        const state = await playerApi.getState();
        setIsPlaying(state.is_playing);
      } catch (error) {
        console.error("Failed to get player state:", error);
      }
    };

    updatePlayingState();
    const interval = setInterval(updatePlayingState, 500);
    return () => clearInterval(interval);
  }, []);



  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredQueues(queues);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredQueues(
        queues.filter((queue) =>
          queue.name.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, queues]);

  const loadQueues = async (forceReloadTracks = false) => {
    try {
      const allQueues = await queueApi.getAllQueues();

      // Check if queues actually changed (compare active status)
      const queuesChanged = queues.length !== allQueues.length ||
        queues.some((q, i) => q.is_active !== allQueues[i]?.is_active || q.id !== allQueues[i]?.id);

      if (!queuesChanged && !forceReloadTracks) {
        // No changes, skip update to avoid re-renders
        return;
      }

      setQueues(allQueues);

      // Update selectedQueue if it's in the list (to refresh active status)
      if (selectedQueue) {
        const updatedSelectedQueue = allQueues.find(q => q.id === selectedQueue.id);
        if (updatedSelectedQueue && updatedSelectedQueue.is_active !== selectedQueue.is_active) {
          setSelectedQueue(updatedSelectedQueue);
        }
      }

      // Auto-select active queue on first load
      const activeQueue = allQueues.find(q => q.is_active);
      if (activeQueue && !selectedQueue) {
        setSelectedQueue(activeQueue);
        loadQueueTracks(activeQueue.id);
      }
    } catch (error) {
      console.error("Failed to load queues:", error);
    }
  };

  const loadQueueTracks = async (queueId: number, silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Refresh queue data to get latest shuffle_seed
      const allQueues = await queueApi.getAllQueues();
      const queue = allQueues.find(q => q.id === queueId);

      // Update selectedQueue if it's the one being loaded
      if (selectedQueue?.id === queueId && queue) {
        setSelectedQueue(queue);
      }

      const tracks = await queueApi.getQueueTracks(queueId);

      // Apply shuffle if the queue has a shuffle seed that's not 1
      if (queue && queue.shuffle_seed !== null && queue.shuffle_seed !== 1) {
        // Get current index to use as anchor
        const currentIndex = queue.is_active && currentQueueId === queueId && currentTrackIndex !== null
          ? currentTrackIndex
          : await queueApi.getQueueCurrentIndex(queueId);

        // Create shuffled order based on seed, anchored at current track
        const shuffled = [...tracks];
        const seed = queue.shuffle_seed;
        const step = Math.abs(seed) % tracks.length || 1;
        const anchor = currentIndex;

        const newOrder: typeof tracks = [];
        const used = new Set<number>();
        let currentPos = anchor;

        // First, place the anchor track at its position
        used.add(anchor);

        // Generate shuffled order by following the step pattern from anchor
        for (let i = 0; i < tracks.length; i++) {
          if (i === anchor) {
            // Anchor stays at its position
            newOrder.push(shuffled[anchor]);
            continue;
          }

          // Find next unused position using step pattern
          currentPos = (currentPos + step) % tracks.length;
          while (used.has(currentPos)) {
            currentPos = (currentPos + 1) % tracks.length;
          }

          newOrder.push(shuffled[currentPos]);
          used.add(currentPos);
        }

        setQueueTracks(newOrder);
      } else {
        setQueueTracks(tracks);
      }
    } catch (error) {
      console.error("Failed to load queue tracks:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSelectQueue = async (queue: Queue) => {
    setSelectedQueue(queue);
    await loadQueueTracks(queue.id);
  };

  const handleToggleShuffle = async () => {
    if (!selectedQueue) return;

    try {
      if (selectedQueue.is_active) {
        // For active queue, use PlayerContext's toggleShuffle which handles
        // anchor position, current track index, and state updates properly
        await toggleShuffle();
        
        // Update the selectedQueue state - get the new seed from DB
        const newSeed = await queueApi.getQueueShuffleSeed(selectedQueue.id);
        setSelectedQueue({ ...selectedQueue, shuffle_seed: newSeed });
      } else {
        // For non-active queues, just toggle the seed in DB
        // The anchor will be set when this queue becomes active and starts playing
        const newSeed = await queueApi.toggleQueueShuffle(selectedQueue.id);
        setSelectedQueue({ ...selectedQueue, shuffle_seed: newSeed });
      }
      
      // Reload tracks to show new order
      await loadQueueTracks(selectedQueue.id, true);
      
      // Refresh queues list
      await loadQueues(true);
    } catch (error) {
      console.error("Failed to toggle shuffle:", error);
    }
  };

  const handlePlayQueue = async () => {
    if (!selectedQueue) return;

    try {
      // If this queue is active and playing, just pause
      if (selectedQueue.is_active && isPlaying) {
        await playerApi.pause();
        return;
      }

      // If this queue is active but paused, resume
      if (selectedQueue.is_active && !isPlaying) {
        await playerApi.resume();
        return;
      }

      // If this queue is not active, switch to it
      await queueApi.setActiveQueue(selectedQueue.id);

      // Load shuffle state for this queue (to sync PlayerContext)
      await loadShuffleStateFromQueue(selectedQueue.id);

      // Get the saved position in this queue
      const currentIndex = await queueApi.getQueueCurrentIndex(selectedQueue.id);

      // Play from that position (or first track if index is 0)
      if (queueTracks.length > 0) {
        const trackIndex = Math.max(0, Math.min(currentIndex, queueTracks.length - 1));
        await playerApi.playFile(queueTracks[trackIndex].file_path);
        
        // Update PlayerContext with the new queue position
        await updateQueuePosition(selectedQueue.id, trackIndex);
      }

      // Refresh queue list to update active status
      await loadQueues(true);
    } catch (error) {
      console.error("Failed to play queue:", error);
    }
  };

  const handleDeleteQueue = async (queueId: number) => {
    // if (!confirm("Are you sure you want to delete this queue?")) return;

    try {
      // Check if this is the active queue
      const deletingActiveQueue = queues.find(q => q.id === queueId)?.is_active;

      if (deletingActiveQueue) {
        // Stop playback
        await playerApi.stop();

        // Find next queue to switch to
        const nextQueue = await queueApi.getNextQueue(queueId);

        if (nextQueue) {
          // Set the next queue as active first
          await queueApi.setActiveQueue(nextQueue.id);

          // Load shuffle state for this queue (to sync PlayerContext)
          await loadShuffleStateFromQueue(nextQueue.id);

          // Get the saved position and shuffle state
          const currentIndex = await queueApi.getQueueCurrentIndex(nextQueue.id);
          const seed = await queueApi.getQueueShuffleSeed(nextQueue.id);
          const anchor = await queueApi.getQueueShuffleAnchor(nextQueue.id);

          // Get the track at the shuffled position
          const trackToPlay = await queueApi.getQueueTrackAtShuffledPosition(nextQueue.id, currentIndex, seed, anchor);

          // Play from the saved position
          if (trackToPlay) {
            await playerApi.playFile(trackToPlay.file_path);

            // Update PlayerContext with the new queue position
            await updateQueuePosition(nextQueue.id, currentIndex);
          }
        }
      }

      // Delete the queue
      await queueApi.deleteQueue(queueId);

      if (selectedQueue?.id === queueId) {
        setSelectedQueue(null);
        setQueueTracks([]);
      }
      
      // Reload queues and check if all are deleted
      const remainingQueues = await queueApi.getAllQueues();
      if (remainingQueues.length === 0) {
        // All queues deleted, clear player state
        clearPlayer();
      }
      
      await loadQueues(true);
    } catch (error) {
      console.error("Failed to delete queue:", error);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100%", overflow: "hidden" }}>
      {/* Queue List Sidebar / Dropdown */}
      {isMobile ? (
        // Mobile: Dropdown selector
        <Box sx={{ px: 2, flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "15px 20px",
              backgroundColor: "#1a1a1a",
              borderBottom: "1px solid #333",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "18px" }}>Queues</h2>
          </div>
          {queues.length === 0 ? (
            <Box sx={{ color: "text.secondary", fontSize: "14px", textAlign: "center" }}>
              No queues yet. Click any track to create a queue.
            </Box>
          ) : filteredQueues.length === 0 ? (
            <Box sx={{ color: "text.secondary", fontSize: "14px", textAlign: "center" }}>
              No queues found matching "{searchQuery}"
            </Box>
          ) : (
            <div></div>
          )}
          {searchQuery && onClearSearch && (
            <div className="search-tip">
              <span>Searching "{searchQuery}", </span>
              <button
                onClick={onClearSearch}
              >
                show all items
              </button>
            </div>
          )}
        </Box>
      ) : (
        // Desktop: Sidebar
        <div
          style={{
            width: "33%",
            borderRight: "1px solid #333",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "15px 20px",
              backgroundColor: "#1a1a1a",
              borderBottom: "1px solid #333",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "18px" }}>Queues</h2>
          </div>
          {searchQuery && onClearSearch && (
            <div className="search-tip">
              <span>Searching "{searchQuery}", </span>
              <button
                onClick={onClearSearch}
              >
                show all items
              </button>
            </div>
          )}
          {queues.length === 0 ? (
            <Box sx={{ color: "text.secondary", fontSize: "14px", textAlign: "center", padding: "20px" }}>
              No queues yet.
              <br />
              Click any track to create a queue.
            </Box>
          ) : filteredQueues.length === 0 ? (
            <Box sx={{ color: "text.secondary", fontSize: "14px", textAlign: "center", padding: "20px" }}>
              No queues found matching "{searchQuery}"
            </Box>
          ) : (
            <List disablePadding>
              {filteredQueues.map((queue) => (
                <ListItem
                  key={queue.id}
                  disablePadding
                  sx={{ mb: 1 }}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteQueue(queue.id);
                      }}
                      sx={{ color: "text.secondary" }}
                    >
                      <CloseIcon />
                    </IconButton>
                  }
                >
                  <ListItemButton
                    onClick={() => handleSelectQueue(queue)}
                    selected={selectedQueue?.id === queue.id}
                    sx={{
                      borderRadius: "6px",
                      "&.Mui-selected": {
                        bgcolor: "action.selected",
                      },
                    }}
                  >
                    <ListItemText
                      primary={queue.is_active ? `▶ ${queue.name}` : queue.name}
                      primaryTypographyProps={{
                        fontWeight: queue.is_active ? 700 : 500,
                        color: queue.is_active ? "primary.main" : "text.primary"
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </div>
      )}

      {/* Queue Tracks */}
      <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        {selectedQueue ? (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5, flexShrink: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>

                {isMobile ? (<FormControl size="small">
                  <Select
                    value={selectedQueue?.id || ""}
                    onChange={(e) => {
                      const queue = queues.find(q => q.id === e.target.value);
                      if (queue) handleSelectQueue(queue);
                    }}
                    displayEmpty
                    renderValue={(value) => {
                      const queue = queues.find(q => q.id === value);
                      if (!queue) return "Select a queue";
                      return (
                        <Typography
                          sx={{
                            fontWeight: queue.is_active ? 700 : 500,
                            color: queue.is_active ? "primary.main" : "text.primary",
                          }}
                        >
                          {queue.is_active ? `▶ ${queue.name}` : queue.name}
                        </Typography>
                      );
                    }}
                    sx={{
                      bgcolor: "background.paper",
                      "& .MuiSelect-select": {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }
                    }}
                  >
                    {!selectedQueue && (
                      <MenuItem value="" disabled>
                        Select a queue
                      </MenuItem>
                    )}
                    {filteredQueues.map((queue) => (
                      <MenuItem
                        key={queue.id}
                        value={queue.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
                          <Typography
                            sx={{
                              fontWeight: queue.is_active ? 700 : 500,
                              color: queue.is_active ? "primary.main" : "text.primary",
                            }}
                          >
                            {queue.is_active ? `▶ ${queue.name}` : queue.name}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteQueue(queue.id);
                          }}
                          sx={{ color: "text.secondary" }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>) : (<Typography component="h2" sx={{ margin: "0px", fontSize: "18px" }}>
                  {selectedQueue.name}
                </Typography>)}
              </Box>
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <IconButton
                  onClick={() => trackListRef.current?.scrollToActiveTrack()}
                  disabled={queueTracks.length === 0}
                  sx={{
                    width: 36,
                    height: 36,
                  }}
                  title="Locate active track"
                >
                  <MyLocationIcon sx={{ fontSize: "18px" }} />
                </IconButton>
                <IconButton
                  onClick={handleToggleShuffle}
                  disabled={queueTracks.length === 0}
                  sx={{
                    width: 36,
                    height: 36,
                    color: selectedQueue.shuffle_seed !== 1 ? "primary.main" : "text.secondary",
                  }}
                  title={selectedQueue.shuffle_seed !== 1 ? "Disable shuffle" : "Enable shuffle"}
                >
                  <ShuffleIcon sx={{ fontSize: "18px" }} />
                </IconButton>
                <IconButton
                  onClick={handlePlayQueue}
                  disabled={queueTracks.length === 0}
                  title={selectedQueue.is_active && isPlaying ? "Pause" : selectedQueue.is_active ? "Play" : "Play this queue"}
                  sx={{
                    color: "primary.main",
                    width: 36,
                    height: 36,
                  }}
                >
                  {selectedQueue.is_active && isPlaying ? <PauseIcon sx={{ fontSize: "18px" }} /> : <PlayArrowIcon sx={{ fontSize: "18px" }} />}
                </IconButton>
              </Box>
            </Box>
            {loading ? (
              <Box sx={{ textAlign: "center", py: 5 }}>
                <CircularProgress />
              </Box>
            ) : queueTracks.length > 0 ? (
              <>
                <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
                  <VirtualTrackList
                    ref={trackListRef}
                    tracks={queueTracks}
                    contextType="queue"
                    queueId={selectedQueue.id}
                    isActiveQueue={selectedQueue.is_active}
                    showPlayingIndicator={true}
                    onQueueActivated={() => loadQueues(true)}
                    showSearch={true}
                  />
                </div>
              </>
            ) : (
              <Typography sx={{ textAlign: "center", py: 5, color: "text.secondary" }}>
                No tracks in this queue.
              </Typography>
            )}
          </>
        ) : (
          <Typography sx={{ textAlign: "center", py: 5, color: "text.secondary" }}>
            Select a queue to view tracks
          </Typography>
        )}
      </div>
    </div>
  );
});

export default QueuesView;
