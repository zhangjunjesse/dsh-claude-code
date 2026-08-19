/**
 * Thin client over the plugin's own `claudeCode/*` remote methods.
 *
 * The harness exposes no Client→Host channel for background jobs, so this goes
 * straight at the connection service's generic unary caller. The api-gateway
 * dispatches `/api/<namespace>/<method>` and requires the payload to be exactly
 * `{ args: { … } }`; it answers with `{ ok:true, value }` or `{ ok:false, error }`,
 * which is re-validated here rather than trusted.
 */
import type { ConnectionService, JobInfo, ReadEventsResult, ReadOutputResult } from './types.js';
/** One wire failure, carrying the gateway's error code when it supplied one. */
export declare class ClaudeCodeApiError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** The panel's API surface, bound to one connection service. */
export interface ClaudeCodeApi {
    listJobs(sessionId: string, signal?: AbortSignal): Promise<JobInfo[]>;
    readOutput(sessionId: string, jobId: string, fromOffset: number, signal?: AbortSignal): Promise<ReadOutputResult>;
    readEvents(sessionId: string, jobId: string, fromOffset: number, signal?: AbortSignal): Promise<ReadEventsResult>;
    cancel(sessionId: string, jobId: string): Promise<'requested' | 'already-finished'>;
}
/** Bind the API surface to the client runtime's connection service. */
export declare function createApi(connection: ConnectionService): ClaudeCodeApi;
