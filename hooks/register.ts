import type { EngineInterface, Register, SessionMessage, Timer } from 'claude-code'

import {
  ANALYSIS_SYSTEM,
  type Analysis,
  LIVE_DEBOUNCE_MS,
  type Lessons,
  NO_LESSONS,
  SYSTEM,
  asLessons,
  answersFor,
  asOfDate,
  buildAnalysisRequest,
  buildRequest,
  NO_PICK,
  fillPlaceholders,
  removeSentences,
  withAdditions,
  isPersonPrompt,
  lastReply,
  liveSkipReason,
  parseAnalysis,
  parseReply,
  parseTips,
  recordLesson,
  rulesFor,
} from './lib.ts'
import {
  type Fingerprints,
  REFRESH_SYSTEM,
  type RefreshResult,
  asFingerprints,
  buildRefreshRequest,
  changedUrls,
  fingerprint,
  lineDiff,
  parseRefreshReply,
  parseSources,
  sameContent,
  stampAsOf,
  toFetchUrl,
} from './refresh.ts'
import { type Detail, type ElementCache, type Form, type Mode, type ModelSetting, type Tab, type View, type WeekJob, coachPane, withStableButtons, withStableForm } from './ui.ts'
import {
  type Editions,
  type FeedbackStore,
  type FetchedPage,
  type ReadState,
  type WeekSource,
  archiveRows,
  buildWeekRequest,
  editionIds,
  feedbackForPrompt,
  isoWeek,
  pageText,
  parseEdition,
  parseWeekSources,
  profilePath,
  releasesText,
  setTake,
  setWhy,
  storyRef,
  vote,
} from './week.ts'

// /improve <draft>: rewrites the draft for the model this session runs and
// puts the rewrite in the prompt box. Nothing is sent until the person
// presses Enter. /improve alone rewrites the last prompt they sent.
//
// /coach: a pane that reads the draft in the prompt box, checks it against a
// checklist, rewrites it with the reason for each change, shows tips for the
// session's model, and keeps the person's recurring gaps under Lessons.
// /coach refresh: re-reads the pages in sources.json and proposes updated
// rules and tips, which change only when the person accepts them.
// The Week tab: Claude Week, a weekly digest the Week model writes from the
// source pages the mod fetches; votes and takes on its stories steer the next.

const PANE = 'prompt-coach'
const STORE = {
  mode: 'mode',
  lessons: 'lessons',
  pending: 'pendingRefresh',
  seen: 'sourceFingerprints',
  weekEditions: 'weekEditions',
  weekFeedback: 'weekFeedback',
  weekRead: 'weekRead',
  weekJob: 'weekJob',
} as const
/** How long the draft preview waits after typing stops, outside live mode. */
const PREVIEW_DEBOUNCE_MS = 400
/** How often an open pane checks whether the session's model changed. */
const MODEL_POLL_MS = 5000

let rewriteModel = 'sonnet'
/** The choices plugin.json declares for the two model settings. */
const REWRITE_CHOICES = ['haiku', 'sonnet', 'opus'] as const
const REFRESH_CHOICES = ['sonnet', 'opus'] as const
const WEEK_CHOICES = ['sonnet', 'opus'] as const
/** Why the pane may not change the model settings, once a change was refused; then they show read-only. */
let settingsReadOnly: string | undefined
let settingsNote = ''
/** Refresh is rare and is a judgment task (change only what the sources changed), so it defaults to Opus. */
let refreshModel = 'opus'
/** Writing an edition means reading and checking many pages, so it defaults to Opus too. */
let weekModel = 'opus'

// The pane's state, shared by the hooks below. A reload starts it afresh;
// mode and lessons come back from $.store.
let isPaneOpen = false
let tab: Tab = 'coach'
let detail: Detail = 'checklist'
let mode: Mode = 'manual'
let draft = ''
let analysis: Analysis | undefined
let analyzedText = ''
// Answers to the rewrite's placeholders, by token; a new analysis starts them afresh.
let typed: Record<string, string> = {}
let picked: Record<string, string> = {}
/** The suggestions added to the rewrite, by index. */
let added: number[] = []
/** Gaps Omar chose to drop (Enter in an empty field): their sentences leave the rewrite until they get an answer. */
let removed: string[] = []
let formGen = 0
/** Claude's last reply as the last analysis read it: its length, and whether it was cut. Undefined at the start of a conversation. */
let analyzedReply: { chars: number; isCut: boolean } | undefined
let isRunning = false
let status = ''
let liveCalls = 0
let lessons: Lessons = NO_LESSONS
let pauseTimer: Timer | undefined
/** The pane's Buttons per surface, reused between redraws so a press never names a dropped handle. */
const buttons = new Map<string, ElementCache>()
let modelPoll: Timer | undefined

// What the session's model gives the pane, refreshed when the model changes.
let model = ''
/** False until the pane has loaded tips and dates once, even for an unknown model. */
let isSynced = false
/** The model that answered the last main turn: the fallback when the session reports none (the Desktop app can). */
let answeredModel = ''
let modelLabel = ''
let hasModelRules = false
let modelTips: string[] = []
let codeTips: string[] = []
let rulesAsOf = ''
let sources: string[] = []

let refresh: { isRunning: boolean; progress: string; results: RefreshResult[] } = { isRunning: false, progress: '', results: [] }

