# Musicsloth

A desktop music player inspired by Musicolet, built with Tauri and React.

## Features

- 🎵 Audio playback with queue management
- 📚 Music library with SQLite database
- 🎨 Multiple queues support
- 📝 Playlist management
- 🎤 Lyrics display (embedded & .lrc files)
- 🔍 Search functionality
- 📊 Organize by Albums, Artists, Genres

## Tech Stack

- **Backend**: Rust (Tauri)
- **Frontend**: React + TypeScript
- **Database**: SQLite
- **Audio**: rodio
- **Metadata**: lofty

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

See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for detailed architecture and development plan.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

TBD
