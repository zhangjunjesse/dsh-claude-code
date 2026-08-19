# UI-DESIGN-0.3.0：Claude Code 监控面板（会话第三个视图 tab）

> 状态：可行性评估 + 设计文档（未实现）。日期：2026-08-19。
> 需求：在 DSH 会话顶部"对话 / 轨迹"视图 tab 右边新增第三个 tab，点击后整个会话体切换为
> Claude Code 监控面板——看到委派任务是否在正常执行、状态/进度、像终端一样滚动的实时输出。
> 本文档全部结论基于对本机源码的实际读取，关键断言附文件路径与行号。
> 与既有 `DESIGN-0.3.0-jobs-ui.md`（入口为会话头部弹层）的关系：本文档按用户明确的
> "第三个视图 tab"入口重做入口与 UI 结构设计；其后端设计（JobTracker / 双缓冲 / 取消绕行）
> 结论仍然成立，本文档吸收并在关键处重新核实。

**源码根路径缩写**（下文引用使用）：
- `APP\` = `C:\Users\Administrator\AppData\Local\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\`
- `PROF\` = `C:\Users\Administrator\.dsh\profiles\desktop\node_modules\`
- 本插件 = `C:\Users\Administrator\Desktop\dsh-workspace\space-开发-dsh插件开发\`

---

## 1. 可行性评估：**可行**

三条关键链路全部有实证，且"第三个视图 tab"是 DSH 插槽契约**明文支持**的扩展方式。

### 1.1 conversation.view 就是视图 tab 环，加第三个 tab 是官方蓝本

- `conversation.view` 是 **list 型、session 作用域**的插槽，由 ui-conversation 的
  `conversation.session` 条目声明（`APP\dsh-client-ui-conversation\lib\client.js:9585-9602`）。
- 现有两个占位：chat（`id:'chat', order:0`，同文件 :9710-9761）、trajectory
  （`id:'trajectory', order:10`，`APP\dsh-client-ui-trajectory\lib\client.js:7340-7361`）。
- **插件文档契约明确祝福第三方新增 tab**：机器可读契约表
  （`APP\dsh-cordis-client-runner\lib\client.js:2896-2941`）给出 `replaceRisk: "none"`，
  并附官方示例（`id:'my-entry', order:100, label:'My entry'`）——即"新 id 并排新增，
  复用已有 id 才是替换"。
- Tab 条渲染：会话头把每个注册条目渲染成 `role="tab"` 按钮，label 来自注册项的
  `options.label`（thunk，i18n 友好），点击 `actions.setView(id)`
  （`APP\dsh-client-ui-conversation\lib\client.js:6995-7008`、:9485-9501）。
- 会话体一次只渲染激活的那个：`renderSlot("conversation.view", {...}, { only: active.id })`
  （同文件 :7036-7044；only 过滤实现在 `APP\dsh-client-web-react\lib\index.js:695-713`）。
- 激活 id 存在 chat store（`persist: "dsh.conversation.chat"`，按会话 key 到 localStorage，
  同文件 :23-47）；持久化的 id 失效时静默回落 chat（:6914-6919）——**插件卸载不会白屏**。

### 1.2 任务状态已免费推送到前端（列表部分零新增后端）

数据链路（全部核实）：

```
ctx.jobs.start(spec)                          APP\dsh-jobs-local\lib\index.js:131
  → onJobsChanged                             :264（注册）/:350-356（触发）
  → apiproxy 推 'session/jobs' 全量快照帧      APP\dsh-host-apiproxy\lib\index.js:3677-3691
    字段 = {id,kind,label,status,detail?,startedAt,finishedAt?}（jobViews :1227-1237）
  → client-runtime 折叠 jobsBySession[sessionId]  APP\dsh-client-runtime\lib\client.js:8312-8317
  → 组件用 slot 注入的 useSessions 选取         官方样例 APP\dsh-client-ui-jobs\lib\client.js:117-118
