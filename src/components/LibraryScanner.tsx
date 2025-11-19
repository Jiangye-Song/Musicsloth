import { useState } from "react";
import { libraryApi, IndexingResult } from "../services/api";

export default function LibraryScanner() {
  const [scanning, setScanning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<IndexingResult | null>(null);

  const handleScan = async () => {
    // Prompt user to enter directory path
    const directory = prompt("Enter the directory path to scan for music files:");
    if (!directory) return;

    setScanning(true);
    setResult(null);

    try {
      const scanResult = await libraryApi.scanLibrary(directory);
      setResult(scanResult);
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
    <div style={{ padding: "20px" }}>
      <h2 style={{ marginBottom: "20px" }}>Library Scanner</h2>
      
      <div style={{ marginBottom: "20px", display: "flex", gap: "10px" }}>
        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            padding: "12px 24px",
            backgroundColor: scanning ? "#666" : "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: scanning ? "not-allowed" : "pointer",
            fontSize: "16px",
            fontWeight: "bold",
          }}
        >
          {scanning ? "Scanning..." : "📂 Scan Music Folder"}
        </button>

        <button
          onClick={handleClearLibrary}
          disabled={clearing || scanning}
          style={{
            padding: "12px 24px",
            backgroundColor: clearing || scanning ? "#666" : "#f44336",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: clearing || scanning ? "not-allowed" : "pointer",
            fontSize: "16px",
            fontWeight: "bold",
          }}
        >
          {clearing ? "Clearing..." : "🗑️ Clear Library"}
        </button>
      </div>

      {scanning && (
        <div style={{ padding: "15px", backgroundColor: "#2a2a2a", borderRadius: "8px", border: "1px solid #4CAF50" }}>
          <p style={{ margin: 0, fontSize: "14px" }}>
            ⏳ Scanning directory and indexing files...
          </p>
        </div>
      )}

      {result && (
        <div style={{ padding: "20px", backgroundColor: "#2a2a2a", borderRadius: "8px", border: "1px solid #333" }}>
          <h3 style={{ margin: "0 0 15px 0", fontSize: "18px", borderBottom: "1px solid #333", paddingBottom: "10px" }}>
            Scan Results
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "10px", fontSize: "14px" }}>
            <span style={{ color: "#888" }}>Total Files:</span>
            <span style={{ fontWeight: "bold" }}>{result.total_files}</span>
            
            <span style={{ color: "#888" }}>Successfully Indexed:</span>
            <span style={{ color: "#4CAF50", fontWeight: "bold" }}>{result.successful}</span>
            
            <span style={{ color: "#888" }}>Failed:</span>
            <span style={{ color: result.failed > 0 ? "#f44336" : "white", fontWeight: "bold" }}>
              {result.failed}
            </span>
          </div>

          {result.errors.length > 0 && (
            <div style={{ marginTop: "15px" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#f44336" }}>
                Errors ({result.errors.length})
              </h4>
              <div
                style={{
                  maxHeight: "200px",
                  overflowY: "auto",
                  backgroundColor: "#1a1a1a",
                  padding: "10px",
                  borderRadius: "5px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                }}
              >
                {result.errors.map((error, index) => (
                  <div key={index} style={{ marginBottom: "5px", color: "#ff8a80" }}>
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: "20px", fontSize: "14px", color: "#888" }}>
            <p style={{ margin: 0 }}>
              ✅ Scan complete! Go to the Queues, Artists, Albums, or Genres tabs to view your library.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
