import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { REPLY_MAX_CHARS, capReply, lastReply, parseReply, rulesFor } from './lib.ts'

describe('rulesFor', () => {
  test('maps current model ids and aliases to their rule files', () => {
    expect(rulesFor('claude-opus-5-5')?.file).toBe('opus-5-5.md')
    expect(rulesFor('claude-opus-5-5[1m]')?.file).toBe('opus-5-5.md')
    expect(rulesFor('opus')?.file).toBe('opus-5-5.md')
    expect(rulesFor('claude-sonnet-5-5')?.file).toBe('sonnet-5-5.md')
    expect(rulesFor('claude-haiku-5-5')?.file).toBe('haiku-5-5.md')
    expect(rulesFor('claude-fable-5-1')?.file).toBe('fable-5-1.md')
    expect(rulesFor('claude-mythos-5-1')?.file).toBe('fable-5-1.md')
  })

  test('a newer version borrows the newest older file of its family, labelled as itself', () => {
    expect(rulesFor('claude-opus-6')).toEqual({ file: 'opus-5-5.md', label: 'Opus 5.5', model: 'Opus 6', isBorrowed: true })
    expect(rulesFor('claude-opus-5-6')).toMatchObject({ file: 'opus-5-5.md', model: 'Opus 5.6', isBorrowed: true })
    expect(rulesFor('claude-sonnet-6-1-20270301')).toMatchObject({ file: 'sonnet-5-5.md', model: 'Sonnet 6.1', isBorrowed: true })
    expect(rulesFor('claude-mythos-5-2')).toMatchObject({ file: 'fable-5-1.md', model: 'Mythos 5.2', isBorrowed: true })
    expect(rulesFor('claude-opus-5-5')).toEqual({ file: 'opus-5-5.md', label: 'Opus 5.5', model: 'Opus 5.5', isBorrowed: false })
    expect(rulesFor('opus')).toMatchObject({ file: 'opus-5-5.md', isBorrowed: false })
  })

  test('falls back to the general rules for other models', () => {
    expect(rulesFor('claude-opus-5')).toBeUndefined()
    expect(rulesFor('claude-sonnet-4-6')).toBeUndefined()
    expect(rulesFor('claude-opus-5-55')).toBeUndefined()
  })
})

describe('parseReply', () => {
  test('splits the rewrite from its notes', () => {
    const r = parseReply('<rewrite>\nFix the login bug.\n</rewrite>\n<notes>\n- Named the bug\n- Cut filler\n</notes>')
    expect(r).toEqual({ rewrite: 'Fix the login bug.', notes: ['Named the bug', 'Cut filler'] })
  })

  test('rejects a reply with no rewrite', () => {
    expect(parseReply('Sure! Here is a better prompt.')).toBeUndefined()
  })
})

describe('lastReply', () => {
  const u = (text: string) => ({ role: 'user' as const, text })
  const a = (text: string) => ({ role: 'assistant' as const, text })
  const tool = { role: 'user' as const, text: '', toolResults: [{}] }

  test('joins the last turn, tools and all, and stops at the prompt before it', () => {
    const rows = [u('first'), a('old answer'), u('fix the cache'), a('Looking.'), tool, a(''), a('Two options:\n1. A\n2. B')]
    expect(lastReply(rows)).toEqual({ text: 'Looking.\n\nTwo options:\n1. A\n2. B', isCut: false })
  })

  test('passes over a prompt with no reply, reads up to `end`, and is empty in a fresh session', () => {
    const rows = [u('fix the cache'), a('Option 1 or 2?'), u('/improve do 2')]
    expect(lastReply(rows).text).toBe('Option 1 or 2?')
    expect(lastReply([u('a'), a('first answer'), u('b'), a('second answer')], 2).text).toBe('first answer')
    expect(lastReply([]).text).toBe('')
    expect(lastReply([u('hello')]).text).toBe('')
  })

  test('capReply keeps the start and the end of a long reply', () => {
    const long = `START ${'x'.repeat(20_000)} END`
    const r = capReply(long)
    expect(r.isCut).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(REPLY_MAX_CHARS)
    expect(r.text.startsWith('START')).toBe(true)
    expect(r.text.endsWith('END')).toBe(true)
    expect(capReply('short')).toEqual({ text: 'short', isCut: false })
  })
})