```

要点：
- `useSessions` **不是 import**，是 session 作用域插槽组件的标准注入 prop
  （shell 构造：`APP\dsh-client-web\lib\index.js:59`；契约表
  `APP\dsh-cordis-client-runner\lib\client.js:2828-2836`）。
- 空集合以"键缺失"表示，选择器外侧 `?? NO_TASKS`（模块级常量保持数组恒等，
  `APP\dsh-client-ui-jobs\lib\client.js:37-38`）——照抄该模式。
- owner 隔离：帧按 `jobs.list(owner)` 生成，只含"本会话拥有 + 无主"任务
  （`APP\dsh-jobs-local\lib\index.js:178-181`）。本插件的任务恒有 owner
  （`src/index.ts:654` 传 `exec.agent`），所以按 `kind==='claude-code'` 过滤后
  **天然就是本会话自己的任务**。

### 1.3 输出与取消必须走插件自有通道（宿主没有，且两个 seam 坑必须绕行）

- **宿主没有任何 jobs 的 Client→Host RPC**：apiproxy 全文只有推送与 schema，无 unary 路由；
  `dsh-api-remotes` 挂载的命名空间只有 commands/goals/dynamicCordisRunner/pluginInventory/
  messageFeedback（`APP\dsh-api-remotes\lib\client.js:5915-5920` 一带），**无 jobs**。
  官方任务列表因此是纯只读的（无 kill、无输出，`APP\dsh-client-ui-jobs\lib\client.js` 全文 289 行核实）。
- **坑 A（单游标）**：`ctx.jobs.read()` 无 offset 参数、直接转调生产方 `readOutput()` 排空增量，
  且终态时置 `job.reported = true`（`APP\dsh-jobs-local\lib\index.js:187-196`）——UI 用它会和
  模型侧 `job_output` 抢字节、还会吞掉完成通知。
- **坑 B（kill 语义）**：`ctx.jobs.kill()` 两个分支都置 `reported = true`
  （同文件 :197-209），UI 调它模型将永远不知道任务被杀。
- **绕行（本插件恰是任务生产方，两坑全可绕）**：输出走插件自有的绝对 offset 快照缓冲
  （`src/index.ts:427-450` 的 `full` 缓冲改造），取消走插件手里的 AbortController
  （`src/index.ts:504-512` 的 cancel 闭包）→ `done` 正常以 `{status:'killed'}` 结算 →
  模型照常收到完成通知。详见 §4。

### 1.4 第三方静态 npm 插件可注入 Client bundle（实机验证）

- 发现机制：`dsh-client-modules` 读 `package.json` 的 `dsh.client`（`platform` 必须字面量
  `"web"`）+ `exports["./client"]`，写进 `window.__DSH_BOOT__` 启动图，按
  `/plugins/<pkg>/client.js?rev=<sha1>` 路由 serve
  （`APP\dsh-client-modules\lib\index.js:238-264`、:91-99、:313-344）。
- bundle 契约：经典 script，整体为
  `window.__ModuleLoader__.load({ id: "<包名，必须完全一致>", factory: (require) => {...} })`
  （加载器强校验 id：`APP\dsh-client-modules\lib\client.js:83-84`）。
- `require()` 可解析的**只有 12 个**：`react`、`react/jsx-runtime`、`react-dom`、
  `react-dom/client`、`@deepseek-ai/cordis`、`dsh-client-ui-slots`、`dsh-client-web-react`、
  `dsh-client-ui-primitives`、`dsh-client-ui-attachment`、`dsh-client-schema-form`
  （seed 表，shell 源码 `Um()` 函数核实）+ 2 个 shell 静态
  （`dsh-client-app-shell`、`dsh-client-modules`）+ 已注册的其他插件 bundle。
  其余依赖必须 vendor 进自己的 bundle。React 是 **18**。
- **实证**：`PROF\dsh-better-sidebar\`（第三方非 @deepseek-ai 域 npm 包）就是同构双面包，
  其 `lib/client.js:1-2` 即 `id: "dsh-better-sidebar"` 的裸包名注册，正在本机运行。

### 1.5 入口位置取舍：conversation.view 新 tab 为主方案

| 方案 | 判断 | 理由 |
|---|---|---|
| **conversation.view 第三 tab（主方案）** | ✅ 采用 | 用户明确要的形态；契约明文支持（replaceRisk:none + 官方示例）；整个会话体做展示面积，容得下"终端窗口"；chat/trajectory 同款注册方式 |
| header.actions 弹层按钮（备选） | 保留为 P2 快捷入口 | 官方任务列表同款位置（`APP\dsh-client-ui-jobs\lib\client.js:270-281`，`id:'job-list', order:20`）；弹层面积小、放不下终端流；可做"运行中计数角标，点击跳 tab"——但注意程序化切 tab 受限（见 §7.6），P2 再评估 |
| conversation.details.tool 详情列（备选） | 不采用 | single 型、与工具调用选中态耦合，不适合独立监控入口 |

已知代价（如实告知）：tab 标签**只支持纯文本**（按钮 children 就是 label 字符串，
`APP\dsh-client-ui-conversation\lib\client.js:7006`，无 icon 字段）；tab 条顺序按注册台账序
（插件加载序）而非 order 排（:9485-9501 用 `slots.entries` 原始序）——我们的 tab 大概率
排在 chat/trajectory 之后，正好符合"右边"的需求，但严格说由加载序决定，不由 `order:100` 保证。

---

## 2. UI 结构设计

### 2.1 布局（左右分栏，整个会话体）

```
┌─ [对话] [轨迹] [Claude Code] ───────────────────────────────── 会话头 tabs ─┐
│ ┌─ 任务列表（左栏，~260px）──┐ ┌─ Claude Code 窗口（右栏，flex:1）────────┐ │
│ │ ● running  重构 tracker…  │ │ 任务头：label · jobId · claude sessionId │ │
│ │   00:12:34   [取消]       │ │ 统计条：12 turns · $0.13 · 3m20s · 状态  │ │
│ │ ✓ completed 修 bug 补测试 │ │ ┌─ 输出区（等宽、自动滚动）────────────┐ │ │
│ │ ✗ failed    写插件脚手架  │ │ │ …streaming text…                    │ │ │
│ │ ◼ killed    …             │ │ │ [tool] Edit        ← 高亮行         │ │ │
│ │                           │ │ │ …streaming text…                    │ │ │
│ └───────────────────────────┘ │ └─────────────────────────────────────┘ │ │
│                               │ 操作行：[取消] [复制输出] [复制sessionId]│ │
│                               └──────────────────────────────────────────┘ │
│ （composer 悬浮在底部——根元素带 data-conversation-composer-overlay）        │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 任务列表（左栏）

