// Pure helpers for prompt-coach: no `$`, so tests can call them directly.

/** One model family's rule file, and the name shown to the person. */
export type ModelRules = { file: string; label: string }

/**
 * The rule file for the session's model, from the id or alias
 * `$.session.model()` returns (`claude-opus-5-5`, `opus`, `claude-opus-5-5[1m]`).
 * `label` names the file's model and `model` the session's. A bare alias is
 * read as the newest model of its family. A newer version than any file
 * borrows the newest older file of its family (`isBorrowed`); an older model,
 * or one with no family file, gets undefined and so general.md alone.
 * The same file name is used under `rules/` and `tips/`.
 */
export function rulesFor(model: string): (ModelRules & { model: string; isBorrowed: boolean }) | undefined {
  const m = model.toLowerCase()
  const family = MODEL_FAMILIES.find(f => f.names.some(n => m.includes(n)))
  if (!family) return undefined
  const name = family.names.find(n => m.includes(n))!
  if (new RegExp(`^${name}(\\[.*\\])?$`).test(m)) return { ...family.newest, model: family.newest.label, isBorrowed: false }
  // The version after the family name: a major, then a single-digit minor if any (5-5, 5.5, 6; not the date in 6-20270101).
  const v = new RegExp(`${name}-(\\d+)(?:[-.](\\d)(?!\\d))?`).exec(m)
  if (!v) return undefined
  const major = Number(v[1])
  const minor = Number(v[2] ?? 0)
  const files = family.files.filter(f => f.major < major || (f.major === major && f.minor <= minor)).sort((x, y) => y.major - x.major || y.minor - x.minor)
  const file = files[0]
  if (!file) return undefined
  const isBorrowed = file.major !== major || file.minor !== minor
  const label = `${name[0]!.toUpperCase()}${name.slice(1)} ${v[2] === undefined ? major : `${major}.${minor}`}`
  return { file: file.rules.file, label: file.rules.label, model: isBorrowed ? label : file.rules.label, isBorrowed }
}

/** Every model with its own rule file, in the order the Analytics tab's picker shows them. */
export const MODEL_RULES: readonly ModelRules[] = [
  { file: 'opus-5-5.md', label: 'Opus 5.5' },
  { file: 'sonnet-5-5.md', label: 'Sonnet 5.5' },
  { file: 'haiku-5-5.md', label: 'Haiku 5.5' },
  { file: 'fable-5-1.md', label: 'Fable 5.1' },
]

/** Each family's names as they appear in model ids, and its rule files by version, newest first. Fable's file covers Mythos too. */
const MODEL_FAMILIES = [
  { names: ['opus'], files: [{ major: 5, minor: 5, rules: MODEL_RULES[0]! }] },
  { names: ['sonnet'], files: [{ major: 5, minor: 5, rules: MODEL_RULES[1]! }] },
  { names: ['haiku'], files: [{ major: 5, minor: 5, rules: MODEL_RULES[2]! }] },
  { names: ['fable', 'mythos'], files: [{ major: 5, minor: 1, rules: MODEL_RULES[3]! }] },
].map(f => ({ ...f, newest: f.files[0]!.rules }))

/** One `## ` section of a rules file and its rules; `section` is '' for rules above the first heading. */
export type RuleSection = { section: string; rules: string[] }

/**
 * A rules file as its sections, for reading in the pane: each `## ` heading
 * with the "- " lines under it, the Checklist among them. The title, source
 * and As of lines are not rules and are skipped, and so are sections with no rules.
 */
export function parseRuleFile(md: string): RuleSection[] {
  const out: RuleSection[] = [{ section: '', rules: [] }]
  for (const line of md.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1]
    const rule = /^\s*-\s+(.+?)\s*$/.exec(line)?.[1]
    if (heading) out.push({ section: heading, rules: [] })
    else if (rule) out[out.length - 1]!.rules.push(rule)
  }
  return out.filter(s => s.rules.length)
}

// ---- The checklist, from the rule files ----

/** One checklist item: its name, what it asks of the draft, and the part of the guides it comes from. */
export type ChecklistItem = { name: string; definition: string; source: string }

