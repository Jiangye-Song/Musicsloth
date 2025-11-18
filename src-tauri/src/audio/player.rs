// Audio player implementation
use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::Mutex;
use anyhow::{Result, Context};

pub struct Player {
    sink: Mutex<Option<Sink>>,
    current_file: Mutex<Option<PathBuf>>,
}

impl Player {
    pub fn new() -> Result<Self> {
        Ok(Self {
            sink: Mutex::new(None),
            current_file: Mutex::new(None),
        })
    }

    pub fn play(&self, file_path: PathBuf) -> Result<()> {
        // Stop current playback if any
        self.stop();

        // Create output stream and handle
        let (_stream, stream_handle) = OutputStream::try_default()
            .context("Failed to create audio output stream")?;

        // Open the audio file
        let file = File::open(&file_path)
            .context(format!("Failed to open audio file: {:?}", file_path))?;
        let source = Decoder::new(BufReader::new(file))
            .context("Failed to decode audio file")?;

        // Create a new sink
        let sink = Sink::try_new(&stream_handle)
            .context("Failed to create audio sink")?;

        // Append the source and play
        sink.append(source);
        sink.play();

        // Store the sink and current file
        // Note: _stream is dropped but sink keeps a reference to it internally
        *self.sink.lock().unwrap() = Some(sink);
        *self.current_file.lock().unwrap() = Some(file_path);
        
        // Prevent _stream from being dropped immediately
        std::mem::forget(_stream);

        Ok(())
    }

    pub fn pause(&self) {
        if let Some(sink) = self.sink.lock().unwrap().as_ref() {
            sink.pause();
        }
    }

    pub fn resume(&self) {
        if let Some(sink) = self.sink.lock().unwrap().as_ref() {
            sink.play();
        }
    }

    pub fn stop(&self) {
        if let Some(sink) = self.sink.lock().unwrap().take() {
            sink.stop();
        }
        *self.current_file.lock().unwrap() = None;
    }

    pub fn set_volume(&self, volume: f32) {
        if let Some(sink) = self.sink.lock().unwrap().as_ref() {
            sink.set_volume(volume.clamp(0.0, 1.0));
        }
    }

    pub fn is_playing(&self) -> bool {
        self.sink
            .lock()
            .unwrap()
            .as_ref()
            .map(|s| !s.is_paused() && !s.empty())
            .unwrap_or(false)
    }

    pub fn is_paused(&self) -> bool {
        self.sink
            .lock()
            .unwrap()
            .as_ref()
            .map(|s| s.is_paused())
            .unwrap_or(false)
    }

    pub fn current_file(&self) -> Option<PathBuf> {
        self.current_file.lock().unwrap().clone()
    }
}
