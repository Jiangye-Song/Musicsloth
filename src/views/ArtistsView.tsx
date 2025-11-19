import { useState, useEffect } from "react";
import { libraryApi, Artist, Track } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";

export default function ArtistsView() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"artists" | "album-artists" | "composers">("artists");
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [artistTracks, setArtistTracks] = useState<Track[]>([]);

  useEffect(() => {
    const loadArtists = async () => {
      try {
        const allArtists = await libraryApi.getAllArtists();
        setArtists(allArtists);
        setFilteredArtists(allArtists);
      } catch (error) {
        console.error("Failed to load artists:", error);
      } finally {
        setLoading(false);
      }
    };

    loadArtists();
  }, []);

  const handleArtistClick = async (artist: Artist) => {
    setSelectedArtist(artist);
    try {
      const tracks = await libraryApi.getTracksByArtist(artist.id);
      setArtistTracks(tracks);
    } catch (error) {
      console.error("Failed to load artist tracks:", error);
    }
  };

  const handleBack = () => {
    setSelectedArtist(null);
    setArtistTracks([]);
  };

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredArtists(artists);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredArtists(
        artists.filter((artist) => artist.name.toLowerCase().includes(query))
      );
    }
  }, [searchQuery, artists]);

  if (selectedArtist) {
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
            {selectedArtist.name} ({artistTracks.length} tracks)
          </h2>
        </div>
        <div style={{ padding: "20px" }}>
          <VirtualTrackList tracks={artistTracks} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Tab Buttons */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          padding: "15px 20px",
          backgroundColor: "#1a1a1a",
          borderBottom: "1px solid #333",
        }}
      >
        {["artists", "album-artists", "composers"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            style={{
              padding: "8px 20px",
              backgroundColor: activeTab === tab ? "transparent" : "transparent",
              color: "#fff",
              border: activeTab === tab ? "2px solid #ff4444" : "2px solid #444",
              borderRadius: "20px",
              cursor: "pointer",
              fontSize: "14px",
              textTransform: "capitalize",
              transition: "all 0.2s",
            }}
          >
            {tab === "album-artists" ? "Album-Artists" : tab}
          </button>
        ))}
      </div>

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
          placeholder="Search an artist..."
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

      {/* Artists List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        {loading ? (
          <p style={{ color: "#888" }}>Loading artists...</p>
        ) : artists.length === 0 ? (
          <div
            style={{
              padding: "20px",
              backgroundColor: "#2a2a2a",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#888", margin: 0 }}>
              No artists in library. Scan your music folder to populate the
              library.
            </p>
          </div>
        ) : filteredArtists.length === 0 ? (
          <div
            style={{
              padding: "20px",
              backgroundColor: "#2a2a2a",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#888", margin: 0 }}>
              No artists found matching "{searchQuery}"
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {filteredArtists.map((artist) => (
              <div
                key={artist.id}
                onClick={() => handleArtistClick(artist)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "15px 20px",
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
                {/* Artist Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      margin: "0 0 5px 0",
                      fontSize: "16px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {artist.name}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      color: "#888",
                    }}
                  >
                    {artist.song_count} song{artist.song_count !== 1 ? "s" : ""}
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
