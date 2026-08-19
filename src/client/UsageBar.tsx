/**
 * The panel's subscription-usage bar, pinned above the delegation list.
 *
 * It renders exactly what the host's `claudeCode/usage` returns — the claude
 * CLI's own cached quota — as two progress bars (5-hour and 7-day rolling
 * windows), a chip per per-model limit (`Fable 0%`), and a go/no-go badge. No
 * refresh is ever triggered on the account: the button re-reads the same local
 * cache, which the CLI refreshes on its own after every claude turn.
 *
 * Presentation and fetching are split on purpose: `UsageBar` is a pure function
 * of its props (so it can be rendered and asserted headlessly), while
 * `useUsage` owns the one-shot read, the low-frequency poll and its teardown.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ClaudeCodeApi } from './api.js'
import type { UsageAdvice, UsageView, UsageWindowView } from './types.js'
import { CSS } from './styles.js'
import { t, tf, type LocaleKey } from './locales.js'

/** Auto-refresh period. The data only moves after a claude turn, so this is slow. */
const USAGE_POLL_MS = 300_000

/** Utilization at or above this paints the bar red. */
const DANGER_PERCENT = 80
/** Utilization at or above this paints the bar amber. */
const WARN_PERCENT = 50

export interface UsageBarProps {
  /** The last successful read, or null before the first one lands. */
  usage: UsageView | null
  /** True while a read is in flight (the button shows it and self-disables). */
  loading: boolean
  /** Transport-level failure; the payload's own `error` lives on `usage`. */
  error: string | null
  onRefresh: () => void
}

