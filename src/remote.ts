/**
 * Host→Client RPC surface of the monitor panel.
 *
 * The harness ships no Client→Host channel for background jobs (the official
 * job list is read-only), so the panel talks to this service instead. It is a
 * plain `TypertRemoteService`: the api-gateway discovers `@Remote` methods by
 * reflecting over live services (its SRC mode), which needs no typert codegen.
 * Wire endpoints are `claudeCode/<method>` on the gateway's `/api` channel, and
 * the gateway's `trusted-host` authority already fences them.
 *
 * SRC dispatch derives wire field names from the METHOD PARAMETER NAMES, so
 * every parameter below must stay a plain identifier (no destructuring, no
 * defaults, no rest) and must not collide with a typert lookup parameter
 * (`session`, `agent`) — `sessionId` / `jobId` / `fromOffset` are plain JSON.
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import { toJobInfo, type ClaudeEvent, type JobInfo, type JobTracker, type TrackedStatus } from './tracker.js'
import { readUsageSnapshot, type UsageAdvice, type UsageSnapshot } from './usage.js'

/** One incremental output read as the panel sees it. */
export interface ReadOutputResult {
  text: string
  nextOffset: number
  truncated: boolean
  status: TrackedStatus
}

/** One incremental read of the structured event stream. */
export interface ReadEventsResult {
  events: ClaudeEvent[]
  nextOffset: number
  truncated: boolean
  status: TrackedStatus
}

/** Cancellation outcome (mirrors the jobs seam's own vocabulary). */
export type CancelOutcome = 'requested' | 'already-finished'

/** One rolling usage window on the wire (never `undefined`). */
export interface UsageWindowWire {
  utilizationPercent: number | null
  resetsAt: string | null
}

/** One `limits[]` row on the wire; `scopeModel` carries the per-model limits. */
export interface UsageLimitWire {
  kind: string
  group: string | null
  percent: number | null
  severity: string | null
  resetsAt: string | null
  scopeModel: string | null
  isActive: boolean
}

/** Coarse plan descriptors; nothing here identifies an account. */
export interface UsageSubscriptionWire {
  type: string | null
  rateLimitTier: string | null
  billingType: string | null
}

/** Freshness of the claude CLI's own cache. */
export interface UsageCacheWire {
  fetchedAt: string | null
  ageMinutes: number | null
  maybeStale: boolean
  source: string
}

/**
 * `claudeCode/usage` payload: the quota snapshot reduced to what the panel's
 * usage bar renders. Every key is always present and never `undefined` — the
 * api-gateway rejects an `undefined` value, so absence is spelled `null`. The
 * dollar-spend and extra-usage blocks stay off the wire: no view renders them.
 */
export interface UsageSnapshotWire {
  ok: boolean
  loggedIn: boolean
  error: string | null
  subscription: UsageSubscriptionWire
  fiveHour: UsageWindowWire | null
  sevenDay: UsageWindowWire | null
  limits: UsageLimitWire[]
  advice: UsageAdvice
  cache: UsageCacheWire
  warnings: string[]
}

/**
 * How long one host-side read is reused. `readUsageSnapshot()` is synchronous
 * and shells out to `claude auth status --json`, so an unmemoized call from
 * every open panel would stall the event loop the job list also runs on. The
 * underlying data only changes after a claude turn, so a few seconds of reuse
 * costs the reader nothing while collapsing simultaneous panels into one read.
 */
const USAGE_MEMO_MS = 10_000

/** Project the host snapshot onto the wire, turning every absence into `null`. */
function toUsageWire(snapshot: UsageSnapshot): UsageSnapshotWire {
  return {
    ok: snapshot.ok === true,
    loggedIn: snapshot.loggedIn === true,
    error: snapshot.error ?? null,
    subscription: {
      type: snapshot.subscription?.type ?? null,
      rateLimitTier: snapshot.subscription?.rateLimitTier ?? null,
      billingType: snapshot.subscription?.billingType ?? null,
    },
    fiveHour: snapshot.fiveHour
      ? { utilizationPercent: snapshot.fiveHour.utilizationPercent ?? null, resetsAt: snapshot.fiveHour.resetsAt ?? null }
      : null,
    sevenDay: snapshot.sevenDay
      ? { utilizationPercent: snapshot.sevenDay.utilizationPercent ?? null, resetsAt: snapshot.sevenDay.resetsAt ?? null }
      : null,
    limits: (snapshot.limits ?? []).map((limit) => ({
      kind: limit.kind ?? 'unknown',
      group: limit.group ?? null,
      percent: limit.percent ?? null,
      severity: limit.severity ?? null,
      resetsAt: limit.resetsAt ?? null,
      scopeModel: limit.scopeModel ?? null,
      isActive: limit.isActive === true,
    })),
    advice: snapshot.advice ?? 'unknown',
    cache: {
      fetchedAt: snapshot.cache?.fetchedAt ?? null,
      ageMinutes: snapshot.cache?.ageMinutes ?? null,
      maybeStale: snapshot.cache?.maybeStale === true,
      source: snapshot.cache?.source ?? '',
    },
    warnings: (snapshot.warnings ?? []).filter((warning): warning is string => typeof warning === 'string'),
  }
}

