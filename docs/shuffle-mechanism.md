# Shuffle Mechanism

This document describes how shuffle works in Musicsloth, including the algorithm, state persistence, and behavior across different scenarios.

## Overview

Musicsloth uses **actual track reordering** with **original order backup**. This ensures:
- Shuffle visibly reorders tracks in the queue
- The currently playing track moves to position 0 when shuffle is toggled on
- Original order is preserved and can be restored when shuffle is toggled off
- Shuffle state persists across app restarts and queue switches
- Drag-and-drop reordering works correctly with shuffled queues

## Database Schema

The shuffle state is stored in the `queues` table:

| Column | Type | Description |
|--------|------|-------------|
| `shuffle_seed` | INTEGER | Shuffle flag. `1` = sequential (not shuffled), any other value = shuffled |
| `original_order` | TEXT | JSON array of track IDs representing the pre-shuffle order. `NULL` when not shuffled |

Track positions are stored in the `queue_tracks` table:

| Column | Type | Description |
|--------|------|-------------|
| `position` | INTEGER | The actual display position of the track (0-indexed) |

## Shuffle Algorithm

When shuffle is enabled, the algorithm:

1. Saves the current track order as a JSON array of track IDs to `original_order`
2. Removes the currently playing track from the list
3. Shuffles the remaining tracks using Fisher-Yates (via `rand::seq::SliceRandom`)
4. Inserts the current track at position 0
5. Updates all track positions in `queue_tracks` to reflect the new order
6. Sets `shuffle_seed` to a non-1 value and `current_track_index` to 0

### Key Properties

1. **Physical reordering**: Tracks are actually reordered in the database
2. **Current track preserved**: The playing track moves to position 0
3. **Restorable**: Original order is saved and can be fully restored
4. **Drag-drop compatible**: Users can manually reorder shuffled queues without losing the original order

### Example

```
Queue: [A, B, C, D, E] (positions 0-4)
Currently playing: C (position 2)

After shuffle:
- original_order saved: [A, B, C, D, E]
- C moves to position 0
- Remaining tracks [A, B, D, E] shuffled → [D, A, E, B]
- New order: [C, D, A, E, B] (positions 0-4)
- current_track_index = 0
```

## State Management

### Frontend (PlayerContext)

The `PlayerContext` maintains shuffle-related state:

```typescript
shuffleSeed: number     // 1 = sequential, other = shuffled
isShuffled: boolean     // Convenience flag (shuffleSeed !== 1)
```

### State Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      User Actions                            │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Toggle Shuffle│    │ Switch Queue  │    │  App Restart  │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ toggleShuffle │    │loadShuffleState│   │loadActiveQueue│
│   (backend)   │    │  FromQueue()  │    │    Track()    │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (queues + queue_tracks)                │
│    shuffle_seed, original_order, track positions persisted  │
└─────────────────────────────────────────────────────────────┘
```

## Behavior Scenarios

### 1. Toggling Shuffle ON

When the user enables shuffle on a queue:

1. Save current track order (by track ID) to `original_order`
2. Move the currently playing track to position 0
3. Shuffle all other tracks randomly
4. Update positions in `queue_tracks` table
5. Set `shuffle_seed` to a non-1 value
6. Set `current_track_index` to 0

**Result**: The same track keeps playing at position 0, tracks are visibly reordered.

### 2. Toggling Shuffle OFF

When the user disables shuffle:

1. Read `original_order` JSON array
2. Find the current track's position in the original order
3. Restore all track positions from `original_order`
4. Set `shuffle_seed` to 1
5. Clear `original_order` (set to NULL)
6. Update `current_track_index` to the restored position

**Result**: The same track keeps playing, queue returns to original order.

### 3. Adding Tracks to Shuffled Queue

When adding tracks to a queue that is shuffled:

1. Append tracks to the end of the current (shuffled) order
2. Also append track IDs to the `original_order` array

**Result**: New tracks appear at the end in both shuffled and original order.

### 4. Removing Tracks from Shuffled Queue

When removing a track from a shuffled queue:

1. Remove the track from the current order
2. Remove the first occurrence of that track ID from `original_order`

**Result**: Track is removed from both current and original order.

### 5. Drag-and-Drop Reordering

When the user manually reorders tracks in a shuffled queue:

1. Update track positions in `queue_tracks` as normal
2. **Do NOT modify `original_order`**

**Result**: User's manual changes affect only the current view; original order is preserved for restoration.

### 6. Switching Queues

When switching to a different queue:

1. Call `loadShuffleStateFromQueue(queueId)`
2. Load `shuffle_seed` from database
3. Update PlayerContext state
4. Tracks are loaded in their stored order (already shuffled or sequential)

**Result**: Shuffle button reflects the new queue's shuffle state.

### 7. App Restart

On startup:

1. Find the active queue
2. Load `shuffle_seed` from queue data
3. Load `current_track_index` from database
4. Fetch track at position (tracks are already in correct order)

**Result**: App resumes with the same shuffle state and track position.

## API Reference

### Backend (Rust)

```rust
// Toggle shuffle for a queue
// Returns (new_seed, new_current_track_index)
toggle_queue_shuffle(
    queue_id: i64,
    current_track_id: Option<i64>
) -> (i64, i32)

// Get shuffle seed
get_queue_shuffle_seed(queue_id: i64) -> i64

// Get track at position (no shuffle calculation needed)
get_queue_track_at_position(queue_id: i64, position: i32) -> Option<Track>

// Append tracks (maintains original_order if shuffled)
append_tracks_to_queue(queue_id: i64, track_ids: Vec<i64>)

// Remove track (maintains original_order if shuffled)
remove_track_at_position(queue_id: i64, position: i32)

// Reorder track (does NOT modify original_order)
reorder_queue_track(queue_id: i64, from: i32, to: i32) -> i32
```

### Frontend (TypeScript)

```typescript
// queueApi
toggleQueueShuffle(queueId: number, currentTrackId: number | null): Promise<[number, number]>
getQueueShuffleSeed(queueId: number): Promise<number>
getQueueTrackAtPosition(queueId: number, position: number): Promise<Track | null>
getQueueTracks(queueId: number): Promise<Track[]>  // Returns tracks in display order

// PlayerContext
toggleShuffle(): Promise<void>
loadShuffleStateFromQueue(queueId: number): Promise<void>
```

## UI Indicators

- **Shuffle Button**: Highlighted when `isShuffled === true` (i.e., `shuffleSeed !== 1`)
- **Queue View**: Shows shuffle icon next to queue name when shuffled
- **Track List**: Displays tracks in their actual stored order

## Important Notes

1. **Seed value 1 is reserved** for sequential (non-shuffled) order
2. **Tracks are physically reordered** in the database when shuffled
3. **Each queue has independent shuffle state** - switching queues loads that queue's settings
4. **Original order is preserved** during drag-and-drop reordering of shuffled queues
5. **No frontend shuffle calculation** - frontend just displays tracks in stored order
