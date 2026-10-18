// Analytics: what the pane's Analytics tab shows about the person's drafts.
// Pure; register.ts records each analysis and each Apply, ui.ts draws the
// figures. One record per analyzed draft, with no draft text: each checklist
// item's status, the rules behind the changes, the suggestions offered, and
// whether the rewrite was applied. Every figure is worked out from these, so
// nothing else needs a model call.

import type { Analysis, CheckStatus } from './lib.ts'

/**
 * Statistics are off while the checklist's design changes (v0.14.0): nothing
 * is recorded and the Analytics tab says so. Stored records are kept as they are.
 */
export const STATS_ON = false

/**
 * The six items the stored records were judged on, before the checklist moved
 * into the rule files. The statistics read only these, so old records stay readable.
 */
export const CHECKLIST = ['Goal', 'Context', 'Constraints', 'Done means', 'Stop rule', 'Output'] as const
export type CheckName = (typeof CHECKLIST)[number]

/** How many drafts are kept, newest first; older ones drop off. */
export const MAX_DRAFTS = 200
/** The window "your last drafts" means, and the window before it that progress compares with. */
export const RECENT = 10
/** How full the earlier window must be before a comparison with it is shown. */
const MIN_BEFORE = 5

/** What the analyses' model calls cost, summed: `calls` answered calls and their tokens by kind. */
export type TokenCounts = { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number }
export const NO_TOKENS: TokenCounts = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** One analyzed draft. */
export type DraftRecord = {
  at: number
  /** The session's model when it was analyzed (its label, such as "Opus 5.5"); '' when unknown. */
  model: string
  status: Partial<Record<CheckName, CheckStatus>>
  /** The rules behind the rewrite's changes, each once. */
  rules: string[]
  /** The suggestions offered: the item each fills, and its sentence. */
  offered: { item?: CheckName; text: string }[]
  /** How many suggestions were in the rewrite when it was last applied. */
  added: number
  /** True once the rewrite went to the prompt box (Apply or Apply and send). */
  applied: boolean
}

export type Analytics = { drafts: DraftRecord[]; tokens: TokenCounts }
export const NO_ANALYTICS: Analytics = { drafts: [], tokens: NO_TOKENS }

const STATUSES: readonly CheckStatus[] = ['present', 'partial', 'missing', 'n/a']
const isItem = (x: unknown): x is CheckName => (CHECKLIST as readonly unknown[]).includes(x)

/** Reads a stored value as Analytics, keeping only well-formed drafts. */
export function asAnalytics(value: unknown): Analytics {
  const v = (value && typeof value === 'object' ? value : {}) as { drafts?: unknown; tokens?: unknown }
  const n = (x: unknown) => (typeof x === 'number' && x >= 0 ? x : 0)
  const t = (v.tokens && typeof v.tokens === 'object' ? v.tokens : {}) as Partial<TokenCounts>
  const drafts = (Array.isArray(v.drafts) ? v.drafts : []).flatMap((d): DraftRecord[] => {
    const r = d as Partial<DraftRecord> | undefined
    if (!r || typeof r.at !== 'number' || !r.status || typeof r.status !== 'object') return []
    const status: DraftRecord['status'] = {}
    for (const [item, s] of Object.entries(r.status)) if (isItem(item) && STATUSES.includes(s as CheckStatus)) status[item] = s as CheckStatus
    return [
      {
        at: r.at,
        model: typeof r.model === 'string' ? r.model : '',
        status,
        rules: Array.isArray(r.rules) ? r.rules.filter((x): x is string => typeof x === 'string') : [],
        offered: Array.isArray(r.offered)
          ? r.offered.flatMap(o => (o && typeof o.text === 'string' ? [{ text: o.text, ...(isItem(o.item) ? { item: o.item } : {}) }] : []))
          : [],
        added: n(r.added),
        applied: r.applied === true,
      },
    ]
  })
  return {
    drafts: drafts.slice(0, MAX_DRAFTS),
    tokens: { calls: n(t.calls), input: n(t.input), output: n(t.output), cacheRead: n(t.cacheRead), cacheWrite: n(t.cacheWrite) },
  }
}

/** Adds one analysis, newest first, keeping at most MAX_DRAFTS. */
export function recordDraft(a: Analytics, analysis: Analysis, model: string, at: number): Analytics {
  const status: DraftRecord['status'] = {}
  for (const c of analysis.checklist) if (isItem(c.item)) status[c.item] = c.status
  const draft: DraftRecord = {
    at,
    model,
    status,
    rules: [...new Set(analysis.changes.map(c => c.rule))],
    offered: analysis.additions.map(s => ({ text: s.text, ...(isItem(s.item) ? { item: s.item } : {}) })),
    added: 0,
    applied: false,
  }
  return { ...a, drafts: [draft, ...a.drafts].slice(0, MAX_DRAFTS) }
}

/** Marks the draft analyzed at `at` as applied, with `added` suggestions in it (the most it was applied with). */
export function recordUse(a: Analytics, at: number, added: number): Analytics {
  return { ...a, drafts: a.drafts.map(d => (d.at === at ? { ...d, applied: true, added: Math.max(d.added, added) } : d)) }
}

/** Adds one answered analysis call's usage. */
export function addUsage(
  a: Analytics,
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number },
): Analytics {
  const t = a.tokens
  return {
    ...a,
    tokens: {
      calls: t.calls + 1,
      input: t.input + usage.input_tokens,
      output: t.output + usage.output_tokens,
      cacheRead: t.cacheRead + usage.cache_read_input_tokens,
      cacheWrite: t.cacheWrite + usage.cache_creation_input_tokens,
    },
  }
}