/** The `ok:false` wire shape used when the read itself blew up. */
function failedUsageWire(error: string): UsageSnapshotWire {
  return {
    ok: false,
    loggedIn: false,
    error,
    subscription: { type: null, rateLimitTier: null, billingType: null },
    fiveHour: null,
    sevenDay: null,
    limits: [],
    advice: 'unknown',
    cache: { fetchedAt: null, ageMinutes: null, maybeStale: false, source: '' },
    warnings: [],
  }
}

/** `ctx.claudeCode` — the monitor panel's own remote service. */
export class ClaudeCodeRemote extends TypertRemoteService {
  private tracker!: JobTracker
  private pathToClaudeCodeExecutable?: string
  private usageMemo?: { at: number, wire: UsageSnapshotWire }

  constructor(ctx: Context, tracker: JobTracker, pathToClaudeCodeExecutable?: string) {
    super(ctx, 'claudeCode')
    this.tracker = tracker
    this.pathToClaudeCodeExecutable = pathToClaudeCodeExecutable
  }

  /**
   * Every claude-code delegation owned by one session, with the metadata the
   * jobs mirror does not carry (cost, turns, claude session id, final text).
   */
  @Remote
  async listJobs(sessionId: string): Promise<JobInfo[]> {
    return this.tracker.list(sessionId).map(toJobInfo)
  }

  /**
   * Incremental output from an absolute offset. There is no server-side cursor,
   * so any number of panels (or windows) can read the same job independently.
   */
  @Remote
  async readOutput(sessionId: string, jobId: string, fromOffset: number): Promise<ReadOutputResult> {
    const job = this.tracker.require(sessionId, jobId)
    const offset = Number.isSafeInteger(fromOffset) && fromOffset > 0 ? fromOffset : 0
    const chunk = job.read(offset)
    return {
      text: chunk.text,
      nextOffset: chunk.nextOffset,
      truncated: chunk.truncated,
      status: job.status,
    }
  }

  /**
   * Incremental structured events from an absolute offset — the same run the
   * text stream describes, but block-shaped so the panel can render tool cards,
   * thinking and results natively. Cursor-free like `readOutput`, so reading
   * here never costs the model's `job_output` bytes.
   */
  @Remote
  async readEvents(sessionId: string, jobId: string, fromOffset: number): Promise<ReadEventsResult> {
    const job = this.tracker.require(sessionId, jobId)
    const offset = Number.isSafeInteger(fromOffset) && fromOffset > 0 ? fromOffset : 0
    const chunk = job.readEvents(offset)
    return {
      events: chunk.events,
      nextOffset: chunk.nextOffset,
      truncated: chunk.truncated,
      status: job.status,
    }
  }

  /**
   * Cancel from the UI. This goes through the plugin's own AbortController, so
   * the job still settles as `killed` and the model still gets its completion
   * notification (which `ctx.jobs.kill()` would have swallowed).
   */
  @Remote
  async cancel(sessionId: string, jobId: string): Promise<CancelOutcome> {
    const job = this.tracker.require(sessionId, jobId)
    return job.cancelFromUi() ? 'requested' : 'already-finished'
  }

  /**
   * The local subscription's quota, for the panel's usage bar. This reads the
   * claude CLI's own cache only (`readUsageSnapshot`); no refresh is triggered,
   * since an active refresh would burn real quota — the UI's refresh button
   * just re-reads that cache.
   *
   * Nothing here is per-job, so the session is only checked for shape: the
   * quota belongs to the machine's claude login, not to one delegation, and
   * the gateway's `trusted-host` authority already fences the endpoint.
   *
   * Never throws: a failure comes back as `ok:false` + `error` so the bar can
   * degrade to a retryable message instead of breaking the panel.
   */
  @Remote
  async usage(sessionId: string): Promise<UsageSnapshotWire> {
    if (typeof sessionId !== 'string' || sessionId === '') {
      return failedUsageWire('missing sessionId')
    }
    const memo = this.usageMemo
    if (memo !== undefined && Date.now() - memo.at < USAGE_MEMO_MS) return memo.wire
    try {
      const wire = toUsageWire(readUsageSnapshot({
        ...(this.pathToClaudeCodeExecutable !== undefined
          ? { pathToClaudeCodeExecutable: this.pathToClaudeCodeExecutable }
          : {}),
      }))
      this.usageMemo = { at: Date.now(), wire }
      return wire
    } catch (error) {
      return failedUsageWire(error instanceof Error ? error.message : String(error))
    }
  }
}
