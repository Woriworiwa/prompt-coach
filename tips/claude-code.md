# Using Claude Code well (any model)

Sources, paraphrased:
- Claude Code, "Best practices": https://code.claude.com/docs/en/best-practices
- Claude Code, "Choose a permission mode": https://code.claude.com/docs/en/permission-modes
- Claude Code, "Common workflows": https://code.claude.com/docs/en/common-workflows
- Claude Code, "Create custom subagents": https://code.claude.com/docs/en/sub-agents
- Claude Code, "How Claude remembers your project": https://code.claude.com/docs/en/memory
- Claude Code, "Explore the context window": https://code.claude.com/docs/en/context-window
As of: 2026-10-17

- Give it a check it can run (tests, a build, a screenshot to compare) and ask it to iterate until the check passes.
- Unsure of the approach or touching several files? Start in plan mode (Shift+Tab, or the mode selector in Desktop). If you can describe the diff in one sentence, skip the plan.
- Point at things instead of describing them: `@file`, a pasted screenshot, the exact error text.
- Run `/clear` between unrelated tasks. After two failed corrections, `/clear` and write a better first prompt.
- `/compact Focus on …` keeps what matters; `/btw` asks a side question that never enters the context.
- "Use subagents to investigate X" keeps a big search out of your main context.
- `Esc` stops it mid-step; `Esc Esc` or `/rewind` goes back to an earlier checkpoint.
- For a bigger feature, ask it to interview you and write `SPEC.md`, then build it in a fresh session.
- Keep `CLAUDE.md` short: only what it would get wrong without it. `/init` writes a starter.
- Before calling it done, run `/code-review`, or have a subagent check the diff against the plan.
