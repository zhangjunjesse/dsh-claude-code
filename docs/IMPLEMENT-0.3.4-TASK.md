# IMPLEMENT-0.3.4：Claude Code 面板 UI 优化（紧凑额度栏 / 单行标题+详情弹框 / 上下布局 / 任务框美化）

你是 Claude Code，在 dsh-claude-code 插件仓库实现 0.3.4。**先读完本文件，再动手。**

## 0. 目标（用户 4 条优化意见）

1. **减小额度展示区域**：现在 UsageBar 占太多空间。改为**紧凑单行**（默认收起），点击展开详细。
2. **任务标题不换行**：单行 ellipsis 截断；新增**详情入口**——一个小按钮点开**弹框**，展示完整任务标题（task 全文）、使用的模型、状态、耗时、费用、sessionId、失败原因等。
3. **左右布局改上下布局**：现在"左列表 + 右输出"浪费宽度。改为**上方一条任务 tab 栏 + 下方输出区**；多任务放不下时 tab 栏**横向滚动**。
4. **任务框（tab）UI 美化**：状态色点、选中态、hover、间距等细节。

## 1. 必读

- `src/client/ClaudeCodeView.tsx`（主面板：当前左列表+右输出布局、panel 缓存、1s 轮询）
- `src/client/UsageBar.tsx`（额度栏：5h/7d 进度条、徽标、刷新、三态）
- `src/client/EventView.tsx` / `OutputView.tsx`（输出区，不用改内容，只挪位置）
- `src/client/api.ts` / `types.ts` / `locales.ts` / `styles.ts`
- `src/tracker.ts`（JobInfo 定义；需给 TrackedJob/JobInfo 补 `model` 字段）
- `src/remote.ts`（toJobInfo 投影）

## 2. 改动

### 2.1 Host/tracker（小改）
- `src/tracker.ts`：`TrackedJob` 增加 `model?: string`；`register` 入参加 `model`（从调用方传入 req.model）；`JobInfo` 增加 `model?: string`；`toJobInfo`（若在 tracker 里）透传。
- `src/index.ts`：`startBackgroundJob` 登记 tracker 时传 `model: req.model`。
- `src/remote.ts`：`toJobInfo` 透传 `model`（`?? null`，JSON 安全）。

### 2.2 Client 布局重构（ClaudeCodeView）
把当前"左列表 + 右输出"改为：
```
┌──────────────────────────────────────────┐
│ [UsageBar 紧凑单行（可点击展开）]           │
├──────────────────────────────────────────┤
│ [tab1●] [tab2○] [tab3○] ...   ← 横向滚动 │
├──────────────────────────────────────────┤
│ 输出区（EventView/OutputView 不变）        │
└──────────────────────────────────────────┘
```
- 任务 tab 条：每个任务一个 tab；**单行 ellipsis**（nowrap + text-overflow）；tab 含状态色点（running 蓝/呼吸、completed 绿、failed 红、killed 灰）+ 截断标题（label，~14 字符）+ 详情按钮（小图标 `ⓘ`，点击弹框，**不要**触发切换）；tab 条 `overflow-x:auto` 支持多任务横向滚动；激活 tab 高亮。
- 选中任务渲染其输出区（沿用现有 EventView/OutputView 与轮询逻辑，`panel` 缓存与事件游标逻辑尽量不动，只动布局容器）。
- 空态：无任务时保留现有空态提示（可加"去对话里让 agent 用 claude_code 派任务"引导）。

### 2.3 详情弹框（新组件 JobDetailModal.tsx）
- 点击任务 tab 上的 `ⓘ` 打开弹框（原生实现：fixed overlay + 居中卡片 + 关闭按钮/ESC/点击遮罩关闭；不引依赖）。
- 内容（来自 JobInfo）：完整 `task`（pre-wrap，全文）、`model`、`status`（中文）、`startedAt`/`finishedAt`、`durationMs`（格式化 Xm Xs）、`costUsd`（$x.xx）、`numTurns`、`claudeSessionId`（可复制）、`failureDetail`（若有，红色）。字段缺省显示 `-`。
- 弹框样式走主题变量，宽度 ~min(560px, 90vw)，最大高度限高滚动。

### 2.4 UsageBar 紧凑化
- 默认**单行紧凑**：`Claude Max · 20x | 5h 2% · 7d 3% | [正常] | [刷新]`（百分比数字即可，隐藏进度条与重置时间）。
- 整行可点击（或小箭头按钮）展开/收起：展开显示 5h/7d 进度条 + 重置时间 + 模型专项徽标（Fable 等）+ 缓存年龄提示。
- 状态徽标保留（正常绿/注意黄/已阻塞红）。未登录/读取失败降级提示保留（紧凑展示）。

### 2.5 任务 tab 美化（styles.ts）
- 状态色点：running 用主题 `state-info`/蓝色 + 轻微呼吸动画（CSS keyframes）；completed 绿；failed 红；killed 灰。
- tab 样式：padding、圆角、激活态（底色 + 边框）、hover（浅色）、间距紧凑；截断 ellipsis。
- 全部用主题变量，token 前缀沿用 `ccp-`。

## 3. 验收

1. `npm run typecheck`（node+client）0 错误；`npm run build` 通过；`lib/client.js` 仍 `__ModuleLoader__.load({id:"dsh-claude-code"})`，seed 白名单不变。
2. `lib/tracker.js` / `lib/remote.js` 含 `model` 透传；`lib/client.js` 含紧凑 UsageBar、tab 布局、JobDetailModal。
3. 用 `renderToStaticMarkup` 验证：紧凑 UsageBar（单行含 5h/7d 百分比、无进度条）、tab 条（3 个任务，激活高亮、ellipsis 生效、ⓘ 存在）、详情弹框（含完整 task 与 model 字段）——各给一个断言结论。
4. 不破坏：任务列表数据、输出区渲染与轮询、取消、readEvents、额度工具。
5. `package.json` 版本 0.3.3 → 0.3.4；`CLIENT_APP` 同步；CHANGELOG 顶部加 `## 0.3.4`（英文，4 条一句）；README 面板描述同步。

## 4. 约束

- 不改 jobs seam；不 fork/patch @deepseek-ai；不动 cordis.patch.yml；不新增依赖。
- 布局重构时尽量不动输出区的轮询/缓存逻辑（复用现成 `panel`/事件游标）。
- 完成输出：改动文件清单、构建结果、三个 renderToStaticMarkup 断言结论、lib/client.js id 确认。
