# DESIGN：dsh-claude-code 后台任务 UI 面板（0.3.0 候选）

> 状态：设计文档（未实现）。日期：2026-08-19。
> 本文档 = 可行性评估 + 完整设计。全部结论基于对本机 DSH Desktop
> （`C:\Users\Administrator\AppData\Local\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\`）
> 实际源码的调研，关键断言均附文件路径。

## 0. 需求与假设

原始需求（用户表述在记录中被截断，此处按最合理解释补全，实现前请与用户确认第 9 节的开放问题）：

> dsh-claude-code 已有后台任务能力（run_in_background 接入 DSH 的 ctx.jobs）。
> 想要一个 UI 面板，能看到【假设：当前会话派出的 Claude Code 后台任务——列表、状态、
> 实时输出、成本/轮数/sessionId 等元数据，并能取消任务】。

**假设的功能范围**（P1 = 必须，P2 = 顺手，P3 = 以后）：

| 优先级 | 功能 |
|---|---|
| P1 | 任务列表：状态、任务摘要、耗时（含已结束任务） |
| P1 | 单任务详情：实时输出流（增量刷新）、最终结果 |
| P1 | 取消按钮（且模型侧能正确得知任务被取消） |
| P2 | 元数据：costUsd / numTurns / Claude sessionId（可复制，用于 resume） |
| P3 | claude_code 工具调用的自定义卡片、设置页 |

---

## 1. 可行性结论：**可行**（三个关键判断全部有实证）

### 1.1 第三方 npm 插件可以给 DSH Desktop 前端注入 UI —— 已实机验证

- 前端 shell 是闭合的 vite 产物，但内建**运行时模块注册表**：node 侧 `dsh-client-modules`
  扫描每个已启用 cordis entry 的 `package.json`，发现 `dsh.client` 声明 + `exports["./client"]`
  后，把 `/plugins/<pkg>/client.js?rev=<sha1>` 写进 `window.__DSH_BOOT__` 启动图，
  浏览器端 `ClientModuleSystem` 动态 `<script>` 加载，bundle 顶层调
  `window.__ModuleLoader__.load({ id: "<包名>", factory })` 注册。
  （`dsh-client-modules/lib/index.js:249-263`；插件 JS 由该包以 `/plugins` prefix 路由 serve，
  不走 `dsh-host-frontend-static`。）
- **实证**：本机 `~/.dsh/profiles/desktop/node_modules/dsh-better-sidebar`（第三方 GitHub 包，
  非 @deepseek-ai 域）就是"后端 + 客户端 UI"双面包，423KB 的 `lib/client.js` 正在
  `conversation.chat.turnTail` 和 `settings.section` 插槽里跑。dsh-claude-code 走同一条路。
- 前端框架：**React 18**（不是 19），共享模块通过 seed table 外部化（可 require 的只有 10 个：
  `react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、
  `dsh-client-ui-slots`、`dsh-client-web-react`、`dsh-client-ui-primitives`、
  `dsh-client-ui-attachment`、`dsh-client-schema-form`），其余依赖必须 vendor 进自己的 bundle；
  跨插件协作走 cordis service 注入（`dsh.client.inject`），禁止跨插件 JS import。

### 1.2 任务状态已经免费推到前端 —— 面板的"列表"部分零新增后端代码

- `ctx.jobs.start({kind:'claude-code',…})` 的任务**已经**出现在 DSH Desktop 自带的
  会话头部任务列表里（`dsh-client-ui-jobs`，默认随 `dsh-web-app` bundle 加载）。
- 数据链路：`dsh-host-apiproxy` 订阅 `jobs.onJobsChanged`，把
  `{ id, kind, label, status, detail?, startedAt, finishedAt? }` 全量快照帧（`session/jobs`）
  推给前端，`dsh-client-runtime` 折叠成 store 上的 `jobsBySession[sessionId]`
  （`dsh-host-apiproxy/lib/index.js:3634-3691`、`dsh-client-runtime/lib/client.js:8312-8320`）。
- **我们的面板直接订阅同一个 store、按 `kind === 'claude-code'` 过滤即可拿到实时状态**，
  不需要自建状态推送。
- 但该镜像**不含输出、不含操作通道**（自带列表是只读的，无 kill、无输出查看、无按 kind 定制点），
  这正是本设计要补的增量。

