import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute } from 'node:path';
import { scan, slug } from './markdown.js';
import { buildReport, UsageError } from './core.js';

export { scan, slug };
export * from './core.js';

export const RULES = {
  'readme-missing': { severity: 'high', title: 'No README file' },
  'missing-section': { severity: 'medium', title: 'A required section is missing' },
  'missing-usage-example': { severity: 'medium', title: 'No code example in the usage section' },
  'stale-install-command': { severity: 'medium', title: 'Install command names the wrong package or an old major version' },
  'broken-badge': { severity: 'medium', title: 'Badge points at another package/repo, a missing workflow or a dead service' },
  'broken-link': { severity: 'medium', title: 'Relative link or image target does not exist (or URL is unreachable with --check-links)' },
  'placeholder-text': { severity: 'medium', title: 'Placeholder text left in the README' },
  'broken-anchor': { severity: 'low', title: 'In-page #anchor does not match any heading' },
  'empty-section': { severity: 'low', title: 'Section heading with no content' },
  'license-mismatch': { severity: 'low', title: 'README license differs from package.json' },
  'cli-undocumented': { severity: 'low', title: 'Package has a CLI (bin) but the README never shows it' },
  'deprecated-install-flag': { severity: 'low', title: 'Install command uses a deprecated tool or flag' },
  'missing-title': { severity: 'low', title: 'README does not start with a level-1 title' },
  'too-short': { severity: 'low', title: 'README is very short' },
  'heading-level-skip': { severity: 'info', title: 'Heading level jumps (e.g. ## to ####)' },
  'insecure-url': { severity: 'info', title: 'http:// URL where https:// is available' },
};

