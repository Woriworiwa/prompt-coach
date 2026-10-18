# Using Claude Opus 5.5 well

Sources, paraphrased:
- claude.dev, "Getting the most out of Opus 5.5": https://claude.dev/blog/getting-the-most-out-of-opus-5-5/
- Anthropic, "Prompting Claude Opus 5.5": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
- Claude Code, "Model configuration" and "Fast mode": https://code.claude.com/docs/en/model-config, https://code.claude.com/docs/en/fast-mode
As of: 2026-10-17

- Hand over the whole task in one message with a finish line ("done means the tests pass"), then let it run.
- Say when to stop and ask (an unexplained failure, anything destructive); otherwise it keeps going.
- Want more or less thinking? Change `/effort` (default is medium; high for bug fixes, max for the hardest problems). Don't write "think hard" in the prompt.
- One-off deep reasoning without changing the setting: put `ultrathink` in the prompt.
- `/fast` gives the same model faster, at a higher price per token. Use it for back-and-forth work you read reply by reply, and turn it on at the start of a session, where it costs least.
- Simple question? Add "Answer directly."
- Long run? Ask it to keep the task list in `TASKS.md`; the file survives context summaries, the scrollback doesn't.
- Audits, migrations and big reviews: ask for one subagent per unit, then check each one's evidence.
- Before you review a diff, have it review its own: only merge-blocking problems, each with file, line, why, and how to show it fails.
- Type a follow-up while it runs instead of stopping and restarting.
