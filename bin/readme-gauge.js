#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { mainCli, check, RULES, splitList, UsageError } from '../src/index.js';

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
`,
  options: { file: { type: 'string' }, require: { type: 'string', multiple: true }, 'min-words': { type: 'string' }, 'check-links': { type: 'boolean' }, timeout: { type: 'string' } },
  run: async ({ dir, values: o, config, configFile }) => {
    const n = (v, k) => { if (v === undefined) return undefined; if (!/^\d+$/.test(v)) throw new UsageError(`--${k} must be a number`); return +v; };
    return check(dir, { file: o.file, require: o.require ? splitList(o.require) : undefined, minWords: n(o['min-words'], 'min-words'), checkLinks: o['check-links'] || config.checkLinks, timeout: n(o.timeout, 'timeout'), toolVersion: pkg.version }, config, configFile);
  },
});
