# Musicsloth - Desktop Music Player

## Overview
A local music player application inspired by Musicolet, built with Tauri (Rust backend + web frontend) and SQLite for library management.

## Technology Stack

### Backend
- **Rust** - Core application logic
- **Tauri** - Desktop application framework
- **SQLite** - Music library database
- **rodio** / **symphonia** - Audio playback engine
- **lofty** - Audio metadata parsing
- **rusqlite** - SQLite database interface

### Frontend
- **React** / **Vue** / **Svelte** - UI framework (TBD)
- **TypeScript** - Type-safe frontend code
- **Tailwind CSS** / **CSS Modules** - Styling
- **Tauri API** - IPC communication with Rust backend

## Core Features

### 1. Audio Playback
- [x] Play, pause, stop controls
- [x] Seek/scrub functionality
- [x] Volume control
- [x] Next/previous track
- [x] Shuffle and repeat modes
- [x] Gapless playback (optional)

### 2. Music Library
- [x] Scan local music folders
- [x] Extract metadata (ID3v2, Vorbis comments, etc.)
- [x] Display tag information (title, artist, album, year, genre, etc.)
- [x] Album artwork support
- [x] Auto-refresh on file changes (optional)

### 3. Library Organization
- [x] **Tracks** - All songs view
- [x] **Albums** - Group by album with artwork
- [x] **Artists** - Group by artist
- [x] **Genres** - Group by genre
- [x] Sorting options (name, date added, etc.)

### 4. Queue System
- [x] Current playback queue
- [x] Multiple named queues
- [x] Add tracks to queue
- [x] Reorder tracks in queue
- [x] Remove tracks from queue
- [x] Save/load queues
- [x] Queue history

### 5. Playlists
- [x] Create/delete playlists
- [x] Add/remove tracks from playlists
- [x] Reorder playlist tracks
- [x] Playlist metadata (name, description, cover)
- [x] Import/export playlists (M3U8 format)

### 6. Lyrics Display
- [x] Display embedded lyrics
- [x] Support .lrc file format
- [x] Synchronized lyrics scrolling
- [x] Time-synced highlighting
- [x] Fallback to plain text lyrics

### 7. Search
- [x] Search across all tracks
- [x] Filter by artist, album, genre
- [x] Real-time search results
- [x] Search history (optional)

### 8. UI/UX
- [x] Now Playing view
- [x] Mini player mode (optional)
- [x] Tabbed interface (Queues, Playlists, Artists, Albums, Genres)
- [x] Dark/light theme
- [x] Keyboard shortcuts
- [x] Responsive layout

## Database Schema

### Tables

#### tracks
```sql
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    album_artist TEXT,
    year INTEGER,
    track_number INTEGER,
    disc_number INTEGER,
    duration_ms INTEGER,
    genre TEXT,
    file_size INTEGER,
    file_format TEXT,
    bitrate INTEGER,
    sample_rate INTEGER,
    date_added INTEGER NOT NULL,
    date_modified INTEGER NOT NULL,
    play_count INTEGER DEFAULT 0,
    last_played INTEGER
);
```

#### albums
```sql
CREATE TABLE albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    artist TEXT,
    year INTEGER,
    artwork_path TEXT,
    track_count INTEGER DEFAULT 0,
    UNIQUE(name, artist)
);
```

#### artists
```sql
CREATE TABLE artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    album_count INTEGER DEFAULT 0,
    track_count INTEGER DEFAULT 0
);
```

#### genres
```sql
CREATE TABLE genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    track_count INTEGER DEFAULT 0
);
```

#### playlists
```sql
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    artwork_path TEXT,
    date_created INTEGER NOT NULL,
    date_modified INTEGER NOT NULL,
    track_count INTEGER DEFAULT 0
);
```

#### playlist_tracks
```sql
CREATE TABLE playlist_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    date_added INTEGER NOT NULL,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    UNIQUE(playlist_id, track_id, position)
);
```

#### queues
```sql
CREATE TABLE queues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT 0,
    current_track_index INTEGER DEFAULT 0,
    date_created INTEGER NOT NULL,
    date_modified INTEGER NOT NULL
);
```

#### queue_tracks
```sql
CREATE TABLE queue_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_id INTEGER NOT NULL,
    track_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);
```

#### lyrics
```sql
CREATE TABLE lyrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER UNIQUE NOT NULL,
    content TEXT NOT NULL,
    is_synced BOOLEAN DEFAULT 0,
    source TEXT, -- 'embedded', 'lrc_file', 'manual'
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);
```

## Project Structure

