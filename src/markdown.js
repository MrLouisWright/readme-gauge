// Small Markdown scanner: headings, sections, fenced code, links, images, badges.

/** GitHub-style heading slug. */
export function slug(text) {
  return String(text).trim().toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\- ]/gu, '')
    .replace(/ /g, '-');
}

/** Parse markdown into lines with code-fence awareness. */
export function scan(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const headings = []; const codeBlocks = []; const links = []; const refs = {};
  let fence = null; let block = null; let inComment = false;
  const slugCount = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; const n = i + 1;
    if (fence) {
      if (new RegExp(`^\\s{0,3}${fence.ch}{${fence.len},}\\s*$`).test(line)) { fence = null; block.end = n; codeBlocks.push(block); block = null; } else block.text += line + '\n';
      continue;
    }
    const f = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line);
    if (f) { fence = { ch: f[1][0] === '`' ? '`' : '~', len: f[1].length }; block = { lang: f[2].toLowerCase(), start: n, text: '' }; continue; }
    if (inComment) { if (line.includes('-->')) inComment = false; continue; }
    if (/<!--/.test(line) && !/-->/.test(line)) { inComment = true; continue; }
    if (/^( {4}|\t)/.test(line) && (i === 0 || lines[i - 1].trim() === '' || /^( {4}|\t)/.test(lines[i - 1])) && !/^\s*([-*+]|\d+\.)\s/.test(lines[i - 1] || '')) continue; // indented code
    let h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    let level; let title;
    if (h) { level = h[1].length; title = h[2]; } else if (i > 0 && lines[i - 1].trim() && !/^\s{0,3}(#|[-*+] |>)/.test(lines[i - 1]) && /^\s{0,3}(=+|-+)\s*$/.test(line) && !(headings.length && headings[headings.length - 1].line === n - 1)) {
      level = line.trim()[0] === '=' ? 1 : 2; title = lines[i - 1].trim(); h = true;
    }
    if (h) {
      const base = slug(title); const c = slugCount[base] || 0; slugCount[base] = c + 1;
      headings.push({ level, title: title.replace(/<[^>]+>/g, '').trim(), line: h === true ? n - 1 : n, slug: c ? `${base}-${c}` : base });
      if (h !== true) { collectLinks(line, n, links); }
      continue;
    }
    const r = /^\s{0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+["'(].*["')])?\s*$/.exec(line);
    if (r) { refs[r[1].toLowerCase()] = { url: r[2], line: n }; continue; }
    collectLinks(line, n, links);
  }
  // resolve reference-style links
  for (const l of links) if (l.ref !== undefined) { const d = refs[(l.ref || l.text).toLowerCase()]; if (d) { l.url = d.url; } }
  // anchors from explicit <a name/id>
  const anchors = new Set(headings.map((h) => h.slug));
  for (const m of String(text).matchAll(/<a\s+[^>]*(?:name|id)=["']([^"']+)["']/gi)) anchors.add(m[1].toLowerCase());
  // sections
  const sections = headings.map((h, idx) => {
    let end = lines.length;
    for (let j = idx + 1; j < headings.length; j++) if (headings[j].level <= h.level) { end = headings[j].line - 1; break; }
    const next = headings[idx + 1];
    const ownEnd = next ? next.line - 1 : lines.length;
    const own = lines.slice(h.line, ownEnd).join('\n');
    return { ...h, endLine: end, body: lines.slice(h.line, end).join('\n'), ownBody: own, code: codeBlocks.filter((b) => b.start > h.line && b.start <= end) };
  });
  const prose = lines.map((l) => l).join('\n');
  return { lines, headings, sections, codeBlocks, links: links.filter((l) => l.url), refs, anchors, text: prose };
}

function collectLinks(line, n, out) {
  const s = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length));
  // [![alt](img)](href) badges
  for (const m of s.matchAll(/\[!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    out.push({ kind: 'image', badge: true, text: m[1], url: m[2], line: n, href: m[3] });
    out.push({ kind: 'link', badgeLink: true, text: m[1], url: m[3], line: n });
  }
  const t = s.replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '');
  for (const m of t.matchAll(/(!?)\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/g)) out.push({ kind: m[1] ? 'image' : 'link', text: m[2], url: m[3], line: n });
  for (const m of t.matchAll(/(!?)\[([^\]]+)\]\[([^\]]*)\]/g)) out.push({ kind: m[1] ? 'image' : 'link', text: m[2], ref: m[3], url: null, line: n });
  for (const m of t.matchAll(/<img\s[^>]*src=["']([^"']+)["']/gi)) out.push({ kind: 'image', html: true, text: '', url: m[1], line: n });
  for (const m of t.matchAll(/<a\s[^>]*href=["']([^"']+)["']/gi)) out.push({ kind: 'link', html: true, text: '', url: m[1], line: n });
}
