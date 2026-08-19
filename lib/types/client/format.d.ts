import type { JobStatus } from './types.js';
/** Elapsed time in at most two adjacent units (`3m 20s`, `1h 4m`, `12s`). */
export declare function formatDuration(elapsedMs: number): string;
/** `12:50:07` today, `8/25 21:00:07` on any other day; `-` when unusable. */
export declare function formatClock(at: number | undefined): string;
/** Localised status word; `stopping` reads as "cancelled" like the jobs seam. */
export declare function statusLabel(status: JobStatus): string;
