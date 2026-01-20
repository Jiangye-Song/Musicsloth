import { useState, useEffect, useRef } from "react";
import {
  Box,
  IconButton,
  Typography,
  Tabs,
  Tab,
  Slider,
  useMediaQuery,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  Close,
  MusicNote,
  PlayArrow,
  Pause,
  SkipNext,
  SkipPrevious,
  FastRewind,
  FastForward,
  Shuffle,
  Repeat,
  VolumeUp,
  QueueMusic,
  Person,
  Album
} from "@mui/icons-material";
import { playerApi, libraryApi } from "../services/api";
import { audioPlayer } from "../services/audioPlayer";
import { usePlayer } from "../contexts/PlayerContext";
import { invoke } from "@tauri-apps/api/core";

interface LyricLine {
  time: number; // milliseconds
  text: string;
}

interface NowPlayingViewProps {
  isNarrow: boolean;
  onClose: () => void;
  onQueueClick?: () => void;
  onNavigateToArtist?: (artistName: string, trackId: number) => void;
  onNavigateToAlbum?: (albumName: string, trackId: number) => void;
  onNavigateToGenre?: (genreName: string, trackId: number) => void;
}

export default function NowPlayingView({ isNarrow, onClose, onQueueClick, onNavigateToArtist, onNavigateToAlbum, onNavigateToGenre }: NowPlayingViewProps) {
  const isShortHeight = useMediaQuery('(max-height:600px)'); const { currentTrack, albumArt, playNext, playPrevious, isShuffled, toggleShuffle, isRepeating, toggleRepeat } = usePlayer();
  const [activeTab, setActiveTab] = useState<"albumart" | "lyrics" | "details">(isNarrow ? "albumart" : "details");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [hasLyrics, setHasLyrics] = useState(true);
  const [parsedLyrics, setParsedLyrics] = useState<LyricLine[]>([]);
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);
  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const lastUserScrollTimeRef = useRef<number>(0);
  const isAutoScrollingRef = useRef(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    text: string;
  } | null>(null);
  
  const [imageContextMenu, setImageContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  
  const [albumArtBytes, setAlbumArtBytes] = useState<number[] | null>(null);

  // Parse LRC format lyrics
  const parseLrcLyrics = (lrcText: string): LyricLine[] => {
    const lines: LyricLine[] = [];
    const lrcRegex = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/g;
    
    let match;
    while ((match = lrcRegex.exec(lrcText)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
      const text = match[4].trim();
      
      const time = (minutes * 60 + seconds) * 1000 + milliseconds;
      lines.push({ time, text });
    }
    
    // Sort by time in case lyrics are not ordered
    lines.sort((a, b) => a.time - b.time);
    
    return lines;
  };

  // Helper function to split multi-value fields (artists, genres)
  const splitMultiValue = (value: string | null): string[] => {
    if (!value) return [];
    // Split on: comma, semicolon, slash, pipe, ideographic comma, ampersand, ft./feat./featuring
    return value
      .split(/[,;/|、&]|\s+(?:ft\.?|feat\.?|featuring)\s+/i)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  useEffect(() => {
    // Update player state periodically
    const interval = setInterval(async () => {
      try {
        const state = await playerApi.getState();

        setIsPlaying(state.is_playing);
        setVolume(Math.round(state.position_ms > 0 ? (audioPlayer.getState().volume * 100) : 100));

        if (!isSeeking) {
          setCurrentPosition(state.position_ms);
          setDuration(state.duration_ms || 0);
        }
      } catch (error) {
        console.error("Failed to get player state:", error);
      }
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, [isSeeking]);

  // Load lyrics when track changes - always load to determine if lyrics exist
  useEffect(() => {
    const loadLyrics = async () => {
      if (!currentTrack) {
        setLyrics(null);
        setParsedLyrics([]);
        setHasLyrics(false);
        return;
      }

      setLoadingLyrics(true);
      try {
        const lyricsData = await libraryApi.getLyrics(currentTrack.file_path);
        setLyrics(lyricsData);
        setHasLyrics(!!lyricsData);
        
        // Parse LRC format if available
        if (lyricsData) {
          const parsed = parseLrcLyrics(lyricsData);
          setParsedLyrics(parsed);
        } else {
          setParsedLyrics([]);
        }
      } catch (error) {
        console.error("Failed to load lyrics:", error);
        setLyrics(null);
        setParsedLyrics([]);
        setHasLyrics(false);
      } finally {
        setLoadingLyrics(false);
      }
    };

    loadLyrics();
  }, [currentTrack?.file_path]);

  // Load album art bytes for copy functionality
  useEffect(() => {
    const loadAlbumArtBytes = async () => {
      if (!currentTrack) {
        setAlbumArtBytes(null);
        return;
      }
      try {
        const artBytes = await libraryApi.getAlbumArt(currentTrack.file_path);
        setAlbumArtBytes(artBytes);
      } catch (error) {
        console.error("Failed to load album art bytes:", error);
        setAlbumArtBytes(null);
      }
    };
    loadAlbumArtBytes();
  }, [currentTrack?.file_path]);

  // Automatically switch tabs based on lyrics availability when track changes
  useEffect(() => {
    if (!hasLyrics && activeTab === "lyrics") {
      // If currently on lyrics tab but no lyrics available, switch to details
      setActiveTab(isNarrow ? "albumart" : "details");
    }
  }, [hasLyrics]);
  
  // Auto-switch to lyrics tab when a new track with lyrics starts playing (landscape mode only)
  useEffect(() => {
    if (hasLyrics && !isNarrow) {
      setActiveTab("lyrics");
    }
  }, [currentTrack?.file_path]);

  // Track user scroll events
  useEffect(() => {
    const container = lyricsContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Only track if this is a user-initiated scroll (not auto-scroll)
      if (!isAutoScrollingRef.current) {
        lastUserScrollTimeRef.current = Date.now();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [parsedLyrics]); // Re-attach when lyrics change

  // Update current lyric line based on playback position
  useEffect(() => {
    if (parsedLyrics.length === 0) {
      setCurrentLyricIndex(-1);
      return;
    }

    // Find the current lyric line
    let index = -1;
    for (let i = parsedLyrics.length - 1; i >= 0; i--) {
      if (currentPosition >= parsedLyrics[i].time) {
        index = i;
        break;
      }
    }

    setCurrentLyricIndex(index);
  }, [currentPosition, parsedLyrics]);

  // Auto-scroll effect - separate from index update for better control
  useEffect(() => {
    if (currentLyricIndex < 0 || !lyricsContainerRef.current || parsedLyrics.length === 0) {
      return;
    }

    // Find which group contains this lyric index
    const allElements = lyricsContainerRef.current.querySelectorAll('[data-lyric-index]');
    let targetElement: Element | null = null;
    
    for (const element of allElements) {
      const firstIndex = parseInt(element.getAttribute('data-lyric-index') || '-1', 10);
      const nextElement = element.nextElementSibling;
      const nextIndex = nextElement ? parseInt(nextElement.getAttribute('data-lyric-index') || '-1', 10) : parsedLyrics.length;
      
      if (currentLyricIndex >= firstIndex && currentLyricIndex < nextIndex) {
        targetElement = element;
        break;
      }
    }
    
    // Fallback: if not found, try direct match or last element
    if (!targetElement) {
      targetElement = lyricsContainerRef.current.querySelector(`[data-lyric-index="${currentLyricIndex}"]`);
      if (!targetElement && allElements.length > 0) {
        targetElement = allElements[allElements.length - 1];
      }
    }
    
    console.log('Scrolling to index:', currentLyricIndex, 'Element:', targetElement);
    
    if (targetElement) {
      isAutoScrollingRef.current = true;
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      // Reset auto-scroll flag after animation completes
      setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 500);
    }
  }, [currentLyricIndex, parsedLyrics.length]);

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = async () => {
    try {
      if (isPlaying) {
        await playerApi.pause();
      } else {
        await playerApi.resume();
      }
    } catch (error) {
      console.error("Failed to toggle play/pause:", error);
    }
  };

  const handleNext = async () => {
    try {
      await playNext();
    } catch (error) {
      console.error("Failed to play next track:", error);
    }
  };

  const handlePrevious = async () => {
    try {
      await playPrevious();
    } catch (error) {
      console.error("Failed to play previous track:", error);
    }
  };

  const handleRewind = async () => {
    try {
      const newPosition = Math.max(0, currentPosition - 5000); // 5 seconds back
      await playerApi.seekTo(newPosition);
      // Reset user scroll timer to enable auto-scroll after seeking
      lastUserScrollTimeRef.current = 0;
    } catch (error) {
      console.error("Failed to rewind:", error);
    }
  };

  const handleFastForward = async () => {
    try {
      const newPosition = Math.min(duration, currentPosition + 15000); // 15 seconds forward
      await playerApi.seekTo(newPosition);
      // Reset user scroll timer to enable auto-scroll after seeking
      lastUserScrollTimeRef.current = 0;
    } catch (error) {
      console.error("Failed to fast forward:", error);
    }
  };

  const handleSeekMouseDown = () => {
    setIsSeeking(true);
  };

  const handleVolumeChange = async (_: Event, value: number | number[]) => {
    const newVolume = value as number;
    setVolume(newVolume);
    try {
      await playerApi.setVolume(newVolume / 100);
    } catch (error) {
      console.error("Failed to set volume:", error);
    }
  };

  const handleContextMenu = (text: string | null | undefined, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (text && text !== "—") {
      setContextMenu({
        mouseX: e.clientX,
        mouseY: e.clientY,
        text,
      });
    }
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleCopyText = () => {
    if (contextMenu?.text) {
      navigator.clipboard.writeText(contextMenu.text);
    }
    handleCloseContextMenu();
  };

  const handleImageContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (albumArt) {
      setImageContextMenu({
        mouseX: e.clientX,
        mouseY: e.clientY,
      });
    }
  };

  const handleCloseImageContextMenu = () => {
    setImageContextMenu(null);
  };

  const handleCopyImage = async () => {
    if (albumArtBytes) {
      try {
        const blob = new Blob([new Uint8Array(albumArtBytes)], { type: "image/png" });
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
      } catch (error) {
        console.error("Failed to copy image:", error);
      }
    }
    handleCloseImageContextMenu();
  };

  const handleSaveImage = async () => {
    if (currentTrack) {
      try {
        await invoke("save_album_art", {
          filePath: currentTrack.file_path,
          defaultName: currentTrack.title || "album_art",
        });
      } catch (error) {
        console.error("Failed to save image:", error);
      }
    }
    handleCloseImageContextMenu();
  };

  const renderAlbumArt = () => {
    // const size = isNarrow ? 200 : 200;
    // const maxSize = isShortHeight ? 200 : (isNarrow ? 200 : 300);

    return (
      <Box
        onContextMenu={handleImageContextMenu}
        sx={{
          width: 200,
          margin: isNarrow ? "0 auto" : 0,
          bgcolor: "background.default",
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: 1,
          borderColor: "divider",
          overflow: "hidden",
          cursor: albumArt ? "context-menu" : "default",
        }}
      >
        {albumArt ? (
          <img
            src={albumArt}
            alt="Album Art"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <MusicNote sx={{ fontSize: isShortHeight ? 40 : 60, opacity: 0.3 }} />
        )}
      </Box>
    );
  };

  const renderTrackInfo = () => (
    currentTrack ? (
      <Box sx={{ textAlign: isNarrow ? "center" : "left", mt: 2, display: "flex", flexDirection: "column", alignItems: isNarrow ? "center" : "flex-start" }}>
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          {currentTrack.title}
        </Typography>
        <Box sx={{ my: "6px" }}>
          <Box sx={{ display: "inline-flex", alignItems: "flex-start", gap: 0.5 }}>
            <Person sx={{ fontSize: 18, mr: "3px", flexShrink: 0, color: "text.primary", mt: "2px" }} />
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
              {splitMultiValue(currentTrack.artist).length > 0 ? (
                splitMultiValue(currentTrack.artist).map((artist, index, arr) => (
                  <Typography
                    key={index}
                    variant="body1"
                    color="text.secondary"
                    onClick={() => onNavigateToArtist?.(artist, currentTrack.id)}
                    sx={{
                      cursor: onNavigateToArtist ? "pointer" : "default",
                      "&:hover": onNavigateToArtist ? { textDecoration: "underline" } : {}
                    }}
                  >
                    {artist}{index < arr.length - 1 ? ", " : ""}
                  </Typography>
                ))
              ) : (
                <Typography variant="body1" color="text.secondary">
                  Unknown Artist
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: "inline-flex", alignItems: "flex-start", gap: 0.5 }}>
          <Album sx={{ fontSize: 18, mr: "3px", flexShrink: 0, color: "text.primary", mt: "2px" }} />
          <Typography
            variant="body2"
            color="text.secondary"
            onClick={() => currentTrack.album && onNavigateToAlbum?.(currentTrack.album, currentTrack.id)}
            sx={{
              cursor: currentTrack.album && onNavigateToAlbum ? "pointer" : "default",
              "&:hover": currentTrack.album && onNavigateToAlbum ? { textDecoration: "underline" } : {}
            }}
          >
            {currentTrack.album || "Unknown Album"}
          </Typography>
        </Box>
      </Box>
    ) : (
      <Box sx={{ textAlign: "center", mt: 2 }}>
        <Typography variant="body1" color="text.disabled">
          No track playing
        </Typography>
      </Box>
    )
  );

  const renderControls = () => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, px: isNarrow ? 2 : 0 }}>
      {/* Time and Seekbar */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="caption" sx={{ minWidth: "45px", textAlign: "right", color: "text.secondary" }}>
          {formatTime(isSeeking ? seekPosition : currentPosition)}
        </Typography>
        <Slider
          min={0}
          max={duration || 100}
          value={isSeeking ? seekPosition : currentPosition}
          onMouseDown={handleSeekMouseDown}
          onChange={(_, value) => setSeekPosition(value as number)}
          onChangeCommitted={async (_, value) => {
            try {
              await playerApi.seekTo(value as number);
              // Reset user scroll timer to enable auto-scroll after seeking
              lastUserScrollTimeRef.current = 0;
            } catch (error) {
              console.error("Failed to seek:", error);
            } finally {
              setIsSeeking(false);
            }
          }}
          disabled={!currentTrack}
          sx={{ flex: 1 }}
        />
        <Typography variant="caption" sx={{ minWidth: "45px", color: "text.secondary" }}>
          {formatTime(duration)}
        </Typography>
      </Box>

      {/* Playback Controls */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <IconButton
          onClick={toggleShuffle}
          size="small"
          disabled={!currentTrack}
          title={isShuffled ? "Shuffle On" : "Shuffle Off"}
          sx={{ color: isShuffled ? "primary.main" : "text.secondary" }}
        >
          <Shuffle />
        </IconButton>
        <IconButton onClick={handlePrevious} disabled={!currentTrack} sx={{ color: "text.primary" }} title="Previous Track">
          <SkipPrevious fontSize="large" />
        </IconButton>
        <IconButton onClick={handleRewind} disabled={!currentTrack} sx={{ color: "text.secondary" }} title="Rewind 5s">
          <FastRewind />
        </IconButton>
        <IconButton
          onClick={handlePlayPause}
          disabled={!currentTrack}
          sx={{
            color: "primary.main",
            width: 56,
            height: 56,
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          {isPlaying ? <Pause fontSize="large" /> : <PlayArrow fontSize="large" />}
        </IconButton>
        <IconButton onClick={handleFastForward} disabled={!currentTrack} sx={{ color: "text.secondary" }} title="Fast Forward 15s">
          <FastForward />
        </IconButton>
        <IconButton onClick={handleNext} disabled={!currentTrack} sx={{ color: "text.primary" }} title="Next Track">
          <SkipNext fontSize="large" />
        </IconButton>
        <IconButton
          onClick={toggleRepeat}
          size="small"
          disabled={!currentTrack}
          title={isRepeating ? "Repeat Track" : "Repeat Queue"}
          sx={{ color: isRepeating ? "primary.main" : "text.secondary" }}
        >
          <Repeat />
        </IconButton>
      </Box>

      {/* Bottom Controls - Volume & Queue */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, maxWidth: 200 }}>
          <VolumeUp fontSize="small" sx={{ color: "text.secondary" }} />
          <Slider
            min={0}
            max={100}
            value={volume}
            onChange={handleVolumeChange}
            size="small"
            sx={{ flex: 1 }}
          />
        </Box>
        <IconButton size="small" onClick={onQueueClick} sx={{ color: "text.secondary" }}>
          <QueueMusic />
        </IconButton>
      </Box>
    </Box>
  );

  const renderLyrics = () => {
    if (loadingLyrics) {
      return (
        <Box
          sx={{
            p: 3,
            textAlign: "center",
            color: "text.secondary",
          }}
        >
          <Typography variant="body2">Loading lyrics...</Typography>
        </Box>
      );
    }

    if (!lyrics) {
      return (
        <Box
          sx={{
            p: 3,
            textAlign: "center",
            color: "text.secondary",
          }}
        >
          <Typography variant="body2">No lyrics available</Typography>
        </Box>
      );
    }

    // If we have parsed LRC lyrics, render them with sync
    if (parsedLyrics.length > 0) {
      // Group consecutive lines with the same timestamp
      const groupedLyrics: { time: number; lines: string[]; firstIndex: number }[] = [];
      parsedLyrics.forEach((line, index) => {
        const lastGroup = groupedLyrics[groupedLyrics.length - 1];
        if (lastGroup && lastGroup.time === line.time) {
          lastGroup.lines.push(line.text);
        } else {
          groupedLyrics.push({ time: line.time, lines: [line.text], firstIndex: index });
        }
      });

      // Find which group contains the current lyric index
      let currentGroupIndex = -1;
      if (currentLyricIndex >= 0) {
        for (let i = 0; i < groupedLyrics.length; i++) {
          const group = groupedLyrics[i];
          const nextGroup = groupedLyrics[i + 1];
          const groupEndIndex = nextGroup ? nextGroup.firstIndex - 1 : parsedLyrics.length - 1;
          
          if (currentLyricIndex >= group.firstIndex && currentLyricIndex <= groupEndIndex) {
            currentGroupIndex = i;
            break;
          }
        }
      }

      return (
        <Box
          ref={lyricsContainerRef}
          sx={{
            p: 3,
            overflowY: "auto",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {groupedLyrics.map((group, groupIndex) => {
            const isActive = groupIndex === currentGroupIndex;
            const isPast = groupIndex < currentGroupIndex;
            
            return (
              <Box
                key={groupIndex}
                data-lyric-group={groupIndex}
                data-lyric-index={group.firstIndex}
                sx={{
                  py: 1.5,
                  px: 2,
                  my: 0.5,
                  transition: "all 0.3s ease",
                  transform: isActive ? "scale(1.05)" : "scale(1)",
                  opacity: isPast ? 0.4 : isActive ? 1 : 0.6,
                  textAlign: "center",
                  width: "100%",
                  maxWidth: "800px",
                }}
              >
                {group.lines.map((text, lineIndex) => (
                  <Typography
                    key={lineIndex}
                    variant="body1"
                    sx={{
                      fontWeight: isActive ? 600 : 400,
                      fontSize: isActive ? "1.2rem" : "1rem",
                      color: isActive ? "primary.main" : "text.primary",
                      lineHeight: 1.8,
                      transition: "all 0.3s ease",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {text || " "}
                  </Typography>
                ))}
              </Box>
            );
          })}
        </Box>
      );
    }

    // Fallback to plain text display if no LRC format detected
    return (
      <Box
        sx={{
          p: 3,
          overflowY: "auto",
          height: "100%",
        }}
      >
        <Typography
          variant="body2"
          component="pre"
          sx={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "inherit",
            color: "text.primary",
            lineHeight: 1.8,
          }}
        >
          {lyrics}
        </Typography>
      </Box>
    );
  };

  const renderDetails = () => (
    currentTrack && (
      <Box sx={{ p: 3 }}>
        <Typography
          variant="h6"
          sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: "divider" }}
        >
          Track Information
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            gap: 1,
          }}
        >
          <Typography color="text.secondary">Title:</Typography>
          <Typography
            onContextMenu={(e) => handleContextMenu(currentTrack.title, e)}
            sx={{ userSelect: "text" }}
          >
            {currentTrack.title}
          </Typography>

          <Typography color="text.secondary">Artist:</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }} onContextMenu={(e) => handleContextMenu(currentTrack.artist, e)}>
            {splitMultiValue(currentTrack.artist).length > 0 ? (
              splitMultiValue(currentTrack.artist).map((artist, index, arr) => (
                <Typography
                  key={index}
                  onClick={() => onNavigateToArtist?.(artist, currentTrack.id)}
                  sx={{
                    cursor: onNavigateToArtist ? "pointer" : "default",
                    "&:hover": onNavigateToArtist ? { textDecoration: "underline" } : {},
                    userSelect: "text"
                  }}
                >
                  {artist}{index < arr.length - 1 ? ", " : ""}
                </Typography>
              ))
            ) : (
              <Typography sx={{ userSelect: "text" }}>—</Typography>
            )}
          </Box>

          <Typography color="text.secondary">Album Artist:</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }} onContextMenu={(e) => handleContextMenu(currentTrack.album_artist, e)}>
            {splitMultiValue(currentTrack.album_artist).length > 0 ? (
              splitMultiValue(currentTrack.album_artist).map((artist, index, arr) => (
                <Typography
                  key={index}
                  onClick={() => onNavigateToArtist?.(artist, currentTrack.id)}
                  sx={{
                    cursor: onNavigateToArtist ? "pointer" : "default",
                    "&:hover": onNavigateToArtist ? { textDecoration: "underline" } : {},
                    userSelect: "text"
                  }}
                >
                  {artist}{index < arr.length - 1 ? ", " : ""}
                </Typography>
              ))
            ) : (
              <Typography sx={{ userSelect: "text" }}>—</Typography>
            )}
          </Box>

          <Typography color="text.secondary">Album:</Typography>
          <Typography
            onClick={() => currentTrack.album && onNavigateToAlbum?.(currentTrack.album, currentTrack.id)}
            onContextMenu={(e) => handleContextMenu(currentTrack.album, e)}
            sx={{
              cursor: currentTrack.album && currentTrack.album !== "—" && onNavigateToAlbum ? "pointer" : "default",
              "&:hover": currentTrack.album && currentTrack.album !== "—" && onNavigateToAlbum ? { textDecoration: "underline" } : {},
              userSelect: "text"
            }}
          >
            {currentTrack.album || "—"}
          </Typography>

          <Typography color="text.secondary">Year:</Typography>
          <Typography
            onContextMenu={(e) => handleContextMenu(currentTrack.year?.toString(), e)}
            sx={{ userSelect: "text" }}
          >
            {currentTrack.year || "—"}
          </Typography>

          <Typography color="text.secondary">Genre:</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }} onContextMenu={(e) => handleContextMenu(currentTrack.genre, e)}>
            {splitMultiValue(currentTrack.genre).length > 0 ? (
              splitMultiValue(currentTrack.genre).map((genre, index, arr) => (
                <Typography
                  key={index}
                  onClick={() => onNavigateToGenre?.(genre, currentTrack.id)}
                  sx={{
                    cursor: onNavigateToGenre ? "pointer" : "default",
                    "&:hover": onNavigateToGenre ? { textDecoration: "underline" } : {},
                    userSelect: "text"
                  }}
                >
                  {genre}{index < arr.length - 1 ? ", " : ""}
                </Typography>
              ))
            ) : (
              <Typography sx={{ userSelect: "text" }}>—</Typography>
            )}
          </Box>

          <Typography color="text.secondary">Track:</Typography>
          <Typography>{currentTrack.track_number ? `${currentTrack.track_number}${currentTrack.disc_number ? ` (Disc ${currentTrack.disc_number})` : ""}` : "—"}</Typography>

          <Typography color="text.secondary">Duration:</Typography>
          <Typography>{formatDuration(currentTrack.duration_ms)}</Typography>

          <Typography color="text.secondary">Format:</Typography>
          <Typography>{currentTrack.file_format?.toUpperCase() || "—"}</Typography>

          <Typography color="text.secondary">Bitrate:</Typography>
          <Typography>{currentTrack.bitrate ? `${Math.round(currentTrack.bitrate / 1000)} kbps` : "—"}</Typography>

          <Typography color="text.secondary">Sample Rate:</Typography>
          <Typography>{currentTrack.sample_rate ? `${currentTrack.sample_rate} Hz` : "—"}</Typography>
        </Box>
      </Box>
    )
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default", overflow: "hidden" }}>
      {/* Close Button */}
      <Box sx={{ p: 2, display: "flex", justifyContent: "flex-end" }}>
        <IconButton onClick={onClose} size="large" sx={{ color: "text.secondary" }}>
          <Close />
        </IconButton>
      </Box>

      {/* Content */}
      {isNarrow ? (
        /* Narrow Layout: Album art, track info, controls stacked */
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", px: 2, pb: 2, overflow: "hidden" }}>
          {/* Tab Navigation */}
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            centered
            sx={{ pb: 2, flexShrink: 0 }}
          >
            <Tab label="Album Art" value="albumart" />
            {hasLyrics && <Tab label="Lyrics" value="lyrics" />}
            <Tab label="Details" value="details" />
          </Tabs>

          {/* Tab Content */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {activeTab === "albumart" && (
                <>
                  {renderAlbumArt()}
                  {renderTrackInfo()}
                </>
              )}
              {activeTab === "lyrics" && renderLyrics()}
              {activeTab === "details" && renderDetails()}
            </Box>

            {/* Controls always at bottom */}
            <Box sx={{ pt: 3, flexShrink: 0 }}>
              {renderControls()}
            </Box>
          </Box>
        </Box>
      ) : (
        /* Wide Layout: Left album art/info, right tabs, controls at bottom */
        <Box sx={{ display: "flex", flexDirection: "column", flex: 1, p: 3, overflow: "hidden" }}>
          <Box sx={{ display: "flex", flex: 1, gap: 4, mb: 3, minHeight: 0 }}>
            {/* Left: Album Art & Track Info */}
            <Box sx={{ flex: "0 0 33%", maxWidth: "350px", display: "flex", flexDirection: "column", overflow: "hidden", justifyContent: "center" }}>
              <Box sx={{ flexShrink: 0, pl: "12%"}}>
                {renderAlbumArt()}
                {renderTrackInfo()}
              </Box>
            </Box>
            <hr style={{borderColor: "#2f2f2f"}}/>
            {/* Right: Tabs */}
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Tabs
                value={activeTab === "albumart" ? (hasLyrics ? "lyrics" : "details") : activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
                sx={{ mb: 2, flexShrink: 0 }}
              >
                {hasLyrics && <Tab label="Lyrics" value="lyrics" />}
                <Tab label="Details" value="details" />
              </Tabs>

              <Box
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  minHeight: 0,
                }}
              >
                {activeTab === "lyrics" && hasLyrics && renderLyrics()}
                {(activeTab === "details" || !hasLyrics) && renderDetails()}
              </Box>
            </Box>
          </Box>

          {/* Controls at Bottom */}
          <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
            {renderControls()}
          </Box>
        </Box>
      )}

      {/* Text Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleCopyText}>Copy</MenuItem>
      </Menu>

      {/* Image Context Menu */}
      <Menu
        open={imageContextMenu !== null}
        onClose={handleCloseImageContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          imageContextMenu !== null
            ? { top: imageContextMenu.mouseY, left: imageContextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleCopyImage}>Copy Image</MenuItem>
        <MenuItem onClick={handleSaveImage}>Save Image...</MenuItem>
      </Menu>
    </Box>
  );
}
