# Audio Layer Lab — Post-1.0 Backlog

v1.0.1 is the current professional-quality baseline. Its release gate covers 515 automated tests,
zero lint warnings, zero duplicated blocks, dead-code analysis, strict TypeScript, a production
build, dependency audit, and desktop/mobile browser smoke tests.

The items below are optional future improvements. None are blocking.

---

## UX / Playback

- **Peak hold on stereo meter** — show a brief peak indicator at max level before decay
- **BPM tap-in** — manual BPM entry / tap tempo when auto-detection returns no result
- **Crossfade between layers** — smooth automated volume ramp when applying snapshots
- **Layer grouping** — logical groups for batch mute/solo

## Visualization

- **Waveform zoom** — higher-resolution scrub view for fine-grained seeking
- **Spectrogram overlay** — optional frequency-domain view on the main waveform

## Session / Workflow

- **Export session as M3U** — save a playlist of the loaded file paths for use in external tools

## Platform

- **Offline-first PWA** — installable app shell; audio files are excluded from caching (user-provided)
- **Dynamic soundtrack simulation** — hotkey-triggered layer swaps for game audio prototyping
- **Randomized ambient rotation** — scheduled layer cycling for generative ambience testing