- 数据源：`useSessions(s => s.jobsBySession[sessionId]) ?? NO_TASKS`，过滤
  `kind === 'claude-code'`；排序照抄官方：运行中按 startedAt 升序在前、已结束按新到旧
  （`APP\dsh-client-ui-jobs\lib\client.js:101-109`）。
- 每行：状态徽标（running=脉冲点 / completed=✓ / failed=✗ / killed=◼，跟随 primitives
  主题变量，不硬编码色值）+ label（截断）+ jobId（小字）+ 耗时（running 用 tick 计时，
  终态用 finishedAt−startedAt）+ 行内取消按钮（仅 running）。
- 状态变更**由宿主推送免费驱动**（`session/jobs` 帧全量快照、last-wins），无需轮询。
- 选中态：点击行 → 右栏切到该任务；默认选中最新的 running 任务，无 running 则选最新一条。

### 2.3 Claude Code 窗口（右栏）

- **任务头**：label 全文（title 提示完整 task 文本，来自 remote 的 taskPreview）、jobId、
  claude sessionId（终态回填，一键复制，提示"作为 resume 参数可续接该会话"）。
- **统计条**：turns / 耗时 / 费用（costUsd）——running 时显示"耗时（实时）+ 状态"，
  终态回填全量（数据源见 §3 remote listJobs；`runClaude` 已在 result 消息拿到
  `num_turns / total_cost_usd / duration_ms / session_id`，`src/index.ts:373-391`）。
