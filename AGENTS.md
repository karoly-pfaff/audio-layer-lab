# AGENTS.md

This file defines the working contract for automated contributors in Audio Layer Lab. Keep changes
small, evidence-based, and consistent with the product's local-first privacy model.

## Start here

Read the documents relevant to the task before editing:

- `readme.md` — product behavior, commands, browser support, and limitations;
- `docs/architecture.md` — ownership and runtime boundaries;
- `docs/accessibility.md` — WCAG 2.2 AA contract;
- `docs/code-quality.md` — implementation, test, and review rules;
- `docs/versioning.md` — version selection and release procedure;
- `docs/roadmap.md` and `docs/backlog.md` — shipped and possible future scope.

Follow the closest nested `AGENTS.md` if one is added later. Direct user instructions override this
file. Existing user changes are not cleanup targets and must be preserved unless the task requires
modifying them.

## Product invariants

- The application is client-only. Audio, filenames, metadata, presets, and session state must not
  leave the user's browser.
- Do not add telemetry, analytics, remote fonts, remote artwork, a backend, or a network dependency
  without an explicit product decision.
- Persisted audio is content-addressed and origin-local. Never trade away session durability,
  single-writer fencing, cancellation safety, or generation-safe garbage collection.
- JSON presets remain portable and contain no browser-local audio bytes or asset references.
- Accessibility is a release requirement, not an optional polish pass.

## Architectural ownership

- `sources/audio/` owns Web Audio graph behavior, playback timing, loop processing, and metering.
- `sources/store/` owns domain workflows, persistence, storage, restoration, session ownership, and
  untrusted-data validation.
- `sources/components/` renders state and forwards user intent; it must not become a second domain
  layer.
- `sources/utils/` contains focused, domain-neutral utilities rather than miscellaneous helpers.
- `tests/e2e/` owns production-build browser workflows and shared Playwright fixtures.

Place a rule at the boundary that owns it. Keep the Zustand store composition root thin, avoid
hidden mutable state, and do not introduce an abstraction without a current consumer.

## Implementation rules

- Write production code, tests, comments, commit-ready documentation, and identifiers in English.
- Use strict TypeScript. Treat external, persisted, and imported data as `unknown` until validated;
  do not introduce `any`.
- Keep type-only imports explicit. Prefer precise domain names, guard clauses, and explicit data
  flow.
- Comments explain constraints, invariants, or trade-offs—not the next line of code.
- Do not leave commented-out code, unused exports, speculative fallbacks, or untracked TODOs.
- Use npm and preserve `package-lock.json`. New runtime dependencies require a concrete benefit,
  browser suitability, and a license/security review.
- Do not edit generated directories such as `build/`, `coverage/`, `output/`, `.playwright-cli/`, or
  `node_modules/`. Do not commit caches, logs, or `*.tsbuildinfo` files.
- Do not assume Git is available. Never create commits, tags, branches, or releases unless the user
  explicitly requests them.

## Testing strategy

- Test observable behavior and owned contracts, including meaningful success, boundary, invalid
  input, cancellation, and failure paths.
- Every bug fix needs a regression test that fails without the fix.
- Keep Vitest tests beside the production module they exercise. Keep cross-browser workflows and
  their fixtures in `tests/e2e/`.
- Keep tests deterministic, storage-isolated, and independent of external network services.
- Chromium and Firefox cover native Web Audio decoding. Windows WebKit may use only the existing
  minimal test shim for workflows unavailable in that runtime.

Run checks proportional to the change while working:

- focused Vitest file for a local behavior change;
- `npm run test:a11y` for interaction, semantics, focus, layout, or design-token changes;
- `npm run typecheck` and `npm run lint` for source or configuration changes;
- `npm run test:e2e` for user workflows, persistence, storage, ownership, or browser integration;
- `npm run verify` before a release or whenever the change crosses multiple boundaries.

Documentation-only changes do not require the full browser matrix, but links, commands, version
facts, and architectural claims must be checked against the current project.

## Accessibility and UI

- Preserve semantic HTML, descriptive accessible names, keyboard parity, visible focus, dialog
  focus management, live status behavior, and single-pointer alternatives.
- Maintain 320 CSS pixel reflow, WCAG text spacing, minimum 24 by 24 CSS pixel targets, AA contrast,
  reduced-motion behavior, and forced-colors support.
- Do not communicate state by color alone. Custom controls must expose native-equivalent name,
  role, value, state, and keyboard behavior.
- Automated checks do not replace the manual review matrix in `docs/accessibility.md`.

## Data and security

- Validate file input before expensive decoding and enforce both per-track and total decoded-memory
  limits.
- Preserve stale-operation cancellation and cleanup of object URLs, storage leases, audio nodes,
  timers, and workers.
- Treat localStorage, IndexedDB, OPFS, imported presets, metadata, artwork, and cross-tab events as
  untrusted input.
- Surface recoverable storage and audio failures to the user without discarding a valid in-memory
  mix.
- Never weaken ownership fencing or delete durable media from a newer session based on stale state.

## Documentation and releases

- Update the README when product behavior, setup, commands, support, or limitations change.
- Update `docs/architecture.md` when ownership or data flow changes and
  `docs/accessibility.md` when the conformance contract changes.
- Keep shipped work in `docs/roadmap.md`; keep only non-blocking future work in `docs/backlog.md`.
- Follow `docs/versioning.md`. `package.json` is the canonical version, and `package-lock.json` must
  match it.

## Definition of done

Before handing off a change:

1. Confirm that the implementation lives at the correct architectural boundary.
2. Confirm privacy, persistence, cancellation, and accessibility invariants relevant to the task.
3. Add or update tests and documentation that prove the changed contract.
4. Run the proportionate checks and report their exact results, including intentional skips.
5. State any remaining risk or unverified manual check plainly; do not declare success from an
   incomplete or failing gate.
