// Claude Week: pure helpers for the Week tab. No `$`; register.ts fetches the
// source pages, asks the Week model for the edition, and keeps editions,
// feedback and read state in $.store.
// The edition and feedback shapes follow Omar's Claude Week spec (part 3).

import { dataDir } from './lib.ts'

export type Link = { label: string; url: string }
export type Story = {
  id: string
  title: string
  summary: string
  links: Link[]
  detail: string | null
  ask: string | null
  prompt: string | null
}
export type Section = { id: string; title: string; range: string | null; note: string | null; stories: Story[] }
export type Question = { text: string; prompt: string | null }
export type Edition = {
  edition_id: string
  title: string
  date_from: string
  date_to: string
  intro: string
  feedback_note: string | null
  top3: string[]
  sections: Section[]
  questions: Question[]
  sources: Link[]
}
/** Every stored edition, by its id (`2026-W42`). Editions are never overwritten. */
export type Editions = Record<string, Edition>

export type Verdict = 'up' | 'down' | null
export type Feedback = {
  story_id: string
  edition_id: string
  section: string
  title: string
  verdict: Verdict
  why: string | null
  take: string | null
  updated_at: string
}
/** Feedback by story id, from every edition. */
export type FeedbackStore = Record<string, Feedback>
/** Which stories are read, by id. Kept on this config only and never sent to the writer. */
export type ReadState = Record<string, boolean>

/**
 * Feedback and read marks without edition `id`'s, for when that week's edition
 * is replaced by a new one: its stories, and so their votes, reasons, takes and
 * read marks, go with it.
 */
export function withoutEditionMarks(feedback: FeedbackStore, read: ReadState, edition: Edition | undefined, id: string): { feedback: FeedbackStore; read: ReadState } {
  const stories = new Set((edition?.sections ?? []).flatMap(s => s.stories.map(st => st.id)))
  return {
    feedback: Object.fromEntries(Object.entries(feedback).filter(([, f]) => f.edition_id !== id)),
    read: Object.fromEntries(Object.entries(read).filter(([storyId]) => !stories.has(storyId))),
  }
}

/** What a feedback record copies from its story, so the writer needs no old edition. */
export type StoryRef = { story_id: string; edition_id: string; section: string; title: string }

/** The sections in their fixed order, with the title each gets when the writer leaves it out. */
export const SECTIONS: readonly { id: string; title: string }[] = [
  { id: 'models', title: 'Models and platform' },
  { id: 'code', title: 'Claude Code' },
  { id: 'desktop', title: 'Claude Desktop' },
  { id: 'limits', title: 'Limits and money' },
  { id: 'company', title: 'Company and policy' },
  { id: 'people', title: 'People' },
  { id: 'tips', title: 'Try this week' },
]
export const MAX_STORIES = 15
/** How many earlier editions' feedback the writer reads. */
export const FEEDBACK_EDITIONS = 4

// ---- The week ----

export type Week = { id: string; number: number; title: string; from: string; to: string }

/** The ISO week of `ms`, named as an edition (`2026-W42`, "Claude Week 42"), covering the 7 days that end that day. */
export function isoWeek(ms: number): Week {
  const day = new Date(ms)
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))
  // ISO weeks start on Monday; the week's Thursday decides its year.
  const weekday = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - weekday)
  const year = d.getUTCFullYear()
  const number = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  const to = new Date(ms).toISOString().slice(0, 10)
  const from = new Date(ms - 7 * 86_400_000).toISOString().slice(0, 10)
  return { id: `${year}-W${String(number).padStart(2, '0')}`, number, title: `Claude Week ${number}`, from, to }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 9 – Oct 16" from two ISO dates; the dates as given when they don't parse. */
export function dateRange(from: string, to: string): string {
  const short = (iso: string) => {
    const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso)
    return m ? `${MONTHS[Number(m[1]) - 1] ?? m[1]} ${Number(m[2])}` : iso
  }
  return `${short(from)} – ${short(to)}`
}

// ---- Reading an edition ----

/**
 * Reads the writer's answer as an edition: the JSON object in it (a code fence
 * or prose around it is ignored), checked against the edition shape. Story ids
 * get the edition id in front when they lack it, so they stay unique across
 * editions. Sections go in the fixed order, empty ones go, Claude Desktop always
 * stays, and at most 15 stories are kept (tips aside), keeping the Top 3.
 */
