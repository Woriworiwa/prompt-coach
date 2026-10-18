// The coach pane's drawing: pure functions from what the pane shows to an
// element tree. No `$`; the hooks module hands in the elements and actions.
import type { Elements, RenderElement, UiPressArgument } from 'claude-code'

import { type Analytics, advice, focus, itemStats, RECENT, rulesFor, STATS_ON, scoreTrend, strengths, tokenSummary } from './analytics.ts'
import { type Addition, type Analysis, type CheckStatus, LIVE_CAP, type ModelRules, NO_PICK, type Placeholder, type RuleSection } from './lib.ts'
import type { RefreshResult } from './refresh.ts'
import { type ArchiveRow, type Edition, type FeedbackStore, type ReadState, type Story, type WeekSource, asideAboutQuestion, asideAboutStory, dateRange, readCounts } from './week.ts'

/** The elements every surface draws, so one tree fits the terminal, Desktop and mobile. */
export type UI = Pick<Elements['mobile'], 'Box' | 'Text' | 'Button' | 'Link' | 'Code' | 'Markdown'> & Partial<Pick<Elements['mobile'], 'Svg'>>
/** The form fields the terminal, Desktop and VS Code draw; the mobile app has none. */
export type Form = Pick<Elements['desktop'], 'Input' | 'Select'>

export type Tab = 'coach' | 'analytics' | 'settings' | 'week'
export type Mode = 'manual' | 'live'
/** The groups in the Analytics tab's rules list, each opened and closed on its own. */
export type RuleGroup = 'general' | 'model' | 'own'
/** Which part of the analysis shows below the buttons. */

export type View = {
  /** The app drawing the pane (`e.surface`): Desktop draws a native button even for `plain`, so its tabs differ. */
  surface: string
  tab: Tab
  mode: Mode
  modelLabel: string
  hasModelRules: boolean
  draft: string
  status: string
  isRunning: boolean
  analysis?: Analysis
  /** The rewrite with the answers filled in so far. */
  filledRewrite: string
  /** The surface's width in cells, when it has said; sizes the rewrite field. */
  columns?: number
  /** The rewrite field's key; it changes whenever the field's text changed since it was drawn. */
  rewriteKey: string
  /** What was typed and picked for each placeholder, by its token. */
  typed: Record<string, string>
  picked: Record<string, string>
  /** Gaps dropped with an empty Enter, whose sentences are out of the rewrite. */
  removed: string[]
  /** Which suggestions are added to the rewrite, by their index in the analysis. */
  added: number[]
  /** Changes with each analysis, so its fields start empty. */
  formGen: number
  /** Claude's last reply as the analysis read it; undefined at the start of a conversation. */
  analyzedReply?: { chars: number; isCut: boolean }
  /** True when the prompt box no longer holds the draft that was analyzed. */
  isStale: boolean
  /** False while an analysis runs and after one, until the draft changes: Analyze is then grayed out. */
  canAnalyze: boolean
  liveCalls: number
  ownRules: OwnRules
  ruleList: RuleList
  sources: string[]
  analytics: Analytics
  refresh: { isRunning: boolean; progress: string; results: RefreshResult[] }
  /** The model that rewrites files on refresh (the refreshModel setting). */
  refreshModel: string
  settings: Settings
  week: WeekView
}

/** Omar's own rules, kept in rules.md in the mod's data folder. */
export type OwnRules = {
  /** The file's path; '' when the data folder wasn't found. */
  path: string
  rules: string[]
  /** What the last add or remove did. */
  note?: string
  /** Changes with each add, so the Add field starts empty again. */
  gen: number
}

/** The rules list on the Analytics tab: the shipped files as sections, the model picked, and which groups are open. */
export type RuleList = {
  general: RuleSection[]
  models: (ModelRules & { sections: RuleSection[] })[]
  /** The picked model's file; '' when the session's model has none and nothing was picked. */
  picked: string
  /** Set when the session's model borrows an older model's file; '' otherwise. */
  borrowed: string
  open: RuleGroup[]
}

/** What the Week tab shows: one stored edition, its feedback and read state, and the writer's job. */
export type WeekView = {
  /** The edition on screen, if any is stored. */
  edition?: Edition
  /** The stored editions' ids, newest first. */
  editionIds: string[]
  /** This ISO week's edition id and title, which the write button names. */
  currentId: string
  currentTitle: string
  feedback: FeedbackStore
  read: ReadState
  /** Stories whose More detail is open, and whose take box is open. */
  details: string[]
  takes: string[]
  /** Each story's last save: "Saving…", "Saved", or "Not saved: <reason>". */
  saves: Record<string, string>
  job: WeekJob
  weekModel: string
  /** The reader profile, in the mod's data folder; see profilePath in week.ts. */
  profilePath: string
  /** Shown under the path when the profile was just created, or couldn't be. */
  profileNote?: string
  /** The pages Write reads (week/sources.json), listed under Settings; undefined when the file couldn't be read. */
  sources?: WeekSource[]
  /** True while the tab shows the archive instead of an edition. */
  archive: boolean
  archiveRows: ArchiveRow[]
}

export type WeekJob =
  | { state: 'idle' }
  | { state: 'running'; title: string; startedAt: number; progress: string }
  | { state: 'failed'; title: string; reason: string }

/** What the Settings tab shows: the rewrite model, the choices, and whether the pane may change them. */
export type Settings = {
  rewriteModel: string
  rewriteChoices: readonly string[]
  refreshChoices: readonly string[]
  weekChoices: readonly string[]
  /** Why the model settings can't be changed here, once a change was refused; undefined while they can. */
  readOnlyReason?: string
  /** What the last change did, shown under the controls. */
  note: string
}

export type ModelSetting = 'rewriteModel' | 'refreshModel' | 'weekModel'

/** What the pane's controls do. Each may return the work it started, so a press can wait for it. */
export type Actions = {
  tab: (tab: Tab) => void
  pickRules: (file: string) => void
  toggleRules: (group: RuleGroup) => void
  mode: (mode: Mode) => Promise<void>
  analyze: () => Promise<void>
  fill: () => Promise<void> | undefined
  apply: () => Promise<void> | undefined
  toggleAddition: (index: number) => void
  editRewrite: (value: string) => void
  submitRewrite: (value: string) => void
  pick: (token: string, value: string) => void
  type: (token: string, value: string) => void
  submitAnswer: (token: string, value: string) => void
  setModel: (field: ModelSetting, value: string) => void
  addRule: (typed: string) => Promise<void>
  removeRule: (rule: string) => Promise<void>
  clearAnalytics: () => Promise<void>
  refresh: () => Promise<void> | undefined
  rewriteAll: () => Promise<void> | undefined
  accept: () => Promise<void>
  reject: () => Promise<void>
  week: WeekActions
}

/** What the Week tab's controls do. */
export type WeekActions = {
  write: () => Promise<void> | undefined
  show: (editionId: string) => void
  vote: (storyId: string, verdict: 'up' | 'down') => Promise<void>
  /** Typing only notes the text (and saves it quietly after a pause); Enter saves and redraws. */
  typeWhy: (storyId: string, text: string) => void
  submitWhy: (storyId: string, text: string) => Promise<void>
  toggleTake: (storyId: string) => void
  typeTake: (storyId: string, text: string) => void
  submitTake: (storyId: string, text: string) => Promise<void>
  toggleRead: (storyId: string) => Promise<void>
  toggleDetail: (storyId: string) => void
  /** Puts `/btw <text>` in the prompt box, so Enter asks it in the side chat, beside the conversation and not in it. */
  askAside: (text: string) => Promise<void>
  /** Shows the list of stored editions, or goes back from it to the edition. */
  openArchive: () => void
  closeArchive: () => void
}

