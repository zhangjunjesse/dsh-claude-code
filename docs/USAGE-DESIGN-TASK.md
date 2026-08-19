你是 Claude Code，在一个 DSH 插件开发仓库工作。你的任务：**评估"查看 Claude Code 订阅额度"这个新功能，并产出一份完整设计文档**。只写文档，不改任何代码。

# 需求

用户希望 dsh-claude-code 插件（DSH 的 Claude Code 委派插件，当前 0.2.0）增加"查看 Claude Code 额度"的功能：能看到 Claude 订阅的用量/配额情况——例如订阅类型、5 小时窗口用量、7 天窗口用量与百分比、重置时间、各模型用量、费用、剩余配额等，以便决定"现在能不能再委派任务"。

交付形态待你评估：
- 方案 A：新增一个工具（如 claude_code_usage），Host 端实现，模型和用户都能调用查看；
- 方案 B：做成 UI（如果另一个并行委派正在设计的 Claude Code 监控面板已落地，把额度显示放进那个面板）；
- 方案 C：两者结合（工具为主 + UI 展示）。

# 项目背景

- 插件仓库：C:\Users\Administrator\Desktop\dsh-workspace\space-开发-dsh插件开发
- 现状：src/index.ts 是纯 Host 端插件（claude_code 工具 + claude-code-delegation skill）；后台任务走 ctx.jobs。想了解全貌读 src/index.ts、SPEC-0.2.0.md、STATUS.md。
- 本机 claude CLI 是官方订阅（Claude Max，Apple 订阅），登录态在本机。

# 已发现的额度数据线索（本机，直接验证/深入）

1. **C:\Users\Administrator\.claude.json**（claude CLI 的用户状态文件，本机存在）里已有：
   - `cachedUsageUtilization`：含 `five_hour` / `seven_day` 的 `utilization`（百分比）、`resets_at`、`limits`、`spend`（used/limit/currency）等
   - `oauthAccount`：subscriptionType（如 claude_max）、organizationRateLimitTier（如 default_claude_max_20x）、billingType 等
   - `modelUsage` / `lastModelUsage`：各模型 input/output/cache tokens 与 costUSD
   - `cachedExtraUsageDisabledReason`、`hasExtraUsageEnabled` 等
   - 注意：这是 claude CLI 自己维护的缓存，可能有缓存新鲜度问题；设计时需考虑如何刷新
2. **C:\Users\Administrator\.claude\.credentials.json**：claudeAiOauth 里有 subscriptionType、rateLimitTier、expiresAt（令牌有效期）
3. claude CLI 有交互式 `/usage` 命令（UI 里显示用量）；claude.ai 网页也有 usage 页。**请调研 CLI 是否有非交互方式输出用量**（如 `claude -p "..."` 特殊命令、`claude config`、环境变量、或读取/触发 statsig/usage 端点的可行性与合规性——注意插件合规红线：不提取 OAuth token 直连 api.anthropic.com）

# 参考源码/文件路径

- 本插件：C:\Users\Administrator\Desktop\dsh-workspace\space-开发-dsh插件开发\（src/index.ts、README.md）
- DSH 包源码：C:\Users\Administrator\AppData\Local\Programs\DSH Desktop\resources\app.asar.unpacked\node_modules\@deepseek-ai\（工具定义看 dsh-tools\lib\index.js；若涉及 UI 看 dsh-client-ui-jobs\ 等）
- 本机 claude 数据：C:\Users\Administrator\.claude.json、C:\Users\Administrator\.claude\.credentials.json（**设计文档里只写字段名与结构，严禁粘贴任何真实 token/密钥值**）
- claude CLI 帮助：运行 `claude --help`、`claude doctor` 查看有没有 usage 相关参数

# 你要交付的评估与设计（写入 C:\Users\Administrator\Desktop\dsh-workspace\space-开发-dsh插件开发\docs\USAGE-DESIGN-0.3.0.md，中文）

文档覆盖：

1. **可行性评估**：获取额度的几种途径对比（读 ~/.claude.json 缓存 / 读 ~/.claude/.credentials.json / claude CLI 命令 / 其他），各自的新鲜度、可靠性、合规性（不违反"不提取 OAuth token"红线）；给出推荐途径与理由。
2. **数据契约**：定义工具输出/UI 展示的字段结构（subscriptionType、rateLimitTier、fiveHour{utilizationPercent, resetsAt}、sevenDay{...}、limits、spend、modelUsage、缓存时间戳、是否可能过期/刷新建议等），明确哪些字段敏感（token 类绝对不暴露）。
3. **实现设计**：
   - 若走方案 A（工具）：新工具 claude_code_usage 的参数（如 forceRefresh?）/输出 schema/render 文案/错误处理（claude 未登录、文件不存在、解析失败）；
   - 若走方案 C（结合 UI）：如何与另一份设计（docs/UI-DESIGN-0.3.0.md，可能同仓库并行生成，若不存在可跳过 UI 部分）的监控面板结合；
   - Host 端读取逻辑要点（JSON 解析容错、缓存时间判断、Windows 路径）。
4. **刷新策略**：额度缓存的时效性、何时提示"数据可能非实时"、是否支持手动刷新（forceRefresh）及实现代价。
5. **里程碑**：MVP（读缓存 + 工具输出）→ 增强（刷新/UI 展示/用量预警——例如 7 天用量 > 80% 时在委派前提示）。
6. **风险与待确认点**：claude CLI 是否在某版本改变了 .claude.json 结构、多账号、无缓存时的降级、与并发委派的关系（用前查额度防超限）。

# 约束

- 只产出 docs\USAGE-DESIGN-0.3.0.md 一份文档；不改源码、不动 node_modules、不跑构建。
- 严禁在文档中粘贴任何真实 token/密钥/账号敏感值；只描述字段名与结构。
- 文档要基于你实际读过的文件/命令输出，标注关键依据（文件路径 + 字段路径）。
- 完成后用中文总结：推荐获取途径一句话、推荐交付形态一句话、MVP 范围一句话。
