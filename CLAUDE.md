# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

The repo root holds one project: `channel-router/`, an Electron desktop app that routes the audio streams of a media file to two output devices at once. All commands below run from `channel-router/`.

## Commands

```
npm install      # installs electron, ffmpeg-static, ffprobe-static
npm start        # electron .
```

There is no build step, linter, or test suite. Verify changes by running the app and loading a media file.

## Architecture

Plain JavaScript, no bundler, no framework. Three renderer scripts load in order via `<script>` tags in `renderer/index.html` and share the global scope: `device-manager.js`, then `audio-engine.js`, then `app.js`. Each is an IIFE that exposes one global (`DeviceManager`, `AudioEngine`, or nothing for `app.js`).

### Main process (`main.js`)

Owns the ffmpeg/ffprobe binaries and all filesystem access. It exposes four IPC handlers, each mirrored one-to-one in `preload.js` as `window.electronAPI`:

- `probe-file`: runs ffprobe and returns the list of audio streams (index, channels, codec, language, title) plus duration and whether a video stream exists.
- `extract-audio-stream`: runs ffmpeg to decode one stream to a 48 kHz 16-bit WAV in the OS temp dir, reads it into an ArrayBuffer, deletes the temp file, and returns the buffer.
- `open-file-dialog`: multi-select media file picker.
- `read-file`: raw file to ArrayBuffer (currently unused by the renderer).

Context isolation is on and node integration is off. Any new main-process capability needs a handler in `main.js` and a matching entry in `preload.js`.

### Audio engine (`renderer/audio-engine.js`)

The core design: two independent `AudioContext` instances, one per output device, created with `{ sinkId }`. Each decoded stream is an `AudioBuffer`. A routing map `{ [streamIndex]: { a: bool, b: bool } }` decides which contexts get a buffer source for that stream. All sources on a context feed a shared `DelayNode` (max 0.5 s) used for Bluetooth latency compensation.

Playback is rebuilt from scratch on every state change. Play, seek, routing change, and device change all call `_stopAll()` then `_rebuildAndPlay()`, which recreates every buffer source and starts them at `ctx.currentTime + 0.05` from the saved `_offset`. Buffer sources cannot be restarted, so this is the only way to resume. Current time is derived from the context clock minus `_startTime`, not from any element.

Decoding always uses context A, so context A is created lazily even if the user only routes to B.

### UI (`renderer/app.js`)

Handles playlist, file loading, transport, routing checkboxes, delay sliders, and video. Loading a file probes it, then extracts and decodes every audio stream sequentially before building the routing rows.

Video is a plain `<video>` element with `src="file://..."` that is never the audio source. A `requestAnimationFrame` loop reads the audio engine's clock and snaps `videoPlayer.currentTime` when drift exceeds 50 ms, and plays or pauses the element to match the engine.

Selected output device IDs persist in `localStorage` under `outputA` and `outputB`. Device labels only appear after `getUserMedia` permission is granted once at startup.
