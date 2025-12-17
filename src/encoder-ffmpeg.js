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
            this.process = spawn("ffmpeg", params, {"cwd": ffmpegPath});

            const startResolver = () => {
                this.isRunning = true;
                this.process.removeListener("close", startRejecter);
                resolve();
            };
            const startRejecter = (code) => {
                this.code = code;
                this.process.stdout.removeListener("data", startResolver);
                reject(new Error("FFmpeg process exited before starting."));
                
            };
            this.process.stdout.once("data", startResolver);
            this.process.once("close", startRejecter);
        });

        // create listeners
        this.process.stdout.on("data", (data) => {
            this.onData(data);
        });
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
        }
        this.onEnd(this.error);
    };

};

const FFmpegVideoEncoder = class {
    constructor() {

    }
};

const FFmpegAudioEncoder = class {
    constructor() {

    }
};

module.exports = {
    FFmpegVideoEncoder,
    FFmpegAudioEncoder
};