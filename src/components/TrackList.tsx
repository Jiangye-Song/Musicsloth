import { Track, playerApi } from "../services/api";

interface TrackListProps {
  tracks: Track[];
  onBack?: () => void;
  title?: string;
}

export default function TrackList({ tracks, onBack, title }: TrackListProps) {
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
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "20px",
          backgroundColor: "#1a1a1a",
          borderBottom: "1px solid #333",
          display: "flex",
          alignItems: "center",
          gap: "15px",
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            style={{
              padding: "8px 16px",
              backgroundColor: "#2a2a2a",
              color: "#fff",
              border: "1px solid #444",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            ← Back
          </button>
        )}
        <h2 style={{ margin: 0, fontSize: "20px" }}>
          {title || `${tracks.length} Tracks`}
        </h2>
      </div>

      {/* Track Table */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tracks.length === 0 ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "#888",
            }}
          >
            No tracks found
          </div>
        ) : (
          <div style={{ backgroundColor: "#2a2a2a" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: "#333",
                    borderBottom: "1px solid #444",
                  }}
                >
                  <th style={{ padding: "12px", textAlign: "left", width: "40px" }}>
                    #
                  </th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Title</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Artist</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Album</th>
                  <th style={{ padding: "12px", textAlign: "left", width: "80px" }}>
                    Duration
                  </th>
                  <th style={{ padding: "12px", textAlign: "left", width: "80px" }}>
                    Action
                  </th>
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
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = "#333")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    <td style={{ padding: "12px", color: "#888" }}>
                      {index + 1}
                    </td>
                    <td style={{ padding: "12px" }}>{track.title}</td>
                    <td style={{ padding: "12px", color: "#aaa" }}>
                      {track.artist || "Unknown"}
                    </td>
                    <td style={{ padding: "12px", color: "#aaa" }}>
                      {track.album || "Unknown"}
                    </td>
                    <td style={{ padding: "12px", color: "#888" }}>
                      {formatDuration(track.duration_ms)}
                    </td>
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
                        ▶ Play
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
