import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from "@mui/material";
import { playlistApi } from "../services/api";

interface CreatePlaylistDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, description?: string) => Promise<void>;
}

export default function CreatePlaylistDialog({
  open,
  onClose,
  onCreate,
}: CreatePlaylistDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Load existing playlist names to check for duplicates
      playlistApi.getAllPlaylists().then((playlists) => {
        setExistingNames(new Set(playlists.map((p) => p.name.toLowerCase())));
      });
      // Reset form
      setName("");
      setDescription("");
    }
  }, [open]);

  const isNameTaken = existingNames.has(name.trim().toLowerCase());
  const isNameEmpty = name.trim() === "";
  const canCreate = !isNameEmpty && !isNameTaken && !loading;

  const handleCreate = async () => {
    if (!canCreate) return;

    setLoading(true);
    try {
      await onCreate(name.trim(), description.trim() || undefined);
      onClose();
    } catch (err: any) {
      console.error("Failed to create playlist:", err);
      // Error will be displayed in console - could add a Snackbar here for better UX
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Playlist</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <TextField
          autoFocus
          margin="dense"
          label="Playlist Name"
          type="text"
          fullWidth
          variant="outlined"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!isNameEmpty && isNameTaken}
          helperText={
            !isNameEmpty && isNameTaken
              ? "A playlist with this name already exists"
              : ""
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreate) {
              e.preventDefault();
              handleCreate();
            }
          }}
        />
        <TextField
          margin="dense"
          label="Description (Optional)"
          type="text"
          fullWidth
          variant="outlined"
          multiline
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          variant="contained"
          disabled={!canCreate}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}
