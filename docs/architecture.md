# Architecture

Audio Layer Lab is a client-only React application. Decoded audio stays in memory, while original
file bytes can be retained in origin-private browser storage so a session remains playable after a
reload. Nothing is uploaded to an application backend.

## Runtime boundaries

- `sources/audio/AudioEngine.ts` owns Web Audio nodes, the shared playback clock, looping, gain,
  pan, solo/mute resolution, fades, and metering. It accepts an `AudioContext` in tests.
- `sources/store/useAudioLabStore.ts` is the Zustand composition root. It wires initial state,
  action groups, persistence, and the engine's natural-completion callback; it contains no domain
  workflows.
- `sources/store/trackActions.ts` owns track/layer mutations. `audioFileLoader.ts` enforces file and
  decoded-memory limits through a bounded decode queue, while `loadCoordinator.ts` invalidates and
  aborts stale continuations after replacement, clear, reset, import, removal, or snapshot
  application. Completed-but-cancelled loads explicitly dispose their artwork and storage leases.
  BPM analysis runs in a bounded, cancellable module-worker queue.
- `sources/store/mediaStorage.ts` owns content-addressed durable audio. It prefers OPFS, records
  asset metadata in IndexedDB, falls back to IndexedDB byte storage when OPFS is unavailable, and
  treats quota or browser-storage failure as non-fatal to the active mix. Storage mutations are
  serialized, and an asset lease protects each completed write until its state reference has been
  published. Cancellation is checked before hashing, OPFS/IndexedDB commit, and delivery; a
  completed-but-cancelled write awaits durable-reference garbage collection. Garbage collection
  reads keys rather than loading stored audio bytes.
- `sources/store/sessionOwnership.ts` maintains an origin-local renewable single-writer lease. A
  second tab is visibly blocked until the first closes or the user explicitly takes over. Session
  writes and destructive media collection share this authority boundary. Persistence never
  acquires a lease as a side effect, and a tab that has lost its fenced lease can resume only by an
  explicit takeover. Delayed storage events retain their takeover evidence even across an unload
  gap.
- `sources/store/mediaRestoration.ts` rehydrates referenced files through the normal track-loading
  workflow. Restoration and preset-import continuations are invalidated on ownership loss.
  `assetReferences.ts` computes the live asset set across the current mix, snapshots, and A/B slots
  so replacement and deletion can safely prune unreferenced content.
- `sources/store/transportActions.ts` owns playback and master-output commands.
- `sources/store/sessionActions.ts` owns reset and preset import/export lifecycle cleanup.
- `sources/store/snapshotActions.ts` coordinates snapshot and A/B commands.
  `snapshotApplication.ts` computes identity-aware state transitions separately from engine side
  effects.
- `sources/store/persistence.ts`, `snapshots.ts`, and `storedLayer.ts` form the untrusted-data
  boundary. They cap collection sizes, normalize identities/order, constrain numeric values and
  BPM, reject unsafe artwork URL schemes, and accept only generated local asset-ID formats.
- `sources/components` renders state and forwards user intent. Custom sliders and waveform seeking
  implement keyboard and pointer interaction with native ARIA semantics.

## State and audio identity

Decoded `AudioBuffer` objects are session-only. Durable tracks and local snapshots reference the
original file through a SHA-256 content ID; startup reads the bytes from OPFS or IndexedDB and
decodes them again. Identical content shares one stored asset. A snapshot retains an in-memory
buffer when its audio still matches and otherwise rehydrates its referenced asset.

Session schema v4 adds local asset IDs. Earlier sessions still load as `remembered` tracks because
their original bytes were never stored. JSON presets remain portable configuration files: export
and import explicitly strip browser-local asset IDs, so preset audio must be selected again.

Reset replaces the durable session and then prunes unreferenced audio. Track replacement, removal,
import, and snapshot deletion use the same generation-safe garbage collection. Collection takes its
keep-set from the last readable durable session commit at the moment deletion executes—not from
newer in-memory state. A later failed save therefore cannot make an older durable session lose its
audio. Storage errors remain visible and never discard an already decoded in-memory track.

Recognized audio formats are preflighted using duration, sample rate, and channel count before Web
Audio decoding. The decoded result is checked again. A track may retain at most 256 MiB of decoded
samples and the whole active session at most 512 MiB. Layer loop fades are applied to the shared
buffer in place, so the engine does not keep a hidden full-size duplicate for every layer.

Object URLs for embedded artwork are revoked only after a successful replacement or when their
owning track leaves the session. Superseded asynchronous loads revoke any artwork they created.

## Verification

`npm run verify` is the release gate. It runs ESLint structural rules, zero-tolerance duplication,
dead-code/dependency analysis, Prettier, strict TypeScript, the npm high-severity advisory audit,
the complete Vitest suite, a Vite production build, and the Chromium/Firefox/WebKit Playwright
matrix. CI runs the same command on the supported Node and npm versions.
