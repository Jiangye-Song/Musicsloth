import { useState, useEffect } from "react";
import { playerApi, PlayerState } from "../services/api";

interface PlayerControlsProps {
  onFileSelect: () => void;
}

export default function PlayerControls({ onFileSelect }: PlayerControlsProps) {
  const [playerState, setPlayerState] = useState<PlayerState>({
    is_playing: false,
    is_paused: false,
    current_file: null,
  });
  const [volume, setVolume] = useState(0.7);

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

  return (
    <div style={{ 
      padding: "20px", 
      backgroundColor: "#2a2a2a", 
      borderRadius: "8px",
      color: "white"
    }}>
      <h2>Music Player</h2>
      
      {playerState.current_file && (
        <div style={{ marginBottom: "15px", fontSize: "14px", color: "#ccc" }}>
          <strong>Playing:</strong> {playerState.current_file.split(/[\\/]/).pop()}
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
        <button
          onClick={onFileSelect}
          style={{
            padding: "10px 20px",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Open File
        </button>

        <button
          onClick={handlePlayPause}
          disabled={!playerState.current_file}
          style={{
            padding: "10px 20px",
            backgroundColor: playerState.is_playing ? "#ff9800" : "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: playerState.current_file ? "pointer" : "not-allowed",
            opacity: playerState.current_file ? 1 : 0.5,
          }}
        >
          {playerState.is_playing ? "⏸ Pause" : "▶ Play"}
        </button>

        <button
          onClick={handleStop}
          disabled={!playerState.current_file}
          style={{
            padding: "10px 20px",
            backgroundColor: "#f44336",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: playerState.current_file ? "pointer" : "not-allowed",
            opacity: playerState.current_file ? 1 : 0.5,
          }}
        >
          ⏹ Stop
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span>🔊 Volume:</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolumeChange}
          style={{ flex: 1 }}
        />
        <span>{Math.round(volume * 100)}%</span>
      </div>

      <div style={{ marginTop: "15px", fontSize: "12px", color: "#888" }}>
        Status: {playerState.is_playing ? "Playing" : playerState.is_paused ? "Paused" : "Stopped"}
      </div>
    </div>
  );
}
