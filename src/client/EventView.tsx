/**
 * Native-style rendering of one delegation's structured event stream.
 *
 * The host emits one event per completed content block (text / thinking /
 * tool_use / tool_result / result); this component turns that flat, append-only
 * list into the shape a Claude Code terminal shows: plain text, collapsed
 * thinking, and a tool card that owns the result it produced. Grouping is by
 * `tool_use_id`, so parallel tool calls still land under their own card.
 *
 * Everything long is collapsed by default — parameters to one line, results to
 * a few hundred characters — because a delegation easily emits megabytes and
 * the reader is scanning for what the agent is doing, not reading file dumps.
 * Auto-scroll follows the tail and pauses the moment the reader scrolls up,
 * exactly like the text pane it sits next to.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CSS, toolToneClass } from './styles.js'
import { t } from './locales.js'
import type { ClaudeEvent } from './types.js'

/** DOM cap: only the newest events stay in the tree. */
const MAX_RENDER_EVENTS = 1000
/** Collapsed length of a tool_use parameter line. */
const PARAM_PREVIEW = 200
/** Collapsed length of a tool_result body. */
const RESULT_PREVIEW = 800
/** How close to the bottom still counts as "following the tail". */
const STICKY_SLACK_PX = 24

interface ResultNode {
  content: string
  isError: boolean
}

type Node =
  | { kind: 'text', key: string, text: string }
  | { kind: 'thinking', key: string, thinking: string }
  | { kind: 'tool', key: string, name: string, preview: string, full: string, results: ResultNode[] }
  | { kind: 'orphanResult', key: string, result: ResultNode }
  | { kind: 'result', key: string, summary: string, isError: boolean }
  | { kind: 'warning', key: string, text: string }

export interface EventViewProps {
  events: readonly ClaudeEvent[]
  /** True when the host already dropped the head of the event buffer. */
  truncated: boolean
  /** Identity of the job being shown; changing it re-pins the view to the tail. */
  jobId: string
}

/** One-line preview plus the pretty-printed full form of a tool's parameters. */
function formatInput(input: unknown): { preview: string, full: string } {
  if (input === undefined || input === null) return { preview: '', full: '' }
  if (typeof input === 'string') return { preview: input, full: input }
  let compact: string
  let full: string
  try {
    compact = JSON.stringify(input) ?? String(input)
    full = JSON.stringify(input, null, 2) ?? String(input)
  } catch {
    compact = String(input)
    full = compact
  }
  return { preview: compact, full }
}

