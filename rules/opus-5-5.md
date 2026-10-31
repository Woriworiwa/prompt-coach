# Extra rules for Claude Opus 5.5

Sources, paraphrased:
- Anthropic, "Prompting Claude Opus 5.5": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
- claude.dev, "Getting the most out of Opus 5.5" (Sep 22, 2026): https://claude.dev/blog/getting-the-most-out-of-opus-5-5/
- Anthropic, "Prompting best practices": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
As of: 2026-10-21

## Task framing
- Put the whole task in a single message and name the finish line ("done means the tests pass and the old client is deleted"). Opus 5.5 handles long, multi-part work well and uses the finish line to tell when it is finished.
- Say when it should stop and ask (for example, only when a test fails for a reason it can't explain, or before anything destructive) and when it should carry on without checking in. Status notes can go in the same message as its next step.
- For a large audit, migration or review, suggest giving the parts to separate subagents and checking each one's evidence before accepting its result.
- For a long run, suggest keeping the task list in a file (for example TASKS.md) and ticking items off as they are done.

## Remove
- Remove "think carefully", "think step by step", "think hard" and similar lines. Opus 5.5 always thinks before it replies and decides how much to think, so these lines only slow the reply down.
- Remove requests to show or write out its reasoning in the reply, because these can be declined. Ask instead for a short explanation ("explain why you chose this in three sentences") or a summary of what it did.

## Add when relevant
- For a quick, simple question, add "Answer directly."
- For design work (a page, app or artifact), name the specific styles to leave out (for example cream or off-white backgrounds, italic accent words in headings, numbered "01 / 02 / 03" section labels, monospace labels, pill-shaped buttons). Then check what it picked instead and add that to the list if needed. "Avoid a generic look" mostly swaps one default for another.
- For research or analysis, ask it to mark anything it could not confirm and to say where it looked.
- When pasting text from elsewhere (an email, a web page, a log), wrap it in opening and closing tags such as <pasted_content>, both carrying the same short random id. This marks it as material to work on, not as instructions to follow.
- For charts, diagrams or screenshots, attach the image itself instead of retyping the numbers, and ask a specific question about it.
- For code review, ask only for the problems that would block a merge. Each should give the file and line, why it is wrong, and how to show it fails.

## Quick instructions
- Answer directly: Answer directly. Source: "Add when relevant" (for a quick, simple question)
- Keep going: Keep going without checking in; stop and ask only before anything destructive or if a test fails for a reason you can't explain. Source: claude.dev blog, "say when you want it to stop and ask"
- Short why: Explain why you chose this in three sentences. Source: "Remove" (ask for a short explanation instead of written-out reasoning)
- Mark unconfirmed: Mark anything you couldn't confirm, and say where you looked. Source: "Add when relevant" (research or analysis)
- Blocking issues only: Report only problems that would block a merge, each with file and line, why it is wrong, and how to show it fails. Source: "Add when relevant" (code review)
- Use subagents: Split this across subagents and check each one's evidence before accepting it. Source: "Task framing" (large audit, migration, or review)

## Checklist
- Goal: what the task is, given in full in one message instead of one step at a time. Source: general guide, "Be clear and direct"; claude.dev blog, "Say what “done” looks like, then let it run"
- Context: the files, errors, background and reasons the assistant can't see on its own. Source: general guide, "Be clear and direct" and "Add context to improve performance"
- Constraints: limits, scope, or things to leave alone. Source: general guide, "Be clear and direct" (be specific about the output format and constraints you want)
- Output: what form the answer or result should take. Source: general guide, "Be clear and direct" and "Control the format of responses"
- Done means: the finish line it should reach before it counts as finished (for example, every endpoint uses the new client and the tests pass). Source: claude.dev blog, "Say what “done” looks like, then let it run"
- Stop rule: when to stop and ask (only when it can't go on without you, or before anything destructive), and that it should otherwise keep going. Source: claude.dev blog, "Tell it which stops you want"
