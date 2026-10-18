# Using Claude Fable 5.1 (and Mythos 5.1) well

Sources, paraphrased:
- Anthropic, "Prompting Claude Fable 5.1": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1
- Claude Code, "Model configuration": https://code.claude.com/docs/en/model-config
As of: 2026-10-17

- Fable is for the hardest, longest work: root-cause hunts, outage debugging, architecture decisions. Describe the outcome you want, not the steps.
- On some plans Fable bills to usage credits. Use `/model sonnet` for everyday edits.
- Say whether you want an assessment or a fix. Without that, it assesses and doesn't change code.
- Make the scope explicit: the request is the scope, and other issues it notices go in the summary as follow-ups.
- If it should work without checking in, say so: go ahead on reversible steps, stop only for destructive ones.
- Ask for a one-line plan before it starts and a recap of what it found, did and what's next.
- For names it may not know, or fast-moving libraries, ask it to search using the exact name.
- Ask for small targeted edits, not whole-file rewrites, and about one focused test per stated behavior.
