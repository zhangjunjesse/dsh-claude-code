/**
 * Thin client over the plugin's own `claudeCode/*` remote methods.
 *
 * The harness exposes no Client→Host channel for background jobs, so this goes
 * straight at the connection service's generic unary caller. The api-gateway
 * dispatches `/api/<namespace>/<method>` and requires the payload to be exactly
 * `{ args: { … } }`; it answers with `{ ok:true, value }` or `{ ok:false, error }`,
 * which is re-validated here rather than trusted.
 */
import type { ConnectionService, JobInfo, ReadOutputResult, RpcResult } from './types.js'

/** One wire failure, carrying the gateway's error code when it supplied one. */
export class ClaudeCodeApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'ClaudeCodeApiError'
  }
}

function isResult(value: unknown): value is RpcResult<unknown> {
  return typeof value === 'object' && value !== null && 'ok' in value
}

/** The panel's API surface, bound to one connection service. */
export interface ClaudeCodeApi {
  listJobs(sessionId: string, signal?: AbortSignal): Promise<JobInfo[]>
  readOutput(sessionId: string, jobId: string, fromOffset: number, signal?: AbortSignal): Promise<ReadOutputResult>
  cancel(sessionId: string, jobId: string): Promise<'requested' | 'already-finished'>
}

/** Bind the API surface to the client runtime's connection service. */
export function createApi(connection: ConnectionService): ClaudeCodeApi {
  async function call<T>(method: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    let raw: unknown
    try {
      raw = await connection.rpc.call('/api', `claudeCode/${method}`, { args }, signal)
    } catch (error) {
      throw new ClaudeCodeApiError('network', error instanceof Error ? error.message : String(error))
    }
    if (!isResult(raw)) throw new ClaudeCodeApiError('protocol', `malformed response for claudeCode/${method}`)
    if (!raw.ok) throw new ClaudeCodeApiError(raw.error?.code ?? 'internal', raw.error?.message ?? `claudeCode/${method} failed`)
    return raw.value as T
  }

  return {
    listJobs: (sessionId, signal) => call<JobInfo[]>('listJobs', { sessionId }, signal),
    readOutput: (sessionId, jobId, fromOffset, signal) =>
      call<ReadOutputResult>('readOutput', { sessionId, jobId, fromOffset }, signal),
    cancel: (sessionId, jobId) => call<'requested' | 'already-finished'>('cancel', { sessionId, jobId }),
  }
}
