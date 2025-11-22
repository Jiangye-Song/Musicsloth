import { useState, useEffect } from "react";
import { libraryApi, Track } from "../services/api";
import LibraryScanner from "../components/LibraryScanner";
import VirtualTrackList from "../components/VirtualTrackList";

interface LibraryViewProps {
  searchQuery?: string;
}

export default function LibraryView({ searchQuery = "" }: LibraryViewProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);
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

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredTracks(tracks);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredTracks(
        tracks.filter(
          (track) =>
            track.title.toLowerCase().includes(query) ||
            track.artist?.toLowerCase().includes(query) ||
            track.album?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, tracks]);

  return (
    <div>
      <LibraryScanner />

      <div style={{ marginTop: "30px" }}>
        <h2 style={{ marginBottom: "15px" }}>
          All Tracks ({tracks.length})
          {searchQuery && ` - Showing ${filteredTracks.length} results`}
        </h2>

        {loading ? (
          <p style={{ color: "#888" }}>Loading tracks...</p>
        ) : tracks.length === 0 ? (
          <div style={{ padding: "20px", backgroundColor: "#2a2a2a", borderRadius: "8px", textAlign: "center" }}>
            <p style={{ color: "#888", margin: 0 }}>
              No tracks in library. Use the scanner above to add music files.
            </p>
          </div>
        ) : filteredTracks.length === 0 ? (
          <div style={{ padding: "20px", backgroundColor: "#2a2a2a", borderRadius: "8px", textAlign: "center" }}>
            <p style={{ color: "#888", margin: 0 }}>
              No tracks found matching "{searchQuery}"
            </p>
          </div>
        ) : (
          <VirtualTrackList tracks={filteredTracks} contextType="library" />
        )}
      </div>
    </div>
  );
}