/** The checklist before it moved into the rule files; used only when no file has a Checklist section. */
export const FALLBACK_CHECKLIST: readonly ChecklistItem[] = [
  ['Goal', 'what outcome they want.'],
  ['Context', 'the files, errors, project, or background the assistant cannot see on its own.'],
  ['Constraints', 'limits, scope, or things to leave alone.'],
  ['Done means', 'the finish line, how they and the assistant will know the work is done (tests pass, the page shows X).'],
  ['Stop rule', 'when the assistant should stop and ask rather than keep going (for example before anything destructive).'],
  ['Output', 'what form the answer or result should take.'],
].map(([name, definition]) => ({ name: name!, definition: definition!, source: 'built in' }))
const FALLBACK_NAMES = FALLBACK_CHECKLIST.map(i => i.name)

/** The items of a file's `## Checklist` section, each line "- Name: definition. Source: …". */
export function parseChecklist(md: string): ChecklistItem[] {
  const out: ChecklistItem[] = []
  for (const line of checklistSection(md).split('\n')) {
    const body = /^\s*-\s+(.+?)\s*$/.exec(line)?.[1]
    if (!body) continue
    const at = body.search(/\sSource:\s/)
    const head = (at < 0 ? body : body.slice(0, at)).trim()
    const source = at < 0 ? '' : body.slice(at).replace(/^\s*Source:\s*/, '').trim()
    const colon = head.indexOf(':')
    const name = (colon < 0 ? head : head.slice(0, colon)).replace(/\.$/, '').trim()
    if (name) out.push({ name, definition: colon < 0 ? '' : head.slice(colon + 1).trim(), source })
  }
  return out
}

/**
 * The checklist a draft is judged on: the model file's own when it has one,
 * which inherits nothing, else general.md's (older and unknown models), else
 * the built-in list. `from` says which.
 */
export function checklistFor(generalMd: string, modelMd = ''): { items: ChecklistItem[]; from: 'model' | 'general' | 'built in' } {
  const own = parseChecklist(modelMd)
  if (own.length) return { items: own, from: 'model' }
  const general = parseChecklist(generalMd)
  if (general.length) return { items: general, from: 'general' }
  return { items: [...FALLBACK_CHECKLIST], from: 'built in' }
}

/** A file's `## Checklist` section, without its heading; '' when it has none. */
function checklistSection(md: string): string {
  return /^##\s+Checklist\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(md)?.[1] ?? ''
}

