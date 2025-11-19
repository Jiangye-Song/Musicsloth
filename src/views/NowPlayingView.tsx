import { useState, useEffect } from "react";
import { playerApi, libraryApi, Track } from "../services/api";

export default function NowPlayingView() {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [albumArt, setAlbumArt] = useState<string | null>(null);

  useEffect(() => {
    // Update player state and track metadata periodically
    const interval = setInterval(async () => {
      try {
        const state = await playerApi.getState();

        // Fetch track metadata if a file is playing
        if (state.current_file) {
          const track = await libraryApi.getCurrentTrack();
          setCurrentTrack(track);

          // Fetch album art
          if (track) {
            try {
              const artData = await libraryApi.getAlbumArt(track.file_path);
              if (artData && artData.length > 0) {
                const blob = new Blob([new Uint8Array(artData)], { type: "image/jpeg" });
                const url = URL.createObjectURL(blob);
                setAlbumArt((prevUrl) => {
                  if (prevUrl) URL.revokeObjectURL(prevUrl);
                  return url;
                });
              } else {
                setAlbumArt(null);
              }
            } catch (err) {
              console.error("Failed to load album art:", err);
              setAlbumArt(null);
            }
          }
        } else {
          setCurrentTrack(null);
          setAlbumArt(null);
        }
      } catch (error) {
        console.error("Failed to get player state:", error);
      }
    }, 500);

    return () => {
      clearInterval(interval);
      if (albumArt) URL.revokeObjectURL(albumArt);
    };
  }, []);



  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: "40px" }}>
      {/* Album Art */}
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
          overflow: "hidden",
        }}
      >
        {albumArt ? (
          <img src={albumArt} alt="Album Art" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <svg
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ opacity: 0.3 }}
          >
            <path
              d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
              fill="currentColor"
            />
          </svg>
        )}
      </div>

      {/* Track Information */}
      {currentTrack ? (
        <div style={{ textAlign: "center", maxWidth: "600px", marginBottom: "30px" }}>
          <h2 style={{ margin: "0 0 10px 0", fontSize: "24px", fontWeight: "bold" }}>
            {currentTrack.title}
          </h2>
          <p style={{ margin: "5px 0", fontSize: "16px", color: "#aaa" }}>
            {currentTrack.artist || "Unknown Artist"}
          </p>
          <p style={{ margin: "5px 0", fontSize: "14px", color: "#888" }}>
            {currentTrack.album || "Unknown Album"}
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
      {currentTrack && (
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
            <span>{currentTrack.title}</span>
            
            <span style={{ color: "#888" }}>Artist:</span>
            <span>{currentTrack.artist || "—"}</span>
            
            <span style={{ color: "#888" }}>Album Artist:</span>
            <span>{currentTrack.album_artist || "—"}</span>
            
            <span style={{ color: "#888" }}>Album:</span>
            <span>{currentTrack.album || "—"}</span>
            
            <span style={{ color: "#888" }}>Year:</span>
            <span>{currentTrack.year || "—"}</span>
            
            <span style={{ color: "#888" }}>Genre:</span>
            <span>{currentTrack.genre || "—"}</span>
            
            <span style={{ color: "#888" }}>Track:</span>
            <span>{currentTrack.track_number ? `${currentTrack.track_number}${currentTrack.disc_number ? ` (Disc ${currentTrack.disc_number})` : ""}` : "—"}</span>
            
            <span style={{ color: "#888" }}>Duration:</span>
            <span>{formatDuration(currentTrack.duration_ms)}</span>
            
            <span style={{ color: "#888" }}>Format:</span>
            <span>{currentTrack.file_format?.toUpperCase() || "—"}</span>
            
            <span style={{ color: "#888" }}>Bitrate:</span>
            <span>{currentTrack.bitrate ? `${Math.round(currentTrack.bitrate / 1000)} kbps` : "—"}</span>
            
            <span style={{ color: "#888" }}>Sample Rate:</span>
            <span>{currentTrack.sample_rate ? `${currentTrack.sample_rate} Hz` : "—"}</span>
          </div>
        </div>
      )}

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
