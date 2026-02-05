import { useState, useRef } from "react";
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
  Dialog,
  Slide,
  Divider,
} from "@mui/material";
import {
  LibraryMusic,
  QueueMusic,
  PlaylistPlay,
  Person,
  Album,
  LocalOffer,
  Settings,
} from "@mui/icons-material";
import { TransitionProps } from "@mui/material/transitions";
import "./App.css";
import PlayerControls from "./components/PlayerControls";
import SearchBar from "./components/SearchBar";
import NowPlayingView from "./views/NowPlayingView";
import LibraryView from "./views/LibraryView";
import QueuesView, { QueuesViewRef } from "./views/QueuesView";
import PlaylistsView from "./views/PlaylistsView";
import ArtistsView from "./views/ArtistsView";
import AlbumsView from "./views/AlbumsView";
import GenresView from "./views/GenresView";
import OptionsView from "./views/OptionsView";
// import { playerApi } from "./services/api";
import { PlayerProvider } from "./contexts/PlayerContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import React from "react";

type Tab = "nowplaying" | "library" | "queues" | "playlists" | "artists" | "albums" | "genres" | "options";

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
  console.log('[App] Render');
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [selectedArtistName, setSelectedArtistName] = useState<string | undefined>(undefined);
  const [selectedAlbumName, setSelectedAlbumName] = useState<string | undefined>(undefined);
  const [selectedGenreName, setSelectedGenreName] = useState<string | undefined>(undefined);
  const [selectedTrackId, setSelectedTrackId] = useState<number | undefined>(undefined);
  const [navigationKey, setNavigationKey] = useState(0); // Force re-navigation when same item is clicked
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const queuesViewRef = useRef<QueuesViewRef>(null);

  // Navigation callbacks - shared by all views with track lists
  const handleNavigateToArtist = (artistName: string, trackId: number) => {
    setShowNowPlaying(false);
    setSelectedArtistName(artistName);
    setSelectedAlbumName(undefined);
    setSelectedGenreName(undefined);
    setSelectedTrackId(trackId);
    setGlobalSearchQuery("");
    setNavigationKey(k => k + 1);
    setActiveTab("artists");
  };

  const handleNavigateToAlbum = (albumName: string, trackId: number) => {
    setShowNowPlaying(false);
    setSelectedAlbumName(albumName);
    setSelectedArtistName(undefined);
    setSelectedGenreName(undefined);
    setSelectedTrackId(trackId);
    setGlobalSearchQuery("");
    setNavigationKey(k => k + 1);
    setActiveTab("albums");
  };

  const handleNavigateToGenre = (genreName: string, trackId: number) => {
    setShowNowPlaying(false);
    setSelectedGenreName(genreName);
    setSelectedArtistName(undefined);
    setSelectedAlbumName(undefined);
    setSelectedTrackId(trackId);
    setGlobalSearchQuery("");
    setNavigationKey(k => k + 1);
    setActiveTab("genres");
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "library":
        return <LibraryView searchQuery={globalSearchQuery} onNavigateToArtist={handleNavigateToArtist} onNavigateToAlbum={handleNavigateToAlbum} onNavigateToGenre={handleNavigateToGenre} />;
      case "queues":
        return <QueuesView ref={queuesViewRef} searchQuery={globalSearchQuery} onClearSearch={() => setGlobalSearchQuery("")} onNavigateToArtist={handleNavigateToArtist} onNavigateToAlbum={handleNavigateToAlbum} onNavigateToGenre={handleNavigateToGenre} />;
      case "playlists":
        return <PlaylistsView searchQuery={globalSearchQuery} onClearSearch={() => setGlobalSearchQuery("")} onNavigateToArtist={handleNavigateToArtist} onNavigateToAlbum={handleNavigateToAlbum} onNavigateToGenre={handleNavigateToGenre} />;
      case "artists":
        return <ArtistsView key={`artists-${navigationKey}`} searchQuery={globalSearchQuery} initialArtistName={selectedArtistName} initialTrackId={selectedTrackId} onClearSearch={() => setGlobalSearchQuery("")} onNavigateToArtist={handleNavigateToArtist} onNavigateToAlbum={handleNavigateToAlbum} onNavigateToGenre={handleNavigateToGenre} />;
      case "albums":
        return <AlbumsView key={`albums-${navigationKey}`} searchQuery={globalSearchQuery} initialAlbumName={selectedAlbumName} initialTrackId={selectedTrackId} onClearSearch={() => setGlobalSearchQuery("")} onNavigateToArtist={handleNavigateToArtist} onNavigateToAlbum={handleNavigateToAlbum} onNavigateToGenre={handleNavigateToGenre} />;
      case "genres":
        return <GenresView key={`genres-${navigationKey}`} searchQuery={globalSearchQuery} initialGenreName={selectedGenreName} initialTrackId={selectedTrackId} onClearSearch={() => setGlobalSearchQuery("")} onNavigateToArtist={handleNavigateToArtist} onNavigateToAlbum={handleNavigateToAlbum} onNavigateToGenre={handleNavigateToGenre} />;
      case "options":
        return <OptionsView />;
      default:
        return <LibraryView searchQuery={globalSearchQuery} onNavigateToArtist={handleNavigateToArtist} onNavigateToAlbum={handleNavigateToAlbum} onNavigateToGenre={handleNavigateToGenre} />;
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

  // Main navigation tabs (without options)
  const mainTabs: { key: Tab; label: string; icon: React.ReactElement }[] = [
    { key: "queues", label: "Queues", icon: <QueueMusic /> },
    { key: "library", label: "Library", icon: <LibraryMusic /> },
    { key: "playlists", label: "Playlists", icon: <PlaylistPlay /> },
    { key: "artists", label: "Artists", icon: <Person /> },
    { key: "albums", label: "Albums", icon: <Album /> },
    { key: "genres", label: "Genres", icon: <LocalOffer /> },
  ];

  // Options tab (separate for positioning)
  const optionsTab = { key: "options" as Tab, label: "Options", icon: <Settings /> };

  // Combined tabs for mobile (options at the end)
  const mobileTabs = [...mainTabs, optionsTab];

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    // Clear navigation selections when manually switching tabs
    setSelectedArtistName(undefined);
    setSelectedAlbumName(undefined);
    setSelectedGenreName(undefined);
    setSelectedTrackId(undefined);
  };

  return (
    <SettingsProvider>
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
              {mobileTabs.map((tab) => (
                <ListItem key={tab.key} disablePadding sx={{ flex: 1 }}>
                  <ListItemButton
                    selected={activeTab === tab.key}
                    onClick={() => handleTabChange(tab.key)}
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
              display: isMobile ? "none" : "flex",
              "& .MuiDrawer-paper": {
                width: drawerWidth,
                boxSizing: "border-box",
                bgcolor: "background.paper",
                borderRight: 1,
                borderColor: "divider",
                position: "static",
                display: "flex",
                flexDirection: "column",
              },
            }}
          >
            {/* Main navigation tabs */}
            <List sx={{ flex: 1 }}>
              {mainTabs.map((tab) => (
                <ListItem key={tab.key} disablePadding>
                  <ListItemButton
                    selected={activeTab === tab.key}
                    onClick={() => handleTabChange(tab.key)}
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
            
            {/* Options tab at bottom */}
            <Divider />
            <List>
              <ListItem disablePadding>
                <ListItemButton
                  selected={activeTab === "options"}
                  onClick={() => handleTabChange("options")}
                  sx={{
                    borderLeft: activeTab === "options" ? 3 : 0,
                    borderColor: "success.main",
                  }}
                >
                  <ListItemIcon sx={{ color: activeTab === "options" ? "success.main" : "inherit" }}>
                    <Settings />
                  </ListItemIcon>
                  <ListItemText primary="Options" />
                </ListItemButton>
              </ListItem>
            </List>
          </Drawer>

          {/* Content Area */}
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              p: 3,
              pb: 12,
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
          <PlayerControls
            onExpandClick={() => setShowNowPlaying(true)}
            onQueueClick={() => {
              setActiveTab("queues");
              setTimeout(() => queuesViewRef.current?.scrollToActiveTrack(), 100);
            }}
          />
        </Paper>

        {/* Now Playing Dialog */}
        <Dialog
          fullScreen
          open={showNowPlaying}
          onClose={() => setShowNowPlaying(false)}
          TransitionComponent={Transition}
        >
          <NowPlayingView
            isNarrow={isMobile}
            onClose={() => setShowNowPlaying(false)}
            onQueueClick={() => {
              setShowNowPlaying(false);
              setActiveTab("queues");
              setTimeout(() => queuesViewRef.current?.scrollToActiveTrack(), 100);
            }}
            onNavigateToArtist={handleNavigateToArtist}
            onNavigateToAlbum={handleNavigateToAlbum}
            onNavigateToGenre={handleNavigateToGenre}
          />
        </Dialog>
      </Box>
    </PlayerProvider>
    </SettingsProvider>
  );
}

export default App;
