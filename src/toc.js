// Table of contents: detect, check against headings, regenerate between <!-- toc --> markers.
import { slug } from './markdown.js';

// Markers count only on a line of their own and outside fenced code, so documentation that
// mentions `<!-- toc -->` (inline code or an example block) is not mistaken for a TOC.
const START = /^\s*<!--\s*(toc|START doctoc[^>]*)\s*-->\s*$/i;
const STOP = /^\s*<!--\s*(tocstop|\/toc|END doctoc[^>]*)\s*-->\s*$/i;
const inCode = (md, i) => (md.codeBlocks || []).some((b) => i + 1 >= b.start && i + 1 <= (b.end ?? Infinity));

/** Find the TOC: a marker block, or a "Contents"/"Table of contents" section made of #anchor links. */
export function findToc(md) {
  const s = md.lines.findIndex((l, i) => START.test(l) && !inCode(md, i));
  if (s !== -1) { const e = md.lines.findIndex((l, i) => i > s && STOP.test(l) && !inCode(md, i)); return { start: s + 1, end: e === -1 ? null : e + 1, marker: true, entries: tocEntries(md.lines.slice(s + 1, e === -1 ? undefined : e), s + 2) }; }
  const sec = md.sections.find((x) => /^(table of contents|contents|toc|index)$/i.test(x.title.trim()));
  if (!sec) return null;
  const body = md.lines.slice(sec.line, sec.endLine);
  return { start: sec.line, end: sec.endLine, marker: false, section: sec, entries: tocEntries(body, sec.line + 1) };
}
function tocEntries(lines, first) {
  const out = [];
  lines.forEach((l, i) => { const m = /^(\s*)[-*+]\s+\[([^\]]+)\]\(#([^)]+)\)/.exec(l) || /^(\s*)\d+\.\s+\[([^\]]+)\]\(#([^)]+)\)/.exec(l); if (m) out.push({ text: m[2], anchor: decodeURIComponent(m[3]).toLowerCase(), indent: m[1].length, line: first + i }); });
  return out;
}

/** Headings a TOC should list (levels minLevel..maxLevel, excluding the TOC heading itself). */
export function tocHeadings(md, { minLevel = 2, maxLevel = 3, toc } = {}) {
  return md.headings.filter((h) => h.level >= minLevel && h.level <= maxLevel && !(toc?.section && h.line === toc.section.line) && !/^(table of contents|contents|toc)$/i.test(h.title.trim()));
}

export function generateToc(md, opts = {}) {
  const hs = tocHeadings(md, opts); const min = Math.min(...hs.map((h) => h.level));
  return hs.map((h) => `${'  '.repeat(h.level - min)}- [${h.title.replace(/[[\]]/g, '')}](#${h.slug})`).join('\n');
}

/** Compare a TOC with the headings: [{ kind: 'missing'|'stale', heading|entry }] */
export function checkToc(md, opts = {}) {
  const toc = findToc(md); if (!toc) return { toc: null, problems: [] };
  const hs = tocHeadings(md, { ...opts, toc });
  const listed = new Set(toc.entries.map((e) => e.anchor));
  const problems = [];
  for (const e of toc.entries) if (!md.anchors.has(e.anchor)) problems.push({ kind: 'stale', entry: e });
  const maxListed = Math.max(0, ...toc.entries.map((e) => md.headings.find((h) => h.slug === e.anchor)?.level || 0));
  for (const h of hs) if (!listed.has(h.slug) && h.level <= Math.max(opts.minLevel ?? 2, maxListed)) problems.push({ kind: 'missing', heading: h });
  return { toc, problems };
}

/** Rewrite the TOC between markers (adds markers after the first heading block if absent and opts.insert). Returns new text or null. */
export function updateToc(text, md, opts = {}) {
  const toc = findToc(md); const gen = generateToc(md, opts);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (toc?.marker && toc.end) { const next = [...lines.slice(0, toc.start), '', gen, '', ...lines.slice(toc.end - 1)]; const out = next.join('\n'); return out === lines.join('\n') ? null : out; }
  if (!toc && opts.insert) { const h2 = md.headings.find((h) => h.level >= 2); if (!h2) return null; const i = h2.line - 1; return [...lines.slice(0, i), '## Contents', '', '<!-- toc -->', '', gen, '', '<!-- tocstop -->', '', ...lines.slice(i)].join('\n'); }
  return null;
}
void slug;