// Claude Week. Editions, feedback and read state come back from $.store.
/** How long one source page may take before it counts as unreadable. */
const WEEK_FETCH_MS = 20_000
/** An edition is long JSON, and writing it from nine pages takes minutes. */
const WEEK_MAX_TOKENS = 16_000
const WEEK_TIMEOUT_MS = 540_000
/** How long a reason or take waits after typing stops before it is saved quietly. */
const WEEK_SAVE_MS = 800
type StoredJob = WeekJob & { editionId?: string; raw?: string }
let editions: Editions = {}
let feedback: FeedbackStore = {}
let readState: ReadState = {}
let weekJob: StoredJob = { state: 'idle' }
/** The edition on screen; the newest when unset. */
let weekShown = ''
let weekDetails: string[] = []
let weekTakes: string[] = []
let weekSaves: Record<string, string> = {}
/** True while the Week tab lists the stored editions instead of showing one. */
let weekArchive = false
/** The pages Write reads, for Settings; undefined when week/sources.json couldn't be read. */
let weekSources: WeekSource[] | undefined
/** The reader profile's path (see profilePath), and a line under it in Settings when it was just created or couldn't be. */
let profileFile = ''
let profileNote: string | undefined
const weekTimers = new Map<string, Timer>()

export const register: Register = (on, options) => {
  rewriteModel = String(options.rewriteModel ?? 'sonnet')
  refreshModel = String(options.refreshModel ?? 'opus')
  weekModel = String(options.weekModel ?? 'opus')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'improve',
      description: 'Rewrite a draft prompt for clarity, then edit and send it',
      argumentHint: '[draft prompt]',
      immediate: true,
    })
    await $.command.register({
      name: 'coach',
      description: 'Open the prompt coach pane: checklist, rewrite, reasons and model tips',
      argumentHint: '[live | manual | refresh | refresh all]',
      immediate: true,
    })
    mode = (await $.store.get(STORE.mode)) === 'live' ? 'live' : 'manual'
    lessons = asLessons(await $.store.get(STORE.lessons))
    const pending = (await $.store.get(STORE.pending)) as { results?: unknown; seen?: unknown } | undefined
    if (pending && Array.isArray(pending.results)) {
      refresh = { isRunning: false, progress: 'Proposed updates from your last refresh, not yet accepted.', results: pending.results as RefreshResult[] }
      pendingSeen = asFingerprints(pending.seen) ?? {}
    }
    await loadWeek($)
    return next(e)
  })

  on('command.run', { command: 'improve' }, async ($, e) => {
    // The reply the draft answers: before the sent prompt for /improve alone, the latest one otherwise.
    const messages = await transcript($)
    const sent = e.args.trim() ? undefined : lastPersonPrompt(messages)
    const draftText = e.args.trim() || sent?.text || ''
    const previous = lastReply(messages, sent?.index)
    if (!draftText) {
      $.ui.toast('Type /improve followed by your draft prompt.')
      return {}
    }

    const sessionModel = await $.session.model()
    const target = rulesFor(sessionModel)
    const rules = await loadRules($, target?.file)
    const targetLabel = target?.label ?? sessionModel

    $.ui.toast(`Rewriting for ${targetLabel}…`)
    const reply = await $.model.complete({
      model: rewriteModel,
      system: SYSTEM,
      prompt: buildRequest(draftText, rules, targetLabel, previous.text),
      maxTokens: 2048,
      timeoutMs: 60_000,
    })

    if (!reply.isAnswered) {
      $.ui.toast(`Rewrite failed: ${reply.reason}. Your draft is unchanged.`)
      return {}
    }
    const parsed = parseReply(reply.text)
    if (!parsed) {
      $.ui.toast('The rewrite came back in an unexpected format. Try again.')
      return {}
    }

    await fillPrompt($, parsed.rewrite)

    // A dim transcript line for the person; Claude does not read $.ui.log.
    const asReply = previous.text ? " (read as a reply to Claude's last message)" : ''
    $.ui.log(`Rewritten for ${targetLabel}${asReply}: ${parsed.notes.join(' · ') || 'no notes'}`)
    // An empty answer prints nothing Claude would read.
    return {}
  })

  on('command.run', { command: 'coach' }, async ($, e) => {
    // Asked now, not at session start: the Desktop app attaches its surface after the session starts.
    if ((await $.session.surfaces()).length === 0) {
      return { text: 'The coach pane needs the terminal or the Desktop app. Use /improve instead.' }
    }
    const arg = e.args.trim().toLowerCase()

    if (arg === 'refresh' || arg === 'refresh all') {
      tab = 'settings'
      await openPane($)
      const scope = arg === 'refresh all' ? 'all' : 'changed'
      if (!refresh.isRunning) $.clock.after(0, () => void runRefresh($, scope))
      return {}
    }
    if (arg === 'live' || arg === 'manual') {
      await setMode($, arg)
      tab = 'coach'
      await openPane($)
      return {}
    }
    if (arg) return { text: 'Usage: /coach, /coach live, /coach manual, /coach refresh, or /coach refresh all.' }

    if (isPaneOpen) {
      await $.ui.close({ id: PANE })
      closed()
      return {}
    }
    tab = 'coach'
    await openPane($)
    return {}
  })

  // Only observes: notes which model answered, for when $.session.model() is empty.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.usage?.model) {
      answeredModel = e.usage.model
      if (isPaneOpen) void pollModel($)
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? undefined : next(e)))


  // Only observes: if it ever fails, the pane still closes.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) closed()
    return next(e)
  }).catch(($, e, next) => (next.called ? undefined : next(e)))

  // Each edit in the prompt box. The hook only notes the draft and resets a
  // timer: it has 50 ms of its own time, so the work runs when typing pauses.
  on('prompt.edit', async ($, e, next) => {
    const r = await next(e)
    if (isPaneOpen) draftChanged($, r.text)
    return r
  })

  // Sending clears the box. (Not `prompt.change`: the Desktop app's bundled
  // Claude Code 2.1.299 doesn't have that event and refuses the whole module.)
  on('prompt.submit', async ($, e, next) => {
    if (isPaneOpen) {
      draft = ''
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const cache = buttons.get(e.surface) ?? new Map()
    buttons.set(e.surface, cache)
    const R = $.ui.resolve(e)
    const E = withStableButtons(R, cache)
    // Every table names every element, drawing the ones a surface lacks as nothing; mobile has no fields.
    const F = e.surface === 'mobile' ? undefined : withStableForm(R as unknown as Form, cache)

    const now = await $.clock.now()
    const view: View = {
      surface: e.surface,
      tab,
      mode,
      modelLabel,
      hasModelRules,
      draft,
      status,
      isRunning,
      analysis,
      filledRewrite: filled(),
      typed,
      picked,
      added,
      removed: droppedGaps(),
      detail,
      formGen,
      analyzedReply,
      // An empty box after sending is not a changed draft.
      isStale: !!analysis && !!draft.trim() && draft.trim() !== analyzedText.trim(),
      ownRulesPath: `${$.plugin.root}/rules/omar.md`,
      modelTips,
      codeTips,
      liveCalls,
      rulesAsOf,
      sources,
      lessons,
      refresh,
      refreshModel,
      settings: {
        rewriteModel,
        rewriteChoices: REWRITE_CHOICES,
        refreshChoices: REFRESH_CHOICES,
        weekChoices: WEEK_CHOICES,
        readOnlyReason: settingsReadOnly,
        note: settingsNote,
      },
      week: weekView($, now),
    }
    return coachPane(E, view, {
      tab: t => {
        tab = t
        $.ui.invalidate('ui.render')
      },
      mode: m => setMode($, m),
      analyze: () => analyzeNow($),
      fill: () => (analysis ? fillRewrite($, filled()) : undefined),
      apply: () => (analysis ? applyRewrite($, filled()) : undefined),
      detail: d => {
        detail = d
        $.ui.invalidate('ui.render')
      },
      toggleAddition: index => {
        added = added.includes(index) ? added.filter(i => i !== index) : [...added, index]
        $.ui.invalidate('ui.render')
      },
      pick: (token, value) => {
        picked = { ...picked, [token]: value }
        if (value !== NO_PICK) removed = removed.filter(t => t !== token)
        $.ui.invalidate('ui.render')
      },
      // Each keystroke is only noted: a redraw per key would replace the field being typed in.
      type: (token, value) => {
        typed = { ...typed, [token]: value }
      },
      // Enter with nothing typed or picked means: drop this gap and the sentence around it.
      submitAnswer: (token, value) => {
        typed = { ...typed, [token]: value }
        const hasPick = !!picked[token] && picked[token] !== NO_PICK
        removed = removed.filter(t => t !== token)
        if (!value.trim() && !hasPick) removed = [...removed, token]
        $.ui.invalidate('ui.render')
      },
      setModel: (field, value) => setModelSetting($, field, value),
      clearLessons: () => clearLessons($),
      refresh: () => (refresh.isRunning ? undefined : runRefresh($, 'changed')),
      rewriteAll: () => (refresh.isRunning ? undefined : runRefresh($, 'all')),
      accept: () => acceptRefresh($),
      reject: () => rejectRefresh($),
      week: {
        write: () => (weekJob.state === 'running' ? undefined : writeEdition($)),
        show: id => {
          weekShown = id
          weekArchive = false
          $.ui.invalidate('ui.render')
        },
        openArchive: () => {
          weekArchive = true
          $.ui.invalidate('ui.render')
        },
        closeArchive: () => {
          weekArchive = false
          $.ui.invalidate('ui.render')
        },
        vote: (id, verdict) => voteOn($, id, verdict),
        typeWhy: (id, text) => noteText($, 'why', id, text),
        submitWhy: (id, text) => saveText($, 'why', id, text),
        toggleTake: id => {
          weekTakes = weekTakes.includes(id) ? weekTakes.filter(x => x !== id) : [...weekTakes, id]
          $.ui.invalidate('ui.render')
        },
        typeTake: (id, text) => noteText($, 'take', id, text),
        submitTake: (id, text) => saveText($, 'take', id, text),
        toggleRead: id => toggleRead($, id),
        toggleDetail: id => {
          weekDetails = weekDetails.includes(id) ? weekDetails.filter(x => x !== id) : [...weekDetails, id]
          $.ui.invalidate('ui.render')
        },
        askAside: text => askAside($, text),
      },
    }, F)
  })
}

