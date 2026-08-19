/**
 * Plugin-owned mirror of the background delegations this plugin produced.
 *
 * The host jobs seam is deliberately left alone: `ctx.jobs.read()` has a single
 * cursor shared with the model's `job_output` tool, and `ctx.jobs.kill()` marks
 * a job reported so the model never learns it was cancelled. The monitor panel
 * therefore reads output from this mirror (absolute offsets, many consumers)
 * and cancels through the plugin's own AbortController, letting the job settle
 * normally so the model still gets its completion notification.
 *
 * The mirror is process-local and not persisted: a DSH restart empties it.
 */

/** Terminal-or-live state of one tracked delegation (mirrors the jobs seam). */
export type TrackedStatus = 'running' | 'completed' | 'failed' | 'killed'

/** One absolute-offset read of a job's live output. */
export interface TrackedRead {
  /** The text between the requested offset and the buffer's end. */
  text: string
  /** Absolute offset to pass on the next read. */
  nextOffset: number
  /** True when the requested offset had already been dropped by the cap. */
  truncated: boolean
}

/**
 * One structured item of a delegation's message stream, as the monitor panel
 * renders it. This is a second, independent view of the same run: the text
 * stream (`TrackedRead`) stays exactly as the model's `job_output` sees it,
 * while these events carry the block structure the UI needs (tool parameters,
 * tool results, thinking) — every field plain JSON, no undefined keys.
 */
export type ClaudeEvent =
  | { type: 'text', text: string }
  | { type: 'thinking', thinking: string, signature?: string }
  | { type: 'tool_use', id?: string, name: string, input: unknown }
  | { type: 'tool_result', tool_use_id: string | null, content: string, isError?: boolean }
  | { type: 'result', text: string, costUsd?: number, numTurns?: number, durationMs?: number, isError?: boolean }
  | { type: 'warning', text: string }

/** One absolute-offset read of a job's event stream. */
export interface TrackedEventRead {
  /** The events between the requested offset and the buffer's end. */
  events: ClaudeEvent[]
  /** Absolute offset to pass on the next read. */
  nextOffset: number
  /** True when the requested offset had already been dropped by the cap. */
  truncated: boolean
}

/** Ring cap on the per-job event buffer (oldest events drop first). */
const MAX_EVENT_LINES = 2000

/** Byte budget of one job's event ring, aligned with the text buffer's intent. */
const MAX_EVENT_CHARS = 2_000_000

/** Hard cap on a single event line, so one huge block cannot evict the ring. */
const MAX_EVENT_LINE = 64_000

/** Cut one oversized payload in half of the line budget, marking the cut. */
function cut(text: string): string {
  const limit = Math.floor(MAX_EVENT_LINE / 2)
  return text.length > limit ? `${text.slice(0, limit)}…[truncated]` : text
}

/**
 * Shrink an event whose encoded form blew the per-line cap. Payload fields lose
 * their tail (a tool input collapses to its truncated JSON text, which the panel
 * renders as-is); the event's identity and metadata always survive.
 */
function shrink(event: ClaudeEvent): ClaudeEvent {
  switch (event.type) {
    case 'text': return { type: 'text', text: cut(event.text) }
    case 'thinking': return { ...event, thinking: cut(event.thinking) }
    case 'tool_use': {
      let encoded: string
      try {
        encoded = JSON.stringify(event.input) ?? String(event.input)
      } catch {
        encoded = String(event.input)
      }
      return { ...event, input: cut(encoded) }
    }
    case 'tool_result': return { ...event, content: cut(event.content) }
    case 'result': return { ...event, text: cut(event.text) }
    case 'warning': return { ...event, text: cut(event.text) }
  }
}

/**
 * Append-only ring of structured events addressed by ABSOLUTE index.
 *
 * Events are held as JSON lines so a stored event can never alias a live SDK
 * object and every read hands out a fresh, JSON-safe copy. Reads take an
 * absolute offset and move no cursor, so the panel, a second window and the
 * settlement backfill can all follow the same job independently.
 */
