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
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Context } from '@deepseek-ai/cordis';
import { type ClaudeEvent, type JobInfo, type JobTracker, type TrackedStatus } from './tracker.js';
import { type UsageAdvice } from './usage.js';
/**
 * `claudeCode/listJobs` row. Identical to the tracker's {@link JobInfo} except
 * for `model`, which is always present: the api-gateway refuses to encode an
 * `undefined` value, so a run with no recorded model spells it `null`.
 */
export interface JobInfoWire extends Omit<JobInfo, 'model'> {
    model: string | null;
}
/** One incremental output read as the panel sees it. */
export interface ReadOutputResult {
    text: string;
    nextOffset: number;
    truncated: boolean;
    status: TrackedStatus;
}
/** One incremental read of the structured event stream. */
export interface ReadEventsResult {
    events: ClaudeEvent[];
    nextOffset: number;
    truncated: boolean;
    status: TrackedStatus;
}
/** Cancellation outcome (mirrors the jobs seam's own vocabulary). */
export type CancelOutcome = 'requested' | 'already-finished';
/** One rolling usage window on the wire (never `undefined`). */
export interface UsageWindowWire {
    utilizationPercent: number | null;
    resetsAt: string | null;
}
/** One `limits[]` row on the wire; `scopeModel` carries the per-model limits. */
export interface UsageLimitWire {
    kind: string;
    group: string | null;
    percent: number | null;
    severity: string | null;
    resetsAt: string | null;
    scopeModel: string | null;
    isActive: boolean;
}
/** Coarse plan descriptors; nothing here identifies an account. */
export interface UsageSubscriptionWire {
    type: string | null;
    rateLimitTier: string | null;
    billingType: string | null;
}
/** Freshness of the claude CLI's own cache. */
export interface UsageCacheWire {
    fetchedAt: string | null;
    ageMinutes: number | null;
    maybeStale: boolean;
    source: string;
}
/**
 * `claudeCode/usage` payload: the quota snapshot reduced to what the panel's
 * usage bar renders. Every key is always present and never `undefined` — the
 * api-gateway rejects an `undefined` value, so absence is spelled `null`. The
 * dollar-spend and extra-usage blocks stay off the wire: no view renders them.
 */
export interface UsageSnapshotWire {
    ok: boolean;
    loggedIn: boolean;
    error: string | null;
    subscription: UsageSubscriptionWire;
    fiveHour: UsageWindowWire | null;
    sevenDay: UsageWindowWire | null;
    limits: UsageLimitWire[];
    advice: UsageAdvice;
    cache: UsageCacheWire;
    warnings: string[];
}
/** `ctx.claudeCode` — the monitor panel's own remote service. */
export declare class ClaudeCodeRemote extends TypertRemoteService {
    private tracker;
    private pathToClaudeCodeExecutable?;
    private usageMemo?;
    constructor(ctx: Context, tracker: JobTracker, pathToClaudeCodeExecutable?: string);
    /**
     * Every claude-code delegation owned by one session, with the metadata the
     * jobs mirror does not carry (cost, turns, claude session id, final text).
     */
    listJobs(sessionId: string): Promise<JobInfoWire[]>;
    /**
     * Incremental output from an absolute offset. There is no server-side cursor,
     * so any number of panels (or windows) can read the same job independently.
     */
    readOutput(sessionId: string, jobId: string, fromOffset: number): Promise<ReadOutputResult>;
    /**
     * Incremental structured events from an absolute offset — the same run the
     * text stream describes, but block-shaped so the panel can render tool cards,
     * thinking and results natively. Cursor-free like `readOutput`, so reading
     * here never costs the model's `job_output` bytes.
     */
    readEvents(sessionId: string, jobId: string, fromOffset: number): Promise<ReadEventsResult>;
    /**
     * Cancel from the UI. This goes through the plugin's own AbortController, so
     * the job still settles as `killed` and the model still gets its completion
     * notification (which `ctx.jobs.kill()` would have swallowed).
     */
    cancel(sessionId: string, jobId: string): Promise<CancelOutcome>;
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
    usage(sessionId: string): Promise<UsageSnapshotWire>;
}
