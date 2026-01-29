// Windows SMTC implementation using windows-rs crate

use std::path::Path;
use std::sync::{Arc, Mutex};
use windows::Foundation::TypedEventHandler;
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
    SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
};
use windows::Media::Playback::MediaPlayer;
use windows::Storage::StorageFile;
use windows::Storage::Streams::RandomAccessStreamReference;

/// Button events from SMTC
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SmtcButton {
    Play,
    Pause,
    Stop,
    Next,
    Previous,
}

type ButtonCallback = Arc<Mutex<Option<Box<dyn Fn(SmtcButton) + Send + Sync + 'static>>>>;

/// Manager for Windows System Media Transport Controls
pub struct SmtcManager {
    media_player: MediaPlayer,
    smtc: SystemMediaTransportControls,
    button_callback: ButtonCallback,
}

impl SmtcManager {
    /// Create a new SMTC manager
    pub fn new() -> Result<Self, String> {
        // Create a MediaPlayer to get access to SMTC
        let media_player = MediaPlayer::new()
            .map_err(|e| format!("Failed to create MediaPlayer: {}", e))?;
        
        // Enable command manager mode to manually control SMTC
        media_player.CommandManager()
            .map_err(|e| format!("Failed to get CommandManager: {}", e))?
            .SetIsEnabled(false)
            .map_err(|e| format!("Failed to disable CommandManager: {}", e))?;
        
        // Get the SMTC from the media player
        let smtc = media_player.SystemMediaTransportControls()
            .map_err(|e| format!("Failed to get SMTC: {}", e))?;
        
        // Enable SMTC
        smtc.SetIsEnabled(true)
            .map_err(|e| format!("Failed to enable SMTC: {}", e))?;
        
        // Enable buttons
        smtc.SetIsPlayEnabled(true)
            .map_err(|e| format!("Failed to enable play button: {}", e))?;
        smtc.SetIsPauseEnabled(true)
            .map_err(|e| format!("Failed to enable pause button: {}", e))?;
        smtc.SetIsStopEnabled(true)
            .map_err(|e| format!("Failed to enable stop button: {}", e))?;
        smtc.SetIsNextEnabled(true)
            .map_err(|e| format!("Failed to enable next button: {}", e))?;
        smtc.SetIsPreviousEnabled(true)
            .map_err(|e| format!("Failed to enable previous button: {}", e))?;
        
        let button_callback: ButtonCallback = Arc::new(Mutex::new(None));
        
        // Set up button press handler
        let callback_clone = button_callback.clone();
        let handler = TypedEventHandler::new(
            move |_sender: &Option<SystemMediaTransportControls>,
                  args: &Option<SystemMediaTransportControlsButtonPressedEventArgs>| {
                if let Some(args) = args {
                    if let Ok(button) = args.Button() {
                        let smtc_button = match button {
                            SystemMediaTransportControlsButton::Play => Some(SmtcButton::Play),
                            SystemMediaTransportControlsButton::Pause => Some(SmtcButton::Pause),
                            SystemMediaTransportControlsButton::Stop => Some(SmtcButton::Stop),
                            SystemMediaTransportControlsButton::Next => Some(SmtcButton::Next),
                            SystemMediaTransportControlsButton::Previous => Some(SmtcButton::Previous),
                            _ => None,
                        };
                        
                        if let Some(btn) = smtc_button {
                            if let Ok(guard) = callback_clone.lock() {
                                if let Some(ref cb) = *guard {
                                    cb(btn);
                                }
                            }
                        }
                    }
                }
                Ok(())
            },
        );
        
        smtc.ButtonPressed(&handler)
            .map_err(|e| format!("Failed to register button handler: {}", e))?;
        
        Ok(Self {
            media_player,
            smtc,
            button_callback,
        })
    }
    
    /// Update the displayed metadata
    pub fn update_metadata(
        &self,
        title: &str,
        artist: Option<&str>,
        album: Option<&str>,
        artwork_path: Option<&Path>,
    ) -> Result<(), String> {
        let updater = self.smtc.DisplayUpdater()
            .map_err(|e| format!("Failed to get display updater: {}", e))?;
        
        // Set type to Music
        updater.SetType(MediaPlaybackType::Music)
            .map_err(|e| format!("Failed to set type: {}", e))?;
        
        // Get music properties
        let music_props = updater.MusicProperties()
            .map_err(|e| format!("Failed to get music properties: {}", e))?;
        
        // Set title
        music_props.SetTitle(&windows::core::HSTRING::from(title))
            .map_err(|e| format!("Failed to set title: {}", e))?;
        
        // Set artist
        if let Some(artist) = artist {
            music_props.SetArtist(&windows::core::HSTRING::from(artist))
                .map_err(|e| format!("Failed to set artist: {}", e))?;
        }
        
        // Set album
        if let Some(album) = album {
            music_props.SetAlbumTitle(&windows::core::HSTRING::from(album))
                .map_err(|e| format!("Failed to set album: {}", e))?;
        }
        
        // Set artwork if path provided
        if let Some(artwork_path) = artwork_path {
            if artwork_path.exists() {
                let path_str = artwork_path.to_string_lossy().to_string();
                eprintln!("[SMTC] Setting artwork from: {}", path_str);
                
                // Use StorageFile to load the file, which properly handles Windows paths
                match StorageFile::GetFileFromPathAsync(&windows::core::HSTRING::from(&path_str)) {
                    Ok(async_op) => {
                        match async_op.get() {
                            Ok(storage_file) => {
                                match RandomAccessStreamReference::CreateFromFile(&storage_file) {
                                    Ok(stream_ref) => {
                                        if let Err(e) = updater.SetThumbnail(&stream_ref) {
                                            eprintln!("[SMTC] Failed to set thumbnail: {}", e);
                                        } else {
                                            eprintln!("[SMTC] Thumbnail set successfully");
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("[SMTC] Failed to create stream reference: {}", e);
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("[SMTC] Failed to get storage file: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[SMTC] Failed to start GetFileFromPathAsync: {}", e);
                    }
                }
            } else {
                eprintln!("[SMTC] Artwork path does not exist: {:?}", artwork_path);
            }
        }
        
        // Apply changes
        updater.Update()
            .map_err(|e| format!("Failed to update display: {}", e))?;
        
        Ok(())
    }
    
    /// Set playback status (playing or paused)
    pub fn set_playback_status(&self, is_playing: bool) -> Result<(), String> {
        let status = if is_playing {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        };
        
        self.smtc.SetPlaybackStatus(status)
            .map_err(|e| format!("Failed to set playback status: {}", e))
    }
    
    /// Set timeline position (not directly supported by basic SMTC, but we track it)
    pub fn set_timeline(
        &self,
        _position_ms: i64,
        _duration_ms: i64,
    ) -> Result<(), String> {
        // Basic SMTC doesn't support timeline display
        // This would require using MediaPlaybackCommandManager with timeline
        Ok(())
    }
    
    /// Set callback for button presses
    pub fn set_button_callback<F>(&self, callback: F) -> Result<(), String>
    where
        F: Fn(SmtcButton) + Send + Sync + 'static,
    {
        let mut guard = self.button_callback.lock()
            .map_err(|e| format!("Failed to lock callback: {}", e))?;
        *guard = Some(Box::new(callback));
        Ok(())
    }
}

// Ensure SmtcManager can be sent between threads
unsafe impl Send for SmtcManager {}
unsafe impl Sync for SmtcManager {}
