import {
  Box,
  Button,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { ArrowBack, PlayArrow } from "@mui/icons-material";
import { Track, playerApi } from "../services/api";

interface TrackListProps {
  tracks: Track[];
  onBack?: () => void;
  title?: string;
}

export default function TrackList({ tracks, onBack, title }: TrackListProps) {
  const handlePlayTrack = async (track: Track) => {
    try {
      await playerApi.playFile(track.file_path);
    } catch (error) {
      alert(`Failed to play track: ${error}`);
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        {onBack && (
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={onBack}
          >
            Back
          </Button>
        )}
        <Typography variant="h5" component="h2">
          {title || `${tracks.length} Tracks`}
        </Typography>
      </Paper>

      {/* Track Table */}
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {tracks.length === 0 ? (
          <Box
            sx={{
              p: 5,
              textAlign: "center",
              color: "text.secondary",
            }}
          >
            <Typography>No tracks found</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40 }}>#</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Artist</TableCell>
                  <TableCell>Album</TableCell>
                  <TableCell sx={{ width: 80 }}>Duration</TableCell>
                  <TableCell sx={{ width: 80 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tracks.map((track, index) => (
                  <TableRow
                    key={track.id}
                    hover
                    sx={{
                      "&:last-child td, &:last-child th": { border: 0 },
                    }}
                  >
                    <TableCell sx={{ color: "text.secondary" }}>
                      {index + 1}
                    </TableCell>
                    <TableCell>{track.title}</TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {track.artist || "Unknown"}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {track.album || "Unknown"}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>
                      {formatDuration(track.duration_ms)}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        color="success"
                        size="small"
                        onClick={() => handlePlayTrack(track)}
                        title="Play"
                      >
                        <PlayArrow />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
}
