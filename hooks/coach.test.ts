import { type Engine, describe, expect, mock, test } from 'claude-code/testing'
import type { On, PromptEditInput, PromptEditResult } from 'claude-code'

import {
  ANALYSIS_SYSTEM,
  LIVE_CAP,
  NO_PICK,
  answersFor,
  fillPlaceholders,
  parseAdditions,
  parsePlaceholders,
  removeSentences,
  withAdditions,
  asOfDate,
  cleanRule,
  dataDir,
  liveSkipReason,
  ownRuleLines,
  withOwnRule,
  withoutOwnRule,
  OWN_RULES_HEADER,
  parseAnalysis,
  parseTips,
  parseRuleFile,
  analysisSystem,
  checklistFor,
  parseChecklist,
  withoutChecklist,
} from './lib.ts'
import { BAR_CELLS, barCount, barRuns } from './ui.ts'
import { type Analytics, NO_ANALYTICS, STATS_ON, recordDraft } from './analytics.ts'
import { parseEdition } from './week.ts'
import { REFRESH_SYSTEM, changedUrls, fingerprint, lineDiff, parseSources, sameContent, stampAsOf, toFetchUrl } from './refresh.ts'

const ANALYSIS = `<checklist>
Goal | partial | "the login thing" is vague
Context | missing | no file or error named
Constraints | n/a | none needed
Done means | missing | no finish line
Stop rule | missing | nothing on when to ask
Output | present | a fix
</checklist>
<rewrite>
Fix the login bug in [which file?]. Done means the login test passes.
</rewrite>
<changes>
Name the finish line | The assistant knows when to stop.
Remove "think step by step" | Opus 5.5 already thinks before replying.
</changes>
<tips>
- Raise /effort to high for this bug fix.
</tips>`

describe('parseAnalysis', () => {
  test('reads the checklist, rewrite, changes and tips', () => {
    const a = parseAnalysis(ANALYSIS)!
    expect(a.checklist.map(c => c.status)).toEqual(['partial', 'missing', 'n/a', 'missing', 'missing', 'present'])
    expect(a.checklist[1]).toEqual({ item: 'Context', status: 'missing', note: 'no file or error named' })
    expect(a.rewrite).toBe('Fix the login bug in [which file?]. Done means the login test passes.')
    expect(a.changes[0]).toEqual({ rule: 'Name the finish line', why: 'The assistant knows when to stop.' })
    expect(a.tips).toEqual(['Raise /effort to high for this bug fix.'])
  })

  test('fills unjudged items, drops "None" changes, and rejects a reply with no rewrite', () => {
    const a = parseAnalysis('<rewrite>Fine as is.</rewrite><changes>\nNone | The draft already works.\n</changes>')!
    expect(a.checklist).toHaveLength(6)
    expect(a.checklist.every(c => c.status === 'n/a')).toBe(true)
    expect(a.changes).toEqual([])
    expect(parseAnalysis('Here is my analysis.')).toBeUndefined()
  })
})

describe('placeholders', () => {
  test('parsePlaceholders keeps the rewrite\'s placeholders in order, with questions and answers, and gives unlisted ones a field', () => {
    const rewrite = 'Fix [which file?] so [what should happen?]. See [the docs](https://x.example). Again [which file?].'
    const block = '[which file?] | Which file has the bug? | auth.ts ; login.ts ; auth.ts\n[not in rewrite] | Ignored? | x'
    expect(parsePlaceholders(rewrite, block)).toEqual([
      { token: '[which file?]', question: 'Which file has the bug?', options: ['auth.ts', 'login.ts'] },
      { token: '[what should happen?]', question: 'what should happen?', options: [] },
    ])
  })

  test('a typed answer wins over a pick, and only answered placeholders are filled', () => {
    const ps = parsePlaceholders('In [file] do [what].', '')
    const answers = answersFor(ps, { '[file]': '  auth.ts ' }, { '[file]': 'login.ts', '[what]': NO_PICK })
    expect(answers).toEqual({ '[file]': 'auth.ts', '[what]': '' })
    expect(fillPlaceholders('In [file] do [what]. Then [file] again.', answers)).toBe('In auth.ts do [what]. Then auth.ts again.')
  })
})

describe('removeSentences', () => {
  test('takes out the whole sentence around a gap, ignoring the ? inside the gap', () => {
    const text = 'Fix the login bug in [which file?]. Done means the login test passes.'
    expect(removeSentences(text, ['[which file?]'])).toBe('Done means the login test passes.')
    expect(removeSentences('Fix it. Use [which branch?] for this! Then test.', ['[which branch?]'])).toBe('Fix it. Then test.')
    expect(removeSentences('Fix it. Then deploy to [where?]', ['[where?]'])).toBe('Fix it.')
  })

  test('two gaps in one sentence go once, a line it empties goes, blank lines and other lines stay', () => {
    expect(removeSentences('Move [what] to [where]. Keep the rest.', ['[what]', '[where]'])).toBe('Keep the rest.')
    expect(removeSentences('First line.\nCopy [which file?] over.\n\nLast line.', ['[which file?]'])).toBe('First line.\n\nLast line.')
    expect(removeSentences('Nothing to drop.', [])).toBe('Nothing to drop.')
  })
})

describe('suggestions', () => {
  test('parseAdditions reads the checklist item a suggestion fills, and Other as none', () => {
    expect(parseAdditions('done means | Name the finish line | Done means the tests pass.\nOther | Mention the branch | Work on main.')).toEqual([
      { label: 'Name the finish line', text: 'Done means the tests pass.', item: 'Done means' },
      { label: 'Mention the branch', text: 'Work on main.' },
    ])
  })

  test('parseAdditions reads label | sentence, keeps at most three, and drops empty sentences', () => {
    const block = 'Name the finish line | Done means the tests pass.\nStop rule |\nJust a sentence.\nA | 1.\nB | 2.'
    expect(parseAdditions(block)).toEqual([
      { label: 'Name the finish line', text: 'Done means the tests pass.' },
      { label: 'Just a sentence.', text: 'Just a sentence.' },
      { label: 'A', text: '1.' },
    ])
  })

  test('withAdditions puts the chosen sentences at the end, in the analysis order', () => {
    const adds = [{ label: 'a', text: 'First.' }, { label: 'b', text: 'Second.' }]
    expect(withAdditions('Fix it.', adds, [1, 0])).toBe('Fix it. First. Second.')
    expect(withAdditions('Fix it.\nThen test.\n', adds, [1])).toBe('Fix it.\nThen test.\nSecond.')
    expect(withAdditions('Fix it.', adds, [])).toBe('Fix it.')
  })
})

describe('bars and live mode', () => {
  test('barRuns splits BAR_CELLS of █ into filled and empty, in proportion and never past either end', () => {
    const cells = (n: number, of: number) => barRuns(n, of).map(r => r.length)
    expect(cells(1, 1)).toEqual([BAR_CELLS, 0])
    expect(cells(0, 4)).toEqual([0, BAR_CELLS])
    expect(cells(2, 4)).toEqual([8, 7])
    expect(cells(3, 0)).toEqual([0, BAR_CELLS])
    expect(cells(9, 4)).toEqual([BAR_CELLS, 0])
    // One character for both runs, so they're the same height; only the dim tells them apart.
    expect(barRuns(2, 4).join('')).toBe('█'.repeat(BAR_CELLS))
  })

  test('barCount pads the count to a fixed width with no-break spaces, so every line is as long', () => {
    const a = barCount('5 of 80', 8)
    const b = barCount('54 of 80', 8)
    expect(a).toHaveLength(b.length)
    expect(a.endsWith('\u00A0\u00A0\u00A05 of 80')).toBe(true)
    // Only the count keeps its own single spaces; the gap and the padding never fold.
    expect(a.slice(0, -'5 of 80'.length).includes(' ')).toBe(false)
  })

  test('liveSkipReason waits for enough text, a new draft, no running analysis, and the cap', () => {
    const base = { text: 'fix the login bug please', lastAnalyzed: '', isRunning: false, liveCalls: 0 }
    expect(liveSkipReason(base)).toBeUndefined()
    expect(liveSkipReason({ ...base, text: 'fix it' })).toContain('15 characters')
    expect(liveSkipReason({ ...base, lastAnalyzed: 'fix the login bug please ' })).toBe('Already analyzed.')
    expect(liveSkipReason({ ...base, isRunning: true })).toContain('already running')
    expect(liveSkipReason({ ...base, liveCalls: LIVE_CAP })).toContain('Live limit')
  })

  test('parseTips and asOfDate read the tips files', () => {
    const md = '# Tips\n\nSource: x\nAs of: 2026-10-17\n\n- First tip.\n- Second `tip`.\n'
    expect(parseTips(md)).toEqual(['First tip.', 'Second `tip`.'])
    expect(asOfDate(md)).toBe('2026-10-17')
  })

  test('own rules: read from "- " lines, added under a header to a new file, removed one line at a time', () => {
    expect(dataDir('/c/plugins/cache/mkt/prompt-coach/0.12.0', 'prompt-coach', '/x')).toBe('/c/plugins/data/prompt-coach-mkt')
    expect(dataDir('/repo/prompt-coach', 'prompt-coach', '/home/u/.claude/')).toBe('/home/u/.claude/plugins/data/prompt-coach-prompt-coach')
    expect(cleanRule('  - Keep the\n draft\'s   language. ')).toBe("Keep the draft's language.")
    const first = withOwnRule('', 'Keep the language.')
    expect(first).toBe(`${OWN_RULES_HEADER}- Keep the language.\n`)
    const md = withOwnRule('# Mine\n\nA note.\n- One', 'Two')
    expect(md).toBe('# Mine\n\nA note.\n- One\n- Two\n')
    expect(ownRuleLines(md)).toEqual(['One', 'Two'])
    expect(ownRuleLines(OWN_RULES_HEADER)).toEqual([])
    expect(withoutOwnRule(md, 'One')).toBe('# Mine\n\nA note.\n- Two\n')
    expect(withoutOwnRule(md, 'Three')).toBe(md)
  })

  test('parseRuleFile: each ## section with its "- " rules; title, source and As of lines skipped', () => {
    const md = '# Extra rules for Claude Opus 5.5\n\nSources, paraphrased:\n- https://docs.example/opus\nAs of: 2026-10\n\n## Task framing\n- Name the finish line.\n- Say why.\n\n## Empty\n\n## Remove\n  - Remove "think hard".\n'
    expect(parseRuleFile(md)).toEqual([
      { section: '', rules: ['https://docs.example/opus'] },
      { section: 'Task framing', rules: ['Name the finish line.', 'Say why.'] },
      { section: 'Remove', rules: ['Remove "think hard".'] },
    ])
    expect(parseRuleFile('# Your own rules\n\nOne rule per line.\n')).toEqual([])
    // The Checklist section is not a list of rules.
    expect(parseRuleFile('## Clarity\n- Be explicit.\n\n## Checklist\n- Goal: the outcome. Source: x\n')).toEqual([{ section: 'Clarity', rules: ['Be explicit.'] }])
  })

  test('checklist: general items, then a model\'s Add, Change and Drop, each with its source', () => {
    const general = '# General\n\n## Clarity\n- Be explicit.\n\n## Checklist\n- Goal: what outcome they want. Source: "Be clear and direct"\n- Constraints: limits or scope. Source: "Be clear and direct"\n- Done means: how it will be checked. Source: "Ask Claude to self-check"\n'
    const opus = '# Opus\n\n## Remove\n- Remove "think hard".\n\n## Checklist\n- Add Stop rule: when to stop and ask. Source: blog\n- Change Done means: the finish line. Source: blog, "name the finish line"\n- Drop Constraints. Source: guide\n- Change Output: what form. Source: y\n'
    expect(parseChecklist(opus).map(l => [l.op, l.name])).toEqual([['add', 'Stop rule'], ['change', 'Done means'], ['drop', 'Constraints'], ['change', 'Output']])
    expect(checklistFor(general, opus)).toEqual([
      { name: 'Goal', definition: 'what outcome they want.', source: '"Be clear and direct"', how: 'general' },
      { name: 'Constraints', definition: 'limits or scope.', source: 'guide', how: 'dropped' },
      { name: 'Done means', definition: 'the finish line.', source: 'blog, "name the finish line"', how: 'changed', general: 'how it will be checked.' },
      { name: 'Stop rule', definition: 'when to stop and ask.', source: 'blog', how: 'added' },
      // A Change of an item general.md lacks counts as an Add.
      { name: 'Output', definition: 'what form.', source: 'y', how: 'added' },
    ])
    // No Checklist section in general.md: the built-in six stand in.
    expect(checklistFor('# General\n- Be explicit.\n').map(i => i.name)).toEqual(['Goal', 'Context', 'Constraints', 'Done means', 'Stop rule', 'Output'])
    expect(analysisSystem(checklistFor('# General\n'))).toBe(ANALYSIS_SYSTEM)
    // The system prompt lists the model's items, not the dropped ones.
    const system = analysisSystem(checklistFor(general, opus))
    expect(system).toContain('- Done means: the finish line.')
    expect(system).toContain('- Stop rule: when to stop and ask.')
    expect(system).not.toContain('- Constraints:')
    expect(system).toContain('one line for each of the 4 items')
    // The rules sent with the draft leave the checklist out, and keep the rest.
    expect(withoutChecklist(opus)).toBe('# Opus\n\n## Remove\n- Remove "think hard".\n')
    expect(withoutChecklist(general)).toBe('# General\n\n## Clarity\n- Be explicit.\n')
    // An analysis reads the items it was given.
    const reply = '<checklist>\nGoal | present | ok\nStop rule | missing | none\n</checklist>\n<rewrite>\nx\n</rewrite>\n<additions>\nStop rule | Say when to stop | Stop before deleting anything.\n</additions>'
    const parsed = parseAnalysis(reply, ['Goal', 'Stop rule'])!
    expect(parsed.checklist.map(c => [c.item, c.status])).toEqual([['Goal', 'present'], ['Stop rule', 'missing']])
    expect(parsed.additions[0]?.item).toBe('Stop rule')
  })
})

