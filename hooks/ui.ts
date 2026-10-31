// The coach pane's drawing: pure functions from what the pane shows to an
// element tree. No `$`; the hooks module hands in the elements and actions.
import type { Elements, RenderElement, UiPressArgument } from 'claude-code'

import { type Addition, type Analysis, type CheckStatus, LIVE_CAP, type ModelRules, NO_PICK, type Placeholder, type QuickInstruction, type RuleSection } from './lib.ts'
import { type ArchiveRow, type Edition, type FeedbackStore, type ReadState, type Story, type WeekSource, asideAboutQuestion, asideAboutStory, dateRange, readCounts, versionsLine } from './week.ts'

/** The elements every surface draws, so one tree fits the terminal, Desktop and mobile. */
export type UI = Pick<Elements['mobile'], 'Box' | 'Text' | 'Button' | 'Link' | 'Code' | 'Markdown'> & Partial<Pick<Elements['mobile'], 'Svg'>>
/** The form fields the terminal, Desktop and VS Code draw; the mobile app has none. */
export type Form = Pick<Elements['desktop'], 'Input' | 'Select'>

export type Tab = 'coach' | 'settings' | 'week'
export type Mode = 'manual' | 'live'
/** The groups in the rules list under Settings, each opened and closed on its own. */
export type RuleGroup = 'general' | 'model'
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
  /** The session model's quick instructions, as buttons under the draft. */
  quick: QuickInstruction[]
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
  /** True when the prompt box no longer holds the draft that was analyzed. */
  isStale: boolean
  liveCalls: number
  ownRules: OwnRules
  ruleList: RuleList
  sources: string[]
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

/** The rules list under Settings: the shipped files as sections, the model picked, and which groups are open. */
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
  /** The Claude Code version this session runs and the installed Claude Desktop version, shown at the top of the tab. */
  versions: { code?: string; desktop?: string }
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
  weekChoices: readonly string[]
  /** Why the model settings can't be changed here, once a change was refused; undefined while they can. */
  readOnlyReason?: string
  /** What the last change did, shown under the controls. */
  note: string
}

export type ModelSetting = 'rewriteModel' | 'weekModel'

/** What the pane's controls do. Each may return the work it started, so a press can wait for it. */
export type Actions = {
  tab: (tab: Tab) => void
  pickRules: (file: string) => void
  toggleRules: (group: RuleGroup) => void
  mode: (mode: Mode) => Promise<void>
  analyze: () => Promise<void>
  apply: () => Promise<void> | undefined
  toggleAddition: (index: number) => void
  toggleQuick: (index: number) => Promise<void>
  editRewrite: (value: string) => void
  submitRewrite: (value: string) => void
  pick: (token: string, value: string) => void
  type: (token: string, value: string) => void
  submitAnswer: (token: string, value: string) => void
  setModel: (field: ModelSetting, value: string) => void
  addRule: (typed: string) => Promise<void>
  removeRule: (rule: string) => Promise<void>
  week: WeekActions
}

/** What the Week tab's controls do. */
export type WeekActions = {
  write: () => Promise<void> | undefined
  /** Rewrite this week's stored edition at once: add the stories it lacks (nothing is removed). */
  redo: () => Promise<void> | undefined
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
    v.tab === 'settings' ? settingsTab(E, v, a, F) : v.tab === 'week' ? weekTab(E, v, a, F) : coachTab(E, v, a, F)
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
    children: [row(E, [tab('coach', 'Coach', '1'), tab('week', 'News', '2')]), tab('settings', 'Settings', '3')],
  })
}

