import { useState, useEffect } from "react";
import { libraryApi, playlistApi, Track } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";
import SearchBar from "../components/SearchBar";
import { Box, IconButton } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

type SystemPlaylist = {
  id: string;
  name: string;
  icon: string;
  loadTracks: () => Promise<Track[]>;
};

interface PlaylistItemProps {
  playlist: SystemPlaylist;
  onClick: () => void;
}

interface PlaylistsViewProps {
  searchQuery?: string;
}

function PlaylistItem({ playlist, onClick }: PlaylistItemProps) {
  return (
    <div
      onClick={onClick}
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
      {/* Playlist Icon */}
      <div
        style={{
          width: "60px",
          height: "60px",
          backgroundColor: "#1a1a1a",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "32px",
          flexShrink: 0,
        }}
      >
        {playlist.icon}
      </div>

      {/* Playlist Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3
          style={{
            margin: 0,
            fontSize: "16px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {playlist.name}
        </h3>
      </div>
    </div>
  );
}

export default function PlaylistsView({ searchQuery = "" }: PlaylistsViewProps) {
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
  const [filteredPlaylists, setFilteredPlaylists] = useState<SystemPlaylist[]>(systemPlaylists);

  const [selectedPlaylist, setSelectedPlaylist] = useState<SystemPlaylist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [trackSearchQuery, setTrackSearchQuery] = useState("");
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);

  const handlePlaylistClick = async (playlist: SystemPlaylist) => {
    setSelectedPlaylist(playlist);
    setLoading(true);
    setTrackSearchQuery("");
    try {
      const loadedTracks = await playlist.loadTracks();
      setTracks(loadedTracks);
      setFilteredTracks(loadedTracks);
    } catch (error) {
      console.error("Failed to load playlist tracks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedPlaylist(null);
    setTracks([]);
  };

  useEffect(() => {
    if (trackSearchQuery.trim() === "") {
      setFilteredTracks(tracks);
    } else {
      const query = trackSearchQuery.toLowerCase();
      setFilteredTracks(
        tracks.filter(
          (track) =>
            track.title.toLowerCase().includes(query) ||
            track.artist?.toLowerCase().includes(query) ||
            track.album?.toLowerCase().includes(query)
        )
      );
    }
  }, [trackSearchQuery, tracks]);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredPlaylists(systemPlaylists);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredPlaylists(
        systemPlaylists.filter((playlist) =>
          playlist.name.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, systemPlaylists]);

  if (selectedPlaylist) {
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
          <h2 style={{ margin: 0, fontSize: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "24px" }}>{selectedPlaylist.icon}</span>
            {selectedPlaylist.name} ({tracks.length} tracks)
          </h2>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
            Loading tracks...
          </div>
        ) : tracks.length > 0 ? (
          <>
            <div style={{ flex: 1, overflow: "hidden", padding: "20px" }}>
              <VirtualTrackList
                tracks={filteredTracks}
                contextType="library"
                contextName={selectedPlaylist.name}
              />
            </div>
            <SearchBar
              placeholder="Search in this list..."
              value={trackSearchQuery}
              onChange={setTrackSearchQuery}
            />
          </>
        ) : (
          <div
            style={{
              padding: "20px",
              margin: "20px",
              backgroundColor: "#2a2a2a",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#888", margin: 0 }}>No tracks in this playlist.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "15px 20px",
          backgroundColor: "#1a1a1a",
          borderBottom: "1px solid #333",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px" }}>Playlists</h2>
      </div>

      {/* Playlists List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
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
              paddingLeft: "20px",
            }}
          >
            System
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {filteredPlaylists.map((playlist) => (
              <PlaylistItem
                key={playlist.id}
                playlist={playlist}
                onClick={() => handlePlaylistClick(playlist)}
              />
            ))}
          </div>
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
              paddingLeft: "20px",
            }}
          >
            My Playlists
          </h3>
          <div
            style={{
              padding: "20px",
              backgroundColor: "#2a2a2a",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#666", fontSize: "14px", margin: 0 }}>
              Coming soon...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
