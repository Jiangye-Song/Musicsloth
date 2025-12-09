use rusqlite::{params, OptionalExtension};
use crate::db::models::{Track, Album, Artist, Playlist};
use crate::db::connection::DatabaseConnection;

/// Database operations for library management
pub struct DbOperations;

impl DbOperations {
    /// Insert or get artist ID
    pub fn insert_or_get_artist(
        db: &DatabaseConnection,
        name: &str,
    ) -> Result<i64, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Check if artist exists
        let mut stmt = conn.prepare("SELECT id FROM artists WHERE name = ?1")?;
        let mut rows = stmt.query(params![name])?;
        
        if let Some(row) = rows.next()? {
            return Ok(row.get(0)?);
        }
        
        // Insert new artist
        conn.execute(
            "INSERT INTO artists (name) VALUES (?1)",
            params![name],
        )?;
        
        Ok(conn.last_insert_rowid())
    }
    
    /// Insert or get album ID
    pub fn insert_or_get_album(
        db: &DatabaseConnection,
        title: &str,
        artist_name: Option<&str>,
        year: Option<u32>,
    ) -> Result<i64, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Check if album exists
        let mut stmt = conn.prepare(
            "SELECT id FROM albums WHERE name = ?1 AND artist IS ?2"
        )?;
        let mut rows = stmt.query(params![title, artist_name])?;
        
        if let Some(row) = rows.next()? {
            return Ok(row.get(0)?);
        }
        
        // Insert new album
        let year_i32 = year.map(|y| y as i32);
        conn.execute(
            "INSERT INTO albums (name, artist, year) VALUES (?1, ?2, ?3)",
            params![title, artist_name, year_i32],
        )?;
        
        Ok(conn.last_insert_rowid())
    }
    
    /// Insert or get genre ID
    pub fn insert_or_get_genre(
        db: &DatabaseConnection,
        name: &str,
    ) -> Result<i64, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Check if genre exists
        let mut stmt = conn.prepare("SELECT id FROM genres WHERE name = ?1")?;
        let mut rows = stmt.query(params![name])?;
        
        if let Some(row) = rows.next()? {
            return Ok(row.get(0)?);
        }
        
        // Insert new genre
        conn.execute(
            "INSERT INTO genres (name) VALUES (?1)",
            params![name],
        )?;
        
        Ok(conn.last_insert_rowid())
    }
    
    /// Link a track with multiple artists
    pub fn link_track_artists(
        db: &DatabaseConnection,
        track_id: i64,
        artist_names: &[String],
    ) -> Result<(), anyhow::Error> {
        if artist_names.is_empty() {
            return Ok(());
        }
        
        for artist_name in artist_names {
            // Get or create artist
            let artist_id = Self::insert_or_get_artist(db, artist_name)?;
            
            // Link track to artist
            let conn = db.get_connection();
            let conn = conn.lock().unwrap();
            conn.execute(
                "INSERT OR IGNORE INTO track_artists (track_id, artist_id) VALUES (?1, ?2)",
                params![track_id, artist_id],
            )?;
        }
        
        Ok(())
    }
    
    /// Link a track with multiple genres
    pub fn link_track_genres(
        db: &DatabaseConnection,
        track_id: i64,
        genre_names: &[String],
    ) -> Result<(), anyhow::Error> {
        if genre_names.is_empty() {
            return Ok(());
        }
        
        for genre_name in genre_names {
            // Get or create genre
            let genre_id = Self::insert_or_get_genre(db, genre_name)?;
            
            // Link track to genre
            let conn = db.get_connection();
            let conn = conn.lock().unwrap();
            conn.execute(
                "INSERT OR IGNORE INTO track_genres (track_id, genre_id) VALUES (?1, ?2)",
                params![track_id, genre_id],
            )?;
        }
        
        Ok(())
    }
    
    /// Insert a track (using the Track model)
    pub fn insert_track(
        db: &DatabaseConnection,
        track: &Track,
    ) -> Result<i64, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        conn.execute(
            "INSERT OR IGNORE INTO tracks (
                file_path, title, artist, album, album_artist, year,
                track_number, disc_number, duration_ms, genre,
                file_size, file_format, bitrate, sample_rate,
                play_count, last_played, date_added, date_modified
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                track.file_path,
                track.title,
                track.artist,
                track.album,
                track.album_artist,
                track.year.map(|y| y as i32),
                track.track_number,
                track.disc_number,
                track.duration_ms,
                track.genre,
                track.file_size,
                track.file_format,
                track.bitrate,
                track.sample_rate,
                track.play_count,
                track.last_played,
                track.date_added,
                track.date_modified,
            ],
        )?;
        
        Ok(conn.last_insert_rowid())
    }
    
    /// Get all tracks
    pub fn get_all_tracks(
        db: &DatabaseConnection,
    ) -> Result<Vec<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, file_path, title, artist, album, album_artist, year,
                    track_number, disc_number, duration_ms, genre,
                    file_size, file_format, bitrate, sample_rate,
                    play_count, last_played, date_added, date_modified, file_hash
             FROM tracks
             ORDER BY date_added DESC"
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get::<_, Option<i32>>(6)?.map(|y| y as u32),
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                play_count: row.get(15)?,
                last_played: row.get(16)?,
                date_added: row.get(17)?,
                date_modified: row.get(18)?,
                file_hash: row.get(19)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }
    
    /// Get tracks by artist (using junction table)
    pub fn get_tracks_by_artist(
        db: &DatabaseConnection,
        artist_id: i64,
    ) -> Result<Vec<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT t.id, t.file_path, t.title, t.artist, t.album, t.album_artist, t.year,
                    t.track_number, t.disc_number, t.duration_ms, t.genre,
                    t.file_size, t.file_format, t.bitrate, t.sample_rate,
                    t.play_count, t.last_played, t.date_added, t.date_modified, t.file_hash
             FROM tracks t
             INNER JOIN track_artists ta ON ta.track_id = t.id
             WHERE ta.artist_id = ?1
             ORDER BY t.album, t.track_number"
        )?;
        
        let tracks = stmt.query_map([artist_id], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get::<_, Option<i32>>(6)?.map(|y| y as u32),
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                play_count: row.get(15)?,
                last_played: row.get(16)?,
                date_added: row.get(17)?,
                date_modified: row.get(18)?,
                file_hash: row.get(19)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }
    
    /// Get tracks by genre (using junction table)
    pub fn get_tracks_by_genre(
        db: &DatabaseConnection,
        genre_id: i64,
    ) -> Result<Vec<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT t.id, t.file_path, t.title, t.artist, t.album, t.album_artist, t.year,
                    t.track_number, t.disc_number, t.duration_ms, t.genre,
                    t.file_size, t.file_format, t.bitrate, t.sample_rate,
                    t.play_count, t.last_played, t.date_added, t.date_modified, t.file_hash
             FROM tracks t
             INNER JOIN track_genres tg ON tg.track_id = t.id
             WHERE tg.genre_id = ?1
             ORDER BY t.artist, t.album, t.track_number"
        )?;
        
        let tracks = stmt.query_map([genre_id], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get::<_, Option<i32>>(6)?.map(|y| y as u32),
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                play_count: row.get(15)?,
                last_played: row.get(16)?,
                date_added: row.get(17)?,
                date_modified: row.get(18)?,
                file_hash: row.get(19)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }
    
    /// Get tracks by album
    pub fn get_tracks_by_album(
        db: &DatabaseConnection,
        album_name: &str,
    ) -> Result<Vec<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, file_path, title, artist, album, album_artist, year,
                    track_number, disc_number, duration_ms, genre,
                    file_size, file_format, bitrate, sample_rate,
                    play_count, last_played, date_added, date_modified, file_hash
             FROM tracks
             WHERE album = ?1
             ORDER BY disc_number, track_number"
        )?;
        
        let tracks = stmt.query_map([album_name], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get::<_, Option<i32>>(6)?.map(|y| y as u32),
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                play_count: row.get(15)?,
                last_played: row.get(16)?,
                date_added: row.get(17)?,
                date_modified: row.get(18)?,
                file_hash: row.get(19)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }

    /// Get track by file path
    pub fn get_track_by_file_path(
        db: &DatabaseConnection,
        file_path: &str,
    ) -> Result<Option<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, file_path, title, artist, album, album_artist, year,
                    track_number, disc_number, duration_ms, genre,
                    file_size, file_format, bitrate, sample_rate,
                    play_count, last_played, date_added, date_modified, file_hash
             FROM tracks
             WHERE file_path = ?1"
        )?;
        
        let mut rows = stmt.query([file_path])?;
        
        if let Some(row) = rows.next()? {
            Ok(Some(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get::<_, Option<i32>>(6)?.map(|y| y as u32),
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                play_count: row.get(15)?,
                last_played: row.get(16)?,
                date_added: row.get(17)?,
                date_modified: row.get(18)?,
                file_hash: row.get(19)?,
            }))
        } else {
            Ok(None)
        }
    }
    
    /// Get all albums with song counts
    pub fn get_all_albums(
        db: &DatabaseConnection,
    ) -> Result<Vec<Album>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT t.album, 
                    COALESCE(t.album_artist, t.artist) as artist,
                    MIN(t.year) as year,
                    COUNT(DISTINCT t.id) as song_count
             FROM tracks t
             WHERE t.album IS NOT NULL
             GROUP BY t.album
             ORDER BY t.album"
        )?;
        
        let mut albums = Vec::new();
        let mut id = 1;
        
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<i32>>(2)?,
                row.get::<_, i32>(3)?,
            ))
        })?;
        
        for row in rows {
            let (name, artist, year, song_count) = row?;
            albums.push(Album {
                id,
                name,
                artist,
                year,
                song_count,
            });
            id += 1;
        }
        
        Ok(albums)
    }
    
    /// Get all artists with song counts
    pub fn get_all_artists(
        db: &DatabaseConnection,
    ) -> Result<Vec<Artist>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT ar.id, ar.name, COUNT(DISTINCT ta.track_id) as song_count
             FROM artists ar
             LEFT JOIN track_artists ta ON ta.artist_id = ar.id
             GROUP BY ar.id, ar.name
             ORDER BY ar.name"
        )?;
        
        let artists = stmt.query_map([], |row| {
            Ok(Artist {
                id: row.get(0)?,
                name: row.get(1)?,
                song_count: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(artists)
    }
    
    /// Get all genres with song counts
    pub fn get_all_genres(
        db: &DatabaseConnection,
    ) -> Result<Vec<crate::db::models::Genre>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT g.id, g.name, COUNT(DISTINCT tg.track_id) as song_count
             FROM genres g
             LEFT JOIN track_genres tg ON tg.genre_id = g.id
             GROUP BY g.id, g.name
             ORDER BY g.name"
        )?;
        
        let genres = stmt.query_map([], |row| {
            Ok(crate::db::models::Genre {
                id: row.get(0)?,
                name: row.get(1)?,
                song_count: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(genres)
    }
    
    /// Delete all tracks (for testing/reset)
    pub fn clear_library(db: &DatabaseConnection) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Delete junction tables first (foreign key constraints)
        conn.execute("DELETE FROM track_artists", [])?;
        conn.execute("DELETE FROM track_genres", [])?;
        
        // Delete main tables
        conn.execute("DELETE FROM tracks", [])?;
        conn.execute("DELETE FROM albums", [])?;
        conn.execute("DELETE FROM artists", [])?;
        conn.execute("DELETE FROM genres", [])?;
        
        Ok(())
    }

    /// Create a new queue
    pub fn create_queue(
        db: &DatabaseConnection,
        name: &str,
    ) -> Result<i64, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Deactivate all queues
        conn.execute("UPDATE queues SET is_active = 0", [])?;
        
        // Get current timestamp
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs() as i64;
        
        // Create new queue with shuffle_seed = 1 (sequential by default)
        conn.execute(
            "INSERT INTO queues (name, is_active, current_track_index, date_created, date_modified, shuffle_seed) VALUES (?1, 1, 0, ?2, ?3, 1)",
            params![name, now, now],
        )?;
        
        Ok(conn.last_insert_rowid())
    }

    /// Update queue track hash after all tracks are added
    pub fn update_queue_track_hash(
        db: &DatabaseConnection,
        queue_id: i64,
        track_ids: &[i64],
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let hash = Self::calculate_track_hash(track_ids);
        
        conn.execute(
            "UPDATE queues SET track_hash = ?1 WHERE id = ?2",
            params![hash, queue_id],
        )?;
        
        Ok(())
    }

    /// Add tracks to queue
    pub fn add_tracks_to_queue(
        db: &DatabaseConnection,
        queue_id: i64,
        track_ids: &[i64],
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let mut conn = conn.lock().unwrap();
        
        // Use a transaction for batch inserts - much faster and safer
        let tx = conn.transaction()?;
        
        // Insert in batches to avoid stack overflow with huge track lists
        const BATCH_SIZE: usize = 500;
        for chunk in track_ids.chunks(BATCH_SIZE) {
            for (_index_in_chunk, track_id) in chunk.iter().enumerate() {
                let global_index = track_ids.iter().position(|&id| id == *track_id).unwrap_or(0);
                tx.execute(
                    "INSERT INTO queue_tracks (queue_id, track_id, position) VALUES (?1, ?2, ?3)",
                    params![queue_id, track_id, global_index as i32],
                )?;
            }
        }
        
        tx.commit()?;
        Ok(())
    }

    /// Add tracks to queue at specific starting position (for chunked loading)
    pub fn add_tracks_to_queue_at_position(
        db: &DatabaseConnection,
        queue_id: i64,
        track_ids: &[i64],
        start_position: usize,
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let mut conn = conn.lock().unwrap();
        
        // Use a transaction for batch inserts
        let tx = conn.transaction()?;
        
        for (index, track_id) in track_ids.iter().enumerate() {
            tx.execute(
                "INSERT INTO queue_tracks (queue_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![queue_id, track_id, (start_position + index) as i32],
            )?;
        }
        
        tx.commit()?;
        Ok(())
    }

    /// Get all queues
    pub fn get_all_queues(
        db: &DatabaseConnection,
    ) -> Result<Vec<crate::db::models::Queue>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, name, is_active, track_hash, shuffle_seed FROM queues ORDER BY id DESC"
        )?;
        
        let queues = stmt.query_map([], |row| {
            Ok(crate::db::models::Queue {
                id: row.get(0)?,
                name: row.get(1)?,
                is_active: row.get(2)?,
                track_hash: row.get(3)?,
                shuffle_seed: row.get::<_, Option<i64>>(4)?.unwrap_or(1),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(queues)
    }

    /// Get tracks in a queue (optimized: only fetch columns needed for UI)
    pub fn get_queue_tracks(
        db: &DatabaseConnection,
        queue_id: i64,
    ) -> Result<Vec<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT t.id, t.file_path, t.title, t.artist, t.album, t.album_artist,
                    t.year, t.track_number, t.disc_number, t.duration_ms, t.genre,
                    t.file_size, t.file_format, t.bitrate, t.sample_rate,
                    t.date_added, t.date_modified, t.play_count, t.last_played, t.file_hash
             FROM tracks t
             INNER JOIN queue_tracks qt ON qt.track_id = t.id
             WHERE qt.queue_id = ?1
             ORDER BY qt.position"
        )?;
        
        let tracks = stmt.query_map([queue_id], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                date_added: row.get(15)?,
                date_modified: row.get(16)?,
                play_count: row.get(17)?,
                last_played: row.get(18)?,
                file_hash: row.get(19)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }

    /// Calculate SHA-256 hash of sorted track IDs
    fn calculate_track_hash(track_ids: &[i64]) -> String {
        use sha2::{Sha256, Digest};
        
        let mut sorted = track_ids.to_vec();
        sorted.sort();
        
        let mut hasher = Sha256::new();
        for id in sorted {
            hasher.update(id.to_le_bytes());
        }
        
        format!("{:x}", hasher.finalize())
    }

    /// Find queue with same tracks (ignoring order) using hash comparison
    pub fn find_queue_with_tracks(
        db: &DatabaseConnection,
        track_ids: &[i64],
    ) -> Result<Option<i64>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Calculate hash of input track IDs
        let hash = Self::calculate_track_hash(track_ids);
        
        // Look up queue by hash (instant with index)
        let mut stmt = conn.prepare("SELECT id FROM queues WHERE track_hash = ?1")?;
        let mut rows = stmt.query([&hash])?;
        
        if let Some(row) = rows.next()? {
            return Ok(Some(row.get(0)?));
        }
        
        Ok(None)
    }

    /// Set active queue
    pub fn set_active_queue(
        db: &DatabaseConnection,
        queue_id: i64,
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Deactivate all queues
        conn.execute("UPDATE queues SET is_active = 0", [])?;
        
        // Activate specified queue
        conn.execute("UPDATE queues SET is_active = 1 WHERE id = ?1", params![queue_id])?;
        
        Ok(())
    }

    /// Get active queue
    pub fn get_active_queue(
        db: &DatabaseConnection,
    ) -> Result<Option<crate::db::models::Queue>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, name, is_active, track_hash, shuffle_seed FROM queues WHERE is_active = 1 LIMIT 1"
        )?;
        
        let mut rows = stmt.query([])?;
        
        if let Some(row) = rows.next()? {
            Ok(Some(crate::db::models::Queue {
                id: row.get(0)?,
                name: row.get(1)?,
                is_active: row.get(2)?,
                track_hash: row.get(3)?,
                shuffle_seed: row.get::<_, Option<i64>>(4)?.unwrap_or(1),
            }))
        } else {
            Ok(None)
        }
    }

    /// Delete a queue
    pub fn delete_queue(
        db: &DatabaseConnection,
        queue_id: i64,
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        conn.execute("DELETE FROM queue_tracks WHERE queue_id = ?1", params![queue_id])?;
        conn.execute("DELETE FROM queues WHERE id = ?1", params![queue_id])?;
        
        Ok(())
    }

    /// Update current track index in queue
    pub fn update_queue_current_index(
        db: &DatabaseConnection,
        queue_id: i64,
        track_index: i32,
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        conn.execute(
            "UPDATE queues SET current_track_index = ?1 WHERE id = ?2",
            params![track_index, queue_id],
        )?;
        
        Ok(())
    }

    /// Get current track index from queue
    pub fn get_queue_current_index(
        db: &DatabaseConnection,
        queue_id: i64,
    ) -> Result<i32, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let index: i32 = conn.query_row(
            "SELECT current_track_index FROM queues WHERE id = ?1",
            params![queue_id],
            |row| row.get(0)
        )?;
        
        Ok(index)
    }

    /// Get the next available queue (by ID order) excluding the given queue
    pub fn get_next_queue(
        db: &DatabaseConnection,
        excluded_queue_id: i64,
    ) -> Result<Option<crate::db::models::Queue>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, name, is_active, track_hash, shuffle_seed
             FROM queues
             WHERE id != ?1
             ORDER BY id DESC
             LIMIT 1"
        )?;
        
        let queue = stmt.query_row([excluded_queue_id], |row| {
            Ok(crate::db::models::Queue {
                id: row.get(0)?,
                name: row.get(1)?,
                is_active: row.get(2)?,
                track_hash: row.get(3)?,
                shuffle_seed: row.get::<_, Option<i64>>(4)?.unwrap_or(1),
            })
        }).optional()?;
        
        Ok(queue)
    }

    /// Get track at specific position in queue
    pub fn get_queue_track_at_position(
        db: &DatabaseConnection,
        queue_id: i64,
        position: i32,
    ) -> Result<Option<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT t.id, t.file_path, t.title, t.artist, t.album, t.album_artist,
                    t.year, t.track_number, t.disc_number, t.duration_ms, t.genre,
                    t.file_size, t.file_format, t.bitrate, t.sample_rate,
                    t.date_added, t.date_modified, t.play_count, t.last_played, t.file_hash
             FROM tracks t
             INNER JOIN queue_tracks qt ON qt.track_id = t.id
             WHERE qt.queue_id = ?1 AND qt.position = ?2"
        )?;
        
        let track = stmt.query_row(params![queue_id, position], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                date_added: row.get(15)?,
                date_modified: row.get(16)?,
                play_count: row.get(17)?,
                last_played: row.get(18)?,
                file_hash: row.get(19)?,
            })
        }).optional()?;
        
        Ok(track)
    }

    /// Get track at a shuffled position in the queue
    /// This applies the shuffle algorithm to map the shuffled position to the original position
    /// The shuffle pattern is anchored at the anchor_position (typically the currently playing track)
    pub fn get_queue_track_at_shuffled_position(
        db: &DatabaseConnection,
        queue_id: i64,
        shuffled_position: i32,
        shuffle_seed: i64,
        anchor_position: i32,
    ) -> Result<Option<Track>, anyhow::Error> {
        // If seed is 1 (sequential), just use the regular position
        if shuffle_seed == 1 {
            return Self::get_queue_track_at_position(db, queue_id, shuffled_position);
        }

        // Get the queue length
        let queue_length = Self::get_queue_length(db, queue_id)?;
        
        if queue_length == 0 {
            return Ok(None);
        }

        // If this is the anchor position, return the track at anchor position
        if shuffled_position == anchor_position {
            return Self::get_queue_track_at_position(db, queue_id, anchor_position);
        }

        // Generate the shuffled order starting from anchor position
        let step = (shuffle_seed.abs() % queue_length as i64) as i32;
        let step = if step == 0 { 1 } else { step };
        
        let mut current_pos = anchor_position; // Start from anchor
        let mut used = std::collections::HashSet::new();
        used.insert(anchor_position); // Anchor is always at its own position
        
        // Generate shuffled order until we reach the desired shuffled position
        for i in 0..queue_length {
            // If we're at the anchor position in the shuffled order, skip it
            if i == anchor_position {
                continue;
            }
            
            // Find next unused position using step pattern
            current_pos = (current_pos + step) % queue_length;
            while used.contains(&current_pos) {
                current_pos = (current_pos + 1) % queue_length;
            }
            
            // Check if this is the shuffled position we're looking for
            if i == shuffled_position {
                // current_pos is the original position for this shuffled position
                return Self::get_queue_track_at_position(db, queue_id, current_pos);
            }
            
            used.insert(current_pos);
        }
        
        // Shouldn't reach here, but return None as fallback
        Ok(None)
    }

    // ===== System Playlists =====

    /// Get tracks sorted by recently added
    pub fn get_recent_tracks(
        db: &DatabaseConnection,
    ) -> Result<Vec<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, file_path, title, artist, album, album_artist,
                    year, track_number, disc_number, duration_ms, genre,
                    file_size, file_format, bitrate, sample_rate,
                    date_added, date_modified, play_count, last_played, file_hash
             FROM tracks
             ORDER BY date_added DESC"
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                date_added: row.get(15)?,
                date_modified: row.get(16)?,
                play_count: row.get(17)?,
                last_played: row.get(18)?,
                file_hash: row.get(19)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }

    /// Get tracks sorted by most played
    pub fn get_most_played_tracks(
        db: &DatabaseConnection,
    ) -> Result<Vec<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, file_path, title, artist, album, album_artist,
                    year, track_number, disc_number, duration_ms, genre,
                    file_size, file_format, bitrate, sample_rate,
                    date_added, date_modified, play_count, last_played, file_hash
             FROM tracks
             WHERE play_count > 0
             ORDER BY play_count DESC, last_played DESC"
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                date_added: row.get(15)?,
                date_modified: row.get(16)?,
                play_count: row.get(17)?,
                last_played: row.get(18)?,
                file_hash: row.get(19)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }

    /// Get tracks that have never been played
    pub fn get_unplayed_tracks(
        db: &DatabaseConnection,
    ) -> Result<Vec<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, file_path, title, artist, album, album_artist,
                    year, track_number, disc_number, duration_ms, genre,
                    file_size, file_format, bitrate, sample_rate,
                    date_added, date_modified, play_count, last_played, file_hash
             FROM tracks
             WHERE play_count = 0
             ORDER BY date_added DESC"
        )?;
        
        let tracks = stmt.query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                date_added: row.get(15)?,
                date_modified: row.get(16)?,
                play_count: row.get(17)?,
                last_played: row.get(18)?,
                file_hash: row.get(19)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }

    /// Get the number of tracks in a queue
    pub fn get_queue_length(
        db: &DatabaseConnection,
        queue_id: i64,
    ) -> Result<i32, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT COUNT(*) FROM queue_tracks WHERE queue_id = ?1"
        )?;
        
        let count: i32 = stmt.query_row([queue_id], |row| row.get(0))?;
        
        Ok(count)
    }

    /// Toggle shuffle for a queue
    /// If shuffle_seed is 1 (sequential), generate a random seed and enable shuffle
    /// If shuffle_seed is not 1, set it to 1 and disable shuffle
    pub fn toggle_queue_shuffle(
        db: &DatabaseConnection,
        queue_id: i64,
    ) -> Result<i64, anyhow::Error> {
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Get current shuffle_seed (default to 1 if NULL)
        let current_seed: Option<i64> = conn.query_row(
            "SELECT shuffle_seed FROM queues WHERE id = ?1",
            [queue_id],
            |row| row.get(0)
        )?;
        
        let current_seed = current_seed.unwrap_or(1);
        
        let new_seed = if current_seed == 1 {
            // Enable shuffle - generate random seed (ensure it's not 1)
            let mut seed = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64;
            if seed == 1 {
                seed = 2; // Avoid seed of 1
            }
            seed
        } else {
            // Disable shuffle - set to 1 (sequential)
            1
        };
        
        // Update the queue
        conn.execute(
            "UPDATE queues SET shuffle_seed = ?1 WHERE id = ?2",
            rusqlite::params![new_seed, queue_id]
        )?;
        
        Ok(new_seed)
    }

    /// Set shuffle seed for a queue directly
    /// Used when creating a new queue that should inherit shuffle state from previous queue
    pub fn set_queue_shuffle_seed(
        db: &DatabaseConnection,
        queue_id: i64,
        shuffle_seed: i64,
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        conn.execute(
            "UPDATE queues SET shuffle_seed = ?1 WHERE id = ?2",
            rusqlite::params![shuffle_seed, queue_id]
        )?;
        
        Ok(())
    }

    /// Get the shuffle seed for a queue
    pub fn get_queue_shuffle_seed(
        db: &DatabaseConnection,
        queue_id: i64,
    ) -> Result<i64, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let seed: Option<i64> = conn.query_row(
            "SELECT shuffle_seed FROM queues WHERE id = ?1",
            [queue_id],
            |row| row.get(0)
        )?;
        
        Ok(seed.unwrap_or(1))
    }

    /// Set shuffle anchor for a queue
    /// The anchor is the original position of the track that was playing when shuffle was activated
    pub fn set_queue_shuffle_anchor(
        db: &DatabaseConnection,
        queue_id: i64,
        shuffle_anchor: i64,
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        conn.execute(
            "UPDATE queues SET shuffle_anchor = ?1 WHERE id = ?2",
            rusqlite::params![shuffle_anchor, queue_id]
        )?;
        
        Ok(())
    }

    /// Get the shuffle anchor for a queue
    pub fn get_queue_shuffle_anchor(
        db: &DatabaseConnection,
        queue_id: i64,
    ) -> Result<i64, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let anchor: Option<i64> = conn.query_row(
            "SELECT shuffle_anchor FROM queues WHERE id = ?1",
            [queue_id],
            |row| row.get(0)
        )?;
        
        Ok(anchor.unwrap_or(0))
    }

    /// Calculate shuffled index using seed-based algorithm
    /// Given current index, seed, and queue length, calculate next/previous index
    pub fn calculate_shuffled_index(
        current_index: i32,
        seed: i64,
        queue_length: i32,
        direction: i32, // 1 for next, -1 for previous
    ) -> i32 {
        if queue_length <= 1 {
            return 0;
        }
        
        // Use seed modulo queue_length as the step size
        let step = (seed.abs() % queue_length as i64) as i32;
        let step = if step == 0 { 1 } else { step }; // Ensure step is at least 1
        
        let next_index = if direction > 0 {
            (current_index + step) % queue_length
        } else {
            (current_index - step + queue_length) % queue_length
        };
        
        next_index
    }

    /// Find what position an original track index ends up at after shuffling
    /// This is needed when toggling shuffle to maintain the current track position
    /// The shuffle pattern is anchored at the anchor_position (typically the currently playing track)
    pub fn find_shuffled_position(
        original_index: i32,
        seed: i64,
        queue_length: i32,
        anchor_position: i32,
    ) -> Result<i32, Box<dyn std::error::Error>> {
        if queue_length <= 1 {
            return Ok(0);
        }
        
        if seed == 1 {
            // No shuffle, position stays the same
            return Ok(original_index);
        }
        
        // If this is the anchor position, it stays in place
        if original_index == anchor_position {
            return Ok(anchor_position);
        }
        
        // Generate the same shuffled order starting from anchor position
        let step = (seed.abs() % queue_length as i64) as i32;
        let step = if step == 0 { 1 } else { step };
        
        let mut current_pos = anchor_position; // Start from anchor
        let mut used = std::collections::HashSet::new();
        used.insert(anchor_position); // Anchor is always at its own position
        
        // Generate shuffled order until we find the original index
        for i in 0..queue_length {
            // Skip the anchor position in the iteration
            if i == anchor_position {
                continue;
            }
            
            // Find next unused position using step pattern
            current_pos = (current_pos + step) % queue_length;
            while used.contains(&current_pos) {
                current_pos = (current_pos + 1) % queue_length;
            }
            
            // Check if this is the position we're looking for
            if current_pos == original_index {
                return Ok(i);
            }
            
            used.insert(current_pos);
        }
        
        // Shouldn't reach here, but return original index as fallback
        Ok(original_index)
    }

    // ===== Scan Path Management =====
    
    /// Add a scan path to the database
    pub fn add_scan_path(
        db: &DatabaseConnection,
        path: &str,
    ) -> Result<i64, anyhow::Error> {
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() as i64;
        
        conn.execute(
            "INSERT INTO scan_paths (path, date_added) VALUES (?1, ?2)",
            params![path, now],
        )?;
        
        Ok(conn.last_insert_rowid())
    }
    
    /// Get all scan paths
    pub fn get_all_scan_paths(
        db: &DatabaseConnection,
    ) -> Result<Vec<crate::db::models::ScanPath>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, path, date_added, last_scanned FROM scan_paths ORDER BY path"
        )?;
        
        let paths = stmt.query_map([], |row| {
            Ok(crate::db::models::ScanPath {
                id: row.get(0)?,
                path: row.get(1)?,
                date_added: row.get(2)?,
                last_scanned: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(paths)
    }
    
    /// Remove a scan path from the database
    pub fn remove_scan_path(
        db: &DatabaseConnection,
        path_id: i64,
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        conn.execute("DELETE FROM scan_paths WHERE id = ?1", params![path_id])?;
        Ok(())
    }
    
    /// Check if a path is a subdirectory of any existing scan path
    pub fn is_subdirectory_of_existing_path(
        db: &DatabaseConnection,
        new_path: &str,
    ) -> Result<bool, anyhow::Error> {
        use std::path::Path;
        
        let existing_paths = Self::get_all_scan_paths(db)?;
        let new_path_buf = Path::new(new_path).canonicalize()
            .unwrap_or_else(|_| Path::new(new_path).to_path_buf());
        
        for existing in existing_paths {
            let existing_path_buf = Path::new(&existing.path).canonicalize()
                .unwrap_or_else(|_| Path::new(&existing.path).to_path_buf());
            
            // Check if new_path starts with existing_path
            if new_path_buf.starts_with(&existing_path_buf) && new_path_buf != existing_path_buf {
                return Ok(true);
            }
        }
        
        Ok(false)
    }
    
    /// Update the last_scanned timestamp for a scan path
    pub fn update_scan_path_last_scanned(
        db: &DatabaseConnection,
        path_id: i64,
    ) -> Result<(), anyhow::Error> {
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_secs() as i64;
        
        conn.execute(
            "UPDATE scan_paths SET last_scanned = ?1 WHERE id = ?2",
            params![now, path_id],
        )?;
        
        Ok(())
    }

    /// Remove tracks whose files no longer exist on disk
    pub fn remove_missing_files<F>(
        db: &DatabaseConnection,
        mut progress_callback: F,
    ) -> Result<usize, anyhow::Error>
    where
        F: FnMut(usize, usize),
    {
        use std::path::Path;
        
        let all_tracks = Self::get_all_tracks(db)?;
        let total = all_tracks.len();
        let mut removed_count = 0;
        
        for (index, track) in all_tracks.iter().enumerate() {
            progress_callback(index + 1, total);
            
            let track_path = Path::new(&track.file_path);
            
            // Check if file exists
            if !track_path.exists() {
                // Remove track
                let conn = db.get_connection();
                let conn = conn.lock().unwrap();
                conn.execute("DELETE FROM tracks WHERE id = ?1", params![track.id])?;
                removed_count += 1;
            }
        }
        
        Ok(removed_count)
    }

    /// Remove tracks that are not within any scan path
    pub fn remove_tracks_outside_scan_paths<F>(
        db: &DatabaseConnection,
        mut progress_callback: F,
    ) -> Result<usize, anyhow::Error>
    where
        F: FnMut(usize, usize),
    {
        use std::path::Path;
        
        let scan_paths = Self::get_all_scan_paths(db)?;
        if scan_paths.is_empty() {
            return Ok(0);
        }
        
        // Canonicalize all scan paths
        let canonical_scan_paths: Vec<_> = scan_paths
            .iter()
            .filter_map(|sp| Path::new(&sp.path).canonicalize().ok())
            .collect();
        
        let all_tracks = Self::get_all_tracks(db)?;
        let total = all_tracks.len();
        let mut removed_count = 0;
        
        for (index, track) in all_tracks.iter().enumerate() {
            // Report progress
            progress_callback(index + 1, total);
            
            let track_path = Path::new(&track.file_path);
            let track_canonical = track_path.canonicalize()
                .unwrap_or_else(|_| track_path.to_path_buf());
            
            // Check if track is within any scan path
            let is_within_scan_path = canonical_scan_paths.iter().any(|scan_path| {
                track_canonical.starts_with(scan_path)
            });
            
            if !is_within_scan_path {
                // Remove track
                let conn = db.get_connection();
                let conn = conn.lock().unwrap();
                conn.execute("DELETE FROM tracks WHERE id = ?1", params![track.id])?;
                removed_count += 1;
            }
        }
        
        Ok(removed_count)
    }
    
    /// Update or insert track with hash comparison
    pub fn upsert_track_with_hash(
        db: &DatabaseConnection,
        track: &crate::db::models::Track,
        file_hash: &str,
    ) -> Result<(i64, bool), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Check if track exists
        let existing: Option<(i64, Option<String>)> = conn.query_row(
            "SELECT id, file_hash FROM tracks WHERE file_path = ?1",
            params![&track.file_path],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).optional()?;
        
        if let Some((track_id, existing_hash)) = existing {
            // Track exists - check if hash changed
            if Some(file_hash.to_string()) == existing_hash {
                // No changes, skip update
                return Ok((track_id, false));
            }
            
            // Hash changed, update track
            conn.execute(
                "UPDATE tracks SET 
                    title = ?1, artist = ?2, album = ?3, album_artist = ?4,
                    year = ?5, track_number = ?6, disc_number = ?7, duration_ms = ?8,
                    genre = ?9, file_size = ?10, file_format = ?11, bitrate = ?12,
                    sample_rate = ?13, date_modified = ?14, file_hash = ?15
                WHERE id = ?16",
                params![
                    track.title, track.artist, track.album, track.album_artist,
                    track.year, track.track_number, track.disc_number, track.duration_ms,
                    track.genre, track.file_size, track.file_format, track.bitrate,
                    track.sample_rate, track.date_modified, file_hash, track_id
                ],
            )?;
            
            Ok((track_id, true))
        } else {
            // New track, insert
            conn.execute(
                "INSERT INTO tracks (
                    file_path, title, artist, album, album_artist,
                    year, track_number, disc_number, duration_ms,
                    genre, file_size, file_format, bitrate, sample_rate,
                    date_added, date_modified, play_count, file_hash
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
                params![
                    track.file_path, track.title, track.artist, track.album, track.album_artist,
                    track.year, track.track_number, track.disc_number, track.duration_ms,
                    track.genre, track.file_size, track.file_format, track.bitrate, track.sample_rate,
                    track.date_added, track.date_modified, track.play_count, file_hash
                ],
            )?;
            
            Ok((conn.last_insert_rowid(), true))
        }
    }

    // ===== User Playlists =====

    /// Get all user-created playlists
    pub fn get_all_playlists(
        db: &DatabaseConnection,
    ) -> Result<Vec<Playlist>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT id, name, description FROM playlists ORDER BY name"
        )?;
        
        let playlists = stmt.query_map([], |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(playlists)
    }

    /// Create a new playlist
    pub fn create_playlist(
        db: &DatabaseConnection,
        name: &str,
        description: Option<&str>,
    ) -> Result<i64, anyhow::Error> {
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Check if playlist with same name exists
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM playlists WHERE name = ?1",
            [name],
            |row| row.get(0)
        )?;
        
        if exists {
            return Err(anyhow::anyhow!("Playlist with this name already exists"));
        }
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        
        conn.execute(
            "INSERT INTO playlists (name, description, date_created, date_modified) VALUES (?1, ?2, ?3, ?4)",
            params![name, description, now, now],
        )?;
        
        Ok(conn.last_insert_rowid())
    }

    /// Rename a playlist
    pub fn rename_playlist(
        db: &DatabaseConnection,
        playlist_id: i64,
        new_name: &str,
    ) -> Result<(), anyhow::Error> {
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Check if another playlist with same name exists
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM playlists WHERE name = ?1 AND id != ?2",
            params![new_name, playlist_id],
            |row| row.get(0)
        )?;
        
        if exists {
            return Err(anyhow::anyhow!("Playlist with this name already exists"));
        }
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        
        let rows_affected = conn.execute(
            "UPDATE playlists SET name = ?1, date_modified = ?2 WHERE id = ?3",
            params![new_name, now, playlist_id],
        )?;
        
        if rows_affected == 0 {
            return Err(anyhow::anyhow!("Playlist not found"));
        }
        
        Ok(())
    }

    /// Add a track to a playlist
    pub fn add_track_to_playlist(
        db: &DatabaseConnection,
        playlist_id: i64,
        track_id: i64,
    ) -> Result<(), anyhow::Error> {
        use std::time::{SystemTime, UNIX_EPOCH};
        
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        // Get the next position
        let position: i32 = conn.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?1",
            [playlist_id],
            |row| row.get(0)
        )?;
        
        // Check if track already exists in playlist
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
            params![playlist_id, track_id],
            |row| row.get(0)
        )?;
        
        if exists {
            return Err(anyhow::anyhow!("Track already exists in playlist"));
        }
        
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        
        conn.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position, date_added) VALUES (?1, ?2, ?3, ?4)",
            params![playlist_id, track_id, position, now],
        )?;
        
        Ok(())
    }

    /// Get all tracks in a playlist
    pub fn get_playlist_tracks(
        db: &DatabaseConnection,
        playlist_id: i64,
    ) -> Result<Vec<Track>, anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();
        
        let mut stmt = conn.prepare(
            "SELECT t.id, t.file_path, t.title, t.artist, t.album, t.album_artist,
                    t.year, t.track_number, t.disc_number, t.duration_ms, t.genre,
                    t.file_size, t.file_format, t.bitrate, t.sample_rate,
                    t.date_added, t.date_modified, t.play_count, t.last_played, t.file_hash
             FROM tracks t
             INNER JOIN playlist_tracks pt ON t.id = pt.track_id
             WHERE pt.playlist_id = ?1
             ORDER BY pt.position"
        )?;
        
        let tracks = stmt.query_map([playlist_id], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                album_artist: row.get(5)?,
                year: row.get(6)?,
                track_number: row.get(7)?,
                disc_number: row.get(8)?,
                duration_ms: row.get(9)?,
                genre: row.get(10)?,
                file_size: row.get(11)?,
                file_format: row.get(12)?,
                bitrate: row.get(13)?,
                sample_rate: row.get(14)?,
                date_added: row.get(15)?,
                date_modified: row.get(16)?,
                play_count: row.get(17)?,
                last_played: row.get(18)?,
                file_hash: row.get(19)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tracks)
    }

    /// Append tracks to the end of a queue
    pub fn append_tracks_to_queue(
        db: &DatabaseConnection,
        queue_id: i64,
        track_ids: &[i64],
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let mut conn = conn.lock().unwrap();

        // Get current max position
        let max_position: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), -1) FROM queue_tracks WHERE queue_id = ?1",
                [queue_id],
                |row| row.get(0),
            )
            .unwrap_or(-1);

        let tx = conn.transaction()?;

        for (index, track_id) in track_ids.iter().enumerate() {
            tx.execute(
                "INSERT INTO queue_tracks (queue_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![queue_id, track_id, max_position + 1 + index as i32],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// Insert tracks after a specific position, shifting existing tracks
    pub fn insert_tracks_after_position(
        db: &DatabaseConnection,
        queue_id: i64,
        track_ids: &[i64],
        after_position: i32,
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let mut conn = conn.lock().unwrap();

        let tx = conn.transaction()?;

        // Shift existing tracks after the insertion point
        let shift_amount = track_ids.len() as i32;
        tx.execute(
            "UPDATE queue_tracks SET position = position + ?1 WHERE queue_id = ?2 AND position > ?3",
            params![shift_amount, queue_id, after_position],
        )?;

        // Insert new tracks
        for (index, track_id) in track_ids.iter().enumerate() {
            tx.execute(
                "INSERT INTO queue_tracks (queue_id, track_id, position) VALUES (?1, ?2, ?3)",
                params![queue_id, track_id, after_position + 1 + index as i32],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    /// Remove a track at a specific position from a queue
    pub fn remove_track_at_position(
        db: &DatabaseConnection,
        queue_id: i64,
        position: i32,
    ) -> Result<(), anyhow::Error> {
        let conn = db.get_connection();
        let conn = conn.lock().unwrap();

        // Delete the track at the specified position
        conn.execute(
            "DELETE FROM queue_tracks WHERE queue_id = ?1 AND position = ?2",
            params![queue_id, position],
        )?;

        // Shift all positions after the removed track down by 1
        conn.execute(
            "UPDATE queue_tracks SET position = position - 1 WHERE queue_id = ?1 AND position > ?2",
            params![queue_id, position],
        )?;

        Ok(())
    }
}
