# General prompting rules (all current Claude models)

Source: Anthropic, "Prompting best practices"
https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
Paraphrased. Recheck when Anthropic updates the guide.
As of: 2026-10

## Clarity
- Be explicit about what you want. Claude works like a capable new colleague with no context on your norms: anything you leave implicit, it has to guess.
- Test: would a colleague with no background on the task understand the prompt and be able to act on it? If not, add what they would be missing.
- If you want more than the basics, ask for it. Claude does not assume "above and beyond" from a vague request.
- Use action verbs when you want action. "Change this function to..." gets edits; "Can you suggest changes..." gets suggestions only.
- When order or completeness matters, give the steps as a numbered list.

## Context
- Say why a constraint matters. "This is read aloud by a text-to-speech engine, so avoid ellipses" works better than "never use ellipses", because Claude generalizes from the reason.
- Name the relevant files, data, audience, or constraints that the model cannot see on its own.

## Output
- Say what you want, not what to avoid: "write flowing paragraphs" beats "don't use markdown".
- Name the format, length, and structure of the result when they matter.
- Match the prompt's own style to the style you want back (a prompt full of markdown invites markdown).

## Structure
- When a prompt mixes instructions, context, examples, and pasted input, separate them, for example with XML tags such as <instructions>, <context>, <input>.
- Put long pasted material first and the question or instruction after it.
- Examples steer format and tone reliably. If an example would help, mark it clearly (for example in <example> tags) and keep it close to the real case.

## Verification
- For tasks where correctness matters, say how to check the result (the tests pass, the command runs, the numbers add up).

## Quick instructions
- Make the change: Make the change rather than suggesting one. Source: "Be clear and direct" (action verbs get edits; "can you suggest" gets suggestions)
- Check it: Before you finish, check the result works (run the tests or the command) and say how you checked it. Source: "Ask Claude to self-check"
- Say why: If you leave something out or make a trade-off, say why in one line. Source: "Add context to improve performance" (Claude generalizes from the reason)
- Plain prose: Answer in short, plain paragraphs. Source: "Control the format of responses" (say what you want, not what to avoid)

## Checklist
- Goal: what outcome they want, said explicitly. Source: "Be clear and direct" (be explicit; Claude won't infer "above and beyond" from a vague request)
- Context: the files, errors, background and reasons the assistant can't see on its own. Source: "Be clear and direct" (a brilliant new employee with no context on your norms) and "Add context to improve performance"
- Constraints: limits, scope, or things to leave alone. Source: "Be clear and direct" (be specific about the desired output format and constraints)
- Output: what form the answer or result should take. Source: "Be clear and direct" (same line) and "Control the format of responses"
- Done means: how the result will be checked (tests pass, the numbers add up). Source: "Ask Claude to self-check" (verify the answer against test criteria before finishing)
