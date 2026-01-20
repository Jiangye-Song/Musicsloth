import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  Box,
  Menu,
  MenuItem,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import { Track, libraryApi } from "../services/api";
import { invoke } from "@tauri-apps/api/core";

interface SongInfoDialogProps {
  open: boolean;
  onClose: () => void;
  track: Track | null;
  onNavigateToArtist?: (artistName: string, trackId: number) => void;
  onNavigateToAlbum?: (albumName: string, trackId: number) => void;
  onNavigateToGenre?: (genreName: string, trackId: number) => void;
}

export default function SongInfoDialog({
  open,
  onClose,
  track,
  onNavigateToArtist,
  onNavigateToAlbum,
  onNavigateToGenre,
}: SongInfoDialogProps) {
  const [albumArt, setAlbumArt] = useState<string | null>(null);
  const [albumArtBytes, setAlbumArtBytes] = useState<number[] | null>(null);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    text: string;
  } | null>(null);
  
  const [imageContextMenu, setImageContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  // Helper function to split multi-value fields (artists, genres)
  const splitMultiValue = (value: string | null): string[] => {
    if (!value) return [];
    // Split on: comma, semicolon, slash, pipe, ideographic comma, ampersand, ft./feat./featuring
    return value
      .split(/[,;/|、&]|\s+(?:ft\.?|feat\.?|featuring)\s+/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const handleContextMenu = (
    text: string | null | undefined,
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (text && text !== "—") {
      setContextMenu({
        mouseX: e.clientX,
        mouseY: e.clientY,
        text,
      });
    }
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleCopyText = () => {
    if (contextMenu?.text) {
      navigator.clipboard.writeText(contextMenu.text);
    }
    handleCloseContextMenu();
  };

  const handleImageContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (albumArt) {
      setImageContextMenu({
        mouseX: e.clientX,
        mouseY: e.clientY,
      });
    }
  };

  const handleCloseImageContextMenu = () => {
    setImageContextMenu(null);
  };

  const handleCopyImage = async () => {
    if (albumArtBytes) {
      try {
        const blob = new Blob([new Uint8Array(albumArtBytes)], { type: "image/png" });
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
      } catch (error) {
        console.error("Failed to copy image:", error);
      }
    }
    handleCloseImageContextMenu();
  };

  const handleSaveImage = async () => {
    if (track) {
      try {
        await invoke("save_album_art", {
          filePath: track.file_path,
          defaultName: track.title || "album_art",
        });
      } catch (error) {
        console.error("Failed to save image:", error);
      }
    }
    handleCloseImageContextMenu();
  };

  // Load album art when track changes
  useEffect(() => {
    if (!track || !open) {
      setAlbumArt(null);
      setAlbumArtBytes(null);
      return;
    }

    const loadAlbumArt = async () => {
      try {
        const artBytes = await libraryApi.getAlbumArt(track.file_path);
        if (artBytes && artBytes.length > 0) {
          setAlbumArtBytes(artBytes);
          const blob = new Blob([new Uint8Array(artBytes)], {
            type: "image/jpeg",
          });
          const url = URL.createObjectURL(blob);
          setAlbumArt(url);
        } else {
          setAlbumArt(null);
          setAlbumArtBytes(null);
        }
      } catch (error) {
        console.error("Failed to load album art:", error);
        setAlbumArt(null);
        setAlbumArtBytes(null);
      }
    };

    loadAlbumArt();

    return () => {
      if (albumArt) {
        URL.revokeObjectURL(albumArt);
      }
    };
  }, [track?.file_path, open]);

  if (!track) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "background.paper",
          backgroundImage: "none",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
        }}
      >
        <Typography variant="h6">Song Info</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {/* Album Art and Title Section */}
        <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
          <Box
            onContextMenu={handleImageContextMenu}
            sx={{
              width: 120,
              height: 120,
              borderRadius: 1,
              bgcolor: "background.default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
              border: 1,
              borderColor: "divider",
              cursor: albumArt ? "context-menu" : "default",
            }}
          >
            {albumArt ? (
              <img
                src={albumArt}
                alt="Album Art"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <MusicNoteIcon sx={{ fontSize: 48, opacity: 0.3 }} />
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Typography
              variant="h6"
              fontWeight="bold"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {track.title}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ mt: 0.5 }}
            >
              {track.artist || "Unknown Artist"}
            </Typography>
            <Typography variant="body2" color="text.disabled">
              {track.album || "Unknown Album"}
            </Typography>
          </Box>
        </Box>

        {/* Track Details Grid */}
        <Typography
          variant="subtitle2"
          sx={{ mb: 1.5, pb: 1, borderBottom: 1, borderColor: "divider", color: "text.secondary" }}
        >
          Track Information
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            gap: 1,
            "& > :nth-of-type(odd)": {
              color: "text.secondary",
            },
          }}
        >
          <Typography variant="body2">Title:</Typography>
          <Typography
            variant="body2"
            onContextMenu={(e) => handleContextMenu(track.title, e)}
            sx={{ userSelect: "text" }}
          >
            {track.title}
          </Typography>

          <Typography variant="body2">Artist:</Typography>
          <Box
            sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
            onContextMenu={(e) => handleContextMenu(track.artist, e)}
          >
            {splitMultiValue(track.artist).length > 0 ? (
              splitMultiValue(track.artist).map((artist, index, arr) => (
                <Typography
                  key={index}
                  variant="body2"
                  onClick={() => {
                    onNavigateToArtist?.(artist, track.id);
                    onClose();
                  }}
                  sx={{
                    cursor: onNavigateToArtist ? "pointer" : "default",
                    "&:hover": onNavigateToArtist
                      ? { textDecoration: "underline" }
                      : {},
                    userSelect: "text",
                  }}
                >
                  {artist}
                  {index < arr.length - 1 ? ", " : ""}
                </Typography>
              ))
            ) : (
              <Typography variant="body2" sx={{ userSelect: "text" }}>
                —
              </Typography>
            )}
          </Box>

          <Typography variant="body2">Album Artist:</Typography>
          <Box
            sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
            onContextMenu={(e) => handleContextMenu(track.album_artist, e)}
          >
            {splitMultiValue(track.album_artist).length > 0 ? (
              splitMultiValue(track.album_artist).map((artist, index, arr) => (
                <Typography
                  key={index}
                  variant="body2"
                  onClick={() => {
                    onNavigateToArtist?.(artist, track.id);
                    onClose();
                  }}
                  sx={{
                    cursor: onNavigateToArtist ? "pointer" : "default",
                    "&:hover": onNavigateToArtist
                      ? { textDecoration: "underline" }
                      : {},
                    userSelect: "text",
                  }}
                >
                  {artist}
                  {index < arr.length - 1 ? ", " : ""}
                </Typography>
              ))
            ) : (
              <Typography variant="body2" sx={{ userSelect: "text" }}>
                —
              </Typography>
            )}
          </Box>

          <Typography variant="body2">Album:</Typography>
          <Typography
            variant="body2"
            onClick={() => {
              if (track.album && onNavigateToAlbum) {
                onNavigateToAlbum(track.album, track.id);
                onClose();
              }
            }}
            onContextMenu={(e) => handleContextMenu(track.album, e)}
            sx={{
              cursor:
                track.album && track.album !== "—" && onNavigateToAlbum
                  ? "pointer"
                  : "default",
              "&:hover":
                track.album && track.album !== "—" && onNavigateToAlbum
                  ? { textDecoration: "underline" }
                  : {},
              userSelect: "text",
            }}
          >
            {track.album || "—"}
          </Typography>

          <Typography variant="body2">Year:</Typography>
          <Typography
            variant="body2"
            onContextMenu={(e) => handleContextMenu(track.year?.toString(), e)}
            sx={{ userSelect: "text" }}
          >
            {track.year || "—"}
          </Typography>

          <Typography variant="body2">Genre:</Typography>
          <Box
            sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}
            onContextMenu={(e) => handleContextMenu(track.genre, e)}
          >
            {splitMultiValue(track.genre).length > 0 ? (
              splitMultiValue(track.genre).map((genre, index, arr) => (
                <Typography
                  key={index}
                  variant="body2"
                  onClick={() => {
                    onNavigateToGenre?.(genre, track.id);
                    onClose();
                  }}
                  sx={{
                    cursor: onNavigateToGenre ? "pointer" : "default",
                    "&:hover": onNavigateToGenre
                      ? { textDecoration: "underline" }
                      : {},
                    userSelect: "text",
                  }}
                >
                  {genre}
                  {index < arr.length - 1 ? ", " : ""}
                </Typography>
              ))
            ) : (
              <Typography variant="body2" sx={{ userSelect: "text" }}>
                —
              </Typography>
            )}
          </Box>

          <Typography variant="body2">Track:</Typography>
          <Typography variant="body2">
            {track.track_number
              ? `${track.track_number}${
                  track.disc_number ? ` (Disc ${track.disc_number})` : ""
                }`
              : "—"}
          </Typography>

          <Typography variant="body2">Duration:</Typography>
          <Typography variant="body2">
            {formatDuration(track.duration_ms)}
          </Typography>

          <Typography variant="body2">Format:</Typography>
          <Typography variant="body2">
            {track.file_format?.toUpperCase() || "—"}
          </Typography>

          <Typography variant="body2">Bitrate:</Typography>
          <Typography variant="body2">
            {track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : "—"}
          </Typography>

          <Typography variant="body2">Sample Rate:</Typography>
          <Typography variant="body2">
            {track.sample_rate ? `${track.sample_rate} Hz` : "—"}
          </Typography>

          <Typography variant="body2">File Size:</Typography>
          <Typography variant="body2">
            {track.file_size
              ? `${(track.file_size / (1024 * 1024)).toFixed(2)} MB`
              : "—"}
          </Typography>

          <Typography variant="body2">Play Count:</Typography>
          <Typography variant="body2">{track.play_count || 0}</Typography>

          <Typography variant="body2">File Path:</Typography>
          <Typography
            variant="body2"
            onContextMenu={(e) => handleContextMenu(track.file_path, e)}
            sx={{
              userSelect: "text",
              wordBreak: "break-all",
              fontSize: "0.75rem",
              color: "text.disabled",
            }}
          >
            {track.file_path}
          </Typography>
        </Box>
      </DialogContent>

      {/* Text Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleCopyText}>Copy</MenuItem>
      </Menu>

      {/* Image Context Menu */}
      <Menu
        open={imageContextMenu !== null}
        onClose={handleCloseImageContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          imageContextMenu !== null
            ? { top: imageContextMenu.mouseY, left: imageContextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={handleCopyImage}>Copy Image</MenuItem>
        <MenuItem onClick={handleSaveImage}>Save Image...</MenuItem>
      </Menu>
    </Dialog>
  );
}
