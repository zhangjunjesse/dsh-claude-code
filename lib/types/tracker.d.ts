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
