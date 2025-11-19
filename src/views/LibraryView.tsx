import { useState, useEffect } from "react";
import { libraryApi, Track } from "../services/api";
import { playerApi } from "../services/api";
import LibraryScanner from "../components/LibraryScanner";

export default function LibraryView() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTracks = async () => {
    try {
      const allTracks = await libraryApi.getAllTracks();
      setTracks(allTracks);
    } catch (error) {
      console.error("Failed to load tracks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTracks();
  }, []);

  const handlePlayTrack = async (track: Track) => {
    try {
      await playerApi.playFile(track.file_path);
    } catch (error) {
      alert(`Failed to play track: ${error}`);
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <div>
      <LibraryScanner />

      <div style={{ marginTop: "30px" }}>
        <h2 style={{ marginBottom: "15px" }}>All Tracks ({tracks.length})</h2>

        {loading ? (
          <p style={{ color: "#888" }}>Loading tracks...</p>
        ) : tracks.length === 0 ? (
          <div style={{ padding: "20px", backgroundColor: "#2a2a2a", borderRadius: "8px", textAlign: "center" }}>
            <p style={{ color: "#888", margin: 0 }}>
              No tracks in library. Use the scanner above to add music files.
            </p>
          </div>
        ) : (
          <div style={{ backgroundColor: "#2a2a2a", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ backgroundColor: "#333", borderBottom: "1px solid #444" }}>
                  <th style={{ padding: "12px", textAlign: "left", width: "40px" }}>#</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Title</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Artist</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Album</th>
                  <th style={{ padding: "12px", textAlign: "left", width: "80px" }}>Duration</th>
                  <th style={{ padding: "12px", textAlign: "left", width: "80px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((track, index) => (
                  <tr
                    key={track.id}
                    style={{
                      borderBottom: "1px solid #333",
                      transition: "background-color 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#333")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <td style={{ padding: "12px", color: "#888" }}>{index + 1}</td>
                    <td style={{ padding: "12px" }}>{track.title}</td>
                    <td style={{ padding: "12px", color: "#aaa" }}>{track.artist || "—"}</td>
                    <td style={{ padding: "12px", color: "#aaa" }}>{track.album || "—"}</td>
                    <td style={{ padding: "12px", color: "#888" }}>{formatDuration(track.duration_ms)}</td>
                    <td style={{ padding: "12px" }}>
                      <button
                        onClick={() => handlePlayTrack(track)}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#4CAF50",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "12px",
                        }}
                      >
                        ▶
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
