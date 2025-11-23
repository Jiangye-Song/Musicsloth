import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { libraryApi, Track, playerApi, queueApi } from "../services/api";
import { usePlayer } from "../contexts/PlayerContext";
import { Box, Avatar, Typography, TextField, Paper, List, ListItem, ListItemButton, ListItemText, InputAdornment, ClickAwayListener } from "@mui/material";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import SearchIcon from "@mui/icons-material/Search";

const ITEM_HEIGHT = 80;
const OVERSCAN = 10; // Number of items to render beyond visible area
const MAX_CONCURRENT_LOADS = 3; // Limit concurrent album art loads

export interface VirtualTrackListRef {
  scrollToActiveTrack: () => void;
}

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

const VirtualTrackList = forwardRef<VirtualTrackListRef, VirtualTrackListProps>(({ tracks, contextType, contextName, queueId, isActiveQueue = true, showPlayingIndicator = false, onQueueActivated, showSearch = false }, ref) => {
// console.log(`[VirtualTrackList] Render - contextType: ${contextType}, tracks: ${tracks.length}, showSearch: ${showSearch}`);
  const { updateQueuePosition } = usePlayer();
  const albumArtCacheRef = useRef<Map<string, string>>(new Map());
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(20);
  const [currentPlayingFile, setCurrentPlayingFile] = useState<string | null>(null);
  const [queueCurrentIndex, setQueueCurrentIndex] = useState<number>(-1);
  const [, setAlbumArtVersion] = useState(0); // Force re-render when album art loads
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ track: Track; index: number; albumArt?: string }>>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [flashingIndex, setFlashingIndex] = useState<number | null>(null);
  const [dropdownAlbumArtCache, setDropdownAlbumArtCache] = useState<Map<string, string>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingArtRef = useRef<Set<string>>(new Set());
  const loadQueueRef = useRef<string[]>([]);
  const activeLoadsRef = useRef(0);
  const searchInputRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const dropdownObserverRef = useRef<IntersectionObserver | null>(null);

  // Calculate visible range on scroll with debounce
  const scrollTimeoutRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (!containerRef.current) {
      console.log(`[VirtualTrackList] handleScroll - no containerRef`);
      return;
    }
    
    if (scrollTimeoutRef.current !== null) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = window.setTimeout(() => {
      if (!containerRef.current) return;
      
      const scrollTop = containerRef.current.scrollTop;
      const viewportHeight = containerRef.current.clientHeight;
      
      console.log(`[VirtualTrackList] handleScroll - scrollTop: ${scrollTop}, viewportHeight: ${viewportHeight}`);
      
      // Don't calculate if container not properly sized yet
      if (viewportHeight === 0) {
        console.log(`[VirtualTrackList] Scroll - container not sized yet, skipping`);
        return;
      }
      
      const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
      const end = Math.min(
        tracks.length,
        Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN
      );
      
      console.log(`[VirtualTrackList] Scroll - calculated range: ${start}-${end}, total: ${tracks.length}`);
      setVisibleStart(start);
      setVisibleEnd(end);
    }, 50); // Debounce scroll events
  }, [tracks.length]);

  // Search for tracks and show results in dropdown with debounce
  useEffect(() => {
    console.log(`[VirtualTrackList] Search useEffect triggered - query: "${searchQuery}"`);
    // Clear previous timeout
    if (searchDebounceRef.current !== null) {
      clearTimeout(searchDebounceRef.current);
    }

    if (searchQuery.trim() === "") {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Debounce search for 300ms
    searchDebounceRef.current = window.setTimeout(() => {
      const searchStart = performance.now();
      console.log(`[VirtualTrackList] Executing search for: "${searchQuery}"`);
      const query = searchQuery.toLowerCase();
      const results = tracks
        .map((track, index) => ({ track, index }))
        .filter(
          ({ track }) =>
            track.title.toLowerCase().includes(query) ||
            track.artist?.toLowerCase().includes(query) ||
            track.album?.toLowerCase().includes(query)
        )
        .slice(0, 50); // Limit to 50 results

      const searchEnd = performance.now();
      // Set results with IDs only, album art will be loaded lazily on scroll
      console.log(`[VirtualTrackList] Search completed in ${(searchEnd - searchStart).toFixed(2)}ms - ${results.length} tracks found`);
      setSearchResults(results);
      setShowDropdown(results.length > 0);
    }, 300); // 300ms debounce delay

    return () => {
      if (searchDebounceRef.current !== null) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, tracks]);

  // Lazy load album art for dropdown results
  useEffect(() => {
    console.log(`[VirtualTrackList] Dropdown observer useEffect - showDropdown: ${showDropdown}, results: ${searchResults.length}`);
    if (!showDropdown || searchResults.length === 0) return;

    // Create intersection observer for dropdown items
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const filePath = entry.target.getAttribute('data-file-path');
            if (!filePath) return;

            // Check if already in cache or loading
            if (dropdownAlbumArtCache.has(filePath) || loadingArtRef.current.has(filePath)) {
              return;
            }

            // Load album art
            loadingArtRef.current.add(filePath);
            (async () => {
              try {
                const artData = await libraryApi.getAlbumArt(filePath);
                if (artData) {
                  const blob = new Blob([new Uint8Array(artData)], { type: "image/jpeg" });
                  const url = URL.createObjectURL(blob);
                  setDropdownAlbumArtCache(prev => {
                    const newCache = new Map(prev);
                    newCache.set(filePath, url);
                    return newCache;
                  });
                  // Also update main cache
                  albumArtCacheRef.current.set(filePath, url);
                }
              } catch (error) {
                // Silently ignore errors
              } finally {
                loadingArtRef.current.delete(filePath);
              }
            })();
          }
        });
      },
      {
        root: null,
        rootMargin: "50px",
        threshold: 0.1,
      }
    );

    dropdownObserverRef.current = observer;

    return () => {
      observer.disconnect();
    };
  }, [showDropdown, searchResults]);

  // Initialize visible range
  useEffect(() => {
    console.log(`[VirtualTrackList] Initialize visible range useEffect - tracks: ${tracks.length}`);
    let attempts = 0;
    // Use requestAnimationFrame to ensure DOM is ready
    const initializeVisibleRange = () => {
      attempts++;
      console.log(`[VirtualTrackList] Initialize attempt ${attempts}, containerRef exists: ${!!containerRef.current}, clientHeight: ${containerRef.current?.clientHeight || 0}`);
      if (containerRef.current && containerRef.current.clientHeight > 0) {
        console.log(`[VirtualTrackList] Container ready, calling handleScroll`);
        handleScroll();
      } else if (attempts < 60) { // Max 60 attempts (~1 second)
        // Retry after a short delay if container not ready
        console.log(`[VirtualTrackList] Container not ready, retrying...`);
        requestAnimationFrame(initializeVisibleRange);
      } else {
        console.log(`[VirtualTrackList] Container initialization timeout after ${attempts} attempts`);
      }
    };
    
    requestAnimationFrame(initializeVisibleRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.length]);

  // Load current queue index for all queues (active and inactive)
  useEffect(() => {
    console.log(`[VirtualTrackList] Queue index useEffect - contextType: ${contextType}, queueId: ${queueId}, isActiveQueue: ${isActiveQueue}`);
    if (contextType === "queue" && queueId !== undefined) {
      queueApi.getQueueCurrentIndex(queueId)
        .then(index => {
          console.log(`[VirtualTrackList] Loaded queue index: ${index} for queue ${queueId}`);
          setQueueCurrentIndex(index);
        })
        .catch(err => console.error("Failed to get queue current index:", err));
    }
  }, [contextType, queueId]);

  // Update currently playing track
  useEffect(() => {
    console.log(`[VirtualTrackList] Playing track useEffect - showPlayingIndicator: ${showPlayingIndicator}`);
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
    console.log(`[VirtualTrackList] processLoadQueue - queue length: ${loadQueueRef.current.length}, active: ${activeLoadsRef.current}`);
    while (loadQueueRef.current.length > 0 && activeLoadsRef.current < MAX_CONCURRENT_LOADS) {
      const filePath = loadQueueRef.current.shift();
      if (!filePath) continue;
      
      // Skip if already loaded or currently loading
      if (albumArtCacheRef.current.has(filePath) || loadingArtRef.current.has(filePath)) {
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
            albumArtCacheRef.current.set(filePath, url);
            console.log(`[VirtualTrackList] Loaded album art for: ${filePath.substring(filePath.lastIndexOf('/') + 1)}, URL: ${url.substring(0, 50)}`);
            // Force re-render by updating version counter
            setAlbumArtVersion(v => v + 1);
          }
        } catch (error) {
          console.error(`[VirtualTrackList] Failed to load album art for: ${filePath}`, error);
        } finally {
          loadingArtRef.current.delete(filePath);
          activeLoadsRef.current--;
          processLoadQueue(); // Process next item
        }
      })();
    }
  }, []);

  // Load album art for visible tracks
  useEffect(() => {
    console.log(`[VirtualTrackList] Load visible tracks useEffect - range: ${visibleStart}-${visibleEnd}, total tracks: ${tracks.length}`);
    // Clear queue and add visible tracks
    loadQueueRef.current = [];
    const visibleTracks = tracks.slice(visibleStart, visibleEnd);
    console.log(`[VirtualTrackList] Visible tracks count: ${visibleTracks.length}`);
    let queuedCount = 0;
    visibleTracks.forEach(track => {
      if (!albumArtCacheRef.current.has(track.file_path) && !loadingArtRef.current.has(track.file_path)) {
        loadQueueRef.current.push(track.file_path);
        queuedCount++;
      }
    });
    console.log(`[VirtualTrackList] Queued ${queuedCount} tracks for album art loading`);
    
    processLoadQueue();
  }, [visibleStart, visibleEnd, tracks, processLoadQueue]);

  // Cleanup blob URLs on unmount and when they're far from viewport
  useEffect(() => {
    console.log(`[VirtualTrackList] Cleanup useEffect - range: ${visibleStart}-${visibleEnd}`);
    // Cleanup album art that's far from viewport
    const visibleFilePaths = new Set(
      tracks.slice(
        Math.max(0, visibleStart - OVERSCAN * 2),
        Math.min(tracks.length, visibleEnd + OVERSCAN * 2)
      ).map(t => t.file_path)
    );
    
    // Remove cached art that's far from viewport
    const cache = albumArtCacheRef.current;
    const toDelete: string[] = [];
    
    cache.forEach((url, filePath) => {
      if (!visibleFilePaths.has(filePath)) {
        URL.revokeObjectURL(url);
        toDelete.push(filePath);
      }
    });
    
    toDelete.forEach(filePath => cache.delete(filePath));
  }, [visibleStart, visibleEnd, tracks]);

  // Cleanup all blob URLs on unmount
  useEffect(() => {
    return () => {
      albumArtCacheRef.current.forEach(url => URL.revokeObjectURL(url));
      dropdownAlbumArtCache.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Cleanup dropdown album art when dropdown closes
  useEffect(() => {
    if (!showDropdown) {
      // Clean up dropdown cache when dropdown closes
      dropdownAlbumArtCache.forEach((url, filePath) => {
        if (!albumArtCacheRef.current.has(filePath)) {
          URL.revokeObjectURL(url);
        }
      });
      setDropdownAlbumArtCache(new Map());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDropdown]);

  const handlePlayTrack = async (track: Track, index: number) => {
    try {
      if (contextType === "queue" && queueId !== undefined) {
        // If we're in a queue view, just play the track directly
        // and set this queue as active
        await queueApi.setActiveQueue(queueId);
        // Immediately update the current playing file and queue index for instant visual feedback
        setCurrentPlayingFile(track.file_path);
        setQueueCurrentIndex(index);
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

  const scrollToTrack = (index: number) => {
    if (!containerRef.current) return;
    
    const scrollTop = index * ITEM_HEIGHT;
    containerRef.current.scrollTo({
      top: scrollTop,
      behavior: "smooth",
    });
    
    // Flash the item
    setFlashingIndex(index);
    setTimeout(() => setFlashingIndex(null), 1000);
    
    // Close dropdown and clear search
    setShowDropdown(false);
    setSearchQuery("");
  };

  // Expose scrollToActiveTrack to parent via ref
  useImperativeHandle(ref, () => ({
    scrollToActiveTrack: () => {
      if (contextType === "queue" && !isActiveQueue && queueCurrentIndex >= 0) {
        scrollToTrack(queueCurrentIndex);
      } else if (showPlayingIndicator && currentPlayingFile) {
        const index = tracks.findIndex(t => t.file_path === currentPlayingFile);
        if (index >= 0) {
          scrollToTrack(index);
        }
      }
    }
  }));

  const handleSearchResultClick = (index: number) => {
    scrollToTrack(index);
  };

  const visibleTracks = tracks.slice(visibleStart, visibleEnd);

  if (tracks.length === 0) {
    return (
      <Box sx={{ p: 2.5, bgcolor: "background.paper", borderRadius: 1, textAlign: "center" }}>
        <Typography sx={{ color: "text.secondary", m: 0 }}>No tracks found.</Typography>
      </Box>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Search Bar with Dropdown */}
      {showSearch && (
        <ClickAwayListener onClickAway={() => setShowDropdown(false)}>
          <Box sx={{ position: "relative", zIndex: 10 }}>
            <Paper
              sx={{
                p: 0.5,
                bgcolor: "transparent",
                boxShadow: "none",
                borderRadius: 0,
              }}
            >
              <TextField
                ref={searchInputRef}
                fullWidth
                size="small"
                placeholder="Search in this list..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) {
                    setShowDropdown(true);
                  }
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: "text.secondary", fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  sx: {
                    fontSize: "0.875rem",
                    bgcolor: "transparent",
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: "divider",
                    },
                    "&:hover .MuiOutlinedInput-notchedOutline": {
                      borderColor: "primary.main",
                    },
                    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                      borderColor: "primary.main",
                    },
                  },
                }}
              />
            </Paper>
            
            {/* Dropdown Results */}
            {showDropdown && searchResults.length > 0 && (
              <Paper
                sx={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  maxHeight: 300,
                  overflow: "auto",
                  zIndex: 1000,
                  bgcolor: "background.paper",
                  boxShadow: 3,
                }}
              >
                <List dense sx={{ py: 0 }}>
                  {searchResults.map(({ track, index }) => {
                    const albumArt = dropdownAlbumArtCache.get(track.file_path) || albumArtCacheRef.current.get(track.file_path);
                    
                    return (
                      <ListItem 
                        key={`${track.id}-${index}`} 
                        disablePadding
                        data-file-path={track.file_path}
                        ref={(el) => {
                          if (el && dropdownObserverRef.current) {
                            dropdownObserverRef.current.observe(el);
                          }
                        }}
                      >
                        <ListItemButton
                          onClick={() => handleSearchResultClick(index)}
                          sx={{
                            py: 1,
                            px: 2,
                            display: "flex",
                            gap: 1.5,
                            "&:hover": {
                              bgcolor: "action.hover",
                            },
                          }}
                        >
                          <Avatar
                            src={albumArt || undefined}
                            alt={track.album || "Album"}
                            variant="rounded"
                            sx={{
                              width: 40,
                              height: 40,
                              bgcolor: "background.default",
                              flexShrink: 0,
                            }}
                          >
                            <MusicNoteIcon sx={{ opacity: 0.3, fontSize: 20 }} />
                          </Avatar>
                          <ListItemText
                            primary={track.title}
                            secondary={`${track.artist || "Unknown Artist"} • ${track.album || "Unknown Album"}`}
                            primaryTypographyProps={{
                              fontSize: "0.875rem",
                              fontWeight: 500,
                              noWrap: true,
                            }}
                            secondaryTypographyProps={{
                              fontSize: "0.75rem",
                              noWrap: true,
                            }}
                          />
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                </List>
              </Paper>
            )}
          </Box>
        </ClickAwayListener>
      )}
      
      {/* Track List */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        style={{
          backgroundColor: "#2a2a2a",
          borderRadius: showSearch ? "0 0 8px 8px" : "8px",
          overflow: "auto",
          height: "600px",
          maxHeight: "70vh",
          position: "relative",
        }}
      >
        {/* Spacer for virtual scrolling */}
        <div style={{ height: `${tracks.length * ITEM_HEIGHT}px`, position: "relative" }}>
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
            const albumArt = albumArtCacheRef.current.get(track.file_path);
            const actualIndex = visibleStart + visibleIndex;
            const isPlaying = showPlayingIndicator && currentPlayingFile === track.file_path;
            const isQueueCurrentTrack = contextType === "queue" && actualIndex === queueCurrentIndex;
            const isInactiveQueue = contextType === "queue" && !isActiveQueue;
            const shouldHighlight = isPlaying || isQueueCurrentTrack;
            const isFlashing = flashingIndex === actualIndex;
            
            // Debug log for first few tracks
            if (actualIndex < 3) {
              console.log(`[VirtualTrackList] Track ${actualIndex}: ${track.title}, albumArt exists: ${!!albumArt}, albumArt value: ${albumArt?.substring(0, 50)}`);
            }
            
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
                  bgcolor: isFlashing ? "primary.dark" : (shouldHighlight ? "action.selected" : "transparent"),
                  borderLeft: 3,
                  borderLeftColor: shouldHighlight ? "primary.main" : "transparent",
                  opacity: isInactiveQueue ? 0.6 : 1,
                  animation: isFlashing ? "flash 1s ease-in-out" : "none",
                  "@keyframes flash": {
                    "0%": { bgcolor: "primary.dark" },
                    "50%": { bgcolor: "primary.main" },
                    "100%": { bgcolor: "transparent" },
                  },
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
                  {!albumArt && (
                    <MusicNoteIcon sx={{ opacity: 0.3 }} />
                  )}
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
      </div>
    </div>
  );
});

VirtualTrackList.displayName = "VirtualTrackList";

export default VirtualTrackList;
