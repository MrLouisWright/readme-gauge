# Changelog

## 1.0.0 (2026-10-15)

### Added before first publish

- Code examples are checked: ```` ```js ```` blocks must parse (compiled, never run; top-level await and ESM allowed), and imports of this package must name a subpath in `exports` (`example-syntax-error`, `example-import-missing`). `--check-exports` also loads the package and checks named imports exist.
- Table of contents: a `<!-- toc -->`/`<!-- tocstop -->` block or a "Contents" section is compared with the headings (`toc-out-of-date`); `--fix-toc` regenerates it (or inserts one).
- `--check-links` now uses static-link-sentinel's external checker (retries with backoff, per-host rate limits, redirects, optional `--link-cache`) instead of a second link checker. readme-gauge itself only checks links inside the README.
- markdownlint interop: documented setup for running both, and exported `MARKDOWNLINT_CONFIG` / `MARKDOWNLINT_OVERLAP` that turn off the overlapping rules.

### Packaging

- Dual ESM + CommonJS: `import` loads `src/`, `require` loads a bundled `dist/index.cjs`, via package.json `exports`.
- TypeScript declarations are generated from the source (`dist/types`) instead of hand-written.
- CI runs build, tests and a require+import check on Node 18/20/22; releases use `npm publish --provenance`.

First release, by Louis Wright.

- Required sections (install, usage, license by default; configurable with aliases), empty sections, title and heading-level checks.
- Install command checks: wrong or renamed package names, stale pinned majors, deprecated `--save`, `bower`, global installs of packages without a `bin`, missing CLI documentation.
- Badge checks: shields.io/npm/GitHub badges pointing at another package or repo, dead CI services (travis-ci.org), insecure `http://` images; optional live check with `--check-links`.
- Relative link and image targets, in-page `#anchor` links using GitHub's slug rules, placeholder text, license mismatch with package.json, very short READMEs.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