/** A rules file without its `## Checklist` section: the checklist goes in the system prompt, not with the rules. */
export function withoutChecklist(md: string): string {
  return md.replace(/^##\s+Checklist\s*$[\s\S]*?(?=^##\s|(?![\s\S]))/m, '').trimEnd() + (md.endsWith('\n') ? '\n' : '')
}

const SHARED_RULES = `- Keep the person's intent exactly. Do not add requirements, features, tests, constraints, or scope they did not ask for. If an addition would clearly help, leave it out of the rewrite and mention it in your notes as a suggestion ("Consider: ...").
- Never invent context: no file names, projects, products, errors or facts the draft does not give. If a needed detail is missing, keep it as open as they left it and name it as missing.
- Apply the prompting rules you are given only where they fit this prompt. A short, clear prompt may need only small changes, or none.
- Keep the person's language (if they wrote in Slovenian, rewrite in Slovenian) and their technical terms, file names, and code exactly as written.
- Write the rewrite as the person speaking to the assistant, ready to send. Do not answer the prompt or carry out the task.
- Prefer short and direct over long and formal.
- Rules under "Omar's own rules" win when they conflict with the others.`

const REPLY_RULES = `- The request may include <previous_reply>: the assistant's last message in this conversation, which the draft answers or continues. The assistant already has that message, so read references such as "option 2", "yes, do that" or "the second file" against it, and do not count what it already says as missing context.
- Do not copy the previous reply into the rewrite. Keep the rewrite a reply in that conversation, not a standalone task. A short pointer such as "your option 2 (the cache fix)" is fine when it removes an ambiguity.
- Without <previous_reply>, treat the draft as the start of a conversation.`

export const SYSTEM = `You rewrite a person's draft prompt for an AI coding assistant so it is clearer and more effective.

Rules for the rewrite:
${SHARED_RULES}
${REPLY_RULES}

Reply in exactly this format and nothing else:
<rewrite>
the rewritten prompt
</rewrite>
<notes>
- one short line per change you made and why (at most 5 lines; "No changes needed." if none)
</notes>`

/** The user message for the rewrite call. `reply` is Claude's last reply, or '' at the start of a conversation. */
export function buildRequest(draft: string, rules: string, targetLabel: string, reply = ''): string {
  return [
    `<prompting_rules>\n${rules}\n</prompting_rules>`,
    `The prompt will be sent to: ${targetLabel}.`,
    ...replyBlock(reply),
    `<draft_prompt>\n${draft}\n</draft_prompt>`,
    'Rewrite the draft prompt.',
  ].join('\n\n')
}

/** Splits the rewrite model's reply into the rewrite and its notes. */
export function parseReply(reply: string): { rewrite: string; notes: string[] } | undefined {
  const rewrite = tag(reply, 'rewrite')
  if (!rewrite) return undefined
  return { rewrite, notes: bullets(tag(reply, 'notes') ?? '') }
}

// ---- The coach pane's analysis ----

/** What a good task prompt carries, in the order the pane lists them. */
export type CheckStatus = 'present' | 'partial' | 'missing' | 'n/a'
export type CheckItem = { item: string; status: CheckStatus; note: string }
export type Change = { rule: string; why: string }
/** One `[placeholder]` in the rewrite: the text exactly as written, a question for it, and likely answers. */
export type Placeholder = { token: string; question: string; options: string[] }
/**
 * A suggestion the person may add to the rewrite with one click: a short
 * label, the sentence to add, and the checklist item it fills, if any.
 */
export type Addition = { label: string; text: string; item?: string }
export type Analysis = {
  checklist: CheckItem[]
  rewrite: string
  changes: Change[]
  tips: string[]
  placeholders: Placeholder[]
  additions: Addition[]
}

/** The analysis call's system prompt, judging the draft against `items` (the checklist for the session's model). */
export function analysisSystem(items: readonly ChecklistItem[]): string {
  const active = items
  return `You coach a person on a draft prompt for an AI coding assistant. You check the draft, rewrite it, and explain each change so the person learns the pattern.

The checklist (judge each item for this draft):
${active.map(i => `- ${i.name}: ${i.definition}`).join('\n')}
Mark an item "n/a" when it does not apply, such as a finish line or a stop rule for a quick question. Mark it "partial" when it is there but vague. When the previous reply already settles an item (the plan it proposed names the files or the finish line), mark it "present" and say so in the note.

Also flag these patterns when present: "think step by step", "think carefully" and similar lines; asking to see its reasoning instead of a short explanation; vague "avoid X" asks that do not name the specific thing to avoid.

Rules for the rewrite:
${SHARED_RULES}
${REPLY_RULES}
- Where an essential detail is missing, put a short placeholder in square brackets for the person to fill in, such as [which file?]. Use at most three.
- Something worth adding that the person did not ask for (a finish line, a stop rule, an output format) goes in <additions>, not in the rewrite or the tips: the checklist item it fills (or Other), a short label, then the exact sentence to add, written as the person, in their language, using only details from the draft or the previous reply, with no square brackets.

Reply in exactly this format and nothing else:
<checklist>
Goal | present | one short note
Context | missing | one short note
(one line for each of the ${active.length} items, in this order, status one of present, partial, missing, n/a)
</checklist>
<rewrite>
the rewritten prompt
</rewrite>
<changes>
Rule name | why this change helps, in one sentence
(at most 5 lines; "None | The draft already works." if nothing changed)
</changes>
<tips>
- at most 2 short tips on using the target model or Claude Code for this particular task, only if they clearly help
</tips>
<additions>
Done means | Name the finish line | Done means the login test passes.
(at most 3 lines: checklist item | label | sentence, the item one of the checklist items above or Other; leave the block empty when nothing is worth adding)
</additions>
<placeholders>
[which file?] | Which file has the login bug? | auth.ts ; login.ts
(one line per placeholder in the rewrite: the placeholder exactly as written, a short question, then up to 3 likely answers separated by " ; ". Take answers only from the draft or the previous reply; leave them out when neither gives any. Leave the block empty when the rewrite has no placeholders.)
</placeholders>`
}

/** The analysis system prompt with the built-in checklist, used when general.md has none. */
export const ANALYSIS_SYSTEM = analysisSystem(FALLBACK_CHECKLIST)

/** The user message for the analysis call. `reply` is Claude's last reply, or '' at the start of a conversation. */
export function buildAnalysisRequest(draft: string, rules: string, targetLabel: string, reply = ''): string {
  return [
    `<prompting_rules>\n${rules}\n</prompting_rules>`,
    `The prompt will be sent to: ${targetLabel}, running in Claude Code.`,
    ...replyBlock(reply),
    `<draft_prompt>\n${draft}\n</draft_prompt>`,
    'Check, rewrite and explain the draft prompt.',
  ].join('\n\n')
}

function replyBlock(reply: string): string[] {
  return reply ? [`<previous_reply>\n${reply}\n</previous_reply>`, 'The draft answers or continues from this reply.'] : []
}

// ---- Claude's last reply, the context for a draft inside a conversation ----

/** The most of Claude's last reply sent with a draft. Longer replies keep their start and end. */
export const REPLY_MAX_CHARS = 6000
/** How much of the start a long reply keeps; the rest of the budget goes to the end, where the questions and options usually are. */
export const REPLY_HEAD_CHARS = 1500
const REPLY_GAP = '\n[... middle of the reply left out ...]\n'

/** The fields of a transcript row (SessionMessage) that lastReply reads. */
type Row = { role: 'user' | 'assistant'; text: string; toolResults?: readonly unknown[] }

/** True for a prompt the person typed, not a tool result. */
export function isPersonPrompt(m: Row): boolean {
  return m.role === 'user' && !!m.text.trim() && !m.toolResults?.length
}

/**
 * Claude's last reply before row `end`: the text of every assistant message
 * since the person's prompt before it, joined, so a turn that worked through
 * tools still gives its whole answer. '' when there is none (a fresh session).
 * A prompt with no reply after it (an interrupted turn, or the command being
 * run) is passed over.
 */
export function lastReply(messages: readonly Row[], end = messages.length): { text: string; isCut: boolean } {
  const parts: string[] = []
  for (let i = Math.min(end, messages.length) - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m) continue
    if (m.role === 'assistant' && m.text.trim()) parts.unshift(m.text.trim())
    else if (isPersonPrompt(m) && parts.length) break
  }
  return capReply(parts.join('\n\n'))
}

