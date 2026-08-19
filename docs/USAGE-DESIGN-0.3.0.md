# USAGE-DESIGN-0.3.0：claude_code_usage「查看 Claude Code 订阅额度」设计文档

> 目标：为 dsh-claude-code 插件（当前 0.2.0）增加"查看 Claude 订阅用量/配额"能力，让 DSH（leader）在委派前判断"现在能不能再派任务"。
> 本文档基于 2026-08-19 在本机实际读取的文件与命令输出撰写；所有字段路径均已验证。文档只描述字段名与结构，不含任何真实 token/密钥。

---

## 1. 可行性评估：额度数据的获取途径对比

### 1.1 候选途径与实测结论

| 途径 | 实测结论（2026-08-19 本机验证） | 新鲜度 | 可靠性 | 合规性 |
|---|---|---|---|---|
| **A. 读 `~/.claude.json` 的 `cachedUsageUtilization`** | ✅ 存在且数据完整：5 小时/7 天窗口百分比、重置时间、limits 数组、spend、extra_usage 等（详见 §2） | 缓存，带 `fetchedAtMs` 时间戳可自行判断；本机观测值为当天（claude CLI 每次运行会顺带刷新） | 高（结构化 JSON，但属 CLI 内部缓存，无官方 schema 承诺） | ✅ 只读本机缓存文件，不触碰凭证 |
| B. 读 `~/.claude/.credentials.json` | 文件存在，`claudeAiOauth` 下有 `subscriptionType`、`rateLimitTier`、`expiresAt` 等（仅核实字段名） | 静态（订阅元数据，非用量） | 高 | ⚠️ **该文件同时含 `accessToken` / `refreshToken`，建议插件完全不打开此文件**，避免任何"接触凭证"的嫌疑；其非敏感字段均有替代来源（见 C 与 `oauthAccount`） |
| **C. `claude auth status --json`**（非交互 CLI 命令） | ✅ 输出 `{ loggedIn, authMethod, apiProvider, email, orgId, orgName, subscriptionType }`；**不含任何用量/百分比字段** | 实时（登录态） | 高（官方命令，`--json` 为默认输出） | ✅ 官方 CLI 命令 |
| D. claude CLI 非交互输出用量 | ❌ **不存在**。已核实：`claude --help` 全文 grep `usage/quota/limit` 无相关 flag；子命令列表（agents/auth/auto-mode/doctor/gateway/import/install/mcp/plugin/project/setup-token/ultrareview/update）无 `usage`；`/usage` 仅存在于交互式 UI | — | — | — |
| E. 提取 OAuth token 直连 api.anthropic.com 的 usage 端点 | 技术上可行，但**违反插件合规红线（不提取 OAuth token 直连 API），直接排除** | — | — | ❌ 禁止 |
| F. 触发一次最小 `claude -p` 调用，让 CLI 顺带刷新缓存 | 可行（CLI 每次运行会更新 `cachedUsageUtilization`），但消耗真实额度（约 $0.01 级）且需 ~10s + 代理 | 刷新后实时 | 中 | ✅ 走官方 CLI，合规 |

### 1.2 推荐途径

**主数据源：途径 A（读 `~/.claude.json` 的 `cachedUsageUtilization` + `oauthAccount`）；辅助：途径 C（`claude auth status --json` 做登录态/订阅类型兜底）。明确不读 `.credentials.json`（途径 B），明确不直连 API（途径 E）。**

理由：

1. **数据最全**：五小时/七天窗口百分比、各 limit 明细（含 severity 与 is_active）、重置时间、spend、extra usage 状态，一次文件读取全部拿到——正是"能不能再委派"所需的全部信号。
2. **合规零风险**：只读用户本机的非凭证缓存文件；凭证文件一个字节都不碰。`subscriptionType` 用 `claude auth status --json` 拿（实测返回 `"max"`），`rateLimitTier` 用 `oauthAccount.organizationRateLimitTier` 拿（实测 `default_claude_max_20x`），完全绕开 `.credentials.json`。
3. **新鲜度可自证**：`cachedUsageUtilization.fetchedAtMs` 是毫秒时间戳，插件可计算数据年龄并在输出中如实标注"N 分钟前的缓存"。且本插件的使用场景天然自愈——**每次 claude_code 委派本身就会驱动 claude CLI 刷新该缓存**，越是频繁委派，数据越新。
4. **无额外成本**：读文件是纯本地操作，0 token、毫秒级；对比途径 F 的"烧额度换新鲜度"，作为默认行为更合理（F 留作可选的 forceRefresh，见 §4）。

