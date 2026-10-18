import { describe, expect, test } from 'claude-code/testing'

import {
  MAX_STORIES,
  archiveRows,
  type Edition,
  type FeedbackStore,
  buildWeekRequest,
  dateRange,
  editionIds,
  feedbackForPrompt,
  isoWeek,
  pageText,
  parseEdition,
  parseWeekSources,
  profilePath,
  releasesText,
  prune,
  readCounts,
  setTake,
  setWhy,
  storyRef,
  vote,
} from './week.ts'

const story = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Story ${id}`, summary: `v2.1.299 (Oct 14) ${id}.`, links: [], ...extra })

const ANSWER = JSON.stringify({
  edition_id: '2026-W42',
  title: 'Claude Week 42',
  date_from: '2026-10-10',
  date_to: '2026-10-17',
  intro: 'A quiet week.',
  feedback_note: null,
  top3: ['2026-W42-idle', 'compaction-missing', 'models-a'],
  sections: [
    { id: 'code', title: 'Claude Code', range: 'v2.1.293 → v2.1.299', note: null, stories: [story('2026-W42-idle', { links: [{ label: 'Release notes', url: 'https://github.com/x' }, { label: 'bad', url: 'javascript:alert(1)' }] })] },
    { id: 'models', title: 'Models and platform', range: null, note: null, stories: [story('models-a', { detail: '', prompt: 'Explain it.' })] },
    { id: 'company', title: 'Company and policy', range: null, note: null, stories: [] },
  ],
  questions: [{ text: 'Which hooks enforce a rule?', prompt: 'Audit my hooks.' }, { prompt: 'no text' }],
  sources: [{ label: 'Claude Code releases', url: 'https://github.com/anthropics/claude-code/releases' }],
})

describe('the week', () => {
  test('isoWeek names the edition by ISO week, across a year boundary, covering the 7 days that end that day', () => {
    expect(isoWeek(Date.parse('2026-10-17T09:00:00Z'))).toEqual({ id: '2026-W42', number: 42, title: 'Claude Week 42', from: '2026-10-10', to: '2026-10-17' })
    // Jan 1 2027 is a Friday: it belongs to 2026's week 53.
    expect(isoWeek(Date.parse('2027-01-01T12:00:00Z')).id).toBe('2026-W53')
    // Dec 31 2024 is a Tuesday: it belongs to 2025's week 1.
    expect(isoWeek(Date.parse('2024-12-31T12:00:00Z')).id).toBe('2025-W01')
  })

  test('dateRange shortens two ISO dates', () => {
    expect(dateRange('2026-10-09', '2026-10-16')).toBe('Oct 9 – Oct 16')
  })
})

describe('parseEdition', () => {
  test('reads the edition: sections in order, empty ones gone, Desktop added, bad links dropped, ids under the edition', () => {
    const r = parseEdition(`Here it is:\n\`\`\`json\n${ANSWER}\n\`\`\``, '2026-W42')
    if (!('edition' in r)) throw new Error(r.reason)
    const e = r.edition
    expect(e.sections.map(s => s.id)).toEqual(['models', 'code', 'desktop'])
    expect(e.sections[2]!.note).toContain('Nothing new')
    expect(e.sections[0]!.stories[0]!.id).toBe('2026-W42-models-a')
    expect(e.sections[0]!.stories[0]!.detail).toBeNull()
    expect(e.sections[1]!.stories[0]!.links).toEqual([{ label: 'Release notes', url: 'https://github.com/x' }])
    // Top 3 keeps only stories the edition has.
    expect(e.top3).toEqual(['2026-W42-idle', '2026-W42-models-a'])
    expect(e.questions).toEqual([{ text: 'Which hooks enforce a rule?', prompt: 'Audit my hooks.' }])
    expect(e.feedback_note).toBeNull()
  })

  test('the edition id is the one asked for, whatever the answer says', () => {
    const r = parseEdition(ANSWER.replace('"edition_id":"2026-W42"', '"edition_id":"2026-W41"'), '2026-W42')
    expect('edition' in r && r.edition.edition_id).toBe('2026-W42')
  })

  test('rejects an answer with no JSON, broken JSON, no sections or no stories', () => {
    expect(parseEdition('I could not find any news.', '2026-W42')).toEqual({ reason: 'the answer has no JSON object' })
    expect('reason' in parseEdition('{ "sections": [ }', '2026-W42')).toBe(true)
    expect(parseEdition('{"title":"x"}', '2026-W42')).toEqual({ reason: 'the edition has no sections' })
    expect(parseEdition('{"sections":[{"id":"code","stories":[]}]}', '2026-W42')).toEqual({ reason: 'the edition has no stories' })
  })

  test('keeps at most 15 news stories, dropping the lowest-ranked first and never a Top 3 story; tips don\'t count', () => {
    const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => story(`${prefix}-${i}`))
    const answer = JSON.stringify({
      top3: ['code-9'],
      sections: [
        { id: 'code', stories: many('code', 10) },
        { id: 'models', stories: many('models', 8) },
        { id: 'tips', stories: many('tip', 3) },
      ],
    })
    const r = parseEdition(answer, '2026-W42')
    if (!('edition' in r)) throw new Error(r.reason)
    const counts = Object.fromEntries(r.edition.sections.map(s => [s.id, s.stories.length]))
    expect(counts.models! + counts.code!).toBe(MAX_STORIES)
    expect(counts.tips).toBe(3)
    expect(r.edition.sections.find(s => s.id === 'code')!.stories.some(s => s.id === '2026-W42-code-9')).toBe(true)
    expect(r.edition.sections.find(s => s.id === 'models')!.stories.at(-1)!.id).toBe('2026-W42-models-6')
  })
})

