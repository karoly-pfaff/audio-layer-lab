# Audio Layer Lab

A browser-based audio laboratory for experimenting with layered game music, ambient compositions, and AI-generated audio tracks. Built specifically for rapid listening and iteration — not for editing or production.

---

## Use cases

- Testing Suno-generated music layers
- Combining ambient loops for game atmospheres
- Previewing layered dynamic soundtrack concepts
- Quickly checking how independent loops blend in real time

---

## Features

### Playback

- Main track with optional loop, seek, play/pause/stop
- Dynamic layer stack (up to 12 layers) — add and remove layers at any time; drag, dedicated move buttons, or keyboard (↑/↓, Home/End) to reorder; always looping, phase-aligned to the shared clock
- Master volume and master mute
- Keyboard shortcuts: `Space` play/pause · `Esc` stop · `Home` restart · `← →` jump ±5s · `M` master mute

### Mixer

- Per-track volume, per-layer pan
- Per-layer mute and solo (with correct mute-beats-solo precedence)
- Live playback clock (current time / duration) in the main track header
- Dedicated Mix / State / Action control columns for consistent visual hierarchy

### Stereo Output Meter

- Real-time L/R RMS level metering on the transport bar
- Segmented bar display using the design palette (green → amber → red)
- Asymmetric smoothing: fast attack (0.3), slow decay (0.88) for natural VU feel
- Passive metering tap after the master gain node — does not alter the signal path

### Loading

- File picker or drag-and-drop onto the main track panel, any layer row, or the layer section (fills empty slots in order)
- ID3 / Vorbis metadata extraction (title, artist, album from embedded tags)
- Embedded artwork displayed when present; a local musical-note placeholder is used as fallback
- Loading, remembered, failed, and empty states clearly indicated per track

### BPM Detection

- Sample-rate-aware analysis in a bounded, cancellable Web Worker queue
- `music-tempo` dynamically imported (zero initial bundle impact)
- BPM badge near duration chips; `~` prefix for low-confidence readings
- Layer BPM compared to main track: compatible / close / half-double / mismatch
- Mismatch/half-double states are written out in the badge and explained by its accessible name

### Waveform

- Canvas-based renderer with offscreen pre-computation cache
- Main track waveform is seekable — click or drag (mouse, touch, stylus)
- Keyboard-accessible seek and pan controls with native slider semantics
- Layer waveforms show an animated playhead tracking the loop position

### Loop Health

- Automatic boundary check on every loaded layer
- Warnings for: too short, loud boundary, leading silence, trailing silence
- 10ms linear fade-in/out applied at buffer ends to eliminate click on loop point

### Session Persistence

- Mix state is auto-saved to `localStorage` on every change
- Original audio bytes are stored locally in OPFS, with an IndexedDB byte-storage fallback
- SHA-256 content identities deduplicate the same audio loaded into multiple tracks or snapshots
- Reloading the app restores and decodes saved audio automatically, so the session is immediately playable
- Reset removes both the mix state and its locally stored audio; unreferenced assets are pruned automatically
- A fenced single-writer lease prevents multiple tabs from overwriting each other's session data; takeover rehydrates the latest durable state before editing, stops the displaced audio engine, and uses immutable OPFS revisions so an older cleanup cannot delete replacement media
- Schema v4; v1/v2/v3 sessions migrate automatically and remain manually reloadable

### Presets

- Export session as a JSON `.preset` file
- Import preset — restores all settings; audio files require reload

### Snapshots & A/B

- Up to 12 named mix snapshots
- Apply, rename, duplicate, delete
- A/B slots for instant mix comparison

### Accessibility

- WCAG 2.2 Level AA is the product-interface conformance target
- Semantic headings, landmarks, lists, dialogs, status announcements, and descriptive control names
- Complete keyboard operation with a skip link, visible focus, modal focus management, and focus restoration
- Single-pointer alternatives for drag operations and minimum 24 × 24 CSS pixel interactive targets
- AA text and non-text contrast tokens, forced-colors support, and reduced-motion support
- Reflow without horizontal scrolling at 320 CSS pixels and resilient WCAG text spacing
- Automated axe-core and contrast-token regression tests run as part of `npm test`

