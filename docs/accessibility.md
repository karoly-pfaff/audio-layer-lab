# Accessibility

Audio Layer Lab targets WCAG 2.2 Level AA for the complete product interface. Accessibility is a
release requirement and part of the normal quality gate, not a separate enhancement phase.

## Product contract

- Every function is available from a keyboard. Dragging a layer and dragging a pan knob both have
  non-dragging pointer alternatives.
- Focus is visible, follows the visual and reading order, is not hidden by persistent UI, and is
  restored when the keyboard-shortcuts dialog closes.
- Interactive targets are at least 24 by 24 CSS pixels.
- Controls expose a descriptive name, role, current value or state, and instructions where the
  native interaction is not self-evident.
- Status messages use a polite live region, remain present until dismissed, and never cover the
  currently focused control.
- Text tokens meet 4.5:1 contrast and meaningful non-text boundaries meet 3:1 against supported
  backgrounds. Information is never conveyed by color alone.
- The interface reflows at 320 CSS pixels without two-dimensional scrolling and remains usable with
  WCAG text-spacing overrides.
- Motion is suppressed when `prefers-reduced-motion` is enabled, and system colors replace the
  palette when `forced-colors` is active.

## Automated checks

`npm test` includes:

- axe-core rules tagged for WCAG 2.0, 2.1, and 2.2 A/AA;
- contrast calculations for reusable text and non-text color tokens;
- keyboard behavior for custom sliders, waveform seeking, and the modal dialog;
- persistent live-status and explicit-dismiss behavior.

Run only those checks with:

```bash
npm run test:a11y
```

`npm run verify` remains the release gate and also runs formatting, lint, duplication, dead-code,
TypeScript, all unit tests, and the production build.

## Browser review matrix

Before a release, review the production build in a real browser for:

1. axe WCAG 2.2 A/AA results in the default and forced-colors presentations;
2. sequential keyboard traversal, skip-link behavior, focus visibility, and dialog focus trapping;
3. target dimensions and single-pointer alternatives;
4. 320 CSS pixel reflow and WCAG text spacing;
5. reduced motion;
6. a screen-reader pass in at least one Chromium-based browser and one platform-native pairing.

Automated checks cannot prove every WCAG success criterion. A conformance statement should record
the browser, assistive-technology, and content combinations used for the manual pass.

## Content boundary

Audio files, embedded artwork, filenames, metadata, and imported presets are supplied by the user
and are outside the application's editorial control. The interface remains operable when this
content is missing or invalid, but a conformance claim cannot guarantee that user-supplied media is
itself accessible. Any public deployment that bundles media must provide the alternatives required
for that media.
