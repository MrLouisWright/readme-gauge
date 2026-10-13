import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FX, run, tmp, write, LONG } from './helpers.js';

test('exit codes', () => {
  assert.equal(run([FX('good')]).code, 0);
  assert.equal(run([FX('good'), '--fail-on', 'info']).code, 0);
  assert.equal(run([FX('bad')]).code, 0, 'bad fixture has no high findings');
  assert.equal(run([FX('bad'), '--fail-on', 'medium']).code, 1);
  assert.equal(run([tmp()]).code, 1, 'readme-missing is high');
});
test('formats and files', () => {
  const o = tmp();
  const r = run([FX('bad'), '--fail-on', 'medium', '--json', join(o, 'r.json'), '--sarif', join(o, 'r.sarif'), '--markdown', join(o, 'r.md')]);
  assert.equal(r.code, 1); assert.match(r.out, /↳ fix:/);
  const j = JSON.parse(readFileSync(join(o, 'r.json'), 'utf8')); assert.ok(j.findings.length > 10);
  const s = JSON.parse(readFileSync(join(o, 'r.sarif'), 'utf8')); assert.equal(s.runs[0].tool.driver.name, 'readme-gauge'); assert.ok(s.runs[0].results.every((x) => x.locations[0].physicalLocation.artifactLocation.uri === 'README.md'));
  assert.match(readFileSync(join(o, 'r.md'), 'utf8'), /❌ Failing/);
  assert.doesNotMatch(run([FX('bad'), '--no-fixes']).out, /↳ fix:/);
  assert.equal(JSON.parse(run([FX('good'), '-f', 'sarif']).out).runs[0].results.length, 0);
});
test('--require and config file', () => {
  const d = write(tmp(), { 'README.md': `# x\n\n${LONG}\n\n## Install\n\`npm i x\`\n## Usage\n\`x()\`\n## License\nMIT\n`, 'package.json': { name: 'x', license: 'MIT' } });
  assert.equal(run([d, '--require', 'security', '--fail-on', 'medium']).code, 1);
  writeFileSync(join(d, '.readme-gauge.json'), JSON.stringify({ require: ['install', 'security'], allowlist: [{ subject: 'security', reason: 'adding in Q1', expires: '2099-01-01' }] }));
  assert.equal(run([d, '--fail-on', 'medium']).code, 0);
  writeFileSync(join(d, '.readme-gauge.json'), '{bad json');
  assert.equal(run([d]).code, 2);
});
test('usage errors', () => {
  assert.equal(run(['--wat']).code, 2);
  assert.equal(run([FX('good'), '--min-words', 'lots']).code, 2);
  assert.equal(run([FX('good'), '-f', 'html']).code, 2);
});
test('--help, --version, --list-rules', () => {
  assert.match(run(['--help']).out, /--check-links/);
  assert.match(run(['--version']).out, /^1\./);
  assert.match(run(['--list-rules']).out, /stale-install-command/);
});
