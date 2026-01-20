import { useState, useEffect } from "react";
import { libraryApi, Artist, Track } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";
import { IconButton } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface ArtistsViewProps {
    searchQuery?: string;
    initialArtistName?: string;
    initialTrackId?: number;
    onClearSearch?: () => void;
    onNavigateToArtist?: (artistName: string, trackId: number) => void;
    onNavigateToAlbum?: (albumName: string, trackId: number) => void;
    onNavigateToGenre?: (genreName: string, trackId: number) => void;
}

export default function ArtistsView({ searchQuery = "", initialArtistName, initialTrackId, onClearSearch, onNavigateToArtist, onNavigateToAlbum, onNavigateToGenre }: ArtistsViewProps) {
    const [artists, setArtists] = useState<Artist[]>([]);
    const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
    const [artistTracks, setArtistTracks] = useState<Track[]>([]);
    const [trackIdToFlash, setTrackIdToFlash] = useState<number | undefined>(initialTrackId);

    // Load artists on mount
    useEffect(() => {
        const loadArtists = async () => {
            try {
                const allArtists = await libraryApi.getAllArtists();
                setArtists(allArtists);
                setFilteredArtists(allArtists);
            } catch (error) {
                console.error("Failed to load artists:", error);
            } finally {
                setLoading(false);
            }
        };

        loadArtists();
    }, []);

    // Handle navigation from Now Playing view
    useEffect(() => {
        if (initialArtistName && artists.length > 0) {
            const artist = artists.find(a => a.name === initialArtistName);
            if (artist) {
                // Update trackIdToFlash before navigating
                setTrackIdToFlash(initialTrackId);
                handleArtistClick(artist);
            }
        }
    }, [initialArtistName, initialTrackId, artists]);

    const handleArtistClick = async (artist: Artist) => {
        setSelectedArtist(artist);
        try {
            const tracks = await libraryApi.getTracksByArtist(artist.id);
            setArtistTracks(tracks);
        } catch (error) {
            console.error("Failed to load artist tracks:", error);
        }
    };

    const handleBack = () => {
        setSelectedArtist(null);
        setArtistTracks([]);
    };

    useEffect(() => {
        if (searchQuery.trim() === "") {
            setFilteredArtists(artists);
        } else {
            const query = searchQuery.toLowerCase();
            setFilteredArtists(
                artists.filter((artist) => artist.name.toLowerCase().includes(query))
            );
        }
    }, [searchQuery, artists]);

    if (selectedArtist) {
        return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div
                    style={{
                        padding: "15px 20px",
                        backgroundColor: "#1a1a1a",
                        borderBottom: "1px solid #333",
                        display: "flex",
                        alignItems: "center",
                        gap: "15px",
                    }}
                >
                    <IconButton
                        onClick={handleBack}
                    ><ArrowBackIcon /></IconButton>
                    <h2 style={{ margin: 0, fontSize: "18px" }}>
                        {selectedArtist.name} ({artistTracks.length} tracks)
                    </h2>
                </div>
                <div style={{ flex: 1, overflow: "hidden", height: "80%" }}>
                    <VirtualTrackList tracks={artistTracks} contextType="artist" contextName={selectedArtist?.name} showSearch={true} initialTrackId={trackIdToFlash} onNavigateToArtist={onNavigateToArtist} onNavigateToAlbum={onNavigateToAlbum} onNavigateToGenre={onNavigateToGenre} />
                </div>
            </div>
        );
    }

    return (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "15px 20px",
                    backgroundColor: "#1a1a1a",
                    borderBottom: "1px solid #333",
                }}
            >
                <h2 style={{ margin: 0, fontSize: "18px" }}>Artists</h2>
            </div>
            {/* Artists List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
                {loading ? (
                    <p style={{ color: "#888" }}>Loading artists...</p>
                ) : artists.length === 0 ? (
                    <div
                        style={{
                            padding: "20px",
                            backgroundColor: "#2a2a2a",
                            borderRadius: "8px",
                            textAlign: "center",
                        }}
                    >
                        <p style={{ color: "#888", margin: 0 }}>
                            No artists in library. Scan your music folder to populate the
                            library.
                        </p>
                    </div>
                ) : filteredArtists.length === 0 ? (
                    <div
                        style={{
                            padding: "20px",
                            backgroundColor: "#2a2a2a",
                            borderRadius: "8px",
                            textAlign: "center",
                        }}
                    >
                        <p style={{ color: "#888", margin: 0 }}>
                            No artists found matching "{searchQuery}"
                        </p>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                        {filteredArtists.map((artist) => (
                            <div
                                key={artist.id}
                                onClick={() => handleArtistClick(artist)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "15px 20px",
                                    borderBottom: "1px solid #2a2a2a",
                                    cursor: "pointer",
                                    transition: "background-color 0.2s",
                                    gap: "15px",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "#2a2a2a";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                }}
                            >
                                {/* Artist Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h3
                                        style={{
                                            margin: "0 0 5px 0",
                                            fontSize: "16px",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {artist.name}
                                    </h3>
                                    <p
                                        style={{
                                            margin: 0,
                                            fontSize: "14px",
                                            color: "#888",
                                        }}
                                    >
                                        {artist.song_count} song{artist.song_count !== 1 ? "s" : ""}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {searchQuery && onClearSearch && (
                <div className="search-tip">
                    <span>Searching "{searchQuery}", </span>
                    <button
                        onClick={onClearSearch}
                    >
                        show all items
                    </button>
                </div>
            )}
        </div>
    );
}
