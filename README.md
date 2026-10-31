# prompt-coach

A Claude Code mod that helps you write better prompts, learn why they're better, and use your session's model the way it was designed to be used.

It has two parts, plus a weekly digest:

- **`/coach`** opens a side pane that reads the draft in your prompt box before you send it. It shows a checklist, a rewrite, the reason for each change, and, on the Analytics tab, statistics on what your drafts most often miss, and the rules the coach uses for any model.
- **`/improve <draft>`** is the quick path. It rewrites the draft straight into the prompt box, with a dim transcript line saying what changed.
- **Claude Week**, on the pane's Week tab: a weekly digest about Claude, Claude Code, Claude Desktop, usage limits and Anthropic. Vote on stories and add your own take; the next edition reads them first.

Inside a conversation, both read your draft as a reply to Claude's last message, so "go with option 2" or "yes, do that" is judged against what Claude just said. The pane no longer shows a note about it (v0.26.1). A very long reply is cut to its start and end (6,000 characters in all).

`/improve` never sends anything: the rewrite only goes into the prompt box, and you edit it and press Enter yourself. In the pane, **Send** puts the rewrite in the box and sends it straight away.

## The coach pane

```
/coach            open or close the pane
/coach live       open it in live mode
/coach manual     open it in manual mode
/coach refresh    check the source pages for changes and propose updated rules
/coach refresh all  rewrite every rules file from today's pages
```

The pane has four tabs: Coach (`1`), Analytics (`2`) and News (`3`) on the left, and Settings (`4`) at the right end. In the terminal the open tab shows in clay brackets. In the Desktop app it shows as clay text, and the other tabs are dim buttons.

**Coach tab**

In order from the top:

- **Your draft** (no label): what's in the prompt box now.
- **Quick instructions:** a row of buttons with short lines from your session model's prompting guide, such as **Answer directly** and **Short why** for Opus 5.5, or **Options first** and **No extras** for Sonnet 5.5. A press adds the line to the end of your prompt, with no model call; press again to take it out. With a rewrite on screen, the line goes into the rewrite instead, and Send sends it. Each model has its own list, in its rules file under `## Quick instructions` (general.md's for older models), refreshed with the rules and shown under Rules on the Analytics tab.
- **Rewrite** (`a`; called Analyze before v0.25.0), right under your draft: one model call. The button is always active. The analyzed draft stays on screen, even if the prompt box empties, until you start typing a new one; the pane reads the prompt box every second, so the box follows your typing. It checks the draft against the checklist for your session's model. Each model's rule file has its own complete checklist and inherits nothing: Goal, Context, Constraints and Output from Anthropic's general guide, then Done means and Stop rule worded for that model. `general.md` has a checklist too, for older and unknown models. A newer model with no file yet (say Opus 6) uses the newest older file of its family, and the pane says so. Every item names the part of the guides it comes from, and `/coach refresh` keeps each list current, reading the general guide for every model file. It marks each as ✓ present, ~ vague, ✗ missing or – not needed. It also flags habits that don't help, such as "think step by step" or asking to see its reasoning.
- **The rewrite** (the box under the Rewrite button, with no heading of its own): your draft rewritten with the same intent. It adds no new requirements, and anything it would add is a suggestion instead. Where a detail is missing, it leaves a placeholder such as `[which file?]` instead of guessing. It shows as a read-only text block across the pane; you can't edit it there. Since there's no Copy to prompt, Send sends it as shown, with your gap answers and added suggestions.
- **Send** (`p`), right under the rewrite: puts the rewrite in the prompt box and sends it. There's no Copy to prompt since v0.29.0; to change the rewrite before sending, select and copy it into the prompt box and edit it there.
- **The gap questions** (no heading, indented like the suggestions): for each `[placeholder]` in the rewrite, a question, then a dropdown of likely answers (taken only from your draft and Claude's last reply) and a text field on one line. A typed answer wins over a pick. Enter updates the rewrite; Send uses your answers either way. Unanswered placeholders stay in brackets. Press Enter in an empty field (nothing picked) to drop that gap and the whole sentence around it; type or pick an answer to bring it back. The mobile app has no fields, so it lists the placeholders still in brackets instead.
- **Suggestions**, right after the gap questions: each **Suggestion:** with its label, the exact sentence, and **Add** (puts it at the end of the rewrite) or **Remove**. Nothing is added unless you click.
- **Checklist:** one box, styled like a Settings section, with a thin line between items. Each item shows its mark, its name and the note on how your draft does on one line, then right under it what the rewrite changed for it (**Rewrite** and why it helps, so you learn the pattern). Changes that fill no item come last, under Other changes, each with the rule behind it.
- **Live 3/30:** a dim reminder under the tabs while live mode is on, with the count used this session. Switch modes under Settings.

**Analytics tab** (`2`): first **Statistics** (below), then **Rules**, in a box: what the coach checks drafts against, in three groups, each with its rule count and Show or Hide. **General** comes first, closed. Then your session's model, whose name is a dropdown of every model so you can read another's rules (the mobile app shows buttons instead); its rules start closed too, and its checklist shows as one of its sections, each item with its source. If your model borrows an older model's file, a line under it says so. Then **Your rules**, with **Edit in Settings**.

**Statistics** help you write better prompts. They were off from v0.14.0 to v0.36.0 while the checklist moved into the rule files, and the drafts recorded before were kept. Each draft is judged against its own model's checklist, and items are counted by name across models: an item that wasn't on a draft's checklist counts neither for nor against it. From your last 200 analyzed drafts, in this order:
- **Score:** how much of its checklist your last 10 drafts cover on average, in percent (an item covered or not needed counts in full, a vague one half), and whether that went up or down from the 10 before.
- **Work on next:** the item most often missing or vague in your last 10 drafts, with a sentence the coach suggested for it in one of your own drafts.
- **Missing or vague:** each item with a bar and "x of y", and under it how often it was left out against vague, and your last 10 drafts against the 10 before.
- **What you do well:** up to three items present in most of your drafts.
- **What the coach changed most:** the rules behind its changes, for your session's model only, each counted once per draft.
- **Advice you took:** suggestions you added of those offered, and rewrites you applied.
- **Tokens:** what the analyses used, last and dim. Rewrite and live mode count; /improve doesn't.

It's all kept between sessions on this Mac, with no draft text, and no extra model calls. **Clear statistics** resets it.

**Settings tab** (`4`), laid out like the Desktop app's own settings: four sections (General, Your rules, Rules, Claude Week), each in a bordered box like the Analytics tab's Rules, with a bold title (on no background) and rows under it, each row's label and dim description on the left and its control on the right, with a thin line between rows in Desktop and the mobile app:
- **Mode** (a Manual / Live dropdown; buttons on mobile): Manual rewrites only when you press Rewrite. Live analyzes about 1.5 seconds after you stop typing, once per new draft of 15 characters or more, up to 30 times a session.
- **Rewrite model** and **Refresh model:** two of the settings below, as a dropdown (buttons on mobile). A change is saved to your settings, the same as `/config`, and Claude Code reloads the mod to apply it. If Claude Code refuses the change, the pane shows them read-only with the reason.
- **Your rules:** your own rules, one line each, sent with every analysis and `/improve` after the general and model rules; yours win when they conflict. Each rule has **Remove**, and **Add a rule** takes a new one (Enter adds it). They're kept in `rules.md` in the mod's data folder (the path is shown), next to your reader profile, so installing or updating the mod never touches them, and you can edit the file by hand too. The file is created with your first rule; until then there are none. The mobile app lists them and has Remove, but no Add field.
- **Rules:** the source pages the rules come from, always listed, then the refresh (see "Keeping the rules current" below).
- **Claude Week:** the **Week model** (a dropdown like the other models), the path to your **Reader profile** (in the mod's data folder; see below), and the **Sources** Write reads each week (`week/sources.json`), as links with their tier.

**News tab** (`3`): Claude Week.
- Drawn after Omar's Stitch design (v0.35.0): monospaced throughout, a header card (the SYS versions line, "> Claude Week NN · dates", the intro, the buttons), a Top 3 card with read stories struck through, a reading-status card with a bar and a chip per section, uppercase section titles, and a card per story with its tag, version badge, code-highlighted summary paragraphs, an Ask yourself box and REF links, ending in "[ END OF STREAM ]". It uses Desktop's theme colors; the design's dark backgrounds and typeface are Desktop's to choose.
- At the very top, a dim line with the Claude Code version this session runs (in Desktop, the one Desktop bundles) and the installed Claude Desktop version, for example "Claude Code 2.1.304 · Claude Desktop 3.1623.0". Desktop passes its own version; in a terminal session on a Mac it comes from the app's Info.plist, or reads "not found".
- **Write Claude Week NN** fetches the pages in `week/sources.json` (Anthropic's own pages, the Claude Desktop release notes, the Claude Code release notes on GitHub, the release trackers and the people you follow), cuts each to its text, and asks the Week model once to write the edition from them, following `week/edition-prompt.md`: up to 15 stories in sections, a Top 3, questions to think about, and a note on what it changed because of your feedback. It links only to pages it was given. There's no web search, so news Anthropic hasn't posted itself (deals, outages, policy) is left out. The tab shows its progress; it takes a few minutes, and you can keep working. A page that can't be read is named to the model, which says so where it leaves a section thin. The button shows only while this week has no edition. Once it has one, :rewrite Claude Week NN (on this week's edition only) reads today's pages again as soon as you press it, with no confirm, and adds only the stories the week doesn't have yet: a story counts as already there when it has the same title and the same link. Nothing is removed or changed, and your votes, reasons, takes and read marks stay. Older editions are never rewritten. If the answer can't be read, the tab says why and offers **Try again**.
- At the top: the title and dates, the intro, what changed from your feedback, the Top 3, and how much you've read ("3 of 15 stories read", then each section's count). **‹ Older** and **Newer ›** step through past editions. Once there are two or more, **Archive** lists every edition, newest first, with its dates, stories read and stories voted on; **Open** shows that week as it was written, with your votes, reasons, takes and read marks, all still editable. **Back** returns to the edition.
- A tip under Try this week names the story it comes from ("From the story … in …") and links that story's source. Tips in editions written before v0.34.0 get these the next time you press Rewrite on that week.
- Each story sits in its own box (the sections have none, just their title on a band) and has its summary and links, then **▲ Up** / **▼ Down** (the same again clears it, and opens a "Why upvote?" or "Why downvote?" field), **Your take** (your own view, with or without a vote), **Mark read** (folds it to its title; **Reopen** unfolds it), **More detail** and **Ask in side chat**: on every story, it puts `/btw` with the story's prompt (its title when the writer gave none) and the story itself (title, summary, detail, links) in the prompt box, each a paragraph with a blank line between; press Enter and Desktop's side chat answers it, beside the conversation and not in it. Like any `/btw`, it reads the conversation but runs no tools. Nothing is sent until you do. Questions have **Ask in side chat** too. If the prompt box can't take it (a dialog is open), it goes on the clipboard and a toast says so.
- A reason or take saves on Enter, or by itself a moment after you stop typing. Each save shows Saved or Not saved with the reason.
- Your reader profile is yours to edit by hand. It lives in the mod's data folder in your Claude config, `plugins/data/prompt-coach-prompt-coach/profile.yaml` (the exact path is under Settings → Claude Week), not in the mod's install, so installing or updating the mod never touches it. The first time the mod finds no profile there, it creates a blank one from `week/profile.example.yaml` and Settings says so; fill it in before your first Write. Uninstalling the plugin may remove its data folder, so keep a copy if you uninstall. Editions, votes, reasons, takes and read marks are kept on this Mac, separately for each Claude config. The writer reads the last four editions' feedback.
- The mobile app has no text fields: votes, Mark read and Ask in side chat work there, and saved reasons and takes show as text.

## Where its knowledge comes from

| What | Where |
| --- | --- |
| Prompting rules | `rules/general.md`, plus the session model's file (`opus-5-5.md`, `sonnet-5-5.md`, `haiku-5-5.md`, `fable-5-1.md`, which also covers Mythos 5.1) |
| Your own rules | `rules.md` in the mod's data folder, `plugins/data/prompt-coach-prompt-coach/` in your Claude config. Edited under Settings → Your rules or by hand. Loaded last, wins on conflict; neither refresh nor an update touches it. |
| Which model you're on | The live session |
| Checklist, rewrite and reasons | One call to the rewrite model (default `sonnet`), given your draft and the rules above. It can be wrong, so treat it as a second opinion. |
| Statistics | Saved locally by Claude Code for this plugin |

The rules are paraphrased from Anthropic's docs, and each file names its sources and an `As of` date. Settings lists the source pages under **Rules**.

A model with no rules file, such as an older or newer model, gets the general rules and a note in the pane. To support it, add its page to `sources.json`, add a rules file, add it to `MODEL_RULES` and `MODEL_FAMILIES` in `hooks/lib.ts`, and add a test.

## Keeping the rules current

`/coach refresh` fetches every page in `sources.json` and compares each with its fingerprint from your last refresh. A file is rewritten only when one of its source pages has changed. That's done by the refresh model (Opus by default), which re-paraphrases the file and changes only what the sources changed. The Settings tab shows a diff per file, under Rules. Nothing is written until you press **Accept**, and **Reject** discards the proposal. Either way, the pages count as reviewed and aren't proposed again until they change. A page that fails to load keeps its file as it is, and it is retried next time.

- **The first refresh** only records the fingerprints and proposes nothing.
- **No page changed:** the refresh makes no model calls and costs nothing beyond the downloads.
- **Rewrite all** (or `/coach refresh all`) rewrites every file from today's pages, for when you want a fresh pass anyway. That's one model call per file, 10 today.

## Install

Requires Claude Code 2.1.299 or later (`claude --version`). The pane's text styling needs that version.

```
claude plugin marketplace add ~/projects/claude-mods/prompt-coach
claude plugin install prompt-coach@prompt-coach
```

Then start a new session in the Desktop app's Code tab, or run `/reload-plugins`. Type `/coach`.

**An installed copy runs from Claude Code's plugin cache** (`~/.claude-personal/plugins/cache/prompt-coach/…`), not from this folder. Three things follow:
- Your edits to the rules here don't reach it until you raise `version` in `.claude-plugin/plugin.json` and run `claude plugin update prompt-coach@prompt-coach`. Your own rules and reader profile aren't part of the install, so they apply at once.
- A refresh you accept writes into the cached copy.
- Settings → Your rules shows the path of your own rules file.

The Desktop app loads only installed plugins. It ignores `--plugin-dir` and `CLAUDE_CODE_PLUGIN_DIRS`, so there it always runs the cached copy. To run straight from this folder, with edits picked up as you save, use a terminal session: `claude --plugin-dir ~/projects/claude-mods/prompt-coach`.

## Settings

- `rewriteModel` (default `sonnet`): the model for Rewrite, live mode and `/improve`. `haiku` is faster and cheaper, and `opus` is slower and more careful.
- `refreshModel` (default `opus`): the model that rewrites the rules on `/coach refresh`. Refresh is rare, and the job is to change only what the sources changed, which Opus does with fewer needless rewordings.

- `weekModel` (default `opus`): the model that writes each Claude Week edition. Writing an edition means reading and checking many pages.

Change them in the pane's Settings tab, in `/config`, or under `pluginConfigs` in your settings file.

## Cost and access

Each Rewrite, each live analysis, each `/improve` and each file a refresh rewrites is one model request on your own login, counted against your plan or billed to your API key. Like every mod, it runs with your permissions. It reads your prompt box only while the pane is open, sends Claude's last reply with each analysis or `/improve`, reads its own files, and writes only its own `rules/` and `tips/` files, and only when you accept a refresh. It reaches the network only during `/coach refresh`, for the pages in `sources.json`, and when you press Write on the Week tab, for the pages in `week/sources.json`. Writing an edition is one Week model request of about 30,000 tokens in and up to 16,000 out. These fetches and requests are the mod's own, not tool calls, so they need no permission prompt and auto mode doesn't review them.

## Develop

```
claude plugin validate .
claude plugin test .
```

`hooks/lib.ts`, `hooks/refresh.ts` and `hooks/week.ts` hold the pure logic, `hooks/ui.ts` the pane's drawing, and `hooks/register.ts` the hooks and every mods API call.