/** Cuts a long reply to REPLY_MAX_CHARS, keeping its start and its end. */
export function capReply(text: string): { text: string; isCut: boolean } {
  if (text.length <= REPLY_MAX_CHARS) return { text, isCut: false }
  const tail = REPLY_MAX_CHARS - REPLY_HEAD_CHARS - REPLY_GAP.length
  return { text: text.slice(0, REPLY_HEAD_CHARS).trimEnd() + REPLY_GAP + text.slice(-tail).trimStart(), isCut: true }
}

const STATUSES: readonly CheckStatus[] = ['present', 'partial', 'missing', 'n/a']

/** Splits the analysis reply into its parts, judged against the checklist `names`; undefined when it has no rewrite. */
export function parseAnalysis(reply: string, names: readonly string[] = FALLBACK_NAMES): Analysis | undefined {
  const rewrite = tag(reply, 'rewrite')
  if (!rewrite) return undefined

  const found = new Map<string, CheckItem>()
  for (const line of lines(tag(reply, 'checklist') ?? '')) {
    const [name = '', status = '', ...note] = line.split('|').map(s => s.trim())
    const item = names.find(c => c.toLowerCase() === name.toLowerCase())
    const st = STATUSES.find(s => s === status.toLowerCase())
    if (item && st && !found.has(item)) found.set(item, { item, status: st, note: note.join(' | ') })
  }
  const checklist = names.map(item => found.get(item) ?? { item, status: 'n/a' as const, note: 'Not judged.' })

  const changes = lines(tag(reply, 'changes') ?? '')
    .map(line => {
      const bar = line.indexOf('|')
      return bar < 0 ? { rule: 'Change', why: line } : { rule: line.slice(0, bar).trim(), why: line.slice(bar + 1).trim() }
    })
    .filter(c => c.why && c.rule.toLowerCase() !== 'none')

  return {
    checklist,
    rewrite,
    changes,
    tips: bullets(tag(reply, 'tips') ?? '').slice(0, 2),
    placeholders: parsePlaceholders(rewrite, tag(reply, 'placeholders') ?? ''),
    additions: parseAdditions(tag(reply, 'additions') ?? '', names),
  }
}

/**
 * The suggestions of an analysis reply, at most three; a line with no
 * sentence is dropped. A line is `item | label | sentence`, the item a
 * checklist name or Other; an older `label | sentence` line has no item.
 */