### 1.3 两个已知深坑都有干净的绕行方案（因为本插件恰好是任务生产方）

**坑 A：实时输出是单游标消费流。** `ctx.jobs.read()` 直接转调生产方的 `readOutput()`，
无参数、副作用推进唯一 offset —— UI 调它会和模型侧 `job_output` 互相抢字节；seam 上没有
全量/带 offset 的读法（`dsh-jobs-local/lib/index.js:187-196`；`dsh-jobs/README.zh.md:38`
把"独立观察者需要游标或快照 API"列为已知限制）。
**绕行：不走 jobs seam。** 本插件自己维护着每个任务的 `full` 快照缓冲
（`src/index.ts:466-513` 已存在，`pending` 给 job_output 增量、`full` 给快照），
只需在插件后端加一个**自有 remote API** `readOutput(jobId, fromOffset)`，
从自己的缓冲按绝对 offset 读——与模型侧游标完全无关，天然支持多个 UI 消费者。

**坑 B：UI 侧 kill 有 seam 级语义缺陷。** `ctx.jobs.kill()` 会把终态投递标为已上报
（`reported`），按当前契约从 UI 调它会让模型永远不知道任务已被杀
（`dsh-client-ui-jobs/README.zh.md:23` 明文记录，这也是官方列表至今没做 kill 按钮的原因）。
**绕行：不调 `ctx.jobs.kill()`。** 插件手里有每个任务的 AbortController：UI 取消走插件
内部 cancel 路径 → `runClaude` 中止 → `done` promise 正常以
`{ status:'killed', detail:'cancelled by user (UI)' }` 收尾 → 注册表正常结算 →
`onJobDone` 触发 → `dsh-tool-jobs` 照常给模型送完成通知。**模型能正确得知任务被取消**，
完全避开 seam 缺陷。

### 1.4 后端→前端 RPC：第三方可注册，无需 codegen

后端服务继承 `TypertRemoteService` + `@Remote` 装饰器即可（`dsh-goal/lib/index.js` 是官方范例），
gateway 有 SRC 反射模式，运行时扫描 live service 收集端点，**不做 typert codegen 也能跑**
（降级为宽松模式，无 zod 校验）。前端经 `@deepseek-ai/dsh-api-remotes` 用
`ctx.remote.<namespace>.<method>()` 调用。

### 1.5 明确不可行 / 不做的

- **任务跨重启存活**：`dsh-jobs-local` 纯内存（`store = new Map()`），owner Agent 一 dispose
  记录即删；跨进程后端需重塑整个 seam（`dsh-jobs/README.zh.md:40`）。不做——面板如实展示
  "重启后列表为空"。
- **扩展官方 `dsh-client-ui-jobs` 的行渲染**：该组件封闭（行 JSX 写死、无 per-kind 注册点），
  替换整个槽位会连带塌掉其他插件的条目（`replaceRisk: "shadows-shipped-ui"`）。不碰它，
  我们**并排新增自己的条目**。
- **扩展 `presentCall` 的 card 枚举**：card 词汇封闭（generic/diff/terminal/web/search/read），
  自定义卡片走 `tool.call.toolview` keyed 插槽（P3）。

---

## 2. 总体架构

```
┌─ dsh-claude-code（一个 npm 包，双面）─────────────────────────────┐
│                                                                    │
│  node 半边（lib/index.js，现有代码 + 增量）                        │
│  ├─ claude_code 工具（不变）                                       │
│  ├─ JobTracker：镜像登记每个后台任务                               │
│  │    jobId → { task, ownerSessionId, status, full缓冲(绝对offset),│
│  │              cancelFn, claudeSessionId?, costUsd?, numTurns? …} │
│  └─ ClaudeCodeRemote extends TypertRemoteService(ctx,'claudeCode') │
│       @Remote listJobs / readOutput / cancel                       │
│                                                                    │
│  client 半边（lib/client.js，新增，CJS factory bundle）            │
│  ├─ 状态：订阅 dsh-client-runtime 的 jobsBySession 镜像            │
│  │        （过滤 kind==='claude-code'；状态变更由宿主免费推送）    │
│  ├─ 输出/元数据/取消：ctx.remote.claudeCode.*（轮询式增量读）      │
│  └─ 插槽：conversation.session.header.actions（list, id 独立,     │
│           order 100）→ 触发按钮 + 弹层面板                        │
└────────────────────────────────────────────────────────────────────┘
```