The scope, verification matrix, and user-supplied-content boundary are documented in
[`docs/accessibility.md`](docs/accessibility.md).

---

## What this app does not do

- No audio editing or waveform cutting
- No timeline sequencing or beat grids
- No BPM correction or time-stretching
- No MIDI
- No mastering or rendered audio export
- No backend or cloud sync
- BPM values are informational only — the app never alters audio to match tempo

---

## Privacy

- **Audio files never leave your device.** All decoding, analysis, and playback happen entirely in the browser.
- No audio data is uploaded anywhere.
- **No track data or filenames are sent to third-party services.** Embedded artwork is displayed locally; tracks without artwork use the built-in placeholder.
- The production UI uses local system fonts and makes no third-party font or artwork requests.
- Session settings are stored in `localStorage`; original audio bytes are stored in origin-private
  browser storage (OPFS or IndexedDB fallback) on your device.
- Clearing this site's browser data also deletes its saved sessions and audio. JSON preset exports
  deliberately exclude local audio references and never embed audio content.

---

## Tech Stack

- TypeScript + React 18
- Vite
- Web Audio API (no Tone.js)
- Custom canvas waveform renderer (no wavesurfer.js)
- Zustand (state management)
- Playwright — production-build end-to-end tests in Chromium, Firefox, and WebKit
- `music-metadata` — ID3 tag extraction, lazy-loaded
- `music-tempo` — BPM detection inside a dedicated worker

---

## Documentation

| Document                                         | Purpose                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| [`docs/architecture.md`](docs/architecture.md)   | Runtime boundaries, state ownership, storage, and audio identity |
| [`docs/accessibility.md`](docs/accessibility.md) | WCAG 2.2 AA contract and manual review matrix                    |
| [`docs/code-quality.md`](docs/code-quality.md)   | Engineering rules, test policy, and review checklist             |
| [`docs/versioning.md`](docs/versioning.md)       | Semantic versioning and release procedure                        |
| [`docs/roadmap.md`](docs/roadmap.md)             | Shipped milestones and release history                           |
| [`docs/backlog.md`](docs/backlog.md)             | Non-blocking ideas for future releases                           |

---

## Install & Run

Node.js 24 and npm 11 or newer are required.

```bash
npm ci
npx playwright install chromium firefox webkit
npm run dev
```

## Build

```bash
npm run build
```

Initial bundle is approximately 227 kB / 70 kB gzip. The BPM worker is a separate ~15 kB asset.

## Test

```bash
npm test
```

515 tests across 37 files: audio-engine lifecycle, audio utilities, async load cancellation,
validated persistence and schema migration, presets, identity-aware snapshots, accessible controls,
WCAG structure and color tokens, browser-media storage fallbacks, action workflows, navigation,
layer ordering, and identity.

Run the focused accessibility regression suite with:

```bash
npm run test:a11y
```

## End-to-end tests

The Playwright suite builds the production application, starts an isolated preview server, and
exercises 30 release-critical browser scenarios from `tests/e2e/` across Chromium, Firefox, and
WebKit:

- clean startup, keyboard help focus management, responsive 320px layout, and dynamic layer limits;
- single-writer enforcement and a durable, reload-safe session handoff across two same-origin tabs;
- real WAV loading and decoding, mixing, playback, seeking, and decode-failure recovery;
- playable audio restoration across reloads, snapshot rename/duplicate/A-B behavior, preset
  import/export, and stored-audio cleanup on reset.

```bash
npm run test:e2e
```

Use `npm run test:e2e:headed` for an interactive browser run and `npm run test:e2e:report` to open
the last HTML report. Screenshots, videos, traces, and reports are kept under `output/playwright/`.
Playwright's Windows WebKit runtime omits Web Audio, so native decoding is verified in Chromium and
Firefox; WebKit still runs the UI, responsive, persistence, snapshot, and preset flows with a
deterministic test-only audio shim.

## Coverage

The release gate measures every executable TypeScript/TSX source file, including files not imported
by a test. Current global coverage is 97.23% statements, 91.39% branches, 98.39% functions, and
97.38% lines.

```bash
npm run test:coverage
```

The build fails below 95% statements, 90% branches, 95% functions, or 95% lines. The detailed HTML
report is written to `coverage/index.html`.

## Typecheck

