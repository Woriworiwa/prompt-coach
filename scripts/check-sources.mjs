#!/usr/bin/env node
// Which rules files' source pages changed since the last reviewed refresh.
// Used by the weekly refresh routine (refresh/ROUTINE.md); needs Node 18+ and no packages.
//
//   node scripts/check-sources.mjs            prints JSON: { changed, failed, checked }
//   node scripts/check-sources.mjs --record   also writes the fresh fingerprints to refresh/fingerprints.json
//
// `changed` maps each rules file to its pages that differ from the recorded fingerprint
// (or were never recorded). A page that can't be fetched is listed under `failed` and
// keeps its old fingerprint, so the next run tries it again.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const FINGERPRINTS = join(root, 'refresh/fingerprints.json')

/** The Markdown copy of a docs page, served at the same path plus `.md`. */
const fetchUrl = url => `${url.replace(/\/+$/, '')}.md`

/** A page's fingerprint: SHA-256 of its text, ignoring trailing spaces and line-ending style. */
function fingerprint(text) {
  const s = text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim()
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

const sources = JSON.parse(await readFile(join(root, 'sources.json'), 'utf8')).targets ?? {}
const seen = JSON.parse(await readFile(FINGERPRINTS, 'utf8').catch(() => '{}'))
const urls = [...new Set(Object.values(sources).flat())]

const now = {}
const failed = []
await Promise.all(
  urls.map(async url => {
    try {
      const res = await fetch(fetchUrl(url), { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      now[url] = fingerprint(await res.text())
    } catch (err) {
      failed.push({ url, reason: err instanceof Error ? err.message : String(err) })
    }
  }),
)

const changed = {}
for (const [target, pages] of Object.entries(sources)) {
  const differ = pages.filter(url => now[url] !== undefined && seen[url] !== now[url])
  if (differ.length) changed[target] = differ
}

if (process.argv.includes('--record')) {
  const sorted = Object.fromEntries(Object.entries({ ...seen, ...now }).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(FINGERPRINTS, `${JSON.stringify(sorted, null, 2)}\n`)
}
console.log(JSON.stringify({ changed, failed, checked: urls.length }, null, 2))
