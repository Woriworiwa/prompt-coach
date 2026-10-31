# Extra rules for Claude Opus 5.5

Sources, paraphrased:
- Anthropic, "Prompting Claude Opus 5.5": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
- claude.dev, "Getting the most out of Opus 5.5" (Sep 22, 2026): https://claude.dev/blog/getting-the-most-out-of-opus-5-5/
As of: 2026-10

## Task framing
- Give the whole task in one message and name the finish line ("done means the tests pass and the old client is deleted"). Opus 5.5 keeps going on long, multi-part work and uses the finish line to know when to stop.
- Say when it should stop and ask (for example only if a test fails for an unexplained reason, or before anything destructive), and when it should keep going without checking in.
- For a large audit, migration, or review, suggest splitting the work across subagents and checking each one's evidence before accepting it.
- For a long run, suggest keeping the task list in a file (for example TASKS.md) and ticking items off.

## Remove
- Remove "think carefully", "think step by step", "think hard" and similar lines. Opus 5.5 always thinks before replying and decides how much; these lines only delay the reply.
- Remove requests to show or write out its reasoning in the reply. These can be declined. Ask instead for a short explanation ("explain why you chose this in three sentences") or a summary of what it did.

## Add when relevant
- For a quick, simple question, add "Answer directly."
- For design work (a page, app, or artifact), list the specific styles to leave out (for example cream backgrounds, italic accent words, numbered "01 / 02" labels, pill buttons). "Avoid a generic look" mostly swaps one default for another.
- For research or analysis, ask it to mark anything it could not confirm and to say where it looked.
- When pasting text from elsewhere (an email, a web page, a log), wrap it in a tag such as <pasted_content> so it is treated as material, not as instructions.
- For code review, ask for only the problems that would block a merge, each with file and line, why it is wrong, and how to show it fails.

## Quick instructions
- Answer directly: Answer directly. Source: "Add when relevant" (for a quick, simple question)
- Keep going: Keep going without checking in; stop and ask only before anything destructive or if a test fails for a reason you can't explain. Source: claude.dev blog, "say when you want it to stop and ask"
- Short why: Explain why you chose this in three sentences. Source: "Remove" (ask for a short explanation instead of written-out reasoning)
- Mark unconfirmed: Mark anything you couldn't confirm, and say where you looked. Source: "Add when relevant" (research or analysis)
- Blocking issues only: Report only problems that would block a merge, each with file and line, why it is wrong, and how to show it fails. Source: "Add when relevant" (code review)
- Use subagents: Split this across subagents and check each one's evidence before accepting it. Source: "Task framing" (large audit, migration, or review)

## Checklist
- Goal: the whole task in one message, not one step at a time. Source: claude.dev blog, "give the whole task in one message"
- Context: the files, errors, background and reasons the assistant can't see on its own. Source: general guide, "Be clear and direct" and "Add context to improve performance"
- Constraints: limits, scope, or things to leave alone. Source: general guide, "Be clear and direct" (be specific about the desired output format and constraints)
- Output: what form the answer or result should take. Source: general guide, "Be clear and direct" and "Control the format of responses"
- Done means: the finish line, so it knows when it's done (every endpoint uses the new client and the tests pass). Source: claude.dev blog, "name the finish line"
- Stop rule: when to stop and ask (only if a test fails for an unexplained reason, or before anything destructive), and otherwise to keep going. Source: claude.dev blog, "say when you want it to stop and ask"
