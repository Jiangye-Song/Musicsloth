// Application state management
use std::sync::{Arc, Mutex};
use std::path::PathBuf;

use crate::audio::player::Player;
use crate::db::connection::DatabaseConnection;
use crate::smtc::SmtcManager;

pub struct AppState {
    pub player: Arc<Mutex<Player>>,
    pub db: DatabaseConnection,
    pub smtc: Arc<Mutex<Option<SmtcManager>>>,
    pub app_dir: PathBuf,
}

impl AppState {
    pub fn new(player: Player, db: DatabaseConnection, smtc: Option<SmtcManager>, app_dir: PathBuf) -> Self {
        Self {
            player: Arc::new(Mutex::new(player)),
            db,
            smtc: Arc::new(Mutex::new(smtc)),
            app_dir,
        }
    }
}
