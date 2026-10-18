# prompt-coach

A Claude Code mod that helps you write better prompts, learn why they're better, and use your session's model the way it was designed to be used.

It has two parts, plus a weekly digest:

- **`/coach`** opens a side pane that reads the draft in your prompt box before you send it. It shows a checklist, a rewrite, the reason for each change, and, on a Tips tab, tips for the model you're on. Statistics under Settings track what your drafts most often miss.
- **`/improve <draft>`** is the quick path. It rewrites the draft straight into the prompt box, with a dim transcript line saying what changed.
- **Claude Week**, on the pane's Week tab: a weekly digest about Claude, Claude Code, Claude Desktop, usage limits and Anthropic. Vote on stories and add your own take; the next edition reads them first.

Inside a conversation, both read your draft as a reply to Claude's last message, so "go with option 2" or "yes, do that" is judged against what Claude just said. The pane says when it did that. A very long reply is cut to its start and end (6,000 characters in all).

`/improve` never sends anything: the rewrite only goes into the prompt box, and you edit it and press Enter yourself. In the pane, **Apply and send** puts the rewrite in the box and sends it straight away.

## The coach pane

```
/coach            open or close the pane
/coach live       open it in live mode
/coach manual     open it in manual mode
/coach refresh    check the source pages for changes and propose updated rules and tips
/coach refresh all  rewrite every rules and tips file from today's pages
```

The pane has four tabs, Coach (`1`), Tips (`2`), Settings (`3`) and Week (`4`). In the terminal the open tab shows in clay brackets. In the Desktop app it shows as clay text, and the other tabs are dim buttons.

**Coach tab**