/** `3m20s` / `12s`, matching the detail line the jobs seam prints. */
function formatDuration(durationMs: number): string {
  const total = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`
}

/** `✅ 完成 · $0.13 · 12 turns · 3m20s`, skipping whatever the run did not report. */
function resultSummary(event: Extract<ClaudeEvent, { type: 'result' }>): string {
  const parts = [event.isError === true ? `❌ ${t('status.failed')}` : `✅ ${t('events.result')}`]
  if (typeof event.costUsd === 'number') parts.push(`$${event.costUsd.toFixed(2)}`)
  if (typeof event.numTurns === 'number') parts.push(`${event.numTurns} turns`)
  if (typeof event.durationMs === 'number') parts.push(formatDuration(event.durationMs))
  return parts.join(' · ')
}

/** Fold the flat event list into render nodes, attaching results to their call. */
function toNodes(events: readonly ClaudeEvent[]): Node[] {
  const nodes: Node[] = []
  /** tool_use_id → index of its card in `nodes`. */
  const byToolUse = new Map<string, number>()

  events.forEach((event, index) => {
    const key = `e${index}`
    switch (event.type) {
      case 'text': {
        if (event.text.trim() === '') break
        nodes.push({ kind: 'text', key, text: event.text })
        break
      }
      case 'thinking': {
        nodes.push({ kind: 'thinking', key, thinking: event.thinking })
        break
      }
      case 'tool_use': {
        const { preview, full } = formatInput(event.input)
        nodes.push({ kind: 'tool', key, name: event.name, preview, full, results: [] })
        if (event.id !== undefined) byToolUse.set(event.id, nodes.length - 1)
        break
      }
      case 'tool_result': {
        const result: ResultNode = { content: event.content, isError: event.isError === true }
        const at = event.tool_use_id === null ? undefined : byToolUse.get(event.tool_use_id)
        const owner = at === undefined ? undefined : nodes[at]
        if (owner !== undefined && owner.kind === 'tool') owner.results.push(result)
        else nodes.push({ kind: 'orphanResult', key, result })
        break
      }
      case 'result': {
        nodes.push({ kind: 'result', key, summary: resultSummary(event), isError: event.isError === true })
        break
      }
      case 'warning': {
        nodes.push({ kind: 'warning', key, text: event.text })
        break
      }
    }
  })

  return nodes
}

export function EventView({ events, truncated, jobId }: EventViewProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [following, setFollowing] = useState(true)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())

  const clipped = events.length > MAX_RENDER_EVENTS
  const visible = useMemo(
    () => (clipped ? events.slice(events.length - MAX_RENDER_EVENTS) : events),
    [events, clipped],
  )
  const nodes = useMemo(() => toNodes(visible), [visible])

  // A different job is a different stream: forget expansions, re-pin to the tail.
  useEffect(() => {
    setFollowing(true)
    setExpanded(new Set())
  }, [jobId])

  // Scroll before paint so appended events never show a one-frame jump.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body || !following) return
    body.scrollTop = body.scrollHeight
  }, [nodes, following])

  const onScroll = () => {
    const body = bodyRef.current
    if (!body) return
    const atBottom = body.scrollHeight - body.scrollTop - body.clientHeight <= STICKY_SLACK_PX
    setFollowing(atBottom)
  }

  const backToBottom = () => {
    const body = bodyRef.current
    if (body) body.scrollTop = body.scrollHeight
    setFollowing(true)
  }

  const toggle = (key: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  /** A result body: collapsed to a preview with an inline expander. */
  const renderResult = (key: string, result: ResultNode) => {
    const open = expanded.has(key)
    const long = result.content.length > RESULT_PREVIEW
    const body = open || !long ? result.content : `${result.content.slice(0, RESULT_PREVIEW)}…`
    return (
      <div key={key} className={CSS.evToolResult}>
        <div className={result.isError ? `${CSS.evToolResultHead} ${CSS.evToolError}` : CSS.evToolResultHead}>
          {result.isError ? t('events.toolError') : t('events.toolResult')}
        </div>
        <pre className={result.isError ? `${CSS.evToolResultBody} ${CSS.evToolError}` : CSS.evToolResultBody}>{body}</pre>
        {long ? (
          <button type="button" className={CSS.evMore} onClick={() => { toggle(key) }}>
            {open ? t('output.collapse') : t('output.expand')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className={CSS.events}>
      <div ref={bodyRef} className={CSS.eventsBody} onScroll={onScroll} role="log" aria-label={t('events.title')}>
        {(truncated || clipped) ? <div className={CSS.outputNotice}>{t('events.truncated')}</div> : null}
        {nodes.length === 0 ? <div className={CSS.outputNotice}>{t('events.empty')}</div> : null}

        {nodes.map((node) => {
          if (node.kind === 'text') {
            return <div key={node.key} className={CSS.evText}>{node.text}</div>
          }

          if (node.kind === 'thinking') {
            const open = expanded.has(node.key)
            return (
              <div key={node.key} className={CSS.evThinking}>
                <button
                  type="button"
                  className={CSS.evThinkingHead}
                  aria-expanded={open}
                  onClick={() => { toggle(node.key) }}
                >
                  {open ? `💭 ${t('events.thinkingLabel')}（${t('output.collapse')}）` : t('events.thinking')}
                </button>
                {open ? <pre className={CSS.evThinkingBody}>{node.thinking}</pre> : null}
              </div>
            )
          }

          if (node.kind === 'orphanResult') {
            return renderResult(`${node.key}:r0`, node.result)
          }

          if (node.kind === 'result') {
            return (
              <div key={node.key} className={node.isError ? `${CSS.evResult} ${CSS.evToolError}` : CSS.evResult}>
                {node.summary}
              </div>
            )
          }

          if (node.kind === 'warning') {
            return (
              <div key={node.key} role="status" className={CSS.evWarning}>
                {node.text}
              </div>
            )
          }

          const paramsKey = `${node.key}:p`
          const open = expanded.has(paramsKey)
          const long = node.preview.length > PARAM_PREVIEW
          return (
            <div key={node.key} className={CSS.evTool}>
              <button
                type="button"
                className={CSS.evToolHead}
                aria-expanded={open}
                onClick={() => { toggle(paramsKey) }}
              >
                <span className={`${CSS.evToolBadge} ${toolToneClass(node.name)}`}>[{node.name}]</span>
                {open ? null : (
                  <span className={CSS.evToolParams}>
                    {long ? `${node.preview.slice(0, PARAM_PREVIEW)}…` : node.preview}
                  </span>
                )}
              </button>
              {open && node.full !== '' ? <pre className={CSS.evToolParamsFull}>{node.full}</pre> : null}
              {node.results.map((result, index) => renderResult(`${node.key}:r${index}`, result))}
            </div>
          )
        })}
      </div>
      {following ? null : (
        <button type="button" className={CSS.follow} onClick={backToBottom}>
          {t('output.follow')}
        </button>
      )}
    </div>
  )
}
