import { useState } from "react";
import "./App.css";
import PlayerControls from "./components/PlayerControls";
import NowPlayingView from "./views/NowPlayingView";
import LibraryView from "./views/LibraryView";
import QueuesView from "./views/QueuesView";
import PlaylistsView from "./views/PlaylistsView";
import ArtistsView from "./views/ArtistsView";
import AlbumsView from "./views/AlbumsView";
import GenresView from "./views/GenresView";
import { playerApi } from "./services/api";

type Tab = "nowplaying" | "library" | "queues" | "playlists" | "artists" | "albums" | "genres";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("nowplaying");

  const handleFileSelect = async () => {
    // Prompt user to enter file path (temporary solution)
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
      case "nowplaying":
        return <NowPlayingView />;
      case "library":
        return <LibraryView />;
      case "queues":
        return <QueuesView />;
      case "playlists":
        return <PlaylistsView />;
      case "artists":
        return <ArtistsView />;
      case "albums":
        return <AlbumsView />;
      case "genres":
        return <GenresView />;
      default:
        return <NowPlayingView />;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#1a1a1a", color: "white" }}>

      {/* Main Content Area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Tab Navigation */}
        <nav style={{ width: "200px", backgroundColor: "#252525", padding: "20px 0", borderRight: "1px solid #333" }}>
          <button
            onClick={handleFileSelect}
            style={{
              width: "calc(100% - 20px)",
              margin: "0 10px 20px 10px",
              padding: "10px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "bold"
            }}
          >
            📂 Open File
          </button>

          {(["nowplaying", "library", "queues", "playlists", "artists", "albums", "genres"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: "block",
                width: "100%",
                padding: "12px 20px",
                backgroundColor: activeTab === tab ? "#333" : "transparent",
                color: activeTab === tab ? "white" : "#aaa",
                border: "none",
                borderLeft: activeTab === tab ? "3px solid #4CAF50" : "3px solid transparent",
                textAlign: "left",
                cursor: "pointer",
                fontSize: "14px",
                transition: "all 0.2s"
              }}
            >
              {tab === "nowplaying" ? "Now Playing" : tab === "library" ? "Library" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        {/* Content Area */}
        <main style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
          {renderTabContent()}
        </main>
      </div>

      {/* Player Controls (Footer) */}
      <footer style={{ backgroundColor: "#2a2a2a", borderTop: "1px solid #333", padding: "15px 20px" }}>
        <PlayerControls />
      </footer>
    </div>
  );
}

export default App;