describe('feedback', () => {
  const ref = { story_id: '2026-W42-idle', edition_id: '2026-W42', section: 'code', title: 'Idle compaction' }
  const T = '2026-10-17T09:00:00Z'

  test('a vote sets the verdict; the same vote again clears it and its reason; a switch clears the reason', () => {
    let fb = vote({}, ref, 'up', T)
    expect(fb[ref.story_id]).toMatchObject({ ...ref, verdict: 'up', why: null, take: null, updated_at: T })
    fb = setWhy(fb, ref, '  important default  ', T)
    expect(fb[ref.story_id]!.why).toBe('important default')
    expect(vote(fb, ref, 'down', T)[ref.story_id]).toMatchObject({ verdict: 'down', why: null })
    // Cleared with nothing else on it, the record goes.
    expect(vote(fb, ref, 'up', T)).toEqual({})
  })

  test('a take stands without a vote, and a record goes once its verdict, reason and take are all empty', () => {
    let fb = setTake({}, ref, 'Haiku was bad for a page', T)
    expect(fb[ref.story_id]).toMatchObject({ verdict: null, take: 'Haiku was bad for a page' })
    expect(setTake(fb, ref, 'Haiku was bad for a page', 'later')).toBe(fb)
    fb = setTake(fb, ref, '   ', T)
    expect(fb).toEqual({})
    expect(prune({ x: { ...ref, story_id: 'x', verdict: null, why: null, take: null, updated_at: T } })).toEqual({})
  })

  test('the writer reads the last four editions\' feedback, newest first', () => {
    const at = (week: number, updated: string) => ({ ...ref, story_id: `2026-W${week}-s`, edition_id: `2026-W${week}`, verdict: 'up' as const, why: null, take: null, updated_at: updated })
    const store: FeedbackStore = Object.fromEntries([at(37, '1'), at(38, '2'), at(40, '3'), at(41, '5'), at(42, '4')].map(f => [f.story_id, f]))
    expect(feedbackForPrompt(store).map(f => f.edition_id)).toEqual(['2026-W41', '2026-W42', '2026-W40', '2026-W38'])
  })

  test('buildWeekRequest names the week and carries the profile and feedback', () => {
    const pages = [
      { tier: 1, label: 'Newsroom', url: 'https://www.anthropic.com/news', text: 'Oct 15 Haiku 5.5' },
      { tier: 2, label: 'Tracker', url: 'https://t.example/', error: 'HTTP 503' },
    ]
    const req = buildWeekRequest('name: Omar\n', [{ ...ref, verdict: 'down', why: 'too basic', take: null, updated_at: T }], isoWeek(Date.parse(T)), pages)
    expect(req).toContain('Today is 2026-10-17. Write edition 2026-W42 ("Claude Week 42"), covering 2026-10-10 to 2026-10-17.')
    expect(req).toContain('<reader_profile>\nname: Omar\n</reader_profile>')
    expect(req).toContain('"why":"too basic"')
    expect(req).toContain('<page tier="1" label="Newsroom" url="https://www.anthropic.com/news">\nOct 15 Haiku 5.5\n</page>')
    expect(req).toContain('<unread>\nTracker <https://t.example/>: HTTP 503\n</unread>')
    expect(buildWeekRequest('x', [], isoWeek(Date.parse(T)), [])).toContain('None yet')
    expect(buildWeekRequest('x', [], isoWeek(Date.parse(T)), [])).not.toContain('<unread>')
  })
})

