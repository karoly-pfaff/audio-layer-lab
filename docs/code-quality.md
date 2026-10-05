# Code quality

This project uses one local and CI entry point:

```bash
npm run verify
```

The command checks ESLint rules and structural limits, copied-code duplication, dead files and
dependencies, Prettier formatting, TypeScript, tests, global coverage thresholds, and the production
build followed by the Playwright end-to-end suite. High-severity npm advisories are also a failing
gate. A change is not ready to hand over while this command is red.

Coverage is measured across all executable files under `sources`, including files never imported by
a test. The enforced global minimums are 95% statements, 90% branches, 95% functions, and 95% lines.
Run `npm run test:coverage` for the terminal summary and `coverage/index.html` report.

Accessibility is part of the same release gate. The automated WCAG regressions are included in the
normal test suite, and the browser review contract is documented in
[`accessibility.md`](accessibility.md).

## Design rules

- Prefer the smallest correct design. Add abstractions only when a current consumer needs them.
- Give each module and function one coherent responsibility and one primary reason to change.
- Keep browser, persistence, audio-engine, and presentation policy at their owning boundaries.
- Validate persisted sessions, imported presets, file input, and remote metadata at the first
  boundary owned by the application.
- Prefer explicit data flow and composition over hidden mutable state.
- Remove duplication when it represents the same rule, not merely similar-looking code.
- Keep public exports deliberately small; a convenience export is still an API commitment.

## Implementation rules

- Production code and repository documentation are written in English.
- Use precise domain names instead of generic `data`, `item`, `manager`, or `helper` containers.
- Use `unknown` for untrusted values and narrow them before use; do not introduce `any`.
- Keep type-only imports explicit with `import type`.
- Prefer guard clauses and options objects when they make call sites clearer.
- Comments explain constraints or trade-offs, not what the next line already says.
- Do not leave commented-out code, unused exports, or untracked TODOs.

## Tests

- Test observable behavior and owned contracts rather than implementation sequence.
- Cover success, boundary, invalid-input, and meaningful failure behavior.
- Every bug fix includes a regression test that fails without the fix.
- Keep fixtures deterministic and keep tests beside the production module they exercise.
- Keep the cross-browser Playwright suite and its shared fixtures under `tests/e2e/`.
- Run E2E tests against the production build, with isolated browser storage and no external network
  dependency.
- Chromium and Firefox own native Web Audio decoding coverage. WebKit owns cross-engine UI,
  responsive, persistence, snapshot, and preset coverage; its Windows test runtime uses the
  smallest possible test-only Web Audio shim because that runtime omits the browser API.
- Linux CI provides a local PulseAudio null sink so Firefox exercises its native Web Audio graph
  without depending on physical runner audio hardware.
- Keep failure screenshots, videos, traces, and the HTML report under `output/playwright/`.

## Review checklist

1. Does every changed unit have one clear responsibility?
2. Is policy implemented by the correct owner?
3. Is any parameter, abstraction, or fallback speculative?
4. Are invalid input, cancellation, and partial failure explicit?
5. Does each test prove behavior that matters?
6. Do `npm run verify` and the production build pass from a clean install?
7. Does the change preserve the accessibility contract and relevant manual browser checks?

There are no source-specific lint exceptions. The Zustand store is a composition root; loading,
transport, session, snapshot, persistence, and status behavior live in focused domain modules.
See [`architecture.md`](architecture.md) for the dependency and ownership boundaries.
