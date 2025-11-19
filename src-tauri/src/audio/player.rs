// Audio player implementation
use rodio::{Decoder, OutputStream, Sink, Source};
use std::fs::File;
use std::io::BufReader;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use anyhow::{Result, Context};

pub struct Player {
    sink: Mutex<Option<Sink>>,
    current_file: Mutex<Option<PathBuf>>,
    start_time: Mutex<Option<Instant>>,
    pause_position: Mutex<Duration>,
    total_duration: Mutex<Option<Duration>>,
}

impl Player {
    pub fn new() -> Result<Self> {
        Ok(Self {
            sink: Mutex::new(None),
            current_file: Mutex::new(None),
            start_time: Mutex::new(None),
            pause_position: Mutex::new(Duration::ZERO),
            total_duration: Mutex::new(None),
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

        // Get total duration if available
        let duration = source.total_duration();
        *self.total_duration.lock().unwrap() = duration;

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
        *self.start_time.lock().unwrap() = Some(Instant::now());
        *self.pause_position.lock().unwrap() = Duration::ZERO;
        
        // Prevent _stream from being dropped immediately
        std::mem::forget(_stream);

        Ok(())
    }

    pub fn play_from_position(&self, file_path: PathBuf, position: Duration) -> Result<()> {
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

        // Get total duration if available
        let duration = source.total_duration();
        *self.total_duration.lock().unwrap() = duration;

        // Skip to position
        let source = source.skip_duration(position);

        // Create a new sink
        let sink = Sink::try_new(&stream_handle)
            .context("Failed to create audio sink")?;

        // Append the source and play
        sink.append(source);
        sink.play();

        // Store the sink and current file
        *self.sink.lock().unwrap() = Some(sink);
        *self.current_file.lock().unwrap() = Some(file_path);
        *self.start_time.lock().unwrap() = Some(Instant::now());
        *self.pause_position.lock().unwrap() = position;
        
        // Prevent _stream from being dropped immediately
        std::mem::forget(_stream);

        Ok(())
    }

    pub fn pause(&self) {
        if let Some(sink) = self.sink.lock().unwrap().as_ref() {
            // Store current position before pausing
            if let Some(start) = *self.start_time.lock().unwrap() {
                let elapsed = start.elapsed();
                let pause_pos = *self.pause_position.lock().unwrap();
                *self.pause_position.lock().unwrap() = pause_pos + elapsed;
            }
            sink.pause();
            *self.start_time.lock().unwrap() = None;
        }
    }

    pub fn resume(&self) {
        if let Some(sink) = self.sink.lock().unwrap().as_ref() {
            sink.play();
            *self.start_time.lock().unwrap() = Some(Instant::now());
        }
    }

    pub fn stop(&self) {
        if let Some(sink) = self.sink.lock().unwrap().take() {
            sink.stop();
        }
        *self.current_file.lock().unwrap() = None;
        *self.start_time.lock().unwrap() = None;
        *self.pause_position.lock().unwrap() = Duration::ZERO;
        *self.total_duration.lock().unwrap() = None;
    }

    pub fn seek(&self, position: Duration) -> Result<()> {
        let current_file = self.current_file.lock().unwrap().clone();
        if let Some(file_path) = current_file {
            self.play_from_position(file_path, position)?;
        }
        Ok(())
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

    pub fn current_position(&self) -> Duration {
        let pause_pos = *self.pause_position.lock().unwrap();
        if let Some(start) = *self.start_time.lock().unwrap() {
            pause_pos + start.elapsed()
        } else {
            pause_pos
        }
    }

    pub fn total_duration(&self) -> Option<Duration> {
        *self.total_duration.lock().unwrap()
    }
}
