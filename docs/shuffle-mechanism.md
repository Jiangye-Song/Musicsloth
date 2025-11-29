# Shuffle Mechanism

This document describes how shuffle works in Musicsloth, including the algorithm, state persistence, and behavior across different scenarios.

## Overview

Musicsloth uses a **seed-based deterministic shuffle algorithm** with an **anchor position**. This ensures:
- The same shuffle order is reproducible given the same seed and anchor
- The currently playing track stays in place when shuffle is toggled on
- Shuffle state persists across app restarts and queue switches

## Database Schema

The shuffle state is stored in the `queues` table:

| Column | Type | Description |
|--------|------|-------------|
| `shuffle_seed` | INTEGER | The seed for the shuffle algorithm. `1` = sequential (not shuffled), any other value = shuffled |
| `shuffle_anchor` | INTEGER | The original position of the track that was playing when shuffle was activated |

## Shuffle Algorithm

The shuffle uses a **step-based permutation** algorithm anchored at a specific position.

### Core Algorithm

```
Given:
- seed: The shuffle seed (determines step size)
- queue_length: Total number of tracks
- anchor_position: The original position of the anchor track
- target_position: The shuffled position we want to map to original

Algorithm:
1. step = |seed| mod queue_length (or 1 if result is 0)
2. Starting from anchor_position, walk through positions using the step
3. The anchor track always maps to shuffled position equal to its original position
4. Other positions are filled by stepping through the original positions
```

### Key Properties

1. **Deterministic**: Same seed + anchor always produces the same order
2. **Anchor-preserving**: The track at the anchor position stays at the same position in the shuffled view
3. **Bijective**: Every original position maps to exactly one shuffled position and vice versa

### Example

```
Queue: [A, B, C, D, E] (positions 0-4)
Seed: 7
Anchor: 2 (track C)
Step: 7 mod 5 = 2

Original positions: 0, 1, 2, 3, 4
Shuffled mapping:   
- Position 2 (anchor) → stays at 2
- From anchor, step forward: 2→4→1→3→0
- Shuffled order: [E, D, C, A, B]
```

## State Management

### Frontend (PlayerContext)

The `PlayerContext` maintains three shuffle-related state variables:

```typescript
shuffleSeed: number     // 1 = sequential, other = shuffled
isShuffled: boolean     // Convenience flag (shuffleSeed !== 1)
shuffleAnchor: number   // Original position where shuffle was activated
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
│   (toggle)    │    │  FromQueue()  │    │    Track()    │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (queues table)                         │
│         shuffle_seed, shuffle_anchor persisted               │
└─────────────────────────────────────────────────────────────┘
```

## Behavior Scenarios

### 1. Toggling Shuffle ON

When the user enables shuffle on a queue:

1. Find the **original position** of the currently playing track
2. Generate a new random seed (ensuring it's not 1)
3. Set the anchor to the current track's original position
4. Calculate the new shuffled position for the current track
5. Persist seed and anchor to database
6. Update `currentTrackIndex` to the new shuffled position

**Result**: The same track keeps playing, but next/prev will follow shuffled order.

### 2. Toggling Shuffle OFF

When the user disables shuffle:

1. Set seed to `1` (sequential)
2. Set anchor to `0`
3. Find where the current track is in original order
4. Update `currentTrackIndex` to that original position
5. Persist to database

**Result**: The same track keeps playing, next/prev follows original order.

### 3. Switching Queues

When switching to a different queue (via play button or clicking a track):

1. Call `loadShuffleStateFromQueue(queueId)`
2. Load `shuffle_seed` and `shuffle_anchor` from database
3. Update PlayerContext state

**Result**: Shuffle button reflects the new queue's shuffle state; next/prev works correctly.

### 4. App Restart

On startup:

1. Find the active queue
2. Load `shuffle_seed` from queue data
3. Load `shuffle_anchor` from database
4. Load `current_track_index` from database
5. Fetch track at the shuffled position

**Result**: App resumes with the same shuffle state and track position.

### 5. Creating a New Queue

When creating a new queue from a track list:

1. Check if the previous active queue was shuffled
2. If shuffled, generate a **new** random seed (not the same as previous)
3. Set anchor to the clicked track's position
4. Persist seed and anchor to database

**Result**: New queue inherits "shuffled" state but with different shuffle order.

## API Reference

### Backend (Rust)

```rust
// Toggle shuffle for a queue, returns new seed
toggle_queue_shuffle(queue_id: i64) -> i64

// Get/set shuffle seed
get_queue_shuffle_seed(queue_id: i64) -> i64
set_queue_shuffle_seed(queue_id: i64, seed: i64)

// Get/set shuffle anchor
get_queue_shuffle_anchor(queue_id: i64) -> i64
set_queue_shuffle_anchor(queue_id: i64, anchor: i64)

// Get track at shuffled position
get_queue_track_at_shuffled_position(
    queue_id: i64,
    shuffled_position: i32,
    shuffle_seed: i64,
    anchor_position: i32
) -> Option<Track>

// Find shuffled position for an original index
find_shuffled_position(
    original_index: i32,
    seed: i64,
    queue_length: i32,
    anchor_position: i32
) -> i32
```

### Frontend (TypeScript)

```typescript
// queueApi
toggleQueueShuffle(queueId: number): Promise<number>
getQueueShuffleSeed(queueId: number): Promise<number>
setQueueShuffleSeed(queueId: number, seed: number): Promise<void>
getQueueShuffleAnchor(queueId: number): Promise<number>
setQueueShuffleAnchor(queueId: number, anchor: number): Promise<void>
getQueueTrackAtShuffledPosition(
    queueId: number,
    position: number,
    seed: number,
    anchor: number
): Promise<Track | null>
findShuffledPosition(
    originalIndex: number,
    seed: number,
    queueLength: number,
    anchorPosition: number
): Promise<number>

// PlayerContext
toggleShuffle(): Promise<void>
loadShuffleStateFromQueue(queueId: number): Promise<void>
setShuffleStateForNewQueue(queueId: number, inheritShuffle: boolean): Promise<void>
```

## UI Indicators

- **Shuffle Button**: Highlighted when `isShuffled === true`
- **Queue View**: Shows shuffle icon next to queue name when `shuffle_seed !== 1`
- **Track List**: Display order changes based on shuffle state (in QueuesView)

## Important Notes

1. **Seed value 1 is reserved** for sequential (non-shuffled) order
2. **Anchor is always an original position**, not a shuffled position
3. **Each queue has independent shuffle state** - switching queues loads that queue's shuffle settings
4. **New queues can inherit shuffle mode** but get a new random seed for variety