describe('refresh helpers', () => {
  test('parseSources keeps only https rules and tips targets', () => {
    const s = parseSources(
      JSON.stringify({
        targets: {
          'rules/general.md': ['https://a.example/x'],
          'hooks/register.ts': ['https://a.example/z'],
          'tips/opus-5-5.md': ['http://insecure.example', 'https://b.example/'],
        },
      }),
    )
    expect(s.targets).toEqual({ 'rules/general.md': ['https://a.example/x'], 'tips/opus-5-5.md': ['https://b.example/'] })
    expect(toFetchUrl('https://claude.dev/blog/post/')).toBe('https://claude.dev/blog/post.md')
  })

  test('fingerprint ignores trailing spaces and line endings, and changedUrls finds edited or new pages', () => {
    expect(fingerprint('a  \r\nb\n')).toBe(fingerprint('a\nb'))
    expect(fingerprint('a\nb')).not.toBe(fingerprint('a\nc'))
    expect(changedUrls(['x', 'y', 'z'], { x: '1', y: '2' }, { x: '1', y: '3', z: '4' })).toEqual(['y', 'z'])
  })

  test('stampAsOf puts one As of line after the Source block', () => {
    const md = '# Title\n\nSource: x\nhttps://x\nAs of: 2026-01\n\n- tip\n'
    expect(stampAsOf(md, '2026-10-17')).toBe('# Title\n\nSource: x\nhttps://x\nAs of: 2026-10-17\n\n- tip\n')
    expect(sameContent(md, stampAsOf(md, '2026-10-17'))).toBe(true)
  })

  test('lineDiff marks removed and added lines and folds unchanged runs', () => {
    const before = ['a', 'b', 'c', 'd', 'e', 'f'].join('\n')
    const after = ['a', 'b', 'c', 'D', 'e', 'f'].join('\n')
    expect(lineDiff(before, after)).toBe('  ...\n  c\n- d\n+ D\n  e\n  ...')
  })
})

// ---- The pane, with the engine stubbed beneath the mod ----

/**
 * Every bar line under a drawn node, as "filled+empty count": the mono Text's
 * filled run, its dimmed empty run (`d` when dim), and the count trimmed.
 */
function barsIn(node: unknown): string[] {
  const out: string[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    const o = n as { props?: { mono?: boolean }; children?: unknown[]; kids?: unknown[] }
    if (o.props?.mono) {
      const [filled, empty, count] = (o.children ?? []) as [string, { props?: { dimColor?: boolean }; children?: string[] }, string]
      out.push(`${filled.length}+${empty.children?.[0]?.length ?? 0}${empty.props?.dimColor ? 'd' : ''} ${count.replaceAll('\u00A0', ' ').trim()}`)
      return
    }
    for (const c of [...(o.children ?? []), ...(o.kids ?? [])]) walk(c)
  }
  walk(node)
  return out
}

/** The reader profile in the stubbed config's data folder: the installed copy's, though this folder is loaded directly. */
const PROFILE = '/home/u/.claude/plugins/data/prompt-coach-prompt-coach/profile.yaml'
/** Omar's own rules, in the same data folder. */
const OWN_RULES = '/home/u/.claude/plugins/data/prompt-coach-prompt-coach/rules.md'

const FILES: Record<string, string> = {
  'rules/general.md': '# General\n\nSource: x\nAs of: 2026-10\n\n- Be explicit.\n',
  'rules/opus-5-5.md': '# Opus\n\nSources: x\nAs of: 2026-09\n\n- Name the finish line.\n',
  'rules/sonnet-5-5.md': '# Sonnet\n\nSource: x\nAs of: 2026-10\n\n- Ask for a real check.\n',
  [OWN_RULES]: '# Your own rules\n\n- End with a recap.\n',
  'tips/opus-5-5.md': '# Opus tips\n\nSource: x\n\n- Use /effort, not "think hard".\n',
  'tips/sonnet-5-5.md': '# Sonnet tips\n\nSource: x\n\n- Sonnet is the everyday model.\n',
  'tips/claude-code.md': '# Claude Code\n\nSource: x\n\n- Run /clear between tasks.\n',
  [PROFILE]: 'name: Omar\nuses_claude_code: daily, in the desktop app\n',
  'week/profile.example.yaml': '# Claude Week reader profile.\nname:\n',
  'week/edition-prompt.md': 'You are writing this week\'s edition of Claude Week.\n',
  'week/sources.json': JSON.stringify({
    pages: [
      { tier: 1, label: 'Newsroom', url: 'https://news.example/' },
      { tier: 2, label: 'Tracker', url: 'https://tracker.example/broken' },
    ],
  }),
  'sources.json': JSON.stringify({
    targets: {
      'rules/general.md': ['https://docs.example/general'],
      'tips/opus-5-5.md': ['https://docs.example/opus', 'https://docs.example/broken'],
      'tips/sonnet-5-5.md': ['https://docs.example/sonnet'],
    },
  }),
}

