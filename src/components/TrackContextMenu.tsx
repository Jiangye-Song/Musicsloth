import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import CheckBoxOutlineBlankIcon from "@mui/icons-material/CheckBoxOutlineBlank";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import AddToQueueIcon from "@mui/icons-material/AddToQueue";
import QueueMusicIcon from "@mui/icons-material/QueueMusic";
import PlaylistAddIcon from "@mui/icons-material/PlaylistAdd";
import DeleteIcon from "@mui/icons-material/Delete";

interface TrackContextMenuProps {
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  // Queue context - pass queueId if viewing a queue, isActiveQueue if it's the currently playing queue
  inQueue?: {
    queueId: number;
    isActiveQueue: boolean;
  } | null;
  // Playlist context - pass playlistId if viewing a playlist, isSystemPlaylist for system playlists like "All Songs"
  inPlaylist?: {
    playlistId: string | number;
    isSystemPlaylist: boolean;
  } | null;
  // Whether there's an active queue to add to (false if no queues exist)
  hasActiveQueue?: boolean;
  // Whether multi-select mode is currently active
  isMultiSelectMode?: boolean;
  onStartMultiSelect?: () => void;
  onPlayNext?: () => void;
  onAddToCurrentQueue?: () => void;
  onAddToQueue?: () => void;
  onAddToPlaylist?: () => void;
  onRemoveFromQueue?: () => void;
  onRemoveFromPlaylist?: () => void;
}

export default function TrackContextMenu({
  anchorPosition,
  onClose,
  inQueue = null,
  inPlaylist = null,
  hasActiveQueue = false,
  isMultiSelectMode = false,
  onStartMultiSelect,
  onPlayNext,
  onAddToCurrentQueue,
  onAddToQueue,
  onAddToPlaylist,
  onRemoveFromQueue,
  onRemoveFromPlaylist,
}: TrackContextMenuProps) {
  const open = Boolean(anchorPosition);

  // Determine what to show
  const showAddToCurrentQueue = hasActiveQueue && !(inQueue?.isActiveQueue);
  const showRemoveFromQueue = inQueue !== null;
  const showRemoveFromPlaylist = inPlaylist !== null && !inPlaylist.isSystemPlaylist;

  const handleMenuItemClick = (action: string) => {
    if (action === "multiselect" && onStartMultiSelect) {
      onStartMultiSelect();
      onClose();
      return;
    }

    if (action === "play-next" && onPlayNext) {
      onPlayNext();
      onClose();
      return;
    }

    if (action === "add-to-current-queue" && onAddToCurrentQueue) {
      onAddToCurrentQueue();
      onClose();
      return;
    }

    if (action === "add-to-queue" && onAddToQueue) {
      onAddToQueue();
      // Don't call onClose here - dialog will open
      return;
    }

    if (action === "add-to-playlist" && onAddToPlaylist) {
      onAddToPlaylist();
      // Don't call onClose here - dialog will open
      return;
    }
    
    if (action === "remove-from-queue" && onRemoveFromQueue) {
      onRemoveFromQueue();
      onClose();
      return;
    }
    
    if (action === "remove-from-playlist" && onRemoveFromPlaylist) {
      onRemoveFromPlaylist();
      onClose();
      return;
    }

    console.log(`Context menu action: ${action}`);
    // TODO: Implement other actions
    onClose();
  };

  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        anchorPosition
          ? { top: anchorPosition.top, left: anchorPosition.left }
          : undefined
      }
      slotProps={{
        paper: {
          sx: {
            minWidth: 220,
            bgcolor: "background.paper",
            boxShadow: 3,
          },
        },
      }}
    >
      <MenuItem onClick={() => handleMenuItemClick("info")}>
        <ListItemIcon>
          <InfoIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Song Info</ListItemText>
      </MenuItem>

      {!isMultiSelectMode && (
        <MenuItem onClick={() => handleMenuItemClick("multiselect")}>
          <ListItemIcon>
            <CheckBoxOutlineBlankIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Select</ListItemText>
        </MenuItem>
      )}

      <Divider />

      <MenuItem onClick={() => handleMenuItemClick("play-next")}>
        <ListItemIcon>
          <SkipNextIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Play After Current Song</ListItemText>
      </MenuItem>

      {showAddToCurrentQueue && (
        <MenuItem onClick={() => handleMenuItemClick("add-to-current-queue")}>
          <ListItemIcon>
            <AddToQueueIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Add to Current Playing Queue</ListItemText>
        </MenuItem>
      )}

      <MenuItem onClick={() => handleMenuItemClick("add-to-queue")}>
        <ListItemIcon>
          <QueueMusicIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Add to a Queue...</ListItemText>
      </MenuItem>

      <MenuItem onClick={() => handleMenuItemClick("add-to-playlist")}>
        <ListItemIcon>
          <PlaylistAddIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Add to Playlist...</ListItemText>
      </MenuItem>

      {(showRemoveFromQueue || showRemoveFromPlaylist) && (
        <>
          <Divider />
          {showRemoveFromQueue && (
            <MenuItem onClick={() => handleMenuItemClick("remove-from-queue")}>
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Remove from this Queue</ListItemText>
            </MenuItem>
          )}
          {showRemoveFromPlaylist && (
            <MenuItem onClick={() => handleMenuItemClick("remove-from-playlist")}>
              <ListItemIcon>
                <DeleteIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Remove from this Playlist</ListItemText>
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  );
}
