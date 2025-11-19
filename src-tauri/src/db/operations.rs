use rusqlite::params;
use crate::db::models::{Track, Album, Artist};
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
                    play_count, last_played, date_added, date_modified
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
                    t.play_count, t.last_played, t.date_added, t.date_modified
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
                    t.play_count, t.last_played, t.date_added, t.date_modified
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
                    play_count, last_played, date_added, date_modified
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
                    play_count, last_played, date_added, date_modified
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
            "SELECT DISTINCT t.album, 
                    COALESCE(t.album_artist, t.artist) as artist,
                    t.year,
                    COUNT(DISTINCT t.id) as song_count
             FROM tracks t
             WHERE t.album IS NOT NULL
             GROUP BY t.album, COALESCE(t.album_artist, t.artist), t.year
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
}