设计原则：**状态走宿主已有的推送镜像（免费、实时），输出与操作走插件自有 remote（绕开两个坑）**。
jobs seam 保持只用 `start()`——不给 seam 打补丁，不 fork 官方包，升级面最小。

---

## 3. node 半边设计

### 3.1 JobTracker（新增内部模块）

`startBackgroundJob`（`src/index.ts:458`）现有结构基本不动，在 `run()` 内把任务登记进
插件级 `Map<jobId, TrackedJob>`：

```ts
interface TrackedJob {
  jobId: string
  ownerSessionId?: string        // exec.agent.id，用于 remote 侧访问校验
  task: string                   // 完整任务文本（列表里展示截断版）
  status: 'running' | 'killed' | 'failed' | 'completed'
  startedAt: number; finishedAt?: number
  // 输出：绝对 offset 语义的环形缓冲（现有 full 缓冲改造）
  read(fromOffset: number): { text: string; nextOffset: number; truncated: boolean }
  cancelFromUi(): boolean        // 走内部 abort，见 §1.3 坑 B 绕行
  // 结束后回填的元数据
  claudeSessionId?: string; costUsd?: number; numTurns?: number; durationMs?: number
  finalOutput?: string; failureDetail?: string
}
```

要点：
- **缓冲改造**：现有 `createBuffer` 的 `full` 缓冲丢弃最老内容但不记账。改为记录
  `absoluteBase`（已丢弃的字符数），`read(fromOffset)` 在 `fromOffset < absoluteBase` 时
  从 base 起读并置 `truncated: true`。offset 以字符计，上限仍 500KB（`MAX_LIVE_BUFFER`）。
  `pending`（模型侧 job_output 用）**保持原样，互不影响**。
- **登记时机**：`jobs.start()` 返回 jobId 后立即登记（`run()` 同步执行，jobId 在
  `startBackgroundJob` 返回值处才拿到——实现时把登记放在 `jobs.start` 调用之后、
  用闭包把 hooks 里的缓冲/cancel 引用接进 TrackedJob）。
- **回填**：`done` 结算时写入 status / finishedAt / 元数据。`runClaude` 已在 result 消息里
  拿到 `session_id / total_cost_usd / num_turns / duration_ms`，透传即可。
- **保留策略**：jobs seam 里 owner dispose 即删记录，但我们的镜像自己管生命周期：
  已结束任务按会话保留最近 20 条，插件 dispose 时清空。**不持久化**（与 seam 语义一致，
  重启即空，面板显示空态文案）。
- **`kind: 'claude-code'` 不变**——自带列表与我们面板的过滤都依赖它。

### 3.2 Remote API（新增）

```ts
class ClaudeCodeRemote extends TypertRemoteService {
  constructor(ctx) { super(ctx, 'claudeCode') }

  @Remote async listJobs(sessionId: string): Promise<JobInfo[]>
  // JobInfo = { jobId, taskPreview, status, startedAt, finishedAt?,
  //             claudeSessionId?, costUsd?, numTurns?, durationMs?, outputLength }

  @Remote async readOutput(sessionId: string, jobId: string, fromOffset: number):
    Promise<{ text: string; nextOffset: number; truncated: boolean; status: string }>

  @Remote async cancel(sessionId: string, jobId: string):
    Promise<'requested' | 'already-finished'>
}
```

- **访问校验**：每个方法比对 `TrackedJob.ownerSessionId === sessionId`，不符抛错——
  与 `dsh-jobs-local` 的 `assertAccess`（SessionId 相等即授权）保持同一强度；gateway 是
  `trusted-host` authority，本地桌面场景够用。
- `readOutput` 带 offset 所以**无状态、天然支持多消费者**（多窗口、面板反复开合）。
- `cancel` 委托 `TrackedJob.cancelFromUi()`：设置 `cancelledBy: 'ui'` → 复用现有
  cancel 逻辑（清 timer + `abort('cancelled')`）→ `done` 以
  `{ status: 'killed', detail: 'cancelled by user (UI)' }` 收尾。detail 会同时出现在
  官方任务列表和模型收到的完成通知里。
