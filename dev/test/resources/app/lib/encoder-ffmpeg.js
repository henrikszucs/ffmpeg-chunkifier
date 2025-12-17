"use strict";

const spawn = globalThis?.require("child_process").spawn;

const FFmpegProcess = class {
    constructor() {
        // callbacks
        this.onData = function(data) {};
        this.onEnd = function(error) {};
            
        // process state
        this.process = null;
        this.isRunning = false;
        this.error = 0;
    };

    async start(ffmpegPath, params) {
        // wait start
        await new Promise((resolve, reject) => {
            this.process = spawn("ffmpeg", params, {"cwd": ffmpegPath, "windowsVerbatimArguments": true});
            this.process.stderr.on("data", (data) => {
                console.error(`FFmpeg stderr: ${data}`);
            });
            const startResolver = (data) => {
                this.onData(data);
                this.isRunning = true;
                this.process.removeListener("close", startRejecter);
                resolve();
            };
            const startRejecter = (code) => {
                this.code = code;
                this.process.stdout.removeListener("data", startResolver);
                reject(new Error("FFmpeg process exited before starting." + code));
            };
            this.process.stdout.once("data", startResolver);
            this.process.once("close", startRejecter);
        });

        // create permanent listeners
        this.process.stdout.on("data", this.onData);
        this.process.stderr.on("data", (data) => {
            //console.error(`FFmpeg stderr: ${data}`);
        });
        this.process.on("close", (code) => {
            this.error = code;
            this.end();
        });
    };

    async end() {
        if (this.isRunning === false) {
            return;
        }
        this.isRunning = false;
        if (this.process.exitCode === null) {
            this.process.removeAllListeners("close");
            await new Promise((resolve) => {
                this.process.once("close", () => {
                    resolve();
                });
                this.process.kill("SIGINT");
            });
            this.process = null;
        }
        this.onEnd(this.error);
    };
};


