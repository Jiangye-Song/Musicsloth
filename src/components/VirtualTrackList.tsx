import { useState, useEffect, useRef, useCallback } from "react";
import { libraryApi, Track, playerApi } from "../services/api";

const ITEM_HEIGHT = 80;
const OVERSCAN = 10; // Number of items to render beyond visible area
const MAX_CONCURRENT_LOADS = 3; // Limit concurrent album art loads

interface VirtualTrackListProps {
  tracks: Track[];
}

export default function VirtualTrackList({ tracks }: VirtualTrackListProps) {
  const [albumArtCache, setAlbumArtCache] = useState<Map<string, string>>(new Map());
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(20);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadingArtRef = useRef<Set<string>>(new Set());
  const loadQueueRef = useRef<string[]>([]);
  const activeLoadsRef = useRef(0);

  // Calculate visible range on scroll with debounce
  const scrollTimeoutRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    if (scrollTimeoutRef.current !== null) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = window.setTimeout(() => {
      if (!containerRef.current) return;
      
      const scrollTop = containerRef.current.scrollTop;
      const viewportHeight = containerRef.current.clientHeight;
      
      const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
      const end = Math.min(
        tracks.length,
        Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + OVERSCAN
      );
      
      setVisibleStart(start);
      setVisibleEnd(end);
    }, 50); // Debounce scroll events
  }, [tracks.length]);

  // Initialize visible range
  useEffect(() => {
    handleScroll();
  }, [tracks, handleScroll]);

  // Process album art load queue
  const processLoadQueue = useCallback(async () => {
    while (loadQueueRef.current.length > 0 && activeLoadsRef.current < MAX_CONCURRENT_LOADS) {
      const filePath = loadQueueRef.current.shift();
      if (!filePath) continue;
      
      // Skip if already loaded or currently loading
      if (albumArtCache.has(filePath) || loadingArtRef.current.has(filePath)) {
        continue;
      }
      
      loadingArtRef.current.add(filePath);
      activeLoadsRef.current++;
      
      // Load in background
      (async () => {
        try {
          const artData = await libraryApi.getAlbumArt(filePath);
          if (artData) {
            const blob = new Blob([new Uint8Array(artData)], { type: "image/jpeg" });
            const url = URL.createObjectURL(blob);
            setAlbumArtCache(prev => {
              const newCache = new Map(prev);
              newCache.set(filePath, url);
              return newCache;
            });
          }
        } catch (error) {
          // Silently ignore errors during scrolling
        } finally {
          loadingArtRef.current.delete(filePath);
          activeLoadsRef.current--;
          processLoadQueue(); // Process next item
        }
      })();
    }
  }, [albumArtCache]);

  // Load album art for visible tracks
  useEffect(() => {
    // Clear queue and add visible tracks
    loadQueueRef.current = [];
    const visibleTracks = tracks.slice(visibleStart, visibleEnd);
    visibleTracks.forEach(track => {
      if (!albumArtCache.has(track.file_path) && !loadingArtRef.current.has(track.file_path)) {
        loadQueueRef.current.push(track.file_path);
      }
    });
    
    processLoadQueue();
  }, [visibleStart, visibleEnd, tracks, albumArtCache, processLoadQueue]);

  // Cleanup blob URLs on unmount and when they're far from viewport
  useEffect(() => {
    // Cleanup album art that's far from viewport
    const visibleFilePaths = new Set(
      tracks.slice(
        Math.max(0, visibleStart - OVERSCAN * 2),
        Math.min(tracks.length, visibleEnd + OVERSCAN * 2)
      ).map(t => t.file_path)
    );
    
    // Remove cached art that's far from viewport
    setAlbumArtCache(prev => {
      const newCache = new Map(prev);
      let changed = false;
      
      prev.forEach((url, filePath) => {
        if (!visibleFilePaths.has(filePath)) {
          URL.revokeObjectURL(url);
          newCache.delete(filePath);
          changed = true;
        }
      });
      
      return changed ? newCache : prev;
    });
  }, [visibleStart, visibleEnd, tracks]);

  // Cleanup all blob URLs on unmount
  useEffect(() => {
    return () => {
      albumArtCache.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  const handlePlayTrack = async (track: Track) => {
    try {
      await playerApi.playFile(track.file_path);
    } catch (error) {
      console.error("Failed to play track:", error);
      alert(`Failed to play track: ${error}`);
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "—";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const visibleTracks = tracks.slice(visibleStart, visibleEnd);

  if (tracks.length === 0) {
    return (
      <div style={{ padding: "20px", backgroundColor: "#2a2a2a", borderRadius: "8px", textAlign: "center" }}>
        <p style={{ color: "#888", margin: 0 }}>No tracks found.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        backgroundColor: "#2a2a2a",
        borderRadius: "8px",
        overflow: "auto",
        maxHeight: "calc(100vh - 250px)",
        position: "relative",
      }}
    >
      {/* Spacer for virtual scrolling */}
      <div style={{ height: `${tracks.length * ITEM_HEIGHT}px`, position: "relative" }}>
        {/* Only render visible items */}
        <div
          style={{
            position: "absolute",
            top: `${visibleStart * ITEM_HEIGHT}px`,
            left: 0,
            right: 0,
          }}
        >
          {visibleTracks.map((track) => {
            const albumArt = albumArtCache.get(track.file_path);
            
            return (
              <div
                key={track.id}
                onClick={() => handlePlayTrack(track)}
                style={{
                  height: `${ITEM_HEIGHT}px`,
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 15px",
                  borderBottom: "1px solid #333",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#333")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                {/* Album Art */}
                <div
                  style={{
                    width: "60px",
                    height: "60px",
                    backgroundColor: "#1a1a1a",
                    borderRadius: "4px",
                    marginRight: "15px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {albumArt ? (
                    <img
                      src={albumArt}
                      alt={track.album || "Album"}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <svg
                      width="24"
                      height="24"
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

                {/* Track Info */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {track.title}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#aaa",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {track.artist || "Unknown Artist"}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#888",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {track.album || "Unknown Album"}
                  </div>
                </div>

                {/* Duration */}
                <div
                  style={{
                    fontSize: "14px",
                    color: "#888",
                    marginLeft: "15px",
                    flexShrink: 0,
                  }}
                >
                  {formatDuration(track.duration_ms)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
