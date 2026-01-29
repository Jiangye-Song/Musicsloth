// Application state management
use std::sync::{Arc, Mutex};

use crate::audio::player::Player;
use crate::db::connection::DatabaseConnection;
use crate::smtc::SmtcManager;

pub struct AppState {
    pub player: Arc<Mutex<Player>>,
    pub db: DatabaseConnection,
    pub smtc: Arc<Mutex<Option<SmtcManager>>>,
}

impl AppState {
    pub fn new(player: Player, db: DatabaseConnection, smtc: Option<SmtcManager>) -> Self {
        Self {
            player: Arc::new(Mutex::new(player)),
            db,
            smtc: Arc::new(Mutex::new(smtc)),
        }
    }
}
