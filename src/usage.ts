/**
 * Read the local Claude subscription usage snapshot.
 *
 * Source of truth is the `cachedUsageUtilization` block the `claude` CLI keeps
 * in `~/.claude.json`; `claude auth status --json` only fills in the login
 * state and the subscription type. Two hard rules:
 *
 * - `~/.claude/.credentials.json` is NEVER opened (it holds OAuth tokens); the
 *   non-secret fields it also carries all have replacements here.
 * - No account identifier ever reaches the output: no email, no account /
 *   organization uuid, no token. Only percentages, reset times, severities and
 *   the coarse plan descriptors are returned.
 *
 * The cache is CLI-internal with no schema promise, so every field is read
 * through optional chaining and a missing one degrades to `null` plus a
 * warning — never an exception.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

/** Default staleness threshold in minutes. */
export const DEFAULT_STALE_AFTER_MINUTES = 30

/** Utilization ≥ this is worth mentioning before delegating again. */
const CAUTION_PERCENT = 80
/** Utilization ≥ this means "stop delegating". */
const BLOCKED_PERCENT = 95

/** One rolling usage window. */
export interface UsageWindow {
  utilizationPercent: number | null
  resetsAt: string | null
}

/** One entry of the CLI's regular `limits[]` array. */
export interface UsageLimit {
  kind: string
  group: string | null
  percent: number | null
  severity: string | null
  resetsAt: string | null
  /** Display name of the model the limit is scoped to, when scoped. */
  scopeModel: string | null
  isActive: boolean
}

/** Plan descriptors (all coarse, none identifying). */
export interface UsageSubscription {
  type: string | null
  rateLimitTier: string | null
  billingType: string | null
}

/** Dollar spend block; disabled on subscription accounts. */
export interface UsageSpend {
  enabled: boolean
  usedMinor: number | null
  currency: string | null
  exponent: number | null
  percent: number | null
  limitMinor: number | null
}

/** Extra-usage (credit top-up) state. */
export interface UsageExtra {
  isEnabled: boolean
  disabledReason: string | null
}

/** Freshness of the underlying CLI cache. */
export interface UsageCache {
  fetchedAt: string | null
  ageMinutes: number | null
  maybeStale: boolean
  source: string
}

/** Derived go/no-go signal for the leader. */
export type UsageAdvice = 'normal' | 'caution' | 'blocked' | 'unknown'

/** Full snapshot returned by {@link readUsageSnapshot}. */
export interface UsageSnapshot {
  ok: boolean
  loggedIn: boolean
  error?: string
  subscription: UsageSubscription
  fiveHour: UsageWindow | null
  sevenDay: UsageWindow | null
  limits: UsageLimit[]
  spend: UsageSpend | null
  extraUsage: UsageExtra | null
  cache: UsageCache
  advice: UsageAdvice
  warnings: string[]
}

/** Options accepted by {@link readUsageSnapshot}. */
export interface UsageOptions {
  staleAfterMinutes?: number
  /** Reserved: an active refresh burns real quota, so MVP only warns. */
  forceRefresh?: boolean
  /** Configured claude executable, when the plugin has one. */
  pathToClaudeCodeExecutable?: string
}

const CLAUDE_MISSING_HINT =
  'claude executable not found — install it with: npm install -g @anthropic-ai/claude-code'

const CACHE_SOURCE = '~/.claude.json cachedUsageUtilization'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Whether `claude` resolves on PATH (or at the configured absolute path). */
function claudeAvailable(pathToClaudeCodeExecutable?: string): boolean {
  if (pathToClaudeCodeExecutable) return existsSync(pathToClaudeCodeExecutable)
  const probe = process.platform === 'win32' ? 'where' : 'which'
  try {
    const result = spawnSync(probe, ['claude'], { stdio: 'ignore', windowsHide: true, timeout: 5000 })
    return result.status === 0
  } catch {
    return false
  }
}

