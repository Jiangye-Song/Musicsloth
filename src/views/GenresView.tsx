import { useState, useEffect } from "react";
import { libraryApi, Genre, Track } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";

export default function GenresView() {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [filteredGenres, setFilteredGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);

  useEffect(() => {
    const loadGenres = async () => {
      try {
        const allGenres = await libraryApi.getAllGenres();
        setGenres(allGenres);
        setFilteredGenres(allGenres);
      } catch (error) {
        console.error("Failed to load genres:", error);
      } finally {
        setLoading(false);
      }
    };

    loadGenres();
  }, []);

  const handleGenreClick = async (genre: Genre) => {
    setSelectedGenre(genre);
    try {
      const tracks = await libraryApi.getTracksByGenre(genre.id);
      setGenreTracks(tracks);
    } catch (error) {
      console.error("Failed to load genre tracks:", error);
    }
  };

  const handleBack = () => {
    setSelectedGenre(null);
    setGenreTracks([]);
  };

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredGenres(genres);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredGenres(
        genres.filter((genre) => genre.name.toLowerCase().includes(query))
      );
    }
  }, [searchQuery, genres]);

  if (selectedGenre) {
    return (
      <div>
        <div
          style={{
            padding: "15px 20px",
            backgroundColor: "#1a1a1a",
            borderBottom: "1px solid #333",
            display: "flex",
            alignItems: "center",
            gap: "15px",
          }}
        >
          <button
            onClick={handleBack}
            style={{
              padding: "8px 16px",
              backgroundColor: "#333",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            ← Back
          </button>
          <h2 style={{ margin: 0, fontSize: "18px" }}>
            {selectedGenre.name} ({genreTracks.length} tracks)
          </h2>
        </div>
        <div style={{ padding: "20px" }}>
          <VirtualTrackList tracks={genreTracks} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Search Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "15px 20px",
          backgroundColor: "#1a1a1a",
          borderBottom: "1px solid #333",
          gap: "10px",
        }}
      >
        <span style={{ fontSize: "20px" }}>🔍</span>
        <input
          type="text"
          placeholder="Search a genre..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            padding: "10px 15px",
            backgroundColor: "transparent",
            border: "none",
            color: "#fff",
            fontSize: "16px",
            outline: "none",
          }}
        />
      </div>

      {/* Genres List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        {loading ? (
          <p style={{ color: "#888" }}>Loading genres...</p>
        ) : genres.length === 0 ? (
          <div
            style={{
              padding: "20px",
              backgroundColor: "#2a2a2a",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#888", margin: 0 }}>
              No genres in library. Scan your music folder to populate the
              library.
            </p>
          </div>
        ) : filteredGenres.length === 0 ? (
          <div
            style={{
              padding: "20px",
              backgroundColor: "#2a2a2a",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#888", margin: 0 }}>
              No genres found matching "{searchQuery}"
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {filteredGenres.map((genre) => (
              <div
                key={genre.id}
                onClick={() => handleGenreClick(genre)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "20px",
                  borderBottom: "1px solid #2a2a2a",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                  gap: "15px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#2a2a2a";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                {/* Genre Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      margin: "0 0 5px 0",
                      fontSize: "18px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {genre.name}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      color: "#888",
                    }}
                  >
                    {genre.song_count} song{genre.song_count !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
