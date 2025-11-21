import { useState, useEffect, useRef } from "react";
import { libraryApi, Album, Track } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";
import SearchBar from "../components/SearchBar";

interface AlbumItemProps {
  album: Album;
  onClick: () => void;
}

function AlbumItem({ album, onClick }: AlbumItemProps) {
  const [albumArt, setAlbumArt] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Intersection Observer for lazy loading with unload on exit
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
          } else {
            // Item left viewport - cancel loading and cleanup
            setIsVisible(false);
            if (abortControllerRef.current) {
              abortControllerRef.current.abort();
              abortControllerRef.current = null;
            }
            // Cleanup album art to free memory
            setAlbumArt((prevArt) => {
              if (prevArt) URL.revokeObjectURL(prevArt);
              return null;
            });
          }
        });
      },
      {
        rootMargin: "200px", // Start loading 200px before item enters viewport
      }
    );

    if (itemRef.current) {
      observer.observe(itemRef.current);
    }

    return () => {
      observer.disconnect();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Load album art only when visible
  useEffect(() => {
    if (!isVisible) return;

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const currentController = abortControllerRef.current;

    const loadAlbumArt = async () => {
      try {
        // Get first track of the album
        const tracks = await libraryApi.getTracksByAlbum(album.name);
        
        // Check if request was cancelled
        if (currentController.signal.aborted) return;
        
        if (tracks.length > 0) {
          const artData = await libraryApi.getAlbumArt(tracks[0].file_path);
          
          // Check again if request was cancelled
          if (currentController.signal.aborted) return;
          
          if (artData && artData.length > 0) {
            const blob = new Blob([new Uint8Array(artData)], { type: "image/jpeg" });
            const url = URL.createObjectURL(blob);
            setAlbumArt((prevArt) => {
              if (prevArt) URL.revokeObjectURL(prevArt);
              return url;
            });
          }
        }
      } catch (err) {
        if (currentController.signal.aborted) return; // Ignore cancelled requests
        console.error("Failed to load album art:", err);
      }
    };

    loadAlbumArt();

    return () => {
      if (currentController) {
        currentController.abort();
      }
    };
  }, [isVisible, album.name]);

  return (
    <div
      ref={itemRef}
      onClick={onClick}
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
      {/* Album Cover */}
      <div
        style={{
          width: "60px",
          height: "60px",
          backgroundColor: "#1a1a1a",
          borderRadius: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "28px",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {albumArt ? (
          <img src={albumArt} alt={album.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ opacity: 0.3 }}
          >
            <path
              d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
              fill="currentColor"
            />
          </svg>
        )}
      </div>

      {/* Album Info */}
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
          {album.name}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "#888",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {album.song_count} song{album.song_count !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

export default function AlbumsView() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [filteredAlbums, setFilteredAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [trackSearchQuery, setTrackSearchQuery] = useState("");
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);

  useEffect(() => {
    const loadAlbums = async () => {
      try {
        const allAlbums = await libraryApi.getAllAlbums();
        setAlbums(allAlbums);
        setFilteredAlbums(allAlbums);
      } catch (error) {
        console.error("Failed to load albums:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAlbums();
  }, []);

  const handleAlbumClick = async (album: Album) => {
    setSelectedAlbum(album);
    setTrackSearchQuery("");
    try {
      const tracks = await libraryApi.getTracksByAlbum(album.name);
      setAlbumTracks(tracks);
      setFilteredTracks(tracks);
    } catch (error) {
      console.error("Failed to load album tracks:", error);
    }
  };

  const handleBack = () => {
    setSelectedAlbum(null);
    setAlbumTracks([]);
  };

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredAlbums(albums);
    } else {
      const query = searchQuery.toLowerCase();
      setFilteredAlbums(
        albums.filter(
          (album) =>
            album.name.toLowerCase().includes(query) ||
            album.artist?.toLowerCase().includes(query)
        )
      );
    }
  }, [searchQuery, albums]);

  useEffect(() => {
    if (trackSearchQuery.trim() === "") {
      setFilteredTracks(albumTracks);
    } else {
      const query = trackSearchQuery.toLowerCase();
      setFilteredTracks(
        albumTracks.filter(
          (track) =>
            track.title.toLowerCase().includes(query) ||
            track.artist?.toLowerCase().includes(query) ||
            track.album?.toLowerCase().includes(query)
        )
      );
    }
  }, [trackSearchQuery, albumTracks]);

  if (selectedAlbum) {
    return (
      <div>
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
          <button
            onClick={handleBack}
            style={{
              padding: "8px 16px",
              backgroundColor: "#333",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            ← Back
          </button>
          <h2 style={{ margin: 0, fontSize: "18px" }}>
            {selectedAlbum.name} {selectedAlbum.artist ? `by ${selectedAlbum.artist}` : ""} ({albumTracks.length} tracks)
          </h2>
        </div>
        <SearchBar
          placeholder="Search in this list..."
          value={trackSearchQuery}
          onChange={setTrackSearchQuery}
        />
        <div style={{ padding: "20px" }}>
          <VirtualTrackList tracks={filteredTracks} contextType="album" contextName={selectedAlbum?.name} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Albums Grid */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
        {loading ? (
          <p style={{ color: "#888" }}>Loading albums...</p>
        ) : albums.length === 0 ? (
          <div
            style={{
              padding: "20px",
              backgroundColor: "#2a2a2a",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#888", margin: 0 }}>
              No albums in library. Scan your music folder to populate the
              library.
            </p>
          </div>
        ) : filteredAlbums.length === 0 ? (
          <div
            style={{
              padding: "20px",
              backgroundColor: "#2a2a2a",
              borderRadius: "8px",
              textAlign: "center",
            }}
          >
            <p style={{ color: "#888", margin: 0 }}>
              No albums found matching "{searchQuery}"
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {filteredAlbums.map((album) => (
              <AlbumItem
                key={album.id}
                album={album}
                onClick={() => handleAlbumClick(album)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Search Bar at bottom */}
      <SearchBar
        placeholder="Search an album..."
        value={searchQuery}
        onChange={setSearchQuery}
      />
    </div>
  );
}
