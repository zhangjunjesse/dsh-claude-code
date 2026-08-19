# Changelog

## 0.3.0
- Richer background job detail: a finished delegation now reports `$0.13 · 12 turns · 3m20s` instead of a bare status, so the harness's own job list shows cost, turns and duration inline with no UI code.
- **Claude Code monitor panel** (web): a third `conversation.view` tab next to Chat and Trajectory. It lists this session's delegations (live rows first, duration ticking), and shows the selected one in a terminal-like window — incremental live output with `[tool]` lines highlighted, pause-on-scroll auto-follow, turns/cost/duration stats, the Claude session id (copyable, usable as `resume`), and cancel.
  - Host side adds a `JobTracker` mirror and a `claudeCode` remote service (`listJobs` / `readOutput` / `cancel`), all owner-checked against the calling session.
  - Output reads use absolute offsets on the plugin's own buffer, so the panel never consumes the model's `job_output` bytes; cancelling from the UI goes through the plugin's abort path, so the job still settles as `killed` and the model still receives its completion notification.
  - Polling is bounded: one read per second, only while the tab is mounted and the selected job is running, plus one final read when it settles.
  - Ships as a second build artifact, `lib/client.js`, declared through `dsh.client` + `exports["./client"]`. Adding it to an already-installed plugin requires a DSH restart.
- **New tool `claude_code_usage`**: reads the local Claude subscription's quota — 5-hour and 7-day windows with reset times, the regular `limits[]` rows with severities, plan tier, spend and extra-usage state, plus cache age and a derived `normal` / `caution` / `blocked` advice. It reads only the claude CLI's own `~/.claude.json` cache and `claude auth status --json`; the credentials file is never opened and no account identity (email, uuid, token) is ever returned. Missing or renamed fields degrade to `null` plus a warning instead of failing.

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