已知代价（在 §6 风险中展开）：`cachedUsageUtilization` 是 CLI 内部缓存、无版本承诺，结构可能随 CLI 升级漂移，实现必须"缺字段即降级"而非报错。

---

## 2. 数据契约

### 2.1 源数据结构（本机已验证的字段路径）

**`C:\Users\Administrator\.claude.json`**（Windows 下即 `%USERPROFILE%\.claude.json`；跨平台用 `os.homedir()`）：

- `cachedUsageUtilization.fetchedAtMs`：number，毫秒时间戳（缓存抓取时刻）
- `cachedUsageUtilization.accountUuid`：string（用于多账号一致性校验，敏感，默认不输出）
- `cachedUsageUtilization.utilization.five_hour`：`{ utilization: number(百分比整数), resets_at: string(ISO8601), limit_dollars, used_dollars, remaining_dollars }`（订阅账号后三者实测为 null，API 付费账号才有值）
- `cachedUsageUtilization.utilization.seven_day`：同上结构
- `cachedUsageUtilization.utilization.seven_day_opus` / `seven_day_sonnet` / `seven_day_oauth_apps` / `seven_day_cowork` 等：按模型/场景细分的窗口，本机实测为 null（另有 `tangelo`、`nimbus_quill`、`cinder_cove` 等实验代号字段，**不要依赖**）
- `cachedUsageUtilization.utilization.limits[]`：`{ kind: 'session'|'weekly_all'|'weekly_scoped', group: 'session'|'weekly', percent: number, severity: 'normal'|…, resets_at: string|null, scope: { model: { id, display_name }, surface }|null, is_active: boolean }` —— **这是最规整的一份数据，推荐作为工具输出的主体**（本机实测 session 2%、weekly_all 3%、weekly_scoped(Fable) 0%）
- `cachedUsageUtilization.utilization.spend`：`{ used: { amount_minor, currency, exponent }, limit, percent, severity, enabled, disabled_reason, … }`（订阅账号 enabled=false）
- `cachedUsageUtilization.utilization.extra_usage`：`{ is_enabled, monthly_limit, used_credits, utilization, disabled_reason, … }`
- `oauthAccount`：`{ accountUuid, emailAddress, organizationUuid, hasExtraUsageEnabled, billingType, organizationRateLimitTier, userRateLimitTier, organizationName, seatTier, … }`（实测 billingType=`apple_subscription`，organizationRateLimitTier=`default_claude_max_20x`；**注意 `subscriptionType` 不在此对象里**，需走 `claude auth status`）
- `cachedExtraUsageDisabledReason`：string（顶层，实测 `"org_level_disabled"`）
- `projects.<绝对路径>.lastModelUsage` / `lastCost` / `lastTotalInputTokens` 等：**按项目**记录的上一次会话统计（任务书提到的 `modelUsage` 实际在这里，且本机实测 `lastModelUsage` 为空对象 `{}`）——价值低且键是项目路径，**MVP 不纳入**

**`claude auth status --json`** 输出：`{ loggedIn, authMethod, apiProvider, email, orgId, orgName, subscriptionType }`。

**`~/.claude/.credentials.json`**：`claudeAiOauth.{ accessToken, refreshToken, expiresAt, refreshTokenExpiresAt, scopes, subscriptionType, rateLimitTier }` —— 仅列出以说明"其中非敏感字段均有替代来源"；**插件不读此文件**。

### 2.2 工具输出 schema（claude_code_usage 的返回值）

