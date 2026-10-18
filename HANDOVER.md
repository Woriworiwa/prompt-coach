# Handover: prompt-coach v0.17.4

prompt-coach is a Claude Code mod (a plugin with a TypeScript hooks module) in `~/projects/claude-mods/prompt-coach`, made for Omar. It's a private git repo on his personal GitHub: https://github.com/Woriworiwa/prompt-coach, branch `main`. The repo's own git config sets his personal identity (Omar Dalgamuni, omar@dalgamuni.me) and a credential helper that takes the `Woriworiwa` token from `gh`. Pushes must never use his work account (`omar-smartarena`, the global git identity and gh's active account), and the repo stays separate from his work repositories. `.claude-plugin/types/` is ignored because the installed Claude Code writes it.

This file is the only brief and describes the current state. `.claude/CLAUDE.md` imports it into every session and says to keep it current as you go. Version history lives in `TASKS.md` (one line per version) and in the commits. `README.md` describes the mod for Omar.

## Start here

1. In your first reply, give the current version and what's open (see "Left to do").
2. Don't change code until Omar asks for something. He often starts with `/coach` followed by a request.
3. Every change ships the way "How every change ships" says, every time.
4. Open sessions in `~/projects/claude-mods/prompt-coach` so `.claude/CLAUDE.md` loads at launch. It sits in `.claude/` because a `CLAUDE.md` at the plugin root fails `validate --strict`. A session there loads the mod straight from this folder, not from the installed copy.

## What it does now

- **`/improve [draft]`** rewrites a draft into the prompt box and never sends it. With no draft, it rewrites the last prompt Omar sent.
- **`/coach`** opens a pane that Desktop docks beside the transcript. Running it again closes it. `/coach live` and `/coach manual` set the mode and open it. `/coach refresh` (and `refresh all`) opens Settings and proposes rules updates for files whose source pages changed. Nothing is written until Omar accepts.
- **Inside a conversation,** each analysis also sends Claude's last reply (capped at 6,000 characters), and the draft is read as a reply to it.
- **Tabs:** Coach (1), Analytics (2) and News (3) on the left, Settings (4) alone at the right end, the same on every surface. `tabs()` puts them in one `tabs` Box with `justifyContent: 'space-between'`. The terminal draws each tab as a plain button, with the open one in clay brackets. Desktop always draws a native button, so there the open tab is clay semibold `Text` and the others are `dimColor` buttons. News is the Week tab's label: its key is `tab-week`, the code calls it the Week tab, and the digest is still "Claude Week".
  - **Coach:** your draft, then the rewrite under it. If the rewrite has `[placeholders]`, "Fill in the gaps" follows, with a question, a dropdown of likely answers and a text field per gap. A typed answer wins over a pick, and Enter in an empty field removes that gap's sentence. An ⓘ beside the heading reveals help on hover. Then Analyze, Apply (fills the box) and Apply and send (fills it, submits as Omar with `$.prompt.submit({ asUser: true })`, then empties the box). Below them, the Checklist and Why each change sub-tabs. The Checklist shows each missing item with the suggestions that fill it, each with Add/Remove. A dim footer gives the rules' date and the path to Omar's rules file.
  - **Analytics** (`analyticsTab`): first Statistics (below), then a hairline, then Rules (`ruleList`). The Tips section was removed in v0.17.0 at Omar's say (he didn't find it useful): no tips files, no `<tips>` in the analysis, no model or Claude Code tips.
  - **Settings** is laid out like Desktop's own settings page, with four sections (`settingsGroup`): General, Your rules, Rules and tips, and Claude Week. Each section is a bold title with no box, then rows (`settingRow`: label and dim help on the left, control on the right, wrapping when narrow), with a 1-pixel `Svg` hairline between rows (`hairline`: translucent gray, Desktop and mobile only). Sections sit in `settings-sections` with `gap: 'xl'`. Mods have no toggle element and no one-sided border, so Omar chose a Select for Mode and the Svg line.
    - **General:** Mode (Manual or Live; live is capped at 30 analyses a session), Rewrite model and Refresh model. Model changes are saved with `$.config.set`. A refused change makes them read-only, with the reason.
    - **Your rules** (`ownRulesSettings`): the rules file's path, each rule with Remove (`remove-rule-<rule>`), and an Add a rule field (`add-rule-<gen>`, emptied after each add; none on mobile). A note says Added, Removed, already there, or Not saved.
    - **Rules** (titled "Rules and tips" until v0.17.0): the source pages, always listed, then the refresh (check sources, Rewrite all, progress, per-file diffs, Accept/Reject). Omar chose the title and the order.
    - **Claude Week:** Week model, Reader profile (its path, plus a note when the mod just created it or couldn't), and Sources (the pages in `week/sources.json` as links, `Tier N · label`).
  - **News:** Claude Week (below).

## Your rules

Omar's own rules for the coach, chosen on 2026-10-18 so he can change them from the app and so they aren't tied to the repo. They live in `<config>/plugins/data/prompt-coach-prompt-coach/rules.md`, next to the reader profile (`dataDir` in `lib.ts`, which `profilePath` also uses). The repo ships no rules file and no example; `rules/omar.md` was deleted in v0.12.0.

- A missing file means no rules. The mod writes it only when the first rule is added, starting with `OWN_RULES_HEADER` (a string in `lib.ts`).
- A rule is a line starting with "- " (`ownRuleLines`). Add appends one (`withOwnRule`, after `cleanRule`), and Remove drops that line only (`withoutOwnRule`), so headings and notes typed by hand stay.
- `loadRules` re-reads the file on every analysis and `/improve`, and opening Settings re-reads it, so hand edits apply at once. It's sent last and wins on conflict.
- Omar's rule ("Keep the draft's language…") was moved into both configs' files by hand on 2026-10-18. The data folder isn't in git, and uninstalling may delete it.

## Statistics (Analytics tab)

**Off since v0.14.0** (Omar, 2026-10-18), until the checklist design is agreed: `STATS_ON = false` in `analytics.ts` skips `addUsage`, `recordDraft` and `noteApplied`, `statistics` draws one dim line instead, and the statistics' pane tests run only when it is true (`statsTest`). The stored `analytics` is kept untouched, and it reads only the old six items (`CHECKLIST` now lives in `analytics.ts`). What follows is how they work when on; the v0.11.0 Desktop check waits until they are back.

The goal, set by Omar, is to help him write better prompts by showing what he does well and where he can improve. `hooks/analytics.ts` (pure) keeps one `DraftRecord` per analyzed draft, with no draft text: each checklist item's status, the rules behind the changes (each once), the suggestions offered (item and sentence), how many were added, whether the rewrite was applied, and the session's model label. Up to 200 drafts are kept (`MAX_DRAFTS`), newest first, under the store key `analytics`, together with `tokens`. Nothing here calls a model.

- **Recording:** `analyze` calls `addUsage` before parsing, so an unreadable answer still counts its tokens, then `recordDraft`. Apply and Apply and send call `noteApplied` (`recordUse` with the number of suggestions added). Only Analyze and live mode are counted, not /improve; Omar chose that. Session start deletes the store keys `lessons` (statistics before v0.11.0, cleared at Omar's say) and `statsLayout`.
- **Drawn by `statistics` in `ui.ts`, in this order:**
  1. `scoreLine`: the average `draftScore` of the last 10 drafts (`RECENT`) against the 10 before, once there are 5 of them. A draft scores a point per item present or n/a and half for a vague one, out of 6.
  2. `focusBlock`: the item most often missing or vague lately, with the newest sentence the coach suggested for it.
  3. `gapBars`: a bar per item missing or vague, with a dim note of how often it was left out, how often vague, and the last 10 against the 10 before.
  4. `strengthsBlock`: up to 3 items present in at least 60% of drafts.
  5. `changedBars`: "What the coach changed most", for the session's model only, each rule counted once per draft and shown as "x of y".
  6. `adviceLine`: suggestions added of those offered, and rewrites applied.
  7. `tokensLine`: last and dim.
  8. Clear statistics (key `clear-lessons`).
- **Bars** (`barRow`, `barText`): monospaced, both parts drawn with █ and the empty part dimmed, counts padded with no-break spaces. Omar picked Bars over three other layouts and confirmed in Desktop that they line up and both parts are the same height. In Desktop's fonts, ░ is shorter than █ and the proportional face gives each character a different width.

## Rules list (Analytics tab)

Omar's option A (2026-10-18), laid out by him in v0.16.0 and boxed in v0.17.1 (`group`, the Week tab's box style): Rules holds three groups, General first and closed, then the model (its name a `rules-model` Select of every model, `rules-pick-<file>` buttons on mobile; it starts on the session model, `rulesPick` '' following it; closed at first since v0.17.4, like the other groups), then Your rules with `rules-edit-own`. Each toggles with `rules-toggle-<group>`. There is no separate Checklist group: `parseRuleFile` keeps the Checklist as one of a file's sections. The borrowed-file note sits under the model's row. Each model file lists its sources as "- " lines under "Source(s), paraphrased:", so they show (and count) in its rules: Omar wants them there (v0.17.2), so don't filter them out. The Select is keyed by the pick (`rules-model-<file>`, `rules-model-none`): `withStableForm` leaves `value` out of its comparison, so under one key it kept showing the first pick (fixed in v0.17.3). `loadRuleFiles` reads every rule file on sync, on opening Analytics and on each Analyze.

## Checklist (in the rule files)

Since v0.14.0 the checklist an Analyze judges by comes from the rule files, not the code. v0.15.0 (Omar, 2026-10-18): each model file's `## Checklist` is complete and inherits nothing (repeats across models accepted); `general.md` keeps one for older and unknown models. Lines are `- Name: definition. Source: …`. Today every model has Goal, Context, Constraints, Output (general guide, Constraints reworded for Sonnet and Fable, Goal for Opus) plus Done means and Stop rule worded per model; general.md has the first five.

- `lib.ts`: `parseChecklist`, `checklistFor(general, model)` (model's own, else general, else `FALLBACK_CHECKLIST`, with `from`), `analysisSystem(items)`, `withoutChecklist` (the rules go with the draft without it, `/improve` too).
- `rulesFor` borrows: a newer version than any file (Opus 6, Sonnet 6.1, Mythos 5.2) gets the newest older file of its family (`MODEL_FAMILIES`), `model` its own label and `isBorrowed`; the pane shows "No rules file for Opus 6 yet; it uses Opus 5.5's." Older models get general.md.
- Refresh: each model target in `sources.json` also lists the general guide; `REFRESH_SYSTEM` asks for a complete checklist with the four general names kept exactly, a source on every line, and a quoted `<!-- Dropped … -->` comment for any general item dropped; general.md is refreshed first.
- The model-guide lines it cites are written for system prompts in apps; applying them to prompts typed in Claude Code is a reading Omar accepted.

## Claude Week

Omar's weekly digest; his spec is the source of `week/edition-prompt.md` and the reader profile.

- **Writing:** "Write Claude Week NN" shows only while this ISO week has no edition. `writeEdition` fetches every page in `week/sources.json` at once (`$.http.fetch`, each raced against 20 seconds). `pageText` cuts HTML or a feed to text (20,000 characters a page), and `releasesText` keeps the last 14 days of GitHub releases. Then one `$.model.complete` call (`weekModel`, default opus; system `week/edition-prompt.md`; 16,000 max tokens; 9-minute timeout) with `buildWeekRequest`: today, the profile, the last 4 editions' feedback, the pages and an `<unread>` list. The tab shows the job's progress.
- **Why not a subagent:** auto mode's classifier refused the mod's `$.agent.spawn`, and a `tool.check` hook allowing it was blocked as a bypass, so Omar chose fetch plus `model.complete`. The cost is no web search and only titles and dates from index pages. `edition-prompt.md` says so.
- **The answer:** `parseEdition` reads the JSON, forces the edition id, orders the sections, adds Claude Desktop, and keeps at most 15 news stories while keeping the Top 3. A bad answer fails the job, keeps the raw answer under `weekJob.raw`, and shows Try again. A job is stored only when it fails, and a `running` job found at session start shows as failed.
- **Ask in side chat:** puts `/btw <question>` in the prompt box (`askAside`, `$.prompt.fill`) for Omar to send with Enter; if the box can't be filled, the question goes on the clipboard. `$.command.run('btw')` can't work, because in Desktop `/btw` is drawn by the app, not listed in the engine, and no mods API opens the side chat.
- **Archive:** shows once two or more editions are stored. It lists each edition with its counts, and Open shows it as it was, still editable (`weekArchive`, `archiveRows`). There's no delete and no pruning yet; about 150–200 weeks fit in the store.
- **Store keys:** `weekEditions` (never overwritten), `weekFeedback`, `weekRead` and `weekJob`, kept per config, so personal and business have separate digests (Omar's choice). The business config holds W40–W42; W40 and W41 were written by hand on 2026-10-18 (backup in `~/projects/claude-mods/prompt-coach-backups/2026-10-18/`). The personal config has none.
- **Text fields:** `onInput` saves quietly after 800 ms with no redraw. Enter saves and redraws, showing Saved or Not saved.
- **Reader profile:** each user's own file, outside the install, so updates never touch it: `<config>/plugins/data/<plugin>-<marketplace>/profile.yaml` (`profilePath` in `week.ts`, on `dataDir`). For a folder loaded directly, it's the installed copy's folder, `<plugin>-<plugin>`. Mods have no data-folder API, so this follows Claude Code's own layout. `ensureProfile` writes `week/profile.example.yaml` there only when no file exists. Uninstalling a plugin may delete its data folder. Omar's profile is in both configs' `prompt-coach-prompt-coach` folders.
- **Choices made without Omar's say on the detail:** the Top 3 are plain text, not buttons; Reopen also unmarks read; switching a vote clears its reason; tips aren't counted in the progress.

## Code

| File | What it holds |
| --- | --- |
| `hooks/register.ts` | Every hook and every `$` call, plus the pane state |
| `hooks/lib.ts` | Pure: prompts, `parseAnalysis`, placeholders, `parseAdditions`, `withAdditions`, `lastReply`, `CHECKLIST`, `dataDir` and the own-rules helpers |
| `hooks/analytics.ts` | Pure: the statistics (`recordDraft`, `recordUse`, `addUsage`, `itemStats`, `scoreTrend`, `strengths`, `focus`, `rulesFor`, `advice`) |
| `hooks/ui.ts` | Pure: the pane's tree (`tabs`, `coachTab`, `analyticsTab`, `statistics`, `settingsTab`, `weekTab`, `weekArchive`, `storyCard`, `withStableButtons`, `withStableForm`) |
| `hooks/refresh.ts` | Pure: refresh |
| `hooks/week.ts` | Pure: Claude Week (`parseEdition`, `buildWeekRequest`, `pageText`, `releasesText`, `profilePath`, `archiveRows`, …) |
| `hooks/*.test.ts` | 125 tests (the statistics' pane tests are off with the statistics). `coach.test.ts` holds the pane tests; `analytics.test.ts` and `week.test.ts` hold the pure ones |
| `rules/*.md`, `sources.json` | Content, all refreshed from the source pages. Omar's own rules aren't here (see Your rules) |
| `week/edition-prompt.md`, `week/profile.example.yaml`, `week/sources.json` | The writer's system prompt, the blank profile a new user starts from, and the pages Write fetches (Classmethod times out from here) |

## How every change ships (Omar expects all of it)

1. Edit the code and add or adjust tests.
2. Run the checks below. All three must pass, on both binaries.
3. Bump `version` in `.claude-plugin/plugin.json`. Update this file (rewrite what changed), README if it's user-facing, and add one line to TASKS.md ending with the test count and "Not yet checked in Desktop".
4. Install in both configs (a local marketplace at user scope): `claude plugin marketplace update prompt-coach && claude plugin update prompt-coach@prompt-coach`, once with `CLAUDE_CONFIG_DIR=~/.claude-personal` and once without (`~/.claude`, the business config).
5. Commit with the repo's local identity and push.
6. Ask Omar to check it in Desktop after `/reload-plugins`. Reopen the pane with `/coach` twice so it syncs again. Record what he confirms in TASKS.md and drop it from "Left to do".

```bash
npx -y -p typescript@5.6.3 tsc -p . --noEmit --allowImportingTsExtensions
claude plugin validate . --strict && claude plugin test .
```

Run the second line again with Desktop's bundled binary, `~/Library/Application Support/Claude/claude-code/2.1.299/<hash>/claude.app/Contents/MacOS/claude`. Desktop runs that version and refuses the whole module if it lacks an event. The terminal is on 2.1.302.

## Rules learned the hard way

- Every Button goes through `withStableButtons`, and every Input and Select through `withStableForm`. A Select whose value the code changes must carry that value in its key, or it keeps showing the old one. A new element on each redraw drops its press handle, and Desktop's first click then does nothing.
- Don't redraw on each keystroke (`onInput` only records the text); redraw on Enter or a pick.
- `$.session.model()` can return `''` in Desktop. The fallback is `turn.complete`'s `e.usage.model`.
- Resolved element tables name every element, including ones a surface lacks. Choose the form fields by `e.surface !== 'mobile'`.
- Desktop ignores `plain` on a Button. Branch on `v.surface === 'desktop'` where that matters, as `tabs` does.
- `$` may only be passed to top-level functions in `register.ts`. `Text`, `Link` and `Code` take no `key`.
- `Text` `weight`, `size`, `mono`, `tabular` and Box spacing steps need Claude Code 2.1.299 or later.
- Colors follow Omar's "Claude Desktop CDS" design system (https://claude.ai/artifact/4deoXGZwi6kY6ioirEyy9d): neutral buttons, `variant: 'primary'` for the main action, red only on destructive buttons, clay only on the open tab, headings in the normal text color. Use typed theme keys only; backgrounds use `subtle`. Mods can't set fonts or control Desktop's copy icon on `Code` blocks.
- Desktop collapses runs of ordinary spaces; use no-break spaces (U+00A0) for padding.
- `/reload-plugins` reloads the mod in an open session. A pane left open across a reload is redrawn by the new code but doesn't sync again, so its Sources list and rules date stay empty until `/coach` reopens it or an Analyze runs. A fix was offered (sync on draw when not yet synced); see "Left to do".
- A running session may hold the store. Edit a store file by hand only with no session running; otherwise change it through `$.store` from the mod.
- You can't drive Desktop or sign in a CLI from the shell, so Omar does real-app checks. Desktop's log is at `~/Library/Logs/Claude/claude.ai-web.log`; look for `ui_press not handled`.
- Screenshots Omar mentions may not reach you. If one doesn't, say so and work from the code.

## Decisions (keep them unless Omar says otherwise)

- Keep Omar's intent and language. Add no scope, invent no context, and leave a `[placeholder]` instead.
- Suggestions enter the rewrite only when Omar clicks Add.
- The analysis format is a `<checklist>`, `<rewrite>`, `<changes>`, `<additions>` (each line `item | label | sentence`) and `<placeholders>` (each line `[token] | question | a ; b`). Ask Omar before changing it. The checklist items come from the rule files and differ per model (see Checklist).
- Ask before reversing an earlier choice of his. He asks for options first on bigger UI changes. The models default to sonnet (`rewriteModel`), opus (`refreshModel`) and opus (`weekModel`).
- Made on his requests and not objected to: tab changes apply on every surface, not only Desktop; tabs are numbered in the order shown.
- Session handover: keep this file current as you go (`CLAUDE.md`). Rewrite rather than add, keep history in TASKS.md and the commits, and keep this file under about 150 lines. NEXT-SESSION.md was dropped on 2026-10-18.

## Where to look

- `.claude-plugin/types/claude-code/index.d.ts` is written by the installed Claude Code and wins whenever the docs disagree with it.
- Mods docs: [overview](https://code.claude.com/docs/en/plugins/mods/overview), [reference](https://code.claude.com/docs/en/plugins/mods/reference), [interface](https://code.claude.com/docs/en/plugins/mods/interface), [troubleshoot](https://code.claude.com/docs/en/plugins/mods/troubleshoot). Mods need Claude Code 2.1.287 or later in the terminal; Desktop's bundled copy needs 2.1.286 or later.
- Not documented for Desktop: how it places a pane, how it draws `borderStyle` and `backgroundColor`, and anything Desktop-specific about `prompt.edit`, `$.prompt.submit` or `$.config.set`. Only Omar's checks in the app answer these.

## Left to do

**Decide:** how Statistics come back now that each model has its own checklist (the stored records and the score assume the old six items), then turn them on and check them in Desktop.

**Decide:** the fix for an empty Sources list after `/reload-plugins` with the pane open (see "Rules learned the hard way").

**Check in Desktop** (Omar clicks; `/reload-plugins` first):
- Week tab: Archive lists W42, W41 and W40 with their counts, Open shows each one, and Back returns. Write shows its progress and an edition arrives with links that open. Votes, reasons and takes survive closing and reopening the pane. Mark read updates the counts. Ask in side chat puts `/btw …` in the prompt box and Enter opens the side chat. Also how good the stories are from index pages alone.
- Coach: Apply and send submits; changing a model under Settings saves it (the reload after it may reset an open analysis); the gap dropdowns and fields work, including Enter in an empty field; the ⓘ hover reveal (Omar said he'd test this himself); an Analyze on a reply such as "go with option 2" uses Claude's last reply; the colors look right overall.
- A real `/coach refresh` after a source page changes. So far only the baseline run has happened.

**Ideas, only if Omar asks:** publish to GitHub and the mods gallery, an opener button in the band above the prompt, statistics per project, a `/handover` skill (not needed now that this file is kept current as you go).
