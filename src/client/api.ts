/**
 * Thin client over the plugin's own `claudeCode/*` remote methods.
 *
 * The harness exposes no Client→Host channel for background jobs, so this goes
 * straight at the connection service's generic unary caller. The api-gateway
 * dispatches `/api/<namespace>/<method>` and requires the payload to be exactly
 * `{ args: { … } }`; it answers with `{ ok:true, value }` or `{ ok:false, error }`,
 * which is re-validated here rather than trusted.
 */
import type {
  ClaudeEvent,
  ConnectionService,
  JobInfo,
  ReadEventsResult,
  ReadOutputResult,
  RpcResult,
  UsageAdvice,
  UsageLimitView,
  UsageView,
  UsageWindowView,
} from './types.js'

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

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Re-shape one wire event onto the client union, dropping anything unknown.
 *
 * A host that is newer than this bundle may emit event types this renderer has
 * no case for; skipping them keeps the panel rendering the rest instead of
 * throwing on an unexpected payload.
 */
function toEvent(raw: unknown): ClaudeEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const event = raw as Record<string, unknown>
  switch (event['type']) {
    case 'text':
      return { type: 'text', text: text(event['text']) }
    case 'thinking':
      return {
        type: 'thinking',
        thinking: text(event['thinking']),
        ...(typeof event['signature'] === 'string' ? { signature: event['signature'] } : {}),
      }
    case 'tool_use':
      return {
        type: 'tool_use',
        ...(typeof event['id'] === 'string' ? { id: event['id'] } : {}),
        name: text(event['name']) || 'tool',
        input: event['input'],
      }
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: typeof event['tool_use_id'] === 'string' ? event['tool_use_id'] : null,
        content: text(event['content']),
        ...(event['isError'] === true ? { isError: true } : {}),
      }
    case 'result':
      return {
        type: 'result',
        text: text(event['text']),
        ...(typeof event['costUsd'] === 'number' ? { costUsd: event['costUsd'] } : {}),
        ...(typeof event['numTurns'] === 'number' ? { numTurns: event['numTurns'] } : {}),
        ...(typeof event['durationMs'] === 'number' ? { durationMs: event['durationMs'] } : {}),
        ...(event['isError'] === true ? { isError: true } : {}),
      }
    default:
      return null
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** One quota window, or null when the host had no data for it. */
function toWindow(raw: unknown): UsageWindowView | null {
  if (typeof raw !== 'object' || raw === null) return null
  const window = raw as Record<string, unknown>
  return {
    utilizationPercent: numberOrNull(window['utilizationPercent']),
    resetsAt: stringOrNull(window['resetsAt']),
  }
}

const ADVICES: readonly UsageAdvice[] = ['normal', 'caution', 'blocked', 'unknown']

/**
 * Re-shape the `claudeCode/usage` payload onto `UsageView`.
 *
 * The bar must never break the panel, so this is a whitelist: unknown keys are
 * dropped, a malformed field degrades to `null` / `false` / `[]`, and an
 * unrecognised advice value falls back to `unknown`.
 */
function toUsage(raw: unknown): UsageView {
  const snapshot = record(raw)
  const subscription = record(snapshot['subscription'])
  const cache = record(snapshot['cache'])
  const advice = snapshot['advice']
  const limits: UsageLimitView[] = []
  if (Array.isArray(snapshot['limits'])) {
    for (const item of snapshot['limits']) {
      if (typeof item !== 'object' || item === null) continue
      const limit = item as Record<string, unknown>
      limits.push({
        kind: stringOrNull(limit['kind']) ?? 'unknown',
        group: stringOrNull(limit['group']),
        percent: numberOrNull(limit['percent']),
        severity: stringOrNull(limit['severity']),
        resetsAt: stringOrNull(limit['resetsAt']),
        scopeModel: stringOrNull(limit['scopeModel']),
        isActive: limit['isActive'] === true,
      })
    }
  }
  return {
    ok: snapshot['ok'] === true,
    loggedIn: snapshot['loggedIn'] === true,
    error: stringOrNull(snapshot['error']),
    subscription: {
      type: stringOrNull(subscription['type']),
      rateLimitTier: stringOrNull(subscription['rateLimitTier']),
      billingType: stringOrNull(subscription['billingType']),
    },
    fiveHour: toWindow(snapshot['fiveHour']),
    sevenDay: toWindow(snapshot['sevenDay']),
    limits,
    advice: ADVICES.includes(advice as UsageAdvice) ? advice as UsageAdvice : 'unknown',
    cache: {
      fetchedAt: stringOrNull(cache['fetchedAt']),
      ageMinutes: numberOrNull(cache['ageMinutes']),
      maybeStale: cache['maybeStale'] === true,
    },
    warnings: Array.isArray(snapshot['warnings'])
      ? snapshot['warnings'].filter((warning): warning is string => typeof warning === 'string')
      : [],
  }
}

/** The panel's API surface, bound to one connection service. */
export interface ClaudeCodeApi {
  listJobs(sessionId: string, signal?: AbortSignal): Promise<JobInfo[]>
  readOutput(sessionId: string, jobId: string, fromOffset: number, signal?: AbortSignal): Promise<ReadOutputResult>
  readEvents(sessionId: string, jobId: string, fromOffset: number, signal?: AbortSignal): Promise<ReadEventsResult>
  cancel(sessionId: string, jobId: string): Promise<'requested' | 'already-finished'>
  getUsage(sessionId: string, signal?: AbortSignal): Promise<UsageView>
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
    readEvents: async (sessionId, jobId, fromOffset, signal) => {
      const raw = await call<{ events?: unknown, nextOffset?: unknown, truncated?: unknown, status?: unknown }>(
        'readEvents',
        { sessionId, jobId, fromOffset },
        signal,
      )
      const events: ClaudeEvent[] = []
      if (Array.isArray(raw.events)) {
        for (const item of raw.events) {
          const event = toEvent(item)
          if (event !== null) events.push(event)
        }
      }
      return {
        events,
        nextOffset: typeof raw.nextOffset === 'number' ? raw.nextOffset : fromOffset,
        truncated: raw.truncated === true,
        status: (raw.status as ReadEventsResult['status']) ?? 'running',
      }
    },
    cancel: (sessionId, jobId) => call<'requested' | 'already-finished'>('cancel', { sessionId, jobId }),
    getUsage: async (sessionId, signal) => toUsage(await call<unknown>('usage', { sessionId }, signal)),
  }
}
