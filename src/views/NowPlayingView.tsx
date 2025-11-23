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
  Shuffle,
  Repeat,
  VolumeUp,
  QueueMusic,
} from "@mui/icons-material";
import { playerApi } from "../services/api";
import { audioPlayer } from "../services/audioPlayer";
import { usePlayer } from "../contexts/PlayerContext";

interface NowPlayingViewProps {
  isNarrow: boolean;
  onClose: () => void;
}

export default function NowPlayingView({ isNarrow, onClose }: NowPlayingViewProps) {
  const isShortHeight = useMediaQuery('(max-height:600px)');
  const { currentTrack, albumArt } = usePlayer();
  const [activeTab, setActiveTab] = useState<"albumart" | "lyrics" | "details">("albumart");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);

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
    // TODO: Implement with backend queue navigation
    console.log("Next track - needs backend implementation");
  };

  const handlePrevious = async () => {
    // TODO: Implement with backend queue navigation
    console.log("Previous track - needs backend implementation");
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

  const renderAlbumArt = () => {
    const size = isShortHeight ? 150 : (isNarrow ? 250 : 300);
    const maxSize = isShortHeight ? 150 : (isNarrow ? 300 : 300);
    
    return (
      <Box
        sx={{
          width: isNarrow ? "100%" : size,
          height: size,
          maxWidth: isNarrow ? maxSize : size,
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
          <img src={albumArt} alt="Album Art" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <MusicNote sx={{ fontSize: isShortHeight ? 40 : 60, opacity: 0.3 }} />
        )}
      </Box>
    );
  };

  const renderTrackInfo = () => (
    currentTrack ? (
      <Box sx={{ textAlign: isNarrow ? "center" : "left", mt: 2 }}>
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          {currentTrack.title}
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          {currentTrack.artist || "Unknown Artist"}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {currentTrack.album || "Unknown Album"}
        </Typography>
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
        <IconButton size="small" disabled={!currentTrack} sx={{ color: "text.secondary" }}>
          <Shuffle />
        </IconButton>
        <IconButton onClick={handlePrevious} disabled={!currentTrack} sx={{ color: "text.primary" }}>
          <SkipPrevious fontSize="large" />
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
        <IconButton onClick={handleNext} disabled={!currentTrack} sx={{ color: "text.primary" }}>
          <SkipNext fontSize="large" />
        </IconButton>
        <IconButton size="small" disabled={!currentTrack} sx={{ color: "text.secondary" }}>
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
        <IconButton size="small" sx={{ color: "text.secondary" }}>
          <QueueMusic />
        </IconButton>
      </Box>
    </Box>
  );

  const renderLyrics = () => (
    <Box
      sx={{
        p: 3,
        textAlign: "center",
        color: "text.secondary",
      }}
    >
      <Typography variant="body2">
        Lyrics will appear here when available
      </Typography>
    </Box>
  );

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
          <Typography>{currentTrack.title}</Typography>
          
          <Typography color="text.secondary">Artist:</Typography>
          <Typography>{currentTrack.artist || "—"}</Typography>
          
          <Typography color="text.secondary">Album Artist:</Typography>
          <Typography>{currentTrack.album_artist || "—"}</Typography>
          
          <Typography color="text.secondary">Album:</Typography>
          <Typography>{currentTrack.album || "—"}</Typography>
          
          <Typography color="text.secondary">Year:</Typography>
          <Typography>{currentTrack.year || "—"}</Typography>
          
          <Typography color="text.secondary">Genre:</Typography>
          <Typography>{currentTrack.genre || "—"}</Typography>
          
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
            <Box sx={{ flex: isShortHeight ? "0 0 150px" : "0 0 300px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <Box sx={{ flexShrink: 0 }}>
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
