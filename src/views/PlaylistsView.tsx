import { useState, useEffect } from "react";
import { libraryApi, playlistApi, Track, Playlist } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";

import { IconButton } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlaylistPlayIcon from "@mui/icons-material/PlaylistPlay";
import { ReactNode } from "react";
import { LibraryMusic, Input as InputIcon, Replay as ReplayIcon, PlayDisabled } from "@mui/icons-material";

type SystemPlaylist = {
  id: string;
  name: string;
  icon: ReactNode;
  loadTracks: () => Promise<Track[]>;
};

interface PlaylistItemProps {
  playlist: SystemPlaylist;
  onClick: () => void;
}

interface PlaylistsViewProps {
  searchQuery?: string;
  onClearSearch?: () => void;
}

function PlaylistItem({ playlist, onClick }: PlaylistItemProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 20px",
        cursor: "pointer",
        backgroundColor: "transparent",
        transition: "background-color 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "#2a2a2a";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span style={{ color: "#888" }}>{playlist.icon}</span>
      <span style={{ color: "#fff", fontSize: "14px" }}>{playlist.name}</span>
    </div>
  );
}

export default function PlaylistsView({ searchQuery = "", onClearSearch }: PlaylistsViewProps) {
  const [systemPlaylists] = useState<SystemPlaylist[]>([
    {
      id: "all-songs",
      name: "All Songs",
      icon: <LibraryMusic sx={{ fontSize: 24 }} />,
      loadTracks: () => libraryApi.getAllTracks(),
    },
    {
      id: "recent-added",
      name: "Recently Added",
      icon: <InputIcon sx={{ fontSize: 24 }} />,
      loadTracks: () => playlistApi.getRecentTracks(),
    },
    {
      id: "most-played",
      name: "Most Played",
      icon: <ReplayIcon sx={{ fontSize: 24 }} />,
      loadTracks: () => playlistApi.getMostPlayedTracks(),
    },
    {
      id: "not-played",
      name: "Never Played",
      icon: <PlayDisabled sx={{ fontSize: 24 }} />,
      loadTracks: () => playlistApi.getUnplayedTracks(),
    },
  ]);
  const [filteredPlaylists, setFilteredPlaylists] = useState<SystemPlaylist[]>(systemPlaylists);
  const [userPlaylists, setUserPlaylists] = useState<Playlist[]>([]);
  const [filteredUserPlaylists, setFilteredUserPlaylists] = useState<Playlist[]>([]);

  const [selectedPlaylist, setSelectedPlaylist] = useState<SystemPlaylist | null>(null);
  const [selectedUserPlaylist, setSelectedUserPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  // Load user playlists on mount
  useEffect(() => {
    loadUserPlaylists();
  }, []);

  const loadUserPlaylists = async () => {
    try {
      const playlists = await playlistApi.getAllPlaylists();
      setUserPlaylists(playlists);
      setFilteredUserPlaylists(playlists);
    } catch (error) {
      console.error("Failed to load user playlists:", error);
    }
  };

  const handlePlaylistClick = async (playlist: SystemPlaylist) => {
    setSelectedPlaylist(playlist);
    setSelectedUserPlaylist(null);
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

  const handleUserPlaylistClick = async (playlist: Playlist) => {
    setSelectedUserPlaylist(playlist);
    setSelectedPlaylist(null);
    setLoading(true);
    try {
      const loadedTracks = await playlistApi.getPlaylistTracks(playlist.id);
      setTracks(loadedTracks);
    } catch (error) {
      console.error("Failed to load playlist tracks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedPlaylist(null);
    setSelectedUserPlaylist(null);
    setTracks([]);
    // Refresh user playlists in case new ones were added
    loadUserPlaylists();
  };


  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredPlaylists(systemPlaylists);
      setFilteredUserPlaylists(userPlaylists);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredPlaylists(
        systemPlaylists.filter((playlist) =>
          playlist.name.toLowerCase().includes(query)
        )
      );
      setFilteredUserPlaylists(
        userPlaylists.filter((playlist) =>
          playlist.name.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, systemPlaylists, userPlaylists]);

  if (selectedPlaylist || selectedUserPlaylist) {
    const displayName = selectedPlaylist?.name || selectedUserPlaylist?.name || "";
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
            {displayName} ({tracks.length} tracks)
          </h2>
        </div>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
            Loading tracks...
          </div>
        ) : tracks.length > 0 ? (
          <div style={{ flex: 1, overflow: "hidden", padding: "20px" }}>
            <VirtualTrackList
              tracks={tracks}
              contextType="playlist"
              contextName={displayName}
              showSearch={true}
            />
          </div>
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

        {/* User Playlists */}
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
          {filteredUserPlaylists.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {filteredUserPlaylists.map((playlist) => (
                <div
                  key={playlist.id}
                  onClick={() => handleUserPlaylistClick(playlist)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 20px",
                    cursor: "pointer",
                    backgroundColor: "transparent",
                    transition: "background-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#2a2a2a";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <PlaylistPlayIcon sx={{ fontSize: 24, color: "#888" }} />
                  <span style={{ color: "#fff", fontSize: "14px" }}>{playlist.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "20px",
                backgroundColor: "#2a2a2a",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <p style={{ color: "#666", fontSize: "14px", margin: 0 }}>
                No playlists yet. Right-click on a track to add it to a new playlist.
              </p>
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
    </div>
  );
}
