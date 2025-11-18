import { useState } from "react";
import "./App.css";
import PlayerControls from "./components/PlayerControls";
import { playerApi } from "./services/api";

function App() {
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  const handleFileSelect = async () => {
    // Prompt user to enter file path (temporary solution)
    const filePath = prompt("Enter the full path to an audio file:");
    if (filePath) {
      try {
        await playerApi.playFile(filePath);
        setCurrentFile(filePath);
      } catch (error) {
        alert(`Failed to play file: ${error}`);
      }
    }
  };

  return (
    <main className="container" style={{ maxWidth: "800px", margin: "0 auto", padding: "40px 20px" }}>
      <h1 style={{ textAlign: "center", marginBottom: "30px" }}>
        🎵 Musicsloth
      </h1>
      <p style={{ textAlign: "center", color: "#888", marginBottom: "40px" }}>
        Desktop Music Player
      </p>

      <PlayerControls 
        onFileSelect={handleFileSelect}
      />

      <div style={{ marginTop: "30px", padding: "20px", backgroundColor: "#1a1a1a", borderRadius: "8px" }}>
        <h3 style={{ marginBottom: "10px" }}>Phase 1 - Basic Playback ✅</h3>
        <ul style={{ lineHeight: "1.8", color: "#ccc" }}>
          <li>✅ SQLite database with full schema</li>
          <li>✅ Audio playback with rodio</li>
          <li>✅ Metadata extraction with lofty</li>
          <li>✅ Play, pause, stop, volume controls</li>
          <li>✅ Basic player UI</li>
        </ul>
        <p style={{ marginTop: "15px", fontSize: "14px", color: "#888" }}>
          <strong>Next:</strong> Phase 2 - Library management and scanning
        </p>
      </div>
    </main>
  );
}

export default App;
