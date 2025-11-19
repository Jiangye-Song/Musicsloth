import { useState, useEffect } from "react";
import { libraryApi } from "../services/api";

export default function GenresView() {
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadGenres = async () => {
      try {
        const allGenres = await libraryApi.getAllGenres();
        setGenres(allGenres);
      } catch (error) {
        console.error("Failed to load genres:", error);
      } finally {
        setLoading(false);
      }
    };

    loadGenres();
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: "20px" }}>Genres ({genres.length})</h2>

      {loading ? (
        <p style={{ color: "#888" }}>Loading genres...</p>
      ) : genres.length === 0 ? (
        <div style={{ padding: "20px", backgroundColor: "#2a2a2a", borderRadius: "8px", textAlign: "center" }}>
          <p style={{ color: "#888", margin: 0 }}>
            No genres in library. Scan your music folder to populate the library.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "15px" }}>
          {genres.map((genre, index) => (
            <div
              key={index}
              style={{
                padding: "30px 20px",
                backgroundColor: "#2a2a2a",
                borderRadius: "8px",
                border: "1px solid #333",
                textAlign: "center",
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
              <div style={{ fontSize: "32px", marginBottom: "10px" }}>🎵</div>
              <h3 style={{ margin: 0, fontSize: "16px" }}>{genre}</h3>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
