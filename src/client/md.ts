/**
 * A small, dependency-free Markdown → React renderer for assistant text.
 *
 * The panel shows what Claude Code writes, and Claude Code writes Markdown, so
 * the output pane renders it instead of printing the source. The seed module
 * table the client bundle loads against only resolves `react` and
 * `react/jsx-runtime`, so no Markdown library is reachable here — this file is
 * the whole renderer.
 *
 * Safety is structural rather than sanitised: every piece of the input ends up
 * as a React text node or as an attribute this file chose itself, and
 * `dangerouslySetInnerHTML` is never used. That makes embedded HTML inert by
 * construction (`<script>` renders as the four characters `&lt;scr…`), and the
 * only attacker-influenced attribute — a link's `href` — must match `http(s):`
 * or the link degrades to plain text.
 *
 * Scope is "what an agent actually emits", not CommonMark: headings,
 * paragraphs with hard breaks, `**bold**` / `*italic*` / `` `code` `` / links,
 * fenced code, bullet and ordered lists, block quotes and rules. Tables,
 * reference links, footnotes and HTML blocks are out of scope, and anything
 * unparseable simply stays the literal text it was.
 */
import { createElement, memo, type ReactElement, type ReactNode } from 'react'
import { CSS } from './styles.js'

/** Block openers, also used to decide where a paragraph or list item ends. */
const HEADING = /^(#{1,6})\s+(.*)$/
const FENCE = /^\s{0,3}(?:```|~~~)\s*([\w+#.-]*)\s*$/
const FENCE_END = /^\s{0,3}(?:```|~~~)\s*$/
const RULE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const BULLET = /^(\s*)[-*+]\s+(.*)$/
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/

/** One `<h1>`…`<h6>` tag and its style token, indexed by heading level - 1. */
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
const HEADING_CLASSES = [CSS.mdH1, CSS.mdH2, CSS.mdH3, CSS.mdH4, CSS.mdH5, CSS.mdH6] as const

/** How deep emphasis and quotes may nest before the parser stops recursing. */
const MAX_DEPTH = 4

/** True when the line opens a new block, so a paragraph or list must stop. */
function startsBlock(line: string): boolean {
  return HEADING.test(line) || FENCE.test(line) || RULE.test(line)
    || QUOTE.test(line) || BULLET.test(line) || ORDERED.test(line)
}

/**
 * The href to render, or null when the target is not a plain web URL.
 *
 * Everything else — `javascript:`, `data:`, `vbscript:`, a bare relative path —
 * is refused, and the caller keeps the `[label](target)` source as literal text.
 */
function safeHref(target: string): string | null {
  const trimmed = target.trim()
  return /^https?:\/\/[^\s<>"']+$/i.test(trimmed) ? trimmed : null
}

/**
 * Parse one line's worth of inline syntax into React children.
 *
 * A single left-to-right scan: at each position the character either opens a
 * construct that closes later on the same line, or it is one more plain
 * character. Nothing backtracks, so a stray `*` or an unclosed backtick costs
 * one character of lookahead and then reads as itself.
 *
 * @param source - the raw line, with block markers already stripped.
 * @param depth - current emphasis nesting, bounded by {@link MAX_DEPTH}.
 */
function parseInline(source: string, depth: number): ReactNode[] {
  const out: ReactNode[] = []
  let plain = ''
  let index = 0
  let seq = 0

  const nextKey = (): string => {
    seq += 1
    return `i${seq}`
  }
  const flush = (): void => {
    if (plain !== '') {
      out.push(plain)
      plain = ''
    }
  }

  while (index < source.length) {
    const char = source.charAt(index)

    // `code` — the span's body is literal, never re-scanned.
    if (char === '`') {
      const end = source.indexOf('`', index + 1)
      if (end > index + 1) {
        flush()
        out.push(createElement('code', { key: nextKey(), className: CSS.mdCode }, source.slice(index + 1, end)))
        index = end + 1
        continue
      }
    }

    // [label](https://…) — any other scheme keeps the source as plain text.
    if (char === '[') {
      const link = /^\[([^\]\n]*)\]\(([^()\s]*)\)/.exec(source.slice(index))
      if (link !== null) {
        const href = safeHref(link[2] ?? '')
        if (href === null) {
          plain += link[0]
        } else {
          flush()
          out.push(createElement(
            'a',
            { key: nextKey(), className: CSS.mdLink, href, target: '_blank', rel: 'noopener noreferrer' },
            ...parseInline(link[1] ?? '', Math.min(depth + 1, MAX_DEPTH)),
          ))
        }
        index += link[0].length
        continue
      }
    }

    // **strong** / *emphasis*, and the `__`/`_` spellings of both. The body may
    // not begin or end with a space, which keeps arithmetic like `a * b * c`
    // from reading as emphasis.
    if ((char === '*' || char === '_') && depth < MAX_DEPTH) {
      const double = source.startsWith(char + char, index)
      const marker = double ? char + char : char
      const end = source.indexOf(marker, index + marker.length)
      const body = end < 0 ? '' : source.slice(index + marker.length, end)
      if (body !== '' && body === body.trim()) {
        flush()
        out.push(createElement(
          double ? 'strong' : 'em',
          { key: nextKey(), className: double ? CSS.mdStrong : CSS.mdEm },
          ...parseInline(body, depth + 1),
        ))
        index = end + marker.length
        continue
      }
    }

    plain += char
    index += 1
  }

  flush()
  return out
}

/** One paragraph: its own lines kept as hard breaks, inline syntax parsed. */
function paragraph(lines: readonly string[], key: string): ReactElement {
  const children: ReactNode[] = []
  lines.forEach((line, at) => {
    if (at > 0) children.push(createElement('br', { key: `${key}br${at}` }))
    children.push(...parseInline(line, 0))
  })
  return createElement('p', { key, className: CSS.mdP }, ...children)
}

/**
 * Parse a run of lines into block-level React elements.
 *
 * Each iteration consumes one whole block; `index` only ever moves forward, so
 * a line the parser has no rule for still gets swallowed by the paragraph case
 * and the loop cannot stall.
 *
 * @param lines - the lines of this container, block markers already stripped.
 * @param depth - block-quote nesting, bounded by {@link MAX_DEPTH}.
 */
function parseBlocks(lines: readonly string[], depth: number): ReactNode[] {
  const out: ReactNode[] = []
  let index = 0
  let seq = 0

  const nextKey = (): string => {
    seq += 1
    return `b${seq}`
  }

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (line.trim() === '') {
      index += 1
      continue
    }

    // ```lang … ``` — the language is a class-name hint only, no highlighting.
    const fence = FENCE.exec(line)
    if (fence !== null) {
      const lang = fence[1] ?? ''
      const body: string[] = []
      index += 1
      while (index < lines.length && !FENCE_END.test(lines[index] ?? '')) {
        body.push(lines[index] ?? '')
        index += 1
      }
      // Past the closing fence, or past the end when the block never closed.
      index += 1
      const codeClass = lang === '' ? CSS.mdPreCode : `${CSS.mdPreCode} language-${lang}`
      out.push(createElement(
        'pre',
        { key: nextKey(), className: CSS.mdPre },
        createElement('code', { className: codeClass }, body.join('\n')),
      ))
      continue
    }

    // --- (checked before the bullet rule, which `- - -` would also match)
    if (RULE.test(line)) {
      out.push(createElement('hr', { key: nextKey(), className: CSS.mdHr }))
      index += 1
      continue
    }

    // # … ###### …
    const heading = HEADING.exec(line)
    if (heading !== null) {
      const level = Math.min((heading[1] ?? '#').length, HEADING_TAGS.length)
      out.push(createElement(
        HEADING_TAGS[level - 1] ?? 'h6',
        { key: nextKey(), className: HEADING_CLASSES[level - 1] ?? CSS.mdH6 },
        ...parseInline(heading[2] ?? '', 0),
      ))
      index += 1
      continue
    }

    // > quoted — consecutive quote lines form one block, parsed recursively.
    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (index < lines.length) {
        const quoted = QUOTE.exec(lines[index] ?? '')
        if (quoted === null) break
        inner.push(quoted[1] ?? '')
        index += 1
      }
      const children = depth < MAX_DEPTH ? parseBlocks(inner, depth + 1) : [paragraph(inner, 'q')]
      out.push(createElement('blockquote', { key: nextKey(), className: CSS.mdQuote }, ...children))
      continue
    }

    // - item / 1. item — one run of same-kind items; a non-item line that is
    // neither blank nor a new block continues the item it sits under.
    const bullet = BULLET.exec(line)
    const ordered = bullet === null ? ORDERED.exec(line) : null
    if (bullet !== null || ordered !== null) {
      const isOrdered = bullet === null
      const items: string[][] = []
      while (index < lines.length) {
        const current = lines[index] ?? ''
        const match = isOrdered ? ORDERED.exec(current) : BULLET.exec(current)
        if (match !== null) {
          items.push([(isOrdered ? match[3] : match[2]) ?? ''])
          index += 1
          continue
        }
        const last = items[items.length - 1]
        if (last !== undefined && current.trim() !== '' && !startsBlock(current)) {
          last.push(current.trim())
          index += 1
          continue
        }
        break
      }
      const children = items.map((item, at) => createElement(
        'li',
        { key: `li${at}`, className: CSS.mdItem },
        ...parseInline(item.join(' '), 0),
      ))
      const start = isOrdered ? Number(ordered?.[2] ?? '1') : undefined
      out.push(createElement(
        isOrdered ? 'ol' : 'ul',
        { key: nextKey(), className: CSS.mdList, ...(start !== undefined && start !== 1 ? { start } : {}) },
        ...children,
      ))
      continue
    }

    // Everything else is a paragraph, up to a blank line or the next block.
    const chunk: string[] = []
    while (index < lines.length) {
      const current = lines[index] ?? ''
      if (current.trim() === '') break
      if (chunk.length > 0 && startsBlock(current)) break
      chunk.push(current)
      index += 1
    }
    out.push(paragraph(chunk, nextKey()))
  }

  return out
}

export interface MarkdownProps {
  /** Raw Markdown source; rendered as-is when it cannot be parsed. */
  text: string
}

/**
 * Render Markdown source as React elements.
 *
 * Memoised because the panel re-renders the whole event list on every poll
 * tick while a delegation runs, and the source text of an already-emitted
 * block never changes — so each block is parsed exactly once.
 */
export const Markdown = memo(function Markdown({ text }: MarkdownProps): ReactElement {
  let blocks: ReactNode[]
  try {
    blocks = parseBlocks(text.replace(/\r\n?/g, '\n').split('\n'), 0)
  } catch {
    // Tolerance over fidelity: a source the parser chokes on is still readable
    // as the plain text it was.
    return createElement('div', { className: CSS.mdRaw }, text)
  }
  return createElement('div', { className: CSS.md }, ...blocks)
})
