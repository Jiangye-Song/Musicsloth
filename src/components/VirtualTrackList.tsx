import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { libraryApi, Track, playerApi, queueApi, playlistApi } from "../services/api";
import { usePlayer } from "../contexts/PlayerContext";
import { Box, Avatar, Typography, TextField, Paper, List, ListItem, ListItemButton, ListItemText, InputAdornment, ClickAwayListener, Checkbox, Button, IconButton } from "@mui/material";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import TrackContextMenu from "./TrackContextMenu";
import AddToPlaylistDialog from "./AddToPlaylistDialog";
import AddToQueueDialog from "./AddToQueueDialog";
import SongInfoDialog from "./SongInfoDialog";

const ITEM_HEIGHT = 80;
const OVERSCAN = 10; // Number of items to render beyond visible area
const MAX_CONCURRENT_LOADS = 3; // Limit concurrent album art loads

export interface VirtualTrackListRef {
  scrollToActiveTrack: () => void;
}

interface VirtualTrackListProps {
  tracks: Track[];
  contextType: "library" | "artist" | "album" | "genre" | "queue" | "playlist";
  contextName?: string; // Artist name, album name, or genre name
  queueId?: number; // Queue ID if contextType is "queue"
  isActiveQueue?: boolean; // Whether this queue is the active one
  playlistId?: string | number; // Playlist ID if contextType is "playlist"
  isSystemPlaylist?: boolean; // Whether this is a system playlist (All Songs, Recently Added, etc.)
  showPlayingIndicator?: boolean; // Show visual indicator for currently playing track
  onQueueActivated?: () => void; // Callback when queue is activated
  onQueueTracksChanged?: (queueId: number) => void; // Callback when tracks are added/removed from a queue
  onPlaylistTracksChanged?: (playlistId: number) => void; // Callback when tracks are added/removed from a playlist
  showSearch?: boolean; // Whether to show the search bar
  initialTrackId?: number; // Track ID to scroll to and flash on mount
  onNavigateToArtist?: (artistName: string, trackId: number) => void;
  onNavigateToAlbum?: (albumName: string, trackId: number) => void;
  onNavigateToGenre?: (genreName: string, trackId: number) => void;
}

