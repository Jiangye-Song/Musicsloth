import { useState, useEffect, useRef } from "react";
import { playerApi, PlayerState } from "../services/api";

export default function PlayerControls() {
  const [playerState, setPlayerState] = useState<PlayerState>({
    is_playing: false,
    is_paused: false,
    current_file: null,
    position_ms: 0,
    duration_ms: null,
  });
  const [volume, setVolume] = useState(0.7);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const seekTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Update player state periodically
    const interval = setInterval(async () => {
      try {
        const state = await playerApi.getState();
        setPlayerState(state);
      } catch (error) {
        console.error("Failed to get player state:", error);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

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

  const handleStop = async () => {
    try {
      await playerApi.stop();
    } catch (error) {
      console.error("Failed to stop playback:", error);
    }
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    try {
      await playerApi.setVolume(newVolume);
    } catch (error) {
      console.error("Failed to set volume:", error);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const position = parseInt(e.target.value);
    setSeekPosition(position);
    setIsSeeking(true);

    // Debounce seek requests
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }

    seekTimeoutRef.current = window.setTimeout(async () => {
      try {
        await playerApi.seekTo(position);
        setIsSeeking(false);
      } catch (error) {
        console.error("Failed to seek:", error);
        setIsSeeking(false);
      }
    }, 100);
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const currentPosition = isSeeking ? seekPosition : playerState.position_ms;
  const duration = playerState.duration_ms || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Seekbar */}
      {playerState.current_file && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}>
          <span style={{ fontSize: "12px", color: "#888", minWidth: "45px", textAlign: "right" }}>
            {formatTime(currentPosition)}
          </span>
          <input
            type="range"
            min="0"
            max={duration}
            value={currentPosition}
            onChange={handleSeekChange}
            disabled={!playerState.current_file}
            style={{
              flex: 1,
              height: "4px",
              borderRadius: "2px",
              outline: "none",
              cursor: playerState.current_file ? "pointer" : "not-allowed",
            }}
          />
          <span style={{ fontSize: "12px", color: "#888", minWidth: "45px" }}>
            {formatTime(duration)}
          </span>
        </div>
      )}

      {/* Player Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
      {/* Track Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {playerState.current_file ? (
          <div style={{ fontSize: "14px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <strong>Now Playing:</strong> {playerState.current_file.split(/[\\/]/).pop()}
          </div>
        ) : (
          <div style={{ fontSize: "14px", color: "#666" }}>No track loaded</div>
        )}
      </div>

      {/* Playback Controls */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          onClick={handleStop}
          disabled={!playerState.current_file}
          style={{
            padding: "8px 12px",
            backgroundColor: "#444",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: playerState.current_file ? "pointer" : "not-allowed",
            opacity: playerState.current_file ? 1 : 0.4,
            fontSize: "16px",
          }}
          title="Stop"
        >
          ⏹
        </button>

        <button
          onClick={handlePlayPause}
          disabled={!playerState.current_file}
          style={{
            padding: "10px 16px",
            backgroundColor: playerState.is_playing ? "#ff9800" : "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: playerState.current_file ? "pointer" : "not-allowed",
            opacity: playerState.current_file ? 1 : 0.4,
            fontSize: "16px",
            fontWeight: "bold",
          }}
          title={playerState.is_playing ? "Pause" : "Play"}
        >
          {playerState.is_playing ? "⏸" : "▶"}
        </button>
      </div>

      {/* Volume Control */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "150px" }}>
        <span style={{ fontSize: "16px" }}>🔊</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolumeChange}
          style={{ flex: 1 }}
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
        <span style={{ fontSize: "12px", color: "#888", minWidth: "35px" }}>
          {Math.round(volume * 100)}%
        </span>
      </div>
      </div>
    </div>
  );
}
