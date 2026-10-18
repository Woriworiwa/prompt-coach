# Extra rules for Claude Haiku 5.5

Source, paraphrased: Anthropic, "Prompting Claude Haiku 5.5"
https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5
As of: 2026-10

## Scope
- For a longer task, say to keep working until everything requested is done, and to stop only to ask when blocked or before a risky step.
- Say to stop and report once the work is done and checked, without unrequested features, docs, or refactors.

## Coding
- Ask for a real check before it reports success (tests, type-checker, build, or the changed command). If no real check can run, ask it to say which one it skipped and why.

## Facts and search
- When the answer depends on current facts (prices, versions, rules, who holds a role, "latest" anything), say that it should search rather than trust its training data.
- When the answer depends on location, include the country or region.
- For JSON output, say the JSON format applies only to the final answer.

## Remove
- Remove "answer directly" if it is meant to stop thinking; it does not.

## Checklist
- Add Stop rule: keep working until it's done; stop to ask only when it can't go on without you or before a risky step. Source: "Prevent early stopping in long agent prompts"
- Change Done means: a real check that exercises the change (tests, type-checker, build), not just "done". Source: "Tell coding agents to verify their changes"