function coachTab(E: UI, v: View, a: Actions, F?: Form): RenderElement[] {
  const out: RenderElement[] = []

  // The mode is set under Settings; here only a reminder that live mode is on.
  if (v.mode === 'live') out.push(text(E, `Live ${v.liveCalls}/${LIVE_CAP}`, { dimColor: true }))
  if (!v.modelLabel) {
    out.push(text(E, "This session hasn't said which model it runs yet, so only the general rules apply. The coach picks it up after Claude's next reply.", { color: 'warning', wrap: 'wrap' }))
  } else if (!v.hasModelRules) {
    out.push(text(E, `No rules for ${v.modelLabel} yet, so only the general rules apply. Its rules come once its guide is added to sources.json and the weekly refresh runs.`, { color: 'warning' }))
  }

  // The draft box has no label since v0.26.0.
  out.push(v.draft.trim() ? code(E, v.draft) : text(E, 'Type in the prompt box. The coach reads it before you send.', { dimColor: true }))
  // Quick instructions (v0.37.0): the model's own short lines, added to the prompt box (or, with a rewrite on screen, to the
  // rewrite) with one press and taken out with another, no analysis needed. Plain buttons whose look never changes.
  if (v.quick.length) out.push(quickRow(E, v, a))
  // Rewrite (the analyze button) sits under the draft it reads, always active and always the primary style: it used to
  // drop to the plain style once a rewrite existed, which read as grayed out in Desktop (v0.25.3).
  out.push(
    row(E, [
      E.Button({
        key: 'analyze',
        label: v.isRunning ? 'Rewriting…' : 'Rewrite',
        hotkey: 'a',
        variant: 'primary',
        onPress: a.analyze,
      }),
    ]),
  )
  if (v.status) out.push(text(E, v.status, { color: v.status.startsWith('Rewriting') ? 'suggestion' : 'warning' }))
  // The rewrite sits right under the draft, so the two read side by side; Send right under it (Copy to prompt went in v0.29.0)
  // (v0.26.0), then the gap questions, then the suggestions to add.
  if (v.analysis) {
    out.push(F && REWRITE_EDITABLE ? rewriteField(E, F, v, a) : code(E, v.filledRewrite))
    // Send fills the prompt box and sends.
    out.push(row(E, [E.Button({ key: 'apply', label: 'Send', hotkey: 'p', variant: 'primary', onPress: a.apply })]))
    if (v.analysis.placeholders.length) out.push(...gaps(E, v, a, v.analysis.placeholders, F))
    if (v.analysis.additions.length) {
      out.push(E.Box({ key: 'suggestions', flexDirection: 'column', gap: 1, children: v.analysis.additions.map((s, i) => suggestion(E, v, a, s, i)) }))
    }
  }

  if (v.analysis) {
    const an = v.analysis
    if (v.isStale) out.push(text(E, 'Your draft changed since this rewrite. Press Rewrite to update it.', { dimColor: true }))

    const { rows, after } = checklistWithFixes(E, v, a, an)
    out.push(settingsGroup(E, v, 'checklist', 'Checklist', rows, after, true))
  }

  return out
}

/** The quick instruction buttons, wrapping when narrow, with a dim line saying where a press puts the sentence. */
function quickRow(E: UI, v: View, a: Actions): RenderElement {
  const where = v.analysis ? 'the rewrite' : 'your prompt'
  return E.Box({
    key: 'quick',
    flexDirection: 'column',
    gap: 'xs',
    children: [
      E.Box({
        key: 'quick-buttons',
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 'sm',
        children: v.quick.map((q, i) => E.Button({ key: `quick-${i}-${q.label}`, label: q.label, onPress: () => void a.toggleQuick(i) })),
      }),
      text(E, `Adds the line to ${where}; press again to take it out.`, { dimColor: true, wrap: 'wrap' }),
    ],
  })
}

/**
 * The rules the coach checks drafts against, first in Settings' Rules section
 * (v0.39.0; on the Analytics tab before): the general rules and the picked
 * model's (the session's to start, its name a dropdown of every model), each
 * opened and closed on its own and closed to start. Each file's Checklist and
 * Quick instructions show as its sections. Omar's own rules have their own
 * section above, so they aren't repeated here.
 */