// ---- The pane ----

async function openPane($: EngineInterface): Promise<void> {
  await syncModel($)
  draft = (await $.prompt.read()).text
  const opened = await $.ui.open({ id: PANE, title: 'Prompt Coach', closeOnEscape: true })
  isPaneOpen = true
  modelPoll?.cancel()
  modelPoll = $.clock.every(MODEL_POLL_MS, () => void pollModel($))
  if (!opened.isPlaced) $.ui.toast(`The coach pane is open but not shown yet: ${opened.reason}`)
  $.ui.invalidate('ui.render')
}

function closed(): void {
  isPaneOpen = false
  buttons.clear()
  pauseTimer?.cancel()
  modelPoll?.cancel()
  pauseTimer = undefined
  modelPoll = undefined
}

function draftChanged($: EngineInterface, text: string): void {
  draft = text
  pauseTimer?.cancel()
  pauseTimer = $.clock.after(mode === 'live' ? LIVE_DEBOUNCE_MS : PREVIEW_DEBOUNCE_MS, () => void typingPaused($))
}

/** Typing stopped: redraw the preview, and in live mode analyze the draft. */
async function typingPaused($: EngineInterface): Promise<void> {
  if (mode === 'live') {
    const text = (await $.prompt.read()).text
    draft = text
    const skip = liveSkipReason({ text, lastAnalyzed: analyzedText, isRunning, liveCalls })
    if (!skip) {
      liveCalls += 1
      await analyze($, text)
      return
    }
    // Quiet about drafts already analyzed or still being typed; say why otherwise.
    if (skip.startsWith('Live limit')) status = skip
  }
  $.ui.invalidate('ui.render')
}

