// Settings management and persistence
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Tab visibility and order configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabConfig {
    pub id: String,
    pub label: String,
    pub visible: bool,
    pub order: i32,
}

impl Default for TabConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            label: String::new(),
            visible: true,
            order: 0,
        }
    }
}

/// Language settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LanguageSettings {
    pub language: String, // Currently only "en" supported
}

impl Default for LanguageSettings {
    fn default() -> Self {
        Self {
            language: "en".to_string(),
        }
    }
}

/// Theme settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeSettings {
    pub mode: String, // "dark" or "light"
    pub accent_color: String, // Hex color code e.g. "#4CAF50"
    pub font_family: String,
}

impl Default for ThemeSettings {
    fn default() -> Self {
        Self {
            mode: "dark".to_string(),
            accent_color: "#4CAF50".to_string(),
            font_family: "system-ui".to_string(),
        }
    }
}

/// Interface settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterfaceSettings {
    pub theme: ThemeSettings,
    pub tabs: Vec<TabConfig>,
    pub quick_actions: Vec<String>, // Placeholder for future quick actions
}

impl Default for InterfaceSettings {
    fn default() -> Self {
        Self {
            theme: ThemeSettings::default(),
            tabs: vec![
                TabConfig { id: "queues".to_string(), label: "Queues".to_string(), visible: true, order: 0 },
                TabConfig { id: "library".to_string(), label: "Library".to_string(), visible: true, order: 1 },
                TabConfig { id: "playlists".to_string(), label: "Playlists".to_string(), visible: true, order: 2 },
                TabConfig { id: "artists".to_string(), label: "Artists".to_string(), visible: true, order: 3 },
                TabConfig { id: "albums".to_string(), label: "Albums".to_string(), visible: true, order: 4 },
                TabConfig { id: "genres".to_string(), label: "Genres".to_string(), visible: true, order: 5 },
            ],
            quick_actions: vec![],
        }
    }
}

/// Fade settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FadeSettings {
    pub enabled: bool,
    pub fade_in_ms: i32,  // 0-2000ms
    pub fade_out_ms: i32, // 0-2000ms
}

impl Default for FadeSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            fade_in_ms: 0,
            fade_out_ms: 0,
        }
    }
}

/// Replay Gain settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplayGainSettings {
    pub enabled: bool,
    pub calculate_unanalyzed: bool,
    pub analyze_on_scan: bool,
    pub segments_per_minute: i32, // 1-60
}

impl Default for ReplayGainSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            calculate_unanalyzed: true,
            analyze_on_scan: true,
            segments_per_minute: 10,
        }
    }
}

/// Playback settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackSettings {
    pub gapless: bool,
    pub fade: FadeSettings,
    pub equalizer_enabled: bool,
    pub equalizer_preset: String,
    pub replay_gain: ReplayGainSettings,
}

impl Default for PlaybackSettings {
    fn default() -> Self {
        Self {
            gapless: false,
            fade: FadeSettings::default(),
            equalizer_enabled: false,
            equalizer_preset: "flat".to_string(),
            replay_gain: ReplayGainSettings::default(),
        }
    }
}

/// Main application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub version: i32, // Settings schema version for future migrations
    pub language: LanguageSettings,
    pub interface: InterfaceSettings,
    pub playback: PlaybackSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 1,
            language: LanguageSettings::default(),
            interface: InterfaceSettings::default(),
            playback: PlaybackSettings::default(),
        }
    }
}

impl AppSettings {
    /// Get the settings file path
    pub fn get_settings_path(app_dir: &PathBuf) -> PathBuf {
        app_dir.join("settings.json")
    }

    /// Load settings from file, or return defaults if file doesn't exist
    pub fn load(app_dir: &PathBuf) -> Result<Self, String> {
        let path = Self::get_settings_path(app_dir);
        
        if !path.exists() {
            eprintln!("[Settings] No settings file found, using defaults");
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read settings file: {}", e))?;

        let settings: AppSettings = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))?;

        eprintln!("[Settings] Loaded settings from {:?}", path);
        Ok(settings)
    }

    /// Save settings to file
    pub fn save(&self, app_dir: &PathBuf) -> Result<(), String> {
        // Ensure directory exists
        fs::create_dir_all(app_dir)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;

        let path = Self::get_settings_path(app_dir);
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;

        fs::write(&path, content)
            .map_err(|e| format!("Failed to write settings file: {}", e))?;

        eprintln!("[Settings] Saved settings to {:?}", path);
        Ok(())
    }
}