- **实时输出区**：
  - 等宽字体（`ui-monospace` 栈），`white-space: pre-wrap`，暗底终端观感但取色自
    primitives 主题变量；
  - 增量追加：按绝对 offset 轮询拉增量（§3），append-only，DOM 上限 ~2000 行/500KB，
    超限丢头部并显示"…更早输出已截断…"（与后端 `MAX_LIVE_BUFFER=500_000` 对齐，
    `src/index.ts:16`）；
  - 自动滚动：贴底时跟随滚动；用户上滚则暂停跟随并显示"↓ 回到底部 (N 新行)"浮钮；
  - `[tool] Xxx` 行高亮：后端 onDelta 已注入该标记（`src/index.ts:364`），前端按行首
    `/^\[tool\] /` 正则染色加粗——纯展示层约定，无需改协议；
  - 展开/收起：输出区可折叠成单行摘要（列表页优先的窄屏形态）。
- **操作行**：取消（running 时，二次确认）；复制全部输出；复制 claude sessionId。
- **终态形态**：completed 显示最终结果文本（remote 回填 finalOutput）+ 统计；
  failed/killed 显示 `detail`（失败诊断已被 0.2.0 的 describeFailure 映射为可操作提示，
  `src/index.ts:234-241`）+ 已收到的输出快照。

### 2.4 空态

- 本会话无 claude-code 任务：居中提示"暂无 Claude Code 委派任务 —— 对话里让我
  `run_in_background: true` 派一个试试"+ 说明"任务只存在于当前 DSH 进程内，重启后列表为空；
  历史结果看对话里的工具卡片"。
- tab 本身**不做条件隐藏**：list 槽位无按会话动态显隐机制（注册即出现在 tab 条），
  空态页承担引导职责。
- 无会话（hero 页）：conversation.view 整体不渲染（session 严格作用域，
  `APP\dsh-client-web-react\lib\index.js:621-623`），无需处理。

---

## 3. 数据流设计

### 3.1 分层：状态走宿主推送（免费），输出/元数据/取消走插件自有 RPC

| 数据 | 通道 | 更新方式 |
|---|---|---|
| 任务集合 + 状态 + label + 起止时间 | `jobsBySession` 镜像（宿主 `session/jobs` 帧） | 推送，免费实时 |
| 元数据（cost/turns/claudeSessionId/task 全文/finalOutput） | 插件 remote `listJobs(sessionId)` | tab 激活时拉一次；镜像状态变更（有任务进入终态）时再拉 |
| 实时输出增量 | 插件 remote `readOutput(sessionId, jobId, fromOffset)` | **仅 tab 激活且选中任务 running 时**每 1s 轮询；进入终态后补拉一次收尾 |
| 取消 | 插件 remote `cancel(sessionId, jobId)` | 点击触发，二次确认 |

### 3.2 插件自有 RPC 的实现形态（本机源码核实的两条路）

**主方案：Host 端 `TypertRemoteService` + `@Remote`，Client 端裸调 `ctx.connection.rpc.call`。**

- Host：`@deepseek-ai/dsh-typert-protocol` 导出 `TypertRemoteService` / `@Remote`
  （`APP\dsh-typert-protocol\lib\index.js:140`；类定义 :52-66，装饰器 :67-76）。
  服务 key 即 wire 命名空间。
- gateway 有 **SRC 反射模式**：`claimsEndpoint` 找不到 typert 注册时，运行时扫描 live service
  的 `typertRemote` 绑定 + `@Remote` 标记收集端点（`APP\dsh-api-gateway\lib\index.js:65-85`），
  **无需 typert codegen**（本机也没装 dsh-typert-generator）。
- Client：`ctx.remote.<ns>` 的类型化门面**只接受 strict codegen 贡献**
  （`APP\dsh-api-gateway\lib\client.js:379-387` 强校验；README.zh 明文"Client 侧只能挂载
  严格模式生成的贡献项"），第三方拿不到 codegen——**所以跳过 `ctx.remote`，直接用底层**：
  ```js
  // client 半边，exports.inject = ['slots', 'connection']
  const r = await ctx.connection.rpc.call('/api', 'claudeCode/readOutput',
    { args: { sessionId, jobId, fromOffset } }, signal)
  // 传输原语：APP\dsh-client-connection\lib\client.js:10093-10114（同源 fetch POST /api/<ns>/<method>）
  // gateway 派发要求 payload 恰为 { args: {...} }：APP\dsh-api-gateway\lib\index.js:117-133
  // 返回 { ok:true, value } | { ok:false, error:{code,message} }，自己做薄封装与校验
  ```
