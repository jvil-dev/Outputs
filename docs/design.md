# Outputs design

Platform-neutral description of what the app does. The macOS app implements it with AVFoundation and CoreAudio. A Windows port implements the same behavior with Media Foundation or WASAPI. The legacy Electron app in `legacy/electron` is the executable reference for every rule below.

## Purpose

Play one media file and send each of its audio tracks to output device A, output device B, or both, at the same time. Two devices with different latency (a wired speaker and a Bluetooth headset) can be aligned with a per-output delay.

## Concepts

- **Track**: one audio stream inside the file, identified by its stream index. A file may have several (languages, commentary, stems).
- **Output**: one of exactly two playback destinations, A and B. Each is bound to one system audio device chosen by the user.
- **Routing map**: `{ trackIndex: { a: Bool, b: Bool } }`. Default for every track is `a: true, b: false`. A track routed to both plays on both. Several tracks routed to one output mix together at unity gain.
- **Delay**: seconds of extra latency applied to everything on one output, 0 to 0.5 s, 1 ms steps. Used to line up devices.
- **Position**: current playback time in seconds, derived from the audio clock, not from a video element.

## Pipeline

1. **Probe** the file. Produce the list of tracks (index, channel count, codec, language tag, title tag), the duration, and whether a video stream exists. A file with no audio track is an error.
2. **Decode** every track fully into memory as PCM at a single sample rate (the reference uses 48 kHz). Duration of the file is the longest track.
3. **Build** playback for each output: for every track whose routing includes that output, create a source feeding a shared delay node for that output, which feeds the device.
4. **Start** every source at the same scheduled time, offset by the saved position.

## Playback rules

- Play, pause, seek, routing change, delay change, and device change all rebuild step 3 and 4 from the saved position. Sources are never reused. This is how pause and resume work.
- Seek clamps to `[0, duration]`.
- When the longest track ends, position resets to 0 and the transport shows stopped.
- Changing a device while playing resumes at the same position on the new device.
- Changing the delay while playing updates the live delay node without a rebuild.

## Video

If the file has video, show it muted. On every frame, compare the video element's time to the audio position. If they differ by more than 50 ms, set the video time to the audio position. Play or pause the video to match the audio state. Video never drives the clock.

## Playlist

An ordered list of files without duplicates. Adding files when nothing is loaded loads the first. Removing the active item loads the item now at that index, or the last item. Previous and next move within the list. When the active file ends and a next item exists, it loads and plays automatically.

## Persistence

The chosen device IDs for A and B, and the delay for each output. No accounts, no cloud, no telemetry.

## Keyboard

Space toggles play. Left and right arrows seek 5 s. F toggles fullscreen video when video is visible.

## Known reference limitations

- Everything is decoded into memory, so very long files use a lot of RAM.
- Output device list needs microphone permission once on macOS to show device names.