export function parseAdditions(block: string, names: readonly string[] = FALLBACK_NAMES): Addition[] {
  const out: Addition[] = []
  for (const line of lines(block)) {
    const parts = line.split('|').map(x => x.trim())
    const named = parts.length >= 3 ? names.find(c => c.toLowerCase() === parts[0]!.toLowerCase()) : undefined
    const tagged = parts.length >= 3 && (named !== undefined || parts[0]!.toLowerCase() === 'other')
    const [label = '', ...rest] = tagged ? parts.slice(1) : parts
    const text = (rest.length ? rest.join(' | ') : parts.length === 1 ? label : '').trim()
    if (!text) continue
    out.push({ label: rest.length ? label || text : text, text, ...(named ? { item: named } : {}) })
  }
  return out.slice(0, 3)
}

/** The rewrite with the chosen suggestions added at the end, in the order the analysis gave them. */
export function withAdditions(rewrite: string, additions: Addition[], chosen: readonly number[]): string {
  const added = additions.filter((_, i) => chosen.includes(i)).map(a => a.text)
  if (!added.length) return rewrite
  const body = rewrite.trimEnd()
  return body + (body.includes('\n') ? '\n' : ' ') + added.join(' ')
}

/** A `[placeholder]` in a rewrite; not a Markdown link's text. */
const PLACEHOLDER = /\[[^[\]\n]{1,120}\](?!\()/g

/**
 * The placeholders of a rewrite, in the order they first appear, each with
 * the question and answers the model gave for it. One the model left out
 * still gets a field, its own text as the question.
 */
export function parsePlaceholders(rewrite: string, block: string): Placeholder[] {
  const given = new Map<string, Placeholder>()
  for (const line of lines(block)) {
    const [token = '', question = '', answers = ''] = line.split('|').map(x => x.trim())
    if (!/^\[.+\]$/.test(token) || given.has(token)) continue
    const options = [...new Set(answers.split(';').map(x => x.trim()).filter(Boolean))].slice(0, 3)
    given.set(token, { token, question: question || token.slice(1, -1), options })
  }
  const tokens = [...new Set(rewrite.match(PLACEHOLDER) ?? [])]
  return tokens.map(token => given.get(token) ?? { token, question: token.slice(1, -1), options: [] })
}

/**
 * The text without each sentence that holds one of `tokens`, so a gap the
 * person chose to drop takes its whole sentence with it. A sentence ends at
 * . ! or ? followed by a space or the end, or at a line break; punctuation
 * inside a placeholder (`[which file?]`) doesn't count. A line left empty goes.
 */
export function removeSentences(text: string, tokens: readonly string[]): string {
  if (!tokens.length) return text
  const kept: string[] = []
  for (const line of text.split('\n')) {
    const cut = removeFromLine(line, tokens)
    // A line the removal emptied goes; a blank line that was already there stays.
    if (cut.trim() || !line.trim()) kept.push(cut)
  }
  return kept.join('\n').trim()
}

/** One line without each sentence that holds one of `tokens`. */
function removeFromLine(line: string, tokens: readonly string[]): string {
  // Blank out every placeholder's inside, so its own punctuation is not read as a sentence end.
  const masked = line.replace(PLACEHOLDER, m => '[' + 'x'.repeat(m.length - 2) + ']')
  const cuts: [number, number][] = []
  for (const token of new Set(tokens)) {
    for (let at = line.indexOf(token); at >= 0; at = line.indexOf(token, at + token.length)) {
      let start = at
      while (start > 0 && !/[.!?]\s$/.test(masked.slice(0, start))) start--
      const end = /[.!?](?=\s|$)/.exec(masked.slice(at + token.length))
      let stop = end ? at + token.length + end.index + 1 : line.length
      while (stop < line.length && line[stop] === ' ') stop++
      cuts.push([start, stop])
    }
  }
  // Two gaps in one sentence give the same cut; merge overlaps, then cut from the end.
  const merged: [number, number][] = []
  for (const [a, b] of cuts.sort((x, y) => x[0] - y[0])) {
    const last = merged.at(-1)
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else merged.push([a, b])
  }
  let out = line
  for (const [a, b] of merged.reverse()) out = out.slice(0, a) + out.slice(b)
  return out.replace(/ +$/, '')
}

/** The dropdown's "nothing picked" value. */
export const NO_PICK = '__none__'

/** Each placeholder's answer: what was typed, else what was picked, else nothing. */
export function answersFor(placeholders: Placeholder[], typed: Record<string, string>, picked: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { token } of placeholders) {
    const pick = picked[token]
    out[token] = typed[token]?.trim() || (pick && pick !== NO_PICK ? pick : '')
  }
  return out
}

