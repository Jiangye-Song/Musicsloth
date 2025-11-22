import { useState, useEffect } from "react";
import {
  Box,
  Button,
  Paper,
  Typography,
  LinearProgress,
  Alert,
  AlertTitle,
  Stack,
} from "@mui/material";
import { FolderOpen, DeleteForever } from "@mui/icons-material";
import { listen } from "@tauri-apps/api/event";
import { libraryApi, IndexingResult } from "../services/api";

interface ScanProgress {
  current: number;
  total: number;
  current_file: string;
}

export default function LibraryScanner() {
  const [scanning, setScanning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<IndexingResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  useEffect(() => {
    // Listen for scan progress events
    const unlisten = listen<ScanProgress>("scan-progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleScan = async () => {
    // Prompt user to enter directory path
    const directory = prompt("Enter the directory path to scan for music files:");
    if (!directory) return;

    setScanning(true);
    setResult(null);
    setProgress(null);

    try {
      const scanResult = await libraryApi.scanLibrary(directory);
      setResult(scanResult);
      setProgress(null);
    } catch (error) {
      alert(`Failed to scan library: ${error}`);
    } finally {
      setScanning(false);
    }
  };

  const handleClearLibrary = async () => {
    if (!confirm("Are you sure you want to clear the entire library? This will delete all tracks, artists, albums, and genres.")) {
      return;
    }

    setClearing(true);
    try {
      await libraryApi.clearLibrary();
      alert("Library cleared successfully! You can now rescan your music folder.");
      setResult(null);
      // Reload page to refresh all views
      window.location.reload();
    } catch (error) {
      alert(`Failed to clear library: ${error}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          color="success"
          startIcon={<FolderOpen />}
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? "Scanning..." : "Scan Music Folder"}
        </Button>

        <Button
          variant="contained"
          color="error"
          startIcon={<DeleteForever />}
          onClick={handleClearLibrary}
          disabled={clearing || scanning}
        >
          {clearing ? "Clearing..." : "Clear Library"}
        </Button>
      </Stack>

      {scanning && (
        <Paper
          elevation={2}
          sx={{
            p: 3,
            border: 2,
            borderColor: "success.main",
          }}
        >
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" fontWeight="bold" gutterBottom>
              ⏳ Scanning directory and indexing files...
            </Typography>
            {progress && (
              <Typography variant="body2" color="text.secondary">
                Processing: {progress.current_file}
              </Typography>
            )}
          </Box>
          
          {progress && (
            <Box>
              <LinearProgress
                variant="determinate"
                value={(progress.current / progress.total) * 100}
                sx={{ height: 8, borderRadius: 1, mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary" textAlign="center">
                {progress.current} / {progress.total} files ({Math.round((progress.current / progress.total) * 100)}%)
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {result && (
        <Paper elevation={2} sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: "divider" }}>
            Scan Results
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "150px 1fr",
              gap: 1,
              mb: 2,
            }}
          >
            <Typography color="text.secondary">Total Files:</Typography>
            <Typography fontWeight="bold">{result.total_files}</Typography>
            
            <Typography color="text.secondary">Successfully Indexed:</Typography>
            <Typography color="success.main" fontWeight="bold">{result.successful}</Typography>
            
            <Typography color="text.secondary">Failed:</Typography>
            <Typography
              color={result.failed > 0 ? "error.main" : "text.primary"}
              fontWeight="bold"
            >
              {result.failed}
            </Typography>
          </Box>

          {result.errors.length > 0 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <AlertTitle>Errors ({result.errors.length})</AlertTitle>
              <Box
                sx={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  mt: 1,
                  p: 1,
                  bgcolor: "background.default",
                  borderRadius: 1,
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                }}
              >
                {result.errors.map((error, index) => (
                  <Box key={index} sx={{ mb: 0.5 }}>
                    {error}
                  </Box>
                ))}
              </Box>
            </Alert>
          )}

          <Alert severity="success" sx={{ mt: 2 }}>
            Scan complete! Go to the Queues, Artists, Albums, or Genres tabs to view your library.
          </Alert>
        </Paper>
      )}
    </Box>
  );
}