```
musicsloth/
├── src-tauri/                      # Rust backend
│   ├── src/
│   │   ├── main.rs                 # Entry point, Tauri setup
│   │   ├── commands.rs             # Tauri command handlers
│   │   ├── state.rs                # Application state management
│   │   │
│   │   ├── audio/
│   │   │   ├── mod.rs
│   │   │   ├── player.rs           # Audio playback engine
│   │   │   └── decoder.rs          # Audio format decoding
│   │   │
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs       # SQLite connection pool
│   │   │   ├── migrations.rs       # Database migrations
│   │   │   ├── models.rs           # Data models/structs
│   │   │   └── queries.rs          # SQL queries
│   │   │
│   │   ├── library/
│   │   │   ├── mod.rs
│   │   │   ├── scanner.rs          # Directory scanning
│   │   │   ├── indexer.rs          # Database indexing
│   │   │   └── watcher.rs          # File system watching (optional)
│   │   │
│   │   ├── metadata/
│   │   │   ├── mod.rs
│   │   │   ├── extractor.rs        # Tag extraction
│   │   │   ├── artwork.rs          # Album art handling
│   │   │   └── lyrics.rs           # Lyrics parsing (.lrc)
│   │   │
│   │   ├── queue/
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs          # Queue management
│   │   │   └── persistence.rs      # Queue save/load
│   │   │
│   │   └── playlist/
│   │       ├── mod.rs
│   │       ├── manager.rs          # Playlist operations
│   │       └── import_export.rs    # M3U8 import/export
│   │
│   ├── Cargo.toml
│   ├── tauri.conf.json             # Tauri configuration
│   └── build.rs
│
├── src/                             # Frontend
│   ├── main.tsx                     # Entry point
│   ├── App.tsx                      # Root component
│   │
│   ├── components/
│   │   ├── Player/
│   │   │   ├── PlayerControls.tsx  # Play/pause/seek controls
│   │   │   ├── VolumeControl.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   └── NowPlaying.tsx      # Current track display
│   │   │
│   │   ├── Library/
│   │   │   ├── TrackList.tsx       # Track listing component
│   │   │   ├── AlbumGrid.tsx       # Album grid view
│   │   │   ├── ArtistList.tsx
│   │   │   └── GenreList.tsx
│   │   │
│   │   ├── Queue/
│   │   │   ├── QueueView.tsx       # Current queue display
│   │   │   ├── QueueManager.tsx    # Multiple queues UI
│   │   │   └── QueueItem.tsx
│   │   │
│   │   ├── Playlist/
│   │   │   ├── PlaylistList.tsx
│   │   │   ├── PlaylistView.tsx
│   │   │   └── PlaylistEditor.tsx
│   │   │
│   │   ├── Lyrics/
│   │   │   └── LyricsDisplay.tsx   # Lyrics viewer
│   │   │
│   │   ├── Search/
│   │   │   ├── SearchBar.tsx
│   │   │   └── SearchResults.tsx
│   │   │
│   │   └── Common/
│   │       ├── TabBar.tsx          # Main navigation tabs
│   │       ├── Sidebar.tsx
│   │       └── ContextMenu.tsx
│   │
│   ├── views/
│   │   ├── QueuesView.tsx
│   │   ├── PlaylistsView.tsx
│   │   ├── ArtistsView.tsx
│   │   ├── AlbumsView.tsx
│   │   ├── GenresView.tsx
│   │   └── SettingsView.tsx
│   │
│   ├── services/
│   │   ├── api.ts                  # Tauri command wrappers
│   │   ├── player.ts               # Frontend player state
│   │   └── storage.ts              # Local storage utils
│   │
│   ├── store/
│   │   ├── playerStore.ts          # Player state management
│   │   ├── libraryStore.ts         # Library state
│   │   └── queueStore.ts           # Queue state
│   │
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   │
│   └── styles/
│       └── global.css
│
├── public/
│   └── assets/
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Development Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Set up project structure and basic playback

- [x] Initialize Tauri project
- [x] Set up Rust dependencies (rodio, lofty, rusqlite)
- [x] Create database schema and migrations
- [x] Implement basic audio playback (play, pause, stop)
- [x] Build simple UI with play controls
- [x] Test audio playback with sample files

**Deliverable:** Application that can play a single audio file

### Phase 2: Library Management (Week 3-4)
**Goal:** Scan and index music library

- [x] Implement directory scanner
- [x] Extract metadata from audio files
- [x] Store tracks in SQLite database
- [x] Build library indexer (albums, artists, genres)
- [x] Create UI for library browsing
- [x] Implement track listing view

**Deliverable:** Application that scans and displays music library

### Phase 3: Core Features (Week 5-6)
**Goal:** Queue system and playlists

- [x] Implement queue management
- [x] Add tracks to queue
- [x] Queue persistence
- [x] Create playlist functionality
- [x] Add/remove tracks from playlists
- [x] Build playlist UI
- [x] Integrate queue with player

**Deliverable:** Full queue and playlist functionality

### Phase 4: Advanced Features (Week 7-8)
**Goal:** Multiple queues, lyrics, search

- [x] Multiple queue support
- [x] Queue switching UI
- [x] Lyrics parsing (embedded + .lrc)
- [x] Lyrics display with sync
- [x] Search implementation
- [x] Search UI with filters

**Deliverable:** Complete feature set

### Phase 5: Polish & Optimization (Week 9-10)
**Goal:** UI/UX improvements and performance

- [x] Themes (dark/light mode)
- [x] Keyboard shortcuts
- [x] Performance optimization
- [x] Error handling and logging
- [x] Settings/preferences
- [x] Album artwork caching
- [x] Testing and bug fixes

**Deliverable:** Production-ready application

## Key Rust Crates

```toml
[dependencies]
tauri = "2.x"
rusqlite = { version = "0.x", features = ["bundled"] }
rodio = "0.x"              # Audio playback
lofty = "0.x"              # Metadata parsing
symphonia = "0.x"          # Advanced audio decoding (optional)
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
anyhow = "1.0"             # Error handling
thiserror = "1.0"
walkdir = "2"              # Directory traversal
```

## Tauri Commands (IPC Interface)

### Library Management
- `scan_library(paths: Vec<String>)` - Scan directories for music files
- `get_tracks(filter: Option<TrackFilter>)` - Get all tracks
- `get_albums()` - Get all albums
- `get_artists()` - Get all artists
- `get_genres()` - Get all genres
- `get_track_details(id: i64)` - Get detailed track info

### Playback Control
- `play_track(id: i64)` - Play specific track
- `pause()` - Pause playback
- `resume()` - Resume playback
- `stop()` - Stop playback
- `seek(position_ms: u64)` - Seek to position
- `set_volume(level: f32)` - Set volume (0.0-1.0)
- `next_track()` - Skip to next
- `previous_track()` - Go to previous

### Queue Management
- `create_queue(name: String)` - Create new queue
- `get_queues()` - Get all queues
- `get_queue_tracks(queue_id: i64)` - Get tracks in queue
- `add_to_queue(queue_id: i64, track_ids: Vec<i64>)` - Add tracks
- `remove_from_queue(queue_id: i64, position: i32)` - Remove track
- `reorder_queue(queue_id: i64, from: i32, to: i32)` - Reorder
- `switch_queue(queue_id: i64)` - Switch active queue
- `delete_queue(queue_id: i64)` - Delete queue

### Playlist Management
- `create_playlist(name: String)` - Create playlist
- `get_playlists()` - Get all playlists
- `get_playlist_tracks(playlist_id: i64)` - Get playlist tracks
- `add_to_playlist(playlist_id: i64, track_ids: Vec<i64>)`
- `remove_from_playlist(playlist_id: i64, track_id: i64)`
- `reorder_playlist(playlist_id: i64, from: i32, to: i32)`
- `delete_playlist(playlist_id: i64)`
- `import_playlist(path: String)` - Import M3U8
- `export_playlist(playlist_id: i64, path: String)` - Export M3U8

### Lyrics
- `get_lyrics(track_id: i64)` - Get lyrics for track
- `search_lrc_file(track_id: i64)` - Find .lrc file

### Search
- `search(query: String, filters: SearchFilters)` - Search library

### Settings
- `get_settings()` - Get app settings
- `update_settings(settings: Settings)` - Update settings

## Events (Backend → Frontend)

- `playback:state_changed` - Playback state update
- `playback:progress` - Playback progress (current time)
- `playback:track_changed` - Track changed
- `library:scan_progress` - Library scan progress
- `library:scan_complete` - Library scan finished
- `queue:updated` - Queue modified

## Technical Considerations

### Performance
- Use connection pooling for SQLite
- Index frequently queried columns (artist, album, genre)
- Lazy load album artwork
- Implement virtual scrolling for large lists
- Background thread for library scanning

### Error Handling
- Graceful handling of corrupted audio files
- Missing metadata fallbacks
- Database transaction rollback on errors
- User-friendly error messages

### Future Enhancements
- Equalizer
- Audio effects
- Crossfade between tracks
- Scrobbling support (Last.fm)
- Smart playlists
- Audio fingerprinting
- Cloud sync (optional)
- Plugin system

## Getting Started

### Prerequisites
- Node.js (v18+)
- Rust (latest stable)
- npm or yarn

### Setup
```bash
# Clone repository
git clone <repo-url>
cd musicsloth

# Install frontend dependencies
npm install

# Install Tauri CLI
npm install -D @tauri-apps/cli

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Testing Strategy

### Unit Tests
- Database operations
- Metadata extraction
- Queue logic
- Playlist management

### Integration Tests
- Audio playback pipeline
- Library scanning
- IPC communication

### UI Tests
- Component rendering
- User interactions
- State management

## License
TBD

## Contributors
TBD