async function analyzeNow($: EngineInterface): Promise<void> {
  const text = (await $.prompt.read()).text
  draft = text
  if (!text.trim()) {
    status = 'Type a draft in the prompt box first.'
    $.ui.invalidate('ui.render')
    return
  }
  await analyze($, text)
}

async function analyze($: EngineInterface, text: string): Promise<void> {
  if (isRunning) return
  isRunning = true
  await syncModel($)
  status = modelLabel ? `Analyzing for ${modelLabel}…` : 'Analyzing…'
  $.ui.invalidate('ui.render')
  try {
    const rules = await loadRules($, rulesFor(model)?.file)
    const previous = lastReply(await transcript($))
    const reply = await $.model.complete({
      model: rewriteModel,
      system: ANALYSIS_SYSTEM,
      prompt: buildAnalysisRequest(text, rules, modelLabel || 'Claude', previous.text),
      maxTokens: 3000,
      timeoutMs: 90_000,
    })
    if (!reply.isAnswered) {
      status = `Analysis failed: ${reply.reason}. Try again.`
      return
    }
    const parsed = parseAnalysis(reply.text)
    if (!parsed) {
      status = 'The analysis came back in an unexpected format. Try again.'
      return
    }
    analysis = parsed
    analyzedText = text
    typed = {}
    picked = {}
    added = []
    removed = []
    formGen += 1
    analyzedReply = previous.text ? { chars: previous.text.length, isCut: previous.isCut } : undefined
    status = ''
    lessons = recordLesson(lessons, parsed, text, await $.clock.now())
    await $.store.set(STORE.lessons, lessons)
  } catch (err) {
    status = `Analysis failed: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    isRunning = false
    $.ui.invalidate('ui.render')
  }
}

/** Apply puts the rewrite in the box; live mode then treats it as analyzed, so it isn't analyzed again. */
/**
 * The rewrite with the chosen suggestions added, the dropped gaps' sentences
 * taken out, and the placeholders answered so far filled in.
 */
function filled(): string {
  if (!analysis) return ''
  const answers = answersFor(analysis.placeholders, typed, picked)
  const rewrite = removeSentences(withAdditions(analysis.rewrite, analysis.additions, added), droppedGaps())
  return fillPlaceholders(rewrite, answers)
}

/** The gaps to drop: chosen with an empty Enter and still without an answer (an answer typed since wins). */
function droppedGaps(): string[] {
  if (!analysis) return []
  const answers = answersFor(analysis.placeholders, typed, picked)
  return removed.filter(t => !answers[t])
}

/** Puts the rewrite in the prompt box and sends nothing. */
async function fillRewrite($: EngineInterface, rewrite: string): Promise<void> {
  analyzedText = rewrite
  draft = rewrite
  await fillPrompt($, rewrite)
  $.ui.invalidate('ui.render')
}

/** Puts the rewrite in the prompt box, then sends it as Omar's own prompt, as Enter would. */
async function applyRewrite($: EngineInterface, rewrite: string): Promise<void> {
  analyzedText = rewrite
  draft = rewrite
  const filled = await $.prompt.fill({ text: rewrite, mode: 'replace' })
  if (!filled.isFilled) {
    // No prompt box to write to (a dialog is open), so nothing is sent.
    await copyText($, rewrite)
    $.ui.invalidate('ui.render')
    return
  }
  const sent = await $.prompt.submit({ text: rewrite, asUser: true })
  if (sent.drop !== undefined) {
    status = `Not sent: ${sent.drop}. The rewrite is in the prompt box.`
  } else {
    // Sent: empty the box, as Enter does, so the rewrite isn't sent twice.
    await $.prompt.fill({ text: '', mode: 'replace' })
    draft = ''
    status = ''
  }
  $.ui.invalidate('ui.render')
}

async function setMode($: EngineInterface, next: Mode): Promise<void> {
  mode = next
  status = ''
  await $.store.set(STORE.mode, mode)
  $.ui.invalidate('ui.render')
  // Turning live on with a draft already typed analyzes it once the pause passes.
  if (mode === 'live' && isPaneOpen) draftChanged($, (await $.prompt.read()).text)
}

/**
 * Changes a model setting as /config would: `$.config.set` on the plugin's
 * own userConfig row. Claude Code saves it to the user settings and reloads
 * the mod, which then reads the new value. A refusal or an error turns the
 * model settings read-only in the pane, with the reason.
 */
async function setModelSetting($: EngineInterface, field: ModelSetting, value: string): Promise<void> {
  const label = { rewriteModel: 'Rewrite model', refreshModel: 'Refresh model', weekModel: 'Week model' }[field]
  try {
    const result = await $.config.set({ key: `prompt-coach.${field}`, value })
    if (result.deny !== undefined) {
      settingsReadOnly = result.deny
    } else {
      // Also take it now, in case the reload that applies it comes later.
      if (field === 'rewriteModel') rewriteModel = String(result.value)
      else if (field === 'refreshModel') refreshModel = String(result.value)
      else weekModel = String(result.value)
      settingsNote = `${label} set to ${String(result.value)}. Saved to your settings, like /config.`
    }
  } catch (err) {
    settingsReadOnly = err instanceof Error ? err.message : String(err)
  }
  $.ui.invalidate('ui.render')
}

async function clearLessons($: EngineInterface): Promise<void> {
  lessons = NO_LESSONS
  await $.store.delete(STORE.lessons)
  $.ui.invalidate('ui.render')
}

async function pollModel($: EngineInterface): Promise<void> {
  if (await syncModel($)) $.ui.invalidate('ui.render')
}

/** Reads the session's model and, when it changed, its label, tips and rules date. True when it changed. */
async function syncModel($: EngineInterface): Promise<boolean> {
  const current = (await $.session.model()) || answeredModel
  if (isSynced && current === model) return false
  isSynced = true
  model = current
  const target = rulesFor(current)
  modelLabel = target?.label ?? current
  hasModelRules = !!target

  const root = $.plugin.root
  modelTips = target ? parseTips(await readOr($, `${root}/tips/${target.file}`)) : []
  codeTips = parseTips(await readOr($, `${root}/tips/claude-code.md`))

  const dates = [await readOr($, `${root}/rules/general.md`), target ? await readOr($, `${root}/rules/${target.file}`) : '']
    .map(asOfDate)
    .filter((d): d is string => !!d)
  rulesAsOf = dates.sort()[0] ?? ''

  try {
    const all = parseSources(await $.fs.read(`${root}/sources.json`)).targets
    const mine = Object.entries(all)
      .filter(([t]) => t === 'rules/general.md' || t === 'tips/claude-code.md' || (target && t.endsWith(`/${target.file}`)))
      .flatMap(([, urls]) => urls)
    sources = [...new Set(mine)]
  } catch {
    sources = []
  }
  return true
}

// ---- /coach refresh ----

/** Fingerprints to record once Omar has reviewed the proposed updates. */
let pendingSeen: Fingerprints = {}

/**
 * Fetches every source page and compares each with its fingerprint from the
 * last reviewed refresh. Only files whose pages changed are rewritten, by the
 * refresh model; `all` rewrites every file. The first run records a baseline.
 */
async function runRefresh($: EngineInterface, scope: 'changed' | 'all'): Promise<void> {
  const root = $.plugin.root
  refresh = { isRunning: true, progress: 'Reading sources.json…', results: [] }
  $.ui.invalidate('ui.render')

  let targets: [string, string[]][]
  try {
    targets = Object.entries(parseSources(await $.fs.read(`${root}/sources.json`)).targets)
  } catch (err) {
    refresh = { isRunning: false, progress: `Could not read sources.json: ${message(err)}`, results: [] }
    $.ui.invalidate('ui.render')
    return
  }

  // Each page once, however many files it feeds.
  const urls = [...new Set(targets.flatMap(([, u]) => u))]
  const pages = new Map<string, string>()
  const errors = new Map<string, string>()
  for (const [i, url] of urls.entries()) {
    refresh = { ...refresh, progress: `Fetching source pages (${i + 1} of ${urls.length})…` }
    $.ui.invalidate('ui.render')
    try {
      pages.set(url, await fetchPage($, url))
    } catch (err) {
      errors.set(url, message(err))
    }
  }
  const now: Fingerprints = Object.fromEntries([...pages].map(([url, text]) => [url, fingerprint(text)]))
  const seen = asFingerprints(await $.store.get(STORE.seen))

  if (!seen && scope === 'changed') {
    await $.store.set(STORE.seen, now)
    const missed = errors.size ? ` ${errors.size} could not be fetched and will be checked next time.` : ''
    refresh = {
      isRunning: false,
      progress: `First refresh: recorded a fingerprint of ${pages.size} source pages.${missed} From now on, a refresh proposes changes only when a page changes. To rewrite every file from today's pages anyway, press Rewrite all.`,
      results: [],
    }
    $.ui.invalidate('ui.render')
    return
  }

  const today = new Date(await $.clock.now()).toISOString().slice(0, 10)
  const results: RefreshResult[] = []
  for (const [i, [target, targetUrls]] of targets.entries()) {
    const unreachable = targetUrls.find(u => errors.has(u))
    if (unreachable) {
      results.push({ target, state: 'failed', reason: errors.get(unreachable)! })
      continue
    }
    const changed = scope === 'all' ? targetUrls : changedUrls(targetUrls, seen ?? {}, now)
    if (changed.length === 0) {
      results.push({ target, state: 'same' })
      continue
    }
    refresh = { ...refresh, progress: `Updating ${target} with ${refreshModel} (${i + 1} of ${targets.length})…` }
    $.ui.invalidate('ui.render')
    try {
      const current = await $.fs.read(`${root}/${target}`)
      const reply = await $.model.complete({
        model: refreshModel,
        system: REFRESH_SYSTEM,
        prompt: buildRefreshRequest(target, current, targetUrls.map(url => ({ url, text: pages.get(url)! }))),
        maxTokens: 4000,
        timeoutMs: 180_000,
      })
      if (!reply.isAnswered) throw new Error(`the model did not answer (${reply.reason})`)
      const updated = parseRefreshReply(reply.text)
      if (!updated) throw new Error('the model replied in an unexpected format')
      const next = stampAsOf(updated, today)
      results.push(sameContent(current, next) ? { target, state: 'same' } : { target, state: 'changed', diff: lineDiff(current, next), next })
    } catch (err) {
      results.push({ target, state: 'failed', reason: message(err) })
    }
  }

  // A file that failed keeps its pages' old fingerprints, so the next refresh tries it again.
  const retry = new Set(targets.filter(([t]) => results.some(r => r.target === t && r.state === 'failed')).flatMap(([, u]) => u))
  const toRecord: Fingerprints = { ...(seen ?? {}), ...Object.fromEntries(Object.entries(now).filter(([url]) => !retry.has(url))) }

  const changed = results.filter(r => r.state === 'changed').length
  const failed = results.filter(r => r.state === 'failed').length
  refresh = {
    isRunning: false,
    progress:
      changed || failed
        ? `${changed} of ${results.length} files have updates${failed ? `, ${failed} could not be checked` : ''}.`
        : `No source page has changed since the last refresh. Nothing to update.`,
    results: changed || failed ? results : [],
  }
  if (changed) {
    // Kept until accepted or rejected, so a reload or a new session still offers them.
    pendingSeen = toRecord
    await $.store.set(STORE.pending, { results, seen: toRecord })
  } else {
    await $.store.set(STORE.seen, toRecord)
  }
  $.ui.invalidate('ui.render')
}

