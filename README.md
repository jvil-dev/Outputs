# Outputs

Play a media file and send each of its audio tracks to one or two output devices at once, with a per-output delay to line up Bluetooth and wired speakers. Native macOS app in Swift and SwiftUI.

[![CI](https://github.com/jvil-dev/Outputs/actions/workflows/ci.yml/badge.svg)](https://github.com/jvil-dev/Outputs/actions/workflows/ci.yml)

## Status

Early rewrite. The Swift app opens a placeholder window only. The working reference is the Electron app in [`legacy/electron`](legacy/electron), which the Swift app is being built to match.

## Requirements

- macOS 14 or later
- Xcode 16 or later

## Build and run

Open `Outputs.xcodeproj` in Xcode and press Run, or from a terminal:

```
xcodebuild -project Outputs.xcodeproj -scheme Outputs -destination 'platform=macOS' build
xcodebuild -project Outputs.xcodeproj -scheme Outputs -destination 'platform=macOS' test
```

## How it works

Each output device gets its own audio engine. A routing map decides which engine plays each track. Every play, seek, routing change, or device change tears down the sources and rebuilds them from the saved position. Video is a muted player that follows the audio clock. The full design, written so it can be ported to other platforms, is in [`docs/design.md`](docs/design.md).

## Roadmap

1. Reach parity with the legacy Electron app: device pickers, file loading, routing, delay, video sync, playlist.
2. Ship a signed `.app` release.
3. Native Windows port, built from the design doc. Issues tagged `windows` track it.

No user accounts, no cloud, no telemetry.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
