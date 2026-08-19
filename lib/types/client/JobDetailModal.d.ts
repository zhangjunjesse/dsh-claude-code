import type { JobInfo, JobView } from './types.js';
export interface JobDetailModalProps {
    /** The job as the harness pushes it (identity, status, timestamps). */
    job: JobView;
    /** The plugin's own metadata for the same job, once `listJobs` answered. */
    detail: JobInfo | undefined;
    /** Ticking clock, so a running job's duration stays live behind the modal. */
    now: number;
    onClose: () => void;
    /** Copy the Claude session id; wired to the view's clipboard flash. */
    onCopySession?: (sessionId: string) => void;
    /** Label of the copy button, so the view can flash "copied" through it. */
    copyLabel?: string;
}
export declare function JobDetailModal({ job, detail, now, onClose, onCopySession, copyLabel }: JobDetailModalProps): import("react").JSX.Element;