/** The pane's pressable elements by key, kept between redraws. */
export type ElementCache = Map<string, { sig: string; el: RenderElement; fns: Record<string, Handler> }>
type Handler = (...args: any[]) => void

/**
 * An element constructor that hands back the element it drew last time while
 * the props stay the same (leaving out `skip`, such as a field's value, which
 * the person's typing owns anyway).
 *
 * Every new Button, Input or Select element gets a new handle, and a redraw
 * drops the handles the last drawing held. The Desktop app redraws the pane
 * when a mousedown gives it focus, so the click that follows named a dropped
 * handle and did nothing: each button needed a second click. An element the
 * engine sees again keeps its handle. Its handlers run the newest closures.
 */
function kept<P extends { key?: string; label?: string }>(
  make: (props: P) => RenderElement,
  cache: ElementCache,
  slots: readonly string[],
  skip: readonly string[] = [],
): (props: P) => RenderElement {
  return props => {
    const all = props as Record<string, unknown>
    const fns: Record<string, Handler> = {}
    const rest: Record<string, unknown> = {}
    for (const [k, value] of Object.entries(all)) {
      if (slots.includes(k) && typeof value === 'function') fns[k] = value as Handler
      else rest[k] = value
    }
    const key = props.key ?? props.label ?? ''
    const sig = JSON.stringify(Object.fromEntries(Object.entries(rest).filter(([k]) => !skip.includes(k))))
    const found = cache.get(key)
    if (found && found.sig === sig) {
      found.fns = fns
      return found.el
    }
    const entry = { sig, fns, el: undefined as unknown as RenderElement }
    const wired = Object.fromEntries(Object.keys(fns).map(k => [k, (...args: unknown[]) => entry.fns[k]?.(...args)]))
    entry.el = make({ ...rest, ...wired } as P)
    cache.set(key, entry)
    return entry.el
  }
}

/** The element table with Buttons kept between redraws (see `kept`). */
export function withStableButtons(E: UI, cache: ElementCache): UI {
  return { ...E, Button: kept(E.Button, cache, ['onPress']) }
}

/** The form fields kept between redraws; a field's value is the person's, so it is left out of the comparison. */
export function withStableForm(F: Form, cache: ElementCache): Form {
  return {
    Input: kept(F.Input, cache, ['onInput', 'onSubmit'], ['value']),
    Select: kept(F.Select, cache, ['onSelect'], ['value']),
  }
}

const MARK: Record<CheckStatus, { mark: string; color: string }> = {
  present: { mark: '✓', color: 'success' },
  partial: { mark: '~', color: 'warning' },
  missing: { mark: '✗', color: 'error' },
  'n/a': { mark: '–', color: 'inactive' },
}

export function coachPane(E: UI, v: View, a: Actions, F?: Form): RenderElement {
  const body =
    v.tab === 'analytics' ? analyticsTab(E, v, a, F) : v.tab === 'settings' ? settingsTab(E, v, a, F) : v.tab === 'week' ? weekTab(E, v, a, F) : coachTab(E, v, a, F)
  return E.Box({ flexDirection: 'column', gap: 1, children: [tabs(E, v, a), ...body] })
}

/**
 * The pane's tabs. The terminal draws each as plain text (`1: Coach`), the open
 * one in brackets. Desktop ignores `plain` and frames every Button, so there the
 * open tab is clay semibold Text with no frame and the others are dim Buttons.
 */
function tabs(E: UI, v: View, a: Actions): RenderElement {
  const isDesktop = v.surface === 'desktop'
  const tab = (key: Tab, label: string, hotkey: string) => {
    const isOpen = v.tab === key
    if (isDesktop && isOpen) return E.Text({ color: 'claude', weight: 'semibold', children: [label] })
    if (isDesktop) return E.Button({ key: `tab-${key}`, label, hotkey, dimColor: true, onPress: () => a.tab(key) })
    return E.Button({ key: `tab-${key}`, ...tabLabel(E, label, isOpen), hotkey, plain: true, onPress: () => a.tab(key) })
  }
  // Settings stands apart at the right end; the tabs for the work sit on the left, numbered in the order shown.
  return E.Box({
    key: 'tabs',
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: 2,
    children: [row(E, [tab('coach', 'Coach', '1'), tab('analytics', 'Analytics', '2'), tab('week', 'News', '3')]), tab('settings', 'Settings', '4')],
  })
}

function coachTab(E: UI, v: View, a: Actions, F?: Form): RenderElement[] {
  const out: RenderElement[] = []

  // The mode is set under Settings; here only a reminder that live mode is on.
  if (v.mode === 'live') out.push(text(E, `Live ${v.liveCalls}/${LIVE_CAP}`, { dimColor: true }))
  if (!v.modelLabel) {
    out.push(text(E, "This session hasn't said which model it runs yet, so only the general rules apply. The coach picks it up after Claude's next reply.", { color: 'warning', wrap: 'wrap' }))
  } else if (!v.hasModelRules) {
    out.push(text(E, `No rules for ${v.modelLabel} yet, so only the general rules apply. Add its page to sources.json, then run /coach refresh.`, { color: 'warning' }))
  }

  out.push(heading(E, 'Your draft'))
  out.push(v.draft.trim() ? code(E, v.draft) : text(E, 'Type in the prompt box. The coach reads it before you send.', { dimColor: true }))
  // Analyze sits under the draft it reads. Mods have no disabled Button, so a dim label and a press that does nothing stand in for one.
  out.push(
    row(E, [
      E.Button({
        key: 'analyze',
        label: v.isRunning ? 'Analyzing…' : 'Analyze',
        hotkey: 'a',
        ...(v.canAnalyze ? (v.analysis ? {} : { variant: 'primary' as const }) : { dimColor: true }),
        onPress: a.analyze,
      }),
    ]),
  )
  if (v.status) out.push(text(E, v.status, { color: v.status.startsWith('Analyzing') ? 'suggestion' : 'warning' }))
  // The rewrite sits right under the draft, so the two read side by side.
  if (v.analysis) {
    out.push(heading(E, 'Rewrite'))
    out.push(F && REWRITE_EDITABLE ? rewriteField(E, F, v, a) : code(E, v.filledRewrite))
    if (v.analysis.placeholders.length) out.push(...gaps(E, v, a, v.analysis.placeholders, F))
  }

  // Copy to prompt only fills the prompt box; Send fills it and sends.
  if (v.analysis) {
    out.push(
      row(E, [
        E.Button({ key: 'fill', label: 'Copy to prompt', onPress: a.fill }),
        E.Button({ key: 'apply', label: 'Send', hotkey: 'p', variant: 'primary', onPress: a.apply }),
      ]),
    )
  }

  if (v.analysis) {
    const an = v.analysis
    if (v.isStale) out.push(text(E, 'Your draft changed since this analysis. Press Analyze to update it.', { dimColor: true }))
    if (v.analyzedReply) {
      const cut = v.analyzedReply.isCut ? ' It was long, so only its start and end were read.' : ''
      out.push(text(E, `Read as a reply to Claude's last message.${cut}`, { dimColor: true, wrap: 'wrap' }))
    }

    const { rows, after } = checklistWithFixes(E, v, a, an)
    out.push(settingsGroup(E, v, 'checklist', 'Checklist', rows, after, true))
  }

  return out
}

/** The Analytics tab: the statistics first, as Settings drew them, then a thin line and the rules. */
function analyticsTab(E: UI, v: View, a: Actions, F?: Form): RenderElement[] {
  return [
    settingsGroup(E, v, 'statistics', 'Statistics', [block(E, 'statistics', statistics(E, v, a))]),
    ...hairline(E, v, 'analytics'),
    ruleList(E, v, a, F),
  ]
}

