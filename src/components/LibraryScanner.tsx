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
  List,
  ListItem,
  ListItemText,
  IconButton,
  TextField,
  InputAdornment,
} from "@mui/material";
import { 
  FolderOpen, 
  DeleteForever, 
  Sync, 
  Add, 
  Delete, 
  Search 
} from "@mui/icons-material";
import { listen } from "@tauri-apps/api/event";
import { libraryApi, IndexingResult, ScanPath } from "../services/api";

interface ScanProgress {
  current: number;
  total: number;
  current_file: string;
}

interface LibraryScannerProps {
  onScanStart?: () => void;
  onScanComplete?: () => void;
}

export default function LibraryScanner({ onScanStart, onScanComplete }: LibraryScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<IndexingResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanPaths, setScanPaths] = useState<ScanPath[]>([]);
  const [newPath, setNewPath] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Listen for scan progress events
    const unlisten = listen<ScanProgress>("scan-progress", (event) => {
      setProgress(event.payload);
    });

    // Load initial scan paths
    loadScanPaths();

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const loadScanPaths = async () => {
    try {
      const paths = await libraryApi.getAllScanPaths();
      setScanPaths(paths);
    } catch (error) {
      console.error("Failed to load scan paths:", error);
    }
  };

  const handleAddPath = async () => {
    if (!newPath.trim()) {
      alert("Please enter a directory path");
      return;
    }

    setLoading(true);
    try {
      await libraryApi.addScanPath(newPath.trim());
      setNewPath("");
      await loadScanPaths();
    } catch (error) {
      alert(`Failed to add scan path: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePath = async (pathId: number) => {
    if (!confirm("Remove this directory from the library? Tracks from this directory will be removed during the next scan.")) {
      return;
    }

    setLoading(true);
    try {
      await libraryApi.removeScanPath(pathId);
      await loadScanPaths();
    } catch (error) {
      alert(`Failed to remove scan path: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const directory = await libraryApi.pickFolder();
      if (directory) {
        setNewPath(directory);
      }
    } catch (error) {
      console.error("Failed to pick folder:", error);
    }
  };

  const handleScan = async () => {
    if (scanPaths.length === 0) {
      alert("Please add at least one directory to scan before scanning the library.");
      return;
    }

    setScanning(true);
    setResult(null);
    setProgress(null);
    
    // Store scanning state in sessionStorage so it persists across tab switches
    sessionStorage.setItem('isScanning', 'true');
    onScanStart?.();

    try {
      const scanResult = await libraryApi.scanLibrary();
      setResult(scanResult);
      setProgress(null);
      sessionStorage.removeItem('isScanning');
      onScanComplete?.();
    } catch (error) {
      alert(`Failed to scan library: ${error}`);
      sessionStorage.removeItem('isScanning');
      onScanComplete?.();
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
      {/* Scan Paths Management */}
      <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, pb: 1, borderBottom: 1, borderColor: "divider" }}>
          Library Directories
        </Typography>
        
        {/* Add New Path Section */}
        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Enter directory path to scan (e.g., C:\Music)"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                handleAddPath();
              }
            }}
            disabled={loading || scanning}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="outlined"
            startIcon={<FolderOpen />}
            onClick={handleBrowseFolder}
            disabled={loading || scanning}
          >
            Browse
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleAddPath}
            disabled={loading || scanning || !newPath.trim()}
          >
            Add
          </Button>
        </Stack>

        {/* List of Scan Paths */}
        {scanPaths.length > 0 ? (
          <List sx={{ bgcolor: "background.default", borderRadius: 1 }}>
            {scanPaths.map((scanPath) => (
              <ListItem
                key={scanPath.id}
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleRemovePath(scanPath.id)}
                    disabled={loading || scanning}
                    color="error"
                  >
                    <Delete />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={scanPath.path}
                  secondary={`Added: ${new Date(scanPath.date_added * 1000).toLocaleDateString()}`}
                />
              </ListItem>
            ))}
          </List>
        ) : (
          <Alert severity="info">
            No directories configured. Add a directory above to start building your library.
          </Alert>
        )}
      </Paper>

      {/* Scan Actions */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <Button
          variant="contained"
          color="success"
          startIcon={<Sync />}
          onClick={handleScan}
          disabled={scanning || scanPaths.length === 0}
        >
          {scanning ? "Scanning..." : "Scan Library"}
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

      {(scanning || progress) && (
        <Paper
          elevation={2}
          sx={{
            p: 3,
            border: 2,
            borderColor: "success.main",
            mb: 3,
          }}
        >
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1" fontWeight="bold" gutterBottom>
              ⏳ {scanning ? "Scanning directory and indexing files..." : "Scan in progress..."}
            </Typography>
            {progress && (
              <Typography variant="body2" color="text.secondary">
                {progress.current_file}
              </Typography>
            )}
          </Box>
          
          {progress ? (
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
          ) : (
            <LinearProgress sx={{ height: 8, borderRadius: 1 }} />
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
            
            <Typography color="text.secondary">New/Updated:</Typography>
            <Typography color="success.main" fontWeight="bold">{result.updated}</Typography>
            
            <Typography color="text.secondary">Unchanged:</Typography>
            <Typography fontWeight="bold">{result.skipped}</Typography>
            
            <Typography color="text.secondary">Removed:</Typography>
            <Typography color="warning.main" fontWeight="bold">{result.removed}</Typography>
            
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