/** The token totals, or undefined before any were counted. Cache is read plus written. */
export function tokenSummary(a: Analytics): { total: number; input: number; output: number; cache: number; perCall: number } | undefined {
  const t = a.tokens
  const cache = t.cacheRead + t.cacheWrite
  const total = t.input + t.output + cache
  if (!t.calls || !total) return undefined
  return { total, input: t.input, output: t.output, cache, perCall: Math.round(total / t.calls) }
}

const isGap = (s: CheckStatus | undefined) => s === 'missing' || s === 'partial'
const counts = (s: CheckStatus | undefined) => s !== undefined && s !== 'n/a'

/** Gaps (missing or vague) in one item over some drafts, out of the drafts it applied to. */
function gapsIn(drafts: DraftRecord[], item: CheckName): { gaps: number; of: number } {
  const applicable = drafts.filter(d => counts(d.status[item]))
  return { gaps: applicable.filter(d => isGap(d.status[item])).length, of: applicable.length }
}

/** One checklist item over the kept drafts: left out, vague, present, and the last drafts against the ones before. */
export type ItemStat = {
  item: CheckName
  applicable: number
  missing: number
  vague: number
  present: number
  recent: { gaps: number; of: number }
  before?: { gaps: number; of: number }
}

/** Every item that applied to at least one draft, most often missing or vague first. */
export function itemStats(a: Analytics): ItemStat[] {
  const recent = a.drafts.slice(0, RECENT)
  const earlier = a.drafts.slice(RECENT, RECENT * 2)
  return CHECKLIST.map((item): ItemStat => {
    const of = (s: CheckStatus) => a.drafts.filter(d => d.status[item] === s).length
    const before = gapsIn(earlier, item)
    return {
      item,
      applicable: a.drafts.filter(d => counts(d.status[item])).length,
      missing: of('missing'),
      vague: of('partial'),
      present: of('present'),
      recent: gapsIn(recent, item),
      ...(before.of >= MIN_BEFORE ? { before } : {}),
    }
  })
    .filter(s => s.applicable > 0)
    .sort((x, y) => (y.missing + y.vague) / y.applicable - (x.missing + x.vague) / x.applicable)
}

/**
 * A draft's score out of 6: a full point for each item present or not
 * needed (n/a), half for one that's there but vague, none when missing.
 */
export function draftScore(d: DraftRecord): number {
  return CHECKLIST.reduce((sum, item) => {
    const s = d.status[item]
    return sum + (s === 'present' || s === 'n/a' ? 1 : s === 'partial' ? 0.5 : 0)
  }, 0)
}

/** The average score of the last drafts, and of the ones before when there are enough to compare; one decimal. */
export function scoreTrend(a: Analytics): { recent: number; before?: number } | undefined {
  const avg = (ds: DraftRecord[]) => Math.round((ds.reduce((s, d) => s + draftScore(d), 0) / ds.length) * 10) / 10
  const recent = a.drafts.slice(0, RECENT)
  if (!recent.length) return undefined
  const earlier = a.drafts.slice(RECENT, RECENT * 2)
  return { recent: avg(recent), ...(earlier.length >= MIN_BEFORE ? { before: avg(earlier) } : {}) }
}

/** What the drafts do well: up to three items present in at least 60% of the drafts they applied to, best first. */
export function strengths(a: Analytics): { item: CheckName; present: number; of: number }[] {
  return itemStats(a)
    .filter(s => s.present / s.applicable >= 0.6)
    .sort((x, y) => y.present / y.applicable - x.present / x.applicable)
    .slice(0, 3)
    .map(s => ({ item: s.item, present: s.present, of: s.applicable }))
}

/**
 * The one item to work on next: the one most often missing or vague in the
 * last drafts, with the newest sentence the coach suggested for it.
 */
export function focus(a: Analytics): { item: CheckName; gaps: number; of: number; example?: string } | undefined {
  const recent = a.drafts.slice(0, RECENT)
  const worst = CHECKLIST.map(item => ({ item, ...gapsIn(recent, item) }))
    .filter(x => x.gaps > 0)
    .sort((x, y) => y.gaps / y.of - x.gaps / x.of)[0]
  if (!worst) return undefined
  const example = a.drafts.flatMap(d => d.offered).find(o => o.item === worst.item)?.text
  return { ...worst, ...(example ? { example } : {}) }
}

/**
 * The rules behind the most changes in drafts written for `model` (all
 * drafts when it's ''), each counted once per draft, top four first, with
 * how many drafts that is.
 */
export function rulesFor(a: Analytics, model: string): { rules: [string, number][]; of: number } {
  const drafts = model ? a.drafts.filter(d => d.model === model) : a.drafts
  const n: Record<string, number> = {}
  for (const d of drafts) for (const r of d.rules) n[r] = (n[r] ?? 0) + 1
  const rules = Object.entries(n)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, 4)
  return { rules, of: drafts.length }
}

/** How much of the coach's advice was taken: suggestions added of those offered, and rewrites applied. */
export function advice(a: Analytics): { added: number; offered: number; applied: number; drafts: number } {
  return {
    added: a.drafts.reduce((s, d) => s + Math.min(d.added, d.offered.length), 0),
    offered: a.drafts.reduce((s, d) => s + d.offered.length, 0),
    applied: a.drafts.filter(d => d.applied).length,
    drafts: a.drafts.length,
  }
}
