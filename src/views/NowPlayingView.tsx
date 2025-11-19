import { useState, useEffect } from "react";
import { playerApi, PlayerState } from "../services/api";

export default function NowPlayingView() {
  const [playerState, setPlayerState] = useState<PlayerState>({
    is_playing: false,
    is_paused: false,
    current_file: null,
  });

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

  const fileName = playerState.current_file
    ? playerState.current_file.split(/[\\/]/).pop()
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "40px" }}>
      {/* Album Art Placeholder */}
      <div
        style={{
          width: "300px",
          height: "300px",
          backgroundColor: "#2a2a2a",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "30px",
          border: "1px solid #333",
        }}
      >
        {fileName ? (
          <span style={{ fontSize: "64px" }}>🎵</span>
        ) : (
          <span style={{ fontSize: "48px", color: "#666" }}>No Track</span>
        )}
      </div>

      {/* Track Information */}
      {fileName ? (
        <div style={{ textAlign: "center", maxWidth: "600px", marginBottom: "30px" }}>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "24px", fontWeight: "bold" }}>
            {fileName}
          </h2>
          <p style={{ margin: "5px 0", fontSize: "16px", color: "#aaa" }}>
            Unknown Artist
          </p>
          <p style={{ margin: "5px 0", fontSize: "14px", color: "#888" }}>
            Unknown Album
          </p>
        </div>
      ) : (
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "24px", color: "#666" }}>
            No track playing
          </h2>
          <p style={{ margin: "5px 0", fontSize: "14px", color: "#666" }}>
            Use "Open File" to start playback
          </p>
        </div>
      )}

      {/* Tag Information Section */}
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          backgroundColor: "#2a2a2a",
          borderRadius: "8px",
          padding: "20px",
          marginBottom: "20px",
          border: "1px solid #333",
        }}
      >
        <h3 style={{ margin: "0 0 15px 0", fontSize: "18px", borderBottom: "1px solid #333", paddingBottom: "10px" }}>
          Track Information
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "10px", fontSize: "14px" }}>
          <span style={{ color: "#888" }}>Title:</span>
          <span>{fileName || "—"}</span>
          
          <span style={{ color: "#888" }}>Artist:</span>
          <span>—</span>
          
          <span style={{ color: "#888" }}>Album:</span>
          <span>—</span>
          
          <span style={{ color: "#888" }}>Year:</span>
          <span>—</span>
          
          <span style={{ color: "#888" }}>Genre:</span>
          <span>—</span>
          
          <span style={{ color: "#888" }}>Duration:</span>
          <span>—</span>
        </div>
      </div>

      {/* Lyrics Section */}
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          backgroundColor: "#2a2a2a",
          borderRadius: "8px",
          padding: "20px",
          border: "1px solid #333",
        }}
      >
        <h3 style={{ margin: "0 0 15px 0", fontSize: "18px", borderBottom: "1px solid #333", paddingBottom: "10px" }}>
          Lyrics
        </h3>
        <div
          style={{
            fontSize: "14px",
            color: "#888",
            lineHeight: "1.8",
            textAlign: "center",
            padding: "20px",
          }}
        >
          Lyrics will appear here when available
        </div>
      </div>
    </div>
  );
}
