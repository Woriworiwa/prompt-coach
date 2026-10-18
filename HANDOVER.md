# Handover: prompt-coach v0.8.2 (2026-10-18)

prompt-coach is a Claude Code mod (a plugin with a TypeScript hooks module) in `~/projects/claude-mods/prompt-coach`. It's for Omar. It's a git repo on his personal GitHub, private: https://github.com/Woriworiwa/prompt-coach (branch `main`). The repo's own config sets his personal identity (Omar Dalgamuni, omar@dalgamuni.me) and a credential helper that takes the `Woriworiwa` token from `gh`, so pushes never use his work account (`omar-smartarena`, the global git identity and gh's active account). Keep it separate from his work repositories. `.claude-plugin/types/` is ignored: the installed Claude Code writes it. `README.md` describes it for him, TASKS.md has a one-line log per version, and this file is the brief for the next session.

## Start here

1. Read this file, then skim `hooks/ui.ts` (the pane) and `hooks/register.ts` (the hooks).
2. Don't change code until Omar asks for something. He often starts a session with `/coach` followed by a request.
3. Every change ships the way "How every change ships" says, every time.
4. The latest work (v0.4.4 to v0.8.2) is installed but mostly unchecked in Desktop; see "Left to do".

## What it does now

- **`/improve [draft]`** rewrites a draft into the prompt box and never sends it. With no draft, it rewrites the last prompt Omar sent.
- **`/coach`** opens a pane that Desktop docks beside the transcript. Running it again closes it. `/coach live` and `/coach manual` set the mode and open it.
- **Tabs: Coach (1), Tips (2), Settings (3) and Week (4),** the same on every surface. The terminal draws each tab as a plain button (`1: Coach`), the open one as `[Coach]` in clay. Desktop draws a native button even for `plain`, so there the open tab is clay semibold `Text` (no frame, not pressable) and the others are `dimColor` buttons. Omar confirmed the Desktop tabs look right.
  - **Coach:** Your draft, then the Rewrite right under it. If the rewrite has `[placeholders]`, Fill in the gaps follows: a question, a dropdown of likely answers and a text field per gap. A typed answer wins over a pick. Enter in an empty field removes that gap's whole sentence, and an ⓘ beside the heading reveals the help on hover. Then the buttons: Analyze, Apply (fills the box) and Apply and send (fills, submits as Omar via `$.prompt.submit({ asUser: true })`, then empties the box). Below them, the Checklist and Why each change sub-tabs. The Checklist shows each missing item with the suggestions that fill it, each with Add/Remove, which appends its sentence to the rewrite. A dim footer gives the rules' date and the path to `rules/omar.md`.
  - **Tips:** "Using \<model\> well", in three groups: for this draft (from the analysis), for the session's model, and Claude Code in general. Tips appear only here, never on Coach.
  - **Settings:** four bordered groups (`borderStyle: 'round'`, `borderColor: 'subtle'`), each titled on a `backgroundColor: 'subtle'` band:
    - **General:** Mode (Manual/Live, key `l`; live is capped at 30 analyses a session), Rewrite model, Refresh model and Week model (a `Select`, buttons on mobile, saved via `$.config.set`). A refused change makes the model controls read-only, with the reason.
    - **Statistics:** analyses so far, the checklist items most often missing, the rules applied most, and Clear statistics. It was the Lessons tab; recent drafts are no longer shown, though the store key is still `lessons` and `recordLesson` still keeps them.
    - **Refresh rules and tips:** what was the Refresh tab: check sources, Rewrite all, progress, per-file diffs, Accept/Reject.
    - **Sources:** Show/Hide sources.
    - Each setting row (`settingRow` in `ui.ts`) puts its label and help on the left and its control on the right: a flex row with `justifyContent: 'space-between'` that wraps when narrow.
  - **Week:** Claude Week, Omar's weekly digest (his spec is the source of `week/edition-prompt.md` and `week/profile.yaml`). Details under "Claude Week" below.
