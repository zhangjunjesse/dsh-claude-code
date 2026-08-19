# Changelog

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
