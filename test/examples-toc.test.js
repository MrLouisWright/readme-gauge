import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, jsSyntaxError, snippetImports, subpathExported, scan, checkToc, generateToc, updateToc, MARKDOWNLINT_CONFIG } from '../src/index.js';
import { tmp, write, run, LONG } from './helpers.js';

const now = new Date('2026-10-14T12:00:00Z');
const fence = '```';
const readme = (body) => `# pkg\n\n${LONG}\n\n## Install\n\n${fence}bash\nnpm install pkg\n${fence}\n\n## Usage\n\n${body}\n\n## License\n\nMIT\n`;
const proj = (body, pkg = {}) => write(tmp(), { 'README.md': readme(body), 'package.json': { name: 'pkg', version: '1.0.0', license: 'MIT', ...pkg } });
const by = (r, rule) => r.findings.filter((f) => f.rule === rule);

test('jsSyntaxError: valid ESM, top-level await, and broken code', () => {
  assert.equal(jsSyntaxError("import { a } from 'x';\nconst r = await a();\nexport default r;"), null);
  assert.match(jsSyntaxError('const x = {;'), /Unexpected/);
  assert.equal(jsSyntaxError('$ npm install x'), null);
});
test('snippetImports: import, named, require', () => {
  const s = snippetImports("import def, { a, b as c } from 'pkg';\nconst { d } = require('pkg/sub');");
  assert.deepEqual(s.map((x) => [x.spec, x.names]), [['pkg', ['a', 'b']], ['pkg/sub', ['d']]]);
});
test('subpathExported honours exports maps and patterns', () => {
  const pkg = { exports: { '.': './i.js', './feature/*': './f/*.js', './package.json': './package.json' } };
  assert.ok(subpathExported(pkg, '.', '.')); assert.ok(subpathExported(pkg, '.', './feature/x')); assert.ok(!subpathExported(pkg, '.', './missing'));
});
test('example-syntax-error and example-import-missing (static)', async () => {
  const d = proj(`${fence}js\nimport { run } from 'pkg/nope';\nrun({;\n${fence}`, { exports: { '.': './index.js' } });
  const r = await check(d, { now });
  assert.equal(by(r, 'example-syntax-error').length, 1);
  assert.equal(by(r, 'example-import-missing')[0].subject, 'pkg/nope');
});
test('--check-exports verifies named imports against the real module', async () => {
  const d = proj(`${fence}js\nimport { run, gone } from 'pkg';\nrun();\n${fence}`, { type: 'module', exports: { '.': './index.js' } });
  write(d, { 'index.js': 'export function run() {}' });
  assert.equal(by(await check(d, { now }), 'example-import-missing').length, 0);
  const r = await check(d, { now, checkExports: true });
  assert.deepEqual(by(r, 'example-import-missing').map((f) => f.subject), ['pkg#gone']);
});
test('examples can be disabled', async () => {
  assert.equal(by(await check(proj(`${fence}js\nconst x = {;\n${fence}`), { now, examples: false }), 'example-syntax-error').length, 0);
});
test('TOC: stale and missing entries; generate', async () => {
  const text = `# pkg\n\n## Contents\n\n- [Install](#install)\n- [Old](#old-section)\n\n## Install\n\nx\n\n## Usage\n\ny\n`;
  const md = scan(text);
  const { problems } = checkToc(md);
  assert.deepEqual(problems.map((p) => p.kind).sort(), ['missing', 'stale']);
  assert.equal(generateToc(md), '- [Install](#install)\n- [Usage](#usage)');
});
test('updateToc rewrites between markers and is idempotent', () => {
  const text = `# pkg\n\n<!-- toc -->\n- [Gone](#gone)\n<!-- tocstop -->\n\n## A\n\n### A1\n\n## B\n`;
  const next = updateToc(text, scan(text));
  assert.match(next, /- \[A\]\(#a\)\n {2}- \[A1\]\(#a1\)\n- \[B\]\(#b\)/);
  assert.equal(updateToc(next, scan(next)), null);
  assert.deepEqual(checkToc(scan(next)).problems, []);
});
test('CLI --fix-toc inserts a TOC and the README then passes the toc check', () => {
  const d = proj('Run it.');
  const r = run([d, '--fix-toc', '--fail-on', 'none']);
  assert.match(r.err, /updated table of contents/);
  const text = readFileSync(join(d, 'README.md'), 'utf8');
  assert.match(text, /<!-- toc -->[\s\S]*\[Usage\]\(#usage\)[\s\S]*<!-- tocstop -->/);
  assert.ok(!JSON.parse(run([d, '-f', 'json', '--fail-on', 'none']).out).findings.some((f) => f.rule === 'toc-out-of-date'));
});
test('markdownlint interop config disables overlapping rules', () => {
  assert.equal(MARKDOWNLINT_CONFIG.MD001, false); assert.equal(MARKDOWNLINT_CONFIG.MD041, false);
});

test('TOC markers in inline code or fenced examples are not treated as a TOC', () => {
  const text = `# pkg\n\n## A\n\nPut the TOC between \`<!-- toc -->\` and \`<!-- tocstop -->\`.\n\n${fence}md\n<!-- toc -->\n- [X](#x)\n<!-- tocstop -->\n${fence}\n\n## B\n`;
  const md = scan(text);
  assert.equal(checkToc(md).toc, null);
  assert.equal(updateToc(text, md), null);
});