/** Clamp one utilization onto the 0–100 the bar can draw. */
function clampPercent(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function fillClass(percent: number): string {
  if (percent >= DANGER_PERCENT) return `${CSS.usageFill} ${CSS.usageFillDanger}`
  if (percent >= WARN_PERCENT) return `${CSS.usageFill} ${CSS.usageFillWarn}`
  return CSS.usageFill
}

const BADGE_CLASS: Record<UsageAdvice, string> = {
  normal: `${CSS.usageBadge} ${CSS.usageBadgeNormal}`,
  caution: `${CSS.usageBadge} ${CSS.usageBadgeCaution}`,
  blocked: `${CSS.usageBadge} ${CSS.usageBadgeBlocked}`,
  unknown: `${CSS.usageBadge} ${CSS.usageBadgeUnknown}`,
}

const BADGE_KEY: Record<UsageAdvice, LocaleKey> = {
  normal: 'usage.advice.normal',
  caution: 'usage.advice.caution',
  blocked: 'usage.advice.blocked',
  unknown: 'usage.advice.unknown',
}

const ADVICE_KEY: Record<UsageAdvice, LocaleKey> = {
  normal: 'usage.adviceText.normal',
  caution: 'usage.adviceText.caution',
  blocked: 'usage.adviceText.blocked',
  unknown: 'usage.adviceText.unknown',
}

/** `12:50` today, `8/25 21:00` on any other day; null when unparseable. */
function formatReset(iso: string | null): string | null {
  if (iso === null) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const pad = (value: number) => String(value).padStart(2, '0')
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  const sameDay = at.toDateString() === new Date().toDateString()
  return sameDay ? time : `${at.getMonth() + 1}/${at.getDate()} ${time}`
}

/** `max` → `Claude Max`; an unknown plan degrades to the generic label. */
function formatPlan(type: string | null): string {
  if (type === null) return t('usage.plan.unknown')
  return `Claude ${type.charAt(0).toUpperCase()}${type.slice(1)}`
}

/** `default_max_20x` → `20x`; anything else is shown as-is, underscores spaced. */
function formatTier(tier: string | null): string | null {
  if (tier === null) return null
  const match = /(\d+)\s*x/i.exec(tier)
  return match ? `${match[1]}x` : tier.replace(/_/g, ' ')
}

/** `缓存于 2 分钟前`, flagged when the host considers the cache stale. */
function cacheLabel(usage: UsageView): string {
  const age = usage.cache.ageMinutes
  if (age === null) return t('usage.cachedUnknown')
  return tf(usage.cache.maybeStale ? 'usage.cachedStale' : 'usage.cached', age)
}

/** One window row: label, progress track, `2% · 约 12:50 重置`. */
function WindowRow({ label, window, soon }: { label: string, window: UsageWindowView, soon: boolean }) {
  const percent = clampPercent(window.utilizationPercent)
  const reset = formatReset(window.resetsAt)
  const shown = window.utilizationPercent === null ? '—' : `${Math.round(percent)}%`
  return (
    <div className={CSS.usageRow}>
      <span className={CSS.usageRowLabel}>{label}</span>
      <span
        className={CSS.usageTrack}
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={fillClass(percent)} style={{ width: `${percent}%` }} />
      </span>
      <span className={CSS.usageRowMeta}>
        {shown}
        {reset === null ? '' : ` · ${tf(soon ? 'usage.resetSoon' : 'usage.reset', reset)}`}
      </span>
    </div>
  )
}

/**
 * The usage bar itself. Three degraded states are first-class: still loading,
 * signed out (the numbers would be a previous login's), and a failed read that
 * the reader can retry.
 */
export function UsageBar({ usage, loading, error, onRefresh }: UsageBarProps) {
  const refresh = (
    <button
      type="button"
      className={CSS.usageRefresh}
      disabled={loading}
      onClick={onRefresh}
      title={t('usage.refresh')}
    >
      {loading ? t('usage.refreshing') : t('usage.refresh')}
    </button>
  )

  // A transport failure, or a host that answered `ok:false`: show why, offer a retry.
  const failure = error ?? (usage !== null && !usage.ok ? usage.error ?? t('error.prefix') : null)
  if (failure !== null) {
    return (
      <div className={CSS.usage} role="status" aria-label={t('usage.title')}>
        <div className={CSS.usageHead}>
          <span className={CSS.usageError}>{tf('usage.failed', failure)}</span>
          <span className={CSS.usageSpacer} />
          <button type="button" className={CSS.usageRefresh} disabled={loading} onClick={onRefresh}>
            {loading ? t('usage.refreshing') : t('usage.retry')}
          </button>
        </div>
      </div>
    )
  }

  if (usage === null) {
    return (
      <div className={CSS.usage} role="status" aria-label={t('usage.title')}>
        <div className={CSS.usageHead}>
          <span className={CSS.usageNote}>{t('usage.loading')}</span>
          <span className={CSS.usageSpacer} />
          {refresh}
        </div>
      </div>
    )
  }

  const tier = formatTier(usage.subscription.rateLimitTier)
  const scoped = usage.limits.filter((limit) => limit.kind === 'weekly_scoped' && limit.scopeModel !== null)
  const hasWindows = usage.fiveHour !== null || usage.sevenDay !== null

  return (
    <div className={CSS.usage} role="status" aria-label={t('usage.title')}>
      <div className={CSS.usageHead}>
        <span className={CSS.usagePlan}>{formatPlan(usage.subscription.type)}</span>
        {tier === null ? null : <span className={CSS.usageTier}>· {tier}</span>}
        <span className={usage.cache.maybeStale ? `${CSS.usageCache} ${CSS.usageStale}` : CSS.usageCache}>
          {cacheLabel(usage)}
        </span>
        <span className={CSS.usageSpacer} />
        <span className={BADGE_CLASS[usage.advice]}>{t(BADGE_KEY[usage.advice])}</span>
        <span className={CSS.usageAdvice}>{t(ADVICE_KEY[usage.advice])}</span>
        {refresh}
      </div>

      {usage.loggedIn ? null : <div className={CSS.usageNote}>{t('usage.loggedOut')}</div>}

      {hasWindows ? (
        <div className={CSS.usageBars}>
          {usage.fiveHour === null ? null : (
            <WindowRow label={t('usage.fiveHour')} window={usage.fiveHour} soon />
          )}
          {usage.sevenDay === null ? null : (
            <WindowRow label={t('usage.sevenDay')} window={usage.sevenDay} soon={false} />
          )}
        </div>
      ) : (
        <div className={CSS.usageNote}>{t('usage.noData')}</div>
      )}

      {scoped.length === 0 ? null : (
        <div className={CSS.usageChips}>
          <span className={CSS.usageChipsLabel}>{t('usage.scoped')}</span>
          {scoped.map((limit) => (
            <span key={`${limit.kind}:${limit.scopeModel}`} className={CSS.usageChip}>
              {limit.scopeModel} {Math.round(clampPercent(limit.percent))}%
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** What {@link useUsage} hands the bar. */
export interface UsageState {
  usage: UsageView | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Read the quota once on mount, then every {@link USAGE_POLL_MS}. The read is
 * aborted and the timer cleared on unmount (the harness unmounts this view on
 * every tab switch), and a manual refresh restarts both.
 */
export function useUsage(api: ClaudeCodeApi, sessionId: string): UsageState {
  const [usage, setUsage] = useState<UsageView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const abort = new AbortController()
    const pull = () => {
      setLoading(true)
      api.getUsage(sessionId, abort.signal).then(
        (value) => {
          if (abort.signal.aborted) return
          setUsage(value)
          setError(null)
          setLoading(false)
        },
        (failure: unknown) => {
          if (abort.signal.aborted) return
          setError(failure instanceof Error ? failure.message : String(failure))
          setLoading(false)
        },
      )
    }
    pull()
    const timer = setInterval(pull, USAGE_POLL_MS)
    return () => {
      abort.abort()
      clearInterval(timer)
    }
  }, [sessionId, nonce])

  const refresh = useCallback(() => { setNonce((value) => value + 1) }, [])
  return { usage, loading, error, refresh }
}
