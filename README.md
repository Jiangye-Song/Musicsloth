# Musicsloth

A full-featured desktop music player inspired by Musicolet, built with Tauri 2 and React.

## Features

- 🎵 **Audio Playback** - Pure Rust decoding with Symphonia (MP3, FLAC, AAC, OGG, WAV, M4A)
- 📚 **Music Library** - SQLite-backed library with automatic metadata extraction
- 🎨 **Multiple Queues** - Create and switch between named playback queues
- 📝 **Playlists** - Full playlist management with M3U8 import/export
- 🎤 **Lyrics** - Synchronized lyrics display (embedded tags & LRC files)
- 🔍 **Search** - Real-time search across tracks, albums, artists
- 📊 **Organization** - Browse by Albums, Artists, Genres
- 🎚️ **Volume Normalization** - EBU R128 loudness analysis (ReplayGain-style)
- 🖥️ **Windows SMTC** - Native media key support and lock screen integration
- 🌙 **Theming** - Dark/light mode with customizable accent colors

## Tech Stack

- **Framework**: [Tauri 2](https://tauri.app/) (Rust backend + web frontend)
- **Frontend**: React 19 + TypeScript + Material UI
- **Database**: SQLite (rusqlite)
- **Audio Decoding**: [Symphonia](https://github.com/pdeljanov/Symphonia) (pure Rust)
- **Audio Output**: [cpal](https://github.com/RustAudio/cpal) (cross-platform)
- **Metadata**: lofty + id3
- **Loudness**: ebur128 (EBU R128 standard)

## Development

### Prerequisites

- Node.js (v18+)
- Rust (latest stable)
- npm

### Setup

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
musicsloth/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── contexts/           # React contexts (Player, Settings)
│   ├── services/           # API & audio services
│   ├── views/              # Main views (Library, Playlists, etc.)
│   └── types/              # TypeScript types
├── src-tauri/              # Rust backend
│   └── src/
│       ├── audio/          # Symphonia decoder & cpal output
│       ├── db/             # SQLite operations
│       ├── library/        # Scanner & indexer
│       ├── metadata/       # Tag extraction, artwork, lyrics
│       ├── playlist/       # Playlist management
│       ├── queue/          # Queue management
│       ├── settings/       # App settings
│       └── smtc/           # Windows media controls
└── docs/                   # Documentation
```

See [PROJECT_PLAN.md](./docs/PROJECT_PLAN.md) for detailed architecture.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

TBD