export interface EventBuffer {
  /** Append one event; silently degrades a non-serializable event to text. */
  append(event: ClaudeEvent): void
  /** Absolute-offset read; leaves the buffer intact. */
  read(fromOffset: number): TrackedEventRead
  /** Absolute offset just past the newest event. */
  size(): number
}

/** Create an empty event buffer (one per background delegation). */
export function createEventBuffer(): EventBuffer {
  /** JSON lines; `base` is the absolute index of `lines[0]`. */
  const lines: string[] = []
  let base = 0
  let chars = 0

  /** Drop from the head until both the line and the byte budget hold. */
  const evict = () => {
    let dropped = 0
    while (lines.length - dropped > MAX_EVENT_LINES || (chars > MAX_EVENT_CHARS && lines.length - dropped > 1)) {
      chars -= lines[dropped]?.length ?? 0
      dropped += 1
    }
    if (dropped === 0) return
    lines.splice(0, dropped)
    base += dropped
  }

  return {
    append(event: ClaudeEvent) {
      let line: string | undefined
      try {
        line = JSON.stringify(event)
        if (typeof line === 'string' && line.length > MAX_EVENT_LINE) line = JSON.stringify(shrink(event))
      } catch {
        // Circular or otherwise unencodable payload: keep the event's identity
        // by re-encoding it through the same shrink path.
        try {
          line = JSON.stringify(shrink(event))
        } catch {
          line = JSON.stringify({ type: 'text', text: cut(String(event)) })
        }
      }
      // JSON.stringify returns undefined for values it refuses to encode.
      if (typeof line !== 'string') return
      lines.push(line)
      chars += line.length
      evict()
    },
    read(fromOffset: number) {
      const end = base + lines.length
      const requested = Math.max(0, Math.min(Number.isSafeInteger(fromOffset) ? fromOffset : 0, end))
      const truncated = requested < base
      const start = truncated ? base : requested
      const events: ClaudeEvent[] = []
      for (const line of lines.slice(start - base)) {
        try {
          events.push(JSON.parse(line) as ClaudeEvent)
        } catch {
          // Unreachable for lines this buffer wrote; drop rather than throw.
        }
      }
      return { events, nextOffset: end, truncated }
    },
    size() {
      return base + lines.length
    },
  }
}

/** Settlement metadata filled in when a delegation finishes. */
export interface TrackedSettlement {
  status: Exclude<TrackedStatus, 'running'>
  claudeSessionId?: string
  costUsd?: number
  numTurns?: number
  durationMs?: number
  finalOutput?: string
  failureDetail?: string
}

/** One tracked delegation. */
export interface TrackedJob {
  jobId: string
  /** `exec.agent.id` — the session that owns the job (owner isolation). */
  ownerSessionId?: string
  /** Complete task text as handed to Claude Code. */
  task: string
  /** One-line label, identical to the one the jobs seam shows. */
  label: string
  /** Claude model alias/id the run was started with (panel detail only). */
  model?: string
  status: TrackedStatus
  startedAt: number
  finishedAt?: number
  /** Absolute-offset read of the live buffer; never touches the model's cursor. */
  read(fromOffset: number): TrackedRead
  /** Structured event stream of the same run, for the panel's native rendering. */
  events: EventBuffer
  /** Absolute-offset read of the event stream; the cursor lives on the caller. */
  readEvents(fromOffset: number): TrackedEventRead
  /** Cancel through the plugin's own abort path; false when already settled. */
  cancelFromUi(): boolean
  claudeSessionId?: string
  costUsd?: number
  numTurns?: number
  durationMs?: number
  finalOutput?: string
  failureDetail?: string
}

/** Everything the caller supplies at registration time. */
export interface TrackedRegistration {
  jobId: string
  ownerSessionId?: string
  task: string
  label: string
  /** The resolved `req.model` of this run; absent when the caller had none. */
  model?: string
  read(fromOffset: number): TrackedRead
  /** The job's own event buffer; a fresh one is created when omitted. */
  events?: EventBuffer
  cancelFromUi(): boolean
}

