import { useState, useEffect } from "react";
import { libraryApi, Album } from "../services/api";

export default function AlbumsView() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAlbums = async () => {
      try {
        const allAlbums = await libraryApi.getAllAlbums();
        setAlbums(allAlbums);
      } catch (error) {
        console.error("Failed to load albums:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAlbums();
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: "20px" }}>Albums ({albums.length})</h2>

      {loading ? (
        <p style={{ color: "#888" }}>Loading albums...</p>
      ) : albums.length === 0 ? (
        <div style={{ padding: "20px", backgroundColor: "#2a2a2a", borderRadius: "8px", textAlign: "center" }}>
          <p style={{ color: "#888", margin: 0 }}>
            No albums in library. Scan your music folder to populate the library.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "15px" }}>
          {albums.map((album) => (
            <div
              key={album.id}
              style={{
                padding: "15px",
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
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  backgroundColor: "#1a1a1a",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "10px",
                  fontSize: "48px",
                }}
              >
                💿
              </div>
              <h3 style={{ margin: "0 0 5px 0", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {album.name}
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {album.artist || "Unknown Artist"}
                {album.year && ` • ${album.year}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