export const DEFAULT_SECTIONS = {
  install: ['install', 'installation', 'installing', 'setup', 'getting started', 'quick start', 'quickstart'],
  usage: ['usage', 'getting started', 'quick start', 'quickstart', 'examples', 'example', 'how to use', 'cli', 'api', 'install and run'],
  license: ['license', 'licence', 'licensing', 'copyright'],
  contributing: ['contributing', 'contribute', 'development'],
  api: ['api', 'reference', 'library', 'programmatic use'],
  changelog: ['changelog', 'changes', 'release notes', 'history'],
  security: ['security'],
};
const DEFAULT_REQUIRE = ['install', 'usage', 'license'];
const PLACEHOLDERS = [/\blorem ipsum\b/i, /\bTODO\b(?!\s*list)/, /\bTBD\b/, /\bFIXME\b/, /\bcoming soon\b/i, /\byour[-_ ]?(package|project|module)[-_ ]?name\b/i, /<(package|project|repo)[-_ ]?name>/i, /\bINSERT [A-Z ]+ HERE\b/i, /\bfoo-bar-baz\b/];
const DEAD = [[/travis-ci\.org/i, 'travis-ci.org shut down in 2021'], [/david-dm\.org/i, 'david-dm.org is offline'], [/greenkeeper\.io/i, 'Greenkeeper was shut down'], [/gemnasium\.com/i, 'Gemnasium was shut down'], [/nodei\.co/i, 'nodei.co badges no longer render'], [/badge\.fury\.io/i, null], [/img\.shields\.io\/travis\//i, 'shields.io removed Travis badges'], [/img\.shields\.io\/david\//i, 'shields.io removed David badges']];

const normName = (s) => String(s || '').toLowerCase();
function repoSlug(pkg) {
  const r = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!r) return null;
  const m = /github(?:\.com)?[:/]+([^/]+)\/([^/#.]+?)(?:\.git)?(?:[#/].*)?$/i.exec(r) || /^([\w.-]+)\/([\w.-]+)$/.exec(r);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

export function findReadme(dir) {
  try { const f = readdirSync(dir).filter((x) => /^readme(\.(md|markdown|mdx|txt))?$/i.test(x)).sort((a, b) => (/\.md$/i.test(b) ? 1 : 0) - (/\.md$/i.test(a) ? 1 : 0)); return f[0] ? join(dir, f[0]) : null; } catch { return null; }
}

/** Parse install commands from code blocks / inline code. */
export function installCommands(md) {
  const out = [];
  const texts = [...md.codeBlocks.map((b) => ({ text: b.text, line: b.start + 1, block: b })), ...md.lines.map((l, i) => ({ text: (l.match(/`([^`]+)`/g) || []).map((x) => x.slice(1, -1)).join('\n'), line: i + 1 }))];
  for (const t of texts) {
    t.text.split('\n').forEach((raw, k) => {
      const line = raw.replace(/^\s*[$>#]\s*/, '').trim();
      const m = /^(npm|pnpm|yarn|bun|npx|bunx|bower)\s+(.*)$/.exec(line);
      if (!m) return;
      let [, tool, rest] = m;
      const words = rest.split(/\s+/);
      let verb = tool === 'npx' || tool === 'bunx' ? 'exec' : words.shift();
      if (tool === 'pnpm' && verb === 'dlx') verb = 'exec';
      if (tool === 'yarn' && verb === 'dlx') verb = 'exec';
      if (tool === 'yarn' && verb === 'global') verb = words.shift() === 'add' ? 'add-global' : 'other';
      const isInstall = ['install', 'i', 'add', 'isntall', 'in', 'ins', 'inst', 'insta', 'instal', 'add-global'].includes(verb);
      if (!isInstall && verb !== 'exec') return;
      const flags = words.filter((w) => w.startsWith('-'));
      const pkgs = [];
      for (const w of words) { if (w.startsWith('-')) { if (verb === 'exec') break; continue; } if (/^[\w@.][\w@./:~^<>=*+-]*$/.test(w) && !/[|&;]/.test(w)) pkgs.push(w); if (verb === 'exec') break; }
      out.push({ tool, verb, flags, pkgs, line: t.line + (t.block ? k : 0), raw: line });
    });
  }
  return out;
}
const splitSpec = (s) => { const at = s.lastIndexOf('@'); return at > 0 ? [s.slice(0, at), s.slice(at + 1)] : [s, '']; };

/**
 * Lint a README. opts: { file, require: [...], sections: {key: [aliases]}, minWords, now }
 */
export function analyze(dir, opts = {}) {
  const findings = [];
  const file = opts.file ? resolve(dir, opts.file) : findReadme(dir);
  const add = (rule, message, fix, line, extra = {}) => findings.push({ rule, severity: RULES[rule].severity, file: rel, line, message, fix, ...extra });
  let rel = file ? relative(dir, file) || file : 'README.md';
  let pkg = {};
  try { pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { pkg = {}; }
  const info = { file: rel, words: 0, sections: [], badges: 0, links: 0 };
  if (!file || !existsSync(file)) { add('readme-missing', `no README found in ${dir}`, 'Add a README.md with what the package does, how to install it, a usage example and the license.'); return { info, findings }; }
  const text = readFileSync(file, 'utf8');
  const md = scan(text);
  const baseDir = dirname(file);
  info.words = (text.replace(/```[\s\S]*?```/g, '').match(/[\p{L}\p{N}]+/gu) || []).length;
  info.sections = md.headings.map((h) => h.title);

  // title & structure
  const first = md.headings[0];
  if (!first || first.level !== 1) add('missing-title', first ? `first heading "${first.title}" is level ${first.level}, not a # title` : 'README has no headings', `Start with "# ${pkg.name || 'project-name'}" and a one-line description.`, first?.line || 1);
  for (let i = 1; i < md.headings.length; i++) { const a = md.headings[i - 1]; const b = md.headings[i]; if (b.level > a.level + 1) add('heading-level-skip', `heading "${b.title}" jumps from level ${a.level} to ${b.level}`, `Use ${'#'.repeat(a.level + 1)} for it.`, b.line); }
  for (const s of md.sections) if (!s.ownBody.trim() && !md.sections.some((t) => t.line > s.line && t.level > s.level && t.line <= s.endLine)) add('empty-section', `section "${s.title}" is empty`, 'Fill it in or remove the heading.', s.line);
  if (info.words < (opts.minWords ?? 80)) add('too-short', `README has only ${info.words} words`, 'Explain what the package does, why, how to install and use it, and its license.', 1);

  // required sections
  const aliases = { ...DEFAULT_SECTIONS, ...(opts.sections || {}) };
  const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
  const findSection = (key) => { const al = (aliases[key] || [key]).map(norm); return md.sections.find((s) => { const t = norm(s.title); return al.some((a) => t === a || t.startsWith(a + ' ') || t.endsWith(' ' + a) || t.includes(' ' + a + ' ')); }); };
  for (const key of opts.require || DEFAULT_REQUIRE) {
    const s = findSection(key);
    if (!s) add('missing-section', `no "${key}" section (looked for: ${(aliases[key] || [key]).slice(0, 4).join(', ')})`, `Add a "## ${key[0].toUpperCase() + key.slice(1)}" section.`, undefined, { subject: key });
  }
  const usage = findSection('usage');
  const anyCode = md.codeBlocks.length > 0;
  if (usage && !usage.code.length && !/`[^`]+`/.test(usage.body)) add('missing-usage-example', `"${usage.title}" section has no code example`, 'Add a fenced code block showing a minimal, copy-pasteable example.', usage.line);
  else if (!usage && !anyCode) add('missing-usage-example', 'README has no code examples at all', 'Add a "## Usage" section with a fenced code block.', 1);

  // install commands
  const name = pkg.name; const major = /^(\d+)\./.exec(pkg.version || '')?.[1];
  const deps = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {}), ...Object.keys(pkg.peerDependencies || {}), ...Object.keys(pkg.optionalDependencies || {})]);
  const bins = typeof pkg.bin === 'string' ? [name?.replace(/^@[^/]+\//, '')] : Object.keys(pkg.bin || {});
  const cmds = installCommands(md);
  const installSec = findSection('install');
  for (const c of cmds) {
    if (c.tool === 'bower') { add('deprecated-install-flag', `"${c.raw}" uses Bower, which is deprecated`, `Use "npm install ${name || '<name>'}".`, c.line); continue; }
    if (c.flags.includes('--save') || c.flags.includes('-S')) add('deprecated-install-flag', `"${c.raw}": --save has been the default since npm 5`, `Use "${c.tool} install ${c.pkgs.join(' ')}".`, c.line);
    for (const spec of c.pkgs) {
      const [n, v] = splitSpec(spec);
      if (!name) continue;
      if (normName(n) === normName(name)) {
        if (v && major && /^\^?~?v?\d+/.test(v) && /^\^?~?v?(\d+)/.exec(v)[1] !== major) add('stale-install-command', `"${c.raw}" pins ${n}@${v} but the current version is ${pkg.version}`, `Use "${c.tool} ${c.verb === 'exec' ? '' : c.verb + ' '}${n}" or @${major}.`, c.line, { subject: spec });
        if (c.verb === 'add-global' || c.flags.includes('-g') || c.flags.includes('--global')) { if (!bins.length) add('stale-install-command', `"${c.raw}" installs ${n} globally but it has no "bin"`, `Install it locally: "npm install ${n}".`, c.line, { subject: spec }); }
        continue;
      }
      // a package name that looks like ours (renamed / typo) or appears in the install section but isn't a dependency
      const similar = (a, b) => { a = normName(a).replace(/^@[^/]+\//, ''); b = normName(b).replace(/^@[^/]+\//, ''); return a === b || lev(a, b) <= Math.max(1, Math.floor(b.length / 6)); };
      const inInstall = installSec && c.line > installSec.line && c.line <= installSec.endLine;
      if (similar(n, name)) add('stale-install-command', `"${c.raw}" installs "${n}" but this package is "${name}"`, `Use "${name}".`, c.line, { subject: n });
      else if (inInstall && c.verb !== 'exec' && !deps.has(n) && !/^(npm|yarn|pnpm|typescript|@types\/node|node)$/.test(n) && c.pkgs.length === 1 && !/[/.]/.test(n.replace(/^@[^/]+\//, ''))) add('stale-install-command', `install section installs "${n}", which is neither this package (${name}) nor a declared dependency`, `Use "${name}" or remove the stale command.`, c.line, { subject: n });
    }
  }
  if (name && cmds.length === 0 && !new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\b`).test(md.codeBlocks.map((b) => b.text).join('\n')) && !pkg.private) add('missing-section', `no install command for ${name} anywhere in the README`, `Add "npm install ${name}" to the install section.`, installSec?.line, { subject: 'install-command' });
  if (bins.length && !pkg.private) {
    const all = md.codeBlocks.map((b) => b.text).join('\n') + '\n' + (text.match(/`[^`\n]+`/g) || []).map((x) => x.slice(1, -1)).join('\n');
    const missing = bins.filter((b) => b && !new RegExp(`(^|[\\s\`/$])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$|\`)`, 'm').test(all));
    if (missing.length === bins.length) add('cli-undocumented', `package has CLI command(s) ${bins.join(', ')} but the README never shows them`, `Add a usage example such as "npx ${bins[0]} --help".`, usage?.line);
  }

  // badges and links
  const slugRepo = repoSlug(pkg);
  for (const l of md.links) {
    const url = l.url.trim();
    if (l.kind === 'image' && (l.badge || /shields\.io|badge|\/badges?\/|codecov\.io|coveralls\.io|badgen\.net|packagephobia|bundlephobia/i.test(url))) {
      info.badges++;
      for (const [re, why] of DEAD) if (re.test(url) && why) add('broken-badge', `badge uses ${url.replace(/^https?:\/\//, '').split('/')[0]} (${why})`, 'Replace it with a GitHub Actions badge or remove it.', l.line, { subject: url });
      const npmM = /shields\.io\/npm\/[a-z-]+\/((?:@[^/]+\/)?[^/?.]+)|badge\.fury\.io\/js\/([^/?]+?)\.svg|packagephobia\.com\/badge\?p=((?:@[^/]+\/)?[^&@]+)|bundlephobia\/[a-z]+\/((?:@[^/]+\/)?[^/?.]+)/i.exec(url);
      const npmName = npmM && decodeURIComponent(npmM[1] || npmM[2] || npmM[3] || npmM[4]);
      if (name && npmName && normName(npmName) !== normName(name) && !deps.has(npmName)) add('broken-badge', `npm badge shows "${npmName}", not ${name}`, `Point the badge at ${name}.`, l.line, { subject: url });
      const gh = /github\.com\/([^/]+)\/([^/]+)\/(?:actions\/)?workflows\/([^/]+)\/badge\.svg/i.exec(url) || /shields\.io\/github\/[a-z-]+(?:\/[a-z-]+)?\/([^/]+)\/([^/?]+)(?:\/([^?]+))?/i.exec(url);
      if (gh) {
        const r = `${gh[1]}/${gh[2]}`.toLowerCase();
        if (slugRepo && r !== slugRepo) add('broken-badge', `badge points at ${gh[1]}/${gh[2]}, but package.json repository is ${slugRepo}`, `Use ${slugRepo}.`, l.line, { subject: url });
        if (/workflows\/[^/]+\/badge\.svg/.test(url) && (!slugRepo || r === slugRepo)) {
          const wf = decodeURIComponent(gh[3]);
          const root = findUp(dir, '.github');
          if (/\.ya?ml$/.test(wf) && root && !existsSync(join(root, '.github', 'workflows', wf))) add('broken-badge', `badge references workflow ${wf}, which does not exist in .github/workflows`, 'Point the badge at an existing workflow file.', l.line, { subject: url });
        }
      }
      if (/^http:\/\//i.test(url)) add('insecure-url', `badge image uses http:// (${url})`, 'Use https:// (GitHub proxies images, but http badges can be blocked).', l.line, { subject: url });
      continue;
    }
    info.links++;
    if (/^http:\/\/(?!localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url) && !/^http:\/\/[\w.-]+:\d+/.test(url)) add('insecure-url', `http:// link: ${url}`, 'Use https://.', l.line, { subject: url });
    if (/^(https?:|mailto:|data:|\/\/|ftp:|tel:)/i.test(url) || /^[a-z][\w+.-]*:/i.test(url)) continue;
    if (url.startsWith('#')) {
      const a = decodeURIComponent(url.slice(1)).toLowerCase();
      if (a && !md.anchors.has(a)) add('broken-anchor', `link to #${url.slice(1)} matches no heading`, closest(a, [...md.anchors]) ? `Did you mean #${closest(a, [...md.anchors])}?` : 'Fix the anchor or add the heading.', l.line, { subject: url });
      continue;
    }
    const [p] = url.split(/[?#]/);
    if (!p) continue;
    const target = p.startsWith('/') ? join(findUp(dir, '.git') || dir, p) : resolve(baseDir, decodeURIComponent(p));
    if (!existsSync(target)) add('broken-link', `${l.kind === 'image' ? 'image' : 'link'} target ${p} does not exist`, 'Fix the path (it is relative to the README) or remove the link.', l.line, { subject: url });
  }

  // placeholders (outside code)
  const proseLines = new Set(); for (const b of md.codeBlocks) for (let i = b.start; i <= (b.end || b.start); i++) proseLines.add(i);
  md.lines.forEach((ln, i) => {
    if (proseLines.has(i + 1)) return;
    const s = ln.replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']');
    const hit = PLACEHOLDERS.find((re) => re.test(s));
    if (hit) add('placeholder-text', `placeholder text: "${s.trim().slice(0, 80)}"`, 'Replace it with real content or remove it.', i + 1, { subject: String(hit) });
  });

  // license
  const licSec = findSection('license');
  if (licSec && typeof pkg.license === 'string' && pkg.license && !/^SEE LICENSE/i.test(pkg.license)) {
    const known = ['MIT', 'ISC', 'Apache-2.0', 'Apache 2.0', 'Apache License', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD', 'GPL-2.0', 'GPL-3.0', 'GPL', 'LGPL', 'AGPL', 'MPL-2.0', 'MPL', 'Unlicense', 'CC0', '0BSD', 'BlueOak', 'UNLICENSED', 'proprietary'];
    const body = licSec.body.replace(/\]\([^)]*\)/g, ']');
    const said = known.filter((k) => new RegExp(`(^|[^\\w-])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w-]|$)`, 'i').test(body));
    const normL = (x) => x.toLowerCase().replace(/ license$/, '').replace(/[ -]?2\.0$/, '').replace(/-only|-or-later/, '').replace(/-\d.*$/, '').replace(/ .*/, '');
    const pl = normL(pkg.license.replace(/^\(|\)$/g, ''));
    if (said.length && !said.some((x) => normL(x) === pl || pkg.license.toLowerCase().includes(normL(x)))) add('license-mismatch', `README license section says ${said[0]}, package.json says ${pkg.license}`, 'Make them agree (and check the LICENSE file).', licSec.line);
  }
  return { info, findings, md, file: rel };
}

function findUp(dir, name) { let d = resolve(dir); for (;;) { if (existsSync(join(d, name))) return d; const p = dirname(d); if (p === d) return null; d = p; } }
function lev(a, b) { if (a === b) return 0; const m = a.length; const n = b.length; if (Math.abs(m - n) > 3) return 99; let prev = Array.from({ length: n + 1 }, (_, i) => i); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
function closest(a, list) { let best = null; let d = 4; for (const x of list) { const k = lev(a, x); if (k < d) { d = k; best = x; } } return best; }

/** Optional network check of external URLs. */
export async function checkLinks(md, { timeout = 8000, concurrency = 6, fetchImpl = globalThis.fetch, only } = {}) {
  const urls = [...new Map(md.links.filter((l) => /^https?:\/\//i.test(l.url)).filter((l) => !only || only(l)).map((l) => [l.url, l])).values()];
  const bad = [];
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const l = urls[i++];
      let status = 0; let err = null;
      for (const method of ['HEAD', 'GET']) {
        const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
        try { const r = await fetchImpl(l.url, { method, redirect: 'follow', signal: ac.signal, headers: { 'user-agent': 'readme-gauge (+https://github.com/MrLouisWright/readme-gauge)' } }); status = r.status; try { await r.body?.cancel?.(); } catch {} } catch (e) { err = e.name === 'AbortError' ? 'timeout' : e.cause?.code || e.message; } finally { clearTimeout(t); }
        if (status && status < 400) break;
        if (status && ![403, 405, 501].includes(status) && method === 'HEAD' && status !== 404 && status !== 410) continue;
        if (status === 404 || status === 410) break;
      }
      if (!status || status >= 400) bad.push({ ...l, status, error: err });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return bad;
}

export async function check(dir, opts = {}, config = {}, configFile) {
  const merged = { require: config.require, sections: config.sections, minWords: config.minWords, file: config.file, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
  const { info, findings, md, file } = analyze(dir, merged);
  if (merged.checkLinks && md) {
    const ignore = (config.ignoreUrls || []).map((g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
    for (const l of await checkLinks(md, { timeout: merged.timeout, fetchImpl: merged.fetchImpl, only: (x) => !ignore.some((re) => re.test(x.url)) })) {
      const badge = l.kind === 'image';
      findings.push({ rule: badge ? 'broken-badge' : 'broken-link', severity: RULES[badge ? 'broken-badge' : 'broken-link'].severity, file, line: l.line, subject: l.url, message: `${badge ? 'image' : 'link'} ${l.url} is unreachable (${l.status ? 'HTTP ' + l.status : l.error})`, fix: 'Fix or remove the URL; add it to "ignoreUrls" if the site blocks bots.' });
    }
  }
  const tool = { name: 'readme-gauge', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '📘', defaultFile: 'README.md' };
  return buildReport(tool, info.file, findings, config, { now: opts.now, configFile, summaryLine: `${info.words} words, ${info.sections.length} heading(s), ${info.badges} badge(s), ${info.links} link(s)`, info });
}
