# Changelog

## 0.3.5
- **Markdown preview in the panel**: assistant text now renders as formatted Markdown (headings, bold/italic, inline code, fenced code blocks, lists, block quotes, rules and http(s) links that open in a new tab) through a zero-dependency renderer that never touches `innerHTML`, with a per-block "Raw / Preview" toggle for the source.

## 0.3.4
- **Compact usage bar**: the quota bar is now one collapsed line (`Claude Max · 20x | 5h 2% · 7d 3% | normal | Refresh`) that unfolds the 5-hour/7-day progress bars, reset times, per-model chips and cache age on click, giving the output back most of the panel's header height.
- **Task tabs instead of a side list**: delegations moved from a 260px left column to a horizontally scrolling tab strip above the output, so the Claude Code window now owns the full panel width.
- **Job detail modal**: each tab carries a `ⓘ` that opens a dialog (ESC / backdrop / button to close) with the complete task text, the model, status, start and finish times, duration, cost, turns, the copyable Claude session id and the failure reason.
- **Model passthrough**: a background delegation records the model it ran with (`TrackedJob.model` → `JobInfo.model`, `null` on the wire when absent), and the tabs get status-coloured dots — blue and breathing while running, green/red/grey once settled.

## 0.3.3
- **Usage bar in the monitor panel**: the Claude Code tab now opens with the subscription's quota on top — plan tier (`Claude Max · 20x`), 5-hour and 7-day progress bars with reset times (amber from 50%, red from 80%), a chip per per-model limit (`Fable 0%`), a normal/caution/blocked badge, cache age and a refresh button — served by a new `claudeCode/usage` remote that re-reads the claude CLI's own local cache (no quota is spent, no account identity is returned) and degrades to a retryable message when it cannot.

## 0.3.2
- **Two-stage timeout with periodic warnings**: `timeoutMs` now defaults to 2 hours (hard abort when reached). New `warnTimeoutMs` (default 1h) emits a `warning` event in the monitor panel (prominent amber banner, no abort), repeated every `warnIntervalMs` (default 30m) while the task keeps running. All three are per-call overridable (`timeoutMs` / `warnTimeoutMs` / `warnIntervalMs` tool args). The delegation skill now tells the agent to surface warnings to the user instead of force-killing.

## 0.3.1
- **Native-style panel output**: the monitor panel no longer renders a flat text stream. A background delegation now also emits a structured event stream — `text`, `thinking`, `tool_use` (with its full parameter JSON), `tool_result` and a closing `result` — and the panel renders it the way the Claude Code terminal does: assistant text as prose, thinking collapsed behind a one-line `💭` toggle, and a tool card per call (colour-coded name badge, one-line parameters that expand to pretty-printed JSON) that owns the result it produced, grouped by `tool_use_id` so parallel calls stay apart. Long payloads collapse by default (~200 chars for parameters, ~800 for results) with an inline expander, and the run ends on a `✅ 完成 · $0.13 · 12 turns · 3m20s` summary.
- Host side adds `claudeCode/readEvents(sessionId, jobId, fromOffset)` next to `readOutput`, backed by a per-job ring buffer bounded three ways — at most 2000 events, a 2 MB total budget, and a per-event cut so one huge block cannot evict the rest. Reads are absolute-offset and move no cursor, so the panel, a second window and a late reader can all follow the same job independently; a dropped head reports `truncated`. Tool results are capped at 2000 characters on the host, before they ever reach the wire.
- The existing text stream is untouched: the model's `job_output`, the panel's `readOutput` fallback and the UI cancel path (`cancelFromUi` → `killed`, model still notified) all behave exactly as in 0.3.0. Partial `text_delta` / `thinking_delta` frames stay out of the event stream — the panel paints whole blocks instead of flickering per token — and the text stream keeps carrying them for `job_output`'s live feel.

## 0.3.0
- Richer background job detail: a finished delegation now reports `$0.13 · 12 turns · 3m20s` instead of a bare status, so the harness's own job list shows cost, turns and duration inline with no UI code.
- **Claude Code monitor panel** (web): a third `conversation.view` tab next to Chat and Trajectory. It lists this session's delegations (live rows first, duration ticking), and shows the selected one in a terminal-like window — incremental live output with `[tool]` lines highlighted, pause-on-scroll auto-follow, turns/cost/duration stats, the Claude session id (copyable, usable as `resume`), and cancel.
  - Host side adds a `JobTracker` mirror and a `claudeCode` remote service (`listJobs` / `readOutput` / `cancel`), all owner-checked against the calling session.
  - Output reads use absolute offsets on the plugin's own buffer, so the panel never consumes the model's `job_output` bytes; cancelling from the UI goes through the plugin's abort path, so the job still settles as `killed` and the model still receives its completion notification.
  - Polling is bounded: one read per second, only while the tab is mounted and the selected job is running, plus one final read when it settles.
  - Ships as a second build artifact, `lib/client.js`, declared through `dsh.client` + `exports["./client"]`. Adding it to an already-installed plugin requires a DSH restart.
- **New tool `claude_code_usage`**: reads the local Claude subscription's quota — 5-hour and 7-day windows with reset times, the regular `limits[]` rows with severities, plan tier, spend and extra-usage state, plus cache age and a derived `normal` / `caution` / `blocked` advice. It reads only the claude CLI's own `~/.claude.json` cache and `claude auth status --json`; the credentials file is never opened and no account identity (email, uuid, token) is ever returned. Missing or renamed fields degrade to `null` plus a warning instead of failing.
- **New `parallel-dev` skill**: orchestration playbook for parallel development. When the user asks to develop several modules at once, the agent follows a decision tree (serial by default, worktree only for genuinely parallel same-repo work), auto-creates branches/directories, dispatches delegations per worktree via `cwd`, then integrates and cleans up. Confirmation is limited to one business-level question ("parallel or sequential?") and never surfaces git/worktree details to the user.

## 0.2.0
- Background delegations: `run_in_background: true` registers the run as a DSH job and returns `{ kind: "background", jobId }` immediately; manage it with the built-in `job_output` / `job_list` / `job_kill` tools and get a completion notification.
- Streaming output: background jobs expose Claude Code's live text (and tool-use markers) incrementally through `job_output`, backed by `includePartialMessages`.
- Better failure diagnostics: synchronous preflight for a missing `claude` executable, a bad `cwd`, and `bypassPermissions` without the `allowDangerouslySkipPermissions` switch, plus actionable mapping for authentication, billing, rate-limit/overload, 403/proxy, invalid model, budget-exceeded and stale-`resume` failures.
- New SDK capabilities: `appendSystemPrompt`, `thinkingMode` (adaptive/disabled), `maxBudgetUsd`, `outputSchema` → structured output, config-defined `subagents`, and `permissionMode: 'auto'`.
- Result now also carries `durationMs`, `numTurns` and `structuredOutput`; the rendered result appends a turns/cost/tokens stat line.

## 0.1.2
- Add `effort` (low/medium/high/xhigh/max) and `maxThinkingTokens` — config + per-call override.

## 0.1.1
- Add `dsh.bundle` manifest + `cordis.patch.yml` so the plugin installs via `dsh plugin add`.
- Ship `cordis.patch.yml` in the npm tarball.

## 0.1.0
- Initial release: `claude_code` tool over the official Claude Agent SDK.
- Built-in `claude-code-delegation` skill (Leader-Worker SOP).
- `resume` parameter for multi-turn memory across delegations.
