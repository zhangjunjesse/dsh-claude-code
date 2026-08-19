/**
 * Plugin-owned mirror of the background delegations this plugin produced.
 *
 * The host jobs seam is deliberately left alone: `ctx.jobs.read()` has a single
 * cursor shared with the model's `job_output` tool, and `ctx.jobs.kill()` marks
 * a job reported so the model never learns it was cancelled. The monitor panel
 * therefore reads output from this mirror (absolute offsets, many consumers)
 * and cancels through the plugin's own AbortController, letting the job settle
 * normally so the model still gets its completion notification.
 *
 * The mirror is process-local and not persisted: a DSH restart empties it.
 */
/** Settled jobs kept per session; older ones are dropped on settlement. */
const SETTLED_RETENTION = 20;
/** Project one tracked job onto the wire shape, omitting absent fields. */
export function toJobInfo(job) {
    return {
        jobId: job.jobId,
        label: job.label,
        task: job.task,
        status: job.status,
        startedAt: job.startedAt,
        ...(job.finishedAt !== undefined ? { finishedAt: job.finishedAt } : {}),
        ...(job.claudeSessionId !== undefined ? { claudeSessionId: job.claudeSessionId } : {}),
        ...(job.costUsd !== undefined ? { costUsd: job.costUsd } : {}),
        ...(job.numTurns !== undefined ? { numTurns: job.numTurns } : {}),
        ...(job.durationMs !== undefined ? { durationMs: job.durationMs } : {}),
        ...(job.finalOutput !== undefined ? { finalOutput: job.finalOutput } : {}),
        ...(job.failureDetail !== undefined ? { failureDetail: job.failureDetail } : {}),
    };
}
/** Process-local registry of this plugin's background delegations. */
export class JobTracker {
    jobs = new Map();
    /** Register a job the moment the jobs seam hands back its id. */
    register(registration) {
        const job = {
            jobId: registration.jobId,
            ...(registration.ownerSessionId !== undefined ? { ownerSessionId: registration.ownerSessionId } : {}),
            task: registration.task,
            label: registration.label,
            status: 'running',
            startedAt: Date.now(),
            read: registration.read,
            cancelFromUi: registration.cancelFromUi,
        };
        this.jobs.set(job.jobId, job);
        return job;
    }
    /** Fill in the outcome once the delegation finished, then prune old rows. */
    settle(jobId, settlement) {
        const job = this.jobs.get(jobId);
        if (!job)
            return;
        job.status = settlement.status;
        job.finishedAt = Date.now();
        if (settlement.claudeSessionId)
            job.claudeSessionId = settlement.claudeSessionId;
        if (typeof settlement.costUsd === 'number')
            job.costUsd = settlement.costUsd;
        if (typeof settlement.numTurns === 'number')
            job.numTurns = settlement.numTurns;
        if (typeof settlement.durationMs === 'number')
            job.durationMs = settlement.durationMs;
        if (settlement.finalOutput !== undefined)
            job.finalOutput = settlement.finalOutput;
        if (settlement.failureDetail !== undefined)
            job.failureDetail = settlement.failureDetail;
        this.prune(job.ownerSessionId);
    }
    /** One tracked job, or undefined when unknown / already pruned. */
    get(jobId) {
        return this.jobs.get(jobId);
    }
    /**
     * Resolve a job for one session, refusing foreign rows. Same strength as the
     * jobs seam's own owner check (`owner.id` equality).
     */
    require(sessionId, jobId) {
        const job = this.jobs.get(jobId);
        if (!job)
            throw new Error(`unknown claude-code job: ${jobId}`);
        if (job.ownerSessionId !== sessionId)
            throw new Error(`job ${jobId} does not belong to this session`);
        return job;
    }
    /** Every job owned by one session, newest activity first. */
    list(sessionId) {
        const rows = [];
        for (const job of this.jobs.values()) {
            if (job.ownerSessionId === sessionId)
                rows.push(job);
        }
        return rows.sort((left, right) => right.startedAt - left.startedAt);
    }
    /** Keep only the most recent settled jobs of one session. */
    prune(sessionId) {
        if (sessionId === undefined)
            return;
        const settled = this.list(sessionId).filter((job) => job.status !== 'running');
        for (const job of settled.slice(SETTLED_RETENTION))
            this.jobs.delete(job.jobId);
    }
}