export function parseEdition(text: string, editionId: string): { edition: Edition } | { reason: string } {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return { reason: 'the answer has no JSON object' }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch (err) {
    return { reason: `the JSON doesn't parse (${err instanceof Error ? err.message : String(err)})` }
  }
  if (!Array.isArray(raw.sections)) return { reason: 'the edition has no sections' }

  const seen = new Set<string>()
  const storyId = (id: string) => (id.startsWith(`${editionId}-`) ? id : `${editionId}-${id}`)
  const byId = new Map<string, Section>()
  for (const s of raw.sections as unknown[]) {
    const sec = s as Record<string, unknown>
    const id = str(sec.id)
    if (!id || byId.has(id)) continue
    const stories: Story[] = []
    for (const r of Array.isArray(sec.stories) ? (sec.stories as unknown[]) : []) {
      const st = r as Record<string, unknown>
      const sid = str(st.id)
      const title = str(st.title)
      if (!sid || !title) continue
      const full = storyId(sid)
      if (seen.has(full)) continue
      seen.add(full)
      stories.push({
        id: full,
        title,
        summary: str(st.summary) ?? '',
        links: links(st.links).slice(0, 4),
        detail: str(st.detail) ?? null,
        ask: str(st.ask) ?? null,
        prompt: str(st.prompt) ?? null,
      })
    }
    const fallback = SECTIONS.find(x => x.id === id)?.title ?? id
    byId.set(id, { id, title: str(sec.title) ?? fallback, range: str(sec.range) ?? null, note: str(sec.note) ?? null, stories })
  }
  if (seen.size === 0) return { reason: 'the edition has no stories' }

  if (!byId.has('desktop')) byId.set('desktop', { id: 'desktop', title: 'Claude Desktop', range: null, note: 'Nothing new for Claude Desktop this week.', stories: [] })
  const order = (id: string) => {
    const i = SECTIONS.findIndex(x => x.id === id)
    return i < 0 ? SECTIONS.length : i
  }
  const sections = [...byId.values()]
    .filter(s => s.stories.length || s.note || s.id === 'desktop')
    .sort((a, b) => order(a.id) - order(b.id))

  const top3 = (Array.isArray(raw.top3) ? (raw.top3 as unknown[]) : [])
    .map(x => str(x))
    .filter((x): x is string => !!x)
    .map(storyId)
    .filter((id, i, all) => seen.has(id) && all.indexOf(id) === i)
    .slice(0, 3)
  capStories(sections, top3)

  return {
    edition: {
      edition_id: editionId,
      title: str(raw.title) ?? `Claude Week ${Number(editionId.slice(-2))}`,
      date_from: str(raw.date_from) ?? '',
      date_to: str(raw.date_to) ?? '',
      intro: str(raw.intro) ?? '',
      feedback_note: str(raw.feedback_note) ?? null,
      top3,
      sections,
      questions: (Array.isArray(raw.questions) ? (raw.questions as unknown[]) : [])
        .map(q => q as Record<string, unknown>)
        .filter(q => str(q.text))
        .map(q => ({ text: str(q.text)!, prompt: str(q.prompt) ?? null })),
      sources: links(raw.sources),
    },
  }
}

