import { useState, useEffect, useRef, useCallback } from "react";
import { libraryApi, Track, playerApi, queueApi } from "../services/api";
import { usePlayer } from "../contexts/PlayerContext";
import { Box, Avatar, Typography } from "@mui/material";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import SearchBar from "./SearchBar";

const ITEM_HEIGHT = 80;
const OVERSCAN = 10; // Number of items to render beyond visible area
const MAX_CONCURRENT_LOADS = 3; // Limit concurrent album art loads

interface VirtualTrackListProps {
  tracks: Track[];
  contextType: "library" | "artist" | "album" | "genre" | "queue";
  contextName?: string; // Artist name, album name, or genre name
  queueId?: number; // Queue ID if contextType is "queue"
  isActiveQueue?: boolean; // Whether this queue is the active one
  showPlayingIndicator?: boolean; // Show visual indicator for currently playing track
  onQueueActivated?: () => void; // Callback when queue is activated
  showSearch?: boolean; // Whether to show the search bar
}

export default function VirtualTrackList({ tracks, contextType, contextName, queueId, isActiveQueue = true, showPlayingIndicator = false, onQueueActivated, showSearch = false }: VirtualTrackListProps) {
  const { updateQueuePosition } = usePlayer();
  const [albumArtCache, setAlbumArtCache] = useState<Map<string, string>>(new Map());
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(20);
  const [currentPlayingFile, setCurrentPlayingFile] = useState<string | null>(null);
  const [queueCurrentIndex, setQueueCurrentIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredTracks, setFilteredTracks] = useState<Track[]>(tracks);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingArtRef = useRef<Set<string>>(new Set());
  const loadQueueRef = useRef<string[]>([]);
  const activeLoadsRef = useRef(0);

  // Calculate visible range on scroll with debounce
  const scrollTimeoutRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    if (scrollTimeoutRef.current !== null) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = window.setTimeout(() => {
      if (!containerRef.current) return;
      
      const scrollTop = containerRef.current.scrollTop;
      const viewportHeight = containerRef.current.clientHeight;
      
      const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
      const end = Math.min(
        filteredTracks.length,
        Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN
      );
      
      setVisibleStart(start);
      setVisibleEnd(end);
    }, 50); // Debounce scroll events
  }, [filteredTracks.length]);

  // Filter tracks based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredTracks(tracks);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredTracks(
        tracks.filter(
          (track) =>
            track.title.toLowerCase().includes(query) ||
            track.artist?.toLowerCase().includes(query) ||
            track.album?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, tracks]);

  // Initialize visible range
  useEffect(() => {
    handleScroll();
  }, [filteredTracks, handleScroll]);

  // Load current queue index for inactive queues
  useEffect(() => {
    if (contextType === "queue" && queueId !== undefined && !isActiveQueue) {
      queueApi.getQueueCurrentIndex(queueId)
        .then(index => setQueueCurrentIndex(index))
        .catch(err => console.error("Failed to get queue current index:", err));
    }
  }, [contextType, queueId, isActiveQueue]);

  // Update currently playing track
  useEffect(() => {
    if (!showPlayingIndicator) return;

    const updatePlayingTrack = async () => {
      try {
        const state = await playerApi.getState();
        setCurrentPlayingFile(state.current_file);
      } catch (error) {
        console.error("Failed to get player state:", error);
      }
    };

    updatePlayingTrack();
    const interval = setInterval(updatePlayingTrack, 1000);
    return () => clearInterval(interval);
  }, [showPlayingIndicator]);

  // Process album art load queue
  const processLoadQueue = useCallback(async () => {
    while (loadQueueRef.current.length > 0 && activeLoadsRef.current < MAX_CONCURRENT_LOADS) {
      const filePath = loadQueueRef.current.shift();
      if (!filePath) continue;
      
      // Skip if already loaded or currently loading
      if (albumArtCache.has(filePath) || loadingArtRef.current.has(filePath)) {
        continue;
      }
      
      loadingArtRef.current.add(filePath);
      activeLoadsRef.current++;
      
      // Load in background
      (async () => {
        try {
          const artData = await libraryApi.getAlbumArt(filePath);
          if (artData) {
            const blob = new Blob([new Uint8Array(artData)], { type: "image/jpeg" });
            const url = URL.createObjectURL(blob);
            setAlbumArtCache(prev => {
              const newCache = new Map(prev);
              newCache.set(filePath, url);
              return newCache;
            });
          }
        } catch (error) {
          // Silently ignore errors during scrolling
        } finally {
          loadingArtRef.current.delete(filePath);
          activeLoadsRef.current--;
          processLoadQueue(); // Process next item
        }
      })();
    }
  }, [albumArtCache]);

  // Load album art for visible tracks
  useEffect(() => {
    // Clear queue and add visible tracks
    loadQueueRef.current = [];
    const visibleTracks = filteredTracks.slice(visibleStart, visibleEnd);
    visibleTracks.forEach(track => {
      if (!albumArtCache.has(track.file_path) && !loadingArtRef.current.has(track.file_path)) {
        loadQueueRef.current.push(track.file_path);
      }
    });
    
    processLoadQueue();
  }, [visibleStart, visibleEnd, filteredTracks, albumArtCache, processLoadQueue]);

  // Cleanup blob URLs on unmount and when they're far from viewport
  useEffect(() => {
    // Cleanup album art that's far from viewport
    const visibleFilePaths = new Set(
      filteredTracks.slice(
        Math.max(0, visibleStart - OVERSCAN * 2),
        Math.min(filteredTracks.length, visibleEnd + OVERSCAN * 2)
      ).map(t => t.file_path)
    );
    
    // Remove cached art that's far from viewport
    setAlbumArtCache(prev => {
      const newCache = new Map(prev);
      let changed = false;
      
      prev.forEach((url, filePath) => {
        if (!visibleFilePaths.has(filePath)) {
          URL.revokeObjectURL(url);
          newCache.delete(filePath);
          changed = true;
        }
      });
      
      return changed ? newCache : prev;
    });
  }, [visibleStart, visibleEnd, filteredTracks]);

  // Cleanup all blob URLs on unmount
  useEffect(() => {
    return () => {
      albumArtCache.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handlePlayTrack = async (track: Track, index: number) => {
    try {
      if (contextType === "queue" && queueId !== undefined) {
        // If we're in a queue view, just play the track directly
        // and set this queue as active
        await queueApi.setActiveQueue(queueId);
        // Immediately update the current playing file for instant visual feedback
        setCurrentPlayingFile(track.file_path);
        await playerApi.playFile(track.file_path);
        // Update queue position
        await updateQueuePosition(queueId, index);
        // Notify parent to refresh queue status
        if (onQueueActivated) {
          onQueueActivated();
        }
      } else {
        // Create queue name based on context
        const queueName = contextType === "library" 
          ? "Library"
          : contextType === "artist"
          ? `Artist: ${contextName}`
          : contextType === "album"
          ? `Album: ${contextName}`
          : `Genre: ${contextName}`;
        
        // Get all track IDs (use original tracks, not filtered)
        console.log(`[Frontend] Getting track IDs from ${tracks.length} tracks...`);
        const trackIds = tracks.map(t => t.id);
        console.log(`[Frontend] Got ${trackIds.length} track IDs`);
        
        // Create or reuse queue (backend handles duplicate detection and returns immediately after first batch)
        console.log(`[Frontend] Creating queue "${queueName}"...`);
        const newQueueId = await queueApi.createQueueFromTracks(queueName, trackIds, index);
        console.log(`[Frontend] Queue created successfully with ID: ${newQueueId}`);
        
        // Play the clicked track immediately (don't wait for full queue to load)
        console.log(`[Frontend] Playing track: ${track.file_path}`);
        await playerApi.playFile(track.file_path);
        console.log(`[Frontend] Track playback started`);
        
        // Update queue position for new queue
        await updateQueuePosition(newQueueId, index);
      }
    } catch (error) {
      console.error("Failed to play track:", error);
      alert(`Failed to play track: ${error}`);
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const visibleTracks = filteredTracks.slice(visibleStart, visibleEnd);

  if (tracks.length === 0) {
    return (
      <Box sx={{ p: 2.5, bgcolor: "background.paper", borderRadius: 1, textAlign: "center" }}>
        <Typography sx={{ color: "text.secondary", m: 0 }}>No tracks found.</Typography>
      </Box>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search Bar */}
      {showSearch && (
        <SearchBar
          placeholder="Search in this list..."
          value={searchQuery}
          onChange={setSearchQuery}
          variant="secondary"
        />
      )}
      
      {/* Track List */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          backgroundColor: "#2a2a2a",
          borderRadius: showSearch ? "0 0 8px 8px" : "8px",
          overflow: "auto",
          flex: 1,
          position: "relative",
        }}
      >
        {filteredTracks.length === 0 ? (
          <Box sx={{ p: 2.5, textAlign: "center" }}>
            <Typography sx={{ color: "text.secondary", m: 0 }}>
              No tracks found matching "{searchQuery}"
            </Typography>
          </Box>
        ) : (
          <>
            {/* Spacer for virtual scrolling */}
            <div style={{ height: `${filteredTracks.length * ITEM_HEIGHT}px`, minHeight: "100%", position: "relative" }}>
        {/* Only render visible items */}
        <div
          style={{
            position: "absolute",
            top: `${visibleStart * ITEM_HEIGHT}px`,
            left: 0,
            right: 0,
          }}
        >
          {visibleTracks.map((track, visibleIndex) => {
            const albumArt = albumArtCache.get(track.file_path);
            const actualIndex = visibleStart + visibleIndex;
            const isPlaying = showPlayingIndicator && currentPlayingFile === track.file_path;
            const isInactiveQueue = contextType === "queue" && !isActiveQueue;
            const isQueueCurrentTrack = isInactiveQueue && actualIndex === queueCurrentIndex;
            const shouldHighlight = isPlaying || isQueueCurrentTrack;
            
            return (
              <Box
                key={track.id}
                onClick={() => handlePlayTrack(track, actualIndex)}
                sx={{
                  height: ITEM_HEIGHT,
                  display: "flex",
                  alignItems: "center",
                  px: 2,
                  py: 1.25,
                  borderBottom: 1,
                  borderColor: "divider",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                  bgcolor: shouldHighlight ? "action.selected" : "transparent",
                  borderLeft: 3,
                  borderLeftColor: shouldHighlight ? "primary.main" : "transparent",
                  opacity: isInactiveQueue ? 0.6 : 1,
                  "&:hover": {
                    bgcolor: shouldHighlight ? "action.selected" : "action.hover",
                  },
                }}
              >
                {/* Album Art */}
                <Avatar
                  src={albumArt || undefined}
                  alt={track.album || "Album"}
                  variant="rounded"
                  sx={{
                    width: 60,
                    height: 60,
                    mr: 2,
                    bgcolor: "background.default",
                  }}
                >
                  <MusicNoteIcon sx={{ opacity: 0.3 }} />
                </Avatar>

                {/* Track Info */}
                <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.25 }}>
                  <Typography
                    sx={{
                      fontSize: "15px",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontStyle: isInactiveQueue ? "italic" : "normal",
                    }}
                  >
                    {track.title}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "13px",
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontStyle: isInactiveQueue ? "italic" : "normal",
                    }}
                  >
                    {track.artist || "Unknown Artist"}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "13px",
                      color: "text.disabled",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontStyle: isInactiveQueue ? "italic" : "normal",
                    }}
                  >
                    {track.album || "Unknown Album"}
                  </Typography>
                </Box>

                {/* Duration */}
                <Typography
                  sx={{
                    fontSize: "14px",
                    color: "text.disabled",
                    ml: 2,
                    flexShrink: 0,
                  }}
                >
                  {formatDuration(track.duration_ms)}
                </Typography>
              </Box>
            );
          })}
        </div>
      </div>
          </>
        )}
      </div>
    </div>
  );
}
