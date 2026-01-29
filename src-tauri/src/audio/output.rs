// Audio output using cpal
// Handles cross-platform audio output with a ring buffer

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Stream, StreamConfig};
use parking_lot::Mutex;
use ringbuf::{HeapRb, traits::{Consumer, Observer, Producer, Split}};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

const RING_BUFFER_SIZE: usize = 48000 * 2 / 4; // ~250ms of stereo audio at 48kHz

type RingProducer = ringbuf::HeapProd<f32>;
type RingConsumer = ringbuf::HeapCons<f32>;

pub struct AudioOutput {
    _stream: Stream,
    producer: Arc<Mutex<RingProducer>>,
    sample_rate: u32,
    channels: u16,
    volume: Arc<Mutex<f32>>,
    clear_flag: Arc<AtomicBool>,
}

impl AudioOutput {
    /// Create a new audio output with default device
    pub fn new() -> Result<Self, String> {
        let host = cpal::default_host();
        
        let device = host.default_output_device()
            .ok_or("No output device available")?;
        
        let config = device.default_output_config()
            .map_err(|e| format!("Failed to get default output config: {}", e))?;
        
        let sample_rate = config.sample_rate().0;
        let channels = config.channels();
        
        // Create ring buffer for passing samples to audio thread
        let rb = HeapRb::<f32>::new(RING_BUFFER_SIZE);
        let (producer, consumer) = rb.split();
        let producer = Arc::new(Mutex::new(producer));
        let consumer = Arc::new(Mutex::new(consumer));
        
        let volume = Arc::new(Mutex::new(1.0f32));
        let volume_clone = volume.clone();
        
        let clear_flag = Arc::new(AtomicBool::new(false));
        let clear_flag_clone = clear_flag.clone();
        
        // Build the output stream based on sample format
        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                Self::build_stream::<f32>(&device, &config.into(), consumer, volume_clone, clear_flag_clone)?
            }
            cpal::SampleFormat::I16 => {
                Self::build_stream::<i16>(&device, &config.into(), consumer, volume_clone, clear_flag_clone)?
            }
            cpal::SampleFormat::U16 => {
                Self::build_stream::<u16>(&device, &config.into(), consumer, volume_clone, clear_flag_clone)?
            }
            format => return Err(format!("Unsupported sample format: {:?}", format)),
        };
        
        stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;
        
        Ok(Self {
            _stream: stream,
            producer,
            sample_rate,
            channels,
            volume,
            clear_flag,
        })
    }
    
    fn build_stream<T: cpal::SizedSample + cpal::FromSample<f32>>(
        device: &cpal::Device,
        config: &StreamConfig,
        consumer: Arc<Mutex<RingConsumer>>,
        volume: Arc<Mutex<f32>>,
        clear_flag: Arc<AtomicBool>,
    ) -> Result<Stream, String> {
        let stream = device.build_output_stream(
            config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                let mut consumer = consumer.lock();
                let vol = *volume.lock();
                
                // If clear flag is set, drain the buffer and output silence
                if clear_flag.swap(false, Ordering::SeqCst) {
                    // Drain all samples from the buffer
                    while consumer.try_pop().is_some() {}
                }
                
                for sample in data.iter_mut() {
                    let value = consumer.try_pop().unwrap_or(0.0) * vol;
                    *sample = T::from_sample(value);
                }
            },
            move |err| {
                eprintln!("Audio output error: {}", err);
            },
            None,
        ).map_err(|e| format!("Failed to build output stream: {}", e))?;
        
        Ok(stream)
    }
    
    /// Write samples to the output buffer
    /// Returns the number of samples actually written
    pub fn write(&self, samples: &[f32]) -> usize {
        let mut producer = self.producer.lock();
        let mut written = 0;
        
        for &sample in samples {
            if producer.try_push(sample).is_ok() {
                written += 1;
            } else {
                // Buffer full, drop remaining samples
                break;
            }
        }
        
        written
    }
    
    /// Write samples, blocking until all are written or timeout
    pub fn write_blocking(&self, samples: &[f32]) {
        let mut remaining = samples;
        
        while !remaining.is_empty() {
            let written = self.write(remaining);
            if written > 0 {
                remaining = &remaining[written..];
            } else {
                // Buffer full, wait a bit
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
        }
    }
    
    /// Get available space in the buffer
    pub fn available_space(&self) -> usize {
        let producer = self.producer.lock();
        producer.vacant_len()
    }
    
    /// Clear the buffer (useful when seeking)
    pub fn clear(&self) {
        // Set flag so audio callback drains buffer on next call
        self.clear_flag.store(true, Ordering::SeqCst);
    }
    
    /// Get the output sample rate
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    
    /// Get the number of output channels
    pub fn channels(&self) -> u16 {
        self.channels
    }
    
    /// Set the output volume (0.0 to 1.0)
    pub fn set_volume(&self, vol: f32) {
        *self.volume.lock() = vol.clamp(0.0, 1.0);
    }
    
    /// Get the current volume
    pub fn volume(&self) -> f32 {
        *self.volume.lock()
    }
}