function world(
  on: On,
  opts: { mode?: string; model?: string; surfaces?: string[]; seen?: Record<string, string>; analysis?: string; saved?: Record<string, unknown>; weekAnswer?: string; pagesDown?: boolean; boxBlocked?: boolean; noProfile?: boolean; noOwnRules?: boolean; files?: Record<string, string> } = {},
) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-17T09:00:00Z') })
  const saved = new Map<string, unknown>([
    ...(opts.mode ? [['mode', opts.mode] as [string, unknown]] : []),
    ...(opts.seen ? [['sourceFingerprints', opts.seen] as [string, unknown]] : []),
    ...Object.entries(opts.saved ?? {}),
  ])
  const s = {
    model: opts.model ?? 'claude-opus-5-5',
    box: '',
    filled: [] as string[],
    submitted: [] as { text: string; origin: unknown }[],
    dropSubmit: '',
    opened: [] as string[],
    analyses: [] as string[],
    analysisSystems: [] as string[],
    analysisModels: [] as string[],
    refreshes: [] as string[],
    refreshModels: [] as string[],
    fetched: [] as string[],
    written: new Map<string, string>(),
    toasts: [] as string[],
    transcript: [] as { role: 'user' | 'assistant'; text: string }[],
    weekRequests: [] as { prompt: string; system: string; model: string }[],
    copied: [] as string[],
  }
  // The data folder's files keep their full path; the mod's own are named from its root.
  const rel = (path: string) => (path.includes('/plugins/data/') ? path : path.replace(/^.*?\/(rules|tips|week|sources\.json)/, (_m, dir: string) => dir))

  on('store.get', async ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', async ($, e) => {
    saved.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', async ($, e) => {
    saved.delete(e.key)
    return { value: undefined }
  })
  on('session.start', async ($, e) => e)
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('session.model', async () => ({ value: s.model }))
  on('session.messages', async () => ({ value: s.transcript.map(m => ({ ...m, toolUses: [] })) }))
  on('session.surfaces', async () => ({ value: (opts.surfaces ?? ['desktop']) as never }))
  on('fs.read', async ($, e) => {
    const file = rel(String(e.path))
    const text = fileAt(file)
    return text === undefined ? { deny: `no such file: ${file}` } : { value: text }
  })
  const fileAt = (file: string) => s.written.get(file) ?? ((opts.noProfile && file === PROFILE) || (opts.noOwnRules && file === OWN_RULES) ? undefined : (opts.files?.[file] ?? FILES[file]))
  on('fs.exists', async ($, e) => ({ value: fileAt(rel(String(e.path))) !== undefined }))
  on('env.get', async ($, e) => ({ value: e.name === 'CLAUDE_CONFIG_DIR' ? '/home/u/.claude' : undefined }))
  on('fs.write', async ($, e) => {
    s.written.set(rel(String(e.path)), String(e.text))
    return { value: undefined }
  })
  on('http.fetch', async ($, e) => {
    s.fetched.push(e.url)
    const ok = !e.url.includes('broken') && !opts.pagesDown
    return { value: { status: ok ? 200 : 404, ok, headers: {}, text: `PAGE ${e.url}` } }
  })
  on('model.complete', async ($, e) => {
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    if (String(e.system).startsWith(ANALYSIS_SYSTEM.slice(0, 60))) {
      s.analyses.push(String(e.prompt))
      s.analysisSystems.push(String(e.system))
      s.analysisModels.push(e.model)
      return { value: { isAnswered: true as const, text: opts.analysis ?? ANALYSIS, usage } }
    }
    if (e.system === REFRESH_SYSTEM) {
      s.refreshes.push(String(e.prompt))
      s.refreshModels.push(e.model)
      return { value: { isAnswered: true as const, text: '<file>\n# General\n\nSource: x\n\n- Be explicit, and say why.\n</file>', usage } }
    }
    if (String(e.system).includes('Claude Week')) {
      s.weekRequests.push({ prompt: String(e.prompt), system: String(e.system), model: e.model })
      return { value: { isAnswered: true as const, text: opts.weekAnswer ?? WEEK_ANSWER, usage } }
    }
    return { value: { isAnswered: true as const, text: '<rewrite>x</rewrite>', usage } }
  })
  on('prompt.read', async () => ({ value: { text: s.box, cursor: s.box.length } }))
  // The editor beneath the mod: applies the edit's splice.
  on('prompt.edit', async ($, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    return { text, cursor: e.start + e.inputText.length }
  })
  on('prompt.fill', async ($, e) => {
    // A dialog open over the prompt box: nothing can be filled.
    if (opts.boxBlocked) return { isFilled: false }
    s.filled.push(e.text)
    s.box = e.text
    return { isFilled: true }
  })
  // The engine beneath: a prompt enters the session, or the engine refuses it.
  on('prompt.submit', async ($, e) => {
    if (s.dropSubmit) return { drop: s.dropSubmit }
    s.submitted.push({ text: e.text, origin: e.origin })
    return { text: e.text }
  })
  on('ui.open', async ($, e) => {
    s.opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', async () => ({ value: undefined }))
  on('ui.toast', async ($, e) => {
    s.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('ui.copy', async ($, e) => {
    s.copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('turn.complete', async ($, e) => ({ text: e.answer, ...(e.usage ? { usage: e.usage } : {}) }))
  return { s, saved, clock }
}

const START = { cwd: '/tmp', surface: 'desktop', isInteractive: true } as const
/** The statistics' pane tests, which run only while statistics are on (STATS_ON in analytics.ts). */
const statsTest: typeof test = STATS_ON ? test : (() => {}) as unknown as typeof test
const coach = (args = '') =>
  ({ command: 'coach', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as const

function pane<S extends 'desktop' | 'terminal' | 'mobile'>(surface: S) {
  return {
    plugin: 'prompt-coach',
    surface,
    component: 'Pane' as const,
    requestId: 'prompt-coach',
    viewport: { columns: 120, rows: 40, isFullscreen: true },
    props: { title: 'Prompt Coach', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 30 }, view: {} },
  }
}

/** Types `text` into the prompt box as one edit, as the composer would. */
async function type($: Engine, s: { box: string }, text: string) {
  // The kit raises prompt.edit at run time; its types list only the mods API's own prompt calls.
  const edit = ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit
  const before = s.box
  s.box = text
  await edit({ origin: { kind: 'composer' }, text: before, cursor: before.length, start: 0, end: before.length, inputText: text })
}

test('/coach opens the pane; Analyze shows the checklist and rewrite; Apply fills the box', async ($, on) => {
  const { s, saved } = world(on)
  s.box = 'think step by step and fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  expect(s.opened).toEqual(['prompt-coach'])

  const ui = await $.ui.mount(pane('desktop'))
  // No "For <model>" line under the tabs; the model shows in the tips heading, on the Analytics tab.
  expect(await ui.find({ text: /^For / })).toBeUndefined()
  expect(await ui.find({ type: 'Code', text: 'think step by step' })).toBeDefined()
  expect(await ui.find({ text: /Rules as of 2026-09/ })).toBeDefined()
  // Tips live only on the Analytics tab.
  expect(await ui.find({ text: 'Using Opus 5.5 well' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: 'Run /clear between tasks.' })).toBeUndefined()
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ text: 'Using Opus 5.5 well' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'Run /clear between tasks.' })).toBeDefined()
  expect(await ui.find({ key: 'analyze' })).toBeUndefined()
  await ui.press({ key: 'tab-coach' })

  await ui.press({ key: 'analyze' })
  expect(s.analyses).toHaveLength(1)
  expect(s.analyses[0]).toContain('Name the finish line.') // the Opus rules file
  expect(s.analyses[0]).toContain('End with a recap.') // your own rules, from the data folder, are sent too
  expect(s.analyses[0]).toContain('think step by step and fix the login thing')
  expect(await ui.find({ type: 'Code', text: '[which file?]' })).toBeDefined()
  // Checklist and Why each change are tabs: the checklist shows first, the reasons one press away, and back.
  expect(await ui.find({ key: 'detail-checklist', text: '[Checklist]' })).toBeDefined()
  expect(await ui.find({ text: 'no file or error named' })).toBeDefined()
  expect(await ui.find({ text: 'Name the finish line' })).toBeUndefined()
  await ui.press({ key: 'detail-why' })
  expect(await ui.find({ key: 'detail-why', text: '[Why each change]' })).toBeDefined()
  expect(await ui.find({ text: 'Name the finish line' })).toBeDefined()
  expect(await ui.find({ text: 'no file or error named' })).toBeUndefined()
  await ui.press({ key: 'detail-checklist' })
  expect(await ui.find({ text: 'no file or error named' })).toBeDefined()
  // The rewrite box comes right after the draft box, before the buttons and the checklist.
  const order = (await ui.findAll({})).filter(el => ['Code', 'Text', 'Button'].includes(el.type)).map(el => el.text ?? '')
  const draftAt = order.findIndex(t => t.includes('think step by step and fix the login thing'))
  const rewriteAt = order.findIndex(t => t.includes('Fix the login bug in [which file?]'))
  expect(draftAt).toBeGreaterThan(-1)
  expect(rewriteAt).toBeGreaterThan(draftAt)
  expect(rewriteAt).toBeLessThan(order.findIndex(t => t === 'Analyze'))
  expect(rewriteAt).toBeLessThan(order.findIndex(t => t === '[Checklist]'))
  // Tips come in groups on the Analytics tab: this draft's, the model's, then Claude Code's, each labelled.
  expect(await ui.find({ text: 'For this draft' })).toBeUndefined()
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ text: 'For this draft' })).toBeDefined()
  expect(await ui.find({ key: 'tips-draft-list', text: 'Raise /effort to high for this bug fix.' })).toBeDefined()
  expect(await ui.find({ key: 'tips-model-list', text: 'Use /effort, not "think hard".' })).toBeDefined()
  expect(await ui.find({ text: 'Claude Code in general' })).toBeDefined()
  expect(await ui.find({ key: 'tips-code-list', text: 'Run /clear between tasks.' })).toBeDefined()
  await ui.press({ key: 'tab-coach' })

  await ui.press({ key: 'apply' })
  const rewrite = 'Fix the login bug in [which file?]. Done means the login test passes.'
  // Filled, sent as Omar's own words, then the box emptied as Enter leaves it.
  expect(s.filled).toEqual([rewrite, ''])
  expect(s.submitted).toEqual([{ text: rewrite, origin: { kind: 'plugin', name: 'prompt-coach', asUser: true } }])
  expect(s.box).toBe('')
  // Statistics are off (v0.14.0): nothing is recorded, and the Analytics tab says so instead of drawing them.
  expect(saved.get('analytics')).toBeUndefined()
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ text: 'Statistics are off while the checklist design changes.' })).toBeDefined()
  expect(boxNode(await ui.drawn(), 'stats-missing')).toBeUndefined()
  expect(await ui.find({ key: 'clear-lessons' })).toBeUndefined()
  await ui.unmount()
})

test('inside a conversation, Analyze sends Claude\'s last reply and the pane says so', async ($, on) => {
  const { s } = world(on)
  s.transcript = [
    { role: 'user', text: 'the login test fails' },
    { role: 'assistant', text: 'Two fixes: 1. reset the session, 2. widen the timeout. Which one?' },
  ]
  s.box = 'go with the second one please'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ text: /Read as a reply/ })).toBeUndefined()
  await ui.press({ key: 'analyze' })
  expect(s.analyses[0]).toContain('<previous_reply>\nTwo fixes: 1. reset the session, 2. widen the timeout. Which one?\n</previous_reply>')
  expect(await ui.find({ text: /Read as a reply to Claude's last message/ })).toBeDefined()
  await ui.unmount()
})

test('in a fresh session, Analyze sends no previous reply and shows no note', async ($, on) => {
  const { s } = world(on)
  s.box = 'add a dark mode toggle to settings'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  expect(s.analyses[0]).not.toContain('<previous_reply>')
  expect(await ui.find({ text: /Read as a reply/ })).toBeUndefined()
  await ui.unmount()
})

for (const surface of ['terminal', 'mobile'] as const) {
  test(`the pane draws on the ${surface} surface too`, async ($, on) => {
    const { s } = world(on)
    s.box = 'add a dark mode toggle to settings'
    await $.session.start({ ...START, surface })
    await $.command.run(coach())
    const ui = await $.ui.mount(pane(surface))
    await ui.press({ key: 'analyze' })
    expect(await ui.find({ text: 'Checklist' })).toBeDefined()
    await ui.unmount()
  })
}

test('live mode analyzes once after typing pauses, not per keystroke, and stops at the cap', async ($, on) => {
  const { s, clock } = world(on, { mode: 'live' })
  await $.session.start(START)
  await $.command.run(coach())

  await type($, s, 'fix the login')
  await clock.advance(500)
  await type($, s, 'fix the login bug after timeout')
  await clock.advance(1000)
  expect(s.analyses).toHaveLength(0) // still typing
  await clock.advance(600)
  expect(s.analyses).toHaveLength(1)
  expect(s.analyses[0]).toContain('fix the login bug after timeout')

  // The same draft again is not re-analyzed.
  await type($, s, 'fix the login bug after timeout')
  await clock.advance(1600)
  expect(s.analyses).toHaveLength(1)

  for (let i = 0; i < LIVE_CAP + 3; i++) {
    await type($, s, `fix the login bug, take ${i}`)
    await clock.advance(1600)
  }
  expect(s.analyses).toHaveLength(LIVE_CAP)
})

test('in live mode, Apply does not trigger a second analysis of the rewrite', async ($, on) => {
  const { s, clock } = world(on, { mode: 'live' })
  await $.session.start(START)
  await $.command.run(coach())
  await type($, s, 'fix the login bug after timeout')
  await clock.advance(1600)
  expect(s.analyses).toHaveLength(1)

  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'apply' })
  await type($, s, s.filled[0]!) // the box now holds the rewrite
  await clock.advance(1600)
  expect(s.analyses).toHaveLength(1)
  expect(await ui.find({ text: /Your draft changed/ })).toBeUndefined()
  await ui.unmount()
})

test('an empty box after sending is not reported as a changed draft', async ($, on) => {
  const { s, clock } = world(on)
  s.box = 'fix the login bug after timeout'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  await type($, s, 'fix the login bug after timeout, and the logout one')
  await clock.advance(500)
  expect(await ui.find({ text: /Your draft changed/ })).toBeDefined()
  await type($, s, '')
  await clock.advance(500)
  expect(await ui.find({ text: /Your draft changed/ })).toBeUndefined()
  await ui.unmount()
})

test('when the session reports no model, the pane still loads tips, then takes the model from Claude\'s reply', async ($, on) => {
  const { s } = world(on, { model: '' })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ text: /^For / })).toBeUndefined()
  expect(await ui.find({ text: /hasn't said which model/ })).toBeDefined()
  expect(await ui.find({ text: /No rules for/ })).toBeUndefined()
  expect(await ui.find({ text: /Rules as of 2026-10/ })).toBeDefined()
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ type: 'Markdown', text: 'Run /clear between tasks.' })).toBeDefined()
  await ui.press({ key: 'tab-coach' })

  const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
  await $.turn.complete({ answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage })
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ text: 'Using Opus 5.5 well' })).toBeDefined()
  expect(s.model).toBe('')
  await ui.unmount()
})

/** The press handle of the element keyed `key` (a Button, Input or Select) in a drawn tree. */
function handleOf(node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null) return undefined
  const n = node as { type?: string; props?: { key?: string; children?: unknown }; press?: { handle?: unknown }; children?: unknown }
  if (n.props?.key === key && n.type !== 'Box') return n.press?.handle ?? 'no handle'
  for (const child of [n.children, n.props?.children].flat()) {
    const found = handleOf(child, key)
    if (found !== undefined) return found
  }
  return undefined
}

/** The first Text in a drawn tree whose only child is `value`: its color and weight. */
function textLook(node: unknown, value: string): { found: boolean; color?: unknown; weight?: unknown } {
  if (typeof node !== 'object' || node === null) return { found: false }
  const n = node as { type?: string; props?: Record<string, unknown>; children?: unknown }
  const kids = [n.children, n.props?.children].flat().filter(k => k !== undefined)
  if (n.type === 'Text' && kids.length === 1 && kids[0] === value) return { found: true, color: n.props?.color, weight: n.props?.weight }
  for (const child of kids) {
    const found = textLook(child, value)
    if (found.found) return found
  }
  return { found: false }
}

/** The Button keyed `key` in a drawn tree: its label's color and its variant. */
function buttonLook(node: unknown, key: string): { color?: unknown; variant?: unknown } | undefined {
  if (typeof node !== 'object' || node === null) return undefined
  const n = node as { type?: string; props?: Record<string, unknown>; children?: unknown }
  const kids = [n.children, n.props?.children].flat()
  if (n.type === 'Button' && n.props?.key === key) {
    const label = kids.find(k => (k as { type?: string })?.type === 'Text') as { props?: { color?: unknown } } | undefined
    return { color: label?.props?.color, variant: n.props?.variant }
  }
  for (const child of kids) {
    const found = buttonLook(child, key)
    if (found) return found
  }
  return undefined
}

/** The props of the Button keyed `key` in a drawn tree. */
function buttonProps(node: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof node !== 'object' || node === null) return undefined
  const n = node as { type?: string; props?: Record<string, unknown>; children?: unknown }
  if (n.type === 'Button' && n.props?.key === key) return n.props
  for (const child of [n.children, n.props?.children].flat()) {
    const found = buttonProps(child, key)
    if (found) return found
  }
  return undefined
}

