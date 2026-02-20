import { useState, useEffect, useCallback } from "react";
import { libraryApi, playlistApi, Track, Playlist } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";
import PlaylistContextMenu from "../components/PlaylistContextMenu";
import TextInputDialog from "../components/TextInputDialog";

import { IconButton, Button, useTheme } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PlaylistPlayIcon from "@mui/icons-material/PlaylistPlay";
import AddIcon from "@mui/icons-material/Add";
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
  onNavigateToArtist?: (artistName: string, trackId: number) => void;
  onNavigateToAlbum?: (albumName: string, trackId: number) => void;
  onNavigateToGenre?: (genreName: string, trackId: number) => void;
}

function PlaylistItem({ playlist, onClick }: PlaylistItemProps) {
  const theme = useTheme();
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
        e.currentTarget.style.backgroundColor = theme.palette.background.paper;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <span style={{ color: "#888" }}>{playlist.icon}</span>
      <span style={{ color: theme.palette.text.primary, fontSize: "14px" }}>{playlist.name}</span>
    </div>
  );
}

export default function PlaylistsView({ searchQuery = "", onClearSearch, onNavigateToArtist, onNavigateToAlbum, onNavigateToGenre }: PlaylistsViewProps) {
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
  const [isReorderMode, setIsReorderMode] = useState(false);
  const theme = useTheme();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ top: number; left: number } | null>(null);
  const [contextMenuPlaylist, setContextMenuPlaylist] = useState<Playlist | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "rename">("create");
  const [dialogPlaylist, setDialogPlaylist] = useState<Playlist | null>(null);

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
    setIsReorderMode(false);
    // Refresh user playlists in case new ones were added
    loadUserPlaylists();
  };

  const handlePlaylistContextMenu = (e: React.MouseEvent, playlist: Playlist) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPlaylist(playlist);
    setContextMenu({ top: e.clientY, left: e.clientX });
  };

  const handleOpenRenameDialog = () => {
    if (!contextMenuPlaylist) return;
    setDialogPlaylist(contextMenuPlaylist);
    setDialogMode("rename");
    setDialogOpen(true);
    // Close context menu
    setContextMenu(null);
    setContextMenuPlaylist(null);
  };

  const handleDeletePlaylist = async () => {
    if (!contextMenuPlaylist) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete the playlist "${contextMenuPlaylist.name}"? This action cannot be undone.`
    );
    if (!confirmed) {
      setContextMenu(null);
      setContextMenuPlaylist(null);
      return;
    }
    try {
      await playlistApi.deletePlaylist(contextMenuPlaylist.id);
      // Refresh the playlists list
      await loadUserPlaylists();
    } catch (error) {
      console.error("Failed to delete playlist:", error);
      alert(`Failed to delete playlist: ${error}`);
    }
    setContextMenu(null);
    setContextMenuPlaylist(null);
  };

  const handleOpenCreateDialog = () => {
    setDialogPlaylist(null);
    setDialogMode("create");
    setDialogOpen(true);
  };

  const handleDialogSubmit = async (name: string) => {
    if (dialogMode === "create") {
      // Create new playlist
      await playlistApi.createPlaylist(name);
    } else if (dialogMode === "rename" && dialogPlaylist) {
      // Rename existing playlist
      await playlistApi.renamePlaylist(dialogPlaylist.id, name);

      // If this playlist was selected, update the selected playlist name
      if (selectedUserPlaylist?.id === dialogPlaylist.id) {
        setSelectedUserPlaylist({ ...selectedUserPlaylist, name });
      }
    }

    // Refresh the playlists list
    await loadUserPlaylists();
  };

  const validatePlaylistName = useCallback(async (name: string): Promise<boolean> => {
    const allPlaylists = await playlistApi.getAllPlaylists();
    const lowerName = name.toLowerCase();
    return !allPlaylists.some(
      (p) => p.name.toLowerCase() === lowerName && p.id !== dialogPlaylist?.id
    );
  }, [dialogPlaylist?.id]);


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
            backgroundColor: theme.palette.background.default,
            borderBottom: `1px solid ${theme.palette.divider}`,
            display: "flex",
            alignItems: "center",
            gap: "15px",
          }}
        >
          <IconButton
            onClick={handleBack}
          ><ArrowBackIcon /></IconButton>
          <h2 style={{ margin: 0, fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
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
              playlistId={selectedPlaylist?.id || selectedUserPlaylist?.id}
              isSystemPlaylist={selectedPlaylist !== null}
              showSearch={true}
              isReorderMode={isReorderMode}
              onReorderModeChange={setIsReorderMode}
              onNavigateToArtist={onNavigateToArtist}
              onNavigateToAlbum={onNavigateToAlbum}
              onNavigateToGenre={onNavigateToGenre}
              onPlaylistTracksChanged={async (playlistId) => {
                // Refresh tracks when a track is removed from the playlist
                try {
                  if (selectedUserPlaylist) {
                    const loadedTracks = await playlistApi.getPlaylistTracks(playlistId);
                    setTracks(loadedTracks);
                  } else if (selectedPlaylist) {
                    const loadedTracks = await selectedPlaylist.loadTracks();
                    setTracks(loadedTracks);
                  }
                } catch (error) {
                  console.error("Failed to refresh playlist tracks:", error);
                }
              }}
            />
          </div>
        ) : (
          <div
            style={{
              padding: "20px",
              margin: "20px",
              backgroundColor: theme.palette.background.paper,
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
          backgroundColor: theme.palette.background.default,
          borderBottom: `1px solid ${theme.palette.divider}`,
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
              paddingLeft: "20px",
              paddingRight: "20px",
            }}
          >
            <h3
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#888",
                textTransform: "uppercase",
                letterSpacing: "1px",
                margin: 0,
              }}
            >
              My Playlists
            </h3>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={handleOpenCreateDialog}
            >
              New Playlist
            </Button>
          </div>
          {filteredUserPlaylists.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {filteredUserPlaylists.map((playlist) => (
                <div
                  key={playlist.id}
                  onClick={() => handleUserPlaylistClick(playlist)}
                  onContextMenu={(e) => handlePlaylistContextMenu(e, playlist)}
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
                    e.currentTarget.style.backgroundColor = theme.palette.background.paper;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <PlaylistPlayIcon sx={{ fontSize: 24, color: "#888" }} />
                  <span style={{ color: theme.palette.text.primary, fontSize: "14px" }}>{playlist.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: "20px",
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

      {/* Playlist Context Menu */}
      {contextMenuPlaylist && (
        <PlaylistContextMenu
          anchorPosition={contextMenu}
          onClose={() => {
            setContextMenu(null);
            setContextMenuPlaylist(null);
          }}
          playlistId={contextMenuPlaylist.id}
          playlistName={contextMenuPlaylist.name}
          onRename={handleOpenRenameDialog}
          onDelete={handleDeletePlaylist}
        />
      )}

      {/* Shared Playlist Name Dialog (Create/Rename) */}
      <TextInputDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setDialogPlaylist(null);
        }}
        onSubmit={handleDialogSubmit}
        title={dialogMode === "create" ? "New Playlist" : "Rename Playlist"}
        label="Playlist Name"
        submitLabel={dialogMode === "create" ? "Create" : "Rename"}
        initialValue={dialogPlaylist?.name || ""}
        validateUnique={validatePlaylistName}
        duplicateErrorMessage="A playlist with this name already exists"
      />
    </div>
  );
}
