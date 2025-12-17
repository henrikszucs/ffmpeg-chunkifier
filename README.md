# FFmpeg chunkifier

## Inroduction
This is a library help to run FFmpeg command. Encoder create EncodedVideoChunk/EncodedAudioChunk objects from piped output. The decode function help to convert EncodedVideoChunk/EncodedAudioChunk object to VideoFrame/AudioFrame objects.
A Player class that help to play VideoFrame/AudioFrame into the UI.
```
         │   FFmpeg command - array of strings
         ▼
┌─────────────────┐
│     Encoder     │
└────────┬────────┘ 
         │   Configuration  /EncodedVideoChunk / EncodedAudioChunk - transferable objects
         ▼
┌─────────────────┐
│     Decoder     │
└────────┬────────┘
         │   VideoFrame / AudioFrame
         ▼
┌─────────────────┐
│     Player      │
└─────────────────┘
```

## Requiments
- NodeJS and FFmpeg executable(for desktop encoders)
- Browser context (for decoder)

> [!TIP]
> System sound record is not well supported on Windows (difficult to find "Stereo mix" device due to the language differences). Use BrowserAudioEncoder class to record system sound (work on Chrome and Electron).

> [!NOTE]
> NodeJS and Browser context available in Electron or NW.js simultaniously. You can use separately FFmpeg methods on NodeJS and display on browser context.

## Supported codecs and containers

### Video formats

| Codec  |  Containers  |
|--------|--------------|
| H264   | MP4          |
| H265   | MP4          |
| VP8    | WebM/Ogg     |
| VP9    | MP4/WebM/Ogg |
| AV1    | MP4/WebM     |

### Audio formats

| Codec  |  Containers  |
|--------|--------------|
| ACC    | MP4          |
| MP3    | MP4/MP3      |
| Opus   | MP4/WebM/Ogg |


## Usage

### Import
```js
const {FFmpegVideoEncoder, FFmpegAudioEncoder} = require("encoder-ffmpeg.js");
import {BrowserAudioEncoder} from "encoder-browser.js";
import {Decoder, Player} from "decoder.js";
```

### Encoder
```js
// create encoder with FFmpeg
const audioEncoder = new FFmpegAudioEncoder();
audioEncoder.onConfiguration = (config) => {
    console.log("Audio configuration:", config);
    decoder.appendAudioConfiguration(config);
};
audioEncoder.onChunk = (chunk) => {
    console.log("Audio chunk:", chunk);
    decoder.appendAudioChunk(chunk);
};
audioEncoder.onEnd = (error) => {
    console.log("Audio encoding ended with error code:", error);
};

// call start
await audioEncoder.start(
    ffmpegPath,
    [...ffmpegParams],
    {
        // VideoDecoder/AudioDecoder options (https://developer.mozilla.org/en-US/docs/Web/API/VideoDecoder/configure)
    }
);
```

### Decoder
```js
const player = new Player(audioPlay=true, audioDrawCtx, videoDrawCtx);

const decoder = new Decoder();
decoder.onVideoFrame = (frame) => {
    player.appendVideoFrame(frame);
};
decoder.onAudioFrame = (frame) => {
    player.appendAudioFrame(frame);
};

```