test('Desktop tabs: the open one is clay semibold Text, the others dim Buttons that keep their keys', async ($, on) => {
  world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(buttonProps(await ui.drawn(), 'tab-coach')).toBeUndefined()
  expect(textLook(await ui.drawn(), 'Coach')).toEqual({ found: true, color: 'claude', weight: 'semibold' })
  expect(await ui.find({ text: '[Coach]' })).toBeUndefined()
  for (const [key, hotkey] of [['tab-analytics', '2'], ['tab-week', '3'], ['tab-settings', '4']] as const) {
    const props = buttonProps(await ui.drawn(), key)
    expect(props?.hotkey).toBe(hotkey)
    expect(props?.dimColor).toBe(true)
    expect(props?.plain).toBeUndefined()
  }

  await ui.press({ key: 'tab-settings' })
  expect(buttonProps(await ui.drawn(), 'tab-settings')).toBeUndefined()
  expect(textLook(await ui.drawn(), 'Settings')).toEqual({ found: true, color: 'claude', weight: 'semibold' })
  expect(buttonProps(await ui.drawn(), 'tab-coach')?.hotkey).toBe('1')
  await ui.press({ key: 'tab-coach' })
  expect(textLook(await ui.drawn(), 'Coach').color).toBe('claude')
  // Settings stands alone at the right end; Coach, Analytics and Week sit together on the left.
  const row = boxNode(await ui.drawn(), 'tabs')!
  expect(row.props.justifyContent).toBe('space-between')
  expect(row.kids).toHaveLength(2)
  expect(buttonProps(row.kids[0], 'tab-analytics')).toBeDefined()
  // The Week tab is labelled News (v0.10.1); its key is still tab-week.
  expect(buttonProps(row.kids[0], 'tab-week')?.label).toBe('News')
  expect(buttonProps(row.kids[0], 'tab-settings')).toBeUndefined()
  expect(buttonProps(row.kids[1], 'tab-settings')?.label).toBe('Settings')
  await ui.unmount()
})

test('terminal tabs: plain Buttons with keys 1-4, the open one in clay brackets', async ($, on) => {
  world(on)
  await $.session.start({ ...START, surface: 'terminal' })
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('terminal'))
  const open = buttonProps(await ui.drawn(), 'tab-coach')
  expect(open?.label).toBe('[Coach]')
  expect(open?.plain).toBe(true)
  expect(open?.hotkey).toBe('1')
  expect(buttonLook(await ui.drawn(), 'tab-coach')?.color).toBe('claude')
  for (const [key, hotkey] of [['tab-analytics', '2'], ['tab-week', '3'], ['tab-settings', '4']] as const) {
    const props = buttonProps(await ui.drawn(), key)
    expect(props?.hotkey).toBe(hotkey)
    expect(props?.plain).toBe(true)
    expect(props?.dimColor).toBeUndefined()
  }
  await ui.unmount()
})

/** The Box keyed `key` in a drawn tree. */
function boxNode(node: unknown, key: string): { props: Record<string, unknown>; kids: unknown[] } | undefined {
  if (typeof node !== 'object' || node === null) return undefined
  const n = node as { type?: string; props?: Record<string, unknown>; children?: unknown }
  const kids = [n.children, n.props?.children].flat().filter(k => k !== undefined)
  if (n.type === 'Box' && n.props?.key === key) return { props: n.props, kids }
  for (const child of kids) {
    const found = boxNode(child, key)
    if (found) return found
  }
  return undefined
}

test('Settings is laid out like Desktop\'s own: a bold title per section with no box, plain labels, a thin line between rows', async ($, on) => {
  world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  const tree = await ui.drawn()
  for (const [key, title] of [['general', 'General'], ['own-rules', 'Your rules'], ['rules', 'Rules and tips'], ['week', 'Claude Week']] as const) {
    const g = boxNode(tree, `group-${key}`)
    // The title first: semibold, in the normal text color, on no background.
    const label = g?.kids[0] as { type?: string; props?: Record<string, unknown> } | undefined
    expect(label?.type).toBe('Text')
    expect(textLook(label, title)).toEqual({ found: true, color: undefined, weight: 'semibold' })
    // Then the rows, in no box: no border and no band anywhere.
    const box = boxNode(tree, `group-${key}-box`)
    expect(box?.props.borderStyle).toBeUndefined()
    expect(g?.props.borderStyle).toBeUndefined()
  }
  expect(JSON.stringify(tree)).not.toContain('"backgroundColor":"subtle"')
  expect(JSON.stringify(tree)).not.toContain('"borderStyle"')
  // More space between sections (the xl step) than between rows (1).
  expect(boxNode(tree, 'settings-sections')?.props.gap).toBe('xl')
  expect(boxNode(tree, 'settings-sections')?.kids.map(k => (k as { props?: { key?: string } }).props?.key)).toEqual(['group-general', 'group-own-rules', 'group-rules', 'group-week'])
  // Statistics moved to the Analytics tab in v0.10.0.
  expect(boxNode(tree, 'group-statistics')).toBeUndefined()
  // Rules and tips: the sources first, always listed (no Show sources button), a thin line, then the refresh.
  const rules = boxNode(tree, 'group-rules-box')!
  expect(rules.kids.map(k => (k as { props?: { key?: string } }).props?.key)).toEqual(['block-sources', 'line-rules-1', 'block-refresh'])
  expect(await ui.find({ type: 'Link', text: 'docs.example/general' })).toBeDefined()
  expect(buttonProps(tree, 'sources')).toBeUndefined()
  expect(await ui.find({ text: /Show sources|Hide sources/ })).toBeUndefined()
  // General's three rows have a 1-pixel Svg line between each two: two lines.
  const general = boxNode(tree, 'group-general-box')!
  const lines = general.kids.filter(k => (k as { props?: { key?: string } }).props?.key?.startsWith('line-general-'))
  expect(lines).toHaveLength(2)
  const svg = (lines[0] as { props?: { children?: unknown[] }; children?: unknown[] })
  const svgNode = [svg.children, svg.props?.children].flat().find(k => (k as { type?: string })?.type === 'Svg') as { props?: Record<string, unknown> }
  expect(svgNode?.props?.height).toBe(1)
  // Labels in the normal weight, as Desktop's are; descriptions dim.
  expect(textLook(tree, 'Mode')).toEqual({ found: true, color: undefined, weight: undefined })
  expect(textLook(tree, 'Rewrite model')).toEqual({ found: true, color: undefined, weight: undefined })
  for (const [key, control] of [['mode', 'mode'], ['rewriteModel', 'set-rewriteModel'], ['refreshModel', 'set-refreshModel'], ['weekModel', 'set-weekModel']] as const) {
    const r = boxNode(tree, `setting-${key}`)
    expect(r?.props.flexDirection).toBe('row')
    expect(r?.props.justifyContent).toBe('space-between')
    // The label column first, the control last.
    expect((r?.kids[0] as { type?: string })?.type).toBe('Box')
    expect((r?.kids.at(-1) as { props?: { key?: string } })?.props?.key).toBe(control)
  }
  await ui.unmount()
})

test('buttons follow the desktop design system: neutral, primary for the main action, red only for Remove, clay only on the open tab', async ($, on) => {
  const { s } = world(on, { analysis: WITH_ADDITIONS })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(buttonLook(await ui.drawn(), 'analyze')).toEqual({ color: undefined, variant: 'primary' })
  // On Desktop the open tab is clay Text, not a Button; the others stay neutral.
  expect(buttonLook(await ui.drawn(), 'tab-coach')).toBeUndefined()
  expect(textLook(await ui.drawn(), 'Coach')).toEqual({ found: true, color: 'claude', weight: 'semibold' })
  expect(buttonLook(await ui.drawn(), 'tab-settings')?.color).toBeUndefined()

  await ui.press({ key: 'analyze' })
  const tree = await ui.drawn()
  expect(buttonLook(tree, 'analyze')).toEqual({ color: undefined, variant: undefined })
  expect(buttonLook(tree, 'apply')).toEqual({ color: undefined, variant: 'primary' })
  expect(buttonLook(tree, 'fill')).toEqual({ color: undefined, variant: undefined })
  expect(buttonLook(tree, 'add-1-0')?.color).toBeUndefined()
  // The Copy button is gone; Desktop's own icon on the rewrite box copies it.
  expect(buttonLook(tree, 'copy')).toBeUndefined()
  await ui.press({ key: 'add-1-0' })
  expect(buttonLook(await ui.drawn(), 'add-1-0')?.color).toBe('error')

  // Section headings are semibold in the normal text color, not clay.
  expect(textLook(await ui.drawn(), 'Fill in the gaps')).toEqual({ found: true, color: undefined, weight: 'semibold' })

  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ type: 'Select', key: 'mode' })).toBeDefined()
  await ui.unmount()
})

test('a redraw (the pane taking focus) keeps each unchanged Button\'s press handle, and Mode switches with one pick', async ($, on) => {
  const { s, saved } = world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  const before = handleOf(await ui.drawn(), 'analyze')
  expect(before).toBeDefined()
  await ui.redraw({ ...pane('desktop').props, isFocused: true })
  expect(handleOf(await ui.drawn(), 'analyze')).toBe(before)

  await ui.press({ key: 'tab-settings' })
  await ui.select({ key: 'mode', value: 'live' })
  expect(saved.get('mode')).toBe('live')
  expect(await ui.find({ text: /0\/30 this session/ })).toBeDefined()
  await ui.select({ key: 'mode', value: 'manual' })
  expect(saved.get('mode')).toBe('manual')
  expect(s.analyses).toHaveLength(0)
  await ui.unmount()
})

test('Settings (tab 4) holds the mode, and the Coach tab only shows a dim Live label while live mode is on', async ($, on) => {
  const { s } = world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ key: 'tab-settings', text: 'Settings' })).toBeDefined()
  expect(await ui.find({ key: 'mode' })).toBeUndefined()
  expect(await ui.find({ text: /^Live / })).toBeUndefined()

  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ text: 'Mode' })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'set-rewriteModel' })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'set-refreshModel' })).toBeDefined()
  await ui.select({ key: 'mode', value: 'live' })
  await ui.press({ key: 'tab-coach' })
  expect(await ui.find({ text: 'Live 0/30' })).toBeDefined()
  expect(await ui.find({ key: 'mode' })).toBeUndefined()
  expect(s.analyses).toHaveLength(0)
  await ui.unmount()
})