```jsonc
{
  "ok": true,                       // 成功拿到额度数据
  "loggedIn": true,                 // 登录态（来自 auth status 或缓存存在性推断）
  "subscription": {
    "type": "max",                  // claude auth status --json .subscriptionType
    "rateLimitTier": "default_claude_max_20x",  // oauthAccount.organizationRateLimitTier
    "billingType": "apple_subscription"          // oauthAccount.billingType
  },
  "fiveHour": {                     // utilization.five_hour
    "utilizationPercent": 2,
    "resetsAt": "2026-08-19T04:50:00Z"
  },
  "sevenDay": {                     // utilization.seven_day
    "utilizationPercent": 3,
    "resetsAt": "2026-08-25T13:00:00Z"
  },
  "limits": [                       // utilization.limits[]，逐条透传（规整、含 severity）
    { "kind": "session", "percent": 2, "severity": "normal", "resetsAt": "…", "scopeModel": null, "isActive": false },
    { "kind": "weekly_all", "percent": 3, "severity": "normal", "resetsAt": "…", "scopeModel": null, "isActive": true },
    { "kind": "weekly_scoped", "percent": 0, "severity": "normal", "resetsAt": null, "scopeModel": "Fable", "isActive": false }
  ],
  "spend": {                        // utilization.spend；订阅账号大多为 0/disabled
    "enabled": false,
    "usedMinor": 0, "currency": "USD", "exponent": 2, "percent": 0, "limitMinor": null
  },
  "extraUsage": { "isEnabled": false, "disabledReason": "org_level_disabled" },
  "cache": {
    "fetchedAt": "2026-08-19T02:32:41Z",  // fetchedAtMs 转 ISO
    "ageMinutes": 12,
    "maybeStale": false,           // ageMinutes > staleAfterMinutes(默认 30) 时为 true
    "source": "~/.claude.json cachedUsageUtilization"
  },
  "advice": "normal",              // 派生字段：normal | caution(任一窗口≥80%) | blocked(≥95% 或 severity 非 normal)
  "warnings": []                   // 如 ["数据为 3 小时前缓存，可能非实时"]
}
```

### 2.3 敏感字段清单（绝对不进入输出/文档/日志）

| 级别 | 字段 | 处理 |
|---|---|---|
| **绝密** | `.credentials.json` 全文件（accessToken/refreshToken 等） | 插件不读、不引用路径内容 |
| 敏感 | `oauthAccount.emailAddress`、`accountUuid`、`organizationUuid`、`userID`、`machineID`、auth status 的 `email`/`orgId` | 默认不输出；如 UI 需要账号标识，只显示脱敏 email（`6q***@***.com`） |
| 可输出 | 百分比、resets_at、severity、subscriptionType、rateLimitTier、billingType、spend 金额、fetchedAt | 正常输出 |

---

## 3. 实现设计（推荐方案 C：工具为主 + UI 复用同一读取层）

### 3.1 新工具 `claude_code_usage`（方案 A 部分，MVP）

沿用 `src/index.ts` 现有的 `defineTool` 模式（参照 claude_code 工具的 parameters/output.schema/render/execute 结构，src/index.ts:520-685）。

**参数**：

| 参数 | 类型 | 说明 |
|---|---|---|
| `forceRefresh` | boolean? | MVP 接受但仅在 warnings 里回"暂不支持主动刷新"；v2 实现（见 §4） |
| `staleAfterMinutes` | integer? | 缓存超过多少分钟标记 maybeStale，默认 30 |

**执行逻辑（Host 端，纯同步/毫秒级，无需后台 job）**：

1. `join(homedir(), '.claude.json')` → `readFileSync` + `JSON.parse`，全程 try/catch。
2. 逐层可选链取 `cachedUsageUtilization?.utilization`；**任何字段缺失都置 null 并继续**，不 throw（结构漂移防御，见 §6.1）。
3. `oauthAccount` 取订阅元数据；`subscriptionType` 通过 `spawnSync('claude', ['auth','status','--json'])`（约百毫秒级，windowsHide，超时 5s；失败不阻断，仅置 null）——复用现有 `hasClaudeOnPath` 探测（src/index.ts:156）。
4. 计算 `ageMinutes`、`maybeStale`、`advice`（阈值：任一窗口 ≥80% → caution；≥95% 或 severity ≠ normal → blocked）。
5. 组装输出。

**错误处理（对齐现有 ERROR_HINTS 风格，src/index.ts:199）**：

| 情形 | 行为 |
|---|---|
| claude 不在 PATH 且 `.claude.json` 不存在 | `ok:false` + 现有 `CLAUDE_MISSING` 文案（npm install -g @anthropic-ai/claude-code） |
| `.claude.json` 不存在但 claude 已装 | `ok:false, loggedIn:false` + "请先在终端运行一次 claude 完成登录" |
| JSON 解析失败 | `ok:false` + "~/.claude.json 解析失败（文件可能正被 claude 写入，稍后重试）" |
| 文件存在但无 `cachedUsageUtilization` | `ok:true` 降级：只回 subscription + `warnings:["本机尚无额度缓存：运行过一次 claude 会话后才有数据"]` |
| `auth status` 返回 `loggedIn:false` | `ok:true, loggedIn:false` + 警告"登录态已失效，缓存数据可能不再准确" |

