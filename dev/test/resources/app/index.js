"use strict";


const {ipcRenderer} = require("electron");
const path = require("node:path");

const {FFmpegVideoEncoder, FFmpegAudioEncoder} = require("./resources/app/lib/encoder-ffmpeg.js");
import {BrowserAudioEncoder} from "./lib/encoder-browser.js";
import {Decoder, Player} from "./lib/decoder.js";

const main = async () => {
    // Wait for DOM to load
    await new Promise((resolve) => {
        window.addEventListener("load", () => {
            resolve();
        });
    });

    // create essencial elements
    const canvas = document.createElement("canvas");
    canvas.width = 1920/8;
    canvas.height = 1080/8;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    const canvas2 = document.createElement("canvas");
    canvas2.width = 1920/8;
    canvas2.height = 1080/8;
    document.body.appendChild(canvas2);
    const ctx2 = canvas2.getContext("2d");

    const appPath = await ipcRenderer.invoke("api", "path-exe");
    const ffmpegPath = path.join(path.dirname(appPath), "ffmpeg");


    const player = new Player(false, ctx, ctx2);
    const decoder = new Decoder();
    decoder.onVideoFrame = (frame) => {
        player.appendVideoFrame(frame);
    };
    decoder.onAudioFrame = (frame) => {
        player.appendAudioFrame(frame);
    };
    

    // Audio encoder - browser
    const audioEncoderBrowser = new BrowserAudioEncoder();
    audioEncoderBrowser.onConfiguration = (config) => {
        console.log("Audio configuration:", config);
        decoder.appendAudioConfiguration(config);
    };
    audioEncoderBrowser.onChunk = (chunk) => {
        console.log("Audio chunk:", chunk);
        decoder.appendAudioChunk(chunk);
    };
    audioEncoderBrowser.onEnd = (error) => {
        console.log("Audio encoding ended with error code:", error);
    };

    // Audio encoder - ffmpeg
    const audioEncoderFFmpeg = new FFmpegAudioEncoder();
    audioEncoderFFmpeg.onConfiguration = (config) => {
        console.log("Audio configuration:", config);
        decoder.appendAudioConfiguration(config);
    };
    audioEncoderFFmpeg.onChunk = (chunk) => {
        console.log("Audio chunk:", chunk);
        decoder.appendAudioChunk(chunk);
    };
    audioEncoderFFmpeg.onEnd = (error) => {
        console.log("Audio encoding ended with error code:", error);
    };

    // Video encoder - ffmpeg
    const videoEncoderFFmpeg = new FFmpegVideoEncoder();
    videoEncoderFFmpeg.onConfiguration = (config) => {
        console.log("Video configuration:", config);
        decoder.appendVideoConfiguration(config);
    };
    videoEncoderFFmpeg.onChunk = (chunk) => {
        console.log("Video chunk:", chunk);
        decoder.appendVideoChunk(chunk);
    };
    videoEncoderFFmpeg.onEnd = (error) => {
        console.log("Video encoding ended with error code:", error);
    };

    const stopAudio = async () => {
        await audioEncoderBrowser.end();
        await audioEncoderFFmpeg.end();
    };
    const stopVideo = async () => {
        await videoEncoderFFmpeg.end();
    };
    const stop = async () => {
        await stopAudio();
        await stopVideo();
    }
    document.getElementById("stopBtn").addEventListener("click", async function() {
        await stop();
    });

    //
    // Audio
    //
    // Audio encoder - browser
    document.getElementById("audioBrowserBtn").addEventListener("click", async function() {
        await stopAudio();
        await audioEncoderBrowser.start({
            "codec": "mp4a.40.2",
            "sampleRate": 48000,
            "numberOfChannels": 2
        });
    });

    // Audio encoder - ffmpeg - mp4
    document.getElementById("audioFFmpegMP4Btn").addEventListener("click", async function() {
        await stopAudio();
        await audioEncoderFFmpeg.start(
            ffmpegPath,
            [
                //"-list_devices", "true", "-f", "dshow", "-i", "dummy"
                "-fflags", "+nobuffer+flush_packets",
                "-flags", "+low_delay",
                "-analyzeduration", "0",         // Don't analyze input
                "-probesize", "32",              // Minimum probe size
                "-thread_queue_size", "8",       // Small queue
                "-audio_buffer_size", "10",      // 10ms audio buffer (dshow specific)

                "-f", "dshow",
                "-i", "audio=\"Sztereó keverő (Realtek(R) Audio)\"",
                "-acodec", "aac",
                "-b:a", "128k",
                "-ar", "48000",
                "-ac", "2",
                "-f", "mp4",
                "-movflags", "frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset",
                "-frag_duration", "16666",
                
                "pipe:1"
            ],
            {
                "codec": "mp4a.40.2",
                "sampleRate": 48000,
                "numberOfChannels": 2
            }
        );
    });

    // Audio encoder - ffmpeg - webm
    document.getElementById("audioFFmpegWebMBtn").addEventListener("click", async function() {
        await stopAudio();
        await audioEncoderFFmpeg.start(
            ffmpegPath,
            [
                // Input options - MUST come before -i
                "-fflags", "+nobuffer+flush_packets",
                "-flags", "+low_delay",
                "-analyzeduration", "0",         // Don't analyze input
                "-probesize", "32",              // Minimum probe size
                "-thread_queue_size", "8",       // Small queue
                "-audio_buffer_size", "10",      // 10ms audio buffer (dshow specific)
                
                "-f", "dshow",
                "-i", "audio=\"Sztereó keverő (Realtek(R) Audio)\"",
                
                // Output options
                "-acodec", "libopus",
                "-b:a", "128k",
                "-ar", "48000",
                "-ac", "2",
                "-application", "lowdelay",
                "-frame_duration", "10",
                "-vbr", "off",
                "-compression_level", "0",
                "-packet_loss", "0",
                "-fflags", "+nobuffer+flush_packets",
                "-flags", "+low_delay", 
                "-flush_packets", "1",
                "-max_delay", "0",
                "-muxdelay", "0",
                "-f", "webm",
                "-live", "1",
                "-cluster_time_limit", "10",
                "-chunk_duration_ms", "10",
                "pipe:1"
            ],
            {
                "codec": "opus",
                "sampleRate": 48000,
                "numberOfChannels": 2
            }
        );
    });

    document.getElementById("audioFFmpegOggBtn").addEventListener("click", async function() {
        await stopAudio();
        await audioEncoderFFmpeg.start(
            ffmpegPath,
            [
                // Input options - MUST come before -i
                "-fflags", "+nobuffer+flush_packets",
                "-flags", "+low_delay",
                "-analyzeduration", "0",         // Don't analyze input
                "-probesize", "32",              // Minimum probe size
                "-thread_queue_size", "8",       // Small queue
                "-audio_buffer_size", "10",      // 10ms audio buffer (dshow specific)
                
                "-f", "dshow",
                "-i", "audio=\"Sztereó keverő (Realtek(R) Audio)\"",
                
                "-acodec", "libopus",
                "-b:a", "128k",
                "-ar", "48000",
                "-ac", "2",
                "-application", "lowdelay",
                "-frame_duration", "10",
                "-vbr", "off",
                "-compression_level", "0",
                "-packet_loss", "0",
                
                // Ogg muxer options
                "-page_duration", "10000",      // 10ms page duration (in microseconds)
                "-flush_packets", "1",
                "-max_delay", "0",
                "-muxdelay", "0",
                "-f", "ogg",
                "pipe:1"
            ],
            {
                "codec": "opus",
                "sampleRate": 48000,
                "numberOfChannels": 2
            }
        );
    });

    document.getElementById("audioFFmpegMP3Btn").addEventListener("click", async function() {
        await stopAudio();
        await audioEncoderFFmpeg.start(
            ffmpegPath,
            [
                // Input options - MUST come before -i
                "-fflags", "+nobuffer+flush_packets",
                "-flags", "+low_delay",
                "-analyzeduration", "0",
                "-probesize", "32",
                "-thread_queue_size", "8",
                "-audio_buffer_size", "10",
                
                "-f", "dshow",
                "-i", "audio=\"Sztereó keverő (Realtek(R) Audio)\"",
                
                // Output options
                "-acodec", "libmp3lame",
                "-qscale:a", "4",
                "-ar", "44100",
                "-flush_packets", "1",
                "-f", "mp3",
                "pipe:1"
            ],
            {
                "codec": "mp3",
                "sampleRate": 44100,
                "numberOfChannels": 2
            }
        );
    });

    //
    // Video
    //
    document.getElementById("videoFFmpegMP4Btn").addEventListener("click", async function() {
        await stopVideo();
        await videoEncoderFFmpeg.start(
            ffmpegPath,
            [
                "-fflags", "+nobuffer+flush_packets",
                "-flags", "+low_delay",
                "-analyzeduration", "0",         // Don't analyze input
                "-probesize", "32",              // Minimum probe size
                "-thread_queue_size", "8",       // Small queue"

                "-filter_complex",
                "gfxcapture=monitor_idx=0" +
                ":capture_cursor=false" +
                ":max_framerate=60" +
                ",hwdownload,format=bgra",

                "-c:v", "h264_nvenc",
                "-b:v", "10000K",
                "-tune:v", "3",
                "-profile:v", "2",
                "-level:v", "51",
                "-rc:v", "1",
                "-rgb_mode:v", "1",
                "-delay:v", "0",
                "-zerolatency:v", "1",
                
                "-framerate", "60",
                "-g", "30",             // Keyframe interval (every 30 frames = 0.5s at 60fps)
                "-keyint_min", "30",
                "-force_key_frames", "expr:gte(t,n_forced*0.5)",
                "-f", "mp4",
                "-movflags", "frag_keyframe+empty_moov+default_base_moof+omit_tfhd_offset",
                "-frag_duration", "16666",
                "pipe:1"
            ],
            {
                "codec": "avc1.640033",
                "codedWidth": 1920,
                "codedHeight": 1080,
                "hardwareAcceleration": "prefer-hardware",
                "optimizeForLatency": true
            }
        );
    });

    document.getElementById("videoFFmpegWebMBtn").addEventListener("click", async function() {
        await stopVideo();
        await videoEncoderFFmpeg.start(
            ffmpegPath,
            [
                "-fflags", "+nobuffer+flush_packets",
                "-flags", "+low_delay",
                "-analyzeduration", "0",         // Don't analyze input
                "-probesize", "32",              // Minimum probe size
                "-thread_queue_size", "8",       // Small queue"

                "-filter_complex",
                "gfxcapture=monitor_idx=0" +
                ":capture_cursor=false" +
                ":max_framerate=60" +
                ",hwdownload,format=bgra",
                
                // VP8 codec settings
                "-c:v", "libvpx",
                
                // Real-time / low-latency settings
                "-deadline", "realtime",           // Fastest encoding mode
                "-cpu-used", "16",                 // Fastest preset (0-16 for VP8, higher = faster)
                "-lag-in-frames", "0",             // No frame lookahead for minimal latency
                "-error-resilient", "1",           // Enable error resilience for streaming
                
                // Rate control
                "-b:v", "2M",                      // Target bitrate
                "-maxrate", "2.5M",                // Maximum bitrate
                "-minrate", "1M",                  // Minimum bitrate
                "-bufsize", "500k",                // Small buffer for low latency
                "-undershoot-pct", "95",           // Allow undershooting target
                "-overshoot-pct", "100",           // Limit overshooting
                
                // Quality settings
                "-qmin", "4",                      // Minimum quantizer (lower = better quality)
                "-qmax", "48",                     // Maximum quantizer
                "-crf", "10",                      // Constant rate factor (optional, 4-63)
                
                // Keyframe settings
                "-g", "30",                        // Keyframe every 30 frames
                "-keyint_min", "30",               // Minimum keyframe interval
                "-auto-alt-ref", "0",              // Disable alt ref frames for low latency
                
                // Frame settings
                "-r", "30",                        // Frame rate
                "-pix_fmt", "yuv420p",             // Pixel format
                
                // WebM container settings
                "-f", "webm",                      // Output format
                "-cluster_size_limit", "2M",       // Limit cluster size
                "-cluster_time_limit", "1000",     // Limit cluster duration
                
                // WebM container settings
                "-f", "webm",
                "pipe:1"
            ],
            {
                "codec": "vp8",
                "codedWidth": 1920,
                "codedHeight": 1080,
                "optimizeForLatency": true
            }
        );
    });

    document.getElementById("videoFFmpegOggBtn").addEventListener("click", async function() {
        await stopVideo();
        await videoEncoderFFmpeg.start(
            ffmpegPath,
            [
                "-fflags", "+nobuffer+flush_packets",
                "-flags", "+low_delay",
                "-analyzeduration", "0",         // Don't analyze input
                "-probesize", "32",              // Minimum probe size
                "-thread_queue_size", "8",       // Small queue"

                "-filter_complex",
                "gfxcapture=monitor_idx=0" +
                ":capture_cursor=false" +
                ":max_framerate=60" +
                ",hwdownload,format=bgra",
                
                // VP8 codec settings
                "-c:v", "libvpx",
                
                // Real-time / low-latency settings
                "-deadline", "realtime",           // Fastest encoding mode
                "-cpu-used", "16",                 // Fastest preset (0-16 for VP8, higher = faster)
                "-lag-in-frames", "0",             // No frame lookahead for minimal latency
                "-error-resilient", "1",           // Enable error resilience for streaming
                
                // Rate control
                "-b:v", "2M",                      // Target bitrate
                "-maxrate", "2.5M",                // Maximum bitrate
                "-minrate", "1M",                  // Minimum bitrate
                "-bufsize", "500k",                // Small buffer for low latency
                "-undershoot-pct", "95",           // Allow undershooting target
                "-overshoot-pct", "100",           // Limit overshooting
                
                // Quality settings
                "-qmin", "4",                      // Minimum quantizer (lower = better quality)
                "-qmax", "48",                     // Maximum quantizer
                "-crf", "10",                      // Constant rate factor (optional, 4-63)
                
                // Keyframe settings
                "-g", "30",                        // Keyframe every 30 frames
                "-keyint_min", "30",               // Minimum keyframe interval
                "-auto-alt-ref", "0",              // Disable alt ref frames for low latency
                
                // Frame settings
                "-r", "30",                        // Frame rate
                "-pix_fmt", "yuv420p",             // Pixel format
                
                // WebM container settings
                "-f", "ogg",                      // Output format
                "-page_duration", "10000",        // 10ms page duration (in microseconds)
                // WebM container settings
                "-f", "webm",
                "pipe:1"
            ],
            {
                "codec": "vp8",
                "codedWidth": 1920,
                "codedHeight": 1080,
                "optimizeForLatency": true
            }
        );
        
    });
};

main();