/**
 * The rules the coach checks drafts against, to read beside the statistics:
 * the general rules (closed to start), the picked model's (the session's to
 * start, its name a dropdown of every model) and Omar's own, each opened and
 * closed on its own. Each file's Checklist shows as one of its sections.
 * Edit in Settings goes to where his own rules are changed.
 */
function ruleList(E: UI, v: View, a: Actions, F?: Form): RenderElement {
  const r = v.ruleList
  const picked = r.models.find(m => m.file === r.picked)
  const own: RuleSection[] = v.ownRules.rules.length ? [{ section: '', rules: v.ownRules.rules }] : []
  // The mobile app has no fields, so there the models are buttons, the picked one in brackets.
  const none = r.picked ? [] : [{ value: '', label: `${v.modelLabel || 'This model'} (no rules file)` }]
  const modelName = F
    ? // Keyed by the pick: withStableForm hands back the element it drew last while the key stays the
      // same and leaves `value` out of the comparison, so with one key the list kept showing the first pick.
      F.Select({ key: `rules-model-${r.picked || 'none'}`, options: [...none, ...r.models.map(m => ({ value: m.file, label: m.label }))], value: r.picked, onSelect: file => a.pickRules(file) })
    : row(E, r.models.map(m => E.Button({ key: `rules-pick-${m.file}`, ...tabLabel(E, m.label, m.file === r.picked), plain: true, onPress: () => a.pickRules(m.file) })))
  // Boxed like the Week tab's sections (`group`), the last section on the tab.
  return group(E, 'rule-list', 'Rules', [
    text(E, 'What the coach checks your drafts against: the general rules, then the model\'s, then yours, which win when they conflict.', { dimColor: true, wrap: 'wrap' }),
    ruleGroup(E, v, a, 'general', 'General', r.general, 'No general rules found.'),
    ruleGroup(
      E,
      v,
      a,
      'model',
      modelName,
      picked?.sections ?? [],
      picked ? `No rules found for ${picked.label}.` : `${v.modelLabel || 'This model'} has no rules of its own, so only the general rules apply. Pick a model to read its rules.`,
      [],
      r.borrowed ? [text(E, r.borrowed, { color: 'warning', wrap: 'wrap' })] : [],
    ),
    ruleGroup(E, v, a, 'own', 'Your rules', own, 'No rules yet.', [E.Button({ key: 'rules-edit-own', label: 'Edit in Settings', onPress: () => a.tab('settings') })]),
  ], { band: false, indent: true })
}

/**
 * One group in the rules list: its name (or a control naming it), rule count
 * and Show or Hide, any note under that, then when open each section's rules.
 */
function ruleGroup(
  E: UI,
  v: View,
  a: Actions,
  key: RuleGroup,
  label: string | RenderElement,
  sections: RuleSection[],
  empty: string,
  extra: RenderElement[] = [],
  notes: RenderElement[] = [],
): RenderElement {
  const isOpen = v.ruleList.open.includes(key)
  const count = sections.reduce((n, s) => n + s.rules.length, 0)
  const head = E.Box({
    key: `rules-${key}-head`,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 2,
    flexWrap: 'wrap',
    children: [
      E.Box({
        flexDirection: 'row',
        columnGap: 1,
        alignItems: 'center',
        children: [typeof label === 'string' ? text(E, label, { weight: 'semibold' }) : label, text(E, plural(count, 'rule', 'rules'), { dimColor: true })],
      }),
      row(E, [...extra, E.Button({ key: `rules-toggle-${key}`, label: isOpen ? 'Hide' : 'Show', onPress: () => a.toggleRules(key) })]),
    ],
  })
  const body = !isOpen
    ? []
    : count
      ? [E.Markdown({ key: `rules-${key}-list`, text: sections.map(s => [...(s.section ? [`**${s.section}**`] : []), s.rules.map(rule => `- ${rule}`).join('\n')].join('\n\n')).join('\n\n') })]
      : [text(E, empty, { dimColor: true, wrap: 'wrap' })]
  return block(E, `rules-${key}`, [head, ...notes, ...body])
}

/**
 * One list for the draft and the rewrite: each checklist item (how the draft
 * does), then right under it what the rewrite changed for it and the
 * suggestions that fill it, each with Add/Remove. A change belongs to an item
 * when its rule is named like the item. Changes and suggestions that fill no
 * item follow at the end, under "Other changes", "Other suggestions" or both.
 */
function checklistWithFixes(E: UI, v: View, a: Actions, an: Analysis): { rows: RenderElement[]; after: RenderElement[] } {
  const indexed = an.additions.map((s, i) => ({ s, i }))
  const changes = an.changes.map((c, i) => ({ c, i }))
  const fills = (rule: string, item: string) => rule.trim().toLowerCase() === item.toLowerCase()
  const rows: RenderElement[] = []
  for (const c of an.checklist) {
    const m = MARK[c.status]
    const fixes = changes.filter(x => fills(x.c.rule, c.item))
    const mine = indexed.filter(x => x.s.item === c.item)
    // Each item a row of its own: the mark, name and note on one line (v0.24.0, Omar's call), then what fills it, indented.
    rows.push(
      E.Box({
        key: `check-${c.item}`,
        flexDirection: 'column',
        gap: 1,
        children: [
          E.Box({
            key: `check-${c.item}-row`,
            flexDirection: 'row',
            columnGap: 1,
            children: [text(E, m.mark, { color: m.color }), text(E, c.item, { weight: 'semibold' }), text(E, c.note, { dimColor: true, wrap: 'wrap' })],
          }),
          ...fixes.map(x => fix(E, x.i, 'Rewrite', x.c.why)),
          ...mine.map(x => suggestion(E, v, a, x.s, x.i)),
        ],
      }),
    )
  }
  const otherChanges = changes.filter(x => !an.checklist.some(c => fills(x.c.rule, c.item)))
  if (otherChanges.length) rows.push(otherRow(E, 'other-changes', 'Other changes', otherChanges.map(x => fix(E, x.i, x.c.rule, x.c.why))))
  const other = indexed.filter(x => !x.s.item)
  if (other.length) rows.push(otherRow(E, 'other-suggestions', 'Other suggestions', other.map(x => suggestion(E, v, a, x.s, x.i))))
  const after = an.changes.length === 0 ? [text(E, 'The rewrite made no changes.', { dimColor: true })] : []
  return { rows, after }
}

/** A row for what fills no checklist item: its title, then the entries, spaced like an item's. */
function otherRow(E: UI, key: string, title: string, entries: RenderElement[]): RenderElement {
  return E.Box({ key, flexDirection: 'column', gap: 1, children: [text(E, title, { weight: 'semibold' }), ...entries] })
}

/** One change the rewrite made, indented under what it fixes: who made it (the rewrite, or the rule's name) and why it helps. */
function fix(E: UI, i: number, label: string, why: string): RenderElement {
  return E.Box({
    key: `change-${i}`,
    flexDirection: 'column',
    paddingLeft: 2,
    children: [text(E, label, { weight: 'semibold', wrap: 'wrap' }), text(E, why, { wrap: 'wrap' })],
  })
}

