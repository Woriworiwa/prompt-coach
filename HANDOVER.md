# Handover: prompt-coach v0.9.4 (2026-10-18)

prompt-coach is a Claude Code mod (a plugin with a TypeScript hooks module) in `~/projects/claude-mods/prompt-coach`. It's for Omar. It's a git repo on his personal GitHub, private: https://github.com/Woriworiwa/prompt-coach (branch `main`). The repo's own config sets his personal identity (Omar Dalgamuni, omar@dalgamuni.me) and a credential helper that takes the `Woriworiwa` token from `gh`, so pushes never use his work account (`omar-smartarena`, the global git identity and gh's active account). Keep it separate from his work repositories. `.claude-plugin/types/` is ignored: the installed Claude Code writes it. `README.md` describes it for him, TASKS.md has a one-line log per version, and this file is the brief for the next session.

## Start here

1. Read this file, then skim `hooks/ui.ts` (the pane) and `hooks/register.ts` (the hooks).
2. Don't change code until Omar asks for something. He often starts a session with `/coach` followed by a request.
3. Every change ships the way "How every change ships" says, every time.
4. The latest work (v0.4.4 to v0.9.0) is installed but mostly unchecked in Desktop; see "Left to do".

## What it does now

- **`/improve [draft]`** rewrites a draft into the prompt box and never sends it. With no draft, it rewrites the last prompt Omar sent.
- **`/coach`** opens a pane that Desktop docks beside the transcript. Running it again closes it. `/coach live` and `/coach manual` set the mode and open it.
- **Tabs: Coach (1), Tips (2), Settings (3) and Week (4),** the same on every surface. The terminal draws each tab as a plain button (`1: Coach`), the open one as `[Coach]` in clay. Desktop draws a native button even for `plain`, so there the open tab is clay semibold `Text` (no frame, not pressable) and the others are `dimColor` buttons. Omar confirmed the Desktop tabs look right.
  - **Coach:** Your draft, then the Rewrite right under it. If the rewrite has `[placeholders]`, Fill in the gaps follows: a question, a dropdown of likely answers and a text field per gap. A typed answer wins over a pick. Enter in an empty field removes that gap's whole sentence, and an ⓘ beside the heading reveals the help on hover. Then the buttons: Analyze, Apply (fills the box) and Apply and send (fills, submits as Omar via `$.prompt.submit({ asUser: true })`, then empties the box). Below them, the Checklist and Why each change sub-tabs. The Checklist shows each missing item with the suggestions that fill it, each with Add/Remove, which appends its sentence to the rewrite. A dim footer gives the rules' date and the path to `rules/omar.md`.
  - **Tips:** "Using \<model\> well", in three groups: for this draft (from the analysis), for the session's model, and Claude Code in general. Tips appear only here, never on Coach.
  - **Settings (v0.8.5):** laid out like Desktop's own settings page, from Omar's screenshots. Four sections (`settingsGroup` in `ui.ts`), each a bold title in the normal text color with no box, then its rows: label in the normal weight, dim description under it, control on the right (`settingRow`), and between rows a 1-pixel `Svg` hairline (`hairline`, translucent gray `rgb(128,128,128)` at 0.3 so it reads in light and dark; Desktop and mobile only, since the terminal has no `Svg`). Multi-part content (Statistics, Refresh, Sources and its links) is one row (`block`). Sections sit in a `settings-sections` column with `gap: 'xl'` (v0.8.6), more than the rows' gap of 1. The hairline's props pass the engine's Svg check in 2.1.299 (`fco`: source non-empty, alt a string, height 1 within 4096, width left out); whether Desktop then stretches the 4000-wide markup to the pane's width at 1 pixel is only visible in the app. Mode is a Manual/Live `Select` (buttons `mode-manual`/`mode-live` on mobile); the `l` hotkey is gone. Two styles couldn't be copied, and Omar chose the substitutes: there's no toggle element (so Mode is a Select), and no one-sided border (so the line is an Svg). Before: v0.8.4 bold titles above bordered boxes; v0.7.0 a gray band in the box, which Omar found hard to read. The Week tab's sections still use `group` with the band:
    - **General:** Mode (a Manual/Live dropdown; live is capped at 30 analyses a session), Rewrite model and Refresh model (a `Select`, buttons on mobile, saved via `$.config.set`). A refused change makes the model controls read-only, with the reason.
    - **Statistics:** analyses so far, then two tables (v0.8.8, Omar's choice of layout): Most often missing (Checklist item | Missing or vague in, e.g. 12 of 64) and Rules applied most (Rule | Times), then Clear statistics. `statTable` in `ui.ts` draws each from Boxes: a bold title, a bold dim header row, one row per entry (name wrapping left, count right) with the Svg hairline between rows. It was the Lessons tab; recent drafts are no longer shown, though the store key is still `lessons` and `recordLesson` still keeps them. **Tokens (v0.9.4, Omar's request):** `Lessons.tokens` (`calls`, `input`, `output`, `cacheRead`, `cacheWrite`). `analyze` adds each answered call's `reply.usage` with `addUsage` before parsing, so an unreadable answer counts too. `asLessons` gives older stored values zeros, and `tokenSummary` gives the total, the parts and the per-call figure. Only Analyze and live mode are counted, not /improve; that was Omar's choice. **Layout trial (v0.9.4, temporary):** Omar asked to see every layout option in the pane before choosing. A Layout row (`statsLayoutSetting`: a Select `stats-layout`, or buttons `stats-layout-<id>` on mobile; shown once there's anything to show) switches `statistics` between `statsTables` (the v0.8.8 tables plus a tokens line), `statsGrid` ("name: count" cells at `width: '50%'`), `statsSide` (the two tables at 50% each in one row, then a tokens table) and `statsBars` (`bar()`, 15 cells of █/░, scaled to the analyses for gaps and to the top rule for rules). The choice is kept in `$.store` under `statsLayout`, default `tables`. Box has no `flexBasis`, so the 50% columns don't stack on a narrow pane. Once Omar picks, remove the other three, the switch and the `statsLayout` key.
    - **Rules and tips (v0.8.7):** one section, as Omar asked, merging what were "Refresh rules and tips" and "Sources". First the source pages, always listed (the Show/Hide sources button and its `showSources` state are gone), then a thin line, then the refresh: check sources, Rewrite all, progress, per-file diffs, Accept/Reject. He chose the title and the order (sources first).
    - **Claude Week (v0.9.0):** `weekSettings` in `ui.ts`, as Omar chose: Week model (the same `modelSetting`, key `set-weekModel`, moved out of General), Reader profile (label, help, the path as `Code`, and since v0.9.1 a note when the mod just created it or couldn't) and Sources (the pages in `week/sources.json` as links, `Tier N · label`, linking to `link ?? url` as `fetchSource` does; a warning when the file can't be read). `loadWeek` reads the file into `weekSources`. The Week tab's footer (`weekFooter`) is gone, and its empty text points here.
    - Each setting row (`settingRow` in `ui.ts`) puts its label and help on the left and its control on the right: a flex row with `justifyContent: 'space-between'` that wraps when narrow.
  - **Week:** Claude Week, Omar's weekly digest (his spec is the source of `week/edition-prompt.md` and his reader profile). Details under "Claude Week" below.
- **Inside a conversation,** each analysis also sends Claude's last reply (capped at 6,000 characters), and the draft is read as a reply to it.
- **`/coach refresh`** (and `/coach refresh all`) opens Settings, re-reads the pages in `sources.json`, and proposes rules and tips updates for files whose pages changed. Nothing is written until Omar accepts.

## Claude Week (v0.8.0, written by fetch + model.complete since v0.8.1)

- **Writing:** "Write Claude Week NN" (only while this ISO week has no edition) calls `writeEdition`. It fetches every page in `week/sources.json` at once with `$.http.fetch`, each raced against a 20-second `$.clock.after`. `pageText` cuts HTML or a feed to text (links kept as `text <url>`, 20,000 characters a page); `releasesText` turns the GitHub releases API JSON into the last 14 days of notes (40,000 characters). Then one `$.model.complete` (model `weekModel`, system `week/edition-prompt.md`, `maxTokens` 16,000, a 9-minute timeout) with `buildWeekRequest`: today, the profile, the last 4 editions' feedback, the `<page>` blocks and an `<unread>` list. The job's `progress` text shows on the tab.
- **Why not a subagent (v0.8.0):** in auto mode, the classifier refused the mod's `$.agent.spawn` because no request of Omar's asked for an Agent call. A `tool.check` hook allowing the mod's own spawn was blocked as an auto-mode bypass, so Omar chose this way instead. Its cost: no web search (Tier 4 is gone), and index pages give only titles and dates. `edition-prompt.md` has a "How you read sources here" section saying so.
- **The answer:** `parseEdition` reads the JSON, forces the edition id, prefixes story ids with it, puts sections in order, adds Claude Desktop, and caps at 15 news stories while keeping the Top 3. A bad answer sets the job to failed, keeping the raw answer (20,000 characters at most) under `weekJob.raw`, and shows Try again.
- **Ask in side chat (v0.8.3):** a story's or question's button calls `askAside`, which puts `/btw <question>` in the prompt box (`$.prompt.fill`, replace) and toasts "Press Enter to ask it in the side chat." `asideAboutStory` and `asideAboutQuestion` in `week.ts` build the one-line question: the prompt, then the story or question it comes from, because `/btw` sees only the conversation. If the box can't be filled, the text goes on the clipboard with a toast.
- **Why not `$.command.run('btw')` (v0.8.2, failed in Desktop):** `$.command.run` only runs commands in the engine's own list (`no command named /btw in this session`). In Desktop the engine runs headless, and `/btw` is a `local-jsx` command with `thinClientDispatch: "control-request"`: the Desktop app draws it itself, so it isn't in that list. Even if it were, `command.run` queues the text into the engine, which can't open the app's side chat. No mods API opens it either. Prefilling the box lets the app handle Omar's Enter as a typed `/btw`. (`$.model.fork` is the same mechanism, but its answer would have to be drawn in the pane; Omar chose the prefill.)
- **A job** is stored only when it fails (with `raw`). A `running` job found at session start (from v0.8.0, or a session that ended mid-write) shows as failed.
- **Store keys:** `weekEditions` (by id, never overwritten), `weekFeedback` (by story id, the spec's 3.2 shape, a record dropped once verdict, why and take are all empty), `weekRead` and `weekJob`. They're per config, so personal and business keep separate digests; Omar chose that over a shared folder.
- **Text fields** follow the rule against redrawing on each keystroke: `onInput` schedules a quiet save after 800 ms with no redraw, and Enter saves and redraws, showing Saved or Not saved.
- **Reader profile (v0.9.1):** each user's own file, outside the install, so other users write their own and an install or update never touches it. Omar asked for this. `profilePath` in `week.ts` puts it in Claude Code's per-plugin data folder in the config: `<config>/plugins/data/<plugin>-<marketplace>/profile.yaml`, worked out from `$.plugin.root` (`…/plugins/cache/<marketplace>/<plugin>/<version>`). For a folder loaded directly (a session opened in this repo, which `/reload-plugins` reports as "re-read from its folder"), it's the installed copy's folder, `<plugin>-<plugin>`, under `CLAUDE_CONFIG_DIR`, or `~/.claude` when that's unset. The repo's marketplace shares the plugin's name, so both kinds of session read the same profile. v0.9.1–v0.9.2 used Claude Code's `<plugin>-inline` there instead, so a session in this repo read a blank profile of its own. v0.9.3 fixed that and deleted the blank file. `ensureProfile` in `register.ts` runs in `loadWeek`. When no file is there, it writes `week/profile.example.yaml` there and Settings says so. An existing file is never written. Mods have no data-folder API, so this follows Claude Code's own layout. Uninstalling a plugin may delete its data folder; install and update don't. Omar's profile was copied by hand into both configs' `prompt-coach-prompt-coach` folders. On his say, v0.9.2 removed `week/profile.yaml` from the repo, so the mod ships only the blank template. His filled-in version is in those two folders and in git history.
- **Archive (v0.9.0):** an Archive button (`week-archive`) in the Week tab's nav row once two or more editions are stored, beside ‹ Older / Newer › and Write. It sets `weekArchive`, and `weekTab` then draws only `weekArchive` in `ui.ts`: a heading with Back (`week-archive-back`), then one `settingRow` per edition from `archiveRows` in `week.ts` (title · dates, "(showing)" on the one on screen; "N of M read · K voted" dim under it; Open, `week-open-<id>`), with hairlines between rows. Open calls `show(id)`, which also clears `weekArchive`. Opening renders the stored edition unchanged with today's feedback and read marks, and all of it stays editable, since `storyRef` finds a story in any edition. No store changes. One edition is about 20 KB and the store caps at 4 MiB, so about 150–200 weeks fit; no pruning yet. Omar chose a list on the Week tab, editable old weeks, and a Claude Week section in Settings; the two-edition threshold and no delete are defaults he can change.
- **Decisions Omar made:** fetch plus `model.complete` writes the edition (he first chose a subagent; see above); `$.store` per config; a story's prompt goes in the prompt box as `/btw <question>` for Desktop's side chat (plain prompt until v0.8.1, a failed `command.run` in v0.8.2); a tab in this mod, numbered 4 so the other tabs keep their keys.
- **Choices made without his say on the detail:** the Top 3 lines are plain text, not buttons, since the pane can't scroll to a story; Reopen also unmarks read; a vote switch clears the reason; weekModel defaults to opus; tips aren't counted in the progress.

## Code

| File | What it holds |
| --- | --- |
| `hooks/register.ts` | Every hook and every `$` call, plus the pane state. Passes `e.surface` into the view. |
| `hooks/lib.ts` | Pure logic: prompts, `parseAnalysis`, placeholders (`parsePlaceholders`, `answersFor`, `fillPlaceholders`, `removeSentences`), `parseAdditions`, `withAdditions`, `lastReply`, `recordLesson` |
| `hooks/ui.ts` | Pure logic: the pane's tree. `tabs`, `coachTab`, `tipsTab`, `settingsTab` with `settingsGroup`, `weekSettings`, `hairline`, `statTable`, `group`, `settingRow`, `modelSetting`, `statistics` and `refreshSection`; `weekTab`, `weekArchive`, `storyCard`; `withStableButtons` and `withStableForm` |
| `hooks/refresh.ts` | Pure logic for refresh |
| `hooks/week.ts` | Pure logic for Claude Week: types, `isoWeek`, `dateRange`, `parseWeekSources`, `pageText`, `releasesText`, `parseEdition`, `vote`, `setWhy`, `setTake`, `prune`, `feedbackForPrompt`, `buildWeekRequest`, `readCounts`, `storyRef`, `archiveRows` |
| `hooks/*.test.ts` | 107 tests (`week.test.ts` holds the pure Week tests; the Week pane tests are at the end of `coach.test.ts`) (`coach.test.ts` holds the pane tests; helpers `buttonLook`, `buttonProps`, `textLook`, `boxNode`, `handleOf` read drawn trees) |
| `rules/*.md`, `tips/*.md`, `sources.json` | Content. `rules/omar.md` is Omar's and is never refreshed |
| `week/edition-prompt.md`, `week/profile.example.yaml`, `week/sources.json` | The writer's system prompt (parts 2 and 3 of Omar's spec, plus "How you read sources here"), the blank reader profile a new user starts from (v0.9.1; each user's own profile lives in the data folder, see "Reader profile" under Claude Week), and the pages Write fetches (Classmethod timed out from here on 2026-10-18) |

## How every change ships (Omar expects all of it)

1. Edit the code and add or adjust tests.
2. Run the checks below. All three must pass, on both binaries.
3. Bump `version` in `.claude-plugin/plugin.json`, and note the change in README (if it's user-facing), this file and TASKS.md (one line, ending with the test count and "Not yet checked in Desktop" until Omar confirms).
4. Install in both configs. It's a local marketplace at user scope:
   `claude plugin marketplace update prompt-coach && claude plugin update prompt-coach@prompt-coach`. Run it once with `CLAUDE_CONFIG_DIR=~/.claude-personal` (personal) and once without it (`~/.claude`, the business config).
5. Ask Omar to check it in a new Desktop session, and record what he confirms in TASKS.md and "Left to do".

```bash
npx -y -p typescript@5.6.3 tsc -p . --noEmit --allowImportingTsExtensions
claude plugin validate . --strict && claude plugin test .
```

Run the second line again with Desktop's bundled binary: `~/Library/Application Support/Claude/claude-code/2.1.299/<hash>/claude.app/Contents/MacOS/claude`. Desktop runs that version, and an event it lacks makes it refuse the whole module. (The terminal is on 2.1.302.)

## Rules learned the hard way

- Every Button goes through `withStableButtons`, and every Input and Select through `withStableForm`. A new element on each redraw drops its press handle, and Desktop's first click then does nothing.
- Don't redraw on each keystroke (`onInput` only records the text); redraw on Enter or a pick.
- `$.session.model()` can return `''` in Desktop. The fallback is `turn.complete`'s `e.usage.model`.
- Resolved element tables name every element, including ones a surface lacks. Choose the form fields by `e.surface !== 'mobile'`.
- Desktop ignores `plain` on a Button and always draws a native button. Branch on `v.surface === 'desktop'` where that matters, as `tabs` does.
- `$` may only be passed to top-level functions in `register.ts`. `Text`, `Link` and `Code` take no `key`.
- `Text` `weight` (and `size`, `mono`, `tabular`, Box spacing steps) need Claude Code 2.1.299 or later; older releases draw their own version of the site instead.
- Colors follow Omar's "Claude Desktop CDS" design system (https://claude.ai/artifact/4deoXGZwi6kY6ioirEyy9d): neutral buttons, `variant: 'primary'` for the main action, red only on destructive buttons, clay only on the open tab, and headings in the normal text color. Use typed theme keys only (`ThemeKey` in the types file); there is no dedicated background key, so backgrounds use `subtle`. Mods can't set fonts, and they can't control Desktop's copy icon on `Code` blocks.
- Installed copies run from the plugin cache. A Desktop session opened in this folder loads the mod straight from the folder.
- You can't drive Desktop or sign in a CLI from the shell, so Omar does real-app checks. Desktop's log is at `~/Library/Logs/Claude/claude.ai-web.log`; look for `ui_press not handled`.
- Screenshots Omar mentions may not reach you. If one doesn't, say so and work from the code.

## Decisions (keep them unless Omar says otherwise)

- Keep Omar's intent and language. Add no scope, invent no context, and leave a `[placeholder]` instead.
- Suggestions enter the rewrite only when Omar clicks Add.
- The analysis format is: a `<checklist>`, `<rewrite>`, `<changes>`, `<tips>`, `<additions>` (each line `item | label | sentence`, the item a checklist name or Other) and `<placeholders>` (each line `[token] | question | a ; b`). Ask Omar before changing it.
- Ask before reversing an earlier choice of his; he asks for options first on bigger UI changes. The models are `rewriteModel` (default sonnet) and `refreshModel` (default opus).
- Choices made on Omar's requests, without his explicit say on the detail, that he hasn't objected to: the tab changes apply on every surface, not only Desktop; tabs are numbered in order (Tips 2, Settings 3); "Clear lessons" became "Clear statistics"; the Settings groups are General, Statistics, Rules and tips (merged in v0.8.7), and Claude Week (v0.9.0), in that order.
- No CLAUDE.md: Omar chose to keep this file as the only brief.

## Where to look

- `.claude-plugin/types/claude-code/index.d.ts` is written by the installed Claude Code and wins whenever the docs disagree with it.
- Docs: [overview](https://code.claude.com/docs/en/plugins/mods/overview), [reference](https://code.claude.com/docs/en/plugins/mods/reference) (events, `$` methods, elements per surface, limits), [interface](https://code.claude.com/docs/en/plugins/mods/interface), [troubleshoot](https://code.claude.com/docs/en/plugins/mods/troubleshoot).
- Mods need Claude Code 2.1.287 or later in the terminal (released 2026-10-01). Desktop's Code tab needs its bundled copy at 2.1.286 or later; check it with `/status`.
- Desktop's own pages ([Code tab](https://code.claude.com/docs/en/desktop)) cover installing plugins but never mention mods.
- Not documented for Desktop: how it places a pane (dock or inline, and at what width; the 800-pixel rule in the interface page is VS Code's), how it draws `borderStyle` and `backgroundColor`, when each Desktop release shipped, and anything Desktop-specific about `prompt.edit`, `$.prompt.submit` or `$.config.set`. Only Omar's checks in the app answer these.

## Left to do

**Check in Desktop; Omar has to click.** Run `/reload-plugins` in an open session first, or open a new one. On 2026-10-18 it reported prompt-coach "re-read from its folder". Not yet confirmed in the real app:
- v0.8.1 Week tab: the tab draws (confirmed); Write shows its progress and an edition arrives within a few minutes, with links that open; how good the stories are from index pages alone; votes, reasons and takes survive closing and reopening the pane; Mark read updates the counts; Ask in side chat puts `/btw …` in the prompt box and Enter opens Desktop's side chat with the story's question; groups and buttons read well in light and dark.
- v0.9.1: Settings → Claude Week → Reader profile shows `~/.claude/plugins/data/prompt-coach-prompt-coach/profile.yaml` (personal: under `~/.claude-personal`), with no "blank profile" note, and a Write still reads Omar's profile.
- v0.9.0: Settings ends with Claude Week (Week model, Reader profile path, Sources links that open), and General no longer has Week model; the Week tab has no footer; with two or more editions, Archive lists them with their counts, Open shows an older week with its earlier votes, takes and read marks, a vote there survives closing and reopening the pane, and Back returns. (The business config holds only 2026-W42 and the personal none, so the Archive button appears once a second week is written.)
- v0.8.5–v0.8.8 Settings: it looks like Desktop's own settings page; the Svg hairlines between rows are 1 pixel, span the width and read in light and dark (unseen in Desktop so far); the Mode dropdown switches Manual/Live; the v0.8.6 space between sections is enough; Rules and tips lists the sources first, then the refresh; the Statistics tables (v0.8.8) read well, and their row lines are the same Svg hairlines, also unseen in Desktop.
- v0.6.0 Tips tab shows the tips, and the Coach tab no longer does.
- `/coach refresh` opens Settings, with the refresh under Rules and tips.
- Apply and send actually submits.
- Changing a model under Settings saves it. The reload that follows may reset an open analysis.
- The gap dropdowns and fields work, including Enter in an empty field.
- The ⓘ hover reveal works (Omar said he'd test this himself).
- The colors look right overall. (The v0.4.4 Desktop tabs are confirmed.)
- An Analyze on a reply such as "go with option 2" uses Claude's last reply.
- A real `/coach refresh` after a source page changes. So far only the baseline run has happened.
- v0.9.4: after an Analyze, Settings → Statistics shows the tokens; switch Layout through Tables, Two-column grid, Side by side and Bars, and compare them in light and dark at the pane's width. **Then Omar picks one, and the next version removes the rest of the trial.**

**Ideas, only if Omar asks:** publish to GitHub and the mods gallery, an opener button in the band above the prompt, statistics kept per project, and the same bordered groups on the Coach tab.
