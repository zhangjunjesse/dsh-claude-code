import type { ClaudeCodeApi } from './api.js';
import type { UsageView } from './types.js';
export interface UsageBarProps {
    /** The last successful read, or null before the first one lands. */
    usage: UsageView | null;
    /** True while a read is in flight (the button shows it and self-disables). */
    loading: boolean;
    /** Transport-level failure; the payload's own `error` lives on `usage`. */
    error: string | null;
    onRefresh: () => void;
}
/**
 * The usage bar itself. Three degraded states are first-class: still loading,
 * signed out (the numbers would be a previous login's), and a failed read that
 * the reader can retry.
 */
export declare function UsageBar({ usage, loading, error, onRefresh }: UsageBarProps): import("react").JSX.Element;
/** What {@link useUsage} hands the bar. */
export interface UsageState {
    usage: UsageView | null;
    loading: boolean;
    error: string | null;
    refresh: () => void;
}
/**
 * Read the quota once on mount, then every {@link USAGE_POLL_MS}. The read is
 * aborted and the timer cleared on unmount (the harness unmounts this view on
 * every tab switch), and a manual refresh restarts both.
 */
export declare function useUsage(api: ClaudeCodeApi, sessionId: string): UsageState;
