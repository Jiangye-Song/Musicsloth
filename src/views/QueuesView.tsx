import { useState, useEffect } from "react";
import { queueApi, Queue, Track, playerApi } from "../services/api";
import VirtualTrackList from "../components/VirtualTrackList";
import SearchBar from "../components/SearchBar";

export default function QueuesView() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);
  const [queueTracks, setQueueTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [trackSearchQuery, setTrackSearchQuery] = useState("");
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);

  useEffect(() => {
    loadQueues();
  }, []);

  useEffect(() => {
    if (trackSearchQuery.trim() === "") {
      setFilteredTracks(queueTracks);
    } else {
      const query = trackSearchQuery.toLowerCase();
      setFilteredTracks(
        queueTracks.filter(
          (track) =>
            track.title.toLowerCase().includes(query) ||
            track.artist?.toLowerCase().includes(query) ||
            track.album?.toLowerCase().includes(query)
        )
      );
    }
  }, [trackSearchQuery, queueTracks]);

  const loadQueues = async (forceReloadTracks = false) => {
    try {
      const allQueues = await queueApi.getAllQueues();
      
      // Check if queues actually changed (compare active status)
      const queuesChanged = queues.length !== allQueues.length || 
        queues.some((q, i) => q.is_active !== allQueues[i]?.is_active || q.id !== allQueues[i]?.id);
      
      if (!queuesChanged && !forceReloadTracks) {
        // No changes, skip update to avoid re-renders
        return;
      }
      
      setQueues(allQueues);
      
      // Update selectedQueue if it's in the list (to refresh active status)
      if (selectedQueue) {
        const updatedSelectedQueue = allQueues.find(q => q.id === selectedQueue.id);
        if (updatedSelectedQueue && updatedSelectedQueue.is_active !== selectedQueue.is_active) {
          setSelectedQueue(updatedSelectedQueue);
        }
      }
      
      // Auto-select active queue on first load
      const activeQueue = allQueues.find(q => q.is_active);
      if (activeQueue && !selectedQueue) {
        setSelectedQueue(activeQueue);
        loadQueueTracks(activeQueue.id);
      }
    } catch (error) {
      console.error("Failed to load queues:", error);
    }
  };

  const loadQueueTracks = async (queueId: number, silent = false) => {
    if (!silent) setLoading(true);
    setTrackSearchQuery("");
    try {
      const tracks = await queueApi.getQueueTracks(queueId);
      setQueueTracks(tracks);
      setFilteredTracks(tracks);
    } catch (error) {
      console.error("Failed to load queue tracks:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleSelectQueue = async (queue: Queue) => {
    setSelectedQueue(queue);
    await loadQueueTracks(queue.id);
  };

  const handlePlayQueue = async () => {
    if (!selectedQueue) return;
    
    try {
      // Set as active queue
      await queueApi.setActiveQueue(selectedQueue.id);
      
      // Play first track
      if (queueTracks.length > 0) {
        await playerApi.playFile(queueTracks[0].file_path);
      }
      
      // Refresh queue list to update active status
      await loadQueues(true);
    } catch (error) {
      console.error("Failed to play queue:", error);
    }
  };

  const handleDeleteQueue = async (queueId: number) => {
    if (!confirm("Are you sure you want to delete this queue?")) return;
    
    try {
      await queueApi.deleteQueue(queueId);
      if (selectedQueue?.id === queueId) {
        setSelectedQueue(null);
        setQueueTracks([]);
      }
      await loadQueues(true);
    } catch (error) {
      console.error("Failed to delete queue:", error);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Queue List Sidebar */}
      <div
        style={{
          width: "300px",
          borderRight: "1px solid #333",
          padding: "20px",
          overflowY: "auto",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: "20px" }}>Queues</h2>
        
        {queues.length === 0 ? (
          <div style={{ color: "#888", fontSize: "14px", textAlign: "center", padding: "20px" }}>
            No queues yet.
            <br />
            Click any track to create a queue.
          </div>
        ) : (
          <div>
            {queues.map((queue) => (
              <div
                key={queue.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px",
                  marginBottom: "8px",
                  backgroundColor:
                    selectedQueue?.id === queue.id ? "#444" : "#2a2a2a",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
                onClick={() => handleSelectQueue(queue)}
              >
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      border: `2px solid ${queue.is_active ? "#1db954" : "#666"}`,
                      backgroundColor: queue.is_active ? "#1db954" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {queue.is_active && (
                      <div
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          backgroundColor: "white",
                        }}
                      />
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: "500", marginBottom: "2px" }}>
                      {queue.name}
                    </div>
                    {queue.is_active && (
                      <div style={{ fontSize: "11px", color: "#1db954" }}>
                        ▶ Playing
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteQueue(queue.id);
                  }}
                  style={{
                    width: "32px",
                    height: "32px",
                    backgroundColor: "transparent",
                    border: "none",
                    borderRadius: "4px",
                    color: "#888",
                    cursor: "pointer",
                    fontSize: "20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#444";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "#888";
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Queue Tracks */}
      <div style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column" }}>
        {selectedQueue ? (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h2 style={{ margin: 0 }}>
                {selectedQueue.name}
              </h2>
              <button
                onClick={handlePlayQueue}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "#1db954",
                  border: "none",
                  borderRadius: "20px",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1ed760")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#1db954")}
              >
                ▶ Play Queue
              </button>
            </div>
            <SearchBar
              placeholder="Search in this list..."
              value={trackSearchQuery}
              onChange={setTrackSearchQuery}
            />
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
                Loading tracks...
              </div>
            ) : queueTracks.length > 0 ? (
              <div style={{ flex: 1, overflow: "hidden" }}>
                <VirtualTrackList
                  tracks={filteredTracks}
                  contextType="queue"
                  queueId={selectedQueue.id}
                  showPlayingIndicator={true}
                  onQueueActivated={() => loadQueues(true)}
                />
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
                No tracks in this queue.
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
            Select a queue to view tracks
          </div>
        )}
      </div>
    </div>
  );
}