describe('reading', () => {
  test('readCounts counts news stories per section, tips aside; storyRef finds a story in any edition', () => {
    const r = parseEdition(ANSWER, '2026-W42') as { edition: Edition }
    const counts = readCounts(r.edition, { '2026-W42-idle': true })
    expect(counts).toEqual({
      read: 1,
      total: 2,
      sections: [
        { id: 'models', title: 'Models and platform', read: 0, total: 1 },
        { id: 'code', title: 'Claude Code', read: 1, total: 1 },
      ],
    })
    expect(storyRef({ '2026-W42': r.edition }, '2026-W42-idle')).toEqual({ story_id: '2026-W42-idle', edition_id: '2026-W42', section: 'code', title: 'Story 2026-W42-idle' })
    expect(storyRef({}, 'nope')).toBeUndefined()
    expect(editionIds({ '2026-W40': r.edition, '2026-W42': r.edition, '2026-W41': r.edition })).toEqual(['2026-W42', '2026-W41', '2026-W40'])
  })

  test('profilePath is the mod\'s data folder in its config: from the install\'s cache path, or -inline for a folder loaded directly', () => {
    expect(profilePath('/Users/o/.claude/plugins/cache/prompt-coach/prompt-coach/0.9.0', 'prompt-coach', '/x')).toBe('/Users/o/.claude/plugins/data/prompt-coach-prompt-coach/profile.yaml')
    expect(profilePath('/Users/o/.claude-personal/plugins/cache/market/coach/1.0.0/', 'coach', '/x')).toBe('/Users/o/.claude-personal/plugins/data/coach-market/profile.yaml')
    expect(profilePath('/Users/o/projects/prompt-coach', 'prompt-coach', '/Users/o/.claude/')).toBe('/Users/o/.claude/plugins/data/prompt-coach-inline/profile.yaml')
  })

  test('archiveRows lists editions newest first, with stories read and voted per edition', () => {
    const r = parseEdition(ANSWER, '2026-W42') as { edition: Edition }
    const older = { ...(parseEdition(ANSWER.replaceAll('2026-W42', '2026-W41'), '2026-W41') as { edition: Edition }).edition, title: 'Claude Week 41' }
    const feedback: FeedbackStore = {
      a: { story_id: 'a', edition_id: '2026-W41', section: 'code', title: 'A', verdict: 'down', why: null, take: null, updated_at: 'x' },
      b: { story_id: 'b', edition_id: '2026-W41', section: 'code', title: 'B', verdict: null, why: null, take: 'a take', updated_at: 'x' },
    }
    const rows = archiveRows({ '2026-W41': older, '2026-W42': r.edition }, feedback, { '2026-W42-idle': true })
    expect(rows.map(x => [x.id, x.title, x.read, x.total, x.voted])).toEqual([
      ['2026-W42', r.edition.title, 1, 2, 0],
      ['2026-W41', 'Claude Week 41', 0, 2, 1],
    ])
    expect(rows[0]!.range).toBe(dateRange(r.edition.date_from, r.edition.date_to))
    expect(archiveRows({}, {}, {})).toEqual([])
  })
})

