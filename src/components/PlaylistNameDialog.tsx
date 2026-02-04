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

interface PlaylistNameDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, description?: string) => Promise<void>;
  mode: "create" | "rename";
  initialName?: string;
  initialDescription?: string;
  playlistId?: number; // For rename mode, to exclude current playlist from duplicate check
}

export default function PlaylistNameDialog({
  open,
  onClose,
  onSubmit,
  mode,
  initialName = "",
  initialDescription = "",
  playlistId,
}: PlaylistNameDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [existingNames, setExistingNames] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // Load existing playlist names to check for duplicates
      playlistApi.getAllPlaylists().then((playlists) => {
        const namesMap = new Map<string, number>();
        playlists.forEach((p) => {
          namesMap.set(p.name.toLowerCase(), p.id);
        });
        setExistingNames(namesMap);
      });
      // Reset form to initial values
      setName(initialName);
      setDescription(initialDescription);
      setError(null);
    }
  }, [open, initialName, initialDescription]);

  const trimmedName = name.trim();
  const isNameEmpty = trimmedName === "";
  
  // Check if name is taken by another playlist (exclude current playlist in rename mode)
  const existingPlaylistId = existingNames.get(trimmedName.toLowerCase());
  const isNameTaken = existingPlaylistId !== undefined && existingPlaylistId !== playlistId;
  
  // In rename mode, check if name is unchanged
  const isUnchanged = mode === "rename" && trimmedName === initialName;
  
  const canSubmit = !isNameEmpty && !isNameTaken && !loading && !isUnchanged;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    
    try {
      await onSubmit(trimmedName, description.trim() || undefined);
      onClose();
    } catch (err: any) {
      console.error(`Failed to ${mode} playlist:`, err);
      setError(err?.message || err?.toString() || `Failed to ${mode} playlist`);
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "create" ? "Create New Playlist" : "Rename Playlist";
  const submitLabel = mode === "create" ? "Create" : "Rename";
  const loadingLabel = mode === "create" ? "Creating..." : "Renaming...";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <TextField
          autoFocus
          margin="dense"
          label="Playlist Name"
          type="text"
          fullWidth
          variant="outlined"
          autoComplete="off"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          error={(!isNameEmpty && isNameTaken) || !!error}
          helperText={
            error ? error :
            (!isNameEmpty && isNameTaken)
              ? "A playlist with this name already exists"
              : ""
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        {mode === "create" && (
          <TextField
            margin="dense"
            label="Description (Optional)"
            type="text"
            fullWidth
            variant="outlined"
            autoComplete="off"
            multiline
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            sx={{ mt: 2 }}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit}
        >
          {loading ? loadingLabel : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