async function fetchPage($: EngineInterface, url: string): Promise<string> {
  const res = await $.http.fetch(toFetchUrl(url))
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`)
  return res.text
}

async function acceptRefresh($: EngineInterface): Promise<void> {
  const root = $.plugin.root
  let written = 0
  for (const r of refresh.results) {
    if (r.state !== 'changed') continue
    await $.fs.write(`${root}/${r.target}`, r.next)
    written += 1
  }
  await reviewed($)
  refresh = { isRunning: false, progress: `Updated ${written} ${written === 1 ? 'file' : 'files'}.`, results: [] }
  model = '' // Reload tips and dates from the new files.
  await syncModel($)
  $.ui.toast(`prompt-coach: updated ${written} rules and tips files.`)
  $.ui.invalidate('ui.render')
}

async function rejectRefresh($: EngineInterface): Promise<void> {
  await reviewed($)
  refresh = { isRunning: false, progress: '', results: [] }
  $.ui.invalidate('ui.render')
}

/** Omar has seen the proposal: record its pages as reviewed so they aren't proposed again until they change. */
async function reviewed($: EngineInterface): Promise<void> {
  if (Object.keys(pendingSeen).length) await $.store.set(STORE.seen, pendingSeen)
  pendingSeen = {}
  await $.store.delete(STORE.pending)
}

// ---- Claude Week ----

async function loadWeek($: EngineInterface): Promise<void> {
  editions = asRecord(await $.store.get(STORE.weekEditions)) as Editions
  feedback = asRecord(await $.store.get(STORE.weekFeedback)) as FeedbackStore
  readState = asRecord(await $.store.get(STORE.weekRead)) as ReadState
  try {
    weekSources = parseWeekSources(await $.fs.read(`${$.plugin.root}/week/sources.json`))
  } catch {
    weekSources = undefined
  }
  await ensureProfile($)
  // A take box with text in it opens with the edition.
  weekTakes = Object.values(feedback).filter(f => f.take).map(f => f.story_id)
  // Only a failure is kept; one still running when the session ended never came back.
  const job = asRecord(await $.store.get(STORE.weekJob)) as Partial<StoredJob>
  if (job.state === 'failed') weekJob = job as StoredJob
  else if (job.state === 'running') {
    weekJob = { state: 'failed', title: job.title ?? 'Claude Week', editionId: job.editionId, reason: 'the session ended before the edition was ready.' }
    await $.store.set(STORE.weekJob, weekJob)
  } else weekJob = { state: 'idle' }
}

/**
 * Finds the reader profile in the mod's data folder and, only when there is
 * no file there, starts one from week/profile.example.yaml. An existing
 * profile is never written.
 */
async function ensureProfile($: EngineInterface): Promise<void> {
  try {
    const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) || `${(await $.env.get('HOME')) ?? '~'}/.claude`
    profileFile = profilePath($.plugin.root, $.plugin.name, configDir)
    if (await $.fs.exists(profileFile)) {
      profileNote = undefined
      return
    }
    await $.fs.write(profileFile, await $.fs.read(`${$.plugin.root}/week/profile.example.yaml`))
    profileNote = 'A blank profile was created here. Fill it in before the next Write.'
  } catch (err) {
    profileNote = `Couldn't create it: ${err instanceof Error ? err.message : String(err)}`
  }
}

