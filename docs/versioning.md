# Versioning

Audio Layer Lab follows [Semantic Versioning](https://semver.org/) using versions in the form
`MAJOR.MINOR.PATCH`. Version changes happen only at an intentional release boundary, not for every
merged change.

## Source of truth

- `package.json` is the canonical project version.
- The root package entry in `package-lock.json` must always match it.
- Documentation should describe named releases where useful, but must not duplicate the current
  version in evergreen headings or instructions.
- Git tags, once the project uses Git, mirror released versions as `vMAJOR.MINOR.PATCH`.

## Choosing the next version

### Patch

Increment `PATCH` for backward-compatible corrections that do not expand the product contract:

- bug, security, accessibility, performance, or reliability fixes;
- internal refactoring with unchanged observable behavior;
- documentation, test, tooling, or dependency maintenance shipped as a release.

### Minor

Increment `MINOR` for backward-compatible product capability:

- a new user-visible feature or workflow;
- a new optional preset or session field;
- a meaningful extension of supported input or browser behavior.

Existing sessions and presets must continue to load. Any schema change requires a tested migration
before it can qualify as backward-compatible.

### Major

Increment `MAJOR` when the release intentionally breaks an established contract, for example:

- removing or incompatibly changing a documented workflow;
- dropping support for a documented browser or persisted format;
- shipping a session or preset change that cannot be migrated safely.

Avoid a major bump when a migration, compatibility layer, or deprecation cycle can reasonably
preserve user data and behavior.

## Pre-releases

Use `MAJOR.MINOR.PATCH-rc.N` only for a feature-complete release candidate that still needs final
validation. Increase `N` for each candidate. Development snapshots and routine local builds do not
receive versions.

## Release procedure

1. Confirm the release scope and select the smallest valid SemVer increment.
2. Update both package files without creating a tag:

   ```bash
   npm version <version> --no-git-tag-version
   ```

3. Add a dated release entry to `docs/roadmap.md` and reconcile completed or deferred work with
   `docs/backlog.md`.
4. Update version-sensitive facts in the README and other documentation. Do not change historical
   figures in earlier release entries.
5. Run the complete release gate:

   ```bash
   npm ci
   npm run verify
   ```

6. Complete the relevant manual browser and assistive-technology checks from
   `docs/accessibility.md`.
7. Inspect the production build and confirm that no generated output, local cache, report, or test
   artifact is included in the release source.
8. Once Git is in use, commit the release as a single auditable change and create the annotated tag
   `v<version>` only after the release commit is on the main branch.

Do not publish or tag a release with a failing quality gate, an incomplete data migration, or
undocumented known data-loss risk.