function ruleList(E: UI, v: View, a: Actions, F?: Form): RenderElement[] {
  const r = v.ruleList
  const picked = r.models.find(m => m.file === r.picked)
  // The mobile app has no fields, so there the models are buttons, the picked one in brackets.
  const none = r.picked ? [] : [{ value: '', label: `${v.modelLabel || 'This model'} (no rules file)` }]
  const modelName = F
    ? // Keyed by the pick: withStableForm hands back the element it drew last while the key stays the
      // same and leaves `value` out of the comparison, so with one key the list kept showing the first pick.
      F.Select({ key: `rules-model-${r.picked || 'none'}`, options: [...none, ...r.models.map(m => ({ value: m.file, label: m.label }))], value: r.picked, onSelect: file => a.pickRules(file) })
    : row(E, r.models.map(m => E.Button({ key: `rules-pick-${m.file}`, ...tabLabel(E, m.label, m.file === r.picked), plain: true, onPress: () => a.pickRules(m.file) })))
  return [
    E.Box({
      flexDirection: 'column',
      children: [
        text(E, 'Rules in use'),
        text(E, 'What the coach checks your drafts against: the general rules, then the model\'s, then yours (above), which win when they conflict.', { dimColor: true, wrap: 'wrap' }),
      ],
    }),
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
  ]
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
  const changes = an.changes.map((c, i) => ({ c, i }))
  const fills = (rule: string, item: string) => rule.trim().toLowerCase() === item.toLowerCase()
  const rows: RenderElement[] = []
  for (const c of an.checklist) {
    const m = MARK[c.status]
    const fixes = changes.filter(x => fills(x.c.rule, c.item))
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
            // The mark and name sit at the top of a note that wraps (v0.26.2), not centred on it.
            alignItems: 'flex-start',
            columnGap: 1,
            children: [text(E, m.mark, { color: m.color }), text(E, c.item, { weight: 'semibold' }), text(E, c.note, { dimColor: true, wrap: 'wrap' })],
          }),
          ...fixes.map(x => fix(E, x.i, 'Rewrite', x.c.why)),
        ],
      }),
    )
  }
  const otherChanges = changes.filter(x => !an.checklist.some(c => fills(x.c.rule, c.item)))
  if (otherChanges.length) rows.push(otherRow(E, 'other-changes', 'Other changes', otherChanges.map(x => fix(E, x.i, x.c.rule, x.c.why))))
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
 * Whether the rewrite is an editable field (v0.19.0). Off in v0.19.2–0.27.0:
 * Desktop's bundled Claude Code 2.1.299 drops Input `rows`, so the field was one
 * line there. On in v0.28.0–0.30.1, since Desktop v3.1623.0 bundles 2.1.304, which
 * keeps `rows`. Turned back off in v0.31.0 at Omar's request: false shows the
 * v0.18.0 read-only Code block. The editing code and its test stay in place for later.
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
  // No "Fill in the gaps" heading since v0.26.0: each question stands on its own.
  const out: RenderElement[] = []
  if (!F) {
    out.push(E.Box({ key: 'gaps-later', paddingLeft: 2, children: [text(E, `Still in brackets: ${placeholders.map(p => p.token).join(', ')}. Send leaves them as they are.`, { dimColor: true, wrap: 'wrap' })] }))
    return out
  }
  for (const [i, p] of placeholders.entries()) {
    const id = `gap-${v.formGen}-${i}`
    const fields: RenderElement[] = [text(E, p.question, { weight: 'semibold', wrap: 'wrap' })]
    // The dropdown and the text field share one line (v0.25.2), wrapping only when the pane is too narrow.
    const controls: RenderElement[] = []
    if (p.options.length) {
      controls.push(
        F.Select({
          key: `${id}-pick`,
          label: 'Pick',
          options: [{ value: NO_PICK, label: 'Choose an answer' }, ...p.options.map(o => ({ value: o }))],
          value: v.picked[p.token] ?? NO_PICK,
          onSelect: value => a.pick(p.token, value),
        }),
      )
    }
    controls.push(
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
    fields.push(E.Box({ key: `${id}-fields`, flexDirection: 'row', alignItems: 'center', columnGap: 2, flexWrap: 'wrap', children: controls }))
    if (v.removed.includes(p.token)) {
      fields.push(text(E, 'Removed from the rewrite, with its sentence. Type or pick an answer to bring it back.', { color: 'warning', wrap: 'wrap' }))
    }
    // Indented like the suggestions under it (v0.26.1).
    out.push(E.Box({ key: id, flexDirection: 'column', paddingLeft: 2, children: fields }))
  }
  return out
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
    v.mode === 'live' ? `Analyzes each draft when you pause typing (${v.liveCalls}/${LIVE_CAP} this session).` : 'Rewrites only when you press Rewrite.'
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
    modelSetting(E, a, 'rewriteModel', 'Rewrite model', 'Used for Rewrite, live mode and /improve.', st.rewriteModel, st.rewriteChoices, st.readOnlyReason, F),
  ]
  const generalNote = st.readOnlyReason
    ? [text(E, `These can't be changed from the pane here (${st.readOnlyReason}). Change them under /config in a terminal session.`, { color: 'warning', wrap: 'wrap' })]
    : st.note
      ? [text(E, st.note, { dimColor: true, wrap: 'wrap' })]
      : []

  // The source pages, always listed: where the rules come from.
  const sources: RenderElement[] = [
    E.Box({ flexDirection: 'column', children: [text(E, 'Sources'), text(E, 'The pages the rules come from. A weekly check rewrites the rules when one changes, and they arrive with the next plugin update.', { dimColor: true, wrap: 'wrap' })] }),
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
        settingsGroup(E, v, 'rules', 'Rules', [block(E, 'rule-list', ruleList(E, v, a, F)), block(E, 'sources', sources)], [], true),
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
 * a bordered box, its title with no band and no padding; without it, in no box.
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
 * with `band` false on no band. With `titlePad` false the title has no padding
 * either (the Settings tab's). Theme keys only, so it follows light and dark.
 */
function group(E: UI, key: string, title: string, children: RenderElement[], { band = true, titlePad = true } = {}): RenderElement {
  const head = E.Box({ ...(band ? { backgroundColor: 'subtle' as const } : {}), ...(titlePad ? { paddingX: 1 } : {}), children: [heading(E, title)] })

  return E.Box({
    key: `group-${key}`,
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: 'subtle',
    paddingX: 1,
    gap: 1,
    children: [head, ...children],
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

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
  // The installed versions first, on the edition and the archive alike (v0.30.0), as the design's "SYS:" line (v0.35.0).
  const versions = E.Box({ key: 'week-versions', children: [spans(E, [['SYS: ', { color: 'claude' }], [versionsLine(w.versions.code, w.versions.desktop), { dimColor: true }]], { wrap: 'wrap' })] })
  if (w.archive) return [versions, ...weekArchive(E, v, a)]
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

  // This week's edition can be updated with the news it lacks, from the newest edition only (v0.27.0; adds only since
  // v0.33.0; no confirm since v0.33.1, at Omar's say: a press runs it). ":rewrite" and primary, as the design has it (v0.35.0).
  const redoing = hasCurrent && ed?.edition_id === w.currentId && w.job.state !== 'running'
  if (redoing) {
    nav.push(E.Button({ key: 'week-redo', label: w.job.state === 'failed' ? 'Try the rewrite again' : `:rewrite ${w.currentTitle}`, variant: 'primary', onPress: a.week.redo }))
  }

  const status: RenderElement[] = []
  if (w.job.state === 'running') {
    const at = new Date(w.job.startedAt).toISOString().slice(11, 16)
    status.push(mono(E, `${w.job.title}, started ${at} UTC: ${w.job.progress} You can keep working.`, { color: 'suggestion', wrap: 'wrap' }))
  } else if (w.job.state === 'failed') {
    status.push(mono(E, `Couldn't write ${w.job.title}: ${w.job.reason}`, { color: 'warning', wrap: 'wrap' }))
  }

  if (!ed) {
    out.push(versions, ...status)
    out.push(mono(E, "No edition yet. Write reads the pages listed under Settings → Claude Week, then the Week model writes the week's stories.", { dimColor: true, wrap: 'wrap' }))
    if (nav.length) out.push(row(E, nav))
    return out
  }

  // The header card (the Stitch design, v0.35.0): SYS line, "> title · dates", the intro, then the buttons.
  const range = ed.date_from && ed.date_to ? ` · ${dateRange(ed.date_from, ed.date_to)}` : ''
  out.push(
    E.Box({
      key: 'week-head',
      ...CARD,
      children: [
        versions,
        ...hairline(E, v, 'week-head-1'),
        spans(E, [['> ', { color: 'claude' }], [ed.title, {}], [range, { dimColor: true, weight: 'regular' }]], { size: 'title', weight: 'bold', wrap: 'wrap' }),
        ...(ed.intro ? [mono(E, ed.intro, { wrap: 'wrap' })] : []),
        ...(ed.feedback_note ? [mono(E, `From your feedback: ${ed.feedback_note}`, { dimColor: true, wrap: 'wrap' })] : []),
        ...status,
        ...(nav.length ? [...hairline(E, v, 'week-head-2'), row(E, nav)] : []),
      ],
    }),
  )

  const all = ed.sections.flatMap(s => s.stories)
  const top = ed.top3.map(id => all.find(s => s.id === id)).filter((s): s is Story => !!s)
  if (top.length) {
    out.push(
      E.Box({
        key: 'week-top3',
        ...CARD,
        borderColor: 'claude',
        children: [
          E.Box({
            key: 'week-top3-head',
            flexDirection: 'row',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            children: [mono(E, '[▲] TOP 3 STORIES', { color: 'warning', weight: 'bold' }), mono(E, 'PRIORITY_QUEUE', { dimColor: true })],
          }),
          ...top.map((s, n) => {
            const section = ed.sections.find(x => x.stories.includes(s))?.title ?? ''
            const done = !!w.read[s.id]
            return E.Box({
              key: `week-top3-${n}`,
              flexDirection: 'row',
              alignItems: 'flex-start',
              columnGap: 1,
              children: [
                mono(E, done ? '✓' : `${n + 1}.`, done ? { color: 'success' } : { color: 'warning', weight: 'bold' }),
                E.Box({
                  flexDirection: 'column',
                  flexShrink: 1,
                  children: [
                    mono(E, s.title, { wrap: 'wrap', ...(done ? { dimColor: true, strikethrough: true } : {}) }),
                    ...(section ? [mono(E, `— ${section}`, { dimColor: true, wrap: 'wrap', ...(done ? { strikethrough: true } : {}) })] : []),
                  ],
                }),
              ],
            })
          }),
        ],
      }),
    )
  }

  // Reading status: the count, a bar, and a chip per section (orange while reading, green when done).
  const counts = readCounts(ed, w.read)
  const pct = counts.total ? Math.round((counts.read / counts.total) * 100) : 0
  out.push(
    E.Box({
      key: 'week-progress',
      ...CARD,
      children: [
        E.Box({
          key: 'week-progress-head',
          flexDirection: 'row',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          children: [
            spans(E, [['> ', { color: 'suggestion' }], ['Reading Status:', {}]]),
            mono(E, `${counts.read} / ${counts.total} stories read (${pct}%)`, { color: 'claude', weight: 'bold' }),
          ],
        }),
        progressBar(E, v, pct),
        E.Box({
          key: 'week-progress-chips',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 'sm',
          children: counts.sections.map(c => {
            const tone = c.total && c.read === c.total ? 'success' : c.read ? 'claude' : undefined
            return E.Box({
              key: `week-chip-${c.id}`,
              borderStyle: 'round',
              borderColor: tone ?? 'subtle',
              paddingX: 'sm',
              children: [mono(E, `${c.title}: ${c.read}/${c.total}`, tone ? { color: tone } : {})],
            })
          }),
        }),
      ],
    }),
  )

  // Each section: an uppercase title with its range and a line, a note in an amber box, then its stories, each boxed.
  for (const s of ed.sections) {
    const children: RenderElement[] = [
      spans(E, [[s.title.toUpperCase(), { color: 'claude', weight: 'bold' }], [s.range ? ` · ${s.range}` : '', { dimColor: true }]], { wrap: 'wrap' }),
      ...hairline(E, v, `week-section-${s.id}`),
    ]
    if (s.note) {
      children.push(
        E.Box({
          key: `week-note-${s.id}`,
          borderStyle: 'round',
          borderColor: 'warning',
          paddingX: 'sm',
          children: [spans(E, [['[!] ', { color: 'warning' }], [s.note, { dimColor: true }]], { wrap: 'wrap' })],
        }),
      )
    }
    for (const story of s.stories) children.push(storyCard(E, w, a, story, F, v))
    out.push(E.Box({ key: `group-week-${s.id}`, flexDirection: 'column', gap: 'md', children }))
  }

  if (ed.questions.length) {
    out.push(spans(E, [['QUESTIONS TO THINK ABOUT', { color: 'claude', weight: 'bold' }]]))
    for (const [n, q] of ed.questions.entries()) {
      out.push(
        E.Box({
          key: `week-q-${ed.edition_id}-${n}`,
          ...CARD,
          children: [
            spans(E, [['? ', { color: 'warning', weight: 'bold' }], [q.text, { italic: true }]], { wrap: 'wrap' }),
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
        children: [spans(E, [['SOURCES', { color: 'claude', weight: 'bold' }]]), ...ed.sources.map(l => E.Link({ href: l.url, label: `${l.label} ↗` }))],
      }),
    )
  }
  out.push(E.Box({ key: 'week-end', flexDirection: 'row', justifyContent: 'center', children: [mono(E, '[ END OF STREAM ]', { dimColor: true })] }))
  return out
}

/** The reading bar: a drawn bar (solid for read, dotted for the rest) where the surface draws Svg, else a text bar. */
function progressBar(E: UI, v: View, pct: number): RenderElement {
  const label = mono(E, `${pct}% COMPLETE`, { dimColor: true })
  if (!E.Svg || (v.surface !== 'desktop' && v.surface !== 'mobile')) {
    const cells = 20
    const fill = Math.round((pct / 100) * cells)
    return E.Box({ key: 'week-bar', flexDirection: 'row', columnGap: 2, children: [mono(E, '█'.repeat(fill), { color: 'claude' }), mono(E, '░'.repeat(cells - fill), { dimColor: true }), label] })
  }
  const w = 1000
  const fill = Math.round((pct / 100) * w)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24" viewBox="0 0 ${w} 24" preserveAspectRatio="none">` +
    `<defs><pattern id="d" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="${CLAY}" fill-opacity="0.7"/></pattern></defs>` +
    `<rect width="${w}" height="24" fill="url(#d)" fill-opacity="0.5"/><rect width="${fill}" height="24" fill="${CLAY}"/></svg>`
  return E.Box({ key: 'week-bar', flexDirection: 'column', gap: 'xs', children: [E.Svg({ source: svg, alt: `${pct}% read`, height: 12 }), label] })
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
function storyCard(E: UI, w: WeekView, a: Actions, s: Story, F?: Form, v?: View): RenderElement {
  if (w.read[s.id]) {
    return E.Box({
      key: `story-${s.id}`,
      ...STORY_BOX,
      flexDirection: 'row',
      columnGap: 2,
      flexWrap: 'wrap',
      alignItems: 'center',
      children: [spans(E, [['✓ ', { color: 'success' }], [s.title, { dimColor: true }]], { wrap: 'wrap' }), E.Button({ key: `read-${s.id}`, label: 'Reopen', onPress: () => a.week.toggleRead(s.id) })],
    })
  }

  const fb = w.feedback[s.id]
  // The head (v0.35.0): the writer's tag over "> title", the version badge on the right, then a line.
  const head = E.Box({
    key: `story-head-${s.id}`,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    columnGap: 2,
    children: [
      E.Box({
        flexDirection: 'column',
        flexShrink: 1,
        children: [
          ...(s.tag ? [mono(E, s.tag, { color: 'warning', size: 'footnote' })] : []),
          spans(E, [['> ', { color: 'claude' }], [s.title, {}]], { weight: 'bold', wrap: 'wrap' }),
        ],
      }),
      ...(s.version ? [E.Box({ key: `story-version-${s.id}`, borderStyle: 'round', borderColor: 'subtle', paddingX: 'sm', children: [mono(E, s.version, { dimColor: true })] })] : []),
    ],
  })
  const children: RenderElement[] = [head, ...(v ? hairline(E, v, `story-${s.id}`) : [])]
  for (const para of s.summary.split(/\n{2,}/).filter(p => p.trim())) children.push(codeText(E, para.trim(), { wrap: 'wrap' }))
  if (s.detail && w.details.includes(s.id)) children.push(codeText(E, s.detail, { dimColor: true, wrap: 'wrap' }))
  if (s.ask) {
    children.push(
      E.Box({
        key: `ask-${s.id}`,
        borderStyle: 'round',
        borderColor: 'subtle',
        paddingX: 'md',
        paddingY: 'sm',
        flexDirection: 'column',
        gap: 'xs',
        children: [mono(E, '? ASK YOURSELF:', { color: 'warning', weight: 'bold' }), mono(E, s.ask, { italic: true, wrap: 'wrap' })],
      }),
    )
  }
  // A tip names the story it's drawn from (v0.34.0); its links are that story's source.
  const from = s.based_on ? w.edition?.sections.flatMap(sec => sec.stories.map(st => ({ st, sec }))).find(x => x.st.id === s.based_on) : undefined
  if (from) children.push(mono(E, `From the story "${from.st.title}" in ${from.sec.title}`, { dimColor: true, wrap: 'wrap' }))
  if (s.links.length) {
    children.push(
      E.Box({
        key: `links-${s.id}`,
        flexDirection: 'row',
        columnGap: 2,
        flexWrap: 'wrap',
        children: [mono(E, 'REF:', { dimColor: true }), ...s.links.map(l => E.Link({ href: l.url, label: `${l.label} ↗` }))],
      }),
    )
  }
  if (v) children.push(...hairline(E, v, `story-${s.id}-actions`))

  const voteButton = (verdict: 'up' | 'down', label: string) =>
    E.Button({ key: `${verdict}-${s.id}`, label, ...(fb?.verdict === verdict ? { variant: 'primary' as const } : {}), onPress: () => a.week.vote(s.id, verdict) })
  // Two rows of three, as the design lays them out.
  children.push(
    row(E, [voteButton('up', '▲ Up'), voteButton('down', '▼ Down'), ...(F ? [E.Button({ key: `take-${s.id}`, label: 'Your take', onPress: () => a.week.toggleTake(s.id) })] : [])]),
    row(E, [
      E.Button({ key: `read-${s.id}`, label: 'Mark read', onPress: () => a.week.toggleRead(s.id) }),
      ...(s.detail ? [E.Button({ key: `detail-${s.id}`, label: w.details.includes(s.id) ? 'Less detail' : 'More detail', onPress: () => a.week.toggleDetail(s.id) })] : []),
      // On every story (v0.33.3): with no prompt from the writer, the story's title is the question (asideAboutStory).
      E.Button({ key: `aside-${s.id}`, label: 'Ask in side chat', onPress: () => a.week.askAside(asideAboutStory(s)) }),
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
    if (fb.why) children.push(mono(E, `Why: ${fb.why}`, { dimColor: true, wrap: 'wrap' }))
    if (fb.take) children.push(mono(E, `Your take: ${fb.take}`, { dimColor: true, wrap: 'wrap' }))
    children.push(mono(E, 'Edit these in Desktop or the terminal.', { dimColor: true }))
  }
  const saved = w.saves[s.id]
  if (saved) children.push(mono(E, saved, { ...(saved.startsWith('Not saved') ? { color: 'warning' } : { dimColor: true }), wrap: 'wrap' }))

  return E.Box({ key: `story-${s.id}`, ...STORY_BOX, flexDirection: 'column', gap: 'sm', children })
}

/** A card on the News tab (v0.35.0): the header, Top 3, reading status and questions. */
const CARD = { flexDirection: 'column', borderStyle: 'round', borderColor: 'subtle', paddingX: 'md', paddingY: 'sm', gap: 'sm' } as const

/** The clay orange inside the reading bar's Svg, which can't use theme colors. */
const CLAY = '#D97757'

/** Monospaced text, the News tab's face since v0.35.0. */
function mono(E: UI, value: string, props: Record<string, unknown> = {}): RenderElement {
  return E.Text({ mono: true, ...props, children: [value] })
}

/** One monospaced line of runs, each with its own color and style; empty runs are left out. */
function spans(E: UI, runs: [string, Record<string, unknown>][], props: Record<string, unknown> = {}): RenderElement {
  return E.Text({ mono: true, ...props, children: runs.filter(([t]) => t).map(([t, p]) => (Object.keys(p).length ? E.Text({ ...p, children: [t] }) : t)) })
}

/**
 * Monospaced text whose `backticked` parts are drawn as code: clay, with no
 * background (v0.36.1: clay on Desktop's dark subtle fill was hard to read).
 */
function codeText(E: UI, value: string, props: Record<string, unknown> = {}): RenderElement {
  const parts = value.split('`')
  if (parts.length < 3) return mono(E, value, props)
  return spans(E, parts.map((t, i) => [t, i % 2 ? { color: 'claude' } : {}] as [string, Record<string, unknown>]), props)
}

/**
 * Each story's box on the News tab (v0.32.0): the round subtle border the
 * pane's other boxes use, with room inside (v0.33.2, Omar: "make it breathe").
 * Named steps, so Desktop sizes them with its own scale.
 */
const STORY_BOX = { borderStyle: 'round', borderColor: 'subtle', paddingX: 'md', paddingY: 'sm' } as const

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