const VirtualTrackList = forwardRef<VirtualTrackListRef, VirtualTrackListProps>(({ tracks, contextType, contextName, queueId, isActiveQueue = true, playlistId, isSystemPlaylist = false, showPlayingIndicator = false, onQueueActivated, onQueueTracksChanged, onPlaylistTracksChanged, showSearch = false, initialTrackId, onNavigateToArtist, onNavigateToAlbum, onNavigateToGenre }, ref) => {
  // console.log(`[VirtualTrackList] Render - contextType: ${contextType}, tracks: ${tracks.length}, showSearch: ${showSearch}`);
  const { updateQueuePosition, currentQueueId, currentTrackIndex, isShuffled, loadShuffleStateFromQueue, setShuffleStateForNewQueue } = usePlayer();
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
  const [contextMenu, setContextMenu] = useState<{ top: number; left: number } | null>(null);
  const [selectedTrackForMenu, setSelectedTrackForMenu] = useState<{ id: number; title: string; position: number; track: Track } | null>(null);
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false);
  const [showQueueDialog, setShowQueueDialog] = useState(false);
  const [showSongInfoDialog, setShowSongInfoDialog] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedPositions, setSelectedPositions] = useState<Set<number>>(new Set());
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
  // Also update when PlayerContext's currentTrackIndex changes
  useEffect(() => {
    console.log(`[VirtualTrackList] Queue index useEffect - contextType: ${contextType}, queueId: ${queueId}, isActiveQueue: ${isActiveQueue}`);
    if (contextType === "queue" && queueId !== undefined) {
      // If this is the active queue and we have a currentTrackIndex from PlayerContext, use it
      if (isActiveQueue && currentQueueId === queueId && currentTrackIndex !== null) {
        console.log(`[VirtualTrackList] Using PlayerContext index: ${currentTrackIndex} for active queue ${queueId}`);
        setQueueCurrentIndex(currentTrackIndex);
      } else {
        // Otherwise, fetch from database
        queueApi.getQueueCurrentIndex(queueId)
          .then(index => {
            console.log(`[VirtualTrackList] Loaded queue index: ${index} for queue ${queueId}`);
            setQueueCurrentIndex(index);
          })
          .catch(err => console.error("Failed to get queue current index:", err));
      }
    }
  }, [contextType, queueId, isActiveQueue, currentQueueId, currentTrackIndex]);

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

  // Toggle selection of a track in multi-select mode
  const toggleTrackSelection = (position: number) => {
    setSelectedPositions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(position)) {
        newSet.delete(position);
      } else {
        newSet.add(position);
      }
      return newSet;
    });
  };

  // Select all visible tracks
  const selectAllTracks = () => {
    setSelectedPositions(new Set(tracks.map((_, i) => i)));
  };

  // Clear selection and exit multi-select mode
  const exitMultiSelectMode = () => {
    setIsMultiSelectMode(false);
    setSelectedPositions(new Set());
  };

  // Get selected track IDs (for bulk operations)
  const getSelectedTrackIds = (): number[] => {
    return Array.from(selectedPositions)
      .sort((a, b) => a - b)
      .map(pos => tracks[pos]?.id)
      .filter((id): id is number => id !== undefined);
  };

  // Get selected positions as sorted array
  const getSelectedPositionsSorted = (): number[] => {
    return Array.from(selectedPositions).sort((a, b) => a - b);
  };

  const handlePlayTrack = async (track: Track, index: number) => {
    // In multi-select mode, toggle selection instead of playing
    if (isMultiSelectMode) {
      toggleTrackSelection(index);
      return;
    }

    try {
      if (contextType === "queue" && queueId !== undefined) {
        // If we're in a queue view, just play the track directly
        // and set this queue as active
        await queueApi.setActiveQueue(queueId);
        // Load shuffle state for this queue (to update the shuffle button)
        await loadShuffleStateFromQueue(queueId);
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
              : contextType === "playlist"
                ? `Playlist: ${contextName}`
                : `Genre: ${contextName}`;

        // Check if we should inherit shuffle state from the current queue
        const shouldInheritShuffle = isShuffled;

        // Get all track IDs (use original tracks, not filtered)
        console.log(`[Frontend] Getting track IDs from ${tracks.length} tracks...`);
        const trackIds = tracks.map(t => t.id);
        console.log(`[Frontend] Got ${trackIds.length} track IDs`);

        // Create or reuse queue (backend handles duplicate detection and returns immediately after first batch)
        console.log(`[Frontend] Creating queue "${queueName}"...`);
        const newQueueId = await queueApi.createQueueFromTracks(queueName, trackIds, index);
        console.log(`[Frontend] Queue created successfully with ID: ${newQueueId}`);

        // Set shuffle state for the new queue (inherit from previous queue if it was shuffled)
        await setShuffleStateForNewQueue(newQueueId, shouldInheritShuffle);

        // Play the clicked track immediately (don't wait for full queue to load)
        console.log(`[Frontend] Playing track: ${track.file_path}`);
        await playerApi.playFile(track.file_path);
        console.log(`[Frontend] Track playback started`);

        // Update queue position - clicked track is always at position 0 after reordering
        await updateQueuePosition(newQueueId, 0);
        setQueueCurrentIndex(0);
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

  // Scroll to initial track if provided
  useEffect(() => {
    if (initialTrackId && tracks.length > 0) {
      const index = tracks.findIndex(t => t.id === initialTrackId);
      if (index >= 0) {
        // Delay to ensure DOM is ready
        setTimeout(() => scrollToTrack(index), 100);
      }
    }
  }, [initialTrackId, tracks]);

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
      {/* Multi-select Action Bar */}
      {isMultiSelectMode && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            p: 1,
            bgcolor: "primary.dark",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <IconButton size="small" onClick={exitMultiSelectMode} sx={{ color: "white" }}>
            <CloseIcon />
          </IconButton>
          <Typography sx={{ color: "white", fontWeight: 500 }}>
            {selectedPositions.size} selected
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" onClick={selectAllTracks} sx={{ color: "white" }}>
            Select All
          </Button>
          <Button 
            size="small" 
            onClick={() => {
              // Invert selection
              const newSet = new Set<number>();
              for (let i = 0; i < tracks.length; i++) {
                if (!selectedPositions.has(i)) {
                  newSet.add(i);
                }
              }
              setSelectedPositions(newSet);
            }} 
            sx={{ color: "white" }}
          >
            Invert
          </Button>
          <Button 
            size="small" 
            disabled={selectedPositions.size < 2}
            onClick={() => {
              // Select in-between first and last selected
              const positions = getSelectedPositionsSorted();
              if (positions.length < 2) return;
              const first = positions[0];
              const last = positions[positions.length - 1];
              const newSet = new Set<number>();
              for (let i = first; i <= last; i++) {
                newSet.add(i);
              }
              setSelectedPositions(newSet);
            }} 
            sx={{ color: "white" }}
          >
            Select In-between
          </Button>
        </Box>
      )}

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
              // For queues: use position-based highlighting to correctly handle duplicate tracks
              // For non-queue contexts (library, playlist): use file_path matching
              const isPlaying = showPlayingIndicator && currentPlayingFile === track.file_path;
              const isQueueCurrentTrack = contextType === "queue" && isActiveQueue && actualIndex === queueCurrentIndex;
              const isInactiveQueue = contextType === "queue" && !isActiveQueue;
              const isInactiveQueueCurrentTrack = isInactiveQueue && actualIndex === queueCurrentIndex;
              // Highlight currently playing track
              const shouldHighlight = contextType === "queue" 
                ? (isQueueCurrentTrack || isInactiveQueueCurrentTrack)
                : isPlaying;
              const isFlashing = flashingIndex === actualIndex;
              const isSelected = isMultiSelectMode && selectedPositions.has(actualIndex);

              // Debug log for first few tracks
              if (actualIndex < 3) {
                console.log(`[VirtualTrackList] Track ${actualIndex}: ${track.title}, albumArt exists: ${!!albumArt}, albumArt value: ${albumArt?.substring(0, 50)}`);
              }

              return (
                <Box
                  key={`${contextType}-${actualIndex}`}
                  onClick={() => handlePlayTrack(track, actualIndex)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedTrackForMenu({ id: track.id, title: track.title, position: actualIndex, track: track });
                    setContextMenu({
                      top: e.clientY,
                      left: e.clientX,
                    });
                  }}
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
                    bgcolor: isFlashing ? "primary.dark" : (isSelected ? "action.selected" : (shouldHighlight ? "action.selected" : "transparent")),
                    borderLeft: 3,
                    borderLeftColor: isSelected ? "primary.main" : (shouldHighlight ? "primary.main" : "transparent"),
                    opacity: isInactiveQueue ? 0.6 : 1,
                    animation: isFlashing ? "flash 1s ease-in-out" : "none",
                    "@keyframes flash": {
                      "0%": { bgcolor: "primary.dark" },
                      "50%": { bgcolor: "primary.main" },
                      "100%": { bgcolor: "transparent" },
                    },
                    "&:hover": {
                      bgcolor: shouldHighlight || isSelected ? "action.selected" : "action.hover",
                    },
                  }}
                >
                  {/* Checkbox for multi-select mode */}
                  {isMultiSelectMode && (
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleTrackSelection(actualIndex)}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ mr: 1 }}
                    />
                  )}

                  {/* Album Art */}
                  <Box
                    sx={{
                      width: 60,
                      height: 60,
                      mr: 2,
                      borderRadius: 1,
                      bgcolor: "background.default",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundImage: albumArt ? `url(${albumArt})` : "none",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      overflow: "hidden",
                      pointerEvents: "none",
                    }}
                  >
                    {!albumArt && <MusicNoteIcon sx={{ opacity: 0.3, fontSize: 28 }} />}
                  </Box>

                  {/* Track Info */}
                  <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.25, pointerEvents: "none" }}>
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

      {/* Context Menu */}
      <TrackContextMenu
        anchorPosition={contextMenu}
        onClose={() => {
          setContextMenu(null);
          // Only clear selectedTrackForMenu if no dialog is being opened
          if (!showPlaylistDialog && !showQueueDialog && !showSongInfoDialog) {
            setSelectedTrackForMenu(null);
          }
        }}
        inQueue={contextType === "queue" && queueId !== undefined ? {
          queueId: queueId,
          isActiveQueue: isActiveQueue
        } : null}
        inPlaylist={contextType === "playlist" && playlistId !== undefined ? {
          playlistId: playlistId,
          isSystemPlaylist: isSystemPlaylist
        } : null}
        hasActiveQueue={currentQueueId !== null}
        isMultiSelectMode={isMultiSelectMode}
        onShowSongInfo={() => {
          setShowSongInfoDialog(true);
          setContextMenu(null);
        }}
        onStartMultiSelect={() => {
          if (selectedTrackForMenu) {
            // Start multi-select with the right-clicked track already selected
            setIsMultiSelectMode(true);
            setSelectedPositions(new Set([selectedTrackForMenu.position]));
          }
        }}
        onPlayNext={async () => {
          if (!selectedTrackForMenu || currentQueueId === null) return;
          try {
            // Insert after current track index
            const currentIdx = currentTrackIndex ?? 0;
            await queueApi.insertTracksAfterPosition(currentQueueId, [selectedTrackForMenu.id], currentIdx);
            // Notify that queue tracks changed
            onQueueTracksChanged?.(currentQueueId);
          } catch (err) {
            console.error("Failed to insert track after current:", err);
          }
        }}
        onAddToCurrentQueue={async () => {
          if (!selectedTrackForMenu || currentQueueId === null) return;
          try {
            await queueApi.appendTracksToQueue(currentQueueId, [selectedTrackForMenu.id]);
            // Notify that queue tracks changed
            onQueueTracksChanged?.(currentQueueId);
          } catch (err) {
            console.error("Failed to add track to current queue:", err);
          }
        }}
        onAddToQueue={() => {
          setShowQueueDialog(true);
          setContextMenu(null);
        }}
        onAddToPlaylist={() => {
          setShowPlaylistDialog(true);
          setContextMenu(null);
        }}
        onRemoveFromQueue={async () => {
          if (!selectedTrackForMenu || queueId === undefined) return;
          try {
            const newIndex = await queueApi.removeTrackAtPosition(queueId, selectedTrackForMenu.position);
            // Update PlayerContext if this is the active queue
            if (isActiveQueue && currentQueueId === queueId) {
              setQueueCurrentIndex(newIndex);
              // Also update PlayerContext's currentTrackIndex
              await updateQueuePosition(queueId, newIndex);
            }
            // Notify that queue tracks changed
            onQueueTracksChanged?.(queueId);
          } catch (err) {
            console.error("Failed to remove track from queue:", err);
          }
        }}
        onRemoveFromPlaylist={async () => {
          if (!selectedTrackForMenu || playlistId === undefined) return;
          try {
            await playlistApi.removeTrackFromPlaylist(Number(playlistId), selectedTrackForMenu.id);
            // Notify that playlist tracks changed
            onPlaylistTracksChanged?.(Number(playlistId));
          } catch (err) {
            console.error("Failed to remove track from playlist:", err);
          }
        }}
      />

      {/* Add to Playlist Dialog */}
      <AddToPlaylistDialog
        open={showPlaylistDialog}
        onClose={() => {
          setShowPlaylistDialog(false);
          setSelectedTrackForMenu(null);
          if (isMultiSelectMode) {
            exitMultiSelectMode();
          }
        }}
        trackIds={isMultiSelectMode ? getSelectedTrackIds() : (selectedTrackForMenu ? [selectedTrackForMenu.id] : [])}
        trackTitle={isMultiSelectMode ? `${selectedPositions.size} tracks` : (selectedTrackForMenu?.title || "")}
      />

      {/* Add to Queue Dialog */}
      <AddToQueueDialog
        open={showQueueDialog}
        onClose={() => {
          setShowQueueDialog(false);
          setSelectedTrackForMenu(null);
        }}
        trackId={selectedTrackForMenu?.id || 0}
        trackTitle={selectedTrackForMenu?.title || ""}
        onTrackAdded={(addedQueueId) => {
          onQueueTracksChanged?.(addedQueueId);
        }}
      />

      {/* Song Info Dialog */}
      <SongInfoDialog
        open={showSongInfoDialog}
        onClose={() => {
          setShowSongInfoDialog(false);
          setSelectedTrackForMenu(null);
        }}
        track={selectedTrackForMenu?.track || null}
        onNavigateToArtist={onNavigateToArtist}
        onNavigateToAlbum={onNavigateToAlbum}
        onNavigateToGenre={onNavigateToGenre}
      />
    </div>
  );
});

VirtualTrackList.displayName = "VirtualTrackList";

export default VirtualTrackList;