function weekView($: EngineInterface, now: number): View['week'] {
  const week = isoWeek(now)
  const ids = editionIds(editions)
  return {
    edition: editions[weekShown] ?? editions[ids[0] ?? ''],
    editionIds: ids,
    currentId: week.id,
    currentTitle: week.title,
    feedback,
    read: readState,
    details: weekDetails,
    takes: weekTakes,
    saves: weekSaves,
    job: weekJob,
    weekModel,
    profilePath: profileFile,
    profileNote,
    sources: weekSources,
    archive: weekArchive,
    archiveRows: archiveRows(editions, feedback, readState),
  }
}

/**
 * Writes this week's edition: fetches every page in week/sources.json (as
 * /coach refresh does, so no tool call and no permission prompt), then one
 * Week model request with week/edition-prompt.md as its system prompt and the
 * reader profile, the last four editions' feedback and the pages' text.
 */
async function writeEdition($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const week = isoWeek(now)
  if (editions[week.id]) {
    weekShown = week.id
    $.ui.invalidate('ui.render')
    return
  }
  const progress = (text: string) => {
    weekJob = { state: 'running', title: week.title, startedAt: now, progress: text, editionId: week.id }
    $.ui.invalidate('ui.render')
  }
  const root = $.plugin.root
  try {
    progress('Reading the source pages…')
    const system = await $.fs.read(`${root}/week/edition-prompt.md`)
    if (!profileFile) await ensureProfile($)
    const profile = await $.fs.read(profileFile).catch(() => {
      throw new Error(`couldn't read your reader profile at ${profileFile}`)
    })
    const sources = parseWeekSources(await $.fs.read(`${root}/week/sources.json`))
    let done = 0
    const pages = await Promise.all(
      sources.map(async src => {
        const page = await fetchSource($, src, now)
        done += 1
        progress(`Reading the source pages (${done} of ${sources.length})…`)
        return page
      }),
    )
    const unread = pages.filter(p => 'error' in p).length
    if (unread === pages.length) throw new Error('none of the source pages could be read')
    progress(`Writing with ${weekModel} from ${pages.length - unread} of ${pages.length} pages. This takes a few minutes.`)
    const reply = await $.model.complete({
      model: weekModel,
      system,
      prompt: buildWeekRequest(profile, feedbackForPrompt(feedback), week, pages),
      maxTokens: WEEK_MAX_TOKENS,
      timeoutMs: WEEK_TIMEOUT_MS,
    })
    if (!reply.isAnswered) throw new Error(`the model did not answer (${reply.reason})`)
    const parsed = parseEdition(reply.text, week.id)
    if ('reason' in parsed) {
      weekJob = { state: 'failed', title: week.title, editionId: week.id, reason: `the answer couldn't be read as an edition: ${parsed.reason}.`, raw: reply.text.slice(0, 20_000) }
    } else {
      await $.store.set(STORE.weekEditions, { ...editions, [week.id]: parsed.edition })
      editions = { ...editions, [week.id]: parsed.edition }
      weekShown = week.id
      weekJob = { state: 'idle' }
      $.ui.toast(`${parsed.edition.title} is ready in the coach pane's Week tab.`)
    }
  } catch (err) {
    weekJob = { state: 'failed', title: week.title, editionId: week.id, reason: message(err) }
  }
  if (weekJob.state === 'idle') await $.store.delete(STORE.weekJob)
  else await $.store.set(STORE.weekJob, weekJob)
  $.ui.invalidate('ui.render')
}

