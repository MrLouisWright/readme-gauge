# readme-gauge

> Lint READMEs for missing sections, broken badges, stale install commands and missing usage examples.

`readme-gauge` reads your README the way a new user does. It flags what is missing or wrong: no install or usage section, a usage section without a code example, an install command for a package that was renamed (`npm i acme-widget` when the package is `acme-widgets`), a pinned old major, a Travis badge for a service that shut down in 2021, an npm badge for a different package, a workflow badge pointing at a file that no longer exists, relative links and `#anchors` that go nowhere, placeholder text (`TODO`, `lorem ipsum`), and a License section that disagrees with `package.json`. Every finding has a line number and a **concrete fix**.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. By Louis Wright.

## Features

- **Sections:** required sections (`install`, `usage`, `license` by default) found by heading text with sensible aliases ("Getting started", "Licence", "Examples"…), plus empty sections, a missing `#` title and skipped heading levels.
- **Install commands:** parses `npm`/`pnpm`/`yarn`/`bun`/`npx` commands in code blocks and inline code. Flags the wrong or misspelled package name, pinned majors older than `package.json`, global installs of packages without a `bin`, `--save`, Bower, and a CLI that's never shown.
- **Badges:** shields.io / npm / packagephobia / bundlephobia badges naming another package, GitHub badges for another repository, Actions badges for a workflow file that doesn't exist, dead services (Travis CI .org, David DM, Greenkeeper, Gemnasium).
- **Links:** relative link and image targets are checked on disk; `#anchors` are checked against GitHub's heading slugs (including duplicates and Unicode). `--check-links` also fetches external links and badge images.
- **Output:** text, JSON, SARIF 2.1.0 and Markdown; `--fail-on`; exit codes 0/1/2; allowlist entries with expiry dates.

## Rules

| Rule | Default severity | What it catches |
|---|---|---|
| `readme-missing` | high | No README file |
| `missing-section` | medium | A required section is missing |
| `missing-usage-example` | medium | No code example in the usage section |
| `stale-install-command` | medium | Install command names the wrong package or an old major version |
| `broken-badge` | medium | Badge points at another package/repo, a missing workflow or a dead service |
| `broken-link` | medium | Relative link or image target does not exist (or URL is unreachable with --check-links) |
| `placeholder-text` | medium | Placeholder text left in the README |
| `broken-anchor` | low | In-page #anchor does not match any heading |
| `empty-section` | low | Section heading with no content |
| `license-mismatch` | low | README license differs from package.json |
| `cli-undocumented` | low | Package has a CLI (bin) but the README never shows it |
| `deprecated-install-flag` | low | Install command uses a deprecated tool or flag |
| `missing-title` | low | README does not start with a level-1 title |
| `too-short` | low | README is very short |
| `heading-level-skip` | info | Heading level jumps (e.g. ## to ####) |
| `insecure-url` | info | http:// URL where https:// is available |
| `allowlist-expired` | medium | Allowlist entry has expired |
| `allowlist-unused` | info | Allowlist entry matched nothing |

## Install and run

```bash
npx readme-gauge                              # lint ./README.md against ./package.json
npx readme-gauge packages/core --fail-on medium
npx readme-gauge --require install,usage,api,license,contributing
npx readme-gauge --check-links                # also fetch external links and badges
```

### Sample output

```text
readme-gauge — README.md
98 words, 6 heading(s), 4 badge(s), 7 link(s)

MEDIUM   README.md:3 badge uses travis-ci.org (travis-ci.org shut down in 2021) [broken-badge]
         ↳ fix: Replace it with a GitHub Actions badge or remove it.
MEDIUM   README.md:5 badge references workflow missing.yml, which does not exist in .github/workflows [broken-badge]
         ↳ fix: Point the badge at an existing workflow file.
MEDIUM   README.md:15 "npm install --save acme-widget@2.0.0" installs "acme-widget" but this package is "acme-widgets" [stale-install-command]
         ↳ fix: Use "acme-widgets".
MEDIUM   README.md:20 "Usage" section has no code example [missing-usage-example]
         ↳ fix: Add a fenced code block showing a minimal, copy-pasteable example.
LOW      README.md:10 link to #options-list matches no heading [broken-anchor]
         ↳ fix: Fix the anchor or add the heading.
```

## Options

```text
readme-gauge 1.0.0 — lint READMEs for missing sections, broken badges, stale install commands and missing examples

Usage: readme-gauge [dir] [options]

README
      --file <path>         README to lint (default: README.md / readme.* in dir)
      --require <list>      Required sections, comma-separated (default: install,usage,license;
                            known: install, usage, license, contributing, api, changelog, security, or any heading text)
      --min-words <n>       Minimum word count before too-short (default: 80)
      --check-links         Also fetch external links and badge images (HEAD, then GET)
      --timeout <ms>        Per-URL timeout for --check-links (default: 8000)

Common
  -c, --config <file>     JSON config (default: .readme-gauge.json or "readmeGauge" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

Required section names can be the built-in keys (`install`, `usage`, `license`, `contributing`, `api`, `changelog`, `security`) or any heading text. Give your own aliases with `"sections"` in the config. URLs that block bots can be skipped in `--check-links` with `"ignoreUrls": ["https://example.com/*"]`.

## Configuration and allowlist

Options can live in `.readme-gauge.json` (or a `"readmeGauge"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": { "heading-level-skip": "low" },
  "allowlist": [
    { "rule": "stale-install-command", "match": "legacy-name", "reason": "Migration note for users of the old name", "expires": "2027-03-31" }
  ],
  "require": ["install", "usage", "license", "contributing"],
  "sections": { "usage": ["usage", "getting started", "examples"] }
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  readme-gauge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - uses: MrLouisWright/readme-gauge@v1
        with:
          fail-on: high
          sarif: readme-gauge.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: readme-gauge.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Project directory | `.` |
| `require` | Comma-separated required sections (default: install,usage,license) | `` |
| `check-links` | Also fetch external badge and link URLs (true/false) | `false` |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, formatMarkdown } from 'readme-gauge';
const report = await check('.', { require: ['install', 'usage', 'license'] });
console.log(formatMarkdown(report, { failOn: 'medium' }));
```

`scan` (headings, sections, code blocks, links), `slug` (GitHub anchors) and `installCommands` are exported too. Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
