# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Layout

- Repo root: `Outputs.xcodeproj` and `Outputs/`, the native macOS app in Swift and SwiftUI. This is the target.
- `legacy/electron/`: the original Electron app. It is the executable reference for behavior until the Swift app reaches parity. Do not extend it.
- `docs/design.md`: platform-neutral behavior spec. Update it in the same change when behavior changes.

## Commands

```
xcodebuild -project Outputs.xcodeproj -scheme Outputs -destination 'platform=macOS' build
xcodebuild -project Outputs.xcodeproj -scheme Outputs -destination 'platform=macOS' test
xcodebuild -project Outputs.xcodeproj -scheme Outputs -destination 'platform=macOS' test -only-testing:OutputsTests/TimeFormattingTests/zero
```

Legacy app: `cd legacy/electron && npm install && npm start`.

The Xcode project uses a file-system-synchronized group, so a new `.swift` file under `Outputs/` joins the target without editing the project file.

## Architecture

Planned engine design, mirroring `legacy/electron/renderer/audio-engine.js`:

- One `AVAudioEngine` per output device. Each engine's output audio unit is pinned to a device with CoreAudio's `kAudioOutputUnitProperty_CurrentDevice`.
- Every audio track is decoded fully into a PCM buffer with `AVAssetReader`. The routing map `{ trackIndex: { a, b } }` decides which engines get a player node for that track. Player nodes on one engine feed a shared delay node.
- Playback is rebuilt from scratch on every state change (play, seek, routing, device). Position comes from the engine clock plus the saved offset. Nothing else keeps time.
- Video is a muted `AVPlayer` snapped to the audio clock when drift exceeds 50 ms.

No third-party dependencies. No user accounts, cloud, or telemetry.