- 依赖新增：`inject` 数组加 gateway 相关按 dsh-goal 的写法对齐（实现时以
  `dsh-goal/lib/index.js` 为模板核对 super 参数与注册细节）。**typert codegen 不做**，
  靠 SRC 反射模式。

### 3.3 顺手项（Phase 0，可先于 UI 单独发）

`done` 的 `detail` 现为 `turns: N, duration: Nms`。改为
`$0.13 · 12 turns · 3m20s`（成本置前，时长人性化）——官方自带任务列表的行内
`detail` 字段会直接显示它，**不写一行前端代码就先改善可见性**。

---

## 4. client 半边设计

### 4.1 插槽与形态

- **注册点**：`conversation.session.header.actions`（kind: list, scope: session, 加性槽位），
  `id: 'claude-code-jobs'`，`order: 100`（官方任务列表是 order 20，我们排它后面）。
  通过 `ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register(...))`
  注册——这是官方任务列表自己用的同款方式，第三方可用（已验证契约为加性）。
- **形态**：与官方任务列表一致的"触发按钮 + 弹层"模式（会话头部空间有限，弹层是该槽位的
  既有交互语言）：
  - 触发按钮：Claude 图标 + 运行中计数角标；**本会话没有 claude-code 任务时返回 null**（不占位）。
  - 弹层两级：**列表页**（每行：状态点 / 任务摘要 / 耗时 / 成本，点击进详情；运行中行有
    取消按钮）→ **详情页**（元数据头 + 输出滚动区 + 操作行）。
- 组件只用 seed 白名单里的 `@deepseek-ai/dsh-client-ui-primitives`（StateDot、弹层等
  官方基元）+ `react`/`react/jsx-runtime`，其余依赖 vendor 进 bundle。样式跟随
  primitives 的主题变量，不硬编码颜色。

### 4.2 数据流

| 数据 | 来源 | 更新方式 |
|---|---|---|
| 任务集合与状态 | `jobsBySession[sessionId]` 镜像，过滤 `kind === 'claude-code'` | 宿主 `session/jobs` 帧推送，**免费实时** |
| 元数据（成本/轮数/claudeSessionId） | `ctx.remote.claudeCode.listJobs(sessionId)` | 弹层打开时拉一次；收到镜像状态变更时再拉 |
| 实时输出 | `ctx.remote.claudeCode.readOutput(sessionId, jobId, offset)` | **仅详情页打开且任务 running 时**每 1s 轮询增量；任务进入终态后拉最后一次收尾 |
| 取消 | `ctx.remote.claudeCode.cancel(...)` | 按钮点击，二次确认 |

- 镜像的访问途径：`dsh.client.inject` 里声明 `@deepseek-ai/dsh-client-runtime`，
  经注入的 service 取 store selector（官方 `dsh-client-ui-jobs/lib/client.js:118` 用
  `useSessions(s => s.jobsBySession[sessionId])`，同款；**具体导出名以实现时核对该文件为准**，
  这是 client 半边唯一需要现场核对的 API）。
- 轮询而非推送是**有意的 v1 取舍**：宿主无输出事件通道（输出变更不触发任何 emitter），
  自建 WebSocket（dsh-better-sidebar 的做法）是成熟逃生口但增加一整套连接管理；
  1s 轮询 × 只在详情页打开时 × 增量 offset 读，成本可忽略。若将来嫌刷新粗糙再上 WS（P3）。
- 空态文案要点：说明"任务只存在于当前 DSH 进程内，重启后列表为空；历史结果看对话里的
  工具卡片"。

### 4.3 详情页操作

- 复制 `claudeSessionId`（提示"传给 claude_code 的 resume 参数可续接该会话"）。
- 复制全部输出。
- 取消（running 时）；killed/failed 显示 `failureDetail`。

---

## 5. 打包与接线变更