test('a model setting changes through config.set, and the next Analyze uses it', async ($, on) => {
  const { s } = world(on)
  const set: { key: string; value: unknown }[] = []
  on('config.set', async ($, e) => {
    set.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  await ui.select({ key: 'set-rewriteModel', value: 'opus' })
  expect(set).toEqual([{ key: 'prompt-coach.rewriteModel', value: 'opus' }])
  expect(await ui.find({ text: /Rewrite model set to opus/ })).toBeDefined()
  await ui.press({ key: 'tab-coach' })
  await ui.press({ key: 'analyze' })
  expect(s.analysisModels).toEqual(['opus'])
  await ui.unmount()
})

test('when a model setting change is refused, the model settings show read-only with the reason', async ($, on) => {
  world(on)
  on('config.set', async () => ({ deny: 'a trusted policy owns it' }))
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  await ui.select({ key: 'set-refreshModel', value: 'sonnet' })
  for (const key of ['set-rewriteModel', 'set-refreshModel', 'set-weekModel']) expect(await ui.find({ type: 'Select', key })).toBeUndefined()
  expect(await ui.find({ text: /can't be changed from the pane here \(a trusted policy owns it\)/ })).toBeDefined()
  expect(await ui.find({ text: 'opus' })).toBeDefined()
  // The mode still works: it isn't a model setting.
  await ui.select({ key: 'mode', value: 'live' })
  expect(await ui.find({ type: 'Select', key: 'mode' })).toBeDefined()
  expect(await ui.find({ text: /0\/30 this session/ })).toBeDefined()
  await ui.unmount()
})

test('on mobile the model choices are buttons, and Sources lists the pages under Settings', async ($, on) => {
  world(on)
  const set: unknown[] = []
  on('config.set', async ($, e) => {
    set.push(e.value)
    return { value: e.value }
  })
  await $.session.start({ ...START, surface: 'mobile' })
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('mobile'))
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  expect(await ui.find({ key: 'set-rewriteModel-sonnet', text: '[sonnet]' })).toBeDefined()
  await ui.press({ key: 'set-rewriteModel-haiku' })
  expect(set).toEqual(['haiku'])
  expect(await ui.find({ key: 'set-rewriteModel-haiku', text: '[haiku]' })).toBeDefined()

  // The sources are always listed, with no button to show them.
  expect(await ui.find({ type: 'Link', text: 'docs.example/general' })).toBeDefined()
  await ui.unmount()
})

test('Apply sits right before Apply and send, and fills the box without sending', async ($, on) => {
  const { s } = world(on)
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ key: 'fill' })).toBeUndefined()
  await ui.press({ key: 'analyze' })
  const keys = (await ui.findAll({ type: 'Button' })).map(b => (b as { key?: string }).key)
  expect(keys.indexOf('fill')).toBe(keys.indexOf('apply') - 1)
  expect(await ui.find({ key: 'fill', text: 'Apply' })).toBeDefined()

  await ui.press({ key: 'fill' })
  const rewrite = 'Fix the login bug in [which file?]. Done means the login test passes.'
  expect(s.filled).toEqual([rewrite])
  expect(s.box).toBe(rewrite)
  expect(s.submitted).toEqual([])
  expect(await ui.find({ text: /Your draft changed/ })).toBeUndefined()
  await ui.unmount()
})

const WITH_GAPS = ANALYSIS.replace(
  '</tips>',
  '</tips>\n<placeholders>\n[which file?] | Which file has the login bug? | auth.ts ; session.ts\n</placeholders>',
)

test('Fill in the gaps: a pick updates the rewrite, a typed answer wins, and Apply sends the filled rewrite', async ($, on) => {
  const { s } = world(on, { analysis: WITH_GAPS })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  expect(await ui.find({ text: 'Fill in the gaps' })).toBeDefined()
  expect(await ui.find({ text: 'Which file has the login bug?' })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'gap-1-0-pick' })).toBeDefined()

  // A redraw (the pane taking focus) keeps the fields' handles, as it does the buttons'.
  const before = [handleOf(await ui.drawn(), 'gap-1-0-pick'), handleOf(await ui.drawn(), 'gap-1-0-type')]
  expect(before.every(h => typeof h === 'number')).toBe(true)
  await ui.redraw({ ...pane('desktop').props, isFocused: true })
  expect([handleOf(await ui.drawn(), 'gap-1-0-pick'), handleOf(await ui.drawn(), 'gap-1-0-type')]).toEqual(before)

  await ui.select({ key: 'gap-1-0-pick', value: 'session.ts' })
  expect(await ui.find({ type: 'Code', text: 'Fix the login bug in session.ts.' })).toBeDefined()

  // Typed without Enter: the rewrite box waits, but Apply uses it.
  await ui.input({ key: 'gap-1-0-type', text: 'auth/login.ts', kind: 'change' })
  expect(await ui.find({ type: 'Code', text: 'Fix the login bug in session.ts.' })).toBeDefined()
  await ui.press({ key: 'apply' })
  expect(s.submitted[0]?.text).toBe('Fix the login bug in auth/login.ts. Done means the login test passes.')
  await ui.unmount()
})

test('Enter in a gap field updates the rewrite, and the next analysis starts with empty fields', async ($, on) => {
  const { s } = world(on)
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  // The fixture lists no placeholders block, so the field asks the placeholder's own text, with no dropdown.
  expect(await ui.find({ text: 'which file?' })).toBeDefined()
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  await ui.input({ key: 'gap-1-0-type', text: 'auth.ts' })
  expect(await ui.find({ type: 'Code', text: 'Fix the login bug in auth.ts.' })).toBeDefined()

  s.box = 'fix the login thing again'
  await ui.press({ key: 'analyze' })
  expect(await ui.find({ type: 'Input', key: 'gap-2-0-type' })).toBeDefined()
  expect(await ui.find({ type: 'Code', text: '[which file?]' })).toBeDefined()
  await ui.unmount()
})

test('Enter in an empty gap field removes the gap with its sentence; an answer brings it back', async ($, on) => {
  const { s } = world(on, { analysis: WITH_GAPS })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })

  await ui.input({ key: 'gap-1-0-type', text: '' })
  expect(await ui.find({ type: 'Code', text: 'Fix the login bug' })).toBeUndefined()
  expect(await ui.find({ type: 'Code', text: 'Done means the login test passes.' })).toBeDefined()
  expect(await ui.find({ text: /Removed from the rewrite, with its sentence/ })).toBeDefined()

  // A pick brings it back, filled in.
  await ui.select({ key: 'gap-1-0-pick', value: 'auth.ts' })
  expect(await ui.find({ type: 'Code', text: 'Fix the login bug in auth.ts.' })).toBeDefined()
  expect(await ui.find({ text: /Removed from the rewrite/ })).toBeUndefined()

  // Back to no answer, then an empty Enter again: Apply sends the rewrite without that sentence.
  await ui.select({ key: 'gap-1-0-pick', value: NO_PICK })
  await ui.input({ key: 'gap-1-0-type', text: '' })
  await ui.press({ key: 'apply' })
  expect(s.submitted[0]?.text).toBe('Done means the login test passes.')
  await ui.unmount()
})

test('an empty Enter with an answer picked keeps the pick and removes nothing', async ($, on) => {
  const { s } = world(on, { analysis: WITH_GAPS })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  await ui.select({ key: 'gap-1-0-pick', value: 'session.ts' })
  await ui.input({ key: 'gap-1-0-type', text: '' })
  expect(await ui.find({ type: 'Code', text: 'Fix the login bug in session.ts.' })).toBeDefined()
  expect(await ui.find({ text: /Removed from the rewrite/ })).toBeUndefined()
  await ui.unmount()
})

test('on mobile, which has no fields, the gaps are listed to fill in later', async ($, on) => {
  const { s } = world(on)
  s.box = 'fix the login thing'
  await $.session.start({ ...START, surface: 'mobile' })
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('mobile'))
  await ui.press({ key: 'analyze' })
  expect(await ui.find({ text: /Fill these in after Apply: \[which file\?\]/ })).toBeDefined()
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  await ui.unmount()
})

const WITH_ADDITIONS = WITH_GAPS.replace(
  '<placeholders>',
  '<additions>\nSay when to stop | Stop and ask me before deleting anything.\n</additions>\n<placeholders>',
)

test('Add puts a suggestion at the end of the rewrite, Remove takes it out, and Apply sends it with the answers', async ($, on) => {
  const { s } = world(on, { analysis: WITH_ADDITIONS })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  // An untagged (older-format) suggestion fills no checklist item, so it shows under Other suggestions.
  expect(await ui.find({ text: 'Other suggestions' })).toBeDefined()
  expect(await ui.find({ text: 'Say when to stop' })).toBeDefined()

  await ui.press({ key: 'add-1-0' })
  expect(await ui.find({ type: 'Code', text: 'Done means the login test passes. Stop and ask me before deleting anything.' })).toBeDefined()
  expect(await ui.find({ key: 'add-1-0', text: 'Remove' })).toBeDefined()
  await ui.press({ key: 'add-1-0' })
  expect(await ui.find({ type: 'Code', text: 'Stop and ask me' })).toBeUndefined()

  await ui.press({ key: 'add-1-0' })
  await ui.select({ key: 'gap-1-0-pick', value: 'auth.ts' })
  await ui.press({ key: 'apply' })
  expect(s.submitted[0]?.text).toBe('Fix the login bug in auth.ts. Done means the login test passes. Stop and ask me before deleting anything.')
  await ui.unmount()
})

const MERGED = WITH_GAPS.replace(
  '<placeholders>',
  '<additions>\nStop rule | Say when to stop | Stop and ask me before deleting anything.\nOutput | Ask for a summary | End with a two-line summary.\nOther | Mention the branch | Work on the main branch.\n</additions>\n<placeholders>',
)

test('the Checklist tab shows each missing item with its suggestion right under it, and Other suggestions last', async ($, on) => {
  const { s } = world(on, { analysis: MERGED })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  expect(await ui.find({ text: 'Suggestions you can add' })).toBeUndefined()

  const order = (await ui.findAll({})).filter(el => ['Text', 'Button'].includes(el.type)).map(el => el.text ?? '')
  const at = (t: string) => order.indexOf(t)
  // Stop rule (missing) is followed by its suggestion, before the next item.
  expect(at('Stop rule')).toBeGreaterThan(-1)
  expect(at('Say when to stop')).toBeGreaterThan(at('nothing on when to ask'))
  expect(at('Say when to stop')).toBeLessThan(at('Output'))
  // Output's suggestion sits under Output, and the untied one under Other suggestions at the end.
  expect(at('Ask for a summary')).toBeGreaterThan(at('a fix'))
  expect(at('Other suggestions')).toBeGreaterThan(at('Ask for a summary'))
  expect(at('Mention the branch')).toBeGreaterThan(at('Other suggestions'))
  // Items with no suggestion are shown as before.
  expect(await ui.find({ text: 'no file or error named' })).toBeDefined()

  // Add from the merged view works as before, and the Why tab still shows only the reasons.
  await ui.press({ key: 'add-1-0' })
  expect(await ui.find({ type: 'Code', text: 'Stop and ask me before deleting anything.' })).toBeDefined()
  expect(await ui.find({ key: 'add-1-0', text: 'Remove' })).toBeDefined()
  await ui.press({ key: 'detail-why' })
  expect(await ui.find({ text: 'Say when to stop' })).toBeUndefined()
  expect(await ui.find({ text: 'Name the finish line' })).toBeDefined()
  await ui.unmount()
})

test('when the engine refuses the prompt, Apply leaves the rewrite in the box and says why', async ($, on) => {
  const { s } = world(on)
  s.box = 'fix the login thing'
  s.dropSubmit = 'a Stop hook stands'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  await ui.press({ key: 'apply' })
  expect(s.submitted).toEqual([])
  expect(s.box).toBe('Fix the login bug in [which file?]. Done means the login test passes.')
  expect(await ui.find({ text: /Not sent: a Stop hook stands/ })).toBeDefined()
  await ui.unmount()
})

test('manual mode never calls the model while typing', async ($, on) => {
  const { s, clock } = world(on)
  await $.session.start(START)
  await $.command.run(coach())
  await type($, s, 'fix the login bug after a session timeout')
  await clock.advance(5000)
  expect(s.analyses).toHaveLength(0)
})

test('switching model changes the label and tips while the pane is open', async ($, on) => {
  const { s, clock } = world(on)
  await $.session.start(START)
  await $.command.run(coach())
  s.model = 'sonnet'
  await clock.advance(5000)
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ text: 'Using Sonnet 5.5 well' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: 'Sonnet is the everyday model.' })).toBeDefined()
  await ui.unmount()
})

test('a model with no rules file gets a warning and the general rules', async ($, on) => {
  const { s } = world(on, { model: 'claude-sonnet-4-6' })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ text: /No rules for claude-sonnet-4-6 yet/ })).toBeDefined()
  await ui.unmount()
})

/** Fingerprints from an earlier refresh, before every page changed. */
const STALE = { 'https://docs.example/general': 'old', 'https://docs.example/opus': 'old', 'https://docs.example/sonnet': 'old' }
/** Fingerprints of the pages as the stub serves them now. */
const CURRENT = Object.fromEntries(['general', 'opus', 'sonnet'].map(p => [`https://docs.example/${p}`, fingerprint(`PAGE https://docs.example/${p}.md`)]))

test('/coach refresh proposes changes, and Reject leaves every file alone', async ($, on) => {
  const { s, saved, clock } = world(on, { seen: STALE })
  await $.session.start(START)
  await $.command.run(coach('refresh'))
  await clock.advance(1)

  expect(s.fetched).toContain('https://docs.example/general.md')
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ type: 'Code', text: '+ - Be explicit, and say why.' })).toBeDefined()
  expect(await ui.find({ text: /tips\/opus-5-5.md: kept as is \(https:\/\/docs.example\/broken answered HTTP 404\)/ })).toBeDefined()
  expect(saved.has('pendingRefresh')).toBe(true)

  await ui.press({ key: 'reject' })
  expect(s.written.size).toBe(0)
  expect(saved.has('pendingRefresh')).toBe(false)
  // Reviewed pages are recorded; the failed file's pages keep their old fingerprint, to be retried.
  const seen = saved.get('sourceFingerprints') as Record<string, string>
  expect(seen['https://docs.example/general']).toBe(CURRENT['https://docs.example/general'])
  expect(seen['https://docs.example/opus']).toBe('old')
  await ui.unmount()
})

