import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Typography,
  Box,
} from "@mui/material";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import { queueApi, Queue } from "../services/api";

interface AddToQueueDialogProps {
  open: boolean;
  onClose: () => void;
  trackId: number;
  trackTitle: string;
}

export default function AddToQueueDialog({
  open,
  onClose,
  trackId,
  trackTitle,
}: AddToQueueDialogProps) {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadQueues();
    }
  }, [open]);

  const loadQueues = async () => {
    setLoading(true);
    setError(null);
    try {
      const allQueues = await queueApi.getAllQueues();
      setQueues(allQueues);
    } catch (err) {
      console.error("Failed to load queues:", err);
      setError("Failed to load queues");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToQueue = async (queueId: number) => {
    try {
      await queueApi.appendTracksToQueue(queueId, [trackId]);
      onClose();
    } catch (err: any) {
      console.error("Failed to add track to queue:", err);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Add to Queue
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {trackTitle}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error" align="center" sx={{ py: 2 }}>
            {error}
          </Typography>
        ) : queues.length === 0 ? (
          <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
            No queues yet. Click any track to create a queue.
          </Typography>
        ) : (
          <List sx={{ pt: 0 }}>
            {queues.map((queue) => (
              <ListItem key={queue.id} disablePadding>
                <ListItemButton onClick={() => handleAddToQueue(queue.id)}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {queue.name}
                        {queue.shuffle_seed !== 1 && (
                          <ShuffleIcon sx={{ fontSize: 16, color: "primary.main" }} />
                        )}
                      </Box>
                    }
                    secondary={queue.is_active ? "Currently playing" : undefined}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
}
