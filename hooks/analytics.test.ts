import { describe, expect, test } from 'claude-code/testing'
import {
  type Analytics,
  type DraftRecord,
  MAX_DRAFTS,
  NO_ANALYTICS,
  addUsage,
  advice,
  asAnalytics,
  draftScore,
  focus,
  itemStats,
  recordDraft,
  recordUse,
  rulesFor,
  scoreTrend,
  strengths,
  tokenSummary,
  type CheckName,
} from './analytics.ts'
import type { Analysis, CheckStatus } from './lib.ts'

/** An analysis with the given statuses (others unjudged), rules and suggestions. */
function analysis(status: Partial<Record<CheckName, CheckStatus>>, rules: string[] = [], additions: Analysis['additions'] = []): Analysis {
  return {
    checklist: Object.entries(status).map(([item, s]) => ({ item, status: s!, note: '' })),
    rewrite: 'x',
    changes: rules.map(rule => ({ rule, why: '' })),
    placeholders: [],
    additions,
  }
}

const ALL_PRESENT = { Goal: 'present', Context: 'present', Constraints: 'present', 'Done means': 'present', 'Stop rule': 'present', Output: 'present' } as const

/** `n` drafts, oldest first in the call, so the last one added is the newest. */
function drafts(list: Analysis[], model = 'Opus 5.5'): Analytics {
  return list.reduce((a, an, i) => recordDraft(a, an, model, i + 1), NO_ANALYTICS)
}

describe('recording', () => {
  test('recordDraft keeps statuses, each rule once and the suggestions, newest first, at most MAX_DRAFTS', () => {
    const an = analysis({ Goal: 'partial', Output: 'present' }, ['Be explicit', 'Be explicit', 'Say why'], [{ label: 'l', text: 'Done means tests pass.', item: 'Done means' }])
    const a = recordDraft(NO_ANALYTICS, an, 'Opus 5.5', 5)
    expect(a.drafts[0]).toEqual({
      at: 5,
      model: 'Opus 5.5',
      status: { Goal: 'partial', Output: 'present' },
      rules: ['Be explicit', 'Say why'],
      offered: [{ text: 'Done means tests pass.', item: 'Done means' }],
      added: 0,
      applied: false,
    })
    let many = NO_ANALYTICS
    for (let i = 0; i < MAX_DRAFTS + 5; i++) many = recordDraft(many, an, '', i)
    expect(many.drafts).toHaveLength(MAX_DRAFTS)
    expect(many.drafts[0]!.at).toBe(MAX_DRAFTS + 4)
  })

  test('recordUse marks the draft analyzed at that time, keeping the most suggestions it was applied with', () => {
    let a = drafts([analysis({}), analysis({})])
    a = recordUse(recordUse(a, 1, 2), 1, 1)
    expect(a.drafts.find(d => d.at === 1)).toMatchObject({ applied: true, added: 2 })
    expect(a.drafts.find(d => d.at === 2)).toMatchObject({ applied: false, added: 0 })
  })

  test('addUsage sums each answered call, and tokenSummary totals them', () => {
    const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200, cache_creation_input_tokens: 100 }
    const a = addUsage(addUsage(NO_ANALYTICS, usage), usage)
    expect(a.tokens).toEqual({ calls: 2, input: 2000, output: 1000, cacheRead: 400, cacheWrite: 200 })
    expect(tokenSummary(a)).toEqual({ total: 3600, input: 2000, output: 1000, cache: 600, perCall: 1800 })
    expect(tokenSummary(NO_ANALYTICS)).toBeUndefined()
  })

  test('asAnalytics keeps well-formed drafts and drops the rest, and reads the old statistics as none', () => {
    const good: DraftRecord = { at: 1, model: 'x', status: { Goal: 'present' }, rules: ['r'], offered: [{ text: 't' }], added: 1, applied: true }
    const long = 'x'.repeat(41)
    const a = asAnalytics({
      drafts: [good, { at: 'no' }, { at: 2, status: JSON.parse(`{"Goal": "odd", "Examples": "present", "${long}": "present", "": "present", "__proto__": "present"}`) }],
      tokens: { calls: 1, input: 2 },
    })
    // Any item name a rule file could give is kept; an odd status, an empty or over-long name, or __proto__ is not.
    expect(a.drafts).toEqual([good, { at: 2, model: '', status: { Examples: 'present' }, rules: [], offered: [], added: 0, applied: false }])
    expect(a.tokens).toEqual({ calls: 1, input: 2, output: 0, cacheRead: 0, cacheWrite: 0 })
    expect(asAnalytics({ analyses: 80, gaps: { Goal: 3 }, rules: {}, recent: [] })).toEqual(NO_ANALYTICS)
    expect(asAnalytics(undefined)).toEqual(NO_ANALYTICS)
  })
})

