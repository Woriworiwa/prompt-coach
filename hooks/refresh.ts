// Pure helpers for /coach refresh: no `$`, so tests can call them directly.
// The fetching and file writing live in register.ts, where `$` may be passed.

/** sources.json: each target file under the plugin root, with the pages it is rebuilt from. */
export type Sources = { targets: Record<string, string[]> }

/** One target's outcome, as the Refresh view lists it. */
export type RefreshResult =
  | { target: string; state: 'changed'; diff: string; next: string }
  | { target: string; state: 'same' }
  | { target: string; state: 'failed'; reason: string }

/** Reads sources.json, keeping only targets under rules/ or tips/. */
export function parseSources(json: string): Sources {
  const raw = JSON.parse(json) as { targets?: Record<string, unknown> }
  const targets: Record<string, string[]> = {}
  for (const [target, urls] of Object.entries(raw.targets ?? {})) {
    if (!/^(rules|tips)\/[a-z0-9-]+\.md$/.test(target)) continue
    if (!Array.isArray(urls)) continue
    const https = urls.filter((u): u is string => typeof u === 'string' && u.startsWith('https://'))
    if (https.length) targets[target] = https
  }
  return { targets }
}

/** Each source page's fingerprint, by URL, as of the last refresh Omar reviewed. */
export type Fingerprints = Record<string, string>

/**
 * A short fingerprint of a page's text, so a refresh can tell whether the page
 * changed without keeping a copy. Ignores trailing spaces and line-ending style.
 * Two 32-bit hashes (FNV-1a and djb2) plus the length: plenty for spotting edits.
 */
export function fingerprint(text: string): string {
  const s = text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim()
  let fnv = 0x811c9dc5
  let djb = 5381
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    fnv = Math.imul(fnv ^ c, 0x01000193) >>> 0
    djb = (Math.imul(djb, 33) + c) >>> 0
  }
  return `${fnv.toString(16).padStart(8, '0')}${djb.toString(16).padStart(8, '0')}-${s.length}`
}

/** The URLs whose page differs from the fingerprint last seen, or that were never seen. */
export function changedUrls(urls: string[], seen: Fingerprints, now: Fingerprints): string[] {
  return urls.filter(url => now[url] !== undefined && seen[url] !== now[url])
}

/** Reads a stored value as fingerprints, or undefined when there is no baseline yet. */
export function asFingerprints(value: unknown): Fingerprints | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string')
  return entries.length ? Object.fromEntries(entries) : undefined
}

/** The Markdown copy of a docs page, which the docs sites serve at the same path plus `.md`. */
export function toFetchUrl(url: string): string {
  return `${url.replace(/\/+$/, '')}.md`
}

/** Longest page text sent to the model, per source. */
export const MAX_PAGE_CHARS = 60_000

export const REFRESH_SYSTEM = `You update a short Markdown notes file from the source pages it summarizes.

Rules:
- Paraphrase in your own words. Never copy sentences or long phrases from the sources.
- Keep the file's existing structure: its title, its "Source" lines, its headings and its bullet style. Keep it about the same length.
- Change a bullet only where the sources now say something different, add one only for new guidance, and remove one only when the sources no longer support it.
- Keep exact command names, model names and settings as the sources give them.
- Do not add an "As of" line; it is added for you.

Reply with the complete updated file inside <file></file> and nothing else.`

/** The user message for one target's refresh call. */
export function buildRefreshRequest(target: string, current: string, pages: { url: string; text: string }[]): string {
  const sources = pages
    .map(p => `<source url="${p.url}">\n${p.text.slice(0, MAX_PAGE_CHARS)}\n</source>`)
    .join('\n\n')
  return [`<current_file path="${target}">\n${current}\n</current_file>`, sources, 'Update the file.'].join('\n\n')
}

/** The updated file from the model's reply, or undefined when it has none. */
export function parseRefreshReply(reply: string): string | undefined {
  const file = /<file>\s*([\s\S]*?)\s*<\/file>/.exec(reply)?.[1]?.trim()
  return file ? `${file}\n` : undefined
}

/** Sets the file's `As of:` line to `date`, after its Source lines, replacing an old one. */
export function stampAsOf(markdown: string, date: string): string {
  const lines = markdown.split('\n').filter(line => !/^As of:/.test(line))
  // The Source block runs from its first line to the next blank line.
  let at = Math.max(0, lines.findIndex(line => /^Sources?\b/.test(line)))
  while (at + 1 < lines.length && lines[at + 1]!.trim() !== '') at++
  lines.splice(at + 1, 0, `As of: ${date}`)
  return lines.join('\n')
}

/** Compares two texts ignoring the As of line, which every refresh changes. */
export function sameContent(a: string, b: string): boolean {
  const strip = (s: string) => s.replace(/^As of:.*\n?/m, '').trim()
  return strip(a) === strip(b)
}

/** A line diff of two short files: unchanged lines start with two spaces, removed with "- ", added with "+ ". */
export function lineDiff(before: string, after: string): string {
  const a = before.split('\n')
  const b = after.split('\n')
  // Longest common subsequence table; these files are a few dozen lines.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const out: string[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`)
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push(`- ${a[i++]}`)
    } else {
      out.push(`+ ${b[j++]}`)
    }
  }
  while (i < a.length) out.push(`- ${a[i++]}`)
  while (j < b.length) out.push(`+ ${b[j++]}`)
  return compact(out).join('\n')
}

/** Keeps one unchanged line around each change and folds the rest into "  ...". */
function compact(diff: string[]): string[] {
  const near = (i: number) => [i - 1, i, i + 1].some(k => diff[k] !== undefined && !diff[k]!.startsWith('  '))
  const out: string[] = []
  diff.forEach((line, i) => {
    if (near(i)) out.push(line)
    else if (out[out.length - 1] !== '  ...') out.push('  ...')
  })
  return out
}