/** One source page as the writer reads it: its text, or why it couldn't be read (an HTTP error, or no answer in 20 seconds). */
async function fetchSource($: EngineInterface, src: WeekSource, now: number): Promise<FetchedPage> {
  const page = { tier: src.tier, label: src.label, url: src.link ?? src.url }
  let timer: Timer | undefined
  try {
    const late = new Promise<never>((_, reject) => {
      timer = $.clock.after(WEEK_FETCH_MS, () => reject(new Error(`no answer in ${WEEK_FETCH_MS / 1000} seconds`)))
    })
    const res = await Promise.race([$.http.fetch(src.url), late])
    if (!res.ok) return { ...page, error: `HTTP ${res.status}` }
    return { ...page, text: src.kind === 'github-releases' ? releasesText(res.text, now) : pageText(res.text, src.url) }
  } catch (err) {
    return { ...page, error: message(err) }
  } finally {
    timer?.cancel()
  }
}

async function voteOn($: EngineInterface, id: string, verdict: 'up' | 'down'): Promise<void> {
  const ref = storyRef(editions, id)
  if (!ref) return
  // A reason still being typed was about the old vote.
  weekTimers.get(`why:${id}`)?.cancel()
  weekTimers.delete(`why:${id}`)
  feedback = vote(feedback, ref, verdict, stamp(await $.clock.now()))
  await saveFeedback($, id, true)
}