- 该路的门禁复用 gateway 的 `trusted-host` authority（`APP\dsh-api-gateway\lib\index.js:60-63`），
  不用自己写安全 fence。

**备选（成熟逃生口）：自注册 `ctx.webServer` 路由 + 同源 fetch/WebSocket。**
dsh-better-sidebar 全套实证：prefix 路由 `/sidebar/api/<method>`（`{ok,value}|{ok,error}` 信封，
`PROF\dsh-better-sidebar\src\client\api.ts:97-118`）、`registerUpgrade` 挂 WS
（`lib\index.js:2737-2762`）、自带 loopback trust fence（`src\trust-fence.ts:1-9`，
因为绕开了 gateway 就得自己防 DNS-rebinding）。代码量更大，但完全不依赖 SRC 模式；
若 §7.1 的 SRC 风险实测不过，整体降级到这条路，接口形状不变。

### 3.3 轮询 vs 推送：**推荐轮询（v1），理由如下**

- 宿主对"输出变更"**没有任何事件通道**（jobs seam 只在状态变更时 notifyChanged；输出字节
  到达不触发 emitter）——推送必须自建 WS（better-sidebar 路子），引入一整套连接管理。
- 轮询是**严格有界的**：仅"监控 tab 激活 + 选中任务 running"时开 1s 定时器；tab 切走即组件
  卸载（only 过滤把非激活视图移出 React 树），定时器自然销毁；增量按 offset 读，空转一次
  就是一个 <1KB 的同源 POST。委派任务同时运行数通常 ≤2，成本可忽略。
- 1s 粒度对"看任务是否正常执行"的场景足够（Claude Code 输出本身是句级流）。
- 若将来要打字机级顺滑再上 WS 推送（P3，逃生口已验证）。

### 3.4 owner 隔离

- remote 三个方法全部校验 `TrackedJob.ownerSessionId === 入参 sessionId`，不符抛错——与
  `dsh-jobs-local` 的 `assertAccess`（owner.id 相等即授权，`APP\dsh-jobs-local\lib\index.js:313-315`）
  同强度；sessionId 由插件 Host 端在 `startBackgroundJob` 登记（`exec.agent.id`），Client 端
  传的是自己插槽拿到的 `sessionId` prop。
- 镜像侧天然隔离（§1.2）：`session/jobs` 帧按 owner 生成，claude-code 任务恒有 owner。

---

## 4. 组件与代码结构

### 4.1 Host 端（node 半边）

```
src/index.ts        现有：claude_code 工具 + skill（微改，见集成点）
src/tracker.ts      新增：JobTracker —— Map<jobId, TrackedJob>
src/remote.ts       新增：ClaudeCodeRemote extends TypertRemoteService(ctx, 'claudeCode')
```

**TrackedJob**（吸收 DESIGN-0.3.0-jobs-ui.md §3.1，仍然成立）：

```ts
interface TrackedJob {
  jobId: string
  ownerSessionId?: string          // exec.agent.id
  task: string                     // 完整任务文本
  status: 'running' | 'completed' | 'failed' | 'killed'
  startedAt: number; finishedAt?: number
  read(fromOffset: number): { text: string; nextOffset: number; truncated: boolean }
  cancelFromUi(): boolean          // 走内部 abort（坑 B 绕行）
  claudeSessionId?: string; costUsd?: number; numTurns?: number; durationMs?: number
  finalOutput?: string; failureDetail?: string
}
```

**与 0.2.0 代码的集成点**（改动都在 `startBackgroundJob`，`src/index.ts:458-515`）：

1. `jobs.start(...)` 返回 jobId 后立即 `tracker.register(jobId, {...})`，用闭包把 `run()` 里的
   缓冲与 cancel 引用接进 TrackedJob（jobId 在 start 返回值处才拿到，`run()` 同步执行，时序成立）。
