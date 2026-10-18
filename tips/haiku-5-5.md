# Using Claude Haiku 5.5 well

Sources, paraphrased:
- Anthropic, "Prompting Claude Haiku 5.5": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5
- Claude Code, "Model configuration": https://code.claude.com/docs/en/model-config
As of: 2026-10-17

- Haiku is for simple, fast tasks. If it struggles twice on the same thing, switch with `/model sonnet` rather than re-explaining.
- "Answer directly" doesn't stop it thinking. For less thinking, lower `/effort`.
- For a longer task, say to keep going until everything is done and to stop only when blocked or before a risky step.
- Ask for a real check (tests, build, the changed command) before it reports success, and to name any check it skipped.
- When the answer depends on current facts or on where you are, ask it to search and give the country or region.
- If you want JSON, say it applies to the final answer only.
