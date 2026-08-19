/**
 * The "Claude Code" conversation view: a delegation list on the left and a live
 * Claude Code window on the right.
 *
 * Two data sources meet here. Job identity and lifecycle come for free from the
 * harness's `session/jobs` push (mirrored into `jobsBySession`), so status
 * changes need no polling at all. Everything the mirror does not carry — the
 * full task text, cost/turns, the Claude session id, the live output — comes
 * from this plugin's own `claudeCode/*` remote, polled only while this tab is
 * mounted AND the selected job is still running.
 *
 * The harness unmounts non-active views entirely, so local state would be lost
 * on every tab switch; the per-session panel state therefore lives in a bounded
 * module-level cache and the view resumes reading where it left off.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClaudeCodeApi } from './api.js'
import type { JobInfo, JobStatus, JobView, ViewProps } from './types.js'
import { OutputView } from './OutputView.js'
import { CSS } from './styles.js'
import { t, type LocaleKey } from './locales.js'

/** Stable empty list so a session with no jobs keeps one array identity. */
const NO_JOBS: readonly JobView[] = []

/** Only this plugin's own delegations belong in the panel. */
const JOB_KIND = 'claude-code'

/** Live-output poll period while the selected job runs. */
const POLL_MS = 1000

/** Sessions whose panel state is kept across tab switches. */
const MAX_CACHED_SESSIONS = 8

/** One job's accumulated output plus its absolute read cursor. */
interface OutputState {
  text: string
  offset: number
  truncated: boolean
}

/** Panel state that must survive the view being unmounted on a tab switch. */
interface PanelState {
  selected?: string
  outputs: Map<string, OutputState>
}

const panels = new Map<string, PanelState>()

function panelOf(sessionId: string): PanelState {
  let panel = panels.get(sessionId)
  if (panel === undefined) {
    panel = { outputs: new Map() }
    panels.set(sessionId, panel)
    // Bounded cache: drop the least recently created session's panel state.
    while (panels.size > MAX_CACHED_SESSIONS) {
      const oldest = panels.keys().next()
      if (oldest.done === true) break
      panels.delete(oldest.value)
    }
  }
  return panel
}

function isLive(job: JobView): boolean {
  return job.status === 'running' || job.status === 'stopping'
}

/** Live rows first in start order, then settled rows newest-first (official order). */
function ordered(jobs: readonly JobView[]): JobView[] {
  return [...jobs].sort((left, right) => {
    const liveLeft = isLive(left)
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1
    if (liveLeft) return left.startedAt - right.startedAt
    const finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt)
    return finished !== 0 ? finished : left.startedAt - right.startedAt
  })
}

function dotState(status: JobStatus): StateDotState {
  switch (status) {
    case 'running': return 'ongoing'
    case 'stopping': return 'warning'
    case 'killed': return 'warning'
    case 'completed': return 'done'
    default: return 'error'
  }
}

function statusLabel(status: JobStatus): string {
  const key: LocaleKey = status === 'completed'
    ? 'status.completed'
    : status === 'failed'
      ? 'status.failed'
      : status === 'running'
        ? 'status.running'
        : 'status.killed'
  return t(key)
}