- **Inside a conversation,** each analysis also sends Claude's last reply (capped at 6,000 characters), and the draft is read as a reply to it.
- **`/coach refresh`** (and `/coach refresh all`) opens Settings, re-reads the pages in `sources.json`, and proposes rules and tips updates for files whose pages changed. Nothing is written until Omar accepts.

## Claude Week (v0.8.0, written by fetch + model.complete since v0.8.1)

- **Writing:** "Write Claude Week NN" (only while this ISO week has no edition) calls `writeEdition`. It fetches every page in `week/sources.json` at once with `$.http.fetch`, each raced against a 20-second `$.clock.after`. `pageText` cuts HTML or a feed to text (links kept as `text <url>`, 20,000 characters a page); `releasesText` turns the GitHub releases API JSON into the last 14 days of notes (40,000 characters). Then one `$.model.complete` (model `weekModel`, system `week/edition-prompt.md`, `maxTokens` 16,000, a 9-minute timeout) with `buildWeekRequest`: today, the profile, the last 4 editions' feedback, the `<page>` blocks and an `<unread>` list. The job's `progress` text shows on the tab.
- **Why not a subagent (v0.8.0):** in auto mode, the classifier refused the mod's `$.agent.spawn` because no request of Omar's asked for an Agent call. A `tool.check` hook allowing the mod's own spawn was blocked as an auto-mode bypass, so Omar chose this way instead. Its cost: no web search (Tier 4 is gone), and index pages give only titles and dates. `edition-prompt.md` has a "How you read sources here" section saying so.
- **The answer:** `parseEdition` reads the JSON, forces the edition id, prefixes story ids with it, puts sections in order, adds Claude Desktop, and caps at 15 news stories while keeping the Top 3. A bad answer sets the job to failed, keeping the raw answer (20,000 characters at most) under `weekJob.raw`, and shows Try again.
- **Ask in side chat (v0.8.2):** a story's or question's button calls `askAside`, which runs `$.command.run({ command: 'btw', args })`, Claude Code's own side question, as if Omar typed `/btw`. `asideAboutStory` and `asideAboutQuestion` in `week.ts` build the one-line question: the prompt, then the story or question it comes from, because `/btw` sees only the conversation. If `command.run` rejects, the text goes in the prompt box with a toast. There's no mods API for a side chat of the mod's own; `$.model.fork` is the same idea, but its answer would have to be drawn in the pane.
- **A job** is stored only when it fails (with `raw`). A `running` job found at session start (from v0.8.0, or a session that ended mid-write) shows as failed.
- **Store keys:** `weekEditions` (by id, never overwritten), `weekFeedback` (by story id, the spec's 3.2 shape, a record dropped once verdict, why and take are all empty), `weekRead` and `weekJob`. They're per config, so personal and business keep separate digests; Omar chose that over a shared folder.
- **Text fields** follow the rule against redrawing on each keystroke: `onInput` schedules a quiet save after 800 ms with no redraw, and Enter saves and redraws, showing Saved or Not saved.
- **Decisions Omar made:** fetch plus `model.complete` writes the edition (he first chose a subagent; see above); `$.store` per config; a story's prompt opens a `/btw` side chat (it filled the prompt box until v0.8.2; never the clipboard); a tab in this mod, numbered 4 so the other tabs keep their keys.
- **Choices made without his say on the detail:** the Top 3 lines are plain text, not buttons, since the pane can't scroll to a story; Reopen also unmarks read; a vote switch clears the reason; weekModel defaults to opus; tips aren't counted in the progress.

## Code

| File | What it holds |
| --- | --- |
| `hooks/register.ts` | Every hook and every `$` call, plus the pane state. Passes `e.surface` into the view. |
| `hooks/lib.ts` | Pure logic: prompts, `parseAnalysis`, placeholders (`parsePlaceholders`, `answersFor`, `fillPlaceholders`, `removeSentences`), `parseAdditions`, `withAdditions`, `lastReply`, `recordLesson` |
| `hooks/ui.ts` | Pure logic: the pane's tree. `tabs`, `coachTab`, `tipsTab`, `settingsTab` with `group`, `settingRow`, `modelSetting`, `statistics` and `refreshSection`; `withStableButtons` and `withStableForm` |
| `hooks/refresh.ts` | Pure logic for refresh |
| `hooks/week.ts` | Pure logic for Claude Week: types, `isoWeek`, `dateRange`, `parseWeekSources`, `pageText`, `releasesText`, `parseEdition`, `vote`, `setWhy`, `setTake`, `prune`, `feedbackForPrompt`, `buildWeekRequest`, `readCounts`, `storyRef` |
| `hooks/*.test.ts` | 92 tests (`week.test.ts` holds the pure Week tests; the Week pane tests are at the end of `coach.test.ts`) (`coach.test.ts` holds the pane tests; helpers `buttonLook`, `buttonProps`, `textLook`, `boxNode`, `handleOf` read drawn trees) |
| `rules/*.md`, `tips/*.md`, `sources.json` | Content. `rules/omar.md` is Omar's and is never refreshed |
| `week/edition-prompt.md`, `week/profile.yaml`, `week/sources.json` | The writer's system prompt (parts 2 and 3 of Omar's spec, plus "How you read sources here"), his reader profile (his to edit), and the pages Write fetches (Classmethod timed out from here on 2026-10-18) |

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
- Choices made on Omar's requests, without his explicit say on the detail, that he hasn't objected to: the tab changes apply on every surface, not only Desktop; tabs are numbered in order (Tips 2, Settings 3); "Clear lessons" became "Clear statistics"; the Settings groups are General, Statistics, Refresh rules and tips, and Sources, in that order.
- No CLAUDE.md: Omar chose to keep this file as the only brief.

