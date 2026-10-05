# Audio Layer Lab Roadmap

## ✅ v0.1 — Core Playback Foundation
- Vite + React + TypeScript project setup
- Web Audio API engine (AudioEngine singleton)
- Shared playback clock (single AudioContext)
- Main track loading + decode
- Layer track loading (5 slots)
- Loop support (layers always loop; main track optional)
- Volume controls
- Play / pause / stop
- Canvas waveform renderer

---

## ✅ v0.2 — Mixer & Layer Management
- Mute / solo controls (with precedence logic)
- Pan controls (StereoPannerNode)
- Replace layer while playing
- Persistent layer slots
- Loading states (empty / loading / loaded / failed)
- Phase-coherent loop offset sync

---

## ✅ v0.3 — Visual Design System
- Premium dark audio-tool aesthetic
- Warm amber + periwinkle accent palette
- Privacy-preserving system display, body, and monospace font stacks
- Hover / active transitions
- Waveform seek (click-to-seek on main track)
- Status indicator dot (playing / muted / stopped)

---

## ✅ v0.4 — Session Persistence & Completion Handling
- localStorage auto-save and restore
- `playGeneration` guard for stale `onended` closures
- Thumbnail fallback experiment (removed before the current privacy-hardened release)
- Blob URL lifecycle management

---

## ✅ v0.5 — Preset Import / Export
- Serialize/download session as JSON preset
- Import preset, restore all settings
- Status toast messages with auto-dismiss
- Solo safety for unloaded layers

---

## ✅ v0.6 — Audio Metadata & Loading States
- `music-metadata` dynamic import (ID3, Vorbis tags)
- Embedded artwork extraction and display
- Granular loading state model: `empty | remembered | loading | loaded | failed`
- 15ms fade-in on every play() to eliminate click/pop

---

## ✅ v0.7 — Snapshots & A/B Workflow
- Mix snapshots (up to 20, named, persistent)
- Save / apply / rename / duplicate / delete snapshots
- A/B comparison slots (→A, →B, then A/B to toggle)
- Persistence schema v2; v1 → v2 migration

---

## ✅ v0.8 — Loop Polish & Navigation
- Loop boundary smoothing (10ms fade-in/out on layer buffer ends)
- Loop health indicators (tooShort, loudBoundary, leading/trailing silence)
- Layer waveform animated playhead
- Transport seek buttons (⏮ / ⏪ / ⏩)
- Keyboard shortcuts: Home / ← → / Space / Esc / M
- Keyboard help popover (`?` button)
- Drag-and-drop for main track and all layer rows
- Multi-file drop to fill empty layer slots
- Improved failed-state retry UI

---

## ✅ v0.9 — BPM Detection & Compatibility Hints
- `music-tempo` BPM analysis (dynamically imported, lazy-split chunk)
- Async non-blocking analysis; `bpmAnalyzing` flag drives "BPM…" badge
- Name-guard prevents stale async result from landing after slot reuse
- BPM normalization to [60, 120) octave for half/double comparison
- Compatibility relations: compatible / close / halfDouble / mismatch
- BPM badge on main track and layer rows; mismatch/half-double tooltips
- Persistence schema v3; BPM in presets and snapshots; v1/v2 migrate cleanly

---

## ✅ v0.10 — Release Hardening & Quality Pass
- Fixed three undefined CSS variable references (`--accent-primary`, `--accent-secondary`, `--font-body`)
- Removed dead `.session-reset-btn` CSS block
- State consistency: `clearMainTrack`, `resetSession`, `importPreset` now reset BPM fields
- Accessibility: `aria-label` on range inputs, `aria-pressed` on toggle buttons, drag-drop zone label
- Remove/clear button now visible for `remembered` and `failed` states (not just loaded)
- Responsive layout: graceful degradation at 900px and 600px
- 16 new tests in bpm.test.ts (normalizeBpm boundaries, getBpmRelation boundaries, formatBpm edge cases, detectBpm silent/stereo)

---

## ✅ v1.0-rc.1 — Release Candidate (Stabilization)
- AudioContext `'interrupted'` state handled (iOS Safari phone-call/background resume)
- Stale load-token guard: rapid main track / layer replacement can no longer land stale state
- Play action catches AudioContext resume failure with user-friendly status message
- WaveformDisplay: pointer events replace mouse-only events — touch and stylus now seek correctly
- `touch-action: none` on seekable waveform prevents accidental page scroll during scrub
- `setPointerCapture` enables drag-seek even when pointer leaves the canvas boundary
- Waveform canvas exposed as `role="slider"` with `aria-valuenow` for screen readers
- `clampRatio` utility extracted from WaveformDisplay and tested (7 new tests)

---

## ✅ v1.0.0 — Stable Release (2026-05-28)
- **Stereo output meter**: real-time L/R RMS bars on the transport bar; passive tap after master gain node; asymmetric smoothing (attack 0.3, decay 0.88); design-palette colors (green → amber → red); aria-hidden; hidden at ≤600px
- Playback clock moved into MAIN TRACK header row; isolated `MainTrackClock` component prevents 60fps re-renders from propagating to AppShell
- Metering helpers (`computeRMS`, `rmsToNormalized`, `smoothLevel`, `clampLevel`) covered by 17 pure-function tests
- Unused `wavesurfer.js` dependency removed from package.json
- All pre-existing test fixture bugs (`pan` field missing from MixSnapshot) fixed
- 250 passing tests, 0 lint warnings, clean build (~197 kB / 62 kB gzip)
- Manual cross-browser smoke tests completed

---

## ✅ v1.0.1 — Layer Stack & Layout Pass (2026-05-29)
- **Stable layer identity**: layers use stable IDs that survive reorder and session restore; no more index-based identity
- **Dynamic layer stack**: add and remove layers at runtime (up to the configured limit)
- **Drag-and-drop reorder**: drag the handle on any layer row to reorder
- **Keyboard reorder**: Alt+↑ / Alt+↓ on the drag handle moves a layer up or down
- **Dynamic persistence**: session schema extended to persist dynamic layer count and order
- **Dynamic snapshots & A/B**: mix snapshots and A/B slots capture and restore dynamic layer configurations
- **Layout consistency pass**: uniform column grid across main track and all layer rows; `--controls-col-width`, `--state-controls-width`, `--action-controls-width` CSS tokens
- **Control hierarchy pass**: Mix (VOL+PAN), State (M/S/LOOP), and Action (+/✕) controls separated into dedicated columns
- **Empty-layer removal fix**: empty layer slots can now be removed; last remaining layer is protected
- 312 tests, 18 test files; 0 lint warnings; TypeScript strict clean; build ~201 kB / 63 kB gzip

---

## Post-1.0 Ideas

These are out of scope for the initial stable release but worth considering:

- **Crossfade between layers** — smooth volume automation between presets
- **Layer grouping** — logical groups for mute/solo
- **BPM tap-in** — manual BPM override when auto-detection fails
- **Waveform zoom** — scrub at higher resolution for fine-grained seeking
- **Spectrogram view** — optional frequency-domain overlay
- **Randomized ambient rotation** — cycle through layers on a schedule
- **Dynamic soundtrack simulation** — trigger layer changes on a hotkey
- **Export session as M3U** — playlist of file paths for external tools
- **Offline-first PWA** — installable, works offline (audio files excluded)
- **Peak hold** on stereo meter — brief peak indicator at max level before decay