/** Drops the least important stories past 15 (tips aside): the last in each section first, from the last section up, never a Top 3 story. */
function capStories(sections: Section[], top3: string[]): void {
  const news = sections.filter(s => s.id !== 'tips')
  while (news.reduce((n, s) => n + s.stories.length, 0) > MAX_STORIES) {
    const candidates = news
      .flatMap((s, si) => s.stories.map((x, i) => ({ s, si, i, id: x.id })))
      .filter(c => !top3.includes(c.id))
    if (!candidates.length) return
    // The lowest-ranked story within its section, from the section furthest down.
    const drop = candidates.reduce((a, b) => (b.i > a.i || (b.i === a.i && b.si > a.si) ? b : a))
    drop.s.stories.splice(drop.i, 1)
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function links(v: unknown): Link[] {
  if (!Array.isArray(v)) return []
  return v
    .map(l => l as Record<string, unknown>)
    .filter(l => typeof l.url === 'string' && /^https?:\/\//.test(l.url))
    .map(l => ({ label: str(l.label) ?? String(l.url), url: String(l.url) }))
}

/** Every story in an edition, with the section it sits in. */
export function storiesOf(edition: Edition): { story: Story; section: Section }[] {
  return edition.sections.flatMap(section => section.stories.map(story => ({ story, section })))
}

/** What a feedback record about `storyId` copies from its edition, or undefined when no stored edition has it. */
export function storyRef(editions: Editions, storyId: string): StoryRef | undefined {
  for (const e of Object.values(editions)) {
    const found = storiesOf(e).find(x => x.story.id === storyId)
    if (found) return { story_id: storyId, edition_id: e.edition_id, section: found.section.id, title: found.story.title }
  }
  return undefined
}

// ---- Feedback ----

/** Up or down on a story. The same choice again clears the vote; any change clears the reason, which was about the old vote. */
export function vote(store: FeedbackStore, ref: StoryRef, verdict: 'up' | 'down', now: string): FeedbackStore {
  const old = store[ref.story_id]
  const next: Verdict = old?.verdict === verdict ? null : verdict
  return prune({ ...store, [ref.story_id]: { ...base(old, ref), verdict: next, why: null, updated_at: now } })
}

/** The reason for the vote; empty text clears it. */
export function setWhy(store: FeedbackStore, ref: StoryRef, why: string, now: string): FeedbackStore {
  const old = store[ref.story_id]
  if ((old?.why ?? '') === why.trim()) return store
  return prune({ ...store, [ref.story_id]: { ...base(old, ref), why: why.trim() || null, updated_at: now } })
}

/** The reader's own view, independent of the vote; empty text clears it. */
export function setTake(store: FeedbackStore, ref: StoryRef, take: string, now: string): FeedbackStore {
  const old = store[ref.story_id]
  if ((old?.take ?? '') === take.trim()) return store
  return prune({ ...store, [ref.story_id]: { ...base(old, ref), take: take.trim() || null, updated_at: now } })
}

function base(old: Feedback | undefined, ref: StoryRef): Feedback {
  return old ?? { ...ref, verdict: null, why: null, take: null, updated_at: '' }
}

/** Drops every record whose verdict, reason and take are all empty. */
export function prune(store: FeedbackStore): FeedbackStore {
  return Object.fromEntries(Object.entries(store).filter(([, f]) => f.verdict || f.why || f.take))
}

/** The feedback the writer reads: the records from the last four editions that have any, newest first. */
export function feedbackForPrompt(store: FeedbackStore): Feedback[] {
  const all = Object.values(store)
  const recent = [...new Set(all.map(f => f.edition_id))].sort().reverse().slice(0, FEEDBACK_EDITIONS)
  return all.filter(f => recent.includes(f.edition_id)).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

/** A page the writer reads, as fetched today, or why it couldn't be read. */
export type FetchedPage = { tier: number; label: string; url: string } & ({ text: string } | { error: string })

/**
 * The writer's request: the week to write, the reader profile, the earlier
 * feedback, and the text of every source page (or why one couldn't be read).
 */
export function buildWeekRequest(profile: string, feedback: Feedback[], week: Week, pages: FetchedPage[]): string {
  const read = pages.filter((p): p is FetchedPage & { text: string } => 'text' in p)
  const unread = pages.filter((p): p is FetchedPage & { error: string } => 'error' in p)
  return [
    `Today is ${week.to}. Write edition ${week.id} ("${week.title}"), covering ${week.from} to ${week.to}.`,
    `<reader_profile>\n${profile.trim()}\n</reader_profile>`,
    feedback.length
      ? `<feedback>\n${feedback.map(f => JSON.stringify(f)).join('\n')}\n</feedback>`
      : '<feedback>\nNone yet: this is the first edition with feedback to read.\n</feedback>',
    `<pages>\n${read.map(p => `<page tier="${p.tier}" label="${p.label}" url="${p.url}">\n${p.text}\n</page>`).join('\n')}\n</pages>`,
    unread.length ? `<unread>\n${unread.map(p => `${p.label} <${p.url}>: ${p.error}`).join('\n')}\n</unread>` : '',
    'Return the edition as JSON only, in the edition format.',
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ---- Source pages ----

/** One page in week/sources.json: where it is, its tier, and the page stories link to when that differs. */
export type WeekSource = { tier: number; label: string; url: string; kind?: 'github-releases'; link?: string }

/** How much of one page the writer gets; release notes get more, as they carry the Claude Code stories. */
export const PAGE_MAX_CHARS = 20_000
export const RELEASES_MAX_CHARS = 40_000
/** How far back the release notes reach: a week, plus a week of background. */
const RELEASES_DAYS = 14

/** Reads week/sources.json, keeping https pages with a tier and a label. */
export function parseWeekSources(json: string): WeekSource[] {
  const raw = JSON.parse(json) as { pages?: unknown }
  return (Array.isArray(raw.pages) ? (raw.pages as Record<string, unknown>[]) : [])
    .filter(p => typeof p.url === 'string' && p.url.startsWith('https://') && typeof p.label === 'string' && typeof p.tier === 'number')
    .map(p => ({
      tier: p.tier as number,
      label: p.label as string,
      url: p.url as string,
      ...(p.kind === 'github-releases' ? { kind: 'github-releases' as const } : {}),
      ...(typeof p.link === 'string' && p.link.startsWith('https://') ? { link: p.link } : {}),
    }))
    .sort((a, b) => a.tier - b.tier)
}

/**
 * A page's readable text: scripts, styles and the head gone, each link kept as
 * `text <url>` (made absolute), blocks on their own lines, entities decoded,
 * repeated lines dropped, and cut to `max` characters. Works for feeds too.
 */
export function pageText(source: string, base: string, max = PAGE_MAX_CHARS): string {
  let s = source.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  s = s.replace(/<(script|style|noscript|svg|head|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const url = absolute(decode(href), base)
    // Marked, not bracketed: the tag stripping below would take <url> for a tag.
    return url && label ? ` ${label} \u0001${url}\u0002 ` : ` ${label} `
  })
  s = s.replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/tr|\/article|\/section|\/item|\/entry|\/title|\/time)\b[^>]*>/gi, '\n')
  s = decode(s.replace(/<[^>]+>/g, ' ')).replace(/\u0001([^\u0002]*)\u0002/g, '<$1>')
  const lines: string[] = []
  for (const line of s.split('\n')) {
    const t = line.replace(/[ \t\u00a0]+/g, ' ').trim()
    if (t && t !== lines.at(-1)) lines.push(t)
  }
  return cut(lines.join('\n'), max)
}

/** The GitHub releases API's JSON as release notes: the last 14 days' releases (the latest 3 if none), newest first. */
export function releasesText(json: string, nowMs: number, max = RELEASES_MAX_CHARS): string {
  const all = (JSON.parse(json) as Record<string, unknown>[])
    .filter(r => typeof r.published_at === 'string')
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)))
  const since = new Date(nowMs - RELEASES_DAYS * 86_400_000).toISOString()
  const recent = all.filter(r => String(r.published_at) >= since)
  const shown = recent.length ? recent : all.slice(0, 3)
  return cut(
    shown
      .map(r => `## ${String(r.name || r.tag_name)} (${String(r.published_at).slice(0, 10)}) <${String(r.html_url)}>\n${String(r.body ?? '').trim()}`)
      .join('\n\n'),
    max,
  )
}

function absolute(href: string, base: string): string | undefined {
  if (href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) return undefined
  try {
    const url = new URL(href, base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

function cut(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}\n[cut: the page goes on]` : s
}

/**
 * What a side chat about a story asks: the story's prompt, then the story
 * itself, since the side chat sees only the session's conversation. One line,
 * as a typed `/btw` question is.
 */
export function asideAboutStory(s: Story): string {
  const about = [s.summary, s.detail].filter(Boolean).join(' ')
  const sources = s.links.length ? ` Sources: ${s.links.map(l => l.url).join(', ')}.` : ''
  return oneLine(`${s.prompt ?? s.title} (This is about the Claude Week story "${s.title}": ${about}${sources})`)
}

/** What a side chat about one of an edition's questions asks: its prompt, with the question it comes from. */
export function asideAboutQuestion(q: Question, editionTitle: string): string {
  return oneLine(`${q.prompt ?? q.text} (From the questions in ${editionTitle}: "${q.text}")`)
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Read counts: the edition's news stories (tips aside) and each news section's. */
export function readCounts(edition: Edition, read: ReadState): { read: number; total: number; sections: { id: string; title: string; read: number; total: number }[] } {
  const sections = edition.sections
    .filter(s => s.id !== 'tips' && s.stories.length)
    .map(s => ({ id: s.id, title: s.title, read: s.stories.filter(x => read[x.id]).length, total: s.stories.length }))
  return { read: sections.reduce((n, s) => n + s.read, 0), total: sections.reduce((n, s) => n + s.total, 0), sections }
}

/** The stored editions' ids, newest first. */
export function editionIds(editions: Editions): string[] {
  return Object.keys(editions).sort().reverse()
}

/** One line of the Week tab's archive: an edition, its dates, and how far Omar got with it. */
export type ArchiveRow = { id: string; title: string; range: string; read: number; total: number; voted: number }

/** Every stored edition for the archive, newest first, with its stories read and the ones voted on. */
export function archiveRows(editions: Editions, feedback: FeedbackStore, read: ReadState): ArchiveRow[] {
  return editionIds(editions).map(id => {
    const e = editions[id]!
    const counts = readCounts(e, read)
    const voted = Object.values(feedback).filter(f => f.edition_id === id && f.verdict).length
    return { id, title: e.title, range: e.date_from && e.date_to ? dateRange(e.date_from, e.date_to) : '', read: counts.read, total: counts.total, voted }
  })
}

/** Where the reader profile lives: the mod's own data folder (see dataDir in lib.ts), so updates never touch it. */
export function profilePath(root: string, name: string, configDir: string): string {
  return `${dataDir(root, name, configDir)}/profile.yaml`
}
