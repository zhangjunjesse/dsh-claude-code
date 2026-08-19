/**
 * The terminal-like live output pane.
 *
 * Text arrives append-only from the host's absolute-offset buffer, so this
 * component only has to render it: monospace, `pre-wrap`, `[tool] Xxx` lines
 * highlighted (the host injects that marker into the stream), and a DOM cap so
 * a long-running delegation cannot grow the tree without bound. Auto-scroll
 * follows the tail while the reader is at the bottom and pauses the moment they
 * scroll up, with an explicit "back to bottom" control to resume.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CSS } from './styles.js'
import { t } from './locales.js'

/** DOM caps, aligned with the host's own 500 KB live buffer. */
const MAX_CHARS = 500_000
const MAX_LINES = 2000
/** How close to the bottom still counts as "following the tail". */
const STICKY_SLACK_PX = 24

export interface OutputViewProps {
  text: string
  /** True when the host already dropped the head of the buffer. */
  truncated: boolean
  /** Identity of the job being shown; changing it re-pins the view to the tail. */
  jobId: string
}

/** Split into render lines, dropping the head when either cap is exceeded. */
function toLines(text: string): { lines: string[], clipped: boolean } {
  let body = text
  let clipped = false
  if (body.length > MAX_CHARS) {
    body = body.slice(body.length - MAX_CHARS)
    clipped = true
  }
  let lines = body.split('\n')
  if (lines.length > MAX_LINES) {
    lines = lines.slice(lines.length - MAX_LINES)
    clipped = true
  }
  return { lines, clipped }
}

export function OutputView({ text, truncated, jobId }: OutputViewProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [following, setFollowing] = useState(true)
  const { lines, clipped } = useMemo(() => toLines(text), [text])

  // A different job is a different stream: start pinned to its tail again.
  useEffect(() => {
    setFollowing(true)
  }, [jobId])

  // Scroll before paint so appended text never shows a one-frame jump.
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body || !following) return
    body.scrollTop = body.scrollHeight
  }, [lines, following])

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

  return (
    <div className={CSS.output}>
      <div ref={bodyRef} className={CSS.outputBody} onScroll={onScroll} role="log" aria-label={t('output.title')}>
        {(truncated || clipped) ? (
          <span className={CSS.outputNotice}>{t('output.truncated')}{'\n'}</span>
        ) : null}
        {text === '' ? <span className={CSS.outputNotice}>{t('output.empty')}</span> : null}
        {lines.map((line, index) => (
          <span
            key={index}
            className={line.startsWith('[tool] ') ? CSS.outputTool : CSS.outputLine}
          >
            {line}{index === lines.length - 1 ? '' : '\n'}
          </span>
        ))}
      </div>
      {following ? null : (
        <button type="button" className={CSS.follow} onClick={backToBottom}>
          {t('output.follow')}
        </button>
      )}
    </div>
  )
}