2. `full` 缓冲改造：`createBuffer`（`src/index.ts:427-450`）加 `absoluteBase` 记账（已丢弃
   字符数），新增 `read(fromOffset)`：`fromOffset < absoluteBase` 时从 base 起读并置
   `truncated:true`。`pending` 缓冲（模型侧 job_output 用）**保持原样，两游标互不相干**。
3. `done` 结算处回填元数据：`runClaude` 的 RunOutcome 已含
   `sessionId/costUsd/numTurns/durationMs/output`（`src/index.ts:414-425`），当前后台路径
   把它们扔掉了，改为透传给 tracker。
4. UI 取消：`cancelFromUi()` 复用现有 cancel 闭包（置 `cancelled=true` → 清 timer →
   `abort('cancelled')`，`src/index.ts:504-509`），done 以
   `{status:'killed', detail:'cancelled by user (UI)'}` 收尾 → 注册表正常 settle →
   模型照常收到完成通知（坑 B 完全绕开）。
5. 保留策略：已结束任务按会话保留最近 20 条（jobs seam 里 owner dispose 即删，但我们的
   镜像自己管生命周期）；不持久化，进程重启即空。
6. `inject`：`'jobs'` 保持可选获取不变；remote 服务自身按 `TypertRemoteService(ctx,'claudeCode')`
   注册即可被 gateway SRC 扫描发现，无需额外 inject（gateway 在 Host 组合里常驻）。

**ClaudeCodeRemote**：

```ts
class ClaudeCodeRemote extends TypertRemoteService {
  constructor(ctx) { super(ctx, 'claudeCode') }
  @Remote async listJobs(sessionId: string): Promise<JobInfo[]>
  @Remote async readOutput(sessionId: string, jobId: string, fromOffset: number):
    Promise<{ text: string; nextOffset: number; truncated: boolean; status: string }>
  @Remote async cancel(sessionId: string, jobId: string): Promise<'requested' | 'already-finished'>
}
```

### 4.2 Client 端（web 半边）

```
src/client/index.ts            入口：exports.apply / exports.inject = ['slots','connection']
src/client/ClaudeCodeView.tsx  视图组件：左列表 + 右窗口（根元素带 data-conversation-composer-overlay）
src/client/OutputView.tsx      实时输出区（等宽/自动滚动/增量 append/[tool] 高亮）
src/client/api.ts              rpc 薄封装（ctx.connection.rpc.call('/api', 'claudeCode/…', {args})）
src/client/locales.ts          zh/en 词条（label：'Claude Code'）
```

**入口接线**（chat/trajectory 同款；必须包在 `slots.inject` 里等待声明，直接 register 会在
加载序不利时抛 "not declared"，`APP\dsh-client-ui-slots\lib\index.js:66`）：

```ts
export const inject = ['slots', 'connection']
export function apply(ctx: Context) {
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'claude-code',
    order: 100,
    label: () => 'Claude Code',   // 纯文本；接 locale 服务后换 t()
  }, ClaudeCodeView))
}
```

**组件拿到的 props**（session 标准 kit 自动注入，`APP\dsh-client-web-react\lib\index.js:486-500`、
:401-433）：`sessionId`、`useSessions`（列表镜像就从这取）、`useSession`、`useProjection` 等，
外加 owner props `inspect/onInspectDone`（可忽略）。

**关键实现约定**：
- 根元素必须带 `data-conversation-composer-overlay=""` 属性才能获得"全高自滚、composer
  悬浮底部"的布局（trajectory 同款：`APP\dsh-client-ui-trajectory\lib\client.js:7246-7248`；
  对应 CSS 规则内嵌在 `APP\dsh-client-ui-conversation\lib\client.js:6751`）。**该属性契约
  未写进插槽文档，是从 trajectory 源码挖出来的**——需要自己给底部预留 composer 高度。
- 非激活视图会被**整体卸载**（only 过滤移出树），组件本地 state 全丢——输出缓存、offset、
  选中任务 id 存**模块级 per-session 缓存**（Map<sessionId, PanelState>，容量有界），
  切 tab 回来续读而不是从 0 重拉。
