# dsh-claude-code 开发状态（2026-08-19）

> 本文件是"会话接力"文档：任何新会话先读本文件，即可无缝继续。

## 项目
- 仓库：`C:\Users\Administrator\Desktop\dsh-workspace\space-开发-dsh插件开发`
- 目标：dsh-claude-code 插件（github.com/zhangjunjesse/dsh-claude-code）
- 版本史：0.1.2 → **0.2.0**（后台任务/流式输出/错误诊断/SDK 新能力/proxy 配置）→ **0.3.0**（Claude Code 监控面板 tab + 额度工具），均已实现并部署到 desktop profile

## 已完成
- [x] **0.3.0 已实现并部署**（git 16682ed，version 0.3.0）：
  - P0：done.detail 富化 `$0.13 · 12 turns · 3m20s`（官方任务列表直接显示）
  - P1：Claude Code 监控面板 —— 会话头第三个 tab（conversation.view, id 'claude-code', order 100）
    + JobTracker（src/tracker.ts）+ ClaudeCodeRemote（src/remote.ts，TypertRemoteService 三方法 listJobs/readOutput/cancel，ownerSessionId 校验）
    + client 半边（src/client/：ClaudeCodeView/OutputView/api.ts/locales）+ esbuild 打包链路（lib/client.js 27KB，`window.__ModuleLoader__.load({id:"dsh-claude-code"})` 包装已确认，seed 白名单仅 react/react-dom/primitives）
  - M1：claude_code_usage 额度工具（src/usage.ts，读 ~/.claude.json cachedUsageUtilization + `claude auth status --json`；实测输出正确：Max/20x、5h 2%、7d 3%、advice normal；无敏感字段泄漏；错误分支实测）
  - 独立验证：typecheck 0 错误、build 通过、lib 16 产物齐全
  - 部署目标：`C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-claude-code`（0.2.0 → 0.3.0）
- [x] **0.2.0**（git d8e0958）：四能力块 + review 修复（abort 误报 bug + proxy 配置项注入 HTTPS_PROXY/HTTP_PROXY/ALL_PROXY）
- [x] 设计文档（docs/）：UI-DESIGN-0.3.0.md（第三 tab 主方案，30KB）、UI-DESIGN-0.3.0-popover.md（弹层备选）、USAGE-DESIGN-0.3.0.md（额度，19KB）、IMPLEMENT-0.3.0-TASK.md（实现任务书）

## 代理结论（本机 Claude Code 使用，重要）
- **claude CLI 必须走本机 Clash 代理 127.0.0.1:7897**：`$env:HTTPS_PROXY="http://127.0.0.1:7897"; $env:HTTP_PROXY="http://127.0.0.1:7897"` 再跑 `claude -p ...`；直连会 403
- 委派模板：`claude -p <短指令> --permission-mode acceptEdits --allowedTools Read Edit Write Bash Grep Glob --max-turns N --output-format text`
  - **任务书必须放仓库文件让 claude Read（命令行传参长文本会截断！）**，指令保持纯 ASCII + 相对路径（PS5.1 按 GBK 读 UTF-8 脚本会坏）
- 本机 Clash = Clash Verge（verge-mihomo.exe 是引擎）；机场/svip 订阅节点已失效勿依赖

## 待办（按优先级）
- [ ] **重启 DSH 桌面**（用户操作）：0.2.0 + 0.3.0 都需重启才生效
- [ ] **重启后实机验证 0.3.0**（claude 无法自测的部分）：
  1. DevTools 裸调 `fetch('/api/claudeCode/listJobs', {method:'POST', body: JSON.stringify({args:{sessionId}}), headers:{'Content-Type':'application/json'}})` 确认 gateway SRC 声明被 claim；若 404 → 按 UI-DESIGN-0.3.0.md §3.2 降级 ctx.webServer 路由
  2. 会话头出现第三个 tab「Claude Code」；派 run_in_background 任务 → 列表/实时输出/取消 UI 验证
  3. 模型侧 job_output 游标不受 UI 读取影响（坑 A 绕行验证）
  4. claude_code_usage 在 DSH 内调用
- [ ] 可选：git push + npm publish（需 npm login）
- [ ] 可选：proxy 配置写进 desktop profile 的 cordis.patch.yml

## 已知实现差异（claude 记录，来自源码核对）
- SRC 派发按方法参数名取 wire 字段（remote.ts 参数不能叫 session/agent，禁止解构）；gateway 结果必须纯 JSON（不用 undefined）；seed 静态表实为 10 项；dsh.client.inject 不参与 boot 时序（真正时序来自模块自身 inject 数组）

## 关键路径速查
- 插件源码：src/index.ts（node 入口）+ src/tracker.ts + src/remote.ts + src/usage.ts + src/client/（web 半边）
- 构建：npm run build（build:node tsc + build:client tsc+esbuild → lib/client.js）；scripts/build-client.mjs + assert-artifacts.mjs
- 已装插件（部署目标）：`C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-claude-code\`
- DSH 源码：`C:\Users\Administrator\AppData\Local\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\`（APP\）
- 参考插件：`C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-better-sidebar\`（PROF\）
