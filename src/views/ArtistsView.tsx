import { useState, useEffect } from "react";
import { libraryApi, Artist, Track } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";
import SearchBar from "../components/SearchBar";
import { IconButton } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

interface ArtistsViewProps {
    searchQuery?: string;
}

export default function ArtistsView({ searchQuery = "" }: ArtistsViewProps) {
    const [artists, setArtists] = useState<Artist[]>([]);
    const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
    const [artistTracks, setArtistTracks] = useState<Track[]>([]);
    const [trackSearchQuery, setTrackSearchQuery] = useState("");
    const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);

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

    const handleArtistClick = async (artist: Artist) => {
        setSelectedArtist(artist);
        setTrackSearchQuery("");
        try {
            const tracks = await libraryApi.getTracksByArtist(artist.id);
            setArtistTracks(tracks);
            setFilteredTracks(tracks);
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

    useEffect(() => {
        if (trackSearchQuery.trim() === "") {
            setFilteredTracks(artistTracks);
        } else {
            const query = trackSearchQuery.toLowerCase();
            setFilteredTracks(
                artistTracks.filter(
                    (track) =>
                        track.title.toLowerCase().includes(query) ||
                        track.artist?.toLowerCase().includes(query) ||
                        track.album?.toLowerCase().includes(query)
                )
            );
        }
    }, [trackSearchQuery, artistTracks]);

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
                <div style={{ flex: 1, overflow: "hidden", padding: "20px" }}>
                    <VirtualTrackList tracks={filteredTracks} contextType="artist" contextName={selectedArtist?.name} />
                </div>
                <SearchBar
                    placeholder="Search in this list..."
                    value={trackSearchQuery}
                    onChange={setTrackSearchQuery}
                />
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
        </div>
    );
}
