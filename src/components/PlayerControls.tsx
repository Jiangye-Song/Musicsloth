import { useState, useEffect } from "react";
import {
  Box,
  IconButton,
  Slider,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  PlayArrow,
  Pause,
  SkipPrevious,
  SkipNext,
  FastRewind,
  FastForward,
  Repeat,
  Shuffle,
  VolumeUp,
  Menu,
  MusicNote,
} from "@mui/icons-material";
import { playerApi, PlayerState, libraryApi, Track } from "../services/api";

interface PlayerControlsProps {
  onExpandClick?: () => void;
}

export default function PlayerControls({ onExpandClick }: PlayerControlsProps) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [albumArt, setAlbumArt] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    is_playing: false,
    is_paused: false,
    current_file: null,
    position_ms: 0,
    duration_ms: null,
  });
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);

  useEffect(() => {
    // Update player state periodically (faster for smoother seekbar)
    const interval = setInterval(async () => {
      try {
        const state = await playerApi.getState();
        if (!isSeeking) {
          setPlayerState(state);
        }
        // Fetch current track info
        if (state.current_file) {
          try {
            const track = await libraryApi.getCurrentTrack();
            setCurrentTrack(track);
            // Fetch album art
            if (track && track.file_path) {
              try {
                const artBytes = await libraryApi.getAlbumArt(track.file_path);
                if (artBytes && artBytes.length > 0) {
                  const blob = new Blob([new Uint8Array(artBytes)], { type: "image/jpeg" });
                  const url = URL.createObjectURL(blob);
                  setAlbumArt(url);
                } else {
                  setAlbumArt(null);
                }
              } catch {
                setAlbumArt(null);
              }
            }
          } catch (err) {
            console.error("Failed to fetch track:", err);
          }
        } else {
          setCurrentTrack(null);
          // Keep album art persistent - don't clear it
        }
      } catch (error) {
        console.error("Failed to get player state:", error);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isSeeking]);

  const handlePlayPause = async () => {
    try {
      if (playerState.is_playing) {
        await playerApi.pause();
      } else if (playerState.is_paused) {
        await playerApi.resume();
      }
    } catch (error) {
      console.error("Failed to toggle playback:", error);
    }
  };

  const handleSeekMouseDown = () => {
    setIsSeeking(true);
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const currentPosition = isSeeking ? seekPosition : playerState.position_ms;
  const duration = playerState.duration_ms || 0;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <Box sx={{ display: "flex", alignItems: "stretch", gap: isMobile ? 0 : 2, pr: isMobile ? 0 : 2, height: "80px" }}>
        {/* Album Art - Full height, no padding/margin */}
        <Box
          onClick={onExpandClick}
          sx={{
            width: "80px",
            bgcolor: "background.default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
            cursor: onExpandClick ? "pointer" : "default",
          }}
        >
          {albumArt ? (
            <img src={albumArt} alt="Album" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <MusicNote sx={{ fontSize: 32, opacity: 0.3 }} />
          )}
        </Box>

        {/* Track Info - Hidden on mobile */}
        {!isMobile && (
          <Box
            onClick={onExpandClick}
            sx={{
              flex: "0 0 calc(20% - 80px)",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              cursor: onExpandClick ? "pointer" : "default",
              transition: "background-color 0.2s",
              "&:hover": onExpandClick ? {
                bgcolor: "action.hover",
              } : {},
              py: 1,
            }}
          >
            <Typography
              variant="body2"
              fontWeight="bold"
              noWrap
              sx={{ color: "text.primary" }}
            >
              {currentTrack ? currentTrack.title : "Track title"}
            </Typography>
            <Typography
              variant="caption"
              noWrap
              sx={{ color: "text.secondary" }}
            >
              {currentTrack
                ? `${currentTrack.artist || "Unknown Artist"}${currentTrack.album ? ` • ${currentTrack.album}` : ""}`
                : "Track artist"}
            </Typography>
          </Box>
        )}

      {/* Center: Playback Controls with Seekbar */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 0.5, mx: 2 }}>
        {/* Control Buttons */}
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", justifyContent: "center" }}>
          <IconButton
            onClick={() => {/* TODO: implement previous track */}}
            disabled={!playerState.current_file}
            size="small"
            title="Previous Track"
          >
            <SkipPrevious />
          </IconButton>

          <IconButton
            onClick={() => {/* TODO: implement rewind */}}
            disabled={!playerState.current_file}
            size="small"
            title="Rewind"
          >
            <FastRewind />
          </IconButton>

          <IconButton
            onClick={handlePlayPause}
            disabled={!playerState.current_file}
            size="medium"
            title={playerState.is_playing ? "Pause" : "Play"}
            sx={{ bgcolor: "action.hover" }}
          >
            {playerState.is_playing ? <Pause /> : <PlayArrow />}
          </IconButton>

          <IconButton
            onClick={() => {/* TODO: implement fast forward */}}
            disabled={!playerState.current_file}
            size="small"
            title="Fast Forward"
          >
            <FastForward />
          </IconButton>

          <IconButton
            onClick={() => {/* TODO: implement next track */}}
            disabled={!playerState.current_file}
            size="small"
            title="Next Track"
          >
            <SkipNext />
          </IconButton>
        </Box>

        {/* Seekbar */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
          <Typography variant="caption" sx={{ minWidth: "45px", textAlign: "right", color: "text.secondary", fontSize: "0.7rem" }}>
            {formatTime(currentPosition)}
          </Typography>
          <Slider
            min={0}
            max={duration || 100}
            value={currentPosition}
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
            disabled={!playerState.current_file}
            sx={{ flex: 1, py: 0 }}
            size="small"
          />
          <Typography variant="caption" sx={{ minWidth: "45px", color: "text.secondary", fontSize: "0.7rem" }}>
            {formatTime(duration)}
          </Typography>
        </Box>
      </Box>

      {/* Right Side Controls */}
      {!isMobile && (
        <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
          <IconButton
            onClick={() => {/* TODO: implement repeat */}}
            size="small"
            title="Repeat"
          >
            <Repeat />
          </IconButton>

          <IconButton
            onClick={() => {/* TODO: implement shuffle */}}
            size="small"
            title="Shuffle"
          >
            <Shuffle />
          </IconButton>

          <IconButton
            onClick={() => {/* TODO: implement menu */}}
            size="small"
            title="Menu"
          >
            <Menu />
          </IconButton>

          <IconButton
            onClick={() => {/* TODO: implement volume control */}}
            size="small"
            title="Volume"
          >
            <VolumeUp />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}
