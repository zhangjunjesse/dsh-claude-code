/**
 * Structural mirrors of the DSH client runtime pieces this bundle touches.
 *
 * A third-party plugin resolves outside the harness monorepo, so upstream's
 * `declare module` augmentations never reach this Context. Everything below
 * restates only the exact runtime shapes used here; drift stays contained to
 * this file. No Node types may appear here — this graph is browser-only.
 */
/** Lifecycle status of one background job (closed wire union). */
export type JobStatus = 'running' | 'stopping' | 'completed' | 'killed' | 'failed';
/** One background job as the harness pushes it in the `session/jobs` frame. */
export interface JobView {
    id: string;
    kind: string;
    label: string;
    status: JobStatus;
    detail?: string;
    startedAt: number;
    finishedAt?: number;
}
/** The client sessions snapshot; a missing `jobsBySession` key means "no jobs". */
export interface SessionListSnapshot {
    jobsBySession?: Readonly<Record<string, readonly JobView[]>>;
}
/** The `useSessions` selector hook injected into every session-scope slot. */
export type UseSessions = <T>(select: (state: SessionListSnapshot) => T) => T;
/** Props the runtime hands a `conversation.view` entry (session scope). */
export interface ViewProps {
    sessionId: string;
    useSessions: UseSessions;
}
/** RPC result envelope produced by the api-gateway. */
export type RpcResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: {
        code?: string;
        message?: string;
    };
};
/** The connection service face: only the generic unary RPC caller is used. */
export interface ConnectionService {
    rpc: {
        call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>;
    };
}
/** Registration options accepted by `ctx.slots.register` (subset). */
export interface SlotRegisterOptions {
    name: string;
    id?: string;
    order?: number;
    label?: string | (() => string);
}
/** The client slots registry face. */
export interface SlotsService {
    register(options: SlotRegisterOptions, component: unknown): () => void;
    /** Runs the callback for each declaration lifetime of a slot. */
    inject(key: string, callback: () => () => void): () => void;
}
/** The client cordis context this bundle needs. */
export interface Context {
    slots: SlotsService;
    connection: ConnectionService;
}
/** One delegation as `claudeCode/listJobs` returns it. */
export interface JobInfo {
    jobId: string;
    label: string;
    task: string;
    status: 'running' | 'completed' | 'failed' | 'killed';
    startedAt: number;
    finishedAt?: number;
    claudeSessionId?: string;
    costUsd?: number;
    numTurns?: number;
    durationMs?: number;
    finalOutput?: string;
    failureDetail?: string;
}
/** One incremental output read from `claudeCode/readOutput`. */
export interface ReadOutputResult {
    text: string;
    nextOffset: number;
    truncated: boolean;
    status: 'running' | 'completed' | 'failed' | 'killed';
}
/**
 * One structured item of a delegation's message stream (host `ClaudeEvent`).
 *
 * The wire is untyped on purpose — the panel re-validates every event in
 * `api.readEvents` rather than trusting the gateway payload.
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
/** One incremental event read from `claudeCode/readEvents`. */
export interface ReadEventsResult {
    events: ClaudeEvent[];
    nextOffset: number;
    truncated: boolean;
    status: 'running' | 'completed' | 'failed' | 'killed';
}
/** Go/no-go signal the host derives from the windows and the limit severities. */
export type UsageAdvice = 'normal' | 'caution' | 'blocked' | 'unknown';
/** One rolling quota window (5h / 7d) as the usage bar renders it. */
export interface UsageWindowView {
    utilizationPercent: number | null;
    resetsAt: string | null;
}
/** One `limits[]` row; a non-null `scopeModel` makes it a per-model limit. */
export interface UsageLimitView {
    kind: string;
    group: string | null;
    percent: number | null;
    severity: string | null;
    resetsAt: string | null;
    scopeModel: string | null;
    isActive: boolean;
}
/**
 * The quota snapshot as `claudeCode/usage` returns it (host `UsageSnapshotWire`).
 *
 * Absence is always `null`, never `undefined` — the gateway refuses to encode
 * `undefined`, and `api.getUsage` re-validates every field anyway.
 */
export interface UsageView {
    ok: boolean;
    loggedIn: boolean;
    error: string | null;
    subscription: {
        type: string | null;
        rateLimitTier: string | null;
        billingType: string | null;
    };
    fiveHour: UsageWindowView | null;
    sevenDay: UsageWindowView | null;
    limits: UsageLimitView[];
    advice: UsageAdvice;
    cache: {
        fetchedAt: string | null;
        ageMinutes: number | null;
        maybeStale: boolean;
    };
    warnings: string[];
}
