# Using Claude Sonnet 5.5 well

Sources, paraphrased:
- Anthropic, "Prompting Claude Sonnet 5.5": https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5
- Claude Code, "Model configuration": https://code.claude.com/docs/en/model-config
As of: 2026-10-17

- Sonnet is the everyday coding model. Switch with `/model opus` for complex reasoning, or `/model opusplan` to plan with Opus and build with Sonnet.
- Effort defaults to medium. Raise it with `/effort high` for bug fixes in existing code, where checking matters.
- Say whether it should run to the end ("keep going until it's done, stop only if blocked") or give you options first ("plan it and wait for my go-ahead").
- Ask for a real check before "done": the tests, the type-checker, the build. Ask it to say which check it couldn't run.
- Say "nothing beyond what I asked" when you don't want extra features, files or refactors; it can list ideas at the end.
- For anything that may have changed (versions, prices, rules), ask it to search instead of answering from memory.
- Don't tell it to minimize tool calls or to think less; neither helps.
- `/fast` isn't available on Sonnet; it switches you to Opus.