/** One suggestion, indented under what it fills: its label, its sentence, and Add (or Remove once added). */
function suggestion(E: UI, v: View, a: Actions, s: Addition, i: number): RenderElement {
  const isAdded = v.added.includes(i)
  return E.Box({
    key: `addition-${v.formGen}-${i}`,
    flexDirection: 'column',
    paddingLeft: 2,
    children: [
      row(E, [
        text(E, `Suggestion: ${s.label}`, { weight: 'semibold', wrap: 'wrap' }),
        E.Button({ key: `add-${v.formGen}-${i}`, ...(isAdded ? tinted(E, 'Remove', 'error') : { label: 'Add' }), onPress: () => a.toggleAddition(i) }),
      ]),
      text(E, s.text, { dimColor: true, wrap: 'wrap' }),
    ],
  })
}

/**
 * Whether the rewrite is an editable field (v0.19.0). Off since v0.19.2: Desktop's
 * bundled Claude Code 2.1.299 drops Input `rows`, so the field is one line there,
 * and Omar chose the v0.18.0 text block until Desktop ships a newer one. Turn it
 * on then; the editing code and its tests are kept.
 */
export const REWRITE_EDITABLE = false

/**
 * The lines a field needs to show all of `text`: each line wrapped at a width
 * a little under the pane's (40 to 60 characters, 60 when the surface hasn't
 * said), plus one spare line, so a guess on the short side never hides text.
 * At most `REWRITE_MAX_ROWS`; a longer text scrolls within the field.
 */
export function rowsFor(text: string, columns?: number): number {
  const width = Math.min(60, Math.max(40, (columns ?? 64) - 4))
  const lines = text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0) + 1
  return Math.min(REWRITE_MAX_ROWS, lines)
}

/** The rewrite field's tallest; past it the field scrolls. */
export const REWRITE_MAX_ROWS = 12

/** The rewrite as a field the person can edit before Apply, across the pane's full width and as tall as its text, up to 12 lines. */
function rewriteField(E: UI, F: Form, v: View, a: Actions): RenderElement {
  return E.Box({
    key: 'rewrite-field',
    flexDirection: 'column',
    alignItems: 'stretch',
    width: '100%',
    children: [
      F.Input({
        key: v.rewriteKey,
        value: v.filledRewrite,
        rows: rowsFor(v.filledRewrite, v.columns),
        submitLabel: 'keep',
        onInput: value => a.editRewrite(value),
        onSubmit: value => a.submitRewrite(value),
      }),
    ],
  })
}

/** A dropdown of likely answers and a text field for each placeholder; on mobile, a list to fill in later. */
function gaps(E: UI, v: View, a: Actions, placeholders: Placeholder[], F?: Form): RenderElement[] {
  const help =
    'A typed answer wins over a pick. Press Enter in a field to update the rewrite; Copy to prompt and Send use what you typed either way. Enter in an empty field removes that gap and its sentence.'
  const out = F ? [...withHelp(E, 'Fill in the gaps', 'gaps-help', help)] : [heading(E, 'Fill in the gaps')]
  if (!F) {
    out.push(text(E, `Fill these in after Apply: ${placeholders.map(p => p.token).join(', ')}`, { dimColor: true, wrap: 'wrap' }))
    return out
  }
  for (const [i, p] of placeholders.entries()) {
    const id = `gap-${v.formGen}-${i}`
    const fields: RenderElement[] = [text(E, p.question, { weight: 'semibold', wrap: 'wrap' })]
    if (p.options.length) {
      fields.push(
        F.Select({
          key: `${id}-pick`,
          label: 'Pick',
          options: [{ value: NO_PICK, label: 'Choose an answer' }, ...p.options.map(o => ({ value: o }))],
          value: v.picked[p.token] ?? NO_PICK,
          onSelect: value => a.pick(p.token, value),
        }),
      )
    }
    fields.push(
      F.Input({
        key: `${id}-type`,
        label: p.options.length ? 'Or type' : 'Answer',
        placeholder: p.token,
        value: v.typed[p.token] ?? '',
        submitLabel: 'fill in',
        onInput: value => a.type(p.token, value),
        onSubmit: value => a.submitAnswer(p.token, value),
      }),
    )
    if (v.removed.includes(p.token)) {
      fields.push(text(E, 'Removed from the rewrite, with its sentence. Type or pick an answer to bring it back.', { color: 'warning', wrap: 'wrap' }))
    }
    out.push(E.Box({ key: id, flexDirection: 'column', children: fields }))
  }
  return out
}

/**
 * A heading with an ⓘ beside it, and the help text in a box that shows while
 * the pointer is on the ⓘ or on the box itself (one hover group): drawn
 * hidden, revealed by the surface on hover, with no hook running.
 */
function withHelp(E: UI, title: string, scope: string, help: string): RenderElement[] {
  return [
    E.Box({
      key: `${scope}-title`,
      flexDirection: 'row',
      columnGap: 1,
      children: [heading(E, title), E.Text({ dimColor: true, hover: { scope, dimColor: false }, children: ['ⓘ'] })],
    }),
    E.Box({
      key: scope,
      display: 'none',
      hover: { scope, display: 'flex' },
      borderStyle: 'round',
      borderColor: 'subtle',
      paddingX: 1,
      children: [text(E, help, { dimColor: true, wrap: 'wrap' })],
    }),
  ]
}

/**
 * The Settings tab, laid out like the Desktop app's own settings: each
 * section a bold title with no box, then its rows, each with its label and a
 * dim description on the left and its control on the right, a thin line
 * between rows.
 */
