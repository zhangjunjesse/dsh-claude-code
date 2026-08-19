var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
/**
 * Host→Client RPC surface of the monitor panel.
 *
 * The harness ships no Client→Host channel for background jobs (the official
 * job list is read-only), so the panel talks to this service instead. It is a
 * plain `TypertRemoteService`: the api-gateway discovers `@Remote` methods by
 * reflecting over live services (its SRC mode), which needs no typert codegen.
 * Wire endpoints are `claudeCode/<method>` on the gateway's `/api` channel, and
 * the gateway's `trusted-host` authority already fences them.
 *
 * SRC dispatch derives wire field names from the METHOD PARAMETER NAMES, so
 * every parameter below must stay a plain identifier (no destructuring, no
 * defaults, no rest) and must not collide with a typert lookup parameter
 * (`session`, `agent`) — `sessionId` / `jobId` / `fromOffset` are plain JSON.
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { toJobInfo } from './tracker.js';
import { readUsageSnapshot } from './usage.js';
/**
 * How long one host-side read is reused. `readUsageSnapshot()` is synchronous
 * and shells out to `claude auth status --json`, so an unmemoized call from
 * every open panel would stall the event loop the job list also runs on. The
 * underlying data only changes after a claude turn, so a few seconds of reuse
 * costs the reader nothing while collapsing simultaneous panels into one read.
 */