- **Your draft:** what's in the prompt box now.
- **Analyze** (`a`): one model call. It checks the draft against six items: Goal, Context, Constraints, Done means (the finish line), Stop rule (when to stop and ask), and Output. It marks each as ✓ present, ~ vague, ✗ missing or – not needed. It also flags habits that don't help, such as "think step by step" or asking to see its reasoning.
- **Rewrite:** your draft rewritten with the same intent. It adds no new requirements, and anything it would add is a suggestion instead. Where a detail is missing, it leaves a placeholder such as `[which file?]` instead of guessing.
- **Fill in the gaps:** for each `[placeholder]` in the rewrite, a question, a dropdown of likely answers (taken only from your draft and Claude's last reply) and a text field. A typed answer wins over a pick. Enter updates the rewrite; Apply and Apply and send use your answers either way. Unanswered placeholders stay in brackets. Press Enter in an empty field (nothing picked) to drop that gap and the whole sentence around it; type or pick an answer to bring it back. Hover over the ⓘ next to the heading for a reminder of these rules. The mobile app has no fields, so it lists the placeholders instead.
- **Checklist / Why each change:** two tabs below the buttons. The Checklist tab shows each item and, right under one that's missing or vague, the suggestion that fills it: the exact sentence, with **Add** (puts it at the end of the rewrite) and **Remove**. Suggestions that fill no item come last, under Other suggestions. Nothing is added unless you click. Why each change gives the rule behind each edit, so you learn the pattern.
- **Apply**: puts the rewrite in the prompt box without sending it.
- **Apply and send** (`p`): puts the rewrite in the prompt box and sends it. To copy the rewrite, use the copy icon Desktop draws in the rewrite box's corner.
- **Live 3/30:** a dim reminder under the tabs while live mode is on, with the count used this session. Switch modes under Settings.

**Tips tab** (`2`): **Using \<model\> well**, in three groups: tips for the draft you analyzed, tips for the model your session runs, and general Claude Code tips. They switch when you change model with `/model`.

**Settings tab** (`3`), in four bordered groups (General, Statistics, Refresh rules and tips, Sources), each setting's control on the right of its label:
- **Manual / Live** (`l`): Manual analyzes only when you press Analyze. Live analyzes about 1.5 seconds after you stop typing, once per new draft of 15 characters or more, up to 30 times a session.
- **Rewrite model**, **Refresh model** and **Week model:** the three settings below, as a dropdown (buttons on mobile). A change is saved to your settings, the same as `/config`, and Claude Code reloads the mod to apply it. If Claude Code refuses the change, the pane shows them read-only with the reason.
- **Statistics:** how many drafts you've analyzed, the checklist items you most often miss, and the rules applied most. It's kept between sessions on this Mac. **Clear statistics** resets it.
- **Refresh rules and tips:** see "Keeping the rules current" below.
- **Show sources:** the pages the rules and tips come from.

**Week tab** (`4`): Claude Week.
- **Write Claude Week NN** fetches the pages in `week/sources.json` (Anthropic's own pages, the Claude Code release notes on GitHub, the release trackers and the people you follow), cuts each to its text, and asks the Week model once to write the edition from them, following `week/edition-prompt.md`: up to 15 stories in sections, a Top 3, questions to think about, and a note on what it changed because of your feedback. It links only to pages it was given. There's no web search, so news Anthropic hasn't posted itself (deals, outages, policy) is left out. The tab shows its progress; it takes a few minutes, and you can keep working. A page that can't be read is named to the model, which says so where it leaves a section thin. The button shows only while this week has no edition, since editions are never overwritten. If the answer can't be read, the tab says why and offers **Try again**.
- At the top: the title and dates, the intro, what changed from your feedback, the Top 3, and how much you've read ("3 of 15 stories read", then each section's count). **‹ Older** and **Newer ›** step through past editions.
- Each story has its summary and links, then **▲ Up** / **▼ Down** (the same again clears it, and opens a "Why upvote?" or "Why downvote?" field), **Your take** (your own view, with or without a vote), **Mark read** (folds it to its title; **Reopen** unfolds it), **More detail** and **Ask in side chat**: it puts `/btw` with the story's prompt and the story itself (title, summary, detail, links) in the prompt box; press Enter and Desktop's side chat answers it, beside the conversation and not in it. Like any `/btw`, it reads the conversation but runs no tools. Nothing is sent until you press Enter. Questions have **Ask in side chat** too. If the prompt box can't take it (a dialog is open), it goes on the clipboard and a toast says so.
- A reason or take saves on Enter, or by itself a moment after you stop typing. Each save shows Saved or Not saved with the reason.
- Your reader profile is `week/profile.yaml`; edit it by hand. Editions, votes, reasons, takes and read marks are kept on this Mac, separately for each Claude config. The writer reads the last four editions' feedback.
- The mobile app has no text fields: votes, Mark read and Ask in side chat work there, and saved reasons and takes show as text.

## Where its knowledge comes from

| What | Where |
| --- | --- |
| Prompting rules | `rules/general.md`, plus the session model's file (`opus-5-5.md`, `sonnet-5-5.md`, `haiku-5-5.md`, `fable-5-1.md`, which also covers Mythos 5.1) |
| Your own rules | `rules/omar.md`. It is loaded last and wins on conflict. Refresh never touches it. |
| Model tips | `tips/<model>.md` and `tips/claude-code.md` |
| Which model you're on | The live session |
| Checklist, rewrite and reasons | One call to the rewrite model (default `sonnet`), given your draft and the rules above. It can be wrong, so treat it as a second opinion. |
| Statistics | Saved locally by Claude Code for this plugin |

The rules and tips are paraphrased from Anthropic's docs, and each file names its sources and an `As of` date. The pane's footer shows the date, and Settings lists the source pages under **Show sources**.

A model with no rules file, such as an older or newer model, gets the general rules and a note in the pane. To support it, add its page to `sources.json`, add rule and tip files, add a branch in `rulesFor` in `hooks/lib.ts`, and add a test.

## Keeping the rules current

`/coach refresh` fetches every page in `sources.json` and compares each with its fingerprint from your last refresh. A file is rewritten only when one of its source pages has changed. That's done by the refresh model (Opus by default), which re-paraphrases the file and changes only what the sources changed. The Settings tab shows a diff per file, under Refresh rules and tips. Nothing is written until you press **Accept**, and **Reject** discards the proposal. Either way, the pages count as reviewed and aren't proposed again until they change. A page that fails to load keeps its file as it is, and it is retried next time.

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
- Your edits to `rules/omar.md` here don't reach it until you raise `version` in `.claude-plugin/plugin.json` and run `claude plugin update prompt-coach@prompt-coach`.
- A refresh you accept writes into the cached copy.
- The pane's footer shows the path of the `omar.md` it is actually reading.

The Desktop app loads only installed plugins. It ignores `--plugin-dir` and `CLAUDE_CODE_PLUGIN_DIRS`, so there it always runs the cached copy. To run straight from this folder, with edits picked up as you save, use a terminal session: `claude --plugin-dir ~/projects/claude-mods/prompt-coach`.

## Settings

- `rewriteModel` (default `sonnet`): the model for Analyze, live mode and `/improve`. `haiku` is faster and cheaper, and `opus` is slower and more careful.
- `refreshModel` (default `opus`): the model that rewrites rules and tips on `/coach refresh`. Refresh is rare, and the job is to change only what the sources changed, which Opus does with fewer needless rewordings.

- `weekModel` (default `opus`): the model that writes each Claude Week edition. Writing an edition means reading and checking many pages.

Change them in the pane's Settings tab, in `/config`, or under `pluginConfigs` in your settings file.

## Cost and access

Each Analyze, each live analysis, each `/improve` and each file a refresh rewrites is one model request on your own login, counted against your plan or billed to your API key. Like every mod, it runs with your permissions. It reads your prompt box only while the pane is open, sends Claude's last reply with each analysis or `/improve`, reads its own files, and writes only its own `rules/` and `tips/` files, and only when you accept a refresh. It reaches the network only during `/coach refresh`, for the pages in `sources.json`, and when you press Write on the Week tab, for the pages in `week/sources.json`. Writing an edition is one Week model request of about 30,000 tokens in and up to 16,000 out. These fetches and requests are the mod's own, not tool calls, so they need no permission prompt and auto mode doesn't review them.

## Develop

```
claude plugin validate .
claude plugin test .
```

`hooks/lib.ts`, `hooks/refresh.ts` and `hooks/week.ts` hold the pure logic, `hooks/ui.ts` the pane's drawing, and `hooks/register.ts` the hooks and every mods API call.