describe('figures', () => {
  test('draftScore: the share of the draft\'s own checklist covered, a point per item present or n/a, half for vague, none for missing', () => {
    const d = recordDraft(NO_ANALYTICS, analysis({ Goal: 'present', Context: 'n/a', Constraints: 'partial', 'Done means': 'missing' }), '', 1).drafts[0]!
    expect(draftScore(d)).toBe(2.5 / 4)
    expect(draftScore(recordDraft(NO_ANALYTICS, analysis({}), '', 1).drafts[0]!)).toBeUndefined()
  })

  test('draftScore: an item not on a draft\'s checklist counts neither way, so a five-item list covered in full scores like a six-item one', () => {
    const { 'Stop rule': _, ...five } = ALL_PRESENT
    const a = drafts([analysis(five, [], []), analysis(ALL_PRESENT)])
    expect(a.drafts.map(draftScore)).toEqual([1, 1])
    // Stop rule applied to one draft only, and is no gap in the other.
    expect(itemStats(a).find(s => s.item === 'Stop rule')).toMatchObject({ applicable: 1, missing: 0 })
  })

  test('scoreTrend compares the last 10 drafts with the 10 before, once the earlier window has 5, in whole percent', () => {
    const weak = analysis({ Goal: 'present', Context: 'missing', Constraints: 'missing', 'Done means': 'missing', 'Stop rule': 'missing', Output: 'missing' })
    // 4 earlier: too few to compare.
    expect(scoreTrend(drafts([...Array(4).fill(weak), ...Array(10).fill(analysis(ALL_PRESENT))]))).toEqual({ recent: 100 })
    expect(scoreTrend(drafts([...Array(10).fill(weak), ...Array(10).fill(analysis(ALL_PRESENT))]))).toEqual({ recent: 100, before: 17 })
    expect(scoreTrend(NO_ANALYTICS)).toBeUndefined()
  })

  test('an item only some models\' checklists have is counted by its name, alongside the shared ones', () => {
    const a = drafts([analysis({ Goal: 'present', Examples: 'missing' }), analysis({ Goal: 'present', Examples: 'missing' })])
    expect(itemStats(a).map(s => s.item)).toEqual(['Examples', 'Goal'])
    expect(focus(a)).toMatchObject({ item: 'Examples', gaps: 2, of: 2 })
  })

  test('itemStats splits left out from vague, worst first, and compares the last 10 with the 10 before', () => {
    const before = Array(10).fill(analysis({ 'Done means': 'missing', Goal: 'present' }))
    const recent = [...Array(7).fill(analysis({ 'Done means': 'present', Goal: 'present' })), ...Array(3).fill(analysis({ 'Done means': 'partial', Goal: 'n/a' }))]
    const stats = itemStats(drafts([...before, ...recent]))
    expect(stats.map(s => s.item)).toEqual(['Done means', 'Goal'])
    expect(stats[0]).toEqual({ item: 'Done means', applicable: 20, missing: 10, vague: 3, present: 7, recent: { gaps: 3, of: 10 }, before: { gaps: 10, of: 10 } })
    // Goal was n/a in 3 drafts, so it applied to 17.
    expect(stats[1]).toMatchObject({ applicable: 17, missing: 0, vague: 0, present: 17 })
  })

  test('strengths: up to three items present in at least 60% of the drafts they applied to', () => {
    const a = drafts([analysis({ Goal: 'present', Context: 'present', Output: 'missing' }), analysis({ Goal: 'present', Context: 'partial', Output: 'missing' })])
    expect(strengths(a)).toEqual([{ item: 'Goal', present: 2, of: 2 }])
  })

  test('focus: the item most often missing or vague lately, with the newest suggestion for it', () => {
    const a = drafts([
      analysis({ 'Stop rule': 'missing', Goal: 'missing' }, [], [{ label: 'l', text: 'Stop and ask before deleting.', item: 'Stop rule' }]),
      analysis({ 'Stop rule': 'missing', Goal: 'present' }, [], [{ label: 'l', text: 'Stop if a test fails.', item: 'Stop rule' }]),
    ])
    expect(focus(a)).toEqual({ item: 'Stop rule', gaps: 2, of: 2, example: 'Stop if a test fails.' })
    expect(focus(drafts([analysis(ALL_PRESENT)]))).toBeUndefined()
  })

  test('rulesFor counts each rule once per draft, for the model asked or all drafts', () => {
    const a = {
      ...drafts([analysis({}, ['Be explicit', 'Say why']), analysis({}, ['Be explicit'])]),
    }
    const mixed = recordDraft(a, analysis({}, ['Be explicit', 'Use XML']), 'Sonnet 5.5', 9)
    expect(rulesFor(mixed, 'Opus 5.5')).toEqual({ rules: [['Be explicit', 2], ['Say why', 1]], of: 2 })
    expect(rulesFor(mixed, '')).toEqual({ rules: [['Be explicit', 3], ['Say why', 1], ['Use XML', 1]], of: 3 })
    expect(rulesFor(mixed, 'Haiku 5.5')).toEqual({ rules: [], of: 0 })
  })

  test('advice counts suggestions added of those offered, and rewrites applied', () => {
    const offer = [{ label: 'a', text: 'A.' }, { label: 'b', text: 'B.' }]
    let a = drafts([analysis({}, [], offer), analysis({}, [], offer), analysis({})])
    a = recordUse(a, 1, 2)
    a = recordUse(a, 3, 0)
    expect(advice(a)).toEqual({ added: 2, offered: 4, applied: 2, drafts: 3 })
  })
})
