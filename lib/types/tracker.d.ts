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
export type TrackedStatus = 'running' | 'completed' | 'failed' | 'killed';
/** One absolute-offset read of a job's live output. */
export interface TrackedRead {
    /** The text between the requested offset and the buffer's end. */
    text: string;
    /** Absolute offset to pass on the next read. */
    nextOffset: number;
    /** True when the requested offset had already been dropped by the cap. */
    truncated: boolean;
}
/**
 * One structured item of a delegation's message stream, as the monitor panel
 * renders it. This is a second, independent view of the same run: the text
 * stream (`TrackedRead`) stays exactly as the model's `job_output` sees it,
 * while these events carry the block structure the UI needs (tool parameters,
 * tool results, thinking) — every field plain JSON, no undefined keys.
 */
export type ClaudeEvent = {
    type: 'text';
    text: string;
} | {
    type: 'thinking';
    thinking: string;
    signature?: string;
} | {
    type: 'tool_use';
    id?: string;
    name: string;
    input: unknown;
} | {
    type: 'tool_result';
    tool_use_id: string | null;
    content: string;
    isError?: boolean;
} | {
    type: 'result';
    text: string;
    costUsd?: number;
    numTurns?: number;
    durationMs?: number;
    isError?: boolean;
} | {
    type: 'warning';
    text: string;
};
/** One absolute-offset read of a job's event stream. */
export interface TrackedEventRead {
    /** The events between the requested offset and the buffer's end. */
    events: ClaudeEvent[];
    /** Absolute offset to pass on the next read. */
    nextOffset: number;
    /** True when the requested offset had already been dropped by the cap. */
    truncated: boolean;
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
    append(event: ClaudeEvent): void;
    /** Absolute-offset read; leaves the buffer intact. */
    read(fromOffset: number): TrackedEventRead;
    /** Absolute offset just past the newest event. */
    size(): number;
}
/** Create an empty event buffer (one per background delegation). */
export declare function createEventBuffer(): EventBuffer;
/** Settlement metadata filled in when a delegation finishes. */
export interface TrackedSettlement {
    status: Exclude<TrackedStatus, 'running'>;
    claudeSessionId?: string;
    costUsd?: number;
    numTurns?: number;
    durationMs?: number;
    finalOutput?: string;
    failureDetail?: string;
}
/** One tracked delegation. */
export interface TrackedJob {
    jobId: string;
    /** `exec.agent.id` — the session that owns the job (owner isolation). */
    ownerSessionId?: string;
    /** Complete task text as handed to Claude Code. */
    task: string;
    /** One-line label, identical to the one the jobs seam shows. */
    label: string;
    status: TrackedStatus;
    startedAt: number;
    finishedAt?: number;
    /** Absolute-offset read of the live buffer; never touches the model's cursor. */
    read(fromOffset: number): TrackedRead;
    /** Structured event stream of the same run, for the panel's native rendering. */
    events: EventBuffer;
    /** Absolute-offset read of the event stream; the cursor lives on the caller. */
    readEvents(fromOffset: number): TrackedEventRead;
    /** Cancel through the plugin's own abort path; false when already settled. */
    cancelFromUi(): boolean;
    claudeSessionId?: string;
    costUsd?: number;
    numTurns?: number;
    durationMs?: number;
    finalOutput?: string;
    failureDetail?: string;
}
/** Everything the caller supplies at registration time. */
export interface TrackedRegistration {
    jobId: string;
    ownerSessionId?: string;
    task: string;
    label: string;
    read(fromOffset: number): TrackedRead;
    /** The job's own event buffer; a fresh one is created when omitted. */
    events?: EventBuffer;
    cancelFromUi(): boolean;
}
/** Wire shape returned by `claudeCode/listJobs` (JSON-safe, no undefined keys). */
export interface JobInfo {
    jobId: string;
    label: string;
    task: string;
    status: TrackedStatus;
    startedAt: number;
    finishedAt?: number;
    claudeSessionId?: string;
    costUsd?: number;
    numTurns?: number;
    durationMs?: number;
    finalOutput?: string;
    failureDetail?: string;
}
/** Project one tracked job onto the wire shape, omitting absent fields. */
export declare function toJobInfo(job: TrackedJob): JobInfo;
/** Process-local registry of this plugin's background delegations. */
export declare class JobTracker {
    private readonly jobs;
    /** Register a job the moment the jobs seam hands back its id. */
    register(registration: TrackedRegistration): TrackedJob;
    /** Fill in the outcome once the delegation finished, then prune old rows. */
    settle(jobId: string, settlement: TrackedSettlement): void;
    /** One tracked job, or undefined when unknown / already pruned. */
    get(jobId: string): TrackedJob | undefined;
    /**
     * Resolve a job for one session, refusing foreign rows. Same strength as the
     * jobs seam's own owner check (`owner.id` equality).
     */
    require(sessionId: string, jobId: string): TrackedJob;
    /** Every job owned by one session, newest activity first. */
    list(sessionId: string): TrackedJob[];
    /** Keep only the most recent settled jobs of one session. */
    private prune;
}