const FFmpegAudioEncoder = class {
    constructor() {
        // callbacks
        this.onConfiguration = null;
        this.onChunk = null;
        this.onEnd = null;

        // inner state
        this.process = null;
        this.error = 0;
        this.isRunning = false;
        this.decoderConfig = {};
        this.data = new Uint8Array(0);
        this.parserState = {};
    };

    findBox(data, type) {
        for (let i = 0; i < data.length - 4; i++) {
            if (String.fromCharCode(data[i], data[i + 1], data[i + 2], data[i + 3]) === type) {
                return i - 4;
            }
        }
        return -1;
    };


    appendData(data) {
        
    };

    appendDataDefault(data) {
        // Append incoming new data to buffer
        const newData = new Uint8Array(this.data.length + data.length);
        newData.set(this.data);
        newData.set(data, this.data.length);
        this.data = newData;

        // Detect container format from first few bytes
        if (this.data.length >= 4) {
            const magic = String.fromCharCode(this.data[0], this.data[1], this.data[2], this.data[3]);
                    
            // Check for MP4/M4A
            if (magic === "ftyp" || (this.data.length >= 8 && this.data[4] === 0x66 && this.data[5] === 0x74 && this.data[6] === 0x79 && this.data[7] === 0x70)) {
                console.log("Detected audio container: MP4");
                this.parserState = {
                    "frameDuration": 1_000_000 / 48,
                    "timestamp": 0,
                    "baseMediaDecodeTime": 0,
                    "sampleDuration": 0
                };
                this.appendData = this.appendDataMP4;
                this.onConfiguration(this.decoderConfig);
                this.appendData(new Uint8Array(0)); // Process existing buffer
                return;
            }
            // Check for WebM
            else if (this.data[0] === 0x1A && this.data[1] === 0x45 && this.data[2] === 0xDF && this.data[3] === 0xA3) {
                console.log("Detected audio container: WebM");
                this.appendData = this.appendDataWebM;
                this.onConfiguration(this.decoderConfig);
                this.appendData(new Uint8Array(0)); // Process existing buffer
                return;
            }
            // Check for Ogg
            else if (magic === "OggS") {
                console.log("Detected audio container: Ogg");
                this.appendData = this.appendDataOgg;
                this.appendData(new Uint8Array(0)); // Process existing buffer
                return;
            }
            // Check for MP3 (ID3 tag or sync frame)
            else if (magic === "ID3" || (this.data[0] === 0xFF && (this.data[1] & 0xE0) === 0xE0)) {
                console.log("Detected audio container: MP3");
                this.appendData = this.appendDataMP3;
                this.onConfiguration(this.decoderConfig);
                this.appendData(new Uint8Array(0)); // Process existing buffer
                return;
            } else {
                this.error = 1;
                this.end();
            }
        }
    };

    appendDataMP4(data) {
        // Append incoming new data to buffer
        const newData = new Uint8Array(this.data.length + data.length);
        newData.set(this.data);
        newData.set(data, this.data.length);
        this.data = newData;

        // Process MP4 boxes
        while (this.data.length >= 8) {
            const view = new DataView(this.data.buffer, this.data.byteOffset);

            const boxType = String.fromCharCode(this.data[4], this.data[5], this.data[6], this.data[7]);

            if (boxType !== "moof" && boxType !== "mdat" && boxType !== "moov" && boxType !== "ftyp" && boxType !== "styp") {
                this.data = this.data.slice(8);
                continue;
            }

            const boxSize = view.getUint32(0);

            if (boxSize === 0 || boxSize > this.data.length) {
                break;
            }

            const boxData = this.data.slice(0, boxSize);
            this.data = this.data.slice(boxSize);

            if (boxType === "ftyp" || boxType === "styp") {
                // Skip file type box
                console.log(`Skipping ${boxType} box`);
            } else if (boxType === "moof") {
                // Extract base media decode time from tfdt
                const tfdtPos = this.findBox(boxData, "tfdt");
                if (tfdtPos !== -1) {
                    const tfdtBox = boxData.slice(tfdtPos);
                    const tfdtView = new DataView(tfdtBox.buffer, tfdtBox.byteOffset);
                    const version = tfdtView.getUint8(8);

                    if (version === 0) {
                        this.parserState.baseMediaDecodeTime = tfdtView.getUint32(12);
                    } else if (version === 1) {
                        this.parserState.baseMediaDecodeTime = Number(tfdtView.getBigUint64(12));
                    }
                }

                // Extract sample duration from trun
                const trunPos = this.findBox(boxData, "trun");
                if (trunPos !== -1) {
                    const trunBox = boxData.slice(trunPos);
                    const trunView = new DataView(trunBox.buffer, trunBox.byteOffset);
                    const flags = trunView.getUint32(8) & 0x00FFFFFF;

                    let offset = 16;
                    if (flags & 0x000001) offset += 4;
                    if (flags & 0x000004) offset += 4;

                    // Extract sample duration if present (flag 0x000100)
                    if (flags & 0x000100) {
                        this.parserState.sampleDuration = trunView.getUint32(offset);
                    }

                    // For audio, typically 44100 or 48000 Hz timescale
                    this.parserState.timestamp = Math.floor((this.parserState.baseMediaDecodeTime / 48000) * 1_000_000);
                }
            } else if (boxType === "mdat") {
                if (this.parserState.timestamp >= 0) {
                    const chunk = new EncodedAudioChunk({
                        "type": "key",
                        "timestamp": this.parserState.timestamp,
                        "duration": this.parserState.sampleDuration > 0 ? Math.floor((this.parserState.sampleDuration / 48000) * 1_000_000) : this.parserState.frameDuration,
                        "data": boxData.slice(8)
                    });
                    this.onChunk(chunk);
                }
            }
        }
    };

    appendDataWebM(data) {
        
    };

    appendDataOgg(data) {

    };

    appendDataMP3(data) {

    };

    async start(ffmpegPath, params, decoderConfig) {
        this.appendData = this.appendDataDefault;
        this.process = new FFmpegProcess();
        this.process.onData = (data) => {
            this.appendData(data);
        };
        this.process.onEnd = (error) => {
            this.error = error;
            this.end();
        };
        this.decoderConfig = decoderConfig;
        await this.process.start(ffmpegPath, params);
        this.isRunning = true;
    };

    async end() {
        if (this.isRunning === false) {
            return;
        }
        this.isRunning = false;
        if (this.process && this.process.isRunning) {
            await this.process.end();
        }
        this.onEnd(this.error);
    };
};