| 文件 | 变更 |
|---|---|
| `package.json` | ① `exports` 拆双入口：`"." → ./lib/index.js`、`"./client" → ./lib/client.js`；② 新增 `dsh.client: { platform: "web", inject: ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-api-remotes", "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-ui-conversation"] }`（精确 inject 列表实现时对照 `dsh-client-ui-goal/package.json`）；③ `files` 必须含 `lib/client.js`；④ devDeps 加 bundler + react 18 类型 |
| 构建 | node 半边维持 `tsc`；client 半边新增 bundler（建议 esbuild：CJS、externals=10 个 seed、产物包一层 `window.__ModuleLoader__.load({ id: "dsh-claude-code", factory })`，`id` 必须等于包名）。`npm run build` 串起两步 |
| `cordis.patch.yml` | 不变（客户端入口不在这里声明） |
| 源码布局 | `src/index.ts`（node，拆出 `src/tracker.ts`、`src/remote.ts`）+ `src/client/`（React 组件） |

**硬性校验点**（来自 loader 源码的失败模式）：
- 声明了 `dsh.client` 但缺 `lib/client.js` → 整个 fiber FAILED、loud throw
  （`MissingClientBundleError`）——CI/发布前必须验证产物存在。
- factory 形式 CJS 不支持 require 循环——client 半边保持无环。
- 插件集变更（安装/升级）**需重启 DSH** 才生效（包元数据缓存永不过期）。
- headless / CLI 场景：client 半边不被加载，node 半边行为不变（`dsh.client` 仅 web 平台消费）。

---

## 6. 分阶段交付

| 阶段 | 内容 | 价值 | 风险 |
|---|---|---|---|
| **P0**（可并入 0.2.x 补丁） | `done.detail` 富化为 `$成本 · 轮数 · 时长` | 官方自带列表立即变有用，零前端代码 | 无 |
| **P1**（0.3.0 主体） | JobTracker + Remote API + client 半边（列表/详情/输出轮询/取消）+ 打包链路 | 需求主体 | 中：新增打包链路与 remote 接线是主要工作量 |
| **P2**（0.3.x） | 元数据完善（resume 复制流）、错误详情展示打磨 | 低成本增值 | 低 |
| **P3**（不承诺） | `tool.call.toolview` key=`claude_code` 自定义工具卡片；WebSocket 输出推送；`settings.section` 设置页 | 锦上添花 | 低 |

工作量估计（P1）：node 半边 ~250 行增量，client 半边 ~400 行 + 打包配置；
主要不确定性集中在两处需要现场核对的 API（client runtime 的 store 导出名、
TypertRemoteService 的注册细节），均已给出对照模板文件。

## 7. 风险与限制（如实告知用户的部分）

1. **重启才生效**：装 0.3.0 后必须重启 DSH Desktop（loader 包缓存永不过期）。
2. **进程内存态**：任务与输出不跨重启；面板明示。缓冲 500KB 截断，超长输出只看尾部
   （`truncated` 标记会在 UI 上提示）。
3. **官方列表会出现"重复"条目**：同一个任务在官方任务列表（只读）和我们的面板里都可见。
   这是并存设计的代价；不禁用官方条目（禁用会连带杀掉其他 kind 的展示）。
4. **私有 API 面**：`jobsBySession` 镜像、槽位契约、seed externals 列表都是 DSH 内部约定，
   DSH 大版本升级可能破坏 client 半边（node 半边只依赖 `ctx.jobs.start`，很稳）。
   缓解：client 半边崩溃会被宿主 error boundary 捕获并退位，不拖垮整个 UI（已验证容错机制）。
5. **kill 语义**：我们的 UI 取消走插件内部 abort，模型能收到 killed 通知；但对**非本插件**
   的任务（bash/pwsh 等）不提供取消——那是宿主 seam 的未决问题，不越界。

## 8. 明确排除项

- 不 fork / 不 patch `dsh-client-ui-jobs`、`dsh-jobs-local`、apiproxy。
- 不做任务持久化、不做跨会话任务视图（owner 隔离语义保持与宿主一致：只看本会话 + 无主任务不掺和）。
- 不做前台（非 background）调用的面板展示——前台结果已有工具卡片。

## 9. 开放问题（实现前与用户确认）

1. 需求原文在"能看到"处截断——上面 §0 的 P1/P2 范围是否符合预期？
2. 面板位置：会话头部弹层（本设计，与宿主交互语言一致）vs. 独立侧栏页
   （`dsh-better-sidebar` 风格，更大展示面积但侵入性高）——默认选前者。
3. P0（detail 富化）是否先行单独发一个 0.2.x？
