import { useState, useEffect } from "react";
import { libraryApi, playlistApi, Track } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";

type SystemPlaylist = {
  id: string;
  name: string;
  icon: string;
  loadTracks: () => Promise<Track[]>;
};

export default function PlaylistsView() {
  const [systemPlaylists] = useState<SystemPlaylist[]>([
    {
      id: "all-songs",
      name: "All Songs",
      icon: "🎵",
      loadTracks: () => libraryApi.getAllTracks(),
    },
    {
      id: "recent-added",
      name: "Recently Added",
      icon: "🆕",
      loadTracks: () => playlistApi.getRecentTracks(),
    },
    {
      id: "most-played",
      name: "Most Played",
      icon: "🔥",
      loadTracks: () => playlistApi.getMostPlayedTracks(),
    },
    {
      id: "not-played",
      name: "Never Played",
      icon: "💤",
      loadTracks: () => playlistApi.getUnplayedTracks(),
    },
  ]);

  const [selectedPlaylist, setSelectedPlaylist] = useState<SystemPlaylist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Auto-select "All Songs" on mount
    if (systemPlaylists.length > 0) {
      handleSelectPlaylist(systemPlaylists[0]);
    }
  }, []);

  const handleSelectPlaylist = async (playlist: SystemPlaylist) => {
    setSelectedPlaylist(playlist);
    setLoading(true);
    try {
      const loadedTracks = await playlist.loadTracks();
      setTracks(loadedTracks);
    } catch (error) {
      console.error("Failed to load playlist tracks:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Playlist List Sidebar */}
      <div
        style={{
          width: "300px",
          borderRight: "1px solid #333",
          padding: "20px",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Playlists</h2>
        
        {/* System Playlists */}
        <div style={{ marginBottom: "30px" }}>
          <h3
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "12px",
            }}
          >
            System
          </h3>
          {systemPlaylists.map((playlist) => (
            <div
              key={playlist.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px",
                marginBottom: "4px",
                backgroundColor:
                  selectedPlaylist?.id === playlist.id ? "#444" : "transparent",
                borderRadius: "6px",
                cursor: "pointer",
                transition: "background-color 0.2s",
              }}
              onClick={() => handleSelectPlaylist(playlist)}
              onMouseEnter={(e) => {
                if (selectedPlaylist?.id !== playlist.id) {
                  e.currentTarget.style.backgroundColor = "#333";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedPlaylist?.id !== playlist.id) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <span style={{ fontSize: "20px" }}>{playlist.icon}</span>
              <span style={{ fontWeight: 500 }}>{playlist.name}</span>
            </div>
          ))}
        </div>

        {/* User Playlists (placeholder) */}
        <div>
          <h3
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#888",
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "12px",
            }}
          >
            My Playlists
          </h3>
          <div
            style={{
              color: "#666",
              fontSize: "14px",
              textAlign: "center",
              padding: "20px 10px",
            }}
          >
            Coming soon...
          </div>
        </div>
      </div>

      {/* Playlist Tracks */}
      <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column" }}>
        {selectedPlaylist ? (
          <>
            <div style={{ marginBottom: "20px" }}>
              <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "32px" }}>{selectedPlaylist.icon}</span>
                {selectedPlaylist.name}
              </h2>
              <p style={{ color: "#888", marginTop: "8px", marginBottom: 0 }}>
                {tracks.length} {tracks.length === 1 ? "song" : "songs"}
              </p>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
                Loading tracks...
              </div>
            ) : tracks.length > 0 ? (
              <div style={{ flex: 1, overflow: "hidden" }}>
                <VirtualTrackList
                  tracks={tracks}
                  contextType="library"
                  contextName={selectedPlaylist.name}
                />
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
                No tracks in this playlist.
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
            Select a playlist to view tracks
          </div>
        )}
      </div>
    </div>
  );
}