test('/coach refresh writes only the changed rules and tips files on Accept, with a date', async ($, on) => {
  const { s, saved, clock } = world(on, { seen: STALE })
  await $.session.start(START)
  await $.command.run(coach('refresh'))
  await clock.advance(1)
  const ui = await $.ui.mount(pane('desktop'))
  // /coach refresh opens Settings, where refresh now lives; there is no Refresh tab.
  expect(textLook(await ui.drawn(), 'Settings').color).toBe('claude')
  expect(textLook(await ui.drawn(), 'Rules and tips').found).toBe(true)
  expect(buttonProps(await ui.drawn(), 'tab-refresh')).toBeUndefined()
  await ui.press({ key: 'accept' })

  expect([...s.written.keys()]).toEqual(['rules/general.md', 'tips/sonnet-5-5.md'])
  expect(s.written.get('rules/general.md')).toContain('As of: 2026-10-17')
  expect(s.written.has(OWN_RULES)).toBe(false)
  expect(saved.has('pendingRefresh')).toBe(false)
  await ui.unmount()
})

test('the first /coach refresh records a baseline and proposes nothing', async ($, on) => {
  const { s, saved, clock } = world(on)
  await $.session.start(START)
  await $.command.run(coach('refresh'))
  await clock.advance(1)
  expect(s.refreshes).toHaveLength(0)
  expect(saved.has('pendingRefresh')).toBe(false)
  expect(Object.keys(saved.get('sourceFingerprints') as object).sort()).toEqual(Object.keys(CURRENT).sort())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ text: /First refresh: recorded a fingerprint of 3 source pages/ })).toBeDefined()
  await ui.unmount()
})

test('a refresh with no changed pages makes no model calls', async ($, on) => {
  const { s, clock } = world(on, { seen: { ...CURRENT, 'https://docs.example/broken': 'x' } })
  await $.session.start(START)
  await $.command.run(coach('refresh'))
  await clock.advance(1)
  expect(s.refreshes).toHaveLength(0)
})

test('only files whose pages changed are rewritten, by the refresh model (Opus by default)', async ($, on) => {
  const { s, clock } = world(on, { seen: { ...CURRENT, 'https://docs.example/sonnet': 'old' } })
  await $.session.start(START)
  await $.command.run(coach('refresh'))
  await clock.advance(1)
  expect(s.refreshes).toHaveLength(1)
  expect(s.refreshes[0]).toContain('path="tips/sonnet-5-5.md"')
  expect(s.refreshModels).toEqual(['opus'])
})

test('Rewrite all rewrites every reachable file even when no page changed', async ($, on) => {
  const { s, clock } = world(on, { seen: CURRENT })
  await $.session.start(START)
  await $.command.run(coach('refresh all'))
  await clock.advance(1)
  expect(s.refreshes.map(r => /path="([^"]+)"/.exec(r)?.[1])).toEqual(['rules/general.md', 'tips/sonnet-5-5.md'])
})

test('/coach opens in Desktop, which attaches its surface after the session starts', async ($, on) => {
  const { s } = world(on)
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: true })
  const r = await $.command.run(coach())
  expect(r.text).toBeUndefined()
  expect(s.opened).toEqual(['prompt-coach'])
})

test('/coach outside an interactive app points to /improve', async ($, on) => {
  world(on, { surfaces: [] })
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: false })
  const r = await $.command.run(coach())
  expect(r.text).toContain('/improve')
})

// ---- The Week tab ----

const WEEK_ANSWER = JSON.stringify({
  edition_id: '2026-W42',
  title: 'Claude Week 42',
  date_from: '2026-10-10',
  date_to: '2026-10-17',
  intro: 'Idle compaction lands.',
  feedback_note: 'Shortened release stories: you downvoted one as too long.',
  top3: ['2026-W42-idle', '2026-W42-haiku'],
  sections: [
    {
      id: 'code',
      title: 'Claude Code',
      range: 'v2.1.293 → v2.1.299',
      note: null,
      stories: [
        {
          id: '2026-W42-idle',
          title: 'Idle compaction',
          summary: 'v2.1.299 (Oct 14) adds idle compaction.',
          links: [{ label: 'Claude Code v2.1.299 release notes', url: 'https://github.com/anthropics/claude-code/releases/tag/v2.1.299' }],
          detail: 'Terminal only.',
          ask: null,
          prompt: 'Explain idle compaction.',
        },
        { id: '2026-W42-haiku', title: 'Haiku default', summary: 'Oct 15: Haiku 5.5 is the default.', links: [], detail: null, ask: null, prompt: null },
      ],
    },
  ],
  questions: [{ text: 'Which hooks enforce a rule?', prompt: 'Audit my hooks.' }],
  sources: [{ label: 'Claude Code releases', url: 'https://github.com/anthropics/claude-code/releases' }],
})

async function weekPane<S extends 'desktop' | 'terminal' | 'mobile' = 'desktop'>($: Engine, on: On, opts: Parameters<typeof world>[1] = {}, surface: S = 'desktop' as S) {
  const w = world(on, opts)
  await $.session.start({ ...START, surface })
  await $.command.run(coach())
  const ui = await $.ui.mount(pane(surface))
  await ui.press({ key: 'tab-week' })
  return { ...w, ui }
}

/** The edition the writer's answer makes, stored as a session would find it. */
function storedEdition() {
  const r = parseEdition(WEEK_ANSWER, '2026-W42')
  if (!('edition' in r)) throw new Error(r.reason)
  return { weekEditions: { '2026-W42': r.edition } }
}

test('Week: Write reads the source pages, asks the Week model once, and its answer becomes the edition', async ($, on) => {
  const { s, saved, ui } = await weekPane($, on)
  expect(await ui.find({ text: /No edition yet/ })).toBeDefined()
  expect(buttonProps(await ui.drawn(), 'week-write')?.label).toBe('Write Claude Week 42')
  await ui.press({ key: 'week-write' })

  expect(s.fetched).toEqual(['https://news.example/', 'https://tracker.example/broken'])
  expect(s.weekRequests).toHaveLength(1)
  const req = s.weekRequests[0]!
  expect(req.model).toBe('opus')
  expect(req.system).toContain("this week's edition of Claude Week")
  expect(req.prompt).toContain('Today is 2026-10-17. Write edition 2026-W42')
  expect(req.prompt).toContain('uses_claude_code: daily, in the desktop app')
  expect(req.prompt).toContain('<page tier="1" label="Newsroom" url="https://news.example/">\nPAGE https://news.example/\n</page>')
  expect(req.prompt).toContain('<unread>\nTracker <https://tracker.example/broken>: HTTP 404\n</unread>')

  expect(Object.keys(saved.get('weekEditions') as object)).toEqual(['2026-W42'])
  expect(saved.has('weekJob')).toBe(false)
  expect(s.toasts.at(-1)).toContain('Claude Week 42 is ready')
  expect(await ui.find({ text: 'Claude Week 42 · Oct 10 – Oct 17' })).toBeDefined()
  expect(await ui.find({ text: /From your feedback: Shortened release stories/ })).toBeDefined()
  expect(await ui.find({ text: '1. Idle compaction — Claude Code' })).toBeDefined()
  expect(await ui.find({ text: '0 of 2 stories read' })).toBeDefined()
  expect(await ui.find({ text: /Nothing new for Claude Desktop/ })).toBeDefined()
  expect(await ui.find({ type: 'Link', text: 'Claude Code v2.1.299 release notes' })).toBeDefined()
  // This week's edition exists, so there's nothing to write.
  expect(buttonProps(await ui.drawn(), 'week-write')).toBeUndefined()
  await ui.unmount()
})

test('Week: an answer that is not an edition says why and offers Try again', async ($, on) => {
  const { s, saved, ui } = await weekPane($, on, { weekAnswer: 'I could not reach the sources.' })
  await ui.press({ key: 'week-write' })
  expect(await ui.find({ text: /Couldn't write Claude Week 42: the answer couldn't be read as an edition/ })).toBeDefined()
  expect(saved.get('weekJob')).toMatchObject({ state: 'failed', raw: 'I could not reach the sources.' })
  expect(buttonProps(await ui.drawn(), 'week-write')?.label).toBe('Try again')
  await ui.press({ key: 'week-write' })
  expect(s.weekRequests).toHaveLength(2)
  await ui.unmount()
})

test('Week: when no source page can be read, nothing is asked of the model', async ($, on) => {
  const { s, ui } = await weekPane($, on, { pagesDown: true })
  await ui.press({ key: 'week-write' })
  expect(s.weekRequests).toHaveLength(0)
  expect(await ui.find({ text: /none of the source pages could be read/ })).toBeDefined()
  await ui.unmount()
})

test('Week: an edition still being written when a session ended shows as failed at the next start', async ($, on) => {
  const job = { state: 'running', title: 'Claude Week 42', startedAt: Date.parse('2026-10-17T08:59:00Z'), progress: 'Writing…', editionId: '2026-W42' }
  const { ui } = await weekPane($, on, { saved: { weekJob: job } })
  expect(await ui.find({ text: /the session ended before the edition was ready/ })).toBeDefined()
  expect(buttonProps(await ui.drawn(), 'week-write')?.label).toBe('Try again')
  await ui.unmount()
})

test('Week: a vote opens its reason field, saves to the store and says so; the same vote again clears both', async ($, on) => {
  const { saved, ui } = await weekPane($, on, { saved: storedEdition() })
  await ui.press({ key: 'up-2026-W42-idle' })
  expect(buttonLook(await ui.drawn(), 'up-2026-W42-idle')?.variant).toBe('primary')
  expect(buttonLook(await ui.drawn(), 'down-2026-W42-idle')?.variant).toBeUndefined()
  expect((saved.get('weekFeedback') as Record<string, unknown>)['2026-W42-idle']).toMatchObject({
    story_id: '2026-W42-idle',
    edition_id: '2026-W42',
    section: 'code',
    title: 'Idle compaction',
    verdict: 'up',
    updated_at: '2026-10-17T09:00:00Z',
  })
  expect(await ui.find({ type: 'Input', key: 'why-2026-W42-idle' })).toBeDefined()
  expect(await ui.find({ text: 'Saved' })).toBeDefined()

  await ui.input({ key: 'why-2026-W42-idle', text: 'a default in a tool I use daily' })
  expect((saved.get('weekFeedback') as Record<string, { why: string }>)['2026-W42-idle']!.why).toBe('a default in a tool I use daily')

  await ui.press({ key: 'up-2026-W42-idle' })
  expect(saved.get('weekFeedback')).toEqual({})
  expect(await ui.find({ type: 'Input', key: 'why-2026-W42-idle' })).toBeUndefined()
  await ui.unmount()
})

test('Week: typing a take saves it quietly after a pause, and the box opens again with the edition', async ($, on) => {
  const { saved, clock, ui } = await weekPane($, on, { saved: storedEdition() })
  expect(await ui.find({ type: 'Input', key: 'take-field-2026-W42-haiku' })).toBeUndefined()
  await ui.press({ key: 'take-2026-W42-haiku' })
  await ui.input({ key: 'take-field-2026-W42-haiku', text: 'Haiku was bad for a page', kind: 'change' })
  expect(saved.get('weekFeedback')).toBeUndefined()
  await clock.advance(900)
  expect((saved.get('weekFeedback') as Record<string, unknown>)['2026-W42-haiku']).toMatchObject({ verdict: null, take: 'Haiku was bad for a page' })
  await ui.unmount()
})

test('Week: a saved take opens its box when the edition loads', async ($, on) => {
  const take = { story_id: '2026-W42-haiku', edition_id: '2026-W42', section: 'code', title: 'Haiku default', verdict: null, why: null, take: 'too slow', updated_at: 'x' }
  const { ui } = await weekPane($, on, { saved: { ...storedEdition(), weekFeedback: { '2026-W42-haiku': take } } })
  expect(await ui.find({ type: 'Input', key: 'take-field-2026-W42-haiku' })).toBeDefined()
  await ui.unmount()
})

