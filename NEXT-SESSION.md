# Next session: handoff and paste-in prompt

Two parts: the handoff (what happened, where things stand, what's open) and a prompt to paste into the new session. HANDOVER.md is still the full brief; this file covers only the session of 2026-10-18 and points to it.

---

## Part 1: Handoff

### Current state

- **Version:** prompt-coach **v0.8.8**.
- **Installed** in both configs: personal (`CLAUDE_CONFIG_DIR=~/.claude-personal`) and business (`~/.claude`).
- **Pushed** to the private personal repo https://github.com/Woriworiwa/prompt-coach, branch `main`, clean and up to date.
  - The repo's own git config holds the personal identity (Omar Dalgamuni, omar@dalgamuni.me) and a credential helper that takes the `Woriworiwa` token from `gh`. Keep it separate from the work account (`omar-smartarena`, which is the global git identity and gh's active account).
- **Checks:** 93 tests pass, and `tsc` and `claude plugin validate . --strict` pass, on both the terminal's Claude Code 2.1.302 and Desktop's bundled 2.1.299.
- **Not checked in Desktop:** almost everything from v0.8.1 to v0.8.8.

### What was done this session

1. **Claude Week, a new Week tab (4).** It turns Omar's digest spec into a weekly edition he votes on and writes takes on; that feedback steers the next edition.
   - **v0.8.0** wrote editions with a background subagent. Auto mode's classifier refused the mod's Agent call, and a `tool.check` hook allowing it was blocked as an auto-mode bypass.
   - **v0.8.1** writes them without a subagent: the mod fetches `week/sources.json`'s pages and makes one `model.complete` call. There's no web search, so Tier 4 news is left out; `week/edition-prompt.md` says so.
   - **v0.8.2** made the story and question prompt button run `/btw` via `$.command.run`. That failed in Desktop: Desktop draws `/btw` itself, so the engine doesn't list it.
   - **v0.8.3** has the button put `/btw <question>` in the prompt box instead, so Enter opens Desktop's real side chat.
2. **Git.** The mod was put in git and pushed to a new private repo on the personal account.
3. **Settings tab, reworked step by step:**
   - **v0.8.4** moved the group titles above their boxes and dropped the hard-to-read gray band.
   - **v0.8.5** laid Settings out like Desktop's own settings page (from Omar's screenshots): bold section titles with no box; plain labels with dim descriptions; controls on the right; a 1-pixel Svg hairline between rows. Mode became a Manual/Live Select, and the `l` hotkey is gone.
   - **v0.8.6** added more space between sections (`gap: 'xl'`).
   - **v0.8.7** merged "Refresh rules and tips" and "Sources" into one section, **Rules and tips**: sources always listed first, then the refresh; the Show sources button is gone.
   - **v0.8.8** turned Statistics into two tables built from Boxes: Most often missing (Checklist item | Missing or vague in) and Rules applied most (Rule | Times).

### Still open

Omar has to click through these in a **new** Desktop session. A session already open keeps running the mod version it started with.

- **Svg hairlines, never seen in Desktop.** They are 1-pixel Svg lines between Settings rows, translucent gray `rgb(128,128,128)` at 0.3. The props pass the engine's own Svg check (`fco` in 2.1.299). Unconfirmed: that they stretch to the pane's width, stay 1 pixel high, and are visible in light and dark.
  - **The Statistics table lines (v0.8.8) are the same Svg hairlines as the settings rows, and Omar hasn't seen them in Desktop yet.**
- **Settings layout:**
  - It reads like Desktop's settings page.
  - The Mode dropdown switches Manual/Live.
  - The space between sections is enough.
  - Rules and tips shows the sources, then the refresh.
  - The Statistics tables read well.
- **Week tab:**
  - Write shows its progress, and an edition arrives within a few minutes, with links that open.
  - How good the stories are from index pages alone.
  - Votes, reasons and takes survive closing and reopening the pane.
  - Mark read updates the counts.
- **Ask in side chat:** it puts `/btw …` in the prompt box, and Enter opens Desktop's side chat rather than sending a normal message.
- **Week section titles** still use the old gray band (`group` in `ui.ts`). Omar kept that change to Settings only; matching them is a small follow-up if he wants it.
- **Older unchecked items** are listed in HANDOVER.md under "Left to do": Apply and send, model changes, gap fields, the ⓘ hover, Analyze on a short reply, and a real `/coach refresh`.

### Where to look

- `HANDOVER.md`: the full brief. Covers how every change ships, the rules learned the hard way, decisions, the Claude Week design, and Left to do.
- `TASKS.md`: one line per version.
- `README.md`: the user-facing description.
- `hooks/ui.ts`: `settingsTab`, `settingsGroup`, `hairline`, `statTable`, `weekTab`.
- `hooks/register.ts`: hooks and `$` calls (`writeEdition`, `askAside`).
- `hooks/week.ts`: Claude Week's pure logic.

---

## Part 2: Prompt to paste into the new session

```
I'm continuing work on prompt-coach, my Claude Code mod in ~/projects/claude-mods/prompt-coach. It's at v0.8.8, installed in both configs and pushed to my private personal repo (Woriworiwa/prompt-coach, branch main).

Read prompt-coach/NEXT-SESSION.md first (the handoff from my last session), then prompt-coach/HANDOVER.md (the full brief: code layout, how every change ships, rules and decisions). Then skim hooks/ui.ts and hooks/register.ts.

Reply in a few lines: the current version, what's still open, and which Desktop checks are waiting on me, including the Svg hairlines in Settings and in the Statistics tables, which I haven't seen in Desktop yet. Don't change any code until I ask for a specific change. When I do, follow "How every change ships" in HANDOVER.md: tests, checks on both binaries, version bump, README/HANDOVER/TASKS notes, install in both configs, then commit and push with the repo's local personal identity, never my work account.
```
