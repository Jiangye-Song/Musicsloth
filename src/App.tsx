import { useState } from "react";
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  useMediaQuery,
  useTheme,
  Button,
  Dialog,
  Slide,
} from "@mui/material";
import {
  LibraryMusic,
  QueueMusic,
  PlaylistPlay,
  Person,
  Album,
  MusicNote,
  FolderOpen,
} from "@mui/icons-material";
import { TransitionProps } from "@mui/material/transitions";
import "./App.css";
import PlayerControls from "./components/PlayerControls";
import SearchBar from "./components/SearchBar";
import NowPlayingView from "./views/NowPlayingView";
import LibraryView from "./views/LibraryView";
import QueuesView from "./views/QueuesView";
import PlaylistsView from "./views/PlaylistsView";
import ArtistsView from "./views/ArtistsView";
import AlbumsView from "./views/AlbumsView";
import GenresView from "./views/GenresView";
import { playerApi } from "./services/api";
import { PlayerProvider } from "./contexts/PlayerContext";
import React from "react";

type Tab = "nowplaying" | "library" | "queues" | "playlists" | "artists" | "albums" | "genres";

const Transition = React.forwardRef(function Transition(
  props: TransitionProps & {
    children: React.ReactElement;
  },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const drawerWidth = 240;

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const handleFileSelect = async () => {
    const filePath = prompt("Enter the full path to an audio file:");
    if (filePath) {
      try {
        await playerApi.playFile(filePath);
      } catch (error) {
        alert(`Failed to play file: ${error}`);
      }
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "library":
        return <LibraryView searchQuery={globalSearchQuery} />;
      case "queues":
        return <QueuesView searchQuery={globalSearchQuery} />;
      case "playlists":
        return <PlaylistsView searchQuery={globalSearchQuery} />;
      case "artists":
        return <ArtistsView searchQuery={globalSearchQuery} />;
      case "albums":
        return <AlbumsView searchQuery={globalSearchQuery} />;
      case "genres":
        return <GenresView searchQuery={globalSearchQuery} />;
      default:
        return <LibraryView searchQuery={globalSearchQuery} />;
    }
  };

  const showGlobalSearch = activeTab === "library" || activeTab === "queues" || activeTab === "artists" || activeTab === "albums" || activeTab === "genres" || activeTab === "playlists";
  const searchPlaceholder = 
    activeTab === "library" ? "Search tracks..." :
    activeTab === "queues" ? "Search a queue..." :
    activeTab === "artists" ? "Search an artist..." :
    activeTab === "albums" ? "Search an album..." :
    activeTab === "genres" ? "Search a genre..." :
    activeTab === "playlists" ? "Search a playlist..." : "";

  const tabs: { key: Tab; label: string; icon: React.ReactElement }[] = [
    { key: "library", label: "Library", icon: <LibraryMusic /> },
    { key: "queues", label: "Queues", icon: <QueueMusic /> },
    { key: "playlists", label: "Playlists", icon: <PlaylistPlay /> },
    { key: "artists", label: "Artists", icon: <Person /> },
    { key: "albums", label: "Albums", icon: <Album /> },
    { key: "genres", label: "Genres", icon: <MusicNote /> },
  ];

  return (
    <PlayerProvider>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", bgcolor: "background.default" }}>
      {/* Mobile Top Navigation */}
      {isMobile && (
        <Paper
          sx={{
            borderBottom: 1,
            borderColor: "divider",
          }}
          elevation={2}
        >
          <List sx={{ display: "flex", flexDirection: "row", p: 0, overflowX: "auto" }}>
            {tabs.map((tab) => (
              <ListItem key={tab.key} disablePadding sx={{ flex: 1 }}>
                <ListItemButton
                  selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  sx={{
                    flexDirection: "column",
                    py: 1,
                    borderBottom: activeTab === tab.key ? 3 : 0,
                    borderColor: "success.main",
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, color: activeTab === tab.key ? "success.main" : "inherit" }}>
                    {tab.icon}
                  </ListItemIcon>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Search Bar */}
      {showGlobalSearch && (
        <SearchBar
          placeholder={searchPlaceholder}
          value={globalSearchQuery}
          onChange={setGlobalSearchQuery}
        />
      )}

      {/* Main Layout */}
      <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar Navigation */}
        <Drawer
          variant="permanent"
          sx={{
            width: isMobile ? 0 : drawerWidth,
            flexShrink: 0,
            display: isMobile ? "none" : "block",
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              boxSizing: "border-box",
              bgcolor: "background.paper",
              borderRight: 1,
              borderColor: "divider",
              position: "static",
            },
          }}
        >
          <Box sx={{ p: 2 }}>
            <Button
              variant="contained"
              color="success"
              fullWidth
              startIcon={<FolderOpen />}
              onClick={handleFileSelect}
            >
              Open File
            </Button>
          </Box>
          <List>
            {tabs.map((tab) => (
              <ListItem key={tab.key} disablePadding>
                <ListItemButton
                  selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  sx={{
                    borderLeft: activeTab === tab.key ? 3 : 0,
                    borderColor: "success.main",
                  }}
                >
                  <ListItemIcon sx={{ color: activeTab === tab.key ? "success.main" : "inherit" }}>
                    {tab.icon}
                  </ListItemIcon>
                  <ListItemText primary={tab.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Drawer>

        {/* Content Area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            overflowY: "auto",
          }}
        >
          {renderTabContent()}
        </Box>
      </Box>

      {/* Player Controls Footer */}
      <Paper
        elevation={3}
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          p: 0,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <PlayerControls onExpandClick={() => setShowNowPlaying(true)} />
      </Paper>

      {/* Now Playing Dialog */}
      <Dialog
        fullScreen
        open={showNowPlaying}
        onClose={() => setShowNowPlaying(false)}
        TransitionComponent={Transition}
      >
        <NowPlayingView isNarrow={isMobile} onClose={() => setShowNowPlaying(false)} />
      </Dialog>
    </Box>
    </PlayerProvider>
  );
}

export default App;
