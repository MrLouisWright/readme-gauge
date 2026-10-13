# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Required sections (install, usage, license by default; configurable with aliases), empty sections, title and heading-level checks.
- Install command checks: wrong or renamed package names, stale pinned majors, deprecated `--save`, `bower`, global installs of packages without a `bin`, missing CLI documentation.
- Badge checks: shields.io/npm/GitHub badges pointing at another package or repo, dead CI services (travis-ci.org), insecure `http://` images; optional live check with `--check-links`.
- Relative link and image targets, in-page `#anchor` links using GitHub's slug rules, placeholder text, license mismatch with package.json, very short READMEs.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
