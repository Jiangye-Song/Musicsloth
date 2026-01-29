// Audio playback module
// Uses Symphonia for decoding and cpal for output

pub mod decoder;
pub mod output;
pub mod player;

// Re-exports for convenience (used in Phase 2)
#[allow(unused_imports)]
pub use player::{Player, PlayerState};
