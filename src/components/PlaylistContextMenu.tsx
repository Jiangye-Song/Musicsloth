import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import EditIcon from "@mui/icons-material/Edit";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import DeleteIcon from "@mui/icons-material/Delete";

interface PlaylistContextMenuProps {
  anchorPosition: { top: number; left: number } | null;
  onClose: () => void;
  playlistId: number;
  playlistName: string;
  onPlay?: () => void;
  onRename?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
}

export default function PlaylistContextMenu({
  anchorPosition,
  onClose,
  playlistId: _playlistId,
  playlistName: _playlistName,
  onPlay,
  onRename,
  onExport,
  onDelete,
}: PlaylistContextMenuProps) {
  const open = Boolean(anchorPosition);

  const handleMenuItemClick = (action: string) => {
    switch (action) {
      case "play":
        onPlay?.();
        onClose();
        break;
      case "rename":
        onRename?.();
        // Don't close here - let parent handle it
        break;
      case "export":
        onExport?.();
        onClose();
        break;
      case "delete":
        onDelete?.();
        onClose();
        break;
      default:
        onClose();
    }
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
            minWidth: 200,
            bgcolor: "background.paper",
            boxShadow: 3,
          },
        },
      }}
    >
      <MenuItem onClick={() => handleMenuItemClick("play")}>
        <ListItemIcon>
          <PlayArrowIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Play</ListItemText>
      </MenuItem>

      <Divider />

      <MenuItem onClick={() => handleMenuItemClick("rename")}>
        <ListItemIcon>
          <EditIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Rename</ListItemText>
      </MenuItem>

      <MenuItem onClick={() => handleMenuItemClick("export")}>
        <ListItemIcon>
          <FileDownloadIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>Export Playlist</ListItemText>
      </MenuItem>

      <Divider />

      <MenuItem onClick={() => handleMenuItemClick("delete")}>
        <ListItemIcon>
          <DeleteIcon fontSize="small" color="error" />
        </ListItemIcon>
        <ListItemText sx={{ color: "error.main" }}>Delete Playlist</ListItemText>
      </MenuItem>
    </Menu>
  );
}