/** `claude auth status --json`; failures are non-fatal and simply yield null. */
function readAuthStatus(pathToClaudeCodeExecutable?: string): Record<string, unknown> | null {
  // On Windows `claude` is a .cmd shim, which spawnSync only resolves through a
  // shell; a configured path with spaces therefore has to be quoted by hand.
  const useShell = process.platform === 'win32'
  const executable = pathToClaudeCodeExecutable ?? 'claude'
  const command = useShell && /\s/.test(executable) ? `"${executable}"` : executable
  try {
    const result = spawnSync(command, ['auth', 'status', '--json'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
      shell: useShell,
    })
    if (result.status !== 0 || typeof result.stdout !== 'string') return null
    const parsed: unknown = JSON.parse(result.stdout)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readWindow(raw: unknown): UsageWindow | null {
  if (!isRecord(raw)) return null
  return { utilizationPercent: num(raw['utilization']), resetsAt: str(raw['resets_at']) }
}

function readLimits(raw: unknown): UsageLimit[] {
  if (!Array.isArray(raw)) return []
  const limits: UsageLimit[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const scope = isRecord(entry['scope']) ? entry['scope'] : undefined
    const model = scope && isRecord(scope['model']) ? scope['model'] : undefined
    limits.push({
      kind: str(entry['kind']) ?? 'unknown',
      group: str(entry['group']),
      percent: num(entry['percent']),
      severity: str(entry['severity']),
      resetsAt: str(entry['resets_at']),
      scopeModel: model ? str(model['display_name']) : null,
      isActive: entry['is_active'] === true,
    })
  }
  return limits
}

function readSpend(raw: unknown): UsageSpend | null {
  if (!isRecord(raw)) return null
  const used = isRecord(raw['used']) ? raw['used'] : undefined
  const limit = isRecord(raw['limit']) ? raw['limit'] : undefined
  return {
    enabled: raw['enabled'] === true,
    usedMinor: used ? num(used['amount_minor']) : null,
    currency: used ? str(used['currency']) : null,
    exponent: used ? num(used['exponent']) : null,
    percent: num(raw['percent']),
    limitMinor: limit ? num(limit['amount_minor']) : null,
  }
}

function readExtra(raw: unknown, fallbackReason: string | null): UsageExtra | null {
  if (!isRecord(raw)) return fallbackReason ? { isEnabled: false, disabledReason: fallbackReason } : null
  return {
    isEnabled: raw['is_enabled'] === true,
    disabledReason: str(raw['disabled_reason']) ?? fallbackReason,
  }
}

/** Derive the go/no-go signal from the windows and the limit severities. */
function deriveAdvice(windows: (UsageWindow | null)[], limits: UsageLimit[]): UsageAdvice {
  const percents: number[] = []
  for (const window of windows) {
    if (window?.utilizationPercent !== null && window?.utilizationPercent !== undefined) {
      percents.push(window.utilizationPercent)
    }
  }
  for (const limit of limits) if (limit.percent !== null) percents.push(limit.percent)
  const abnormal = limits.some((limit) => limit.severity !== null && limit.severity !== 'normal')
  if (percents.length === 0 && !abnormal) return 'unknown'
  const peak = percents.length ? Math.max(...percents) : 0
  if (abnormal || peak >= BLOCKED_PERCENT) return 'blocked'
  if (peak >= CAUTION_PERCENT) return 'caution'
  return 'normal'
}

/** An empty snapshot used by every failure branch. */
function emptySnapshot(): UsageSnapshot {
  return {
    ok: false,
    loggedIn: false,
    subscription: { type: null, rateLimitTier: null, billingType: null },
    fiveHour: null,
    sevenDay: null,
    limits: [],
    spend: null,
    extraUsage: null,
    cache: { fetchedAt: null, ageMinutes: null, maybeStale: false, source: CACHE_SOURCE },
    advice: 'unknown',
    warnings: [],
  }
}

/**
 * Read the local usage snapshot. Never throws: every failure comes back as
 * `ok:false` plus an actionable `error` string.
 */
export function readUsageSnapshot(options: UsageOptions = {}): UsageSnapshot {
  const snapshot = emptySnapshot()
  const staleAfterMinutes = typeof options.staleAfterMinutes === 'number' && options.staleAfterMinutes > 0
    ? options.staleAfterMinutes
    : DEFAULT_STALE_AFTER_MINUTES

  if (options.forceRefresh) {
    snapshot.warnings.push('暂不支持主动刷新（forceRefresh）：主动刷新需要真实消耗一次最小调用，留待后续版本')
  }

  const path = join(homedir(), '.claude.json')
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    if (!claudeAvailable(options.pathToClaudeCodeExecutable)) {
      snapshot.error = CLAUDE_MISSING_HINT
    } else {
      snapshot.error = '本机还没有 ~/.claude.json：请先在终端运行一次 `claude` 完成登录'
    }
    return snapshot
  }

  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    snapshot.error = '~/.claude.json 解析失败（文件可能正被 claude 写入，稍后重试）'
    return snapshot
  }
  if (!isRecord(root)) {
    snapshot.error = '~/.claude.json 结构异常（顶层不是对象），稍后重试'
    return snapshot
  }

  // From here on the call succeeds; missing fields only degrade the payload.
  snapshot.ok = true

  const oauthAccount = isRecord(root['oauthAccount']) ? root['oauthAccount'] : undefined
  snapshot.subscription = {
    type: null,
    rateLimitTier: oauthAccount ? str(oauthAccount['organizationRateLimitTier']) ?? str(oauthAccount['userRateLimitTier']) : null,
    billingType: oauthAccount ? str(oauthAccount['billingType']) : null,
  }
  snapshot.loggedIn = oauthAccount !== undefined

  const auth = readAuthStatus(options.pathToClaudeCodeExecutable)
  if (auth) {
    snapshot.subscription.type = str(auth['subscriptionType'])
    snapshot.loggedIn = auth['loggedIn'] === true
    if (!snapshot.loggedIn) {
      snapshot.warnings.push('登录态已失效，缓存数据可能不再准确：请在终端运行一次 `claude` 重新登录')
    }
  } else {
    snapshot.warnings.push('`claude auth status --json` 不可用，订阅类型未知（不影响用量数据）')
  }

  const cached = isRecord(root['cachedUsageUtilization']) ? root['cachedUsageUtilization'] : undefined
  if (!cached) {
    snapshot.warnings.push('本机尚无额度缓存：运行过一次 claude 会话后才有数据')
    return snapshot
  }

  const fetchedAtMs = num(cached['fetchedAtMs'])
  if (fetchedAtMs !== null) {
    const ageMinutes = Math.max(0, Math.round((Date.now() - fetchedAtMs) / 60000))
    snapshot.cache.fetchedAt = new Date(fetchedAtMs).toISOString()
    snapshot.cache.ageMinutes = ageMinutes
    snapshot.cache.maybeStale = ageMinutes > staleAfterMinutes
    if (snapshot.cache.maybeStale) {
      snapshot.warnings.push(`数据为 ${ageMinutes} 分钟前的缓存，可能非实时`)
    }
  }

  // Multi-account guard: a cache left behind by a previous account would show
  // the wrong quota, so the percentages are withheld rather than misreported.
  const cachedAccount = str(cached['accountUuid'])
  const currentAccount = oauthAccount ? str(oauthAccount['accountUuid']) : null
  if (cachedAccount !== null && currentAccount !== null && cachedAccount !== currentAccount) {
    snapshot.warnings.push('额度缓存属于另一个账号，已隐藏百分比：请先运行一次 claude 刷新')
    return snapshot
  }

  const utilization = isRecord(cached['utilization']) ? cached['utilization'] : undefined
  if (!utilization) {
    snapshot.warnings.push('额度缓存里没有 utilization 字段（claude CLI 结构可能已变更）')
    return snapshot
  }

  snapshot.fiveHour = readWindow(utilization['five_hour'])
  snapshot.sevenDay = readWindow(utilization['seven_day'])
  snapshot.limits = readLimits(utilization['limits'])
  snapshot.spend = readSpend(utilization['spend'])
  snapshot.extraUsage = readExtra(utilization['extra_usage'], str(root['cachedExtraUsageDisabledReason']))
  snapshot.advice = deriveAdvice([snapshot.fiveHour, snapshot.sevenDay], snapshot.limits)
  if (snapshot.fiveHour === null && snapshot.sevenDay === null && snapshot.limits.length === 0) {
    snapshot.warnings.push('额度缓存里没有任何窗口数据（claude CLI 结构可能已变更）')
  }
  return snapshot
}

