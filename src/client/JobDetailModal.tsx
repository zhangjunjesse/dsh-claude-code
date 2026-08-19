/**
 * Everything about one delegation that does not fit on its tab.
 *
 * The tab strip is deliberately one line per job, so the full task text, the
 * model the run used, its timestamps, cost and failure reason live here. Two
 * sources are merged: `JobView` (the harness's own jobs push — always present,
 * always current) and `JobInfo` (this plugin's `listJobs` — richer, but absent
 * until the first read lands). Any field neither side supplies renders `-`.
 *
 * The overlay is hand-rolled rather than pulled from a dialog library: the
 * bundle takes no new dependencies, and the three ways out (the close button,
 * ESC, a click on the backdrop) are a few lines each.
 */
import { useEffect } from 'react'
import type { JobInfo, JobView } from './types.js'
import { formatClock, formatDuration, statusLabel } from './format.js'
import { CSS } from './styles.js'
import { t } from './locales.js'

export interface JobDetailModalProps {
  /** The job as the harness pushes it (identity, status, timestamps). */
  job: JobView
  /** The plugin's own metadata for the same job, once `listJobs` answered. */
  detail: JobInfo | undefined
  /** Ticking clock, so a running job's duration stays live behind the modal. */
  now: number
  onClose: () => void
  /** Copy the Claude session id; wired to the view's clipboard flash. */
  onCopySession?: (sessionId: string) => void
  /** Label of the copy button, so the view can flash "copied" through it. */
  copyLabel?: string
}

/** One `key: value` line; an absent value degrades to `-` rather than vanishing. */
function Row({ label, value, danger }: { label: string, value: string | null | undefined, danger?: boolean }) {
  return (
    <div className={CSS.modalRow}>
      <span className={CSS.modalKey}>{label}</span>
      <span className={danger === true ? `${CSS.modalValue} ${CSS.modalFailure}` : CSS.modalValue}>
        {value === null || value === undefined || value === '' ? '-' : value}
      </span>
    </div>
  )
}

export function JobDetailModal({ job, detail, now, onClose, onCopySession, copyLabel }: JobDetailModalProps) {
  // ESC closes from anywhere, including while focus sits in the output pane.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const live = job.status === 'running' || job.status === 'stopping'
  // The host's measured duration wins; a live job falls back to the ticking clock.
  const elapsed = detail?.durationMs ?? (live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt)
  const sessionId = detail?.claudeSessionId
  const model = detail?.model ?? null

  return (
    <div
      className={CSS.modalOverlay}
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className={CSS.modal} role="dialog" aria-modal="true" aria-label={t('detail.title')}>
        <div className={CSS.modalHead}>
          <span className={CSS.modalTitle}>{t('detail.title')}</span>
          <button type="button" className={CSS.modalClose} onClick={onClose}>{t('detail.close')}</button>
        </div>

        <div className={CSS.modalBody}>
          <Row label={t('detail.job')} value={job.id} />
          <Row label={t('detail.model')} value={model} />
          <Row label={t('detail.status')} value={statusLabel(job.status)} />
          <Row label={t('detail.startedAt')} value={formatClock(job.startedAt)} />
          <Row label={t('detail.finishedAt')} value={live ? '-' : formatClock(job.finishedAt)} />
          <Row label={t('detail.duration')} value={formatDuration(elapsed)} />
          <Row
            label={t('detail.cost')}
            value={detail?.costUsd === undefined ? null : `$${detail.costUsd.toFixed(2)}`}
          />
          <Row label={t('detail.turns')} value={detail?.numTurns === undefined ? null : String(detail.numTurns)} />
          <Row label={t('detail.session')} value={sessionId} />
          {detail?.failureDetail === undefined
            ? null
            : <Row label={t('detail.failure')} value={detail.failureDetail} danger />}

          <div className={CSS.modalRow}>
            <span className={CSS.modalKey}>{t('detail.task')}</span>
          </div>
          <pre className={CSS.modalTask}>{detail?.task ?? job.label}</pre>
        </div>

        <div className={CSS.modalFoot}>
          <button
            type="button"
            className={CSS.button}
            disabled={sessionId === undefined || onCopySession === undefined}
            title={t('detail.session.hint')}
            onClick={() => { if (sessionId !== undefined) onCopySession?.(sessionId) }}
          >
            {copyLabel ?? t('action.copySession')}
          </button>
        </div>
      </div>
    </div>
  )
}
