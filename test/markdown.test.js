import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, slug, installCommands } from '../src/index.js';

test('slug follows GitHub rules', () => {
  assert.equal(slug('Install and run'), 'install-and-run');
  assert.equal(slug('`--fail-on` & exit codes!'), '--fail-on--exit-codes');
  assert.equal(slug('Café notes'), 'café-notes');
  assert.equal(slug('[Link](x) title'), 'link-title');
});
test('headings: ATX, setext, duplicates, code fences ignored', () => {
  const m = scan('Title\n=====\n\n## A\n\n```\n# not heading\n```\n\n## A\n\nSub\n---\n');
  assert.deepEqual(m.headings.map((h) => [h.level, h.title, h.slug]), [[1, 'Title', 'title'], [2, 'A', 'a'], [2, 'A', 'a-1'], [2, 'Sub', 'sub']]);
  assert.equal(m.codeBlocks.length, 1);
});
test('links: inline, reference, html, badges; inline code ignored', () => {
  const m = scan('[![b](https://img.shields.io/x)](https://x.y) [a](./a.md) [r][ref] `[no](link)` <img src="i.png"> <a href="#z">z</a>\n\n[ref]: https://r.example\n');
  const urls = m.links.map((l) => `${l.kind}:${l.url}`);
  assert.deepEqual(urls.sort(), ['image:https://img.shields.io/x', 'image:i.png', 'link:#z', 'link:./a.md', 'link:https://r.example', 'link:https://x.y'].sort());
  assert.ok(m.links.find((l) => l.badge));
});
test('sections and bodies', () => {
  const m = scan('# T\n\n## Usage\n\ntext\n\n### Sub\n\n```js\nx\n```\n\n## License\nMIT\n');
  const u = m.sections.find((s) => s.title === 'Usage');
  assert.equal(u.code.length, 1); assert.match(u.body, /Sub/);
});
test('install command parser', () => {
  const cmds = installCommands(scan('```sh\n$ npm i -D foo@^2 bar\nyarn add baz\npnpm add -g qux\nnpx some-cli --help\nyarn global add g1\nnpm run build\n```\nAlso `npm install inline-pkg`.'));
  assert.deepEqual(cmds.map((c) => `${c.tool}/${c.verb}/${c.pkgs.join(',')}`), ['npm/i/foo@^2,bar', 'yarn/add/baz', 'pnpm/add/qux', 'npx/exec/some-cli', 'yarn/add-global/g1', 'npm/install/inline-pkg']);
});
