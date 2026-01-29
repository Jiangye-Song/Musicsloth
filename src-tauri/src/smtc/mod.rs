// Windows System Media Transport Controls (SMTC) integration
// Provides media controls overlay and media key support on Windows

#[cfg(windows)]
mod windows_smtc;

#[cfg(windows)]
pub use windows_smtc::*;

// Stub for non-Windows platforms
#[cfg(not(windows))]
mod stub {
    use std::path::Path;

    pub struct SmtcManager;

    impl SmtcManager {
        pub fn new() -> Result<Self, String> {
            Ok(Self)
        }

        pub fn update_metadata(
            &self,
            _title: &str,
            _artist: Option<&str>,
            _album: Option<&str>,
            _artwork_path: Option<&Path>,
        ) -> Result<(), String> {
            Ok(())
        }

        pub fn set_playback_status(&self, _is_playing: bool) -> Result<(), String> {
            Ok(())
        }

        pub fn set_timeline(
            &self,
            _position_ms: i64,
            _duration_ms: i64,
        ) -> Result<(), String> {
            Ok(())
        }

        pub fn set_button_callback<F>(&self, _callback: F) -> Result<(), String>
        where
            F: Fn(SmtcButton) + Send + Sync + 'static,
        {
            Ok(())
        }
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum SmtcButton {
        Play,
        Pause,
        Stop,
        Next,
        Previous,
    }
}

#[cfg(not(windows))]
pub use stub::*;