**render 文案（中文，示例）**：

```
Claude 订阅额度（Max / default_claude_max_20x）
· 5 小时窗口：2%（约 04:50 重置）
· 7 天窗口：3%（8/25 21:00 重置）｜Fable 专项 0%
· 额度状态：正常，可以继续委派
（缓存于 12 分钟前；每次委派后自动更新）
```

utilization ≥80% 时首行加 ⚠️ 并给出重置时间倒计时；maybeStale 时末行改为"⚠️ 数据为 N 小时前缓存，可能非实时"。

### 3.2 与 UI 面板结合（方案 C 的 UI 部分）

`docs/UI-DESIGN-0.3.0.md`（监控面板设计）在本文档撰写时**尚不存在**（并行委派中），故此处只定义对接约定，细节以该文档落地后为准：

- **读取层复用**：把 §3.1 的第 1-4 步抽成独立函数 `readUsageSnapshot(): UsageSnapshot`（与工具 execute 解耦），放 `src/usage.ts`。
- **Host→Client 通道**：监控面板落地后，Host 端按该文档选定的 RPC 机制注册一个 `claude-code.usage` 方法，直接返回 `readUsageSnapshot()` 结果（同一数据契约 §2.2）。
- **UI 位置建议**：额度信息作为监控面板**顶部的一条状态栏**（两个进度条：5h / 7d + 重置倒计时 + advice 徽标），而非独立 tab——它是"委派前看一眼"的辅助信息，不值得独立入口。
- **刷新时机**：面板打开时拉一次；每个后台 job 结束（onJobDone）后再拉一次（此时 CLI 刚刷新过缓存，数据最新，零成本）。
- 若 UI 方案最终未落地，方案 A 独立成立，无任何依赖。

### 3.3 Host 端读取要点

- **路径**：`join(os.homedir(), '.claude.json')`，不要硬编码盘符；Windows 上 homedir 即 `C:\Users\<user>`。
- **容错**：文件可能数 MB（含全部 projects 历史），一次 readFileSync 可接受（<50ms）；claude CLI 写入是整文件替换，存在读到半截文件的小概率 → JSON.parse 失败按"稍后重试"处理，不缓存失败结果。
- **不监听文件**（不加 fs.watch）：按需读取足够，避免常驻句柄。
- **时区**：`resets_at` 是带时区的 ISO 字符串，render 时用本地时区格式化。

---

## 4. 刷新策略

1. **默认：只读缓存 + 如实标注年龄**。`fetchedAtMs` → `ageMinutes`；> 30 分钟（可配）→ `maybeStale:true` + 中文警告。这是诚实且零成本的基线。
2. **被动刷新（免费，推荐依赖）**：claude CLI 每次运行都会刷新 `cachedUsageUtilization`（本机实测 fetchedAtMs 为当天）。本插件的每次 claude_code 委派本身就是刷新器 → **在委派 job 结束后读缓存，新鲜度最好**。UI 面板的 onJobDone 拉取（§3.2）正是利用这一点。
3. **forceRefresh（v2，主动刷新）**：实现方式为 `spawnSync('claude', ['-p','ok','--model','haiku','--max-turns','1','--output-format','text'])`（需带 proxy env，复用 config.proxy 注入逻辑 src/index.ts:317-322），随后重读缓存。**代价：~10s 延迟 + 一次最小 haiku 调用的真实额度消耗**，故仅在显式传 `forceRefresh:true` 时执行，且 render 注明"本次刷新消耗了一次最小调用"。MVP 不做，参数先占位。
4. **不做**：任何"直连 usage 端点"的刷新（红线）；任何定时轮询刷新（无谓消耗）。

---

## 5. 里程碑

**M1 - MVP（0.3.0，约 0.5 天）**
- `src/usage.ts`：`readUsageSnapshot()`（读缓存 + auth status + 容错降级）
- 注册 `claude_code_usage` 工具（参数 staleAfterMinutes；forceRefresh 占位）+ render 中文文案 + 全部错误分支
- 验收：本机调用返回 §2.2 契约的完整数据；删除/改坏 `.claude.json` 的三种错误分支均给出可操作提示；输出中无任何敏感字段；`npm run typecheck`/`build` 通过。

