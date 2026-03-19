import { useState, useEffect, useRef } from "react";
import {
  Box,
  IconButton,
  Slider,
  Typography,
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
  MusicNote,
  QueueMusic,
  Person,
  Album
} from "@mui/icons-material";
import { playerApi, PlayerState } from "../services/api";
import { usePlayer } from "../contexts/PlayerContext";
import { useSettings } from "../contexts/SettingsContext";
import { useLayoutMode } from "../hooks/useLayoutMode";
import BeatPulse from "./BeatPulse";

interface PlayerControlsProps {
  onExpandClick?: () => void;
  onQueueClick?: () => void;
}

export default function PlayerControls({ onExpandClick, onQueueClick }: PlayerControlsProps) {
  const { currentTrack, albumArt, playNext, playPrevious, isShuffled, toggleShuffle, isRepeating, toggleRepeat } = usePlayer();
  const { settings } = useSettings();
  const glowEnabled = settings.interface.theme.glow_effect ?? true;
  const [playerState, setPlayerState] = useState<PlayerState>({
    is_playing: false,
    is_paused: false,
    current_file: null,
    position_ms: 0,
    duration_ms: null,
  });
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [volume, setVolume] = useState(() => {
    // Load saved volume from localStorage, default to 80 (0dB)
    const saved = localStorage.getItem('musicsloth-volume');
    return saved !== null ? Number(saved) : 80;
  });
  const [titleOverflows, setTitleOverflows] = useState(false);
  const [artistOverflows, setArtistOverflows] = useState(false);
  const [albumOverflows, setAlbumOverflows] = useState(false);
  const [mobileTitleOverflows, setMobileTitleOverflows] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);
  const artistRef = useRef<HTMLDivElement>(null);
  const albumRef = useRef<HTMLDivElement>(null);
  const mobileTitleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Update player state periodically (faster for smoother seekbar)
    const interval = setInterval(async () => {
      try {
        const state = await playerApi.getState();
        if (!isSeeking) {
          setPlayerState(state);
        }
      } catch (error) {
        console.error("Failed to get player state:", error);
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isSeeking]);

  // Restore saved volume to backend on mount
  useEffect(() => {
    const restoreVolume = async () => {
      try {
        const db = playerApi.sliderToDb(volume);
        await playerApi.setVolumeDb(db);
      } catch (error) {
        console.error("Failed to restore volume:", error);
      }
    };
    restoreVolume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Check if text overflows and needs scrolling
  useEffect(() => {
    const checkOverflow = () => {
      if (titleRef.current) {
        const container = titleRef.current;
        const textElement = container.querySelector('span');
        if (textElement) {
          setTitleOverflows(textElement.scrollWidth > container.clientWidth);
        }
      }
      if (artistRef.current) {
        const container = artistRef.current;
        const textElement = container.querySelector('span');
        if (textElement) {
          setArtistOverflows(textElement.scrollWidth > container.clientWidth);
        }
      }
      if (albumRef.current) {
        const container = albumRef.current;
        const textElement = container.querySelector('span');
        if (textElement) {
          setAlbumOverflows(textElement.scrollWidth > container.clientWidth);
        }
      }
      if (mobileTitleRef.current) {
        const container = mobileTitleRef.current;
        const textElement = container.querySelector('span');
        if (textElement) {
          setMobileTitleOverflows(textElement.scrollWidth > container.clientWidth);
        }
      }
    };

    checkOverflow();
    // Recheck on window resize
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [currentTrack]);

  const handlePlayPause = async () => {
    try {
      if (playerState.is_playing) {
        await playerApi.pause();
      } else if (playerState.is_paused) {
        await playerApi.resume();
      } else if (currentTrack && !playerState.current_file) {
        // No file playing but we have a track loaded from active queue
        // Play the loaded track with ReplayGain normalization (if available)
        console.log(`[PlayerControls] Playing loaded track from active queue: ${currentTrack.file_path}`);
        await playerApi.playFile(currentTrack.file_path, currentTrack.normalization_gain_db);
      }
    } catch (error) {
      console.error("Failed to toggle playback:", error);
    }
  };

  const handleSeekMouseDown = () => {
    setIsSeeking(true);
  };

  const handleVolumeChange = async (_: Event, value: number | number[]) => {
    const newVolume = value as number;
    setVolume(newVolume);
    // Persist volume setting
    localStorage.setItem('musicsloth-volume', String(newVolume));
    try {
      // Convert slider position to dB for more natural volume curve
      const db = playerApi.sliderToDb(newVolume);
      await playerApi.setVolumeDb(db);
    } catch (error) {
      console.error("Failed to set volume:", error);
    }
  };

  const handleRewind = async () => {
    try {
      const newPosition = Math.max(0, playerState.position_ms - 5000); // 5 seconds back
      await playerApi.seekTo(newPosition);
    } catch (error) {
      console.error("Failed to rewind:", error);
    }
  };

  const handleFastForward = async () => {
    try {
      const maxPosition = playerState.duration_ms || playerState.position_ms;
      const newPosition = Math.min(maxPosition, playerState.position_ms + 15000); // 15 seconds forward
      await playerApi.seekTo(newPosition);
    } catch (error) {
      console.error("Failed to fast forward:", error);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const currentPosition = isSeeking ? seekPosition : playerState.position_ms;
  const duration = playerState.duration_ms || 0;
  const { isNarrow, isWide } = useLayoutMode();

  return (
    <BeatPulse enabled={glowEnabled} direction="bottom" maxOpacity={0.3} spread={60}>
      <Box sx={{ display: "flex", alignItems: "stretch", gap: 0, pr: isNarrow ? 0 : 2, height: "80px" }}>
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

      {/* Track Info - Hidden on narrow */}
      {!isNarrow && (
        <Box
          onClick={onExpandClick}
          sx={{
            width: "160px",
            flexShrink: 1,
            flexGrow: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            cursor: onExpandClick ? "pointer" : "default",
            transition: "background-color 0.2s",
            "&:hover": onExpandClick ? {
              bgcolor: "action.hover",
            } : {},
            px: 2,
            py: 1,
            overflow: "clip",
          }}
        >
          <Box
            ref={titleRef}
            sx={{
              overflow: "hidden",
              whiteSpace: "nowrap",
              position: "relative",
              width: "100%",
              maskImage: titleOverflows ? "linear-gradient(to right, black 85%, transparent)" : "none",
              WebkitMaskImage: titleOverflows ? "linear-gradient(to right, black 85%, transparent)" : "none",
            }}
          >
            <Typography
              variant="body2"
              fontWeight="bold"
              component="span"
              sx={{
                color: "text.primary",
                display: "inline-block",
                paddingRight: titleOverflows ? "40px" : "0",
                animation: titleOverflows ? "scroll-text 10s linear infinite" : "none",
                "@keyframes scroll-text": {
                  "0%": { transform: "translateX(0%)" },
                  "100%": { transform: "translateX(-100%)" },
                },
              }}
            >
              {currentTrack ? currentTrack.title : "Track title"}
            </Typography>
            {titleOverflows && (
              <Typography
                variant="body2"
                fontWeight="bold"
                component="span"
                sx={{
                  color: "text.primary",
                  display: "inline-block",
                  paddingRight: "40px",
                  animation: "scroll-text 10s linear infinite",
                  "@keyframes scroll-text": {
                    "0%": { transform: "translateX(0%)" },
                    "100%": { transform: "translateX(-100%)" },
                  },
                }}
              >
                {currentTrack ? currentTrack.title : "Track title"}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <Person sx={{ fontSize: 12, mr: "3px", flexShrink: 0, color: "text.primary" }} />
            <Box
              ref={artistRef}
              sx={{
                overflow: "hidden",
                whiteSpace: "nowrap",
                flex: 1,
                position: "relative",
                width: 0,
                maskImage: artistOverflows ? "linear-gradient(to right, black 85%, transparent)" : "none",
                WebkitMaskImage: artistOverflows ? "linear-gradient(to right, black 85%, transparent)" : "none",
              }}
            >
              <Typography
                variant="caption"
                component="span"
                sx={{
                  color: "text.primary",
                  display: "inline-block",
                  paddingRight: artistOverflows ? "40px" : "0",
                  animation: artistOverflows ? "scroll-text 10s linear infinite" : "none",
                  "@keyframes scroll-text": {
                    "0%": { transform: "translateX(0%)" },
                    "100%": { transform: "translateX(-100%)" },
                  },
                }}
              >
                {currentTrack
                  ? (currentTrack.artist || "Unknown Artist")
                  : "Track artist"}
              </Typography>
              {artistOverflows && (
                <Typography
                  variant="caption"
                  component="span"
                  sx={{
                    color: "text.primary",
                    display: "inline-block",
                    paddingRight: "40px",
                    animation: "scroll-text 10s linear infinite",
                    "@keyframes scroll-text": {
                      "0%": { transform: "translateX(0%)" },
                      "100%": { transform: "translateX(-100%)" },
                    },
                  }}
                >
                  {currentTrack
                    ? (currentTrack.artist || "Unknown Artist")
                    : "Track artist"}
                </Typography>
              )}
            </Box>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <Album sx={{ fontSize: 12, mr: "3px", flexShrink: 0, color: "text.primary" }} />
            <Box
              ref={albumRef}
              sx={{
                overflow: "hidden",
                whiteSpace: "nowrap",
                flex: 1,
                position: "relative",
                width: 0,
                maskImage: albumOverflows ? "linear-gradient(to right, black 85%, transparent)" : "none",
                WebkitMaskImage: albumOverflows ? "linear-gradient(to right, black 85%, transparent)" : "none",
              }}
            >
              <Typography
                variant="caption"
                component="span"
                sx={{
                  color: "text.primary",
                  display: "inline-block",
                  paddingRight: albumOverflows ? "40px" : "0",
                  animation: albumOverflows ? "scroll-text 10s linear infinite" : "none",
                  "@keyframes scroll-text": {
                    "0%": { transform: "translateX(0%)" },
                    "100%": { transform: "translateX(-100%)" },
                  },
                }}
              >
                {currentTrack
                  ? (currentTrack.album || "Unknown Album")
                  : "Track album"}
              </Typography>
              {albumOverflows && (
                <Typography
                  variant="caption"
                  component="span"
                  sx={{
                    color: "text.primary",
                    display: "inline-block",
                    paddingRight: "40px",
                    animation: "scroll-text 10s linear infinite",
                    "@keyframes scroll-text": {
                      "0%": { transform: "translateX(0%)" },
                      "100%": { transform: "translateX(-100%)" },
                    },
                  }}
                >
                  {currentTrack
                    ? (currentTrack.album || "Unknown Album")
                    : "Track album"}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* Center: Playback Controls with Seekbar */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 0.5, mx: 0, minWidth: 0, overflow: "hidden" }}>
        {/* Control Buttons */}
        <Box sx={{ display: "flex", gap: isNarrow ? 1 : 1, alignItems: "center", justifyContent: isNarrow ? "space-between" : "center", mx: isNarrow ? "8px" : "16px", minWidth: 0 }}>
          {isNarrow && (<Box
            ref={mobileTitleRef}
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              whiteSpace: "nowrap",
              position: "relative",
              maskImage: mobileTitleOverflows ? "linear-gradient(to right, black 85%, transparent)" : "none",
              WebkitMaskImage: mobileTitleOverflows ? "linear-gradient(to right, black 85%, transparent)" : "none",
            }}
          >
            <Typography
              variant="body2"
              fontWeight="bold"
              component="span"
              sx={{
                color: "text.primary",
                display: "inline-block",
                paddingRight: mobileTitleOverflows ? "40px" : "0",
                animation: mobileTitleOverflows ? "scroll-text 10s linear infinite" : "none",
                "@keyframes scroll-text": {
                  "0%": { transform: "translateX(0%)" },
                  "100%": { transform: "translateX(-100%)" },
                },
              }}
            >
              {currentTrack ? currentTrack.title : "Track title"}
            </Typography>
            {mobileTitleOverflows && (
              <Typography
                variant="body2"
                fontWeight="bold"
                component="span"
                sx={{
                  color: "text.primary",
                  display: "inline-block",
                  paddingRight: "40px",
                  animation: "scroll-text 10s linear infinite",
                  "@keyframes scroll-text": {
                    "0%": { transform: "translateX(0%)" },
                    "100%": { transform: "translateX(-100%)" },
                  },
                }}
              >
                {currentTrack ? currentTrack.title : "Track title"}
              </Typography>
            )}
          </Box>)}

          <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <IconButton
              onClick={playPrevious}
              disabled={!playerState.current_file && !currentTrack}
              size="small"
              title="Previous Track"
              sx={{ color: "text.primary" }}
            >
              <SkipPrevious />
            </IconButton>
            {isWide && (
              <IconButton
                onClick={handleRewind}
                disabled={!playerState.current_file}
                size="small"
                title="Rewind 5s"
                sx={{ color: "text.primary" }}
              >
                <FastRewind />
              </IconButton>
            )}
            <IconButton
              onClick={handlePlayPause}
              disabled={!playerState.current_file && !currentTrack}
              size="medium"
              title={playerState.is_playing ? "Pause" : "Play"}
              sx={{ color: "primary.main", "&:hover": { bgcolor: "action.hover" } }}
            >
              {playerState.is_playing ? <Pause /> : <PlayArrow />}
            </IconButton>
            {isWide && (
              <IconButton
                onClick={handleFastForward}
                disabled={!playerState.current_file}
                size="small"
                title="Fast Forward 15s"
                sx={{ color: "text.primary" }}
              >
                <FastForward />
              </IconButton>
            )}
            <IconButton
              onClick={playNext}
              disabled={!playerState.current_file && !currentTrack}
              size="small"
              title="Next Track"
              sx={{ color: "text.primary" }}
            >
              <SkipNext />
            </IconButton>
            {isNarrow && (<IconButton
              onClick={onQueueClick}
              size="small"
              title="Queue"
              sx={{ color: "text.primary" }}
            >
              <QueueMusic />
            </IconButton>)}
          </Box>
          {!isNarrow && (
            <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>

              <IconButton
                onClick={toggleRepeat}
                size="small"
                title={isRepeating ? "Repeat Track" : "Repeat Queue"}
                sx={{ color: isRepeating ? "primary.main" : "text.primary" }}
              >
                <Repeat />
              </IconButton>
              <IconButton
                onClick={toggleShuffle}
                size="small"
                title={isShuffled ? "Shuffle On" : "Shuffle Off"}
                sx={{ color: isShuffled ? "primary.main" : "text.primary" }}
              >
                <Shuffle />
              </IconButton>
              <IconButton
                onClick={onQueueClick}
                size="small"
                title="Queue"
                sx={{ color: "text.primary" }}
              >
                <QueueMusic />
              </IconButton>
            </Box>
          )}
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

      {/* Right Side Controls - wide only */}
      {isWide && (
        <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 100 }}>
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
        </Box>
      )}
      </Box>
    </BeatPulse>
  );
}