/** Format an ISO reset timestamp in the host's local timezone. */
function formatReset(iso: string | null): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const pad = (value: number) => String(value).padStart(2, '0')
  const sameDay = at.toDateString() === new Date().toDateString()
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  return sameDay ? time : `${at.getMonth() + 1}/${at.getDate()} ${time}`
}

const ADVICE_TEXT: Record<UsageAdvice, string> = {
  normal: '正常，可以继续委派',
  caution: '偏高，建议减少并发委派或缩小任务',
  blocked: '接近/超过上限，暂时不要再委派',
  unknown: '未知（缺少窗口数据）',
}

/** Chinese render text for the `claude_code_usage` tool. */
export function renderUsage(snapshot: UsageSnapshot): string {
  if (!snapshot.ok) {
    const lines = [`Claude 订阅额度：读取失败 — ${snapshot.error ?? '未知错误'}`]
    for (const warning of snapshot.warnings) lines.push(`· ${warning}`)
    return lines.join('\n')
  }

  const planType = snapshot.subscription.type
  const plan = [planType ? planType.charAt(0).toUpperCase() + planType.slice(1) : null, snapshot.subscription.rateLimitTier]
    .filter((value): value is string => value !== null)
    .join(' / ')
  const peak = Math.max(
    snapshot.fiveHour?.utilizationPercent ?? 0,
    snapshot.sevenDay?.utilizationPercent ?? 0,
  )
  const alarm = peak >= CAUTION_PERCENT || snapshot.advice === 'blocked' ? '⚠️ ' : ''
  const lines = [`${alarm}Claude 订阅额度${plan ? `（${plan}）` : ''}`]

  if (!snapshot.loggedIn) lines.push('· 登录态：已失效（下面的数字来自旧缓存）')

  const fiveHour = snapshot.fiveHour
  if (fiveHour?.utilizationPercent !== null && fiveHour !== null) {
    const reset = formatReset(fiveHour.resetsAt)
    lines.push(`· 5 小时窗口：${fiveHour.utilizationPercent}%${reset ? `（约 ${reset} 重置）` : ''}`)
  }
  const sevenDay = snapshot.sevenDay
  if (sevenDay?.utilizationPercent !== null && sevenDay !== null) {
    const reset = formatReset(sevenDay.resetsAt)
    const scoped = snapshot.limits
      .filter((limit) => limit.kind === 'weekly_scoped' && limit.scopeModel !== null)
      .map((limit) => `${limit.scopeModel} 专项 ${limit.percent ?? 0}%`)
    lines.push(
      `· 7 天窗口：${sevenDay.utilizationPercent}%${reset ? `（${reset} 重置）` : ''}`
      + (scoped.length ? `｜${scoped.join('｜')}` : ''),
    )
  }

  const abnormal = snapshot.limits.filter((limit) => limit.severity !== null && limit.severity !== 'normal')
  if (abnormal.length) {
    lines.push(`· 异常限额：${abnormal.map((limit) => `${limit.kind}(${limit.severity})`).join('、')}`)
  }
  if (snapshot.spend?.enabled) {
    const used = snapshot.spend.usedMinor ?? 0
    const exponent = snapshot.spend.exponent ?? 2
    lines.push(`· 额外消费：${(used / 10 ** exponent).toFixed(2)} ${snapshot.spend.currency ?? 'USD'}（${snapshot.spend.percent ?? 0}%）`)
  }

  lines.push(`· 额度状态：${ADVICE_TEXT[snapshot.advice]}`)

  if (snapshot.cache.ageMinutes === null) {
    lines.push('（缓存时间未知；每次委派后 claude CLI 会自动更新）')
  } else if (snapshot.cache.maybeStale) {
    lines.push(`（⚠️ 数据为 ${snapshot.cache.ageMinutes} 分钟前的缓存，可能非实时）`)
  } else {
    lines.push(`（缓存于 ${snapshot.cache.ageMinutes} 分钟前；每次委派后自动更新）`)
  }
  // The cache line already states staleness; only add warnings not shown yet.
  for (const warning of snapshot.warnings) {
    if (!lines.some((line) => line.includes(warning))) lines.push(`· ${warning}`)
  }
  return lines.join('\n')
}
