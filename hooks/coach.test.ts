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
  withoutAddition,
  asOfDate,
  cleanRule,
  dataDir,
  liveSkipReason,
  ownRuleLines,
  withOwnRule,
  withoutOwnRule,
  OWN_RULES_HEADER,
  parseAnalysis,
  parseRuleFile,
  analysisSystem,
  checklistFor,
  parseChecklist,
  withoutChecklist,
  parseQuick,
  quickFor,
  withSentence,
} from './lib.ts'
import { REWRITE_EDITABLE, rowsFor } from './ui.ts'
import { type Edition, parseEdition } from './week.ts'

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
</changes>`

describe('parseAnalysis', () => {
  test('reads the checklist, rewrite and changes', () => {
    const a = parseAnalysis(ANALYSIS)!
    expect(a.checklist.map(c => c.status)).toEqual(['partial', 'missing', 'n/a', 'missing', 'missing', 'present'])
    expect(a.checklist[1]).toEqual({ item: 'Context', status: 'missing', note: 'no file or error named' })
    expect(a.rewrite).toBe('Fix the login bug in [which file?]. Done means the login test passes.')
    expect(a.changes[0]).toEqual({ rule: 'Name the finish line', why: 'The assistant knows when to stop.' })
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

  test('rowsFor gives the rewrite field room for its text and one spare line, up to 12 lines, past which it scrolls', () => {
    expect(rowsFor('Fix it.')).toBe(2)
    expect(rowsFor('a'.repeat(600))).toBe(11) // 60 a line when the surface hasn't said
    expect(rowsFor('a'.repeat(600), 200)).toBe(11) // a wide window still wraps at 60
    expect(rowsFor('a'.repeat(400), 44)).toBe(11) // a narrow pane: 40 a line
    expect(rowsFor('a'.repeat(600), 44)).toBe(12) // 16 needed: capped, the rest scrolls
    expect(rowsFor('One.\n\nTwo.')).toBe(4)
  })

  test('withoutAddition takes a suggestion back out of an edited rewrite, with the space or line it left', () => {
    expect(withoutAddition('Fix auth.ts. Done means it passes.', 'Done means it passes.')).toBe('Fix auth.ts.')
    expect(withoutAddition('Fix it.\nThen test.\nSecond.', 'Second.')).toBe('Fix it.\nThen test.')
    expect(withoutAddition('Fix it. Second. Thanks.', 'Second.')).toBe('Fix it. Thanks.')
    expect(withoutAddition('Fix it.', 'Second.')).toBe('Fix it.')
  })
})

describe('live mode', () => {
  test('liveSkipReason waits for enough text, a new draft, no running analysis, and the cap', () => {
    const base = { text: 'fix the login bug please', lastAnalyzed: '', isRunning: false, liveCalls: 0 }
    expect(liveSkipReason(base)).toBeUndefined()
    expect(liveSkipReason({ ...base, text: 'fix it' })).toContain('15 characters')
    expect(liveSkipReason({ ...base, lastAnalyzed: 'fix the login bug please ' })).toBe('Already analyzed.')
    expect(liveSkipReason({ ...base, isRunning: true })).toContain('already running')
    expect(liveSkipReason({ ...base, liveCalls: LIVE_CAP })).toContain('Live limit')
  })

  test('asOfDate reads a rules file\'s date', () => {
    const md = '# Rules\n\nSource: x\nAs of: 2026-10-17\n\n- First rule.\n'
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
    // The Checklist shows as one of the file's sections.
    expect(parseRuleFile('## Clarity\n- Be explicit.\n\n## Checklist\n- Goal: the outcome. Source: x\n')).toEqual([
      { section: 'Clarity', rules: ['Be explicit.'] },
      { section: 'Checklist', rules: ['Goal: the outcome. Source: x'] },
    ])
  })

  test('checklist: a model file\'s own, inheriting nothing; else general.md\'s; else the built-in list', () => {
    const general = '# General\n\n## Clarity\n- Be explicit.\n\n## Checklist\n- Goal: what outcome they want. Source: "Be clear and direct"\n- Constraints: limits or scope. Source: "Be clear and direct"\n- Done means: how it will be checked. Source: "Ask Claude to self-check"\n'
    const opus = '# Opus\n\n## Remove\n- Remove "think hard".\n\n## Checklist\n- Goal: the whole task in one message. Source: blog\n<!-- Dropped Constraints: "a line" -->\n- Done means: the finish line. Source: blog, "name the finish line"\n- Stop rule: when to stop and ask. Source: blog\n'
    expect(parseChecklist(opus)).toEqual([
      { name: 'Goal', definition: 'the whole task in one message.', source: 'blog' },
      { name: 'Done means', definition: 'the finish line.', source: 'blog, "name the finish line"' },
      { name: 'Stop rule', definition: 'when to stop and ask.', source: 'blog' },
    ])
    // The model's list stands alone: general.md's Constraints does not come back.
    expect(checklistFor(general, opus)).toEqual({ items: parseChecklist(opus), from: 'model' })
    expect(checklistFor(general, '# Older model\n- Be brief.\n')).toEqual({ items: parseChecklist(general), from: 'general' })
    expect(checklistFor(general).from).toBe('general')
    const fallback = checklistFor('# General\n- Be explicit.\n')
    expect(fallback.from).toBe('built in')
    expect(fallback.items.map(i => i.name)).toEqual(['Goal', 'Context', 'Constraints', 'Done means', 'Stop rule', 'Output'])
    expect(analysisSystem(fallback.items)).toBe(ANALYSIS_SYSTEM)
    // The system prompt lists the model's items, in order.
    const system = analysisSystem(checklistFor(general, opus).items)
    expect(system).toContain('- Goal: the whole task in one message.\n- Done means: the finish line.\n- Stop rule: when to stop and ask.')
    expect(system).not.toContain('- Constraints:')
    expect(system).toContain('one line for each of the 3 items')
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
  [PROFILE]: 'name: Omar\nuses_claude_code: daily, in the desktop app\n',
  'week/profile.example.yaml': '# News reader profile.\nname:\n',
  'week/edition-prompt.md': 'You are writing this week\'s edition of News.\n',
  'week/sources.json': JSON.stringify({
    pages: [
      { tier: 1, label: 'Newsroom', url: 'https://news.example/' },
      { tier: 2, label: 'Tracker', url: 'https://tracker.example/broken' },
    ],
  }),
  'sources.json': JSON.stringify({
    targets: {
      'rules/general.md': ['https://docs.example/general'],
      'rules/opus-5-5.md': ['https://docs.example/opus', 'https://docs.example/broken'],
      'rules/sonnet-5-5.md': ['https://docs.example/sonnet'],
    },
  }),
}

function world(
  on: On,
  opts: { mode?: string; model?: string; surfaces?: string[]; analysis?: string; saved?: Record<string, unknown>; weekAnswer?: string; pagesDown?: boolean; boxBlocked?: boolean; noProfile?: boolean; noOwnRules?: boolean; files?: Record<string, string>; engine?: string; desktopEnv?: string } = {},
) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-17T09:00:00Z') })
  const saved = new Map<string, unknown>([
    ...(opts.mode ? [['mode', opts.mode] as [string, unknown]] : []),
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
    analysisCalls: [] as { effort?: string; blocks?: readonly { text: string; cache?: true }[] }[],
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
  on('env.get', async ($, e) => ({ value: e.name === 'CLAUDE_CONFIG_DIR' ? '/home/u/.claude' : e.name === 'CLAUDE_CODE_DESKTOP_APP_VERSION' ? opts.desktopEnv : undefined }))
  on('session.version', async () => ({ value: { version: opts.engine ?? '2.1.304', base: opts.engine ?? '2.1.304' } }))
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
      s.analysisCalls.push({ effort: e.effort, blocks: e.promptBlocks })
      s.analysisModels.push(e.model)
      return { value: { isAnswered: true as const, text: opts.analysis ?? ANALYSIS, usage } }
    }
    if (String(e.system).includes('edition of News')) {
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
// The rewrite is a Code block until the editable field is back on (REWRITE_EDITABLE); its editing tests run only then.
const REWRITE = REWRITE_EDITABLE ? 'Input' : 'Code'
const editTest: typeof test = REWRITE_EDITABLE ? test : (() => {}) as unknown as typeof test
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
  // No "For <model>" line under the tabs.
  expect(await ui.find({ text: /^For / })).toBeUndefined()
  expect(await ui.find({ type: 'Code', text: 'think step by step' })).toBeDefined()
  // No rules-date line since v0.23.0.
  expect(await ui.find({ text: /Rules as of/ })).toBeUndefined()
  // Tips (v0.17.0) and the Analytics tab (v0.39.0) are gone.
  expect(buttonProps(await ui.drawn(), 'tab-analytics')).toBeUndefined()
  expect(await ui.find({ key: 'tips' })).toBeUndefined()

  await ui.press({ key: 'analyze' })
  expect(s.analyses).toHaveLength(1)
  expect(s.analyses[0]).toContain('Name the finish line.') // the Opus rules file
  expect(s.analyses[0]).toContain('End with a recap.') // your own rules, from the data folder, are sent too
  expect(s.analyses[0]).toContain('think step by step and fix the login thing')
  expect(await ui.find({ type: REWRITE, text: '[which file?]' })).toBeDefined()
  // One list, no tabs (v0.18.0): the checklist and the rewrite's changes show together.
  expect(await ui.find({ key: 'detail-checklist' })).toBeUndefined()
  expect(await ui.find({ key: 'detail-why' })).toBeUndefined()
  expect(await ui.find({ text: 'no file or error named' })).toBeDefined()
  expect(await ui.find({ text: 'Name the finish line' })).toBeDefined()
  // Analyze sits right under the draft box (v0.22.0), then the rewrite, then Send, then the checklist.
  const order = (await ui.findAll({})).filter(el => ['Code', 'Input', 'Text', 'Button'].includes(el.type)).map(el => el.text ?? '')
  const draftAt = order.findIndex(t => t.includes('think step by step and fix the login thing'))
  const rewriteAt = order.findIndex(t => t.includes('Fix the login bug in [which file?]'))
  expect(draftAt).toBeGreaterThan(-1)
  expect(rewriteAt).toBeGreaterThan(draftAt)
  expect(order.findIndex(t => t === 'Rewrite')).toBeGreaterThan(draftAt)
  expect(rewriteAt).toBeGreaterThan(order.findIndex(t => t === 'Rewrite'))
  // No heading above the rewrite box since v0.25.0: the only "Rewrite" before it is the button.
  expect(order.slice(0, rewriteAt).filter(t => t === 'Rewrite')).toHaveLength(1)
  expect((await ui.find({ key: 'analyze' }))?.text).toBe('Rewrite')
  // Send right under the rewrite box, with no Copy to prompt beside it (v0.29.0), and no "Your draft" label above the draft.
  expect(order[rewriteAt + 1]).toBe('Send')
  expect(order).not.toContain('Copy to prompt')
  expect(textLook(await ui.drawn(), 'Your draft')).toEqual({ found: false })
  expect(rewriteAt).toBeLessThan(order.findIndex(t => t === 'Checklist'))
  // The analysis asks for no tips.
  expect(s.analysisSystems[0]).not.toContain('<tips>')

  await ui.press({ key: 'apply' })
  const rewrite = 'Fix the login bug in [which file?]. Done means the login test passes.'
  // Filled, sent as Omar's own words, then the box emptied as Enter leaves it.
  expect(s.filled).toEqual([rewrite, ''])
  expect(s.submitted).toEqual([{ text: rewrite, origin: { kind: 'plugin', name: 'prompt-coach', asUser: true } }])
  expect(s.box).toBe('')
  // Statistics are gone (v0.39.0): nothing is recorded.
  expect(saved.has('analytics')).toBe(false)
  await ui.unmount()
})

test('inside a conversation, Rewrite sends Claude\'s last reply, and the pane shows no note about it (v0.26.1)', async ($, on) => {
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
  expect(await ui.find({ text: /Read as a reply/ })).toBeUndefined()
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
  // Sending (not just emptying the box, which keeps the draft since v0.23.0) clears it.
  await $.prompt.submit({ text: s.box, wait: false, origin: { kind: 'composer' } })
  s.box = ''
  await clock.advance(1500)
  expect(await ui.find({ text: /Your draft changed/ })).toBeUndefined()
  await ui.unmount()
})

test('when the session reports no model, the pane still loads the rules, then takes the model from Claude\'s reply', async ($, on) => {
  const { s } = world(on, { model: '' })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ text: /^For / })).toBeUndefined()
  expect(await ui.find({ text: /hasn't said which model/ })).toBeDefined()
  expect(await ui.find({ text: /No rules for/ })).toBeUndefined()
  expect(await ui.find({ text: /Rules as of/ })).toBeUndefined()
  await ui.press({ key: 'tab-settings' })
  // The model's rules start closed (v0.17.4); Show opens them.
  expect(await ui.find({ key: 'rules-model-list' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-toggle-model', text: 'Show' })).toBeDefined()
  await ui.press({ key: 'rules-toggle-model' })
  expect(await ui.find({ text: /has no rules of its own/ })).toBeDefined()
  await ui.press({ key: 'tab-coach' })

  const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
  await $.turn.complete({ answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage })
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ key: 'rules-model-list', text: 'Name the finish line.' })).toBeDefined()
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
  for (const [key, hotkey] of [['tab-week', '2'], ['tab-settings', '3']] as const) {
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
  // Settings stands alone at the right end; Coach and Week sit together on the left, with no Analytics tab (v0.39.0).
  const row = boxNode(await ui.drawn(), 'tabs')!
  expect(row.props.justifyContent).toBe('space-between')
  expect(row.kids).toHaveLength(2)
  expect(buttonProps(await ui.drawn(), 'tab-analytics')).toBeUndefined()
  // The Week tab is labelled News (v0.10.1); its key is still tab-week.
  expect(buttonProps(row.kids[0], 'tab-week')?.label).toBe('News')
  expect(buttonProps(row.kids[0], 'tab-settings')).toBeUndefined()
  expect(buttonProps(row.kids[1], 'tab-settings')?.label).toBe('Settings')
  await ui.unmount()
})

test('terminal tabs: plain Buttons with keys 1-3, the open one in clay brackets', async ($, on) => {
  world(on)
  await $.session.start({ ...START, surface: 'terminal' })
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('terminal'))
  const open = buttonProps(await ui.drawn(), 'tab-coach')
  expect(open?.label).toBe('[Coach]')
  expect(open?.plain).toBe(true)
  expect(open?.hotkey).toBe('1')
  expect(buttonLook(await ui.drawn(), 'tab-coach')?.color).toBe('claude')
  for (const [key, hotkey] of [['tab-week', '2'], ['tab-settings', '3']] as const) {
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

test('Settings: each section in a round bordered box with its title on no band, plain labels, a thin line between rows', async ($, on) => {
  world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  const tree = await ui.drawn()
  const boxLook = { flexDirection: 'column', borderStyle: 'round', borderColor: 'subtle', paddingX: 1, gap: 1 }
  for (const [key, title] of [['general', 'General'], ['rules', 'Rules'], ['own-rules', 'Your rules'], ['week', 'News']] as const) {
    const g = boxNode(tree, `group-${key}`)!
    const { key: _gk, children: _gc, ...look } = g.props
    expect(look).toEqual(boxLook)
    // The title first, with no background and no padding (v0.20.1): semibold, in the normal text color.
    const head = g.kids[0] as { type?: string; props: Record<string, unknown> }
    expect(head.type).toBe('Box')
    const { children: _hk, ...headProps } = head.props ?? {}
    expect(headProps).toEqual({})
    expect(textLook(head, title)).toEqual({ found: true, color: undefined, weight: 'semibold' })
    // Then the rows, a cell in from the title, with no border of their own.
    expect(boxNode(tree, `group-${key}-box`)?.props).toMatchObject({ paddingLeft: 1 })
    expect(boxNode(tree, `group-${key}-box`)?.props.borderStyle).toBeUndefined()
  }
  expect(JSON.stringify(tree)).not.toContain('"backgroundColor":"subtle"')
  // More space between sections (the xl step) than between rows (1).
  expect(boxNode(tree, 'settings-sections')?.props.gap).toBe('xl')
  expect(boxNode(tree, 'settings-sections')?.kids.map(k => (k as { props?: { key?: string } }).props?.key)).toEqual(['group-general', 'group-rules', 'group-own-rules', 'group-week'])
  // Statistics are gone (v0.39.0).
  expect(boxNode(tree, 'group-statistics')).toBeUndefined()
  // Rules: the rules in use (moved from the Analytics tab in v0.39.0), and nothing else: the in-pane refresh went in v0.40.0 and the Sources list in v0.40.2, since each rules file lists its own pages.
  const rules = boxNode(tree, 'group-rules-box')!
  expect(rules.kids.map(k => (k as { props?: { key?: string } }).props?.key)).toEqual(['block-rule-list'])
  expect(await ui.find({ type: 'Link', text: 'docs.example/general' })).toBeUndefined()
  // General's three rows (Mode, Rewrite model and, since v0.42.0, Rewrite effort) have a 1-pixel Svg line between each two.
  const general = boxNode(tree, 'group-general-box')!
  const lines = general.kids.filter(k => (k as { props?: { key?: string } }).props?.key?.startsWith('line-general-'))
  expect(lines).toHaveLength(2)
  const svg = (lines[0] as { props?: { children?: unknown[] }; children?: unknown[] })
  const svgNode = [svg.children, svg.props?.children].flat().find(k => (k as { type?: string })?.type === 'Svg') as { props?: Record<string, unknown> }
  expect(svgNode?.props?.height).toBe(1)
  // Labels in the normal weight, as Desktop's are; descriptions dim.
  expect(textLook(tree, 'Mode')).toEqual({ found: true, color: undefined, weight: undefined })
  expect(textLook(tree, 'Rewrite model')).toEqual({ found: true, color: undefined, weight: undefined })
  for (const [key, control] of [['mode', 'mode'], ['rewriteModel', 'set-rewriteModel'], ['rewriteEffort', 'set-rewriteEffort'], ['weekModel', 'set-weekModel']] as const) {
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
  // Rewritten: Rewrite keeps the primary style (v0.25.3), so it never looks grayed out.
  expect(buttonLook(tree, 'analyze')).toEqual({ color: undefined, variant: 'primary' })
  expect(buttonLook(tree, 'apply')).toEqual({ color: undefined, variant: 'primary' })
  expect(buttonLook(tree, 'fill')).toBeUndefined()
  expect(buttonLook(tree, 'add-1-0')?.color).toBeUndefined()
  // The Copy button is gone; Desktop's own icon on the rewrite box copies it.
  expect(buttonLook(tree, 'copy')).toBeUndefined()
  await ui.press({ key: 'add-1-0' })
  expect(buttonLook(await ui.drawn(), 'add-1-0')?.color).toBe('error')

  // Section headings are semibold in the normal text color, not clay (Fill in the gaps has none since v0.26.0).
  expect(textLook(await ui.drawn(), 'Fill in the gaps')).toEqual({ found: false })
  expect(textLook(await ui.drawn(), 'Checklist')).toEqual({ found: true, color: undefined, weight: 'semibold' })

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

test('Settings (tab 3) holds the mode, and the Coach tab only shows a dim Live label while live mode is on', async ($, on) => {
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
  expect(await ui.find({ type: 'Select', key: 'set-refreshModel' })).toBeUndefined()
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

test('Rewrite effort is a setting (v0.42.0): low by default, changed through config.set, and the next Rewrite uses it', async ($, on) => {
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
  await ui.press({ key: 'analyze' })
  expect(s.analysisCalls.at(-1)?.effort).toBe('low')
  await ui.press({ key: 'tab-settings' })
  expect((await ui.find({ type: 'Select', key: 'set-rewriteEffort' }))?.props?.value).toBe('low')
  await ui.select({ key: 'set-rewriteEffort', value: 'high' })
  expect(set).toEqual([{ key: 'prompt-coach.rewriteEffort', value: 'high' }])
  expect(await ui.find({ text: /Rewrite effort set to high/ })).toBeDefined()
  await ui.press({ key: 'tab-coach' })
  await ui.press({ key: 'analyze' })
  expect(s.analysisCalls.at(-1)?.effort).toBe('high')
  await ui.unmount()
})

test('when a model setting change is refused, the model settings show read-only with the reason', async ($, on) => {
  world(on)
  on('config.set', async () => ({ deny: 'a trusted policy owns it' }))
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  await ui.select({ key: 'set-weekModel', value: 'sonnet' })
  for (const key of ['set-rewriteModel', 'set-rewriteEffort', 'set-weekModel']) expect(await ui.find({ type: 'Select', key })).toBeUndefined()
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

  // No separate Sources list since v0.40.2: each rules file lists its own pages.
  expect(await ui.find({ type: 'Link', text: 'docs.example/general' })).toBeUndefined()
  await ui.unmount()
})

test('after an analysis the draft stays on screen through an empty box, and typing replaces it', async ($, on) => {
  const { s, clock } = world(on)
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  // The box empties (Desktop can report it so): the analyzed draft stays.
  await type($, s, '')
  await clock.advance(1500)
  expect(await ui.find({ type: 'Code', text: 'fix the login thing' })).toBeDefined()
  // Typing starts: the box shows the new draft instead.
  await type($, s, 'add a logout test')
  await clock.advance(500)
  expect(await ui.find({ type: 'Code', text: 'fix the login thing' })).toBeUndefined()
  expect(await ui.find({ type: 'Code', text: 'add a logout test' })).toBeDefined()
  await ui.unmount()
})

test('with no edit events at all, the pane reads the prompt box each second, so Your draft follows typing', async ($, on) => {
  const { s, clock } = world(on)
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  // The box changes with no prompt.edit, as in Desktop.
  s.box = 'fix the login thing in auth.ts'
  await clock.advance(1000)
  expect(await ui.find({ type: 'Code', text: 'fix the login thing in auth.ts' })).toBeDefined()
  await ui.press({ key: 'analyze' })
  expect(s.analyses).toHaveLength(2)
  await ui.unmount()
})

test('Analyze is always active: no gray look, and a second press with the same draft analyzes again', async ($, on) => {
  const { s } = world(on)
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  expect((await ui.find({ key: 'analyze' }))?.props).toMatchObject({ variant: 'primary' })
  expect((await ui.find({ key: 'analyze' }))?.props.dimColor).toBeUndefined()
  await ui.press({ key: 'analyze' })
  expect(s.analyses).toHaveLength(2)
  expect((await ui.find({ key: 'analyze' }))?.props).toMatchObject({ variant: 'primary' })
  expect((await ui.find({ key: 'analyze' }))?.props.dimColor).toBeUndefined()
  await ui.unmount()
})

test('Fill in the gaps: the dropdown and the text field share one line', async ($, on) => {
  const { s } = world(on, { analysis: WITH_GAPS })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  // Indented like the suggestions (v0.26.1).
  expect(boxNode(await ui.drawn(), 'gap-1-0')?.props.paddingLeft).toBe(2)
  const line = boxNode(await ui.drawn(), 'gap-1-0-fields')!
  expect(line.props.flexDirection).toBe('row')
  expect(line.kids.map(k => (k as { props?: { key?: string } }).props?.key)).toEqual(['gap-1-0-pick', 'gap-1-0-type'])
  await ui.unmount()
})

test('Send is the only button under the rewrite: no Copy to prompt (v0.29.0)', async ($, on) => {
  const { s } = world(on)
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ key: 'apply' })).toBeUndefined()
  await ui.press({ key: 'analyze' })
  expect(await ui.find({ key: 'apply', text: 'Send' })).toBeDefined()
  expect(await ui.find({ key: 'fill' })).toBeUndefined()
  expect(await ui.find({ text: 'Copy to prompt' })).toBeUndefined()
  await ui.unmount()
})

const WITH_GAPS = ANALYSIS.replace(
  '</changes>',
  '</changes>\n<placeholders>\n[which file?] | Which file has the login bug? | auth.ts ; session.ts\n</placeholders>',
)

test('Fill in the gaps: a pick updates the rewrite, a typed answer wins, and Apply sends the filled rewrite', async ($, on) => {
  const { s } = world(on, { analysis: WITH_GAPS })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  // No "Fill in the gaps" heading since v0.26.0; the question shows on its own.
  expect(await ui.find({ text: 'Fill in the gaps' })).toBeUndefined()
  expect(await ui.find({ text: 'Which file has the login bug?' })).toBeDefined()
  expect(await ui.find({ type: 'Select', key: 'gap-1-0-pick' })).toBeDefined()

  // A redraw (the pane taking focus) keeps the fields' handles, as it does the buttons'.
  const before = [handleOf(await ui.drawn(), 'gap-1-0-pick'), handleOf(await ui.drawn(), 'gap-1-0-type')]
  expect(before.every(h => typeof h === 'number')).toBe(true)
  await ui.redraw({ ...pane('desktop').props, isFocused: true })
  expect([handleOf(await ui.drawn(), 'gap-1-0-pick'), handleOf(await ui.drawn(), 'gap-1-0-type')]).toEqual(before)

  await ui.select({ key: 'gap-1-0-pick', value: 'session.ts' })
  expect(await ui.find({ type: REWRITE, text: 'Fix the login bug in session.ts.' })).toBeDefined()

  // Typed without Enter: the rewrite box waits, but Apply uses it.
  await ui.input({ key: 'gap-1-0-type', text: 'auth/login.ts', kind: 'change' })
  expect(await ui.find({ type: REWRITE, text: 'Fix the login bug in session.ts.' })).toBeDefined()
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
  expect(await ui.find({ type: REWRITE, text: 'Fix the login bug in auth.ts.' })).toBeDefined()

  s.box = 'fix the login thing again'
  await ui.press({ key: 'analyze' })
  expect(await ui.find({ type: 'Input', key: 'gap-2-0-type' })).toBeDefined()
  expect(await ui.find({ type: REWRITE, text: '[which file?]' })).toBeDefined()
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
  expect(await ui.find({ type: REWRITE, text: 'Fix the login bug' })).toBeUndefined()
  expect(await ui.find({ type: REWRITE, text: 'Done means the login test passes.' })).toBeDefined()
  expect(await ui.find({ text: /Removed from the rewrite, with its sentence/ })).toBeDefined()

  // A pick brings it back, filled in.
  await ui.select({ key: 'gap-1-0-pick', value: 'auth.ts' })
  expect(await ui.find({ type: REWRITE, text: 'Fix the login bug in auth.ts.' })).toBeDefined()
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
  expect(await ui.find({ type: REWRITE, text: 'Fix the login bug in session.ts.' })).toBeDefined()
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
  expect(await ui.find({ text: /Still in brackets: \[which file\?\]\. Send leaves them as they are\./ })).toBeDefined()
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  // The rewrite can't be edited there, so it shows as text.
  expect(await ui.find({ type: 'Code', text: 'Fix the login bug in [which file?].' })).toBeDefined()
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
  // Suggestions show in their own list after the gap questions (v0.26.0), not in the checklist.
  expect(await ui.find({ text: 'Other suggestions' })).toBeUndefined()
  expect(await ui.find({ key: 'suggestions' })).toBeDefined()
  expect(await ui.find({ text: 'Say when to stop' })).toBeDefined()

  await ui.press({ key: 'add-1-0' })
  expect(await ui.find({ type: REWRITE, text: 'Done means the login test passes. Stop and ask me before deleting anything.' })).toBeDefined()
  expect(await ui.find({ key: 'add-1-0', text: 'Remove' })).toBeDefined()
  await ui.press({ key: 'add-1-0' })
  expect(await ui.find({ type: REWRITE, text: 'Stop and ask me' })).toBeUndefined()

  await ui.press({ key: 'add-1-0' })
  await ui.select({ key: 'gap-1-0-pick', value: 'auth.ts' })
  await ui.press({ key: 'apply' })
  expect(s.submitted[0]?.text).toBe('Fix the login bug in auth.ts. Done means the login test passes. Stop and ask me before deleting anything.')
  await ui.unmount()
})

editTest('the rewrite is a field you can edit: Apply sends your text, gaps and Add still work on it, and a new analysis starts afresh', async ($, on) => {
  const { s } = world(on, { analysis: WITH_ADDITIONS })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  const field = await ui.find({ type: 'Input', text: 'Fix the login bug in [which file?]. Done means the login test passes.' })
  expect(field?.key).toMatch(/^rewrite-/)
  expect(field?.props.submitLabel).toBe('keep')
  const key = field!.key!

  // Typing is only noted, with no redraw under the cursor; Enter keeps it and draws the field with it.
  const mine = 'Fix the login bug in [which file?] without touching the tests. Done means the login test passes.'
  await ui.input({ key, text: mine, kind: 'change' })
  expect((await ui.find({ type: 'Input', text: 'without touching the tests' }))).toBeUndefined()
  await ui.input({ key, text: mine })
  expect((await ui.find({ type: 'Input', text: 'without touching the tests' }))?.key).not.toBe(key)

  // A gap still in the edited text is filled in it; the field shows the result under a new key.
  await ui.select({ key: 'gap-1-0-pick', value: 'auth.ts' })
  expect(await ui.find({ type: 'Input', text: 'Fix the login bug in auth.ts without touching the tests.' })).toBeDefined()
  // Add and Remove change the edited text.
  await ui.press({ key: 'add-1-0' })
  expect(await ui.find({ type: 'Input', text: 'without touching the tests. Done means the login test passes. Stop and ask me before deleting anything.' })).toBeDefined()
  await ui.press({ key: 'add-1-0' })
  expect(await ui.find({ type: 'Input', text: 'Stop and ask me' })).toBeUndefined()
  await ui.press({ key: 'add-1-0' })

  await ui.press({ key: 'apply' })
  expect(s.submitted[0]?.text).toBe('Fix the login bug in auth.ts without touching the tests. Done means the login test passes. Stop and ask me before deleting anything.')

  // Typing a suggestion's sentence in by hand counts it as added.
  s.box = 'fix the login thing again'
  await ui.press({ key: 'analyze' })
  expect(await ui.find({ type: 'Input', text: 'without touching the tests' })).toBeUndefined()
  expect(await ui.find({ type: 'Input', text: 'Fix the login bug in [which file?]. Done means the login test passes.' })).toBeDefined()
  const fresh = (await ui.find({ type: 'Input', text: 'Fix the login bug in [which file?]' }))!.key!
  await ui.input({ key: fresh, text: 'Fix it. Stop and ask me before deleting anything.' })
  expect(await ui.find({ key: 'add-2-0', text: 'Remove' })).toBeDefined()
  await ui.unmount()
})

const MERGED = WITH_GAPS.replace(
  '<placeholders>',
  '<additions>\nStop rule | Say when to stop | Stop and ask me before deleting anything.\nOutput | Ask for a summary | End with a two-line summary.\nOther | Mention the branch | Work on the main branch.\n</additions>\n<placeholders>',
)

test('suggestions to add sit right after the gap questions, in the analysis order, and the checklist has none', async ($, on) => {
  const { s } = world(on, { analysis: MERGED })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  expect(await ui.find({ text: 'Suggestions you can add' })).toBeUndefined()

  const order = (await ui.findAll({})).filter(el => ['Text', 'Button'].includes(el.type)).map(el => el.text ?? '')
  const at = (t: string) => order.indexOf(t)
  // After the gap question, before the checklist, in the analysis order.
  expect(at('Suggestion: Say when to stop')).toBeGreaterThan(at('Which file has the login bug?'))
  expect(at('Suggestion: Ask for a summary')).toBeGreaterThan(at('Suggestion: Say when to stop'))
  expect(at('Suggestion: Mention the branch')).toBeGreaterThan(at('Suggestion: Ask for a summary'))
  expect(at('Suggestion: Mention the branch')).toBeLessThan(at('Checklist'))
  // The checklist itself has no suggestions any more, and no Other suggestions row.
  expect(at('Other suggestions')).toBe(-1)
  expect(JSON.stringify(boxNode(await ui.drawn(), 'group-checklist'))).not.toContain('Suggestion:')
  expect(await ui.find({ text: 'no file or error named' })).toBeDefined()

  // Add from the merged view works as before.
  await ui.press({ key: 'add-1-0' })
  expect(await ui.find({ type: REWRITE, text: 'Stop and ask me before deleting anything.' })).toBeDefined()
  expect(await ui.find({ key: 'add-1-0', text: 'Remove' })).toBeDefined()
  await ui.unmount()
})

const FIXED = MERGED.replace(
  '<changes>\nName the finish line | The assistant knows when to stop.',
  '<changes>\nDone means | Naming the finish line tells it when the work is complete.\nclarity | "Remove completely" spells out what remove means.',
)

test('the checklist sits in one box like a Settings section: an item per row, a line between rows, the note beside the name', async ($, on) => {
  const { s } = world(on, { analysis: FIXED })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  const tree = await ui.drawn()
  expect(boxNode(tree, 'group-checklist')?.props).toMatchObject({ borderStyle: 'round', borderColor: 'subtle' })
  const keys = boxNode(tree, 'group-checklist-box')!.kids.map(k => (k as { props?: { key?: string } }).props?.key)
  expect(keys).toEqual([
    'check-Goal', 'line-checklist-1', 'check-Context', 'line-checklist-2', 'check-Constraints', 'line-checklist-3',
    'check-Done means', 'line-checklist-4', 'check-Stop rule', 'line-checklist-5', 'check-Output', 'line-checklist-6',
    'other-changes',
  ])
  // The mark, name and note on one row (v0.24.0).
  const itemRow = boxNode(tree, 'check-Context-row')!
  expect(itemRow.props.flexDirection).toBe('row')
  // Top-aligned, so the mark and name sit at the first line of a wrapped note (v0.26.2).
  expect(itemRow.props.alignItems).toBe('flex-start')
  expect(JSON.stringify(itemRow)).toContain('"Context"')
  expect(JSON.stringify(itemRow)).toContain('no file or error named')
  expect(boxNode(tree, 'check-Context-head')).toBeUndefined()
  // Suggestions say so, apart from the rewrite's own changes.
  expect(await ui.find({ text: 'Suggestion: Say when to stop' })).toBeDefined()
  await ui.unmount()
})

test('each change the rewrite made sits under the item it fixes, and the rest under Other changes', async ($, on) => {
  const { s } = world(on, { analysis: FIXED })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  const order = (await ui.findAll({})).filter(el => ['Text', 'Button'].includes(el.type)).map(el => el.text ?? '')
  const at = (t: string) => order.indexOf(t)
  // Done means (missing in the draft) shows the rewrite's fix right under it, before the next item.
  expect(at('Naming the finish line tells it when the work is complete.')).toBeGreaterThan(at('no finish line'))
  expect(at('Naming the finish line tells it when the work is complete.')).toBeLessThan(at('Stop rule'))
  expect(order[at('Naming the finish line tells it when the work is complete.') - 1]).toBe('Rewrite')
  // Changes named like no item (any case) go under Other changes, after the items.
  expect(at('Other changes')).toBeGreaterThan(at('a fix'))
  expect(at('clarity')).toBeGreaterThan(at('Other changes'))
  expect(at('Remove "think step by step"')).toBeGreaterThan(at('Other changes'))
  expect(await ui.find({ text: 'The rewrite made no changes.' })).toBeUndefined()
  await ui.unmount()
})

test('a rewrite with no changes says so under the checklist', async ($, on) => {
  const { s } = world(on, { analysis: ANALYSIS.replace(/<changes>[\s\S]*<\/changes>/, '<changes>\nNone | The draft already works.\n</changes>') })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  expect(await ui.find({ text: 'The rewrite made no changes.' })).toBeDefined()
  expect(await ui.find({ text: 'Other changes' })).toBeUndefined()
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

test('switching model changes the label and rules while the pane is open', async ($, on) => {
  const { s, clock } = world(on)
  await $.session.start(START)
  await $.command.run(coach())
  s.model = 'sonnet'
  await clock.advance(5000)
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  // The model's rules start closed (v0.17.4); Show opens them.
  expect(await ui.find({ key: 'rules-model-list' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-toggle-model', text: 'Show' })).toBeDefined()
  await ui.press({ key: 'rules-toggle-model' })
  expect(await ui.find({ key: 'rules-model-list', text: 'Ask for a real check.' })).toBeDefined()
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

test('/coach refresh is gone (v0.40.0): it answers with the usage, and its stored proposal and fingerprints are deleted', async ($, on) => {
  const { s, saved } = world(on, { saved: { pendingRefresh: { results: [], seen: {} }, sourceFingerprints: { 'https://docs.example/general': 'x' } } })
  await $.session.start(START)
  expect(saved.has('pendingRefresh')).toBe(false)
  expect(saved.has('sourceFingerprints')).toBe(false)
  expect(await $.command.run(coach('refresh'))).toMatchObject({ text: 'Usage: /coach, /coach live, or /coach manual.' })
  expect(s.fetched).toHaveLength(0)
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
  title: 'News 42',
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

test('Week: editions stored as Claude Week NN are renamed News NN once, at session start, and nothing else in them changes (v0.41.0)', async ($, on) => {
  const old = storedEdition().weekEditions['2026-W42']
  const { saved, ui } = await weekPane($, on, { saved: { weekEditions: { '2026-W42': { ...old, title: 'Claude Week 42' } } } })
  expect((saved.get('weekEditions') as Record<string, { title: string }>)['2026-W42']).toEqual({ ...old, title: 'News 42' })
  expect(await ui.find({ text: /Claude Week/ })).toBeUndefined()
  expect(await ui.find({ text: /News 42/ })).toBeDefined()
  await ui.unmount()
})

test('Week: Write reads the source pages, asks the Week model once, and its answer becomes the edition', async ($, on) => {
  const { s, saved, ui } = await weekPane($, on)
  expect(await ui.find({ text: /No edition yet/ })).toBeDefined()
  expect(buttonProps(await ui.drawn(), 'week-write')?.label).toBe('Write News 42')
  await ui.press({ key: 'week-write' })

  expect(s.fetched).toEqual(['https://news.example/', 'https://tracker.example/broken'])
  expect(s.weekRequests).toHaveLength(1)
  const req = s.weekRequests[0]!
  expect(req.model).toBe('opus')
  expect(req.system).toContain("this week's edition of News")
  expect(req.prompt).toContain('Today is 2026-10-17. Write edition 2026-W42')
  expect(req.prompt).toContain('uses_claude_code: daily, in the desktop app')
  expect(req.prompt).toContain('<page tier="1" label="Newsroom" url="https://news.example/">\nPAGE https://news.example/\n</page>')
  expect(req.prompt).toContain('<unread>\nTracker <https://tracker.example/broken>: HTTP 404\n</unread>')

  expect(Object.keys(saved.get('weekEditions') as object)).toEqual(['2026-W42'])
  expect(saved.has('weekJob')).toBe(false)
  expect(s.toasts.at(-1)).toContain('News 42 is ready in the coach pane\'s News tab')
  // The header card's title, as the Stitch design draws it (v0.35.0).
  expect(await ui.find({ text: '> News 42 · Oct 10 – Oct 17' })).toBeDefined()
  expect(await ui.find({ text: /From your feedback: Shortened release stories/ })).toBeDefined()
  // No Top 3 card since v0.41.1.
  expect(boxNode(await ui.drawn(), 'week-top3')).toBeUndefined()
  expect(await ui.find({ text: /TOP 3/ })).toBeUndefined()
  expect(await ui.find({ text: '0 / 2 stories read (0%)' })).toBeDefined()
  expect(await ui.find({ text: /Nothing new for Claude Desktop/ })).toBeDefined()
  expect(await ui.find({ type: 'Link', text: 'Claude Code v2.1.299 release notes' })).toBeDefined()
  // This week's edition exists, so there's nothing to write.
  expect(buttonProps(await ui.drawn(), 'week-write')).toBeUndefined()
  await ui.unmount()
})

const REDO_FEEDBACK = {
  '2026-W42-idle': { story_id: '2026-W42-idle', edition_id: '2026-W42', section: 'code', title: 'Idle compaction', verdict: 'up', why: 'useful', take: null, updated_at: '2026-10-17T08:00:00Z' },
  '2026-W41-old': { story_id: '2026-W41-old', edition_id: '2026-W41', section: 'code', title: 'Last week', verdict: 'down', why: 'too long', take: null, updated_at: '2026-10-10T08:00:00Z' },
}

test('Week: the top line shows the Claude Code version this session runs and the Desktop version Desktop passes', async ($, on) => {
  const { ui } = await weekPane($, on, { engine: '2.1.304', desktopEnv: '3.1623.0' })
  expect(await ui.find({ key: 'week-versions', text: 'Claude Code 2.1.304 · Claude Desktop 3.1623.0' })).toBeDefined()
  await ui.unmount()
})

test('Week: with no Desktop version passed (a terminal session), the app\'s Info.plist gives it, or it says not found', async ($, on) => {
  const plist = '<?xml version="1.0"?><plist><dict><key>CFBundleShortVersionString</key><string>3.1600.0</string></dict></plist>'
  const found = await weekPane($, on, { engine: '2.1.302', files: { '/Applications/Claude.app/Contents/Info.plist': plist } }, 'terminal')
  expect(await found.ui.find({ key: 'week-versions', text: 'Claude Code 2.1.302 · Claude Desktop 3.1600.0' })).toBeDefined()
  await found.ui.unmount()
})

test('Week: no Desktop version and no Info.plist reads as not found', async ($, on) => {
  const { ui } = await weekPane($, on, { engine: '2.1.302' }, 'terminal')
  expect(await ui.find({ key: 'week-versions', text: 'Claude Code 2.1.302 · Claude Desktop not found' })).toBeDefined()
  await ui.unmount()
})

test('Week: each story sits in its own box; a section has its title band and no box (v0.32.0)', async ($, on) => {
  const { ui } = await weekPane($, on, { saved: { ...storedEdition(), weekRead: { '2026-W42-haiku': true } } })
  const tree = await ui.drawn()
  const section = boxNode(tree, 'group-week-code')!
  expect(section.props.borderStyle).toBeUndefined()
  // The section title: uppercase in clay with its range, on no band (v0.35.0).
  expect((section.kids[0] as { props: Record<string, unknown> }).props.backgroundColor).toBeUndefined()
  expect(JSON.stringify(section.kids[0])).toContain('CLAUDE CODE')
  for (const id of ['story-2026-W42-idle', 'story-2026-W42-haiku']) {
    expect(boxNode(tree, id)?.props).toMatchObject({ borderStyle: 'round', borderColor: 'subtle', paddingX: 'md', paddingY: 'sm' })
  }
  // Room between a story's parts, and between the stories (v0.33.2).
  expect(boxNode(tree, 'story-2026-W42-idle')?.props.gap).toBe('sm')
  expect(section.props.gap).toBe('md')
  await ui.unmount()
})

/** The writer's answer: Idle compaction again (same title and link), a new Claude Code story under Haiku's old id, and a Desktop story. */
function updateAnswer(): string {
  const e = JSON.parse(WEEK_ANSWER)
  e.intro = 'A different intro that must not replace the old one.'
  const code = e.sections.find((x: { id: string }) => x.id === 'code')
  // The fresh answer drops Haiku and reuses its id for a new story: Haiku stays, and the new one gets another id.
  code.stories = code.stories.filter((x: { id: string }) => x.id !== '2026-W42-haiku')
  code.stories.push({ id: '2026-W42-haiku', title: 'Storage in Settings', summary: 'Settings shows disk space.', links: [{ label: 'Desktop notes', url: 'https://claude.com/docs/cowork/changelog' }], detail: null, ask: null, prompt: null })
  e.sections.push({ id: 'desktop', title: 'Claude Desktop', range: 'v3.1623.0', note: null, stories: [{ id: '2026-W42-desk', title: 'Desktop v3.1623.0', summary: 'Oct 20: Storage in Settings.', links: [{ label: 'Desktop notes', url: 'https://claude.com/docs/cowork/changelog' }], detail: null, ask: null, prompt: null }] })
  return JSON.stringify(e)
}

test('Week: a tip says which story it comes from and links that story\'s source (v0.34.0)', async ($, on) => {
  const e = JSON.parse(WEEK_ANSWER)
  e.sections.push({ id: 'tips', title: 'Try this week', range: null, note: null, stories: [
    { id: '2026-W42-tip-idle', title: 'Leave a long session idle once', summary: 'See what idle compaction does.', links: [{ label: 'Claude Code v2.1.299 release notes', url: 'https://github.com/anthropics/claude-code/releases/tag/v2.1.299' }], detail: null, ask: null, prompt: null, based_on: '2026-W42-idle' },
  ] })
  const r = parseEdition(JSON.stringify(e), '2026-W42')
  if (!('edition' in r)) throw new Error(r.reason)
  const { ui } = await weekPane($, on, { saved: { weekEditions: { '2026-W42': r.edition } } })
  const tip = JSON.stringify(boxNode(await ui.drawn(), 'story-2026-W42-tip-idle'))
  expect(tip).toContain('From the story \\"Idle compaction\\" in Claude Code')
  expect(tip).toContain('https://github.com/anthropics/claude-code/releases/tag/v2.1.299')
  // Other stories carry no such line.
  expect(JSON.stringify(boxNode(await ui.drawn(), 'story-2026-W42-idle'))).not.toContain('From the story')
  await ui.unmount()
})

test('Week: the Stitch look: SYS line, header card, reading card (no Top 3 since v0.41.1), tag and version, code chips, ask box, REF links, end line (v0.35.0)', async ($, on) => {
  const e = JSON.parse(WEEK_ANSWER)
  const idle = e.sections.find((x: { id: string }) => x.id === 'code').stories[0]
  Object.assign(idle, { tag: 'new feature // cli-agent', version: 'v2.1.299', summary: 'v2.1.299 (Oct 14) adds `/compact` when idle.\n\nv2.1.298 set `CLAUDE_X`.', ask: 'Would you want it?' })
  const r = parseEdition(JSON.stringify(e), '2026-W42')
  if (!('edition' in r)) throw new Error(r.reason)
  const { ui } = await weekPane($, on, { saved: { weekEditions: { '2026-W42': r.edition }, weekRead: { '2026-W42-haiku': true } }, engine: '2.1.304', desktopEnv: '3.1623.0' })
  const tree = await ui.drawn()
  const head = JSON.stringify(boxNode(tree, 'week-head'))
  for (const part of ['SYS: ', 'Claude Code 2.1.304 · Claude Desktop 3.1623.0', '> ', 'Idle compaction lands.']) expect(head).toContain(part)
  expect(boxNode(tree, 'week-head')?.props.borderStyle).toBe('round')
  // The Top 3 card was removed in v0.41.1.
  expect(boxNode(tree, 'week-top3')).toBeUndefined()
  expect(JSON.stringify(boxNode(tree, 'week-progress'))).toContain('1 / 2 stories read (50%)')
  // The story: its tag uppercased, the version badge, paragraphs, code chips, the ask box and REF links.
  const card = JSON.stringify(boxNode(tree, 'story-2026-W42-idle'))
  expect(card).toContain('NEW FEATURE // CLI-AGENT')
  expect(JSON.stringify(boxNode(tree, 'story-version-2026-W42-idle'))).toContain('v2.1.299')
  // Code is clay with no background (v0.36.1), and the tag is plain amber, not dimmed.
  expect(card).toContain('{"color":"claude"},"children":["/compact"]')
  expect(card).not.toContain('"backgroundColor":"subtle"},"children":["/compact"]')
  expect(card).toContain('"color":"warning","size":"footnote"')
  expect(card).not.toMatch(/"color":"warning","dimColor":true,"size":"footnote"/)
  expect(card).toContain('CLAUDE_X')
  expect(JSON.stringify(boxNode(tree, 'ask-2026-W42-idle'))).toContain('? ASK YOURSELF:')
  expect(card).toContain('REF:')
  expect(card).toContain('release notes ↗')
  expect(await ui.find({ text: '[ END OF STREAM ]' })).toBeDefined()
  await ui.unmount()
})

test('Week: Rewrite on an existing week runs at once, keeps everything and adds only the stories it lacks', async ($, on) => {
  const { s, saved, ui } = await weekPane($, on, { saved: { ...storedEdition(), weekFeedback: REDO_FEEDBACK, weekRead: { '2026-W42-idle': true } }, weekAnswer: updateAnswer() })
  expect(buttonProps(await ui.drawn(), 'week-write')).toBeUndefined()
  expect(buttonProps(await ui.drawn(), 'week-redo')?.label).toBe(':rewrite News 42')

  // One press runs it: no confirm (v0.33.1).
  await ui.press({ key: 'week-redo' })
  expect(await ui.find({ key: 'week-redo-ask' })).toBeUndefined()
  expect(s.weekRequests).toHaveLength(1)
  // This week's feedback is sent too: nothing of it is dropped.
  expect(s.weekRequests[0]!.prompt).toContain('2026-W42-idle')
  const ed = (saved.get('weekEditions') as Record<string, Edition>)['2026-W42']!
  // The old intro, stories and their ids stay; the story with the same title and link isn't added twice.
  expect(ed.intro).toBe('Idle compaction lands.')
  const code = ed.sections.find(x => x.id === 'code')!.stories.map(x => [x.id, x.title])
  expect(code).toEqual([['2026-W42-idle', 'Idle compaction'], ['2026-W42-haiku', 'Haiku default'], ['2026-W42-haiku-2', 'Storage in Settings']])
  // The empty Desktop section takes the new story, its range and its note.
  const desk = ed.sections.find(x => x.id === 'desktop')!
  expect(desk.stories.map(x => x.title)).toEqual(['Desktop v3.1623.0'])
  expect(desk.range).toBe('v3.1623.0')
  expect(desk.note).toBeNull()
  // Votes, reasons and read marks all stay.
  expect(Object.keys(saved.get('weekFeedback') as object).sort()).toEqual(['2026-W41-old', '2026-W42-idle'])
  expect(saved.get('weekRead')).toEqual({ '2026-W42-idle': true })
  expect(s.toasts.at(-1)).toBe('Added 2 new stories to News 42.')
  await ui.unmount()
})

test('Week: a Rewrite that finds nothing new leaves the week exactly as it was', async ($, on) => {
  const { s, saved, ui } = await weekPane($, on, { saved: { ...storedEdition(), weekRead: { '2026-W42-idle': true } } })
  const before = JSON.stringify(storedEdition().weekEditions['2026-W42'])
  await ui.press({ key: 'week-redo' })
  expect(s.weekRequests).toHaveLength(1)
  expect(saved.has('weekEditions') ? JSON.stringify((saved.get('weekEditions') as Record<string, Edition>)['2026-W42']) : before).toBe(before)
  expect(saved.get('weekRead')).toEqual({ '2026-W42-idle': true })
  expect(s.toasts.at(-1)).toBe("No new stories for News 42; it's unchanged.")
  await ui.unmount()
})

test('Week: a rewrite that fails keeps this week\'s edition, votes and read marks, and offers to try again', async ($, on) => {
  const { saved, ui } = await weekPane($, on, { saved: { ...storedEdition(), weekFeedback: REDO_FEEDBACK, weekRead: { '2026-W42-idle': true } }, weekAnswer: 'I could not reach the sources.' })
  await ui.press({ key: 'week-redo' })
  expect(await ui.find({ text: /Couldn't write News 42/ })).toBeDefined()
  expect(await ui.find({ text: 'Idle compaction lands.' })).toBeDefined()
  expect(Object.keys(saved.get('weekFeedback') as object).sort()).toEqual(['2026-W41-old', '2026-W42-idle'])
  expect(saved.get('weekRead')).toEqual({ '2026-W42-idle': true })
  expect(buttonProps(await ui.drawn(), 'week-redo')?.label).toBe('Try the rewrite again')
  await ui.unmount()
})

test('Week: Rewrite shows only on this week\'s edition, not on an older one', async ($, on) => {
  const w41 = parseEdition(WEEK_ANSWER.replaceAll('2026-W42', '2026-W41').replace('News 42', 'News 41'), '2026-W41')
  if (!('edition' in w41)) throw new Error(w41.reason)
  const { ui } = await weekPane($, on, { saved: { weekEditions: { ...storedEdition().weekEditions, '2026-W41': w41.edition } } })
  expect(buttonProps(await ui.drawn(), 'week-redo')).toBeDefined()
  await ui.press({ key: 'week-older' })
  expect(buttonProps(await ui.drawn(), 'week-redo')).toBeUndefined()
  await ui.unmount()
})

test('Week: an answer that is not an edition says why and offers Try again', async ($, on) => {
  const { s, saved, ui } = await weekPane($, on, { weekAnswer: 'I could not reach the sources.' })
  await ui.press({ key: 'week-write' })
  expect(await ui.find({ text: /Couldn't write News 42: the answer couldn't be read as an edition/ })).toBeDefined()
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
  const job = { state: 'running', title: 'News 42', startedAt: Date.parse('2026-10-17T08:59:00Z'), progress: 'Writing…', editionId: '2026-W42' }
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

  // The prompt box gets /btw with the prompt and the story it's about, with no leading space (v0.31.1). Nothing is sent: Omar sends it.
  expect(buttonProps(await ui.drawn(), 'aside-2026-W42-idle')?.label).toBe('Ask in side chat')
  await ui.press({ key: 'aside-2026-W42-idle' })
  expect(s.box).toBe(
    '/btw Explain idle compaction.\n\nThis is about the News story "Idle compaction".\n\nv2.1.299 (Oct 14) adds idle compaction.\n\nTerminal only.\n\nSources: https://github.com/anthropics/claude-code/releases/tag/v2.1.299',
  )
  // No toast telling Omar to press Enter (v0.33.4).
  expect(s.toasts.some(t => /Press Enter/.test(t))).toBe(false)
  await ui.press({ key: 'week-q-aside-2026-W42-0' })
  // Paragraphs are separated by a blank line (v0.31.2).
  expect(s.box).toBe('/btw Audit my hooks.\n\nFrom the questions in News 42: "Which hooks enforce a rule?"')
  expect(s.submitted).toEqual([])
  // A story with no prompt has the button too (v0.33.3), and its title is the question.
  expect(buttonProps(await ui.drawn(), 'aside-2026-W42-haiku')?.label).toBe('Ask in side chat')
  await ui.press({ key: 'aside-2026-W42-haiku' })
  expect(s.box).toBe('/btw Haiku default\n\nThis is about the News story "Haiku default".\n\nOct 15: Haiku 5.5 is the default.')
  expect(s.submitted).toEqual([])

  await ui.press({ key: 'read-2026-W42-idle' })
  expect(saved.get('weekRead')).toEqual({ '2026-W42-idle': true })
  // Folded to a green check and the dim title (v0.35.0).
  expect(JSON.stringify(boxNode(await ui.drawn(), 'story-2026-W42-idle'))).toMatch(/✓ .*Idle compaction/)
  expect(await ui.find({ text: '1 / 2 stories read (50%)' })).toBeDefined()
  // A chip per section (v0.35.0), clay while partly read.
  expect(await ui.find({ text: 'Claude Code: 1/2' })).toBeDefined()
  expect(boxNode(await ui.drawn(), 'week-chip-code')?.props.borderColor).toBe('claude')
  expect(buttonProps(await ui.drawn(), 'up-2026-W42-idle')).toBeUndefined()
  await ui.press({ key: 'read-2026-W42-idle' })
  expect(saved.get('weekRead')).toEqual({})
  expect(await ui.find({ text: '0 / 2 stories read (0%)' })).toBeDefined()
  await ui.unmount()
})

test('Week: Older and Newer step through the stored editions', async ($, on) => {
  const older = parseEdition(WEEK_ANSWER.replace('News 42', 'News 41'), '2026-W41') as { edition: unknown }
  const { ui } = await weekPane($, on, { saved: { weekEditions: { ...storedEdition().weekEditions, '2026-W41': older.edition } } })
  expect(buttonProps(await ui.drawn(), 'week-newer')).toBeUndefined()
  await ui.press({ key: 'week-older' })
  expect(await ui.find({ text: /^> News 41/ })).toBeDefined()
  expect(buttonProps(await ui.drawn(), 'week-older')).toBeUndefined()
  await ui.press({ key: 'week-newer' })
  expect(await ui.find({ text: /^> News 42/ })).toBeDefined()
  await ui.unmount()
})

test('Settings: News (titled Claude Week until v0.40.4) holds the News model, the reader profile and the pages Write reads; the News tab has no footer', async ($, on) => {
  world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  const tree = await ui.drawn()
  const week = JSON.stringify(boxNode(tree, 'group-week'))
  expect(week).toContain('"set-weekModel"')
  expect(week).toContain('News model')
  expect(week).not.toContain('Claude Week')
  expect(JSON.stringify(boxNode(tree, 'group-general'))).not.toContain('set-weekModel')
  expect(week).toContain('Reader profile')
  expect(week).toContain(PROFILE)
  expect(await ui.find({ type: 'Link', text: 'Tier 1 · Newsroom' })).toBeDefined()
  expect(await ui.find({ type: 'Link', text: 'Tier 2 · Tracker' })).toBeDefined()
  await ui.press({ key: 'tab-week' })
  expect(await ui.find({ text: /Written by/ })).toBeUndefined()
  expect(await ui.find({ text: /Settings → News/ })).toBeDefined()
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
  expect(s.written.get(PROFILE)).toBe('# News reader profile.\nname:\n')
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ text: /blank profile was created here/ })).toBeDefined()
  expect(JSON.stringify(boxNode(await ui.drawn(), 'group-week'))).toContain(PROFILE)
  await ui.unmount()
})

test('Week: Archive lists every edition with its counts, and Open shows an older one as it was, still editable', async ($, on) => {
  const older = parseEdition(WEEK_ANSWER.replaceAll('2026-W42', '2026-W41').replace('News 42', 'News 41'), '2026-W41') as { edition: unknown }
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
  expect(await ui.find({ text: /^News 42 · .* \(showing\)$/ })).toBeDefined()
  expect(await ui.find({ text: '0 of 2 read · 0 voted' })).toBeDefined()
  expect(await ui.find({ text: /^News 41 · / })).toBeDefined()
  expect(await ui.find({ text: '1 of 2 read · 1 voted' })).toBeDefined()
  expect(buttonProps(await ui.drawn(), 'up-2026-W42-idle')).toBeUndefined()

  await ui.press({ key: 'week-open-2026-W41' })
  expect(await ui.find({ text: /^> News 41/ })).toBeDefined()
  expect(buttonLook(await ui.drawn(), 'up-2026-W41-idle')?.variant).toBe('primary')
  expect(await ui.find({ type: 'Input', key: 'take-field-2026-W41-idle' })).toBeDefined()
  // Folded to a green check and the dim title (v0.35.0).
  expect(JSON.stringify(await ui.drawn())).toMatch(/✓ .{0,200}Haiku default/)

  // Feedback on an older week saves like any other.
  await ui.press({ key: 'up-2026-W41-idle' })
  expect((saved.get('weekFeedback') as Record<string, { verdict: string | null; take: string }>)['2026-W41-idle']).toMatchObject({ verdict: null, take: 'worth trying' })

  await ui.press({ key: 'week-archive' })
  await ui.press({ key: 'week-archive-back' })
  expect(await ui.find({ text: /^> News 41/ })).toBeDefined()
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
  expect(s.copied[0]).toMatch(/^\/btw Explain idle compaction\.\n\nThis is about the News story/)
  expect(s.toasts.at(-1)).toContain("Couldn't put the side question in the prompt box, so it's on the clipboard")
  await ui.unmount()
})

// ---- Statistics, removed in v0.39.0 ----

test('Statistics: the stored statistics, current and before v0.11.0, are deleted when a session starts', async ($, on) => {
  const { saved } = world(on, { saved: { analytics: { drafts: [], tokens: {} }, lessons: { analyses: 80, gaps: { Goal: 3 }, rules: {}, recent: [] }, statsLayout: 'side' } })
  await $.session.start(START)
  expect(saved.has('analytics')).toBe(false)
  expect(saved.has('lessons')).toBe(false)
  expect(saved.has('statsLayout')).toBe(false)
})

test('Your rules: Settings lists the rules file in the data folder, and Remove takes a rule out of it and out of the analysis', async ($, on) => {
  const { s } = world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
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

test('Rules in Settings: General, then the model with its name a dropdown, both closed at first; no separate Checklist and no Your rules group', async ($, on) => {
  world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'tab-settings' })
  // The model's rules start closed (v0.17.4); Show opens them.
  expect(await ui.find({ key: 'rules-model-list' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-toggle-model', text: 'Show' })).toBeDefined()
  await ui.press({ key: 'rules-toggle-model' })
  // The first row of Settings' Rules section since v0.39.0 (on the Analytics tab before); Your rules has its own section (below Rules since v0.40.3).
  const items = boxNode(await ui.drawn(), 'block-rule-list')!
  expect(await ui.find({ text: 'Rules in use' })).toBeDefined()
  const groups = items.kids.map(k => (k as { props?: { key?: string } }).props?.key).filter(Boolean)
  expect(groups.filter(k => k!.startsWith('block-rules-'))).toEqual(['block-rules-general', 'block-rules-model'])
  expect(await ui.find({ key: 'rules-toggle-checklist' })).toBeUndefined()
  expect(await ui.find({ text: /^Checklist$/ })).toBeUndefined()
  // General starts closed; the session's model is picked in the dropdown and its rules are open.
  expect(await ui.find({ key: 'rules-general-list' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-toggle-general', text: 'Show' })).toBeDefined()
  expect((await ui.find({ type: 'Select', key: 'rules-model-opus-5-5.md' }))?.props?.value).toBe('opus-5-5.md')
  expect(await ui.find({ key: 'rules-pick-opus-5-5.md' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-model-list', text: 'Name the finish line.' })).toBeDefined()
  await ui.press({ key: 'rules-toggle-general' })
  expect(await ui.find({ key: 'rules-general-list', text: 'Be explicit.' })).toBeDefined()
  // Another model from the dropdown.
  // The list shows each model once it is picked, and the rules follow it.
  await ui.select({ key: 'rules-model-opus-5-5.md', value: 'sonnet-5-5.md' })
  expect((await ui.find({ type: 'Select', key: 'rules-model-sonnet-5-5.md' }))?.props?.value).toBe('sonnet-5-5.md')
  expect(await ui.find({ type: 'Select', key: 'rules-model-opus-5-5.md' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-model-list', text: 'Name the finish line.' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-model-list', text: 'Ask for a real check.' })).toBeDefined()
  await ui.select({ key: 'rules-model-sonnet-5-5.md', value: 'haiku-5-5.md' })
  expect((await ui.find({ type: 'Select', key: 'rules-model-haiku-5-5.md' }))?.props?.value).toBe('haiku-5-5.md')
  expect(await ui.find({ text: 'No rules found for Haiku 5.5.' })).toBeDefined()
  await ui.select({ key: 'rules-model-haiku-5-5.md', value: 'fable-5-1.md' })
  expect((await ui.find({ type: 'Select', key: 'rules-model-fable-5-1.md' }))?.props?.value).toBe('fable-5-1.md')
  await ui.select({ key: 'rules-model-fable-5-1.md', value: 'opus-5-5.md' })
  expect((await ui.find({ type: 'Select', key: 'rules-model-opus-5-5.md' }))?.props?.value).toBe('opus-5-5.md')
  expect(await ui.find({ key: 'rules-model-list', text: 'Name the finish line.' })).toBeDefined()
  expect(await ui.find({ key: 'rules-toggle-own' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-edit-own' })).toBeUndefined()
  await ui.unmount()
})

test('Rules in Settings: the mobile app picks the model with buttons; a model with no rule file says so', async ($, on) => {
  world(on, { model: 'claude-opus-4-1', surfaces: ['mobile'] })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('mobile'))
  await ui.press({ key: 'tab-settings' })
  // The model's rules start closed (v0.17.4); Show opens them.
  expect(await ui.find({ key: 'rules-model-list' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-toggle-model', text: 'Show' })).toBeDefined()
  await ui.press({ key: 'rules-toggle-model' })
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-pick-opus-5-5.md', text: 'Opus 5.5' })).toBeDefined()
  expect(await ui.find({ text: 'claude-opus-4-1 has no rules of its own, so only the general rules apply. Pick a model to read its rules.' })).toBeDefined()
  await ui.press({ key: 'rules-pick-opus-5-5.md' })
  expect(await ui.find({ key: 'rules-pick-opus-5-5.md', text: '[Opus 5.5]' })).toBeDefined()
  expect(await ui.find({ key: 'rules-model-list', text: 'Name the finish line.' })).toBeDefined()
  await ui.unmount()
})

test('Rewrite asks for low effort and marks the rules and target for the prompt cache, the draft after them (v0.38.0)', async ($, on) => {
  const { s } = world(on)
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  const call = s.analysisCalls[0]!
  expect(call.effort).toBe('low')
  expect(call.blocks).toHaveLength(2)
  expect(call.blocks![0]!.cache).toBe(true)
  expect(call.blocks![0]!.text).toContain('<prompting_rules>')
  expect(call.blocks![0]!.text).toContain('The prompt will be sent to: Opus 5.5')
  expect(call.blocks![0]!.text).not.toContain('fix the login thing')
  expect(call.blocks![1]!.cache).toBeUndefined()
  expect(call.blocks![1]!.text).toContain('<draft_prompt>\nfix the login thing\n</draft_prompt>')
  // Joined, the blocks are the request as before.
  expect(call.blocks!.map(b => b.text).join('')).toBe(s.analyses[0])
  await ui.unmount()
})

// ---- Quick instructions (v0.37.0) ----

const QUICK_GENERAL = '# General\n\n- Be explicit.\n\n## Quick instructions\n- Check it: Check the result works. Source: "Ask Claude to self-check"\n\n## Checklist\n- Goal: what outcome they want. Source: x\n'
const QUICK_OPUS = '# Opus\n\n- Name the finish line.\n\n## Quick instructions\n- Answer directly: Answer directly. Source: "Add when relevant"\n- Short why: Explain why you chose this in three sentences. Source: "Remove"\n- no colon here Source: x\n\n## Checklist\n- Goal: the whole task. Source: blog\n'

describe('quick instructions', () => {
  test('parseQuick reads "- Label: sentence. Source: …" lines; a line with no label is skipped', () => {
    expect(parseQuick(QUICK_OPUS)).toEqual([
      { label: 'Answer directly', text: 'Answer directly.', source: '"Add when relevant"' },
      { label: 'Short why', text: 'Explain why you chose this in three sentences.', source: '"Remove"' },
    ])
    expect(parseQuick('# None\n\n- A rule.\n')).toEqual([])
  })

  test('quickFor: the model file\'s own list, inheriting nothing, else general.md\'s', () => {
    expect(quickFor(QUICK_GENERAL, QUICK_OPUS).map(q => q.label)).toEqual(['Answer directly', 'Short why'])
    expect(quickFor(QUICK_GENERAL, '# Haiku\n\n- A rule.\n').map(q => q.label)).toEqual(['Check it'])
    expect(quickFor(QUICK_GENERAL).map(q => q.label)).toEqual(['Check it'])
  })

  test('withoutChecklist also leaves the quick instructions out of the rules sent with the draft', () => {
    const rules = withoutChecklist(QUICK_OPUS)
    expect(rules).toContain('Name the finish line.')
    expect(rules).not.toContain('Quick instructions')
    expect(rules).not.toContain('Answer directly')
    expect(rules).not.toContain('## Checklist')
  })

  test('withSentence adds after a space, after a new line in a text of several lines, or alone in an empty one', () => {
    expect(withSentence('fix the bug  ', 'Answer directly.')).toBe('fix the bug Answer directly.')
    expect(withSentence('fix\nthe bug', 'Answer directly.')).toBe('fix\nthe bug\nAnswer directly.')
    expect(withSentence('', 'Answer directly.')).toBe('Answer directly.')
  })
})

test('Quick instructions: the session model\'s buttons sit above Rewrite; a press adds the line to the prompt box, another takes it out, with no analysis', async ($, on) => {
  const { s } = world(on, { files: { 'rules/general.md': QUICK_GENERAL, 'rules/opus-5-5.md': QUICK_OPUS } })
  s.box = 'why does the login fail?'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  const text = JSON.stringify(await ui.drawn())
  expect(text.indexOf('quick-0-Answer directly')).toBeGreaterThan(-1)
  expect(text.indexOf('quick-0-Answer directly')).toBeLessThan(text.indexOf('"analyze"'))
  expect(await ui.find({ key: 'quick-2-Check it' })).toBeUndefined()
  // One box, closed at first (v0.45.0): the buttons in a row, no sentences.
  expect(await ui.find({ text: 'A press adds the line to your prompt; Show lists what each adds.' })).toBeDefined()
  expect(await ui.find({ text: '+ Answer directly' })).toBeDefined()
  expect(await ui.find({ text: '+ Short why' })).toBeDefined()
  expect(await ui.find({ text: '\u201cAnswer directly.\u201d' })).toBeUndefined()
  // Show or Hide sits at the bottom of the box, after the buttons (v0.46.0).
  const quickText = JSON.stringify(boxNode(await ui.drawn(), 'quick'))
  expect(quickText.indexOf('"quick-toggle"')).toBeGreaterThan(quickText.indexOf('quick-1-Short why'))
  expect(JSON.stringify(boxNode(await ui.drawn(), 'quick-foot'))).toContain('"quick-toggle"')
  // Show draws each button on its own row, the sentence it adds beside it; Hide goes back.
  await ui.press({ key: 'quick-toggle' })
  const row = boxNode(await ui.drawn(), 'quick-1-row')
  expect(JSON.stringify(row)).toContain('quick-1-Short why')
  expect(JSON.stringify(row)).toContain('\u201cExplain why you chose this in three sentences.\u201d')
  expect(JSON.stringify(boxNode(await ui.drawn(), 'quick-0-row'))).toContain('\u201cAnswer directly.\u201d')
  expect(await ui.find({ text: 'A press adds the line to your prompt; press again to take it out.' })).toBeDefined()
  await ui.press({ key: 'quick-toggle' })
  expect(boxNode(await ui.drawn(), 'quick-0-row')).toBeUndefined()
  expect(boxNode(await ui.drawn(), 'quick-buttons')).toBeDefined()

  await ui.press({ key: 'quick-0-Answer directly' })
  expect(s.box).toBe('why does the login fail? Answer directly.')
  expect(s.analyses).toHaveLength(0)
  expect(await ui.find({ text: 'why does the login fail? Answer directly.' })).toBeDefined()
  await ui.press({ key: 'quick-0-Answer directly' })
  expect(s.box).toBe('why does the login fail?')
  await ui.unmount()
})

test('Quick instructions: with a rewrite on screen a press adds the line to the rewrite, which Send sends; a new Rewrite clears it', async ($, on) => {
  const { s } = world(on, { files: { 'rules/general.md': QUICK_GENERAL, 'rules/opus-5-5.md': QUICK_OPUS } })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  const rewrite = parseAnalysis(ANALYSIS)!.rewrite
  expect(await ui.find({ text: 'A press adds the line to the rewrite; Show lists what each adds.' })).toBeDefined()
  await ui.press({ key: 'quick-1-Short why' })
  // The box is untouched; the rewrite carries the line.
  expect(s.box).toBe('fix the login thing')
  expect(JSON.stringify(await ui.drawn())).toContain(JSON.stringify(withSentence(rewrite, 'Explain why you chose this in three sentences.')).slice(1, -1))
  await ui.press({ key: 'apply' })
  expect(s.submitted[0]!.text).toBe(withSentence(rewrite, 'Explain why you chose this in three sentences.'))

  s.box = 'fix the login thing again'
  await ui.press({ key: 'analyze' })
  await ui.press({ key: 'apply' })
  expect(s.submitted[1]!.text).toBe(rewrite)
  await ui.unmount()
})

test('Quick instructions: a model with no list of its own gets general.md\'s; none at all draws no row', async ($, on) => {
  world(on, { model: 'claude-sonnet-5-5', files: { 'rules/general.md': QUICK_GENERAL } })
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ key: 'quick-0-Check it' })).toBeDefined()
  await ui.unmount()
})

test('Quick instructions: none in the rule files, no row', async ($, on) => {
  world(on)
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  expect(boxNode(await ui.drawn(), 'quick')).toBeUndefined()
  await ui.unmount()
})

test('Checklist from the rule files: Analyze judges by the model\'s own list, which shows as a section of its rules', async ($, on) => {
  const general = '# General\n\nAs of: 2026-10\n\n- Be explicit.\n\n## Checklist\n- Goal: what outcome they want. Source: "Be clear and direct"\n- Done means: how it will be checked. Source: "Ask Claude to self-check"\n'
  const opus = '# Opus\n\nAs of: 2026-09\n\n- Name the finish line.\n\n## Checklist\n- Goal: the whole task in one message. Source: blog\n- Done means: the finish line. Source: blog, "name the finish line"\n- Stop rule: when to stop and ask. Source: blog\n'
  const { s, saved } = world(on, { files: { 'rules/general.md': general, 'rules/opus-5-5.md': opus } })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  expect(s.analysisSystems[0]).toContain('- Done means: the finish line.')
  expect(s.analysisSystems[0]).toContain('- Stop rule: when to stop and ask.')
  expect(s.analysisSystems[0]).not.toContain('how it will be checked')
  // The rules go with the draft without their checklist: it is in the system prompt.
  expect(s.analyses[0]).toContain('Name the finish line.')
  expect(s.analyses[0]).not.toContain('## Checklist')

  await ui.press({ key: 'tab-settings' })
  // The model's rules start closed (v0.17.4); Show opens them.
  expect(await ui.find({ key: 'rules-model-list' })).toBeUndefined()
  expect(await ui.find({ key: 'rules-toggle-model', text: 'Show' })).toBeDefined()
  await ui.press({ key: 'rules-toggle-model' })
  expect(await ui.find({ key: 'rules-model-list', text: '**Checklist**' })).toBeDefined()
  expect(await ui.find({ key: 'rules-model-list', text: 'Stop rule: when to stop and ask. Source: blog' })).toBeDefined()
  expect(await ui.find({ text: '4 rules' })).toBeDefined()
  await ui.unmount()
})

test('A newer model borrows the newest older file of its family, and the pane says so under its rules', async ($, on) => {
  const { s } = world(on, { model: 'claude-opus-6' })
  s.box = 'fix the login thing'
  await $.session.start(START)
  await $.command.run(coach())
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'analyze' })
  expect(s.analyses[0]).toContain('Name the finish line.') // the Opus 5.5 file
  expect(s.analyses[0]).toContain('The prompt will be sent to: Opus 6')
  await ui.press({ key: 'tab-settings' })
  expect(await ui.find({ text: "No rules file for Opus 6 yet; it uses Opus 5.5's." })).toBeDefined()
  expect((await ui.find({ type: 'Select', key: 'rules-model-opus-5-5.md' }))?.props?.value).toBe('opus-5-5.md')
  await ui.unmount()
})
