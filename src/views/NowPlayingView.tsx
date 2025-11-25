import { useState, useEffect } from "react";
import {
  Box,
  IconButton,
  Typography,
  Tabs,
  Tab,
  Paper,
  Slider,
  useMediaQuery,
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
  const [activeTab, setActiveTab] = useState<"albumart" | "lyrics" | "details">(isNarrow ? "albumart" : "lyrics");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);

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

  // Load lyrics when track changes or when switching to lyrics tab
  useEffect(() => {
    const loadLyrics = async () => {
      if (!currentTrack) {
        setLyrics(null);
        return;
      }

      // Only load if we're on the lyrics tab (or it's selected in landscape) and lyrics aren't already loaded/loading
      const showingLyrics = activeTab === "lyrics" || (!isNarrow && activeTab === "albumart");
      if (!showingLyrics || loadingLyrics) {
        return;
      }

      setLoadingLyrics(true);
      try {
        const lyricsData = await libraryApi.getLyrics(currentTrack.file_path);
        setLyrics(lyricsData);
      } catch (error) {
        console.error("Failed to load lyrics:", error);
        setLyrics(null);
      } finally {
        setLoadingLyrics(false);
      }
    };

    loadLyrics();
  }, [currentTrack?.file_path, activeTab, isNarrow]);

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
    } catch (error) {
      console.error("Failed to rewind:", error);
    }
  };

  const handleFastForward = async () => {
    try {
      const newPosition = Math.min(duration, currentPosition + 15000); // 15 seconds forward
      await playerApi.seekTo(newPosition);
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

  const copyToClipboard = (text: string | null | undefined, e: React.MouseEvent) => {
    e.preventDefault();
    if (text && text !== "—") {
      navigator.clipboard.writeText(text);
    }
  };

  const renderAlbumArt = () => {
    // const size = isNarrow ? 200 : 200;
    // const maxSize = isShortHeight ? 200 : (isNarrow ? 200 : 300);

    return (
      <Box
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
            onContextMenu={(e) => copyToClipboard(currentTrack.title, e)}
            sx={{ userSelect: "text" }}
          >
            {currentTrack.title}
          </Typography>

          <Typography color="text.secondary">Artist:</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }} onContextMenu={(e) => copyToClipboard(currentTrack.artist, e)}>
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
          <Typography
            onContextMenu={(e) => copyToClipboard(currentTrack.album_artist, e)}
            sx={{ userSelect: "text" }}
          >
            {currentTrack.album_artist || "—"}
          </Typography>

          <Typography color="text.secondary">Album:</Typography>
          <Typography
            onClick={() => currentTrack.album && onNavigateToAlbum?.(currentTrack.album, currentTrack.id)}
            onContextMenu={(e) => copyToClipboard(currentTrack.album, e)}
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
            onContextMenu={(e) => copyToClipboard(currentTrack.year?.toString(), e)}
            sx={{ userSelect: "text" }}
          >
            {currentTrack.year || "—"}
          </Typography>

          <Typography color="text.secondary">Genre:</Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }} onContextMenu={(e) => copyToClipboard(currentTrack.genre, e)}>
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
            <Tab label="Lyrics" value="lyrics" />
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
            <Box sx={{ flex: "0 0 33%", display: "flex", flexDirection: "column", overflow: "hidden", justifyContent: "center" }}>
              <Box sx={{ flexShrink: 0, pl: "12%"}}>
                {renderAlbumArt()}
                {renderTrackInfo()}
              </Box>
            </Box>

            {/* Right: Tabs */}
            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <Tabs
                value={activeTab === "albumart" ? "lyrics" : activeTab}
                onChange={(_, newValue) => setActiveTab(newValue)}
                sx={{ mb: 2, flexShrink: 0 }}
              >
                <Tab label="Lyrics" value="lyrics" />
                <Tab label="Details" value="details" />
              </Tabs>

              <Paper
                elevation={2}
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  minHeight: 0,
                }}
              >
                {activeTab === "lyrics" && renderLyrics()}
                {activeTab === "details" && renderDetails()}
              </Paper>
            </Box>
          </Box>

          {/* Controls at Bottom */}
          <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider", flexShrink: 0 }}>
            {renderControls()}
          </Box>
        </Box>
      )}
    </Box>
  );
}
