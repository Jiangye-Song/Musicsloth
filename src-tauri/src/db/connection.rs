// Database connection management
use rusqlite::Connection;
use std::sync::{Arc, Mutex};
use anyhow::Result;
use std::path::PathBuf;

use super::migrations::run_migrations;

pub struct DatabaseConnection {
    conn: Arc<Mutex<Connection>>,
}

impl DatabaseConnection {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        // Create parent directory if it doesn't exist
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(db_path)?;
        
        // Run migrations
        run_migrations(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn get_connection(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.conn)
    }
}

impl Clone for DatabaseConnection {
    fn clone(&self) -> Self {
        Self {
            conn: Arc::clone(&self.conn),
        }
    }
}
