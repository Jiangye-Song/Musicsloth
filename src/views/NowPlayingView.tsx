import { useState, useEffect } from "react";
import {
  Box,
  IconButton,
  Typography,
  Tabs,
  Tab,
  Paper,
} from "@mui/material";
import { Close, MusicNote } from "@mui/icons-material";
import { playerApi, libraryApi, Track } from "../services/api";

interface NowPlayingViewProps {
  isNarrow: boolean;
  onClose: () => void;
}

export default function NowPlayingView({ isNarrow, onClose }: NowPlayingViewProps) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [albumArt, setAlbumArt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"albumart" | "lyrics" | "details">("albumart");

  useEffect(() => {
    // Update player state and track metadata periodically
    const interval = setInterval(async () => {
      try {
        const state = await playerApi.getState();

        // Fetch track metadata if a file is playing
        if (state.current_file) {
          const track = await libraryApi.getCurrentTrack();
          setCurrentTrack(track);

          // Fetch album art
          if (track) {
            try {
              const artData = await libraryApi.getAlbumArt(track.file_path);
              if (artData && artData.length > 0) {
                const blob = new Blob([new Uint8Array(artData)], { type: "image/jpeg" });
                const url = URL.createObjectURL(blob);
                setAlbumArt((prevUrl) => {
                  if (prevUrl) URL.revokeObjectURL(prevUrl);
                  return url;
                });
              } else {
                setAlbumArt(null);
              }
            } catch (err) {
              console.error("Failed to load album art:", err);
              setAlbumArt(null);
            }
          }
        } else {
          setCurrentTrack(null);
          setAlbumArt(null);
        }
      } catch (error) {
        console.error("Failed to get player state:", error);
      }
    }, 500);

    return () => {
      clearInterval(interval);
      if (albumArt) URL.revokeObjectURL(albumArt);
    };
  }, []);



  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const renderAlbumArt = () => (
    <Box
      sx={{
        width: isNarrow ? "100%" : 400,
        height: isNarrow ? 350 : 400,
        maxWidth: isNarrow ? 400 : 400,
        margin: isNarrow ? "0 auto" : 0,
        bgcolor: "background.default",
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: 1,
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      {albumArt ? (
        <img src={albumArt} alt="Album Art" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <MusicNote sx={{ fontSize: 80, opacity: 0.3 }} />
      )}
    </Box>
  );

  const renderTrackInfo = () => (
    currentTrack ? (
      <Box sx={{ textAlign: isNarrow ? "center" : "left", p: 3 }}>
        <Typography variant="h4" fontWeight="bold" gutterBottom>
          {currentTrack.title}
        </Typography>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          {currentTrack.artist || "Unknown Artist"}
        </Typography>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          {currentTrack.album || "Unknown Album"}
        </Typography>
        <Typography variant="body2" color="text.disabled">
          {formatDuration(currentTrack.duration_ms)}
        </Typography>
      </Box>
    ) : (
      <Box sx={{ textAlign: "center", p: 5 }}>
        <Typography variant="h5" color="text.disabled">
          No track playing
        </Typography>
      </Box>
    )
  );

  const renderLyrics = () => (
    <Box
      sx={{
        p: 3,
        textAlign: "center",
        color: "text.secondary",
      }}
    >
      <Typography variant="body2">
        Lyrics will appear here when available
      </Typography>
    </Box>
  );

  const renderDetails = () => (
    currentTrack && (
      <Box sx={{ p: 3 }}>
        <Typography
          variant="h6"
          sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: "divider" }}
        >
          Track Information
        </Typography>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            gap: 1,
          }}
        >
          <Typography color="text.secondary">Title:</Typography>
          <Typography>{currentTrack.title}</Typography>
          
          <Typography color="text.secondary">Artist:</Typography>
          <Typography>{currentTrack.artist || "—"}</Typography>
          
          <Typography color="text.secondary">Album Artist:</Typography>
          <Typography>{currentTrack.album_artist || "—"}</Typography>
          
          <Typography color="text.secondary">Album:</Typography>
          <Typography>{currentTrack.album || "—"}</Typography>
          
          <Typography color="text.secondary">Year:</Typography>
          <Typography>{currentTrack.year || "—"}</Typography>
          
          <Typography color="text.secondary">Genre:</Typography>
          <Typography>{currentTrack.genre || "—"}</Typography>
          
          <Typography color="text.secondary">Track:</Typography>
          <Typography>{currentTrack.track_number ? `${currentTrack.track_number}${currentTrack.disc_number ? ` (Disc ${currentTrack.disc_number})` : ""}` : "—"}</Typography>
          
          <Typography color="text.secondary">Duration:</Typography>
          <Typography>{formatDuration(currentTrack.duration_ms)}</Typography>
          
          <Typography color="text.secondary">Format:</Typography>
          <Typography>{currentTrack.file_format?.toUpperCase() || "—"}</Typography>
          
          <Typography color="text.secondary">Bitrate:</Typography>
          <Typography>{currentTrack.bitrate ? `${Math.round(currentTrack.bitrate / 1000)} kbps` : "—"}</Typography>
          
          <Typography color="text.secondary">Sample Rate:</Typography>
          <Typography>{currentTrack.sample_rate ? `${currentTrack.sample_rate} Hz` : "—"}</Typography>
        </Box>
      </Box>
    )
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.default" }}>
      {/* Close Button */}
      <Box sx={{ p: 2, display: "flex", justifyContent: "flex-end" }}>
        <IconButton onClick={onClose} size="large">
          <Close />
        </IconButton>
      </Box>

      {/* Content */}
      {isNarrow ? (
        /* Narrow Layout: 3 tabs */
        <Box sx={{ flex: 1, overflowY: "auto" }}>
          {/* Tab Navigation */}
          <Tabs
            value={activeTab}
            onChange={(_, newValue) => setActiveTab(newValue)}
            centered
            sx={{ px: 2, pb: 2 }}
          >
            <Tab label="Album Art" value="albumart" />
            <Tab label="Lyrics" value="lyrics" />
            <Tab label="Details" value="details" />
          </Tabs>

          {/* Tab Content */}
          <Box sx={{ px: 2, pb: 2 }}>
            {activeTab === "albumart" && (
              <>
                {renderAlbumArt()}
                {renderTrackInfo()}
              </>
            )}
            {activeTab === "lyrics" && renderLyrics()}
            {activeTab === "details" && renderDetails()}
          </Box>
        </Box>
      ) : (
        /* Wide Layout: 2 columns */
        <Box sx={{ display: "flex", flex: 1, p: 3, gap: 4, overflowY: "auto" }}>
          {/* Left: Album Art */}
          <Box sx={{ flex: "0 0 400px" }}>
            {renderAlbumArt()}
            {renderTrackInfo()}
          </Box>

          {/* Right: Tabs */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <Tabs
              value={activeTab === "albumart" ? "lyrics" : activeTab}
              onChange={(_, newValue) => setActiveTab(newValue)}
              sx={{ mb: 2 }}
            >
              <Tab label="Lyrics" value="lyrics" />
              <Tab label="Details" value="details" />
            </Tabs>

            <Paper
              elevation={2}
              sx={{
                flex: 1,
                overflowY: "auto",
              }}
            >
              {activeTab === "lyrics" && renderLyrics()}
              {activeTab === "details" && renderDetails()}
            </Paper>
          </Box>
        </Box>
      )}
    </Box>
  );
}
