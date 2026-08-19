/**
 * Formatters shared by the tab strip and the job-detail modal.
 *
 * They live outside both components on purpose: the modal renders the same
 * duration/status vocabulary the tabs do, and importing them back from
 * `ClaudeCodeView` would close an import cycle (the view renders the modal).
 */
import { t, type LocaleKey } from './locales.js'
import type { JobStatus } from './types.js'

/** Elapsed time in at most two adjacent units (`3m 20s`, `1h 4m`, `12s`). */
export function formatDuration(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3600)
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/** `12:50:07` today, `8/25 21:00:07` on any other day; `-` when unusable. */
export function formatClock(at: number | undefined): string {
  if (at === undefined || !Number.isFinite(at)) return '-'
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (value: number) => String(value).padStart(2, '0')
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay ? time : `${date.getMonth() + 1}/${date.getDate()} ${time}`
}

/** Localised status word; `stopping` reads as "cancelled" like the jobs seam. */
export function statusLabel(status: JobStatus): string {
  const key: LocaleKey = status === 'completed'
    ? 'status.completed'
    : status === 'failed'
      ? 'status.failed'
      : status === 'running'
        ? 'status.running'
        : 'status.killed'
  return t(key)
}