// Stubs the engine beneath the mod: the session model, the rule files and the
// rewrite call, and records what the mod puts in the prompt box.
function engine(on: On, reply: string, transcript: { role: 'user' | 'assistant'; text: string }[] = []) {
  const seen = { filled: '', request: '', model: '', logs: [] as string[] }
  on('session.start', async ($, e) => e)
  on('session.messages', async () => ({ value: transcript.map(m => ({ ...m, toolUses: [] })) }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('fs.read', async ($, e) => ({ value: `RULES FROM ${String(e.path).split('/').pop()}` }))
  on('model.complete', async ($, e) => {
    seen.request = String(e.prompt)
    seen.model = e.model
    const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    return { value: { isAnswered: true as const, text: reply, usage } }
  })
  on('prompt.fill', async ($, e) => {
    seen.filled = e.text
    return { isFilled: true }
  })
  on('ui.toast', async () => ({ value: undefined }))
  on('ui.log', async ($, e) => {
    seen.logs.push(String(e.text))
    return { value: undefined }
  })
  return seen
}

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const run = (args: string) =>
  ({ command: 'improve', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as const

test('/improve rewrites the draft with Opus 5.5 rules and fills the prompt box', async ($, on) => {
  const seen = engine(on, '<rewrite>\nAdd a dark mode toggle to the settings page.\n</rewrite>\n<notes>\n- Named the page\n</notes>')
  await $.session.start(START)
  await $.command.run(run('make dark mode thing'))

  expect(seen.request).toContain('RULES FROM general.md')
  expect(seen.request).toContain('RULES FROM opus-5-5.md')
  expect(seen.request).toContain('Opus 5.5')
  expect(seen.request).toContain('make dark mode thing')
  expect(seen.model).toBe('sonnet')
  expect(seen.filled).toBe('Add a dark mode toggle to the settings page.')
  expect(seen.logs[0]).toContain('Named the page')
})

test('/improve leaves the box alone when the reply has no rewrite', async ($, on) => {
  const seen = engine(on, 'I cannot help with that.')
  await $.session.start(START)
  await $.command.run(run('fix it'))
  expect(seen.filled).toBe('')
})

test('/improve reads the draft as a reply to Claude\'s last message', async ($, on) => {
  const seen = engine(on, '<rewrite>\nGo with option 2.\n</rewrite>\n<notes>\n</notes>', [
    { role: 'user', text: 'fix the cache' },
    { role: 'assistant', text: 'Option 1: TTL. Option 2: purge on write.' },
  ])
  await $.session.start(START)
  await $.command.run(run('do 2'))
  expect(seen.request).toContain('<previous_reply>\nOption 1: TTL. Option 2: purge on write.\n</previous_reply>')
  expect(seen.logs[0]).toContain("read as a reply to Claude's last message")
})

test('/improve alone reads the reply the sent prompt answered, not the one after it', async ($, on) => {
  const seen = engine(on, '<rewrite>\nx\n</rewrite>', [
    { role: 'assistant', text: 'Which file?' },
    { role: 'user', text: 'the auth one' },
    { role: 'assistant', text: 'Done, auth.ts is fixed.' },
  ])
  await $.session.start(START)
  await $.command.run(run(''))
  expect(seen.request).toContain('<draft_prompt>\nthe auth one\n</draft_prompt>')
  expect(seen.request).toContain('<previous_reply>\nWhich file?\n</previous_reply>')
  expect(seen.request).not.toContain('auth.ts is fixed')
})

test('/improve in a fresh session sends no previous reply', async ($, on) => {
  const seen = engine(on, '<rewrite>\nx\n</rewrite>')
  await $.session.start(START)
  await $.command.run(run('add a dark mode toggle'))
  expect(seen.request).not.toContain('<previous_reply>')
  expect(seen.logs[0]).not.toContain('read as a reply')
})