/** Wire shape returned by `claudeCode/listJobs` (JSON-safe, no undefined keys). */
export interface JobInfo {
  jobId: string
  label: string
  task: string
  /** Claude model alias/id, when the run recorded one. */
  model?: string
  status: TrackedStatus
  startedAt: number
  finishedAt?: number
  claudeSessionId?: string
  costUsd?: number
  numTurns?: number
  durationMs?: number
  finalOutput?: string
  failureDetail?: string
}

/** Settled jobs kept per session; older ones are dropped on settlement. */
const SETTLED_RETENTION = 20

/** Project one tracked job onto the wire shape, omitting absent fields. */
export function toJobInfo(job: TrackedJob): JobInfo {
  return {
    jobId: job.jobId,
    label: job.label,
    task: job.task,
    status: job.status,
    startedAt: job.startedAt,
    ...(job.model !== undefined ? { model: job.model } : {}),
    ...(job.finishedAt !== undefined ? { finishedAt: job.finishedAt } : {}),
    ...(job.claudeSessionId !== undefined ? { claudeSessionId: job.claudeSessionId } : {}),
    ...(job.costUsd !== undefined ? { costUsd: job.costUsd } : {}),
    ...(job.numTurns !== undefined ? { numTurns: job.numTurns } : {}),
    ...(job.durationMs !== undefined ? { durationMs: job.durationMs } : {}),
    ...(job.finalOutput !== undefined ? { finalOutput: job.finalOutput } : {}),
    ...(job.failureDetail !== undefined ? { failureDetail: job.failureDetail } : {}),
  }
}

/** Process-local registry of this plugin's background delegations. */
export class JobTracker {
  private readonly jobs = new Map<string, TrackedJob>()

  /** Register a job the moment the jobs seam hands back its id. */
  register(registration: TrackedRegistration): TrackedJob {
    const events = registration.events ?? createEventBuffer()
    const job: TrackedJob = {
      jobId: registration.jobId,
      ...(registration.ownerSessionId !== undefined ? { ownerSessionId: registration.ownerSessionId } : {}),
      task: registration.task,
      label: registration.label,
      ...(registration.model !== undefined ? { model: registration.model } : {}),
      status: 'running',
      startedAt: Date.now(),
      read: registration.read,
      events,
      readEvents: (fromOffset: number) => events.read(fromOffset),
      cancelFromUi: registration.cancelFromUi,
    }
    this.jobs.set(job.jobId, job)
    return job
  }

  /** Fill in the outcome once the delegation finished, then prune old rows. */
  settle(jobId: string, settlement: TrackedSettlement): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.status = settlement.status
    job.finishedAt = Date.now()
    if (settlement.claudeSessionId) job.claudeSessionId = settlement.claudeSessionId
    if (typeof settlement.costUsd === 'number') job.costUsd = settlement.costUsd
    if (typeof settlement.numTurns === 'number') job.numTurns = settlement.numTurns
    if (typeof settlement.durationMs === 'number') job.durationMs = settlement.durationMs
    if (settlement.finalOutput !== undefined) job.finalOutput = settlement.finalOutput
    if (settlement.failureDetail !== undefined) job.failureDetail = settlement.failureDetail
    this.prune(job.ownerSessionId)
  }

  /** One tracked job, or undefined when unknown / already pruned. */
  get(jobId: string): TrackedJob | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * Resolve a job for one session, refusing foreign rows. Same strength as the
   * jobs seam's own owner check (`owner.id` equality).
   */
  require(sessionId: string, jobId: string): TrackedJob {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`unknown claude-code job: ${jobId}`)
    if (job.ownerSessionId !== sessionId) throw new Error(`job ${jobId} does not belong to this session`)
    return job
  }

  /** Every job owned by one session, newest activity first. */
  list(sessionId: string): TrackedJob[] {
    const rows: TrackedJob[] = []
    for (const job of this.jobs.values()) {
      if (job.ownerSessionId === sessionId) rows.push(job)
    }
    return rows.sort((left, right) => right.startedAt - left.startedAt)
  }

  /** Keep only the most recent settled jobs of one session. */
  private prune(sessionId?: string): void {
    if (sessionId === undefined) return
    const settled = this.list(sessionId).filter((job) => job.status !== 'running')
    for (const job of settled.slice(SETTLED_RETENTION)) this.jobs.delete(job.jobId)
  }
}
