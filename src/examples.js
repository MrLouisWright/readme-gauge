// Validate code examples: JS syntax, and imports of this package (subpaths + named exports).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const JS = new Set(['js', 'javascript', 'mjs', 'cjs', 'jsx', 'node']);
const TS = new Set(['ts', 'typescript', 'mts', 'cts', 'tsx']);

/** Imports in a snippet: [{ spec, names: [...], kind, lineOffset }] */
export function snippetImports(code) {
  const out = []; const lines = code.split('\n');
  lines.forEach((l, i) => {
    let m = /^\s*import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+[\w$]+)?\s*from\s*['"]([^'"]+)['"]/.exec(l);
    if (m) { out.push({ spec: m[3], names: (m[2] || '').split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean), default: !!m[1], line: i, kind: 'import' }); return; }
    m = /^\s*import\s+['"]([^'"]+)['"]/.exec(l); if (m) { out.push({ spec: m[1], names: [], line: i, kind: 'import' }); return; }
    m = /(?:const|let|var)\s+(?:\{([^}]*)\}|[\w$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/.exec(l);
    if (m) out.push({ spec: m[2], names: (m[1] || '').split(',').map((x) => x.trim().split(/\s*:\s*/)[0]).filter(Boolean), line: i, kind: 'require' });
  });
  return out;
}

/** Return a syntax error message for a JS snippet, or null. Snippets are compiled, never run. */
export function jsSyntaxError(code) {
  // drop import/export so the body can be compiled as an async function (top-level await allowed)
  const body = code
    .replace(/^\s*import\s[\s\S]*?from\s*['"][^'"]+['"];?/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*import\s*['"][^'"]+['"];?/gm, '')
    .replace(/^\s*export\s+default\s+/gm, 'void ')
    .replace(/^\s*export\s+(?=(const|let|var|function|class|async)\b)/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*(from\s*['"][^'"]+['"])?;?/gm, '');
  if (/^\s*(\$|>|npm |npx |yarn |pnpm )/m.test(body)) return null; // shell session in a js block
  if (/(^|\n)\s*\.\.\.\s*(\n|$)|\/\/\s*\.\.\./.test(body) && !/\bfunction|=>/.test(body)) return null;
  try { new Function(`return (async () => {\n${body}\n})`); return null; } catch (e) {
    if (!(e instanceof SyntaxError)) return null;
    if (/Unexpected token '<'|JSX/.test(e.message)) return null; // JSX is not plain JS
    return e.message;
  }
}

/** Does the exports map (or files) provide this subpath? */
export function subpathExported(pkg, dir, sub) {
  const ex = pkg.exports;
  if (ex == null) return sub === '.' || existsSync(join(dir, sub.slice(2))) || existsSync(join(dir, sub.slice(2) + '.js'));
  if (typeof ex === 'string' || Array.isArray(ex)) return sub === '.';
  const keys = Object.keys(ex);
  if (!keys.some((k) => k.startsWith('.'))) return sub === '.';
  return keys.some((k) => k === sub || (k.includes('*') && sub.startsWith(k.slice(0, k.indexOf('*'))) && sub.endsWith(k.slice(k.indexOf('*') + 1))) || (k.endsWith('/') && sub.startsWith(k)));
}

/**
 * Lint code blocks. Returns findings (rule, line, message, fix, subject).
 * opts.checkExports: import the package locally and verify named imports exist (runs the package's entry).
 */
export async function lintExamples(md, { pkg = {}, dir = '.', checkExports = false } = {}) {
  const out = []; const name = pkg.name;
  let mod = null;
  for (const b of md.codeBlocks) {
    const lang = b.lang; const isJs = JS.has(lang); const isTs = TS.has(lang);
    if (!isJs && !isTs) continue;
    if (isJs && lang !== 'jsx') { const err = jsSyntaxError(b.text); if (err) out.push({ rule: 'example-syntax-error', line: b.start + 1, message: `\`\`\`${lang} example does not parse: ${err}`, fix: 'Fix the snippet (or mark pseudo-code with ```text).' }); }
    if (!name) continue;
    for (const im of snippetImports(b.text)) {
      if (im.spec !== name && !im.spec.startsWith(name + '/')) continue;
      const sub = im.spec === name ? '.' : './' + im.spec.slice(name.length + 1);
      const line = b.start + 1 + im.line + 1 - 1;
      if (!subpathExported(pkg, dir, sub)) { out.push({ rule: 'example-import-missing', line, subject: im.spec, message: `example imports "${im.spec}" but package.json "exports" has no "${sub}"`, fix: `Add "${sub}" to "exports" or fix the import.` }); continue; }
      if (checkExports && sub === '.' && im.names.length) {
        if (mod === null) mod = await loadSelf(dir, pkg).catch((e) => ({ __error: e.message }));
        if (mod.__error) { out.push({ rule: 'example-import-missing', line, subject: im.spec, message: `could not load ${name} to check its exports: ${mod.__error}`, fix: 'Build the package first (e.g. npm run build).' }); checkExports = false; continue; }
        for (const n of im.names) if (!(n in mod)) out.push({ rule: 'example-import-missing', line, subject: `${im.spec}#${n}`, message: `example imports { ${n} } from "${im.spec}", but the package does not export it`, fix: `Export ${n} or fix the example.` });
      }
    }
  }
  return out;
}

async function loadSelf(dir, pkg) {
  const ex = pkg.exports;
  const pick = (e) => typeof e === 'string' ? e : Array.isArray(e) ? pick(e[0]) : e && typeof e === 'object' ? pick(e.import ?? e.node ?? e.default ?? e.require ?? e['.']) : null;
  const entry = pick(ex && typeof ex === 'object' && '.' in ex ? ex['.'] : ex) || pkg.module || pkg.main || 'index.js';
  const file = join(dir, entry);
  if (!existsSync(file)) throw new Error(`entry ${entry} does not exist`);
  void readFileSync;
  return import(pathToFileURL(file).href);
}
