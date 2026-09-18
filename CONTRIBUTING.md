# Contributing to Outputs

Thanks for helping. This is a small project, so the rules are short.

## Before you start

- Check open issues. Comment on one before starting large work so effort is not duplicated.
- For anything beyond a bug fix, open an issue first describing the change.
- Read [`docs/design.md`](docs/design.md). It defines the behavior the app must keep.

## Making a change

1. Fork the repo and create a branch from `main`.
2. Keep one change per pull request.
3. Build and run the tests before opening the PR:
   ```
   xcodebuild -project Outputs.xcodeproj -scheme Outputs -destination 'platform=macOS' test
   ```
4. Write commit subjects in [Conventional Commits](https://www.conventionalcommits.org) form: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
5. Fill in the pull request template.

## Code style

- Swift, SwiftUI, no third-party dependencies unless an issue agrees on one first.
- Comments explain a constraint or a failure mode, not what the next line does.
- Keep the legacy Electron app untouched. It is a reference, not a target.

## Windows port

The Windows version will be a separate native app built from `docs/design.md`. Discussion happens in issues tagged `windows`. If you want to lead it, open an issue and say so.
