import { useState, useEffect } from "react";
import { useTheme } from "@mui/material";
import { libraryApi, Track } from "../services/api";
import LibraryScanner from "../components/LibraryScanner";
import VirtualTrackList from "../components/VirtualTrackList";

interface LibraryViewProps {
    searchQuery?: string;
    onNavigateToArtist?: (artistName: string, trackId: number) => void;
    onNavigateToAlbum?: (albumName: string, trackId: number) => void;
    onNavigateToGenre?: (genreName: string, trackId: number) => void;
}

export default function LibraryView({ searchQuery = "", onNavigateToArtist, onNavigateToAlbum, onNavigateToGenre }: LibraryViewProps) {
    console.log(`[LibraryView] Render - searchQuery: "${searchQuery}"`);
    const theme = useTheme();
    const [tracks, setTracks] = useState<Track[]>([]);
    const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);
    const [loading, setLoading] = useState(true);
    const [isScanning, setIsScanning] = useState(() => {
        // Check if a scan is in progress when component mounts
        return sessionStorage.getItem('isScanning') === 'true';
    });

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

    const handleScanComplete = () => {
        console.log('[LibraryView] Scan complete, reloading tracks');
        setLoading(true);
        loadTracks();
    };

    useEffect(() => {
        console.log('[LibraryView] Loading tracks useEffect');
        loadTracks();

        // Poll sessionStorage to detect scan state changes from other components
        const interval = setInterval(() => {
            const scanningInStorage = sessionStorage.getItem('isScanning') === 'true';
            setIsScanning(scanningInStorage);
        }, 500);

        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        console.log(`[LibraryView] Filter useEffect - searchQuery: "${searchQuery}", tracks: ${tracks.length}`);
        if (searchQuery.trim() === "") {
            setFilteredTracks(tracks);
        } else {
            const query = searchQuery.toLowerCase();
            const filtered = tracks.filter(
                (track) =>
                    track.title.toLowerCase().includes(query) ||
                    track.artist?.toLowerCase().includes(query) ||
                    track.album?.toLowerCase().includes(query)
            );
            console.log(`[LibraryView] Filtered ${filtered.length} tracks`);
            setFilteredTracks(filtered);
        }
    }, [searchQuery, tracks]);

    return (
        <div>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "15px 20px",
                    backgroundColor: theme.palette.background.default,
                    borderBottom: `1px solid ${theme.palette.divider}`,
                }}
            >
                <h2 style={{ margin: 0, fontSize: "18px" }}>Library</h2>
            </div>
            <div style={{ padding: "20px" }}>
                <LibraryScanner
                    onScanStart={() => setIsScanning(true)}
                    onScanComplete={() => {
                        setIsScanning(false);
                        handleScanComplete();
                    }}
                />

                {!isScanning && (
                    <div style={{ marginTop: "30px" }}>
                        <h2 style={{ marginBottom: "15px" }}>
                            All Tracks ({tracks.length})
                            {searchQuery && ` - Showing ${filteredTracks.length} results`}
                        </h2>

                        {loading ? (
                            <p style={{ color: "#888" }}>Loading tracks...</p>
                        ) : tracks.length === 0 ? (
                            <div style={{ padding: "20px", backgroundColor: theme.palette.background.paper, borderRadius: "8px", textAlign: "center" }}>
                                <p style={{ color: "#888", margin: 0 }}>
                                    No tracks in library. Use the scanner above to add music files.
                                </p>
                            </div>
                        ) : filteredTracks.length === 0 ? (
                            <div style={{ padding: "20px", backgroundColor: theme.palette.background.paper, borderRadius: "8px", textAlign: "center" }}>
                                <p style={{ color: "#888", margin: 0 }}>
                                    No tracks found matching "{searchQuery}"
                                </p>
                            </div>
                        ) : (
                            <VirtualTrackList
                                tracks={filteredTracks}
                                contextType="library"
                                showSearch={false}
                                onNavigateToArtist={onNavigateToArtist}
                                onNavigateToAlbum={onNavigateToAlbum}
                                onNavigateToGenre={onNavigateToGenre}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