```bash
npm run typecheck
```

## Lint

```bash
npm run lint
```

## Full quality gate

Run the same checks as CI: formatting, lint, duplication and dead-code detection, TypeScript,
high-severity dependency advisories, coverage thresholds, unit/integration tests, the production
build, and the complete Playwright E2E suite.

```bash
npm run verify
```

The detailed engineering contract is documented in
[`docs/code-quality.md`](docs/code-quality.md), with runtime ownership and dependency boundaries in
[`docs/architecture.md`](docs/architecture.md).

## Preview build

```bash
npm run preview
```

---

## Browser Support

| Browser                   | Status                    | Notes                                                |
| ------------------------- | ------------------------- | ---------------------------------------------------- |
| Chrome / Chromium 111+    | ✅ Tested                 | Primary development target                           |
| Firefox 114+              | ✅ Tested                 | Included in the Playwright matrix                    |
| Edge 111+                 | ✅ Supported              | Shares the Chromium build target                     |
| Safari 16.4+              | ⚠️ Supported with caveats | Manual verification required; see Safari notes below |
| Mobile Chrome (Android)   | ✅ Works                  | Touch seek supported                                 |
| Mobile Safari (iOS 16.4+) | ⚠️ Supported with caveats | Manual device verification required                  |

### Safari / iOS Safari notes

- **AudioContext autoplay policy**: Safari requires a user gesture before audio starts. The app calls `AudioContext.resume()` on the first play interaction — this should work correctly.
- **AudioContext `interrupted` state**: On iOS, a phone call or backgrounding can set the context to `'interrupted'`. The app handles this state and calls `resume()` when playback is requested again.
- **`decodeAudioData`**: Safari may reject some audio formats (e.g., FLAC on older versions). Use MP3, AAC, or WAV for broadest compatibility.
- **Drag-and-drop**: Works on desktop Safari. On iOS, file picker works; system-level drag-and-drop is not available.
- **`music-metadata`**: Dynamic import works; ID3 parsing is pure JS with no native dependencies.
- **Local media storage**: OPFS is preferred. If Safari rejects an OPFS operation, the app
  transparently stores the audio bytes in IndexedDB instead.

### Firefox notes

- Firefox is part of the automated browser matrix. AudioContext is resumed from the explicit Play
  interaction to comply with its autoplay policy.

---

## Known Limitations

- BPM detection is best-effort. Non-rhythmic, ambient, or very short audio commonly returns no result.
- BPM confidence is heuristic (value range only), not derived from beat strength signal.
- Tracks without embedded artwork use the built-in musical note placeholder and make no network request.
- Embedded artwork blob URLs are not persisted across page reloads — artwork regenerates on each session.
- Tracks imported from JSON presets, migrated from pre-v4 sessions, or loaded while browser storage
  is unavailable remain `remembered` and require manual file selection.
- Browser storage is device- and origin-specific. Clearing site data, switching domains, or using a
  private session removes or isolates the saved audio.
- BPM analysis uses at most the first 60 seconds. Input files are limited to 100 MB, decoded audio
  to 256 MB per track, and retained session audio to 512 MB in total. Recognized formats are
  preflighted from their duration/sample format before browser decoding; the limit is checked again
  against the resulting `AudioBuffer`.

---

## Troubleshooting

**Audio does not start when I click Play.**
The browser may have blocked the AudioContext until a user gesture. Click anywhere on the page, then try Play again. A toast message will appear if the audio context fails to resume.

**BPM badge shows "BPM…" indefinitely.**
Analysis runs in a worker. For long or complex files it may take several seconds. If the file is
ambient/non-rhythmic, analysis completes but returns no result (the badge disappears).

**Session not restored after page reload.**
Check that site storage is enabled and has available quota. Private/incognito mode typically clears
localStorage, IndexedDB, and OPFS when the private session closes. If the app reported that an audio
file could not be saved locally, reload that file manually and check the browser's storage settings.

**Layer plays out of sync with main track.**
Layers are synchronized to the shared AudioContext clock. If drift is observed, try stopping and restarting playback. Very short layers (< 0.3s) may produce audible artifacts at loop boundaries.

---

## License

Audio Layer Lab is open-source software licensed under the [ISC License](LICENSE).
