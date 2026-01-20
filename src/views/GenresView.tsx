import { useState, useEffect } from "react";
import { libraryApi, Genre, Track } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";
import IconButton from "@mui/material/IconButton";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface GenresViewProps {
  searchQuery?: string;
  initialGenreName?: string;
  initialTrackId?: number;
  onClearSearch?: () => void;
  onNavigateToArtist?: (artistName: string, trackId: number) => void;
  onNavigateToAlbum?: (albumName: string, trackId: number) => void;
  onNavigateToGenre?: (genreName: string, trackId: number) => void;
}

export default function GenresView({ searchQuery = "", initialGenreName, initialTrackId, onClearSearch, onNavigateToArtist, onNavigateToAlbum, onNavigateToGenre }: GenresViewProps) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [filteredGenres, setFilteredGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [trackIdToFlash, setTrackIdToFlash] = useState<number | undefined>(initialTrackId);

  // Load genres on mount
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

  // Handle navigation from Now Playing view
  useEffect(() => {
    if (initialGenreName && genres.length > 0) {
      const genre = genres.find(g => g.name === initialGenreName);
      if (genre) {
        // Update trackIdToFlash before navigating
        setTrackIdToFlash(initialTrackId);
        handleGenreClick(genre);
      }
    }
  }, [initialGenreName, initialTrackId, genres]);

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
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
          <IconButton
            onClick={handleBack}
          ><ArrowBackIcon /></IconButton>
          <h2 style={{ margin: 0, fontSize: "18px" }}>
            {selectedGenre.name} ({genreTracks.length} tracks)
          </h2>
        </div>
        <div style={{ flex: 1, overflow: "hidden", padding: "20px" }}>
          <VirtualTrackList tracks={genreTracks} contextType="genre" contextName={selectedGenre?.name} showSearch={true} initialTrackId={trackIdToFlash} onNavigateToArtist={onNavigateToArtist} onNavigateToAlbum={onNavigateToAlbum} onNavigateToGenre={onNavigateToGenre} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "15px 20px",
          backgroundColor: "#1a1a1a",
          borderBottom: "1px solid #333",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px" }}>Genres</h2>
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
      {searchQuery && onClearSearch && (
        <div className="search-tip">
          <span>Searching "{searchQuery}", </span>
          <button
            onClick={onClearSearch}
          >
            show all items
          </button>
        </div>
      )}
    </div>
  );
}