test('Week: Mark read folds a story and counts it; Reopen unfolds it; More detail and Ask in side chat work', async ($, on) => {
  const { s, saved, ui } = await weekPane($, on, { saved: storedEdition() })
  expect(await ui.find({ text: 'Terminal only.' })).toBeUndefined()
  await ui.press({ key: 'detail-2026-W42-idle' })
  expect(await ui.find({ text: 'Terminal only.' })).toBeDefined()

  // The prompt box gets /btw with the prompt and the story it's about, so Enter opens the side chat. Nothing is sent.
  expect(buttonProps(await ui.drawn(), 'aside-2026-W42-idle')?.label).toBe('Ask in side chat')
  await ui.press({ key: 'aside-2026-W42-idle' })
  expect(s.box).toBe(
    '/btw Explain idle compaction. (This is about the Claude Week story "Idle compaction": v2.1.299 (Oct 14) adds idle compaction. Terminal only. Sources: https://github.com/anthropics/claude-code/releases/tag/v2.1.299.)',
  )
  expect(s.toasts.at(-1)).toBe('Press Enter to ask it in the side chat.')
  await ui.press({ key: 'week-q-aside-2026-W42-0' })
  expect(s.box).toBe('/btw Audit my hooks. (From the questions in Claude Week 42: "Which hooks enforce a rule?")')
  expect(s.submitted).toEqual([])
  // A story with no prompt has no side chat button.
  expect(buttonProps(await ui.drawn(), 'aside-2026-W42-haiku')).toBeUndefined()

  await ui.press({ key: 'read-2026-W42-idle' })
  expect(saved.get('weekRead')).toEqual({ '2026-W42-idle': true })
  expect(await ui.find({ text: '✓ Idle compaction' })).toBeDefined()
  expect(await ui.find({ text: '1 of 2 stories read' })).toBeDefined()
  expect(await ui.find({ text: 'Claude Code 1/2' })).toBeDefined()
  expect(buttonProps(await ui.drawn(), 'up-2026-W42-idle')).toBeUndefined()
  await ui.press({ key: 'read-2026-W42-idle' })
  expect(saved.get('weekRead')).toEqual({})
  expect(await ui.find({ text: '0 of 2 stories read' })).toBeDefined()
  await ui.unmount()
})

test('Week: Older and Newer step through the stored editions', async ($, on) => {
  const older = parseEdition(WEEK_ANSWER.replace('Claude Week 42', 'Claude Week 41'), '2026-W41') as { edition: unknown }
  const { ui } = await weekPane($, on, { saved: { weekEditions: { ...storedEdition().weekEditions, '2026-W41': older.edition } } })
  expect(buttonProps(await ui.drawn(), 'week-newer')).toBeUndefined()
  await ui.press({ key: 'week-older' })
  expect(await ui.find({ text: /^Claude Week 41/ })).toBeDefined()
  expect(buttonProps(await ui.drawn(), 'week-older')).toBeUndefined()
  await ui.press({ key: 'week-newer' })
  expect(await ui.find({ text: /^Claude Week 42/ })).toBeDefined()
  await ui.unmount()
})

test('Settings: Claude Week holds the Week model, the reader profile and the pages Write reads; the Week tab has no footer', async ($, on) => {
  world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  const tree = await ui.drawn()
  const week = JSON.stringify(boxNode(tree, 'group-week'))
  expect(week).toContain('"set-weekModel"')
  expect(JSON.stringify(boxNode(tree, 'group-general'))).not.toContain('set-weekModel')
  expect(week).toContain('Reader profile')
  expect(week).toContain(PROFILE)
  expect(await ui.find({ type: 'Link', text: 'Tier 1 · Newsroom' })).toBeDefined()
  expect(await ui.find({ type: 'Link', text: 'Tier 2 · Tracker' })).toBeDefined()
  await ui.press({ key: 'tab-week' })
  expect(await ui.find({ text: /Written by/ })).toBeUndefined()
  expect(await ui.find({ text: /Settings → Claude Week/ })).toBeDefined()
  await ui.unmount()
})

test('Week: an existing reader profile in the data folder is used and never written', async ($, on) => {
  const { s } = world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-week' })
  await ui.press({ key: 'week-write' })
  expect(s.weekRequests[0]!.prompt).toContain('uses_claude_code: daily, in the desktop app')
  expect(s.written.has(PROFILE)).toBe(false)
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ text: /blank profile was created/ })).toBeUndefined()
  await ui.unmount()
})

test('Week: with no reader profile yet, a blank one is created from the template and Settings says so', async ($, on) => {
  const { s } = world(on, { noProfile: true })
  await $.session.start(START)
  expect(s.written.get(PROFILE)).toBe('# Claude Week reader profile.\nname:\n')
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ text: /blank profile was created here/ })).toBeDefined()
  expect(JSON.stringify(boxNode(await ui.drawn(), 'group-week'))).toContain(PROFILE)
  await ui.unmount()
})

test('Week: Archive lists every edition with its counts, and Open shows an older one as it was, still editable', async ($, on) => {
  const older = parseEdition(WEEK_ANSWER.replaceAll('2026-W42', '2026-W41').replace('Claude Week 42', 'Claude Week 41'), '2026-W41') as { edition: unknown }
  const vote = { story_id: '2026-W41-idle', edition_id: '2026-W41', section: 'code', title: 'Idle compaction', verdict: 'up', why: null, take: 'worth trying', updated_at: 'x' }
  const { saved, ui } = await weekPane($, on, {
    saved: {
      weekEditions: { ...storedEdition().weekEditions, '2026-W41': older.edition },
      weekFeedback: { '2026-W41-idle': vote },
      weekRead: { '2026-W41-haiku': true },
    },
  })
  // One edition alone has no archive; two do.
  await ui.press({ key: 'week-archive' })
  expect(await ui.find({ text: 'Archive' })).toBeDefined()
  expect(await ui.find({ text: /^Claude Week 42 · .* \(showing\)$/ })).toBeDefined()
  expect(await ui.find({ text: '0 of 2 read · 0 voted' })).toBeDefined()
  expect(await ui.find({ text: /^Claude Week 41 · / })).toBeDefined()
  expect(await ui.find({ text: '1 of 2 read · 1 voted' })).toBeDefined()
  expect(buttonProps(await ui.drawn(), 'up-2026-W42-idle')).toBeUndefined()

  await ui.press({ key: 'week-open-2026-W41' })
  expect(await ui.find({ text: /^Claude Week 41/ })).toBeDefined()
  expect(buttonLook(await ui.drawn(), 'up-2026-W41-idle')?.variant).toBe('primary')
  expect(await ui.find({ type: 'Input', key: 'take-field-2026-W41-idle' })).toBeDefined()
  expect(await ui.find({ text: '✓ Haiku default' })).toBeDefined()

  // Feedback on an older week saves like any other.
  await ui.press({ key: 'up-2026-W41-idle' })
  expect((saved.get('weekFeedback') as Record<string, { verdict: string | null; take: string }>)['2026-W41-idle']).toMatchObject({ verdict: null, take: 'worth trying' })

  await ui.press({ key: 'week-archive' })
  await ui.press({ key: 'week-archive-back' })
  expect(await ui.find({ text: /^Claude Week 41/ })).toBeDefined()
  expect(buttonProps(await ui.drawn(), 'week-archive-back')).toBeUndefined()
  await ui.unmount()
})

test('Week: with one edition there is no Archive button', async ($, on) => {
  const { ui } = await weekPane($, on, { saved: storedEdition() })
  expect(buttonProps(await ui.drawn(), 'week-archive')).toBeUndefined()
  await ui.unmount()
})

test('Week on mobile: no fields, saved reasons show as text, and votes still save', async ($, on) => {
  const why = { story_id: '2026-W42-idle', edition_id: '2026-W42', section: 'code', title: 'Idle compaction', verdict: 'up', why: 'useful', take: null, updated_at: 'x' }
  const { saved, ui } = await weekPane($, on, { saved: { ...storedEdition(), weekFeedback: { '2026-W42-idle': why } } }, 'mobile')
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(buttonProps(await ui.drawn(), 'take-2026-W42-idle')).toBeUndefined()
  expect(await ui.find({ text: 'Why: useful' })).toBeDefined()
  await ui.press({ key: 'down-2026-W42-haiku' })
  expect((saved.get('weekFeedback') as Record<string, { verdict: string }>)['2026-W42-haiku']!.verdict).toBe('down')
  await ui.unmount()
})

test('Week: a redraw keeps the story buttons\' press handles', async ($, on) => {
  const { ui } = await weekPane($, on, { saved: storedEdition() })
  const before = handleOf(await ui.drawn(), 'up-2026-W42-idle')
  expect(before).toBeDefined()
  await ui.redraw({ ...pane('desktop').props, isFocused: true })
  expect(handleOf(await ui.drawn(), 'up-2026-W42-idle')).toBe(before)
  await ui.unmount()
})

test('Week: when the prompt box can\'t take the side question, it goes on the clipboard and a toast says so', async ($, on) => {
  const { s, ui } = await weekPane($, on, { saved: storedEdition(), boxBlocked: true })
  await ui.press({ key: 'aside-2026-W42-idle' })
  expect(s.copied[0]).toMatch(/^\/btw Explain idle compaction\. \(This is about the Claude Week story/)
  expect(s.toasts.at(-1)).toContain("Couldn't put the side question in the prompt box, so it's on the clipboard")
  await ui.unmount()
})

// ---- Statistics: tokens and the layout trial (v0.9.4) ----

/** Two drafts of ANALYSIS written for Opus 5.5, with some tokens counted. */
function stats(model = 'Opus 5.5'): Analytics {
  const a = parseAnalysis(ANALYSIS)!
  const two = recordDraft(recordDraft(NO_ANALYTICS, a, 'Opus 5.5', 1), a, model, 2)
  return { ...two, tokens: { calls: 2, input: 1000, output: 500, cacheRead: 200, cacheWrite: 0 } }
}
const STATS = stats()

statsTest('Statistics: the eight parts, in order: score, work on next, missing or vague, strengths, changes, advice, tokens, clear', async ($, on) => {
  world(on, { saved: { analytics: STATS } })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-analytics' })
  // ANALYSIS scores 2.5: Output and Constraints (n/a) a point each, Goal (vague) half.
  expect(await ui.find({ text: '2 analyses · your last 2 drafts score 2.5 of 6 on average.' })).toBeDefined()
  // Goal, Context, Done means and Stop rule are all missing or vague in both; Goal comes first on the checklist.
  expect(await ui.find({ text: 'Work on next: Goal' })).toBeDefined()
  expect(await ui.find({ text: 'Missing or vague in 2 of your last 2 drafts.' })).toBeDefined()
  expect(barsIn(boxNode(await ui.drawn(), 'bars-missing-Goal'))).toEqual(['15+0d 2 of 2'])
  expect(await ui.find({ text: '0 left out · 2 vague · last 2: 2' })).toBeDefined()
  // Constraints was n/a and Output present, so neither is missing or vague.
  expect(boxNode(await ui.drawn(), 'bars-missing-Output')).toBeUndefined()
  expect(await ui.find({ text: 'Output: in 2 of 2 drafts' })).toBeDefined()
  expect(barsIn(boxNode(await ui.drawn(), 'bars-rules-0'))).toEqual(['15+0d 2 of 2'])
  expect(await ui.find({ text: 'Added 0 of 0 suggestions · applied 0 of 2 rewrites' })).toBeDefined()
  expect(await ui.find({ text: '1,700 tokens used by analyses (\u2248850 each).' })).toBeDefined()

  const keys = boxNode(await ui.drawn(), 'block-statistics')!.kids.map(k => (k as { props?: { key?: string } }).props?.key ?? (k as { type?: string }).type)
  expect(keys).toEqual(['stats-score', 'stats-focus', 'stats-missing', 'stats-strengths', 'stats-rules', 'stats-advice', 'Text', 'clear-lessons'])
  await ui.unmount()
})

statsTest('Statistics: what the coach changed most counts only drafts for the session\'s model', async ($, on) => {
  world(on, { saved: { analytics: stats('Sonnet 5.5') } })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-analytics' })
  // One of the two drafts was for Opus 5.5, the session's model.
  expect(await ui.find({ text: 'What the coach changed most · Opus 5.5' })).toBeDefined()
  expect(barsIn(boxNode(await ui.drawn(), 'bars-rules-0'))).toEqual(['15+0d 1 of 1'])
  await ui.unmount()
})

statsTest('Statistics: Add and Apply are counted as advice taken, with the suggestion offered as the example to work on', async ($, on) => {
  const { s, saved } = world(on, { analysis: MERGED })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  await ui.press({ key: 'add-1-0' })
  await ui.press({ key: 'fill' })
  const d = (saved.get('analytics') as Analytics).drafts[0]!
  expect(d).toMatchObject({ applied: true, added: 1 })
  expect(d.offered).toHaveLength(3)
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ text: 'Added 1 of 3 suggestions · applied 1 of 1 rewrite' })).toBeDefined()
  await ui.unmount()
})