/** Elapsed time in at most two adjacent units. */
function formatDuration(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/** Pick the job the panel should show when the current choice is gone. */
function defaultSelection(rows: JobView[]): string | undefined {
  const running = rows.filter(isLive)
  if (running.length) return running[running.length - 1]?.id
  return rows[0]?.id
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Build the view component bound to one API surface. The connection service is
 * only reachable from the plugin context, so the binding happens at
 * registration time instead of through a prop.
 */
export function createClaudeCodeView(api: ClaudeCodeApi) {
  return function ClaudeCodeView({ sessionId, useSessions }: ViewProps) {
    const mirrored = useSessions((state) => state.jobsBySession?.[sessionId]) ?? NO_JOBS
    const rows = useMemo(() => ordered(mirrored.filter((job) => job.kind === JOB_KIND)), [mirrored])

    const panel = panelOf(sessionId)
    // Seeded from the cached choice (tab switch) or the default pick, so the
    // first paint already shows a job instead of the "pick one" placeholder.
    const [selected, setSelected] = useState<string | undefined>(() => panel.selected ?? defaultSelection(rows))
    const [meta, setMeta] = useState<Record<string, JobInfo>>({})
    const [error, setError] = useState<string | null>(null)
    const [now, setNow] = useState(() => Date.now())
    const [copied, setCopied] = useState<string | null>(null)
    // Module-level output cache mutates in place; this counter republishes it.
    const [revision, setRevision] = useState(0)
    const bumpRef = useRef(() => { setRevision((value) => value + 1) })

    // Keep the selection valid as jobs appear, settle and age out.
    useEffect(() => {
      const stillThere = selected !== undefined && rows.some((job) => job.id === selected)
      const next = stillThere ? selected : defaultSelection(rows)
      if (next !== selected) setSelected(next)
      panel.selected = next
    }, [rows, selected, panel])

    const current = rows.find((job) => job.id === selected)
    const currentStatus = current?.status
    // Re-fetch metadata whenever a job appears or changes lifecycle state.
    const lifecycle = rows.map((job) => `${job.id}:${job.status}`).join(',')

    useEffect(() => {
      const abort = new AbortController()
      api.listJobs(sessionId, abort.signal).then(
        (jobs) => {
          const next: Record<string, JobInfo> = {}
          for (const job of jobs) next[job.jobId] = job
          setMeta(next)
          setError(null)
        },
        (failure: unknown) => {
          if (abort.signal.aborted) return
          setError(`${t('error.prefix')}: ${failure instanceof Error ? failure.message : String(failure)}`)
        },
      )
      return () => { abort.abort() }
    }, [sessionId, lifecycle])

    // Live output: one immediate read, then a 1s poll only while it runs. The
    // status is a dependency, so settling triggers exactly one final read.
    useEffect(() => {
      if (selected === undefined) return
      const jobId = selected
      const abort = new AbortController()
      let timer: ReturnType<typeof setInterval> | undefined

      const pull = () => {
        const state = panel.outputs.get(jobId) ?? { text: '', offset: 0, truncated: false }
        api.readOutput(sessionId, jobId, state.offset, abort.signal).then(
          (chunk) => {
            if (chunk.text === '' && !chunk.truncated) return
            panel.outputs.set(jobId, {
              text: state.text + chunk.text,
              offset: chunk.nextOffset,
              truncated: state.truncated || chunk.truncated,
            })
            bumpRef.current()
          },
          (failure: unknown) => {
            if (abort.signal.aborted) return
            setError(`${t('error.prefix')}: ${failure instanceof Error ? failure.message : String(failure)}`)
          },
        )
      }

      pull()
      if (currentStatus === 'running' || currentStatus === 'stopping') {
        timer = setInterval(pull, POLL_MS)
      }
      return () => {
        abort.abort()
        if (timer !== undefined) clearInterval(timer)
      }
    }, [sessionId, selected, currentStatus, panel])

    // Tick only while something is live, so an idle panel costs nothing.
    const liveCount = rows.filter(isLive).length
    useEffect(() => {
      if (liveCount === 0) return
      setNow(Date.now())
      const timer = setInterval(() => { setNow(Date.now()) }, 1000)
      return () => { clearInterval(timer) }
    }, [liveCount])

    const onCancel = useCallback((jobId: string) => {
      if (!window.confirm(t('action.cancel.confirm'))) return
      api.cancel(sessionId, jobId).catch((failure: unknown) => {
        setError(`${t('error.prefix')}: ${failure instanceof Error ? failure.message : String(failure)}`)
      })
    }, [sessionId])

    const flashCopied = useCallback((token: string) => {
      setCopied(token)
      window.setTimeout(() => { setCopied((value) => (value === token ? null : value)) }, 1500)
    }, [])

    const detail = current ? meta[current.id] : undefined
    const output = current ? panel.outputs.get(current.id) : undefined
    // `revision` is read so the memo-free render tracks the mutable cache.
    void revision

    if (rows.length === 0) {
      return (
        <div className={CSS.root} data-conversation-composer-overlay="">
          <div className={CSS.empty}>
            <div className={CSS.emptyTitle}>{t('list.empty.title')}</div>
            <div>{t('list.empty.hint')}</div>
            <div>{t('list.empty.note')}</div>
          </div>
        </div>
      )
    }

    return (
      <div className={CSS.root} data-conversation-composer-overlay="">
        <div className={CSS.list} role="tablist" aria-label={t('list.title')}>
          <div className={CSS.listTitle}>{t('list.title')}</div>
          {rows.map((job) => {
            const live = isLive(job)
            const elapsed = live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt
            return (
              <button
                key={job.id}
                type="button"
                role="tab"
                aria-selected={job.id === selected}
                className={job.id === selected ? `${CSS.row} ${CSS.rowActive}` : CSS.row}
                onClick={() => { setSelected(job.id); panel.selected = job.id }}
              >
                <span className={CSS.rowHead}>
                  <StateDot state={dotState(job.status)} className={CSS.dot} />
                  <span className={CSS.rowLabel} title={job.label}>{job.label}</span>
                </span>
                <span className={CSS.rowMeta}>
                  <span>{statusLabel(job.status)}</span>
                  <span>{formatDuration(elapsed)}</span>
                  <span className={CSS.mono}>{job.id}</span>
                </span>
              </button>
            )
          })}
        </div>

        <div className={CSS.pane}>
          {current === undefined ? (
            <div className={CSS.empty}>{t('select.empty')}</div>
          ) : (
            <>
              <div className={CSS.paneHead}>
                <div className={CSS.paneTitle} title={detail?.task ?? current.label}>{current.label}</div>
                <div className={CSS.stats}>
                  <span className={CSS.stat}>{t('detail.job')}: <span className={CSS.mono}>{current.id}</span></span>
                  <span className={CSS.stat}>{statusLabel(current.status)}</span>
                  {detail?.numTurns !== undefined ? <span className={CSS.stat}>{detail.numTurns} {t('stats.turns')}</span> : null}
                  {detail?.costUsd !== undefined ? <span className={CSS.stat}>{t('stats.cost')} ${detail.costUsd.toFixed(4)}</span> : null}
                  <span className={CSS.stat}>
                    {t('stats.duration')} {formatDuration(isLive(current) ? now - current.startedAt : (current.finishedAt ?? current.startedAt) - current.startedAt)}
                  </span>
                  {detail?.claudeSessionId !== undefined ? (
                    <span className={CSS.stat} title={t('detail.session.hint')}>
                      {t('detail.session')}: <span className={CSS.mono}>{detail.claudeSessionId}</span>
                    </span>
                  ) : null}
                </div>
                {current.detail !== undefined ? <div className={CSS.stats}>{current.detail}</div> : null}
              </div>

              {error !== null ? <div className={CSS.error}>{error}</div> : null}

              <OutputView
                jobId={current.id}
                text={output?.text ?? (detail?.finalOutput ?? '')}
                truncated={output?.truncated ?? false}
              />

              <div className={CSS.actions}>
                {isLive(current) ? (
                  <button type="button" className={`${CSS.button} ${CSS.danger}`} onClick={() => { onCancel(current.id) }}>
                    {t('action.cancel')}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={CSS.button}
                  disabled={(output?.text ?? detail?.finalOutput ?? '') === ''}
                  onClick={() => {
                    void copy(output?.text ?? detail?.finalOutput ?? '').then((done) => { if (done) flashCopied('output') })
                  }}
                >
                  {copied === 'output' ? t('action.copied') : t('action.copyOutput')}
                </button>
                <button
                  type="button"
                  className={CSS.button}
                  disabled={detail?.claudeSessionId === undefined}
                  title={t('detail.session.hint')}
                  onClick={() => {
                    void copy(detail?.claudeSessionId ?? '').then((done) => { if (done) flashCopied('session') })
                  }}
                >
                  {copied === 'session' ? t('action.copied') : t('action.copySession')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
}