const USAGE_MEMO_MS = 10_000;
/** Project the host snapshot onto the wire, turning every absence into `null`. */
function toUsageWire(snapshot) {
    return {
        ok: snapshot.ok === true,
        loggedIn: snapshot.loggedIn === true,
        error: snapshot.error ?? null,
        subscription: {
            type: snapshot.subscription?.type ?? null,
            rateLimitTier: snapshot.subscription?.rateLimitTier ?? null,
            billingType: snapshot.subscription?.billingType ?? null,
        },
        fiveHour: snapshot.fiveHour
            ? { utilizationPercent: snapshot.fiveHour.utilizationPercent ?? null, resetsAt: snapshot.fiveHour.resetsAt ?? null }
            : null,
        sevenDay: snapshot.sevenDay
            ? { utilizationPercent: snapshot.sevenDay.utilizationPercent ?? null, resetsAt: snapshot.sevenDay.resetsAt ?? null }
            : null,
        limits: (snapshot.limits ?? []).map((limit) => ({
            kind: limit.kind ?? 'unknown',
            group: limit.group ?? null,
            percent: limit.percent ?? null,
            severity: limit.severity ?? null,
            resetsAt: limit.resetsAt ?? null,
            scopeModel: limit.scopeModel ?? null,
            isActive: limit.isActive === true,
        })),
        advice: snapshot.advice ?? 'unknown',
        cache: {
            fetchedAt: snapshot.cache?.fetchedAt ?? null,
            ageMinutes: snapshot.cache?.ageMinutes ?? null,
            maybeStale: snapshot.cache?.maybeStale === true,
            source: snapshot.cache?.source ?? '',
        },
        warnings: (snapshot.warnings ?? []).filter((warning) => typeof warning === 'string'),
    };
}
/** The `ok:false` wire shape used when the read itself blew up. */
function failedUsageWire(error) {
    return {
        ok: false,
        loggedIn: false,
        error,
        subscription: { type: null, rateLimitTier: null, billingType: null },
        fiveHour: null,
        sevenDay: null,
        limits: [],
        advice: 'unknown',
        cache: { fetchedAt: null, ageMinutes: null, maybeStale: false, source: '' },
        warnings: [],
    };
}
/** `ctx.claudeCode` — the monitor panel's own remote service. */
let ClaudeCodeRemote = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _listJobs_decorators;
    let _readOutput_decorators;
    let _readEvents_decorators;
    let _cancel_decorators;
    let _usage_decorators;
    return class ClaudeCodeRemote extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _listJobs_decorators = [Remote];
            _readOutput_decorators = [Remote];
            _readEvents_decorators = [Remote];
            _cancel_decorators = [Remote];
            _usage_decorators = [Remote];
            __esDecorate(this, null, _listJobs_decorators, { kind: "method", name: "listJobs", static: false, private: false, access: { has: obj => "listJobs" in obj, get: obj => obj.listJobs }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _readOutput_decorators, { kind: "method", name: "readOutput", static: false, private: false, access: { has: obj => "readOutput" in obj, get: obj => obj.readOutput }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _readEvents_decorators, { kind: "method", name: "readEvents", static: false, private: false, access: { has: obj => "readEvents" in obj, get: obj => obj.readEvents }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancel_decorators, { kind: "method", name: "cancel", static: false, private: false, access: { has: obj => "cancel" in obj, get: obj => obj.cancel }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _usage_decorators, { kind: "method", name: "usage", static: false, private: false, access: { has: obj => "usage" in obj, get: obj => obj.usage }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        tracker = __runInitializers(this, _instanceExtraInitializers);
        pathToClaudeCodeExecutable;
        usageMemo;
        constructor(ctx, tracker, pathToClaudeCodeExecutable) {
            super(ctx, 'claudeCode');
            this.tracker = tracker;
            this.pathToClaudeCodeExecutable = pathToClaudeCodeExecutable;
        }
        /**
         * Every claude-code delegation owned by one session, with the metadata the
         * jobs mirror does not carry (cost, turns, claude session id, final text).
         */
        async listJobs(sessionId) {
            return this.tracker.list(sessionId).map((job) => ({ ...toJobInfo(job), model: job.model ?? null }));
        }
        /**
         * Incremental output from an absolute offset. There is no server-side cursor,
         * so any number of panels (or windows) can read the same job independently.
         */
        async readOutput(sessionId, jobId, fromOffset) {
            const job = this.tracker.require(sessionId, jobId);
            const offset = Number.isSafeInteger(fromOffset) && fromOffset > 0 ? fromOffset : 0;
            const chunk = job.read(offset);
            return {
                text: chunk.text,
                nextOffset: chunk.nextOffset,
                truncated: chunk.truncated,
                status: job.status,
            };
        }
        /**
         * Incremental structured events from an absolute offset — the same run the
         * text stream describes, but block-shaped so the panel can render tool cards,
         * thinking and results natively. Cursor-free like `readOutput`, so reading
         * here never costs the model's `job_output` bytes.
         */
        async readEvents(sessionId, jobId, fromOffset) {
            const job = this.tracker.require(sessionId, jobId);
            const offset = Number.isSafeInteger(fromOffset) && fromOffset > 0 ? fromOffset : 0;
            const chunk = job.readEvents(offset);
            return {
                events: chunk.events,
                nextOffset: chunk.nextOffset,
                truncated: chunk.truncated,
                status: job.status,
            };
        }
        /**
         * Cancel from the UI. This goes through the plugin's own AbortController, so
         * the job still settles as `killed` and the model still gets its completion
         * notification (which `ctx.jobs.kill()` would have swallowed).
         */
        async cancel(sessionId, jobId) {
            const job = this.tracker.require(sessionId, jobId);
            return job.cancelFromUi() ? 'requested' : 'already-finished';
        }
        /**
         * The local subscription's quota, for the panel's usage bar. This reads the
         * claude CLI's own cache only (`readUsageSnapshot`); no refresh is triggered,
         * since an active refresh would burn real quota — the UI's refresh button
         * just re-reads that cache.
         *
         * Nothing here is per-job, so the session is only checked for shape: the
         * quota belongs to the machine's claude login, not to one delegation, and
         * the gateway's `trusted-host` authority already fences the endpoint.
         *
         * Never throws: a failure comes back as `ok:false` + `error` so the bar can
         * degrade to a retryable message instead of breaking the panel.
         */
        async usage(sessionId) {
            if (typeof sessionId !== 'string' || sessionId === '') {
                return failedUsageWire('missing sessionId');
            }
            const memo = this.usageMemo;
            if (memo !== undefined && Date.now() - memo.at < USAGE_MEMO_MS)
                return memo.wire;
            try {
                const wire = toUsageWire(readUsageSnapshot({
                    ...(this.pathToClaudeCodeExecutable !== undefined
                        ? { pathToClaudeCodeExecutable: this.pathToClaudeCodeExecutable }
                        : {}),
                }));
                this.usageMemo = { at: Date.now(), wire };
                return wire;
            }
            catch (error) {
                return failedUsageWire(error instanceof Error ? error.message : String(error));
            }
        }
    };
})();
export { ClaudeCodeRemote };
