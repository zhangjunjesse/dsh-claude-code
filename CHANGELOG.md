# Changelog

## 0.1.2
- Add `effort` (low/medium/high/xhigh/max) and `maxThinkingTokens` — config + per-call override.

## 0.1.1
- Add `dsh.bundle` manifest + `cordis.patch.yml` so the plugin installs via `dsh plugin add`.
- Ship `cordis.patch.yml` in the npm tarball.

## 0.1.0
- Initial release: `claude_code` tool over the official Claude Agent SDK.
- Built-in `claude-code-delegation` skill (Leader-Worker SOP).
- `resume` parameter for multi-turn memory across delegations.
