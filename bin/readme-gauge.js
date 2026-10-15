#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readFileSync as rf, writeFileSync } from 'node:fs';
import { mainCli, check, RULES, splitList, UsageError, findReadme, scan, updateToc } from '../src/index.js';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'readme-gauge', version: pkg.version, configKey: 'readmeGauge', rules: RULES,
  tagline: 'lint READMEs for missing sections, broken badges, stale install commands and missing examples',
  usage: 'Usage: readme-gauge [dir] [options]',
  help: `README
      --file <path>         README to lint (default: README.md / readme.* in dir)
      --require <list>      Required sections, comma-separated (default: install,usage,license;
                            known: install, usage, license, contributing, api, changelog, security, or any heading text)
      --min-words <n>       Minimum word count before too-short (default: 80)
      --check-links         Also fetch external links and badge images (HEAD, then GET)
      --timeout <ms>        Per-URL timeout for --check-links (default: 8000)
      --link-cache <file>   Cache --check-links results between runs (static-link-sentinel cache format)
      --check-exports       Import the package and check that named imports in examples exist
      --no-examples         Skip code example checks (JS syntax, imports of this package)
      --no-toc              Skip table-of-contents checks
      --fix-toc             Regenerate the TOC between <!-- toc --> and <!-- tocstop --> markers
                            (adds a "Contents" section with markers if the README has none)
`,
  options: { file: { type: 'string' }, require: { type: 'string', multiple: true }, 'min-words': { type: 'string' }, 'check-links': { type: 'boolean' }, timeout: { type: 'string' }, 'link-cache': { type: 'string' }, 'check-exports': { type: 'boolean' }, 'no-examples': { type: 'boolean' }, 'no-toc': { type: 'boolean' }, 'fix-toc': { type: 'boolean' } },
  run: async ({ dir, values: o, config, configFile }) => {
    const n = (v, k) => { if (v === undefined) return undefined; if (!/^\d+$/.test(v)) throw new UsageError(`--${k} must be a number`); return +v; };
    if (o['fix-toc']) {
      const f = o.file ? resolve(dir, o.file) : findReadme(dir);
      if (f) { const text = rf(f, 'utf8'); const next = updateToc(text, scan(text), { insert: true }); if (next) { writeFileSync(f, next); process.stderr.write(`updated table of contents in ${f}\n`); } else process.stderr.write('table of contents is up to date\n'); }
    }
    return check(dir, { linkCache: o['link-cache'], checkExports: o['check-exports'] || undefined, examples: o['no-examples'] ? false : undefined, toc: o['no-toc'] ? false : undefined, file: o.file, require: o.require ? splitList(o.require) : undefined, minWords: n(o['min-words'], 'min-words'), checkLinks: o['check-links'] || config.checkLinks, timeout: n(o.timeout, 'timeout'), toolVersion: pkg.version }, config, configFile);
  },
});