/** The rewrite with each answered placeholder replaced by its answer; unanswered ones stay in brackets. */
export function fillPlaceholders(rewrite: string, answers: Record<string, string>): string {
  let out = rewrite
  for (const [token, answer] of Object.entries(answers)) {
    if (answer.trim()) out = out.split(token).join(answer.trim())
  }
  return out
}

/** The bullet lines of a tips file, without the markers. */
export function parseTips(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter(line => /^\s*-\s+/.test(line))
    .map(line => line.replace(/^\s*-\s+/, '').trim())
    .filter(Boolean)
}

/** The `As of:` date in a rules or tips file, if it has one. */
export function asOfDate(markdown: string): string | undefined {
  return /^As of:\s*(\S+)/m.exec(markdown)?.[1]
}

// The person's statistics live in analytics.ts since v0.11.0.

// ---- Live mode ----

export const LIVE_DEBOUNCE_MS = 1500
export const LIVE_MIN_CHARS = 15
export const LIVE_CAP = 30

/** Why live mode should not analyze this draft now, or undefined when it should. */
export function liveSkipReason(s: {
  text: string
  lastAnalyzed: string
  isRunning: boolean
  liveCalls: number
}): string | undefined {
  const text = s.text.trim()
  if (text.length < LIVE_MIN_CHARS) return 'Keep typing: live mode starts at 15 characters.'
  if (text === s.lastAnalyzed.trim()) return 'Already analyzed.'
  if (s.isRunning) return 'An analysis is already running.'
  if (s.liveCalls >= LIVE_CAP) return `Live limit reached (${LIVE_CAP} this session). Press Analyze to keep going.`
  return undefined
}

// ---- Small text helpers ----

function tag(text: string, name: string): string | undefined {
  return new RegExp(`<${name}>\\s*([\\s\\S]*?)\\s*</${name}>`).exec(text)?.[1]?.trim() || undefined
}

function lines(block: string): string[] {
  return block
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('('))
}

function bullets(block: string): string[] {
  return lines(block)
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

// ---- Your own rules ----

/**
 * The mod's own data folder in the Claude config (`plugins/data/<plugin>-
 * <marketplace>`, which Claude Code keeps for a plugin across installs and
 * updates), not the install itself, which an update replaces. An installed
 * copy runs from `plugins/cache/<marketplace>/<plugin>/<version>`, so its
 * folder follows from the root. A folder loaded directly (a session opened in
 * the repo) uses the installed copy's folder in `configDir`, `<plugin>-
 * <plugin>` (the repo's marketplace shares its name), so both read the same files.
 */
export function dataDir(root: string, name: string, configDir: string): string {
  const installed = /^(.*)[\\/]plugins[\\/]cache[\\/]([^\\/]+)[\\/]([^\\/]+)[\\/][^\\/]+[\\/]?$/.exec(root)
  if (installed) return `${installed[1]}/plugins/data/${installed[3]}-${installed[2]}`
  return `${configDir.replace(/[\\/]$/, '')}/plugins/data/${name}-${name}`
}

/** The top of a new rules file; the mod writes it with the first rule added under Settings. */
export const OWN_RULES_HEADER =
  '# Your own rules\n\nSent with every analysis and /improve, after the general and model rules; these win when they conflict.\nOne rule per line, each starting with "- ". Add and remove them under Settings in the coach pane, or edit this file.\nInstalling or updating prompt-coach never touches it.\n\n'

/** The rules in a rules file: each line starting with "- ", in order. */
export function ownRuleLines(md: string): string[] {
  return md
    .split('\n')
    .map(l => /^\s*-\s+(.+?)\s*$/.exec(l)?.[1])
    .filter((r): r is string => !!r)
}

/** A rule as typed, made one line: whitespace collapsed and any leading "- " dropped. */
export function cleanRule(typed: string): string {
  return typed.replace(/\s+/g, ' ').trim().replace(/^-\s*/, '')
}

/** The rules file with `rule` added at the end; an empty file starts with the header. */
export function withOwnRule(md: string, rule: string): string {
  const base = md.trim() ? (md.endsWith('\n') ? md : `${md}\n`) : OWN_RULES_HEADER
  return `${base}- ${rule}\n`
}

/** The rules file without the first line holding `rule`; everything else is kept as written. */
export function withoutOwnRule(md: string, rule: string): string {
  const lines = md.split('\n')
  const at = lines.findIndex(l => /^\s*-\s+(.+?)\s*$/.exec(l)?.[1] === rule)
  return at < 0 ? md : [...lines.slice(0, at), ...lines.slice(at + 1)].join('\n')
}
