import { useState, useEffect, useRef } from "react";
import {
  Box,
  IconButton,
  Slider,
  Typography,
  useMediaQuery,
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

interface PlayerControlsProps {
  onExpandClick?: () => void;
  onQueueClick?: () => void;
}

export default function PlayerControls({ onExpandClick, onQueueClick }: PlayerControlsProps) {
  const { currentTrack, albumArt, playNext, playPrevious, isShuffled, toggleShuffle, isRepeating, toggleRepeat } = usePlayer();
  const [playerState, setPlayerState] = useState<PlayerState>({
    is_playing: false,
    is_paused: false,
    current_file: null,
    position_ms: 0,
    duration_ms: null,
  });
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [volume, setVolume] = useState(100);
  const [titleOverflows, setTitleOverflows] = useState(false);
  const [artistOverflows, setArtistOverflows] = useState(false);
  const [albumOverflows, setAlbumOverflows] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);
  const artistRef = useRef<HTMLDivElement>(null);
  const albumRef = useRef<HTMLDivElement>(null);

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
        // Play the loaded track
        console.log(`[PlayerControls] Playing loaded track from active queue: ${currentTrack.file_path}`);
        await playerApi.playFile(currentTrack.file_path);
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
    try {
      await playerApi.setVolume(newVolume / 100);
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
  const isMobile = useMediaQuery('(max-width:660px)');

  return (
    <Box sx={{ display: "flex", alignItems: "stretch", gap: 0, pr: isMobile ? 0 : 2, height: "80px" }}>
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
            flex: "0 0 calc(20%)",
            maxWidth: "160px",
            minWidth: "80px",
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
            overflow: "hidden",
          }}
        >
          <Box
            ref={titleRef}
            sx={{
              overflow: "hidden",
              whiteSpace: "nowrap",
              position: "relative",
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
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 0.5, mx: 0 }}>
        {/* Control Buttons */}
        <Box sx={{ display: "flex", gap: 3, alignItems: "center", justifyContent: isMobile ? "space-between" : "center", mx: "16px" }}>
          {isMobile && (<div>
            <Typography
              variant="body2"
              fontWeight="bold"
              noWrap
              sx={{ color: "text.primary" }}
            >
              {currentTrack ? currentTrack.title : "Track title"}
            </Typography>
          </div>)}

          <div>
            <IconButton
              onClick={playPrevious}
              disabled={!playerState.current_file && !currentTrack}
              size="small"
              title="Previous Track"
              sx={{ color: "text.primary" }}
            >
              <SkipPrevious />
            </IconButton>
            {!isMobile && (
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
            {!isMobile && (
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
            {isMobile && (<IconButton
              onClick={onQueueClick}
              size="small"
              title="Queue"
              sx={{ color: "text.primary" }}
            >
              <QueueMusic />
            </IconButton>)}
          </div>
          {!isMobile && (
            <div>

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
            </div>
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

      {/* Right Side Controls */}
      {!isMobile && (
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
  );
}
