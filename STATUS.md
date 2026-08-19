# dsh-claude-code 开发状态（2026-08-19）

> 本文件是"会话接力"文档：任何新会话先读本文件 + SPEC-0.2.0.md，即可无缝继续。

## 项目
- 仓库：`C:\Users\Administrator\Desktop\dsh-workspace\space-开发-dsh插件开发`
- 目标：把 dsh-claude-code 插件 0.1.2 → 0.2.0（github.com/zhangjunjesse/dsh-claude-code）
- 四个能力块：① 后台异步任务（run_in_background + DSH ctx.jobs）② 流式输出（readOutput 增量）
  ③ 错误诊断增强 ④ SDK 新能力（appendSystemPrompt/thinking/maxBudgetUsd/outputFormat/agents/permissionMode auto）

## 已完成
- [x] 全部 API 调研（已写入 SPEC-0.2.0.md，Claude Code 直接照做即可）：
  - Claude Agent SDK 0.3.233：query options / 消息类型 / result 字段
  - DSH jobs：ctx.jobs.start({kind,label,owner,run}) → jobId；readOutput 增量；{kind:'background',jobId} 返回约定
  - dsh-tools defineTool：parameters/output.schema/execute(args,exec)/exec.signal/exec.agent
- [x] SPEC-0.2.0.md（任务书，含全部实现规范与验收标准）
- [x] 代理通道结论（重要，见下）

## 代理结论（本机 Claude Code 使用）
- **claude CLI 走本机 Clash（127.0.0.1:7897）可用**：`$env:HTTPS_PROXY="http://127.0.0.1:7897"; $env:HTTP_PROXY="http://127.0.0.1:7897"` 后再跑 `claude -p ...`
- **直连（不走代理）会 403**（Anthropic "Request not allowed"）——必须走代理
- 本机 Clash = Clash Verge（`C:\Users\Administrator\Desktop\Clash Verge\`），引擎是 verge-mihomo.exe（mihomo 就是 Clash 内核，不是两个软件）
- 本机"日本节点" JP-Lightsail-18.181.198.156 就是本机自己（出口 AWS Tokyo），但走 7897 代理 claude 依然可用（实测 CLAUDE_OK）
- 机场订阅（ygt90900 43 节点、svip 14 节点）**已全部失效**（2026-03 到期/机场跑路），勿再依赖；订阅源 47.115.224.201 已挂
- 系统代理已开：ProxyServer=127.0.0.1:7897（Windows）
- 勿改用户的 clash-verge.yaml（Verge 会覆盖）；7896 独立实例方案已废弃

## 进行中
- [ ] Claude Code 委派实现 0.2.0（后台任务 pwsh-19，输出文件 $env:TEMP\delegation2-out.txt / delegation2-err.txt）
  - 委派命令模板：`claude -p <任务> --permission-mode acceptEdits --allowedTools Read Edit Write Bash Grep Glob --max-turns 80 --output-format text`（cwd=仓库，先设 HTTPS_PROXY）
  - 任务书：SPEC-0.2.0.md

## 待办（委派完成后）
- [ ] review Claude Code 产出（读 src/index.ts、README、CHANGELOG、package.json 版本）
- [ ] 亲自跑 `npm run typecheck` 和 `npm run build` 验证（不采信 claude 自报）
- [ ] 给插件加 **proxy 配置项**（用户明确要求：插件内部给 claude 子进程注入 HTTPS_PROXY，做到"不开 TUN 也能用 claude"；即 SPEC 里 env 处加 `HTTPS_PROXY: config.proxy`）
- [ ] 部署：把 lib/、package.json、cordis.patch.yml、CHANGELOG.md、README.md 复制到 `C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-claude-code\`
- [ ] 重启 DSH 桌面后新版本生效（需用户操作）；README 增加网络/代理提示
- [ ] 可选：git 提交 0.2.0 并推送/发布 npm

## 关键路径速查
- 插件源码：`src/index.ts`
- 任务书：`SPEC-0.2.0.md`
- 已装插件（部署目标）：`C:\Users\Administrator\.dsh\profiles\desktop\node_modules\dsh-claude-code\`
- DSH 环境：`C:\Users\Administrator\AppData\Local\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\`（各包 lib/index.js 可读源码）