/** A keystroke in a reason or take field: noted, and saved quietly once typing pauses. No redraw. */
function noteText($: EngineInterface, kind: 'why' | 'take', id: string, text: string): void {
  const k = `${kind}:${id}`
  weekTimers.get(k)?.cancel()
  weekTimers.set(k, $.clock.after(WEEK_SAVE_MS, () => void applyText($, kind, id, text, false)))
}

/** Enter in a reason or take field: saved now, and the pane redraws with the result. */
async function saveText($: EngineInterface, kind: 'why' | 'take', id: string, text: string): Promise<void> {
  weekTimers.get(`${kind}:${id}`)?.cancel()
  await applyText($, kind, id, text, true)
}

async function applyText($: EngineInterface, kind: 'why' | 'take', id: string, text: string, redraw: boolean): Promise<void> {
  weekTimers.delete(`${kind}:${id}`)
  const ref = storyRef(editions, id)
  if (!ref) return
  const now = stamp(await $.clock.now())
  const next = kind === 'why' ? setWhy(feedback, ref, text, now) : setTake(feedback, ref, text, now)
  if (next === feedback) {
    if (redraw) $.ui.invalidate('ui.render')
    return
  }
  feedback = next
  await saveFeedback($, id, redraw)
}

/** Writes all feedback and notes the result under the story: Saving…, then Saved or Not saved with the reason. */
async function saveFeedback($: EngineInterface, id: string, redraw: boolean): Promise<void> {
  weekSaves = { ...weekSaves, [id]: 'Saving…' }
  if (redraw) $.ui.invalidate('ui.render')
  try {
    await $.store.set(STORE.weekFeedback, feedback)
    weekSaves = { ...weekSaves, [id]: 'Saved' }
  } catch (err) {
    weekSaves = { ...weekSaves, [id]: `Not saved: ${message(err)}` }
  }
  if (redraw) $.ui.invalidate('ui.render')
}

async function toggleRead($: EngineInterface, id: string): Promise<void> {
  const { [id]: was, ...rest } = readState
  readState = was ? rest : { ...readState, [id]: true }
  await $.store.set(STORE.weekRead, readState)
  $.ui.invalidate('ui.render')
}

/**
 * Puts `/btw <text>` in the prompt box, so Enter opens the side chat. A mod
 * can't open it itself: in Desktop the app draws /btw, not the engine, so
 * `$.command.run` finds no /btw in the session. When the box can't take the
 * text (a dialog is open), it goes on the clipboard and a toast says so.
 */
async function askAside($: EngineInterface, text: string): Promise<void> {
  const btw = `/btw ${text}`
  const filled = await $.prompt.fill({ text: btw, mode: 'replace' })
  if (filled.isFilled) {
    $.ui.toast('Press Enter to ask it in the side chat.')
    return
  }
  const copied = await $.ui.copy({ text: btw })
  $.ui.toast(
    copied.isCopied
      ? "Couldn't put the side question in the prompt box, so it's on the clipboard: paste it there and press Enter."
      : "Couldn't put the side question in the prompt box or on the clipboard.",
  )
}

/** An ISO time to the second, as feedback records carry it. */
function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

// ---- Shared ----

async function fillPrompt($: EngineInterface, text: string, what = 'Rewrite'): Promise<void> {
  const filled = await $.prompt.fill({ text, mode: 'replace' })
  if (!filled.isFilled) {
    // No prompt box to write to (a dialog is open): put it on the clipboard.
    await copyText($, text, what)
  }
}

async function copyText($: EngineInterface, text: string, what = 'Rewrite'): Promise<void> {
  const copied = await $.ui.copy({ text })
  $.ui.toast(copied.isCopied ? `${what} copied to the clipboard.` : `Could not place the ${what.toLowerCase()}.`)
}

/** The conversation so far, or none when it can't be read: the coach then works as at the start of a conversation. */
async function transcript($: EngineInterface): Promise<SessionMessage[]> {
  try {
    const messages = await $.session.messages()
    return Array.isArray(messages) ? messages : []
  } catch {
    return []
  }
}

/** The last prompt the person sent and its row, or undefined when there is none. */
function lastPersonPrompt(messages: SessionMessage[]): { text: string; index: number } | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m && isPersonPrompt(m)) return { text: m.text.trim(), index: i }
  }
  return undefined
}

/** The general rules, the session model's own rules when there is a file for it, then Omar's own. */
async function loadRules($: EngineInterface, file: string | undefined): Promise<string> {
  const dir = `${$.plugin.root}/rules`
  const parts = [await $.fs.read(`${dir}/general.md`)]
  if (file) parts.push(await readOr($, `${dir}/${file}`))
  parts.push(await readOr($, `${dir}/omar.md`))
  return parts.filter(Boolean).join('\n\n')
}

/** A file's text, or '' when it can't be read. */
async function readOr($: EngineInterface, path: string): Promise<string> {
  try {
    return await $.fs.read(path)
  } catch {
    return ''
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