function settingsTab(E: UI, v: View, a: Actions, F?: Form): RenderElement[] {
  const st = v.settings

  const modeHelp =
    v.mode === 'live' ? `Analyzes each draft when you pause typing (${v.liveCalls}/${LIVE_CAP} this session).` : 'Analyzes only when you press Analyze.'
  const modeControl = F
    ? F.Select({ key: 'mode', options: [{ value: 'manual', label: 'Manual' }, { value: 'live', label: 'Live' }], value: v.mode, onSelect: m => void a.mode(m === 'live' ? 'live' : 'manual') })
    : row(
        E,
        (['manual', 'live'] as const).map(m => {
          const label = m === 'live' ? 'Live' : 'Manual'
          return E.Button({ key: `mode-${m}`, label: m === v.mode ? `[${label}]` : label, plain: true, onPress: () => a.mode(m) })
        }),
      )
  const general: RenderElement[] = [
    settingRow(E, 'mode', 'Mode', modeHelp, modeControl),
    modelSetting(E, a, 'rewriteModel', 'Rewrite model', 'Used for Analyze, live mode and /improve.', st.rewriteModel, st.rewriteChoices, st.readOnlyReason, F),
    modelSetting(E, a, 'refreshModel', 'Refresh model', 'Rewrites the rules on /coach refresh.', v.refreshModel, st.refreshChoices, st.readOnlyReason, F),
  ]
  const generalNote = st.readOnlyReason
    ? [text(E, `These can't be changed from the pane here (${st.readOnlyReason}). Change them under /config in a terminal session.`, { color: 'warning', wrap: 'wrap' })]
    : st.note
      ? [text(E, st.note, { dimColor: true, wrap: 'wrap' })]
      : []

  // The source pages, always listed: where the rules come from, before the refresh that updates them.
  const sources: RenderElement[] = [
    E.Box({ flexDirection: 'column', children: [text(E, 'Sources'), text(E, 'The pages the rules come from.', { dimColor: true, wrap: 'wrap' })] }),
    ...v.sources.map(url => E.Box({ key: `source-${url}`, children: [E.Link({ href: url, label: url.replace(/^https:\/\//, '') })] })),
  ]

  // More space between sections than between rows: the largest spacing step, which Desktop sizes with its own scale.
  return [
    E.Box({
      key: 'settings-sections',
      flexDirection: 'column',
      gap: 'xl',
      children: [
        settingsGroup(E, v, 'general', 'General', general, generalNote, true),
        settingsGroup(E, v, 'own-rules', 'Your rules', ownRulesSettings(E, v, a, F), [], true),
        settingsGroup(E, v, 'rules', 'Rules', [block(E, 'sources', sources), block(E, 'refresh', refreshSection(E, v, a))], [], true),
        settingsGroup(E, v, 'week', 'Claude Week', weekSettings(E, v, a, F), [], true),
      ],
    }),
  ]
}

/**
 * Omar's own rules: where they're kept, each rule with Remove, and a field to
 * add one. The mobile app has no fields, so there the list is read-only.
 */
function ownRulesSettings(E: UI, v: View, a: Actions, F?: Form): RenderElement[] {
  const o = v.ownRules
  const rules = o.rules.length
    ? o.rules.map(rule =>
        E.Box({
          key: `own-rule-${rule}`,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          columnGap: 2,
          flexWrap: 'wrap',
          children: [
            E.Box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, children: [text(E, rule, { wrap: 'wrap' })] }),
            E.Button({ key: `remove-rule-${rule}`, label: 'Remove', onPress: () => a.removeRule(rule) }),
          ],
        }),
      )
    : [text(E, 'No rules yet.', { dimColor: true })]
  const add = F
    ? [
        F.Input({
          key: `add-rule-${o.gen}`,
          label: 'Add a rule',
          placeholder: "One rule, such as: Keep the draft's language.",
          value: '',
          submitLabel: 'add',
          onSubmit: value => void a.addRule(value),
        }),
      ]
    : [text(E, 'Add rules in Desktop or the terminal.', { dimColor: true, wrap: 'wrap' })]
  const note = o.note ? [text(E, o.note, { ...(o.note.startsWith('Not saved') ? { color: 'warning' } : { dimColor: true }), wrap: 'wrap' })] : []
  return [
    block(E, 'own-rules-file', [
      E.Box({
        flexDirection: 'column',
        children: [
          text(E, 'Rules file'),
          text(E, 'Sent with every analysis and /improve, after the general and model rules; yours win when they conflict. Updates never touch this file, and you can edit it by hand.', { dimColor: true, wrap: 'wrap' }),
        ],
      }),
      o.path ? code(E, o.path) : text(E, "The mod's data folder wasn't found.", { color: 'warning', wrap: 'wrap' }),
    ]),
    block(E, 'own-rules-list', [...rules, ...add, ...note]),
  ]
}

/** Claude Week's settings: the model that writes it, the reader profile it writes for, and the pages it reads. */
function weekSettings(E: UI, v: View, a: Actions, F?: Form): RenderElement[] {
  const w = v.week
  const st = v.settings
  const labelled = (label: string, help: string) =>
    E.Box({ flexDirection: 'column', children: [text(E, label), text(E, help, { dimColor: true, wrap: 'wrap' })] })
  const pages = w.sources
    ? w.sources.map(s => E.Box({ key: `week-source-${s.url}`, children: [E.Link({ href: s.link ?? s.url, label: `Tier ${s.tier} · ${s.label}` })] }))
    : [text(E, "Couldn't read week/sources.json.", { color: 'warning', wrap: 'wrap' })]
  return [
    modelSetting(E, a, 'weekModel', 'Week model', 'Writes each Claude Week edition from the fetched pages.', w.weekModel, st.weekChoices, st.readOnlyReason, F),
    block(E, 'week-profile', [
      labelled('Reader profile', 'What the writer knows about you. Edit this file to steer future editions; installing or updating the mod leaves it alone.'),
      code(E, w.profilePath),
      ...(w.profileNote ? [text(E, w.profileNote, { color: w.profileNote.startsWith("Couldn't") ? 'warning' : 'suggestion', wrap: 'wrap' })] : []),
    ]),
    block(E, 'week-sources', [labelled('Sources', 'The pages Write reads each week (week/sources.json).'), ...pages]),
  ]
}

/**
 * A settings section: its bold title (normal text color, no band), then its
 * rows with a thin line between each two. `after` follows the last row with
 * no line, as a note under the section. The rows sit a cell in from the
 * title (v0.20.1). With `boxed` (the Settings tab, since v0.20.0) it sits in
 * the same bordered box as the Analytics tab's Rules, its title with no band
 * and no padding; without it (Statistics), in no box.
 */
function settingsGroup(E: UI, v: View, key: string, title: string, rows: RenderElement[], after: RenderElement[] = [], boxed = false): RenderElement {
  const lined = rows.flatMap((r, i) => (i === 0 ? [r] : [...hairline(E, v, `${key}-${i}`), r]))
  const body = E.Box({ key: `group-${key}-box`, flexDirection: 'column', gap: 1, paddingLeft: 1, children: [...lined, ...after] })
  if (boxed) return group(E, key, title, [body], { band: false, titlePad: false })
  return E.Box({ key: `group-${key}`, flexDirection: 'column', gap: 1, children: [heading(E, title), body] })
}

/**
 * The thin line between two settings rows, as in Desktop's settings: a
 * 1-pixel Svg the width of the pane. A mod can't border one side of a Box, so
 * it's a picture; its translucent gray reads on light and dark alike, since an
 * Svg can't use the theme's colors. The terminal has no Svg, so it gets none.
 */
const HAIRLINE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1" viewBox="0 0 4000 1" preserveAspectRatio="none"><rect width="4000" height="1" fill="rgb(128,128,128)" fill-opacity="0.3"/></svg>'

function hairline(E: UI, v: View, key: string): RenderElement[] {
  if (!E.Svg || (v.surface !== 'desktop' && v.surface !== 'mobile')) return []
  return [E.Box({ key: `line-${key}`, children: [E.Svg({ source: HAIRLINE, alt: '', height: 1 })] })]
}

/** Several elements kept together as one settings row, with no lines inside. */
function block(E: UI, key: string, children: RenderElement[]): RenderElement {
  return E.Box({ key: `block-${key}`, flexDirection: 'column', gap: 1, children })
}

/**
 * A bordered group, its title on a subtle band (the Week tab's sections), or
 * with `band` false on no band (the Analytics tab's Rules, v0.20.2). With
 * `titlePad` false the title has no padding either (the Settings tab's). With
 * `indent`, its items sit a cell in from the title (the Analytics tab's Rules).
 * Theme keys only, so it follows light and dark.
 */
function group(E: UI, key: string, title: string, children: RenderElement[], { band = true, titlePad = true, indent = false } = {}): RenderElement {
  const head = E.Box({ ...(band ? { backgroundColor: 'subtle' as const } : {}), ...(titlePad ? { paddingX: 1 } : {}), children: [heading(E, title)] })
  const items = indent ? [E.Box({ key: `group-${key}-items`, flexDirection: 'column', gap: 1, paddingLeft: 1, children })] : children
  return E.Box({
    key: `group-${key}`,
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: 'subtle',
    paddingX: 1,
    gap: 1,
    children: [head, ...items],
  })
}

/** One setting: its label and help on the left, its control pushed to the right; it wraps when the pane is narrow. */
function settingRow(E: UI, key: string, label: string, help: string, control: RenderElement): RenderElement {
  return E.Box({
    key: `setting-${key}`,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    columnGap: 2,
    flexWrap: 'wrap',
    children: [
      // The label in the normal weight and color, the description dim under it, as Desktop's settings rows are.
      E.Box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, children: [text(E, label), text(E, help, { dimColor: true, wrap: 'wrap' })] }),
      control,
    ],
  })
}

/**
 * One model setting: a dropdown where the surface has one, a row of buttons
 * on mobile (the current choice in brackets), or the value alone once the
 * pane may not change it. The control sits right of its label.
 */
function modelSetting(
  E: UI,
  a: Actions,
  field: ModelSetting,
  label: string,
  help: string,
  value: string,
  choices: readonly string[],
  readOnly: string | undefined,
  F?: Form,
): RenderElement {
  let control: RenderElement
  if (readOnly) {
    control = text(E, value, { weight: 'semibold' })
  } else if (F) {
    control = F.Select({ key: `set-${field}`, options: choices.map(c => ({ value: c })), value, onSelect: next => a.setModel(field, next) })
  } else {
    control = row(
      E,
      choices.map(c =>
        E.Button({ key: `set-${field}-${c}`, label: c === value ? `[${c}]` : c, plain: true, onPress: () => a.setModel(field, c) }),
      ),
    )
  }
  return settingRow(E, field, label, help, control)
}

/**
 * What the analyses add up to, in the order that helps most (v0.11.0): the
 * score and its trend, the one item to work on next with an example from the
 * person's own drafts, each item missing or vague (left out against vague,
 * the last drafts against the ones before), what the drafts do well, what the
 * coach changed most for this model, how much advice was taken, then tokens.
 */
function statistics(E: UI, v: View, a: Actions): RenderElement[] {
  if (!STATS_ON) return [text(E, 'Statistics are off while the checklist design changes.', { dimColor: true, wrap: 'wrap' })]
  const an = v.analytics
  if (!an.drafts.length && !tokenSummary(an)) return [text(E, 'No analyses yet. Each Analyze adds to these statistics.', { dimColor: true })]
  return [
    ...(an.drafts.length
      ? [scoreLine(E, an), ...focusBlock(E, an), gapBars(E, an), strengthsBlock(E, an), changedBars(E, an, v.modelLabel), adviceLine(E, an)]
      : []),
    ...tokensLine(E, an),
    E.Button({ key: 'clear-lessons', ...tinted(E, 'Clear statistics', 'error'), plain: true, dimColor: true, onPress: a.clearAnalytics }),
  ]
}

const fmt = (n: number) => n.toLocaleString('en-US')
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A semibold section title with lines under it, keyed `key`. */
function statBlock(E: UI, key: string, title: string, children: RenderElement[]): RenderElement {
  return E.Box({ key: `stats-${key}`, flexDirection: 'column', children: [text(E, title, { weight: 'semibold' }), ...children] })
}

/** How many cells a bar has. */
export const BAR_CELLS = 15

/**
 * A bar's filled and empty runs: `n` of `of` cells, always BAR_CELLS in all.
 * Both are █, the empty run drawn dim, so the two parts are the same height
 * (Desktop's monospaced face draws ░ shorter than █).
 */
export function barRuns(n: number, of: number): [string, string] {
  const filled = of > 0 ? Math.max(0, Math.min(BAR_CELLS, Math.round((BAR_CELLS * n) / of))) : 0
  return ['█'.repeat(filled), '█'.repeat(BAR_CELLS - filled)]
}

/** A no-break space: Desktop keeps it, where it would fold ordinary spaces together. */
const NBSP = '\u00A0'

/**
 * The count after a bar: two spaces, then the count padded on the left to
 * `width` characters, so in the monospaced face every line is as wide and
 * the bars line up (Desktop's own face is proportional).
 */
export function barCount(count: string, width: number): string {
  return `${NBSP}${NBSP}${count.padStart(width, NBSP)}`
}

/** One bar line's right-hand side, monospaced: the filled run, the empty run dimmed, then the count. */
function barText(E: UI, n: number, of: number, count: string, width: number): RenderElement {
  const [filled, empty] = barRuns(n, of)
  return E.Text({ mono: true, children: [filled, E.Text({ dimColor: true, children: [empty] }), barCount(count, width)] })
}

/** The count of drafts and the average score of the last ones, up or down from the ones before. */
function scoreLine(E: UI, an: Analytics): RenderElement {
  const t = scoreTrend(an)!
  const n = Math.min(an.drafts.length, RECENT)
  const trend = t.before === undefined ? '' : t.recent > t.before ? `, up from ${t.before}` : t.recent < t.before ? `, down from ${t.before}` : ', the same as before'
  return E.Box({
    key: 'stats-score',
    flexDirection: 'column',
    children: [
      text(E, `${plural(an.drafts.length, 'analysis', 'analyses')} · your last ${plural(n, 'draft scores', 'drafts score')} ${t.recent} of 6 on average${trend}.`, { wrap: 'wrap' }),
      text(E, 'A point for each checklist item a draft covers (or doesn\'t need), half for a vague one.', { dimColor: true, wrap: 'wrap' }),
    ],
  })
}

/** The one item to work on next, with the newest sentence the coach suggested for it. */
function focusBlock(E: UI, an: Analytics): RenderElement[] {
  const f = focus(an)
  if (!f) return []
  return [
    statBlock(E, 'focus', `Work on next: ${f.item}`, [
      text(E, `Missing or vague in ${f.gaps} of your last ${plural(f.of, 'draft', 'drafts')}.`, { wrap: 'wrap' }),
      ...(f.example ? [text(E, `For example: “${f.example}”`, { dimColor: true, wrap: 'wrap' })] : []),
    ]),
  ]
}

/** One bar line: the name with a dim note under it on the left, the bar and its count on the right. */
function barRow(E: UI, key: string, name: string, note: string, n: number, of: number, width: number): RenderElement {
  return E.Box({
    key,
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 2,
    children: [
      E.Box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, children: [text(E, name, { wrap: 'wrap' }), ...(note ? [text(E, note, { dimColor: true, wrap: 'wrap' })] : [])] }),
      barText(E, n, of, `${n} of ${of}`, width),
    ],
  })
}

/** Each item missing or vague, worst first: how often it was left out against vague, and the last drafts against the ones before. */
function gapBars(E: UI, an: Analytics): RenderElement {
  const stats = itemStats(an).filter(s => s.missing + s.vague > 0)
  const width = Math.max(0, ...stats.map(s => `${s.missing + s.vague} of ${s.applicable}`.length))
  const rows = stats.map(s => {
    const last = `last ${s.recent.of}: ${s.recent.gaps}${s.before ? `, the ${s.before.of} before: ${s.before.gaps}` : ''}`
    return barRow(E, `bars-missing-${s.item}`, s.item, `${s.missing} left out · ${s.vague} vague · ${last}`, s.missing + s.vague, s.applicable, width)
  })
  return statBlock(E, 'missing', 'Missing or vague', rows.length ? rows : [text(E, 'Nothing yet. Your drafts have covered the checklist.', { dimColor: true, wrap: 'wrap' })])
}

/** What the drafts do well: items present in most of them. */
function strengthsBlock(E: UI, an: Analytics): RenderElement {
  const good = strengths(an)
  return statBlock(
    E,
    'strengths',
    'What you do well',
    good.length
      ? good.map(g => text(E, `${g.item}: in ${g.present} of ${plural(g.of, 'draft', 'drafts')}`, { wrap: 'wrap' }))
      : [text(E, 'Nothing stands out yet. Items your drafts cover most of the time show here.', { dimColor: true, wrap: 'wrap' })],
  )
}

/** The rules behind the most changes, for the session's model when it's known. */
function changedBars(E: UI, an: Analytics, model: string): RenderElement {
  const { rules, of } = rulesFor(an, model)
  const width = `${of} of ${of}`.length
  const title = model ? `What the coach changed most · ${model}` : 'What the coach changed most'
  const rows = rules.map(([rule, n], i) => barRow(E, `bars-rules-${i}`, rule, '', Math.min(n, of), of, width))
  const empty = of ? 'None yet.' : `No analyses with ${model} yet.`
  return statBlock(E, 'rules', title, rows.length ? rows : [text(E, empty, { dimColor: true, wrap: 'wrap' })])
}

/** How much of the coach's advice was taken. */
function adviceLine(E: UI, an: Analytics): RenderElement {
  const t = advice(an)
  return statBlock(E, 'advice', 'Advice you took', [
    text(E, `Added ${t.added} of ${plural(t.offered, 'suggestion', 'suggestions')} · applied ${t.applied} of ${plural(t.drafts, 'rewrite', 'rewrites')}`, { wrap: 'wrap' }),
  ])
}

/** The tokens the analyses used, last and dim: they say what the coaching costs, not how to prompt. */
function tokensLine(E: UI, an: Analytics): RenderElement[] {
  const t = tokenSummary(an)
  return t ? [text(E, `${fmt(t.total)} tokens used by analyses (≈${fmt(t.perCall)} each).`, { dimColor: true, wrap: 'wrap' })] : []
}

/** /coach refresh: the check, its progress, and each changed file's diff to accept or reject. */
function refreshSection(E: UI, v: View, a: Actions): RenderElement[] {
  const r = v.refresh
  const out: RenderElement[] = [
    text(
      E,
      `Checks the pages in sources.json for changes since your last refresh. Only files whose pages changed are rewritten, by ${v.refreshModel}. Nothing changes until you accept, and your own rules are never touched.`,
      { wrap: 'wrap', dimColor: true },
    ),
  ]

  if (r.isRunning) {
    out.push(text(E, r.progress, { color: 'suggestion' }))
    return out
  }
  if (r.results.length === 0) {
    out.push(
      row(E, [
        E.Button({ key: 'refresh', label: 'Check sources for updates', variant: 'primary', onPress: a.refresh }),
        E.Button({ key: 'rewrite-all', label: 'Rewrite all', plain: true, dimColor: true, onPress: a.rewriteAll }),
      ]),
    )
    if (r.progress) out.push(text(E, r.progress, { wrap: 'wrap' }))
    return out
  }

  const changed = r.results.filter(x => x.state === 'changed')
  out.push(text(E, r.progress))
  for (const x of r.results) {
    if (x.state === 'same') out.push(text(E, `${x.target}: no change`, { dimColor: true }))
    if (x.state === 'failed') out.push(text(E, `${x.target}: kept as is (${x.reason})`, { color: 'warning' }))
  }
  for (const x of changed) {
    out.push(heading(E, x.target))
    out.push(E.Box({ key: `diff-${x.target}`, children: [E.Code({ source: x.diff, format: 'diff', wrap: 'wrap' })] }))
  }
  out.push(
    row(E, [
      ...(changed.length
        ? [
            E.Button({ key: 'accept', label: `Accept ${changed.length} ${changed.length === 1 ? 'file' : 'files'}`, variant: 'primary', onPress: a.accept }),
            E.Button({ key: 'reject', ...tinted(E, 'Reject', 'error'), onPress: a.reject }),
          ]
        : [E.Button({ key: 'reject', label: 'Done', onPress: a.reject })]),
    ]),
  )
  return out
}

// ---- The Week tab (labelled News since v0.10.1; its key stays tab-week) ----

/**
 * The Week tab: one Claude Week edition. The title, range, intro and what
 * changed from feedback; the Top 3; how much is read; then each section in a
 * bordered group, the questions and the sources. Older and Newer step through
 * the stored editions, Archive lists them all; the write button starts this
 * week's edition.
 */
function weekTab(E: UI, v: View, a: Actions, F?: Form): RenderElement[] {
  const w = v.week
  if (w.archive) return weekArchive(E, v, a)
  const out: RenderElement[] = []
  const ed = w.edition

  const i = ed ? w.editionIds.indexOf(ed.edition_id) : -1
  const nav: RenderElement[] = []
  const older = i >= 0 ? w.editionIds[i + 1] : undefined
  const newer = i > 0 ? w.editionIds[i - 1] : undefined
  if (older) nav.push(E.Button({ key: 'week-older', label: '‹ Older', onPress: () => a.week.show(older) }))
  if (newer) nav.push(E.Button({ key: 'week-newer', label: 'Newer ›', onPress: () => a.week.show(newer) }))
  if (w.editionIds.length >= 2) nav.push(E.Button({ key: 'week-archive', label: 'Archive', onPress: a.week.openArchive }))
  const hasCurrent = w.editionIds.includes(w.currentId)
  if (!hasCurrent && w.job.state !== 'running') {
    nav.push(
      E.Button({
        key: 'week-write',
        label: w.job.state === 'failed' ? 'Try again' : `Write ${w.currentTitle}`,
        variant: 'primary',
        onPress: a.week.write,
      }),
    )
  }

  if (w.job.state === 'running') {
    const at = new Date(w.job.startedAt).toISOString().slice(11, 16)
    out.push(text(E, `${w.job.title}, started ${at} UTC: ${w.job.progress} You can keep working.`, { color: 'suggestion', wrap: 'wrap' }))
  } else if (w.job.state === 'failed') {
    out.push(text(E, `Couldn't write ${w.job.title}: ${w.job.reason}`, { color: 'warning', wrap: 'wrap' }))
  }

  if (!ed) {
    out.push(text(E, "No edition yet. Write reads the pages listed under Settings → Claude Week, then the Week model writes the week's stories.", { dimColor: true, wrap: 'wrap' }))
    if (nav.length) out.push(row(E, nav))
    return out
  }

  const range = ed.date_from && ed.date_to ? ` · ${dateRange(ed.date_from, ed.date_to)}` : ''
  out.push(heading(E, `${ed.title}${range}`))
  if (ed.intro) out.push(text(E, ed.intro, { wrap: 'wrap' }))
  if (ed.feedback_note) out.push(text(E, `From your feedback: ${ed.feedback_note}`, { dimColor: true, wrap: 'wrap' }))
  if (nav.length) out.push(row(E, nav))

  const all = ed.sections.flatMap(s => s.stories)
  const top = ed.top3.map(id => all.find(s => s.id === id)).filter((s): s is Story => !!s)
  if (top.length) {
    out.push(
      E.Box({
        key: 'week-top3',
        flexDirection: 'column',
        children: [
          heading(E, 'Top 3'),
          ...top.map((s, n) => {
            const section = ed.sections.find(x => x.stories.includes(s))?.title ?? ''
            return text(E, `${w.read[s.id] ? '✓' : `${n + 1}.`} ${s.title}${section ? ` — ${section}` : ''}`, { wrap: 'wrap', dimColor: !!w.read[s.id] })
          }),
        ],
      }),
    )
  }

  const counts = readCounts(ed, w.read)
  out.push(
    E.Box({
      key: 'week-progress',
      flexDirection: 'column',
      children: [
        text(E, `${counts.read} of ${counts.total} stories read`),
        text(E, counts.sections.map(s => `${s.title} ${s.read}/${s.total}`).join(' · '), { dimColor: true, wrap: 'wrap' }),
      ],
    }),
  )

  for (const s of ed.sections) {
    const children: RenderElement[] = []
    if (s.note) children.push(text(E, s.note, { dimColor: true, wrap: 'wrap' }))
    for (const story of s.stories) children.push(storyCard(E, w, a, story, F))
    out.push(group(E, `week-${s.id}`, s.range ? `${s.title} · ${s.range}` : s.title, children))
  }

  if (ed.questions.length) {
    out.push(heading(E, 'Questions to think about'))
    for (const [n, q] of ed.questions.entries()) {
      out.push(
        E.Box({
          key: `week-q-${ed.edition_id}-${n}`,
          flexDirection: 'column',
          children: [
            text(E, q.text, { wrap: 'wrap' }),
            ...(q.prompt ? [E.Button({ key: `week-q-aside-${ed.edition_id}-${n}`, label: 'Ask in side chat', onPress: () => a.week.askAside(asideAboutQuestion(q, ed.title)) })] : []),
          ],
        }),
      )
    }
  }

  if (ed.sources.length) {
    out.push(
      E.Box({
        key: 'week-sources',
        flexDirection: 'column',
        children: [heading(E, 'Sources'), ...ed.sources.map(l => E.Link({ href: l.url, label: l.label }))],
      }),
    )
  }
  return out
}

/**
 * Every stored edition, newest first: its title and dates, how many stories
 * are read and voted on, and Open, which shows it as it was written, with the
 * votes, reasons, takes and read marks saved for it. Back returns to the edition.
 */
function weekArchive(E: UI, v: View, a: Actions): RenderElement[] {
  const w = v.week
  const shown = w.edition?.edition_id
  const rows = w.archiveRows.map(r =>
    settingRow(
      E,
      `week-archive-${r.id}`,
      `${r.title}${r.range ? ` · ${r.range}` : ''}${r.id === shown ? ' (showing)' : ''}`,
      `${r.read} of ${r.total} read · ${r.voted} voted`,
      E.Button({ key: `week-open-${r.id}`, label: 'Open', onPress: () => a.week.show(r.id) }),
    ),
  )
  return [
    E.Box({
      key: 'week-archive-list',
      flexDirection: 'column',
      gap: 1,
      children: [
        row(E, [heading(E, 'Archive'), E.Button({ key: 'week-archive-back', label: 'Back', onPress: a.week.closeArchive })]),
        ...rows.flatMap((r, i) => (i === 0 ? [r] : [...hairline(E, v, `week-archive-${i}`), r])),
      ],
    }),
  ]
}

/**
 * One story. Read, it folds to its title with a check and Reopen. Open: the
 * summary, the links, then Up, Down, Your take, Mark read, More detail and
 * Ask in side chat. A vote opens its reason field; Your take opens its own.
 * On mobile, which has no fields, saved reasons and takes show as text.
 */
function storyCard(E: UI, w: WeekView, a: Actions, s: Story, F?: Form): RenderElement {
  if (w.read[s.id]) {
    return E.Box({
      key: `story-${s.id}`,
      flexDirection: 'row',
      columnGap: 2,
      flexWrap: 'wrap',
      children: [text(E, `✓ ${s.title}`, { dimColor: true, wrap: 'wrap' }), E.Button({ key: `read-${s.id}`, label: 'Reopen', onPress: () => a.week.toggleRead(s.id) })],
    })
  }

  const fb = w.feedback[s.id]
  const children: RenderElement[] = [text(E, s.title, { weight: 'semibold', wrap: 'wrap' })]
  if (s.summary) children.push(text(E, s.summary, { wrap: 'wrap' }))
  if (s.detail && w.details.includes(s.id)) children.push(text(E, s.detail, { dimColor: true, wrap: 'wrap' }))
  if (s.ask) children.push(text(E, `Ask yourself: ${s.ask}`, { dimColor: true, wrap: 'wrap' }))
  if (s.links.length) {
    children.push(E.Box({ key: `links-${s.id}`, flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children: s.links.map(l => E.Link({ href: l.url, label: l.label })) }))
  }

  const voteButton = (verdict: 'up' | 'down', label: string) =>
    E.Button({ key: `${verdict}-${s.id}`, label, ...(fb?.verdict === verdict ? { variant: 'primary' as const } : {}), onPress: () => a.week.vote(s.id, verdict) })
  children.push(
    row(E, [
      voteButton('up', '▲ Up'),
      voteButton('down', '▼ Down'),
      ...(F ? [E.Button({ key: `take-${s.id}`, label: 'Your take', onPress: () => a.week.toggleTake(s.id) })] : []),
      E.Button({ key: `read-${s.id}`, label: 'Mark read', onPress: () => a.week.toggleRead(s.id) }),
      ...(s.detail ? [E.Button({ key: `detail-${s.id}`, label: w.details.includes(s.id) ? 'Less detail' : 'More detail', onPress: () => a.week.toggleDetail(s.id) })] : []),
      ...(s.prompt ? [E.Button({ key: `aside-${s.id}`, label: 'Ask in side chat', onPress: () => a.week.askAside(asideAboutStory(s)) })] : []),
    ]),
  )

  const isTakeOpen = w.takes.includes(s.id)
  if (F) {
    if (fb?.verdict) {
      children.push(
        F.Input({
          key: `why-${s.id}`,
          label: fb.verdict === 'up' ? 'Why upvote?' : 'Why downvote?',
          placeholder: fb.verdict === 'up' ? 'What made it worth reading' : 'Too basic, not my work, unreliable source, too long…',
          value: fb.why ?? '',
          submitLabel: 'save',
          onInput: value => a.week.typeWhy(s.id, value),
          onSubmit: value => void a.week.submitWhy(s.id, value),
        }),
      )
    }
    if (isTakeOpen) {
      children.push(
        F.Input({
          key: `take-field-${s.id}`,
          label: 'Your take',
          placeholder: 'How this meets your own work',
          value: fb?.take ?? '',
          submitLabel: 'save',
          onInput: value => a.week.typeTake(s.id, value),
          onSubmit: value => void a.week.submitTake(s.id, value),
        }),
      )
    }
  } else if (fb?.why || fb?.take) {
    if (fb.why) children.push(text(E, `Why: ${fb.why}`, { dimColor: true, wrap: 'wrap' }))
    if (fb.take) children.push(text(E, `Your take: ${fb.take}`, { dimColor: true, wrap: 'wrap' }))
    children.push(text(E, 'Edit these in Desktop or the terminal.', { dimColor: true }))
  }
  const saved = w.saves[s.id]
  if (saved) children.push(text(E, saved, { ...(saved.startsWith('Not saved') ? { color: 'warning' } : { dimColor: true }), wrap: 'wrap' }))

  return E.Box({ key: `story-${s.id}`, flexDirection: 'column', children })
}

// ---- Small builders ----

function text(E: UI, value: string, props: Record<string, unknown> = {}): RenderElement {
  return E.Text({ ...props, children: [value] })
}

/**
 * A Button's label drawn in a color. A Button takes no color of its own, so
 * its label goes in a colored Text child; `label` still names the control.
 * Colors are theme keys, so they follow the light and dark themes. Following
 * the desktop app's design system (CDS), buttons stay neutral: color only for
 * meaning (red for a destructive action) and clay only for the open tab.
 */
function tinted(E: UI, label: string, color: string): { label: string; children: RenderElement[] } {
  return { label, children: [E.Text({ color, children: [label] })] }
}

/** A tab's label: the open tab in brackets and the accent color, the others as before. */
function tabLabel(E: UI, label: string, isOpen: boolean): { label: string; children?: RenderElement[] } {
  return isOpen ? tinted(E, `[${label}]`, 'claude') : { label }
}

function heading(E: UI, value: string): RenderElement {
  // Section headings in the normal text color, as the desktop app's own (CDS) are.
  return E.Text({ weight: 'semibold', children: [value] })
}

function code(E: UI, source: string): RenderElement {
  return E.Code({ source, wrap: 'wrap' })
}

function row(E: UI, children: RenderElement[]): RenderElement {
  return E.Box({ flexDirection: 'row', columnGap: 2, flexWrap: 'wrap', children })
}
