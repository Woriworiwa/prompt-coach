# Extra rules for Claude Sonnet 5.5

Source, paraphrased: Anthropic, "Prompting Claude Sonnet 5.5"
https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5
As of: 2026-10

## Scope
- For work that should run to completion, say to keep going until the requested work is done, and to stop only when blocked or before a risky step.
- Say to stop once the work is done and checked, without adding features, tests, files, docs, or refactors nobody asked for; extras can be mentioned at the end.
- For an open-ended request where ideas come first, say so: "give me options or a plan and wait for my go-ahead before building".

## Coding
- Ask for a real check before calling code done: run the tests, the type-checker, the build, or the changed command. A syntax-only check does not count.
- Ask it to say which check it could not run and why, instead of reporting the change as done.

## Research and facts
- For anything that may have changed (prices, rules, versions, what is allowed), ask it to search for current sources rather than answer from memory.

## Remove
- Remove "only use tools when strictly necessary" or "minimize tool calls".
- Remove requests to include its reasoning in the reply; ask for a short explanation or a summary of actions instead.
- Remove "think less" or "don't think" lines; they do not reliably work.
