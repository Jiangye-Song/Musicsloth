import { useState, useEffect } from "react";
import { libraryApi, Artist } from "../services/api";

export default function ArtistsView() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadArtists = async () => {
      try {
        const allArtists = await libraryApi.getAllArtists();
        setArtists(allArtists);
      } catch (error) {
        console.error("Failed to load artists:", error);
      } finally {
        setLoading(false);
      }
    };

    loadArtists();
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: "20px" }}>Artists ({artists.length})</h2>

      {loading ? (
        <p style={{ color: "#888" }}>Loading artists...</p>
      ) : artists.length === 0 ? (
        <div style={{ padding: "20px", backgroundColor: "#2a2a2a", borderRadius: "8px", textAlign: "center" }}>
          <p style={{ color: "#888", margin: 0 }}>
            No artists in library. Scan your music folder to populate the library.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "15px" }}>
          {artists.map((artist) => (
            <div
              key={artist.id}
              style={{
                padding: "20px",
                backgroundColor: "#2a2a2a",
                borderRadius: "8px",
                border: "1px solid #333",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#333";
                e.currentTarget.style.borderColor = "#4CAF50";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#2a2a2a";
                e.currentTarget.style.borderColor = "#333";
              }}
            >
              <div style={{ fontSize: "48px", textAlign: "center", marginBottom: "10px" }}>🎤</div>
              <h3 style={{ margin: 0, fontSize: "16px", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {artist.name}
              </h3>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
