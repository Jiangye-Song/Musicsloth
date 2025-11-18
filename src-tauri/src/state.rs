// Application state management
use std::sync::{Arc, Mutex};

use crate::audio::player::Player;
use crate::db::connection::DatabaseConnection;

pub struct AppState {
    pub player: Arc<Mutex<Player>>,
    pub db: DatabaseConnection,
}

impl AppState {
    pub fn new(player: Player, db: DatabaseConnection) -> Self {
        Self {
            player: Arc::new(Mutex::new(player)),
            db,
        }
    }
}
