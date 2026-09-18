const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const ffprobePath = require("ffprobe-static").path;
const ffmpegPath = require("ffmpeg-static");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#1a1a2e",
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: Probe file with ffprobe
ipcMain.handle("probe-file", async (_event, filePath) => {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];

    execFile(ffprobePath, args, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(new Error(`ffprobe error: ${err.message}`));
        return;
      }
      try {
        const data = JSON.parse(stdout);
        const audioStreams = data.streams
          .filter((s) => s.codec_type === "audio")
          .map((s, i) => ({
            index: s.index,
            channels: s.channels,
            channelLayout: s.channel_layout || null,
            sampleRate: parseInt(s.sample_rate, 10),
            codec: s.codec_name,
            language: (s.tags && s.tags.language) || null,
            title: (s.tags && s.tags.title) || null,
          }));
        const videoStream = data.streams.find((s) => s.codec_type === "video");

        if (audioStreams.length === 0) {
          reject(new Error("No audio stream found in file"));
          return;
        }

        resolve({
          audioStreams,
          duration: parseFloat(data.format.duration),
          hasVideo: !!videoStream,
          filename: path.basename(filePath),
        });
      } catch (parseErr) {
        reject(
          new Error(`Failed to parse ffprobe output: ${parseErr.message}`),
        );
      }
    });
  });
});

// IPC: Open file dialog
ipcMain.handle("open-file-dialog", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media Files",
        extensions: [
          "mp3",
          "wav",
          "flac",
          "aac",
          "ogg",
          "mp4",
          "mkv",
          "mov",
          "avi",
          "webm",
          "m4a",
        ],
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) return [];
  return result.filePaths;
});

// IPC: Read file as ArrayBuffer
ipcMain.handle("read-file", async (_event, filePath) => {
  const buffer = await fs.promises.readFile(filePath);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
});

// IPC: Extract a specific audio stream to WAV using ffmpeg
ipcMain.handle(
  "extract-audio-stream",
  async (_event, filePath, streamIndex) => {
    // Use ffmpeg-static binary
    const tmpPath = path.join(
      app.getPath("temp"),
      `channel-router-stream-${streamIndex}-${Date.now()}.wav`,
    );

    return new Promise((resolve, reject) => {
      const args = [
        "-y",
        "-i",
        filePath,
        "-map",
        `0:${streamIndex}`,
        "-acodec",
        "pcm_s16le",
        "-ar",
        "48000",
        tmpPath,
      ];

      execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 10 }, (err) => {
        if (err) {
          reject(new Error(`ffmpeg extract error: ${err.message}`));
          return;
        }
        fs.promises
          .readFile(tmpPath)
          .then((buffer) => {
            // Clean up temp file
            fs.promises.unlink(tmpPath).catch(() => {});
            resolve(
              buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength,
              ),
            );
          })
          .catch(reject);
      });
    });
  },
);
