import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Button,
  CircularProgress,
  Typography,
  Box,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { playlistApi, Playlist } from "../services/api";
import TextInputDialog from "./TextInputDialog";

interface AddToPlaylistDialogProps {
  open: boolean;
  onClose: () => void;
  trackId: number;
  trackTitle: string;
}

export default function AddToPlaylistDialog({
  open,
  onClose,
  trackId,
  trackTitle,
}: AddToPlaylistDialogProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadPlaylists();
    }
  }, [open]);

  const loadPlaylists = async () => {
    setLoading(true);
    setError(null);
    try {
      const allPlaylists = await playlistApi.getAllPlaylists();
      setPlaylists(allPlaylists);
    } catch (err) {
      console.error("Failed to load playlists:", err);
      setError("Failed to load playlists");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToPlaylist = async (playlistId: number) => {
    try {
      await playlistApi.addTrackToPlaylist(playlistId, trackId);
      onClose();
    } catch (err: any) {
      console.error("Failed to add track to playlist:", err);
      // Error will be logged to console - could add a Snackbar here for better UX
      // Still close the dialog on error for now
      onClose();
    }
  };

  const handleCreatePlaylist = async (name: string) => {
    const newPlaylistId = await playlistApi.createPlaylist(name);
    setCreateDialogOpen(false);
    await loadPlaylists();
    // Automatically add the track to the newly created playlist
    await handleAddToPlaylist(newPlaylistId);
  };

  const validatePlaylistName = useCallback(async (name: string): Promise<boolean> => {
    const allPlaylists = await playlistApi.getAllPlaylists();
    return !allPlaylists.some((p) => p.name.toLowerCase() === name.toLowerCase());
  }, []);

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Add to Playlist
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {trackTitle}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Button
            fullWidth
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{ mb: 2 }}
          >
            Create New Playlist
          </Button>

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Typography color="error" align="center" sx={{ py: 2 }}>
              {error}
            </Typography>
          ) : playlists.length === 0 ? (
            <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
              No playlists yet. Create one to get started.
            </Typography>
          ) : (
            <List sx={{ pt: 0 }}>
              {playlists.map((playlist) => (
                <ListItem key={playlist.id} disablePadding>
                  <ListItemButton onClick={() => handleAddToPlaylist(playlist.id)}>
                    <ListItemText
                      primary={playlist.name}
                      secondary={playlist.description}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>

      <TextInputDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSubmit={handleCreatePlaylist}
        title="New Playlist"
        label="Playlist Name"
        submitLabel="Create"
        validateUnique={validatePlaylistName}
        duplicateErrorMessage="A playlist with this name already exists"
      />
    </>
  );
}