describe('source pages', () => {
  test('parseWeekSources keeps https pages with a tier and label, in tier order, with kind and link', () => {
    const json = JSON.stringify({
      pages: [
        { tier: 3, label: 'Addy', url: 'https://addyosmani.com/rss.xml', link: 'https://addyosmani.com/' },
        { tier: 1, label: 'Releases', url: 'https://api.github.com/x', kind: 'github-releases', link: 'https://github.com/x' },
        { tier: 1, label: 'Plain http', url: 'http://insecure.example/' },
        { label: 'No tier', url: 'https://x.example/' },
      ],
    })
    expect(parseWeekSources(json)).toEqual([
      { tier: 1, label: 'Releases', url: 'https://api.github.com/x', kind: 'github-releases', link: 'https://github.com/x' },
      { tier: 3, label: 'Addy', url: 'https://addyosmani.com/rss.xml', link: 'https://addyosmani.com/' },
    ])
  })

  test('pageText keeps the words and links, drops scripts, styles and markup, and cuts long pages', () => {
    const html = `<html><head><title>x</title><style>.a{}</style></head><body>
      <nav><a href="#top">Top</a></nav><script>var a = 1</script>
      <h2>Expanding the <b>program</b></h2><p>Oct 6, 2026 &mdash; We&#8217;re launching &amp; more.</p>
      <a href="/news/cyber">Read the post</a><a href="javascript:void(0)">Nothing</a>
      <p>Oct 6, 2026 &mdash; We&#8217;re launching &amp; more.</p></body></html>`
    const text = pageText(html, 'https://www.anthropic.com/news')
    expect(text).toBe('Top\nExpanding the program\nOct 6, 2026 — We’re launching & more.\nRead the post <https://www.anthropic.com/news/cyber> Nothing\nOct 6, 2026 — We’re launching & more.')
    expect(text).not.toContain('var a')
    const long = pageText(`<p>${'word '.repeat(100)}</p>`, 'https://x.example/', 50)
    expect(long.endsWith('[cut: the page goes on]')).toBe(true)
  })

  test('pageText reads a feed, CDATA and all', () => {
    const rss = '<rss><channel><item><title><![CDATA[Agents & you]]></title><link>https://addyosmani.com/blog/agents/</link><pubDate>Thu, 15 Oct 2026</pubDate></item></channel></rss>'
    expect(pageText(rss, 'https://addyosmani.com/rss.xml')).toBe('Agents & you\nhttps://addyosmani.com/blog/agents/ Thu, 15 Oct 2026')
  })

  test('releasesText keeps the last 14 days of releases, newest first, or the latest 3 when none are that recent', () => {
    const rel = (tag: string, date: string) => ({ tag_name: tag, name: tag, published_at: `${date}T10:00:00Z`, html_url: `https://github.com/r/${tag}`, body: `- ${tag} notes` })
    const json = JSON.stringify([rel('v1', '2026-09-01'), rel('v3', '2026-10-16'), rel('v2', '2026-10-05')])
    const now = Date.parse('2026-10-17T09:00:00Z')
    expect(releasesText(json, now)).toBe('## v3 (2026-10-16) <https://github.com/r/v3>\n- v3 notes\n\n## v2 (2026-10-05) <https://github.com/r/v2>\n- v2 notes')
    expect(releasesText(json, Date.parse('2027-01-01T00:00:00Z')).split('## ').length - 1).toBe(3)
  })
})
