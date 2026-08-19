/** Default staleness threshold in minutes. */
export declare const DEFAULT_STALE_AFTER_MINUTES = 30;
/** One rolling usage window. */
export interface UsageWindow {
    utilizationPercent: number | null;
    resetsAt: string | null;
}
/** One entry of the CLI's regular `limits[]` array. */
export interface UsageLimit {
    kind: string;
    group: string | null;
    percent: number | null;
    severity: string | null;
    resetsAt: string | null;
    /** Display name of the model the limit is scoped to, when scoped. */
    scopeModel: string | null;
    isActive: boolean;
}
/** Plan descriptors (all coarse, none identifying). */
export interface UsageSubscription {
    type: string | null;
    rateLimitTier: string | null;
    billingType: string | null;
}
/** Dollar spend block; disabled on subscription accounts. */
export interface UsageSpend {
    enabled: boolean;
    usedMinor: number | null;
    currency: string | null;
    exponent: number | null;
    percent: number | null;
    limitMinor: number | null;
}
/** Extra-usage (credit top-up) state. */
export interface UsageExtra {
    isEnabled: boolean;
    disabledReason: string | null;
}
/** Freshness of the underlying CLI cache. */
export interface UsageCache {
    fetchedAt: string | null;
    ageMinutes: number | null;
    maybeStale: boolean;
    source: string;
}
/** Derived go/no-go signal for the leader. */
export type UsageAdvice = 'normal' | 'caution' | 'blocked' | 'unknown';
/** Full snapshot returned by {@link readUsageSnapshot}. */
export interface UsageSnapshot {
    ok: boolean;
    loggedIn: boolean;
    error?: string;
    subscription: UsageSubscription;
    fiveHour: UsageWindow | null;
    sevenDay: UsageWindow | null;
    limits: UsageLimit[];
    spend: UsageSpend | null;
    extraUsage: UsageExtra | null;
    cache: UsageCache;
    advice: UsageAdvice;
    warnings: string[];
}
/** Options accepted by {@link readUsageSnapshot}. */
export interface UsageOptions {
    staleAfterMinutes?: number;
    /** Reserved: an active refresh burns real quota, so MVP only warns. */
    forceRefresh?: boolean;
    /** Configured claude executable, when the plugin has one. */
    pathToClaudeCodeExecutable?: string;
}
/**
 * Read the local usage snapshot. Never throws: every failure comes back as
 * `ok:false` plus an actionable `error` string.
 */
export declare function readUsageSnapshot(options?: UsageOptions): UsageSnapshot;
/** Chinese render text for the `claude_code_usage` tool. */
export declare function renderUsage(snapshot: UsageSnapshot): string;