**M2 - 增强（0.3.x）**
- forceRefresh 实装（§4.3）
- **委派前预警**：claude_code 工具 execute 开头调 `readUsageSnapshot()`（纯本地，毫秒级），若 7 天窗口 ≥80% 或任一 limit severity ≠ normal，在返回结果的 render 里附加一行警告（**不阻断**委派，只提示）；skill SOP 增补"派活前先看 claude_code_usage"
- 验收：模拟高 utilization 数据（临时改缓存副本注入测试）能触发警告文案。

**M3 - UI 集成（依赖 UI-DESIGN-0.3.0.md 落地）**
- Host RPC 方法 + 面板顶部额度状态栏（双进度条 + 倒计时 + advice 徽标），onJobDone 自动刷新
- 验收：面板打开即显示额度；委派结束后数字自动更新。

---

## 6. 风险与待确认点

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| 1 | **`cachedUsageUtilization` 是 CLI 内部缓存，无 schema 承诺**；字段中大量实验代号（nimbus_quill/tangelo/cinder_cove…）表明结构活跃演进，CLI 升级可能改名/搬家 | 工具静默失效或字段变 null | 实现全程可选链 + 缺字段降级为 warnings；只依赖最稳定的 `five_hour`/`seven_day`/`limits`；发版说明标注"数据源为 CLI 内部缓存，CLI 大版本升级后如失效请提 issue" |
| 2 | **多账号/换号**：`.claude.json` 的 `cachedUsageUtilization.accountUuid` 可能与当前登录账号不一致（登出再登入另一账号后短窗口内） | 显示错误账号的额度 | 对比 `cachedUsageUtilization.accountUuid` 与 `oauthAccount.accountUuid`，不一致时置 `warnings:["额度缓存属于另一账号，请先运行一次 claude"]` 并隐藏百分比 |
| 3 | **无缓存降级**：新装机、刚登录未跑过会话时无 `cachedUsageUtilization` | 无数据 | §3.1 已设计降级路径（只回订阅元数据 + 引导文案） |
| 4 | **并发委派与额度竞争**：查询到"2%"后立即派 3 个后台任务，实际消耗可能瞬间抬升；缓存百分比永远滞后于在跑任务 | 超限被 429 | M2 的委派前预警按"当前在跑 job 数"加权提示（如"另有 2 个委派在跑，实际用量高于显示值"）；429 已有 ERROR_HINTS 兜底（src/index.ts:213） |
| 5 | `auth status` 子进程在无网/代理故障时挂起 | 工具变慢 | spawnSync 设 timeout:5000，失败仅置 subscription.type=null，主数据不受影响 |
| 6 | 读文件撞上 CLI 原子写入窗口 | 解析失败 | 按"稍后重试"文案处理，不视为致命错误 |
| 7 | **待确认**：`fetchedAtMs` 的刷新触发条件（每次 `claude -p`？仅交互会话？） | 影响 §4.2 被动刷新假设的可靠度 | M1 部署后实测：记录一次委派前后的 fetchedAtMs 是否变化；若 `-p` 模式不刷新，则 M2 的 forceRefresh 提级为必做 |
| 8 | **待确认**：`--bare` 模式（跳过 keychain/OAuth 读取）下 auth status 行为 | 边缘场景 | 本插件不使用 --bare，风险仅记录 |

---

## 附：本文档依据（均为本机实际执行/读取，2026-08-19）

1. `C:\Users\Administrator\.claude.json` 顶层键清单及 `cachedUsageUtilization`、`oauthAccount`、`projects.<path>.lastModelUsage` 完整结构（node 脚本提取，未复制敏感值）
2. `C:\Users\Administrator\.claude\.credentials.json` 的键名清单（仅字段名）
3. `claude --help` 全文（无 usage/quota/limit 相关 flag 与子命令）、`claude auth --help`、`claude auth status --help`、`claude auth status --json` 实际输出字段
4. `src/index.ts`（0.2.0 全文：defineTool 模式、ERROR_HINTS、proxy 注入、hasClaudeOnPath）
5. `STATUS.md`（代理结论：本机 claude 必须走 127.0.0.1:7897）、`docs/UI-DESIGN-TASK.md`（并行 UI 设计任务书；UI-DESIGN-0.3.0.md 尚未生成）
