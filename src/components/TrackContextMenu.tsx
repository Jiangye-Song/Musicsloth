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
  contextType: "library" | "artist" | "album" | "genre" | "queue" | "playlist";
  inQueueOrPlaylist?: boolean;
  onAddToPlaylist?: () => void;
}

export default function TrackContextMenu({
  anchorPosition,
  onClose,
  contextType,
  inQueueOrPlaylist = false,
  onAddToPlaylist,
}: TrackContextMenuProps) {
  const open = Boolean(anchorPosition);

  const handleMenuItemClick = (action: string) => {
    if (action === "add-to-playlist" && onAddToPlaylist) {
      onAddToPlaylist();
      // Don't call onClose here - let onAddToPlaylist handle closing the menu
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

      <MenuItem onClick={() => handleMenuItemClick("multiselect")}>
        <ListItemIcon>
          <CheckBoxOutlineBlankIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Start Multi-select</ListItemText>
      </MenuItem>

      <Divider />

      <MenuItem onClick={() => handleMenuItemClick("play-next")}>
        <ListItemIcon>
          <SkipNextIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Play After Current Song</ListItemText>
      </MenuItem>

      <MenuItem onClick={() => handleMenuItemClick("add-to-current-queue")}>
        <ListItemIcon>
          <AddToQueueIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Add to Current Playing Queue</ListItemText>
      </MenuItem>

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

      {inQueueOrPlaylist && (
        <>
          <Divider />
          <MenuItem onClick={() => handleMenuItemClick("remove")}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Remove from List</ListItemText>
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