## Where to look

- `.claude-plugin/types/claude-code/index.d.ts` is written by the installed Claude Code and wins whenever the docs disagree with it.
- Docs: [overview](https://code.claude.com/docs/en/plugins/mods/overview), [reference](https://code.claude.com/docs/en/plugins/mods/reference) (events, `$` methods, elements per surface, limits), [interface](https://code.claude.com/docs/en/plugins/mods/interface), [troubleshoot](https://code.claude.com/docs/en/plugins/mods/troubleshoot).
- Mods need Claude Code 2.1.287 or later in the terminal (released 2026-10-01). Desktop's Code tab needs its bundled copy at 2.1.286 or later; check it with `/status`.
- Desktop's own pages ([Code tab](https://code.claude.com/docs/en/desktop)) cover installing plugins but never mention mods.
- Not documented for Desktop: how it places a pane (dock or inline, and at what width; the 800-pixel rule in the interface page is VS Code's), how it draws `borderStyle` and `backgroundColor`, when each Desktop release shipped, and anything Desktop-specific about `prompt.edit`, `$.prompt.submit` or `$.config.set`. Only Omar's checks in the app answer these.

## Left to do

**Check in a new Desktop session; Omar has to click.** Not yet confirmed in the real app:
- v0.8.1 Week tab: the tab draws (confirmed); Write shows its progress and an edition arrives within a few minutes, with links that open; how good the stories are from index pages alone; votes, reasons and takes survive closing and reopening the pane; Mark read updates the counts; Ask in side chat opens Desktop's side chat with the story's question (and whether it works while Claude is busy, since `command.run` queues until the session is idle); groups and buttons read well in light and dark.
- v0.7.0 Settings groups: the borders and the subtle title band read well in light and dark, and each control sits on the right of its label.
- v0.6.0 Tips tab shows the tips, and the Coach tab no longer does.
- v0.5.0 Settings holds Statistics and Refresh rules and tips, and `/coach refresh` lands there.
- Apply and send actually submits.
- Changing a model under Settings saves it. The reload that follows may reset an open analysis.
- The gap dropdowns and fields work, including Enter in an empty field.
- The ⓘ hover reveal works (Omar said he'd test this himself).
- The colors look right overall. (The v0.4.4 Desktop tabs are confirmed.)
- An Analyze on a reply such as "go with option 2" uses Claude's last reply.
- A real `/coach refresh` after a source page changes. So far only the baseline run has happened.

**Ideas, only if Omar asks:** publish to GitHub and the mods gallery, an opener button in the band above the prompt, statistics kept per project, and the same bordered groups on the Coach tab.
