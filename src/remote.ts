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

/** `ctx.claudeCode` — the monitor panel's own remote service. */
export class ClaudeCodeRemote extends TypertRemoteService {
  private tracker!: JobTracker

  constructor(ctx: Context, tracker: JobTracker) {
    super(ctx, 'claudeCode')
    this.tracker = tracker
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
}
