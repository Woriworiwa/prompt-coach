# Extra rules for Claude Fable 5.1 and Claude Mythos 5.1

Source, paraphrased:
- Anthropic, "Prompting Claude Fable 5.1": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-1
As of: 2026-10

## Scope
- Make the scope explicit: the request (or an approved plan) is the scope, and other issues it notices should be reported as follow-ups, not fixed.
- When describing a problem or asking a question, say whether you want an assessment only or a fix. Without that, an assessment is the deliverable and no fix should be applied.
- For implementation, say not to fix nearby bugs or extend behavior unless required, and to note them in the summary.
- For small file changes, ask for targeted edits, not whole-file rewrites.
- Limit tests to what the task needs, roughly one focused test per stated behavior.

## Working style
- If it should work without checking in, say so: proceed on reversible steps, stop only for destructive actions or real scope changes, and finish the work rather than describe the next step.
- If you want progress updates, ask it to say what it is about to do before starting and to end with a recap of what it found, did, and what is next.
- Ask it to search for any name it does not recognize, or one from a fast-changing area, using the name exactly as written.

## Wording
- For a bug hunt, ask "Are there any bugs in this program?" rather than "Does this compile without errors?".
- For a lesser-known language or framework, include context or documentation.
- Ask for plain, direct prose if you want it; Fable 5.1 already formats lightly, so do not add blanket "no lists, no headers" rules.

## Remove
- Remove requests to write out its reasoning; ask for a short explanation or a summary of actions instead.
- Remove "hold all findings until the end".

## Quick instructions
- Assessment only: Assessment only; don't apply a fix. Source: "Scope" (say whether you want an assessment or a fix)
- Stay in scope: Keep to what I asked; report other issues as follow-ups instead of fixing them. Source: "Keep changes and tests to what the task asks for"
- Targeted edits: Make targeted edits, not whole-file rewrites. Source: "Scope" (small file changes)
- Work without checking in: Proceed on reversible steps, stop only for destructive actions or real scope changes, and finish the work rather than describe the next step. Source: "Finish the whole task"
- Recap: Say what you're about to do before starting, and end with what you found, did, and what's next. Source: "Working style" (progress updates)
- Plain prose: Answer in plain, direct prose. Source: "Wording"

## Checklist
- Goal: what outcome they want, said explicitly. Source: general guide, "Be clear and direct"
- Context: the files, errors, background and reasons the assistant can't see on its own. Source: general guide, "Be clear and direct" and "Add context to improve performance"
- Constraints: keep changes to what the task asks; anything else it notices is a follow-up to report, not a change to make. Source: "Keep changes and tests to what the task asks for"
- Output: what form the answer or result should take. Source: general guide, "Be clear and direct" and "Control the format of responses"
- Done means: how the result will be checked (tests pass, the numbers add up). Source: general guide, "Ask Claude to self-check"
- Stop rule: carry on with reversible steps the request covers; stop only for destructive actions or scope changes you must decide. Source: "Finish the whole task"
