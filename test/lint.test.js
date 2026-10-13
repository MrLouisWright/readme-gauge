import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { check, analyze } from '../src/index.js';
import { FX, tmp, write, LONG } from './helpers.js';

const now = new Date('2026-10-14T12:00:00Z');
const rules = (r) => r.findings.map((f) => f.rule);

test('good fixture is clean', async () => {
  const r = await check(FX('good'), { now });
  assert.deepEqual(r.findings, []);
  assert.equal(r.info.badges, 1);
});
test('bad fixture finds everything', async () => {
  const r = await check(FX('bad'), { now });
  const got = new Set(rules(r));
  for (const x of ['missing-title', 'heading-level-skip', 'empty-section', 'broken-badge', 'stale-install-command', 'deprecated-install-flag', 'broken-link', 'broken-anchor', 'placeholder-text', 'missing-usage-example', 'license-mismatch', 'cli-undocumented', 'insecure-url']) assert.ok(got.has(x), `expected ${x}`);
  const badges = r.findings.filter((f) => f.rule === 'broken-badge').map((f) => f.message).join('\n');
  assert.match(badges, /travis-ci\.org/); assert.match(badges, /acme-widget-old/); assert.match(badges, /missing\.yml/); assert.match(badges, /someone\/else/);
  const stale = r.findings.filter((f) => f.rule === 'stale-install-command').map((f) => f.message).join('\n');
  assert.match(stale, /installs "acme-widget" but this package is "acme-widgets"/);
  assert.match(stale, /leftpad/);
  assert.ok(r.findings.every((f) => f.file === 'README.md'));
  assert.ok(r.findings.find((f) => f.rule === 'broken-link').line > 0);
});
test('readme-missing', async () => {
  assert.deepEqual(rules(await check(tmp(), { now })), ['readme-missing']);
});
test('required sections are configurable with aliases', async () => {
  const d = write(tmp(), { 'README.md': `# x\n\n${LONG}\n\n## Getting Started\n\n\`\`\`sh\nnpm i x\n\`\`\`\n\n## Licence\n\nMIT\n`, 'package.json': { name: 'x', version: '1.0.0', license: 'MIT' } });
  assert.deepEqual(rules(await check(d, { now })), []);
  const r = await check(d, { now, require: ['install', 'contributing', 'Troubleshooting'] });
  assert.deepEqual(r.findings.map((f) => f.subject), ['contributing', 'Troubleshooting']);
  assert.deepEqual(rules(await check(d, { now, require: ['faq'], sections: { faq: ['getting started'] } })), []);
});
test('stale pinned major and global install without bin', async () => {
  const d = write(tmp(), { 'README.md': `# lib\n\n${LONG}\n\n## Install\n\n\`\`\`sh\nnpm i lib@2\nnpm i -g lib\n\`\`\`\n\n## Usage\n\n\`lib()\`\n\n## License\nMIT\n`, 'package.json': { name: 'lib', version: '3.0.0', license: 'MIT' } });
  const r = await check(d, { now });
  assert.deepEqual(rules(r), ['stale-install-command', 'stale-install-command']);
  assert.match(r.findings[0].message, /lib@2/); assert.match(r.findings[1].message, /globally/);
});
test('no install command at all', async () => {
  const d = write(tmp(), { 'README.md': `# lib\n\n${LONG}\n\n## Install\n\nUse your package manager.\n\n## Usage\n\n\`\`\`js\nrequire('x')\n\`\`\`\n\n## License\nMIT\n`, 'package.json': { name: 'lib', version: '1.0.0', license: 'MIT' } });
  const r = await check(d, { now });
  assert.deepEqual(r.findings.map((f) => f.subject), ['install-command']);
});
test('too-short and min-words', async () => {
  const d = write(tmp(), { 'README.md': '# x\n\n## Install\n`npm i x`\n## Usage\n`x()`\n## License\nMIT\n', 'package.json': { name: 'x', license: 'MIT' } });
  assert.deepEqual(rules(await check(d, { now })), ['too-short']);
  assert.deepEqual(rules(await check(d, { now, minWords: 5 })), []);
});
test('placeholders are not flagged inside code', async () => {
  const d = write(tmp(), { 'README.md': `# x\n\n${LONG}\n\n## Install\n\n\`\`\`sh\nnpm i x # TODO\n\`\`\`\n\nUse \`TODO\` markers.\n\n## Usage\n\n\`x()\`\n\n## License\nMIT\n`, 'package.json': { name: 'x', license: 'MIT' } });
  assert.deepEqual(rules(await check(d, { now })), []);
});
test('--file picks a different README; analyze returns info', () => {
  const d = write(tmp(), { 'docs/README.md': `# x\n\n${LONG}\n\n## Install\n\`npm i x\`\n## Usage\n\`x()\`\n## License\nMIT\n`, 'package.json': { name: 'x', license: 'MIT' } });
  const r = analyze(d, { file: 'docs/README.md' });
  assert.equal(r.info.file, 'docs/README.md'); assert.deepEqual(r.findings, []);
});
test('allowlist with expiry', async () => {
  const cfg = { allowlist: [{ rule: 'broken-badge', reason: 'old badges kept for history', expires: '2027-01-01' }, { rule: 'placeholder-text', reason: 'x', expires: '2026-01-01' }] };
  const r = await check(FX('bad'), { now }, cfg);
  assert.ok(!rules(r).includes('broken-badge')); assert.ok(r.suppressed.some((s) => s.rule === 'broken-badge'));
  assert.ok(rules(r).includes('allowlist-expired')); assert.ok(rules(r).includes('placeholder-text'));
});
test('--check-links against a local server', async () => {
  const srv = createServer((req, res) => { res.statusCode = req.url === '/ok' ? 200 : req.url === '/head-405' ? (req.method === 'HEAD' ? 405 : 200) : 404; res.end('x'); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const d = write(tmp(), { 'README.md': `# x\n\n${LONG}\n\n![badge](${base}/badge.svg)\n\n[ok](${base}/ok) [h](${base}/head-405) [gone](${base}/gone) [ign](${base}/ignored)\n\n## Install\n\`npm i x\`\n## Usage\n\`x()\`\n## License\nMIT\n`, 'package.json': { name: 'x', license: 'MIT' } });
    const r = await check(d, { now, checkLinks: true, timeout: 3000 }, { ignoreUrls: [`${base}/ignored`] });
    const msgs = r.findings.filter((f) => /unreachable/.test(f.message)).map((f) => `${f.rule} ${f.subject.replace(base, '')}`).sort();
    assert.deepEqual(msgs, ['broken-badge /badge.svg', 'broken-link /gone']);
  } finally { srv.close(); }
});