statsTest('Statistics: each Analyze adds its tokens, an unreadable answer too, and Clear statistics resets them', async ($, on) => {
  const { s, saved } = world(on)
  s.box = 'fix the login thing so it works'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  await ui.press({ key: 'tab-analytics' })
  // The stub's usage is 1 input and 1 output token.
  expect(await ui.find({ text: '2 tokens used by analyses (\u22482 each).' })).toBeDefined()
  await ui.press({ key: 'clear-lessons' })
  expect(await ui.find({ text: /tokens/ })).toBeUndefined()
  expect(await ui.find({ text: /No analyses yet/ })).toBeDefined()
  expect(saved.has('analytics')).toBe(false)
  await ui.unmount()
})

statsTest('Statistics: an answer that is not an analysis still counts its tokens, but adds no draft', async ($, on) => {
  const { s, saved } = world(on, { analysis: 'no tags here' })
  s.box = 'fix the login thing so it works'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  const a = saved.get('analytics') as Analytics
  expect(a.drafts).toHaveLength(0)
  expect(a.tokens.calls).toBe(1)
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ text: '2 tokens used by analyses (\u22482 each).' })).toBeDefined()
  await ui.unmount()
})

test('Statistics: the statistics kept before v0.11.0 are deleted when a session starts', async ($, on) => {
  const { saved } = world(on, { saved: { lessons: { analyses: 80, gaps: { Goal: 3 }, rules: {}, recent: [] }, statsLayout: 'side' } })
  await $.session.start(START)
  expect(saved.has('lessons')).toBe(false)
  expect(saved.has('statsLayout')).toBe(false)
})

statsTest('Statistics: on mobile the statistics show too, and Clear statistics empties them', async ($, on) => {
  world(on, { saved: { analytics: STATS }, surfaces: ['mobile'] })
  await $.session.start({ ...START, surface: 'mobile' })
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('mobile'))
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ text: 'Work on next: Goal' })).toBeDefined()
  await ui.press({ key: 'clear-lessons' })
  expect(await ui.find({ text: /No analyses yet/ })).toBeDefined()
  await ui.unmount()
})

test('Analytics: the statistics first, then a thin line and the tips', async ($, on) => {
  world(on, { saved: { lessons: STATS } })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-analytics' })
  const tree = await ui.drawn()
  const text = JSON.stringify(tree)
  expect(boxNode(tree, 'group-statistics')).toBeDefined()
  expect(boxNode(tree, 'line-analytics')).toBeDefined()
  expect(text.indexOf('Work on next')).toBeLessThan(text.indexOf('Using Opus 5.5 well'))
  expect(text.indexOf('line-analytics')).toBeLessThan(text.indexOf('Using Opus 5.5 well'))
  expect(await ui.find({ type: 'Markdown', text: 'Run /clear between tasks.' })).toBeDefined()
  await ui.unmount()
})

test('Your rules: Settings lists the rules file in the data folder, and Remove takes a rule out of it and out of the analysis', async ($, on) => {
  const { s } = world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ text: new RegExp(`your own rules: ${OWN_RULES}`) })).toBeDefined()
  await ui.press({ key: 'tab-settings' })
  const group = JSON.stringify(boxNode(await ui.drawn(), 'group-own-rules'))
  expect(group).toContain(OWN_RULES)
  expect(group).toContain('End with a recap.')
  await ui.press({ key: 'remove-rule-End with a recap.' })
  expect(s.written.get(OWN_RULES)).toBe('# Your own rules\n\n')
  expect(await ui.find({ text: 'No rules yet.' })).toBeDefined()
  expect(await ui.find({ text: 'Removed.' })).toBeDefined()
  s.box = 'fix the login bug in auth.ts please'
  await ui.press({ key: 'tab-coach' })
  await ui.press({ key: 'analyze' })
  expect(s.analyses[0]).not.toContain('End with a recap.')
  await ui.unmount()
})

test('Your rules: with no file yet, the first rule added creates it with a header, and the next analysis sends it', async ($, on) => {
  const { s } = world(on, { noOwnRules: true })
  await $.session.start(START)
  // Nothing is written until a rule is added.
  expect(s.written.has(OWN_RULES)).toBe(false)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ text: 'No rules yet.' })).toBeDefined()
  await ui.input({ key: 'add-rule-0', text: "  Keep the draft's language. " })
  expect(s.written.get(OWN_RULES)).toBe(`${OWN_RULES_HEADER}- Keep the draft's language.\n`)
  expect(await ui.find({ text: "Keep the draft's language." })).toBeDefined()
  expect(await ui.find({ text: /^Added/ })).toBeDefined()
  // The field starts empty again, and the same rule twice is refused.
  expect(await ui.find({ type: 'Input', key: 'add-rule-0' })).toBeUndefined()
  await ui.input({ key: 'add-rule-1', text: "Keep the draft's language." })
  expect(ownRuleLines(s.written.get(OWN_RULES)!)).toEqual(["Keep the draft's language."])
  expect(await ui.find({ text: /already in your rules/ })).toBeDefined()
  s.box = 'fix the login bug in auth.ts please'
  await ui.press({ key: 'tab-coach' })
  await ui.press({ key: 'analyze' })
  expect(s.analyses[0]).toContain("Keep the draft's language.")
  await ui.unmount()
})

test('Your rules: the mobile app lists the rules with no field to add one', async ($, on) => {
  world(on, { surfaces: ['mobile'] })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('mobile'))
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ text: 'End with a recap.' })).toBeDefined()
  expect(await ui.find({ text: /Add rules in Desktop/ })).toBeDefined()
  await ui.unmount()
})

test('Rules on the Analytics tab: the session model picked, any model one press away, groups shown and hidden, Edit in Settings', async ($, on) => {
  world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-analytics' })
  // The session's model is picked and its rules open; the general rules start hidden.
  expect(await ui.find({ key: 'rules-pick-opus-5-5.md', text: '[Opus 5.5]' })).toBeDefined()
  expect(await ui.find({ key: 'rules-model-list', text: 'Name the finish line.' })).toBeDefined()
  expect(await ui.find({ key: 'rules-general-list' })).toBeUndefined()
  expect(await ui.find({ text: '1 rule' })).toBeDefined()
  // Rules sit between the statistics and the tips.
  const order = (await ui.findAll({})).map(el => el.text ?? '')
  expect(order.findIndex(t => t === 'Rules')).toBeGreaterThan(order.findIndex(t => t === 'Statistics'))
  expect(order.findIndex(t => t === 'Rules')).toBeLessThan(order.findIndex(t => t === 'Using Opus 5.5 well'))
  await ui.press({ key: 'rules-toggle-general' })
  expect(await ui.find({ key: 'rules-general-list', text: 'Be explicit.' })).toBeDefined()
  // Another model's rules, though the session runs Opus.
  await ui.press({ key: 'rules-pick-sonnet-5-5.md' })
  expect(await ui.find({ key: 'rules-pick-sonnet-5-5.md', text: '[Sonnet 5.5]' })).toBeDefined()
  expect(await ui.find({ key: 'rules-model-list', text: 'Ask for a real check.' })).toBeDefined()
  expect(await ui.find({ text: 'Name the finish line.' })).toBeUndefined()
  // A model with no file reads as such.
  await ui.press({ key: 'rules-pick-haiku-5-5.md' })
  expect(await ui.find({ text: 'No rules found for Haiku 5.5.' })).toBeDefined()
  // Your rules, hidden at first, then Edit in Settings opens the Settings tab.
  expect(await ui.find({ key: 'rules-own-list' })).toBeUndefined()
  await ui.press({ key: 'rules-toggle-own' })
  expect(await ui.find({ key: 'rules-own-list', text: 'End with a recap.' })).toBeDefined()
  await ui.press({ key: 'rules-edit-own' })
  expect(boxNode(await ui.drawn(), 'group-own-rules')).toBeDefined()
  await ui.unmount()
})

test('Rules on the Analytics tab: a model with no rule file picks nothing and says so', async ($, on) => {
  world(on, { model: 'claude-opus-4-1' })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'tab-analytics' })
  expect(await ui.find({ text: /^\[/ , key: 'rules-pick-opus-5-5.md' })).toBeUndefined()
  expect(await ui.find({ text: 'claude-opus-4-1 has no rules of its own. Pick a model above.' })).toBeDefined()
  await ui.unmount()
})

test('Checklist from the rule files: Analyze judges by the model\'s list, and the Analytics tab shows it per model', async ($, on) => {
  const general = '# General\n\nAs of: 2026-10\n\n- Be explicit.\n\n## Checklist\n- Goal: what outcome they want. Source: "Be clear and direct"\n- Done means: how it will be checked. Source: "Ask Claude to self-check"\n'
  const opus = '# Opus\n\nAs of: 2026-09\n\n- Name the finish line.\n\n## Checklist\n- Add Stop rule: when to stop and ask. Source: blog\n- Change Done means: the finish line. Source: blog, "name the finish line"\n'
  const haiku = '# Haiku\n\nAs of: 2026-10\n\n- Keep it short.\n\n## Checklist\n- Drop Goal. Source: guide\n'
  const { s, saved } = world(on, { files: { 'rules/general.md': general, 'rules/opus-5-5.md': opus, 'rules/haiku-5-5.md': haiku } })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  expect(s.analysisSystems[0]).toContain('- Done means: the finish line.')
  expect(s.analysisSystems[0]).toContain('- Stop rule: when to stop and ask.')
  // The rules go with the draft without their checklist.
  expect(s.analyses[0]).toContain('Name the finish line.')
  expect(s.analyses[0]).not.toContain('## Checklist')
  expect(saved.get('analytics')).toBeUndefined()

  await ui.press({ key: 'tab-analytics' })
  // The checklist for the session's model is open first: tags, definitions, sources, and the general wording under a change.
  expect(await ui.find({ text: '3 items' })).toBeDefined()
  expect(await ui.find({ text: '· general' })).toBeDefined()
  expect(await ui.find({ text: '· added for Opus 5.5' })).toBeDefined()
  expect(await ui.find({ text: '· changed for Opus 5.5' })).toBeDefined()
  expect(await ui.find({ text: 'General: how it will be checked.' })).toBeDefined()
  expect(await ui.find({ text: 'Source: blog, "name the finish line"' })).toBeDefined()
  // Rules lists leave the checklist out.
  expect(await ui.find({ key: 'rules-model-list', text: 'Name the finish line.' })).toBeDefined()
  expect(await ui.find({ key: 'rules-model-list', text: 'Stop rule' })).toBeUndefined()
  // Another model: Haiku drops Goal, shown struck through.
  await ui.press({ key: 'rules-pick-haiku-5-5.md' })
  expect(await ui.find({ text: '1 item' })).toBeDefined()
  expect(await ui.find({ text: '· dropped for Haiku 5.5' })).toBeDefined()
  expect(textLook(await ui.drawn(), 'Goal')).toMatchObject({ found: true })
  expect(await ui.find({ text: '· added for Opus 5.5' })).toBeUndefined()
  // Hide folds it.
  await ui.press({ key: 'rules-toggle-checklist' })
  expect(await ui.find({ text: '· dropped for Haiku 5.5' })).toBeUndefined()
  await ui.unmount()
})
