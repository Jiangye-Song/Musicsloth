import { useState, useEffect } from "react";
import { libraryApi, Track } from "../services/api";
import LibraryScanner from "../components/LibraryScanner";
import VirtualTrackList from "../components/VirtualTrackList";

export default function LibraryView() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTracks = async () => {
    try {
      const allTracks = await libraryApi.getAllTracks();
      setTracks(allTracks);
    } catch (error) {
      console.error("Failed to load tracks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTracks();
  }, []);

  return (
    <div>
      <LibraryScanner />

      <div style={{ marginTop: "30px" }}>
        <h2 style={{ marginBottom: "15px" }}>All Tracks ({tracks.length})</h2>

        {loading ? (
          <p style={{ color: "#888" }}>Loading tracks...</p>
        ) : tracks.length === 0 ? (
          <div style={{ padding: "20px", backgroundColor: "#2a2a2a", borderRadius: "8px", textAlign: "center" }}>
            <p style={{ color: "#888", margin: 0 }}>
              No tracks in library. Use the scanner above to add music files.
            </p>
          </div>
        ) : (
          <VirtualTrackList tracks={tracks} contextType="library" />
        )}
      </div>
    </div>
  );
}