const FFmpegVideoEncoder = class {
    constructor() {
        // callbacks
        this.onConfiguration = null;
        this.onChunk = null;
        this.onEnd = null;

        // inner state
        this.process = null;
        this.error = 0;
        this.isRunning = false;
        this.decoderConfig = {};
        this.data = new Uint8Array(0);
        this.parserState = {};
    };

    findBox(data, type) {
        for (let i = 0; i < data.length - 4; i++) {
            if (String.fromCharCode(data[i], data[i + 1], data[i + 2], data[i + 3]) === type) {
                return i - 4;
            }
        }
        return -1;
    };

    appendData(data) {

    };

    appendDataDefault(data) {
        // Append incoming new data to buffer
        const newData = new Uint8Array(this.data.length + data.length);
        newData.set(this.data);
        newData.set(data, this.data.length);
        this.data = newData;

        // Detect container format from first few bytes
        if (this.data.length >= 4) {
            const magic = String.fromCharCode(this.data[0], this.data[1], this.data[2], this.data[3]);

            // Check for MP4/M4A
            if (magic === "ftyp" || (this.data.length >= 8 && this.data[4] === 0x66 && this.data[5] === 0x74 && this.data[6] === 0x79 && this.data[7] === 0x70)) {
                console.log("Detected container format: MP4");
                this.parserState = {
                    "isKeyframe": false,
                    "frameDuration": 1_000_000 / 48,
                    "timestamp": 0,
                    "baseMediaDecodeTime": 0,
                    "sampleDuration": 0
                };
                this.appendData = this.appendDataMP4;
                this.appendData(new Uint8Array(0)); // Process existing buffer
                return;
            }
            // Check for WebM
            else if (this.data[0] === 0x1A && this.data[1] === 0x45 && this.data[2] === 0xDF && this.data[3] === 0xA3) {
                console.log("Detected container format: WebM");
                this.parserState = {
                    "offset": 0,
                    "clusterTimecode": 0,
                    "codecPrivate": null
                };
                this.appendData = this.appendDataWebM;
                this.appendData(new Uint8Array(0)); // Process existing buffer
                return;
            }
            // Check for Ogg
            else if (magic === "OggS") {
                console.log("Detected container format: Ogg");
                this.parserState = {
                    "offset": 0,
                    "granulePosition": 0
                };
                this.appendData = this.appendDataOgg;
                this.appendData(new Uint8Array(0)); // Process existing buffer
                return;
            } else {
                this.error = 1;
                this.end();
            }
        }
    };

    appendDataMP4(data) {
        // Append incoming new data to buffer
        const newData = new Uint8Array(this.data.length + data.length);
        newData.set(this.data);
        newData.set(data, this.data.length);
        this.data = newData;

        // Try to parse complete boxes (multiple boxes may be present)
        while (this.data.length >= 8) {
            // get next box
            const view = new DataView(this.data.buffer);

            const boxType = String.fromCharCode(
                this.data[4], this.data[5],
                this.data[6], this.data[7]
            );

            if (boxType !== "moof" && boxType !== "mdat" && boxType !== "moov") {
                // Unknown box, skip 1 byte and continue
                this.data = this.data.slice(7);
                continue;
            }

            const boxSize = view.getUint32(0);
            //console.log(`Found box: ${boxType} (size: ${boxSize})`);

            if (boxSize === 0 || boxSize > this.data.length) {
                //console.log("Waiting for more data...");
                break;
            }

            const boxData = this.data.slice(0, boxSize);
            this.data = this.data.slice(boxSize);

            // Handle different box types
            if (boxType === "moof") {
                this.parserState.isKeyframe = false;

                // Extract base media decode time from tfdt (Track Fragment Decode Time)
                const tfdtPos = this.findBox(boxData, "tfdt");
                if (tfdtPos !== -1) {
                    const tfdtBox = boxData.slice(tfdtPos);
                    const tfdtView = new DataView(tfdtBox.buffer);
                    const version = tfdtView.getUint8(8);

                    if (version === 0) {
                        this.parserState.baseMediaDecodeTime = tfdtView.getUint32(12);
                    } else if (version === 1) {
                        this.parserState.baseMediaDecodeTime = Number(tfdtView.getBigUint64(12));
                    }
                }

                // Extract sample info from trun
                const trunPos = this.findBox(boxData, "trun");
                if (trunPos !== -1) {
                    const trunBox = boxData.slice(trunPos);
                    const trunView = new DataView(trunBox.buffer);

                    // trun box: 4 bytes size + 4 bytes type + 1 byte version + 3 bytes flags
                    const flags = trunView.getUint32(8) & 0x00FFFFFF;
                    //const sampleCount = trunView.getUint32(12);

                    let offset = 16;

                    // Skip data-offset if present (flag 0x000001)
                    if (flags & 0x000001) offset += 4;

                    // Check first-sample-flags (flag 0x000004)
                    if (flags & 0x000004) {
                        const firstSampleFlags = trunView.getUint32(offset);
                        this.parserState.isKeyframe = ((firstSampleFlags >> 24) & 0x03) === 2;
                        offset += 4;
                    } else {
                        // If no first-sample-flags, check tfhd default-sample-flags
                        const tfhdPos = this.findBox(boxData, "tfhd");
                        if (tfhdPos !== -1) {
                            const tfhdBox = boxData.slice(tfhdPos);
                            const tfhdView = new DataView(tfhdBox.buffer);
                            const tfhdFlags = tfhdView.getUint32(8) & 0x00FFFFFF;

                            // Check if default-sample-flags present (flag 0x000020)
                            if (tfhdFlags & 0x000020) {
                                let tfhdOffset = 16; // After track_ID

                                // Skip base-data-offset if present (flag 0x000001)
                                if (tfhdFlags & 0x000001) tfhdOffset += 8;
                                // Skip sample-description-index if present (flag 0x000002)
                                if (tfhdFlags & 0x000002) tfhdOffset += 4;
                                // Skip default-sample-duration if present (flag 0x000008)
                                if (tfhdFlags & 0x000008) tfhdOffset += 4;
                                // Skip default-sample-size if present (flag 0x000010)
                                if (tfhdFlags & 0x000010) tfhdOffset += 4;

                                // Now read default-sample-flags
                                const defaultSampleFlags = tfhdView.getUint32(tfhdOffset);
                                this.parserState.isKeyframe = ((defaultSampleFlags >> 24) & 0x03) === 2;
                            }
                        }
                    }

                    // Extract sample duration if present (flag 0x000100)
                    if (flags & 0x000100) {
                        this.parserState.sampleDuration = trunView.getUint32(offset);
                    }

                    // Calculate timestamp from base time (in timescale units, convert to microseconds)
                    // Assuming timescale of 90000 (common for video)
                    this.parserState.timestamp = Math.floor((this.parserState.baseMediaDecodeTime / 90000) * 1_000_000);
                }
            } else if (boxType === "mdat") {
                // Handle mdat - decode frame
                // Only process if we have valid timing info
                if (this.parserState.timestamp >= 0) {
                    const chunk = new EncodedVideoChunk({
                        "type": this.parserState.isKeyframe ? "key" : "delta", // "key",
                        "timestamp": this.parserState.timestamp,
                        "duration": this.parserState.sampleDuration > 0 ? Math.floor((this.parserState.sampleDuration / 90000) * 1_000_000) : this.parserState.frameDuration,
                        "data": boxData.slice(8)
                    });
                    this.onChunk(chunk);
                } else {
                    console.warn("Skipping mdat without valid timestamp");
                }
            } else if (boxType === "moov") {
                const avcCPos = this.findBox(boxData, "avcC");
                if (avcCPos !== -1) {
                    const avcC = boxData.slice(avcCPos);
                    this.decoderConfig.description = avcC.slice(8);
                    this.onConfiguration(this.decoderConfig);
                }
            }
        }
    };

    appendDataWebM(data) {

    };

    appendDataOgg(data) {

    };

    async start(ffmpegPath, params, decoderConfig) {
        this.appendData = this.appendDataDefault;
        this.process = new FFmpegProcess();
        this.process.onData = (data) => {
            this.appendData(data);
        };
        this.process.onEnd = (error => {
            this.error = error;
            this.end();
        });
        this.decoderConfig = decoderConfig;
        await this.process.start(ffmpegPath, params);
        this.isRunning = true;
    };

    async end() {
        if (this.isRunning === false) {
            return;
        }
        this.isRunning = false;
        if (this.process && this.process.isRunning) {
            await this.process.end();
        }
        this.onEnd(this.error);
    };

};



module.exports = {
    FFmpegAudioEncoder,
    FFmpegVideoEncoder
};