- 依赖面：只 `require` seed 表内的 `react`、`react/jsx-runtime`、
  `@deepseek-ai/dsh-client-ui-primitives`；其余（若有）vendor 进 bundle。React 18 语法。
- 崩溃容错：每个 view 条目外面有宿主的 SlotErrorBoundary（keyed by session，
  `APP\dsh-client-web-react\lib\index.js:583-599`），我们的面板崩了只废自己这个 tab。

---

## 5. 构建与打包

对照 better-sidebar（`PROF\dsh-better-sidebar\package.json`）与 loader 校验逻辑：

| 文件 | 变更 |
|---|---|
| `package.json` | ① `exports` 加 `"./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }`；② 加 `"dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-ui-conversation"] } }`（`bundle.patch` 保持不变）；③ `files` 加 `lib/client.js`（缺文件 → `MissingClientBundleError`，整个 clientModules fiber FAILED，`APP\dsh-client-modules\lib\index.js:265-279`）；④ peerDeps 加 `react ^18.2.0`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-typert-protocol`；devDeps 加 `@types/react ~18.3`、bundler |
| 构建 | node 半边维持 `tsc`；client 半边新增 bundler 步骤（esbuild 或 better-sidebar 同款 tsdown）：入口 `src/client/index.ts` → `lib/client.js`，**CJS、经典 script、外层手工/banner 包 `window.__ModuleLoader__.load({ id: "dsh-claude-code", factory: (require) => {...} })`**（id 必须精确等于包名，loader 强校验），externals = 12 个 seed id。`npm run build` 串两步，并加产物存在性断言 |
| `cordis.patch.yml` | 不变（client 入口不在这里声明；`dsh.client` 仅 web 平台消费，headless/CLI 下 node 半边行为不变） |

**loader 侧硬约束**（来自源码的失败模式）：
- `platform` 非 `"web"` → 静默当作非 client 包，**且负判定永久缓存**——给现有已装插件加
  client 半边后必须重启 DSH（`APP\dsh-client-modules\lib\index.js:239-252`）。
- 声明了 `dsh.client` 但 `exports` 无 `"./client"` → loud throw（:256）。
- factory 内 require 循环 → 致命（`APP\dsh-client-modules\lib\client.js:98`）。
- `dsh.client.inject` 实际是"构建期 externals 声明"镜像到 wire；**真正的时序保证来自
  client 模块自己导出的 cordis `inject` 数组**（shell 只消费 id 与 immediately）。两处都要写对。

---

## 6. 里程碑拆分

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **P0**（可并入 0.2.x） | `done.detail` 富化为 `$0.13 · 12 turns · 3m20s`（改 `src/index.ts:482` 一行） | 官方自带任务列表行内即显示成本/轮数/时长，零前端代码 |
| **P1 = MVP（0.3.0 主体）** | JobTracker + ClaudeCodeRemote（listJobs/readOutput/cancel）+ client 半边（第三 tab + 任务列表 + 实时输出轮询 + 取消）+ 打包链路 | ① 会话头出现第三个 tab "Claude Code"，点击整个会话体切换，chat/trajectory 不受影响；② 派一个 `run_in_background` 任务，1s 内出现在列表、状态实时变化；③ 右栏输出滚动追加、`[tool]` 行高亮、自动滚动可暂停；④ UI 取消后：列表变 killed、模型侧收到完成通知（job_output/通知不丢）、`job_output` 游标不受 UI 读取影响；⑤ 无任务/无会话/重启后空态文案正确；⑥ headless 模式插件加载不受影响 |
| **P2（0.3.x）** | 元数据打磨（复制 claudeSessionId → resume 流、复制输出、失败 detail 展示）、header.actions 计数角标入口、i18n | 复制的 sessionId 直接可用于 resume；角标计数与列表一致 |
| **P3（不承诺）** | WS 输出推送（webServer 路由逃生口顺便升级）、`tool.call.toolview` key='claude_code' 自定义工具卡片、历史持久化 | — |
| **远期（探索）** | "直接把 Claude Code 交互嵌进面板"：当前 Agent SDK `query()` 是单向流、无交互输入通道；真交互 = 面板内嵌 PTY 跑 claude CLI（better-sidebar 的 terminal WS 模式可整套借鉴）。技术可行但属另一个产品形态，独立立项评估 | — |

P1 工作量估计：node 半边 ~250 行增量，client 半边 ~500 行 + 打包配置。

---

## 7. 风险与待确认点（逐条给出"如何确认"）

1. **gateway SRC 声明缓存的时序**：`claimsEndpoint` 里 `this.srcClaims ??= collectSrcClaims()`
   ——首次未知端点触发收集后**永久缓存**（`APP\dsh-api-gateway\lib\index.js:69`）。静态插件
   在 Host 启动期就 mount，早于任何浏览器请求，理论上安全；但若有其他动态插件更晚 mount
   会暴露同样问题。**如何确认**：P1 实现后重启 DSH，第一件事在 DevTools 里裸调
   `fetch('/api/claudeCode/listJobs', …)` 验证；若 404/未 claim，降级 §3.2 备选路（webServer 路由）。
2. **SRC 模式是"开发阶段回退路径"**（gateway README.zh 原话），无版本承诺，DSH 升级可能
   收紧。**如何确认**：每次 DSH 升级后跑一次 P1 验收 ③；备选路（webServer）保持接口形状
   一致，可整体替换传输层。
3. **`data-conversation-composer-overlay` 是未文档化契约**（只在 trajectory 源码与
   ui-conversation 内嵌 CSS 里存在）。**如何确认**：实现时目测三态（激活 tab 全高滚动 /
   composer 悬浮 / 切回 chat 布局复原）；若失效，退化为"面板自身内部滚动 + 忍受 composer
   占位"，功能不损。
4. **tab 条顺序由插件加载序决定**（台账序，非 order）。**如何确认**：装好后看 tab 是否在
   "轨迹"右边；若被排前，调整 profile 里插件加载顺序即可（无代码改动）。
5. **`jobsBySession` 镜像、seed 表、插槽契约均为 DSH 内部约定**，大版本升级可能破坏
   client 半边（node 半边只依赖 `ctx.jobs.start`，很稳）。缓解：宿主 error boundary 已验证
   能把崩溃隔离在本 tab 内。**如何确认**：升级后冒烟 P1 验收 ①②。
6. **程序化切 tab 不可行**：激活 id 存在 ui-conversation 包私有的 chatStore 闭包里，第三方
   条目拿不到 `setView`（`APP\dsh-client-ui-conversation\lib\client.js:9470`、:9741）。影响：
   P2 的角标入口只能提示、不能一键跳转。**如何确认**：P2 前复查新版本是否开放 actions；
   不开放则角标 hover 提示"点击顶部 Claude Code 标签查看"。
7. **给已装插件加 client 半边必须重启 DSH**（包元数据负判定永久缓存 + 插件集变更本就要
   重启）。**如何确认**：部署脚本里写死"覆盖 → 重启 → 验收"三步。
8. **多窗口/面板反复开合**：readOutput 带绝对 offset、无服务端游标，天然多消费者安全；
   唯一共享可变态是 500KB 环形缓冲的头部丢弃（truncated 标记向 UI 如实展示）。
   **如何确认**：开两个窗口同看一个 running 任务，输出一致、模型侧 job_output 不受影响。
9. **无主任务掺和**：`jobs.list` 会把 `owner === undefined` 的任务混进每个会话的帧
   （`APP\dsh-jobs-local\lib\index.js:180`）。本插件任务恒有 owner，按 kind 过滤即免疫；
   但**不要**去掉 `owner: exec.agent` 传参。**如何确认**：code review 断言 + 验收 ④。

## 8. 明确排除项

- 不 fork / 不 patch `dsh-client-ui-jobs`、`dsh-jobs-local`、apiproxy；官方头部任务列表照常
  显示同一批任务（并存设计的代价，不禁用）。
- 不做任务持久化、不做跨会话视图（owner 隔离与宿主语义一致）。
- 不做前台（非 background）调用的面板展示——前台结果已有工具卡片。
- 不用 `ctx.jobs.read()` / `ctx.jobs.kill()`（坑 A/B，§1.3）。
