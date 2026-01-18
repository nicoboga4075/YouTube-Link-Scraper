const https = require("https");
const fs = require("fs");
const path = require("path");
const logFile = "C:\\yt-dlp\\host.log";
const tools = { 
	"yt-dlp": {"path": "C:\\yt-dlp\\yt-dlp.exe", "url": "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"},
	"ffmpeg": {"path": "C:\\ffmpeg\\bin\\ffmpeg.exe", "url": "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"},
	"ffplay": {"path": "C:\\ffmpeg\\bin\\ffplay.exe", "url": "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"},
	"ffprobe": {"path": "C:\\ffmpeg\\bin\\ffprobe.exe", "url": "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"}
};

function log(msg) {
    try {
        if (!fs.existsSync(path.dirname(logFile))) fs.mkdirSync(path.dirname(logFile), { recursive: true });
        fs.appendFileSync(logFile, new Date().toISOString() + " " + (typeof msg === "string" ? msg : JSON.stringify(msg)) + "\n", { encoding: 'utf8' });
    } catch (err) { 
		return false; 
	}
}

log("Host started");

const { execSync } = require("child_process");
if (!require("fs").existsSync("node_modules")) {
    log("Installing dependencies...");
    execSync("npm install --no-audit --no-fund", { stdio: "ignore" });
}
const unzipper = require("unzipper");

function sendResponse(obj) {
    const json = JSON.stringify(obj);
    const buffer = Buffer.alloc(4 + Buffer.byteLength(json));
    buffer.writeUInt32LE(Buffer.byteLength(json), 0);
    buffer.write(json, 4);
    process.stdout.write(buffer);
    log("Response sent: " + json);
}

function download(toolName, callback) {
    const tool = tools[toolName];
    const toolPath = tool.path;
    const toolUrl = tool.url;
    const isZip = toolUrl.endsWith(".zip");
    const dir = path.dirname(toolPath);

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const tempFile = isZip ? path.join(dir, toolName + ".zip") : toolPath;

    log(`Downloading ${toolName} from ${toolUrl}`);
    sendResponse({ message: `Starting download of ${toolName}...` });

    function startDownload(url) {
        https.get(url, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                log(`Redirect ${res.statusCode} -> ${res.headers.location}`);
                return startDownload(res.headers.location);
            }
            if (res.statusCode !== 200) {
                return callback(new Error("Download failed: " + res.statusCode));
            }
            let file;
            try {
                file = fs.createWriteStream(tempFile);
            } catch (err) {
                log("WriteStream error: " + err.message);
                return callback(err);
            }
            res.pipe(file);
            file.on("finish", () => {
                file.close(() => {
                    log("Download finished: " + tempFile);
                    if (!isZip) {
                        sendResponse({ message: `${toolName} successfully installed` });
                        return callback(null);
                    }
                    log(`Extracting ${toolName} from zip`);
                    fs.createReadStream(tempFile)
                        .pipe(unzipper.Parse())
                        .on("entry", entry => {
                            const fileName = entry.path;
                            if (fileName.endsWith(path.basename(toolPath))) {
                                entry.pipe(fs.createWriteStream(toolPath));
                            } else {
                                entry.autodrain();
                            }
                        })
                        .on("close", () => {
                            fs.unlinkSync(tempFile);
                            sendResponse({ message: `${toolName} successfully installed` });
                            log(`${toolName} extracted to ${toolPath}`);
                            callback(null);
                        })
                        .on("error", err => callback(err));
                });
            });
            file.on("error", err => {
                log("File stream error: " + err.message);
                callback(err);
            });
        }).on("error", err => {
            log("Download error: " + err.message);
            fs.unlink(tempFile, () => callback(err));
        });
    }
    startDownload(toolUrl);
}

function installIfNotExists(toolName, callback) {
    const exePath = tools[toolName].path;
    log(`Checking if ${toolName} exists at ${exePath}`);
    if (fs.existsSync(exePath)) {
        sendResponse({ message: `${toolName} already installed` });
        return callback();
    }
    download(toolName, (err) => {
        if (err) {
            sendResponse({ message: `Error installing ${toolName}: ${err.message}` });
            log(`Installation failed for ${toolName}: ${err.message}`);
        }
        callback();
    });
}

function installAllTools() {
    const toolsList = Object.keys(tools);
    let index = 0;
    function next() {
        if (index >= toolsList.length) {
			sendResponse({ message: "ALL_TOOLS_INSTALLED" });
			return;
		}
        const tool = toolsList[index++];
        installIfNotExists(tool, next);
    }
    next();
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
        const msgLength = buffer.readUInt32LE(0);
        if (buffer.length < 4 + msgLength) {
            log("Incomplete message, waiting for more data");
            break;
        }
        const msgBuffer = buffer.slice(4, 4 + msgLength);
        const msgText = msgBuffer.toString("utf8");
        buffer = buffer.slice(4 + msgLength);
        try {
            const msg = JSON.parse(msgText);
            log("Message: " + JSON.stringify(msg));
            if (msg.command === "install") {
                installAllTools();
            } else {
                log("Unknown command received");
                sendResponse({ message: "Unknown command" });
            }
        } catch (err) {
            log("JSON parse error: " + err.message);
        }
    }
});