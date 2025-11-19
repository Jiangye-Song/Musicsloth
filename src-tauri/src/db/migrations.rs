// Database migrations
use rusqlite::Connection;
use anyhow::Result;

pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    
    // Create tracks table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tracks (
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
        )",
        [],
    )?;

    // Create albums table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            artist TEXT,
            year INTEGER,
            artwork_path TEXT,
            track_count INTEGER DEFAULT 0,
            UNIQUE(name, artist)
        )",
        [],
    )?;

    // Create artists table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS artists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            album_count INTEGER DEFAULT 0,
            track_count INTEGER DEFAULT 0
        )",
        [],
    )?;

    // Create genres table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS genres (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            track_count INTEGER DEFAULT 0
        )",
        [],
    )?;

    // Create playlists table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            artwork_path TEXT,
            date_created INTEGER NOT NULL,
            date_modified INTEGER NOT NULL,
            track_count INTEGER DEFAULT 0
        )",
        [],
    )?;

    // Create playlist_tracks junction table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS playlist_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER NOT NULL,
            track_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            date_added INTEGER NOT NULL,
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
            UNIQUE(playlist_id, track_id, position)
        )",
        [],
    )?;

    // Create queues table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS queues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            is_active BOOLEAN DEFAULT 0,
            current_track_index INTEGER DEFAULT 0,
            date_created INTEGER NOT NULL,
            date_modified INTEGER NOT NULL
        )",
        [],
    )?;

    // Create queue_tracks junction table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS queue_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            queue_id INTEGER NOT NULL,
            track_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Create lyrics table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS lyrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER UNIQUE NOT NULL,
            content TEXT NOT NULL,
            is_synced BOOLEAN DEFAULT 0,
            source TEXT,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Create track_artists junction table for many-to-many relationship
    conn.execute(
        "CREATE TABLE IF NOT EXISTS track_artists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER NOT NULL,
            artist_id INTEGER NOT NULL,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
            FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE,
            UNIQUE(track_id, artist_id)
        )",
        [],
    )?;

    // Create track_genres junction table for many-to-many relationship
    conn.execute(
        "CREATE TABLE IF NOT EXISTS track_genres (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id INTEGER NOT NULL,
            genre_id INTEGER NOT NULL,
            FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
            FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE,
            UNIQUE(track_id, genre_id)
        )",
        [],
    )?;

    // Create indexes for better query performance
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_queue_tracks_queue ON queue_tracks(queue_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_track_artists_track ON track_artists(track_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_track_artists_artist ON track_artists(artist_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_track_genres_track ON track_genres(track_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_track_genres_genre ON track_genres(genre_id)",
        [],
    )?;

    Ok(())
}
