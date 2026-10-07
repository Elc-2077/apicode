# AGENTS.md

api-code-cli（命令 `apicode`）：一个 Node.js 终端 CLI，从「AI API 用量追踪工具（apistat）」演进为「类 Claude Code 的 AI 编码助手 REPL」，同时保留用量统计与代理监控功能。npm 包名 `api-code-cli`，当前版本 1.2.4。

## 常用命令

- `npm start` 或 `node bin/cli.js` — 启动默认 REPL 对话模式（`apicode`）
- REPL 内斜杠命令：`/help`、`/clear`、`/model`、`/style`（回车后在面板里 ↑↓ 选风格，也可 `/style <id>`）、`/skills`（技能状态；`/skills <名称>` 直接加载、`/skills all` 重扫列前 40）、`/exit`、`/quit`
- `node bin/cli.js serve [--port N]` — 启动抓包代理服务器（`apicode serve`）
- `node bin/cli.js monitor` — 全屏监控仪表盘（`apicode monitor`）
- `node bin/cli.js update` — 自更新（`npm install -g api-code-cli@latest`）
- 无构建步骤、无 TypeScript、无 lint 配置；`npm test` 是占位（直接报错），没有测试框架

## 入口与命令分发（bin/）

- `bin/cli.js` — 主入口。按第一个参数分发：`update` / `serve` / `monitor`，默认进入 REPL
- `bin/cli-monitor.js` — 监控仪表盘（terminal-kit 全屏 UI），消费 `src/modules/*`
- `bin/cli-old.js` — cli-monitor 的遗留副本（勿改，保持兼容）
- `bin/cli-agent.js` — 旧的独立 agent 入口（已被 REPL 内置工具取代）
- `bin/proxy-server.js` — 代理服务器独立入口

## 架构分层（src/）

1. **REPL / Agent 层（核心）**
   - `repl-agent-engine.js` — REPLAgentEngine：包装 Agent 工具循环 + 会话 token 统计，完成后写记录到 tracker
   - `agent.js` — agentic loop：模型输出 tool_calls → 本地执行 → 结果回灌，直到最终回答；同时支持 OpenAI function calling 和 Anthropic tool_use
   - `agent-tools.js` — 工具 schema（OpenAI function 格式，Anthropic 由 agent.js 转换）+ 执行器：read_file / write_file / edit_file / create_dir / list_dir / glob / grep / run_shell / read_image / load_skill
   - `skills.js` — 本机技能发现：扫项目与主目录下的 `.zcode|.agents|.claude/skills`，手写极简 frontmatter 解析（只认顶格 name/description，零 yaml 依赖），`buildSkillIndex` 生成进系统提示的技能索引，`matchSkills/countSkillMatches` 供 REPL 的 `/` 实时筛选面板，`findSkill/readSkillBody` 供 `load_skill` 工具与手动加载取正文
   - `styles.js` — Agent 表达风格注册表（`code` 默认、`neko` 猫娘）：每项只有 `blocks` 文案与 UI 前缀，`buildStylePrompt` 拼在 system prompt **最末尾**；默认风格返回空串以保证零差异
   - `term-width.js` / `skill-panel.js` — 面板的两块地基：前者按**终端显示列**量宽度（CJK 与「东亚模糊宽度」字符一律算 2 列，宁可估宽不可估窄），后者是候选面板的纯函数层（`buildItems` 挑条目、`buildLines` 出行文本、`fitsOneRowEach` 校验每行只占一行）。`bin/cli.js` 只管游标移动与按键分派。条目有三种 `type`：`cmd` / `skill` / `choice`（二级选择面板用，如 `/style`）；提示行固定为「第 N/M 项 · 窗口 a-b · …按键说明」，传 `hint` 只替换按键说明那一段，位置信息永远排在最前（窄终端截尾时先丢的是文案，不是位置）
   - `repl-fixed-ui.js` — 当前 REPL UI（固定输入行）；`repl-ui.js`、`repl-scroll-ui.js` 是旧 UI 变体；`repl-engine.js` 是无工具的旧对话引擎
   - `boot-anim.js` — 启动开屏的 550W 风格自检动画（`bin/cli.js` 的 `startREPL` 开头调用 `bootScreen`）。纯观感层：不参与会话状态，任何异常静默降级，非 TTY / `--no-anim` / `APICODE_NO_ANIM=1` 自动跳过。三条硬约束 —— 只往前打印 + `\r` 原地重画（**绝不用 `term.up()`**，没有记账就不存在漂移）、动画期间只挂一次性 stdin 监听且返回前必须摘掉并归还 raw mode（否则后面的 `inputField` 收不到输入）、每个整行输出都过 `clipLine` 裁剪兜底。**它用自己的 `glyphWidth()` 而不是 `term-width.dispWidth`**：后者把 0x2500–0x27BF 的框线/方块一律算 2 列，对面板是安全的保守方向，但会让 53 列的 logo 被误判成 106 列而拒绝绘制、排版全面失真；`glyphWidth` 按真实渲染给装饰字形算 1 列、控制字符算 0 列（`charWidth` 会把 `\n` 算成 1 列，导致裁剪时吃掉换行、多行挤成一行）。改动画前先读该文件头注释。标题框内只有 `apicode` 一个字标（原先的 `5 5 0 W` / `行星发动机 · 控制终端` 已按要求换掉）。
   - `ui-fx.js` — 跳转页面的**居中排版 + 载入动画**（纯观感层，业务逻辑一律不碰）。`padWidth/centerLines` 按**显示列**算偏移，`withLoader/transition` 是 `\r` 原地重画的转轮。与 `boot-anim` 共用 `glyphWidth` 与 `shouldAnimate`（关闭开关只有一个：非 TTY / `--no-anim` / `APICODE_NO_ANIM=1`）。**排除项按用户要求写死**：`pickPreset`（选择供应商）与对话界面本身不居中、不加动画，别顺手"统一"了。
2. **用量追踪层**
   - `tracker.js` — JSON 记录存储（`~/.api-usage-tracker/records.json`），addRecord / getStats
   - `interceptor.js` — wrapOpenAI / wrapAnthropic / createTrackedFetch / setupAxiosInterceptor，供第三方以库的方式自动追踪（由根 `index.js` 导出）
   - `data-manager.js` — 多数据源检测（cc-switch 的 sqlite + 本地 records.json），用 sql.js 读库
3. **配置 / API 层**
   - `config.js` — API 配置存于 `~/.api-usage-tracker/config.json`（README 里写的 `~/.apicode/config.json` 是错的，以代码为准）
   - `api.js` — 连接测试、GET /models 拉模型列表、余额查询
   - `presets.js` — 服务商预设（自动填 baseUrl）；`constants.js` — 平台/模型常量
4. **监控模块层** `src/modules/*` — 仪表盘各功能页：api-manage、group-manage、manual-log、query-status、settings、usage-stats、export-data
5. **代理层** `src/proxy/*` — HTTP/HTTPS 拦截代理记录 API 用量；`database.js` 用 **sql.js**（纯 JS）存 `~/.api-usage-tracker/apistat.db`（package.json 里声明的 better-sqlite3 实际未在此使用）

## 编辑时需要知道的规则与坑

- **全部 CommonJS**（require/module.exports），chalk 用 v4（CJS 兼容）；不要引入 ESM 语法
- **baseUrl 规范化因协议而异**：OpenAI 兼容 → 必须以 `/v1` 结尾（SDK 再拼 `/chat/completions`）；Anthropic → 必须去掉 `/v1`（SDK 自己拼 `/v1/messages`）。见 `agent.js` / `ai-client.js` 的 `normalizeBaseUrl`
- **危险工具操作**（write_file / edit_file / create_dir / run_shell）必须经过 confirm 回调由用户 y/n/a 把关；agent-tools 不做目录牢笼（有意设计），路径按 rootDir（process.cwd()）解析
- **技能索引进 system prompt**（`skills.js` 生成 → `agent.js` 的 `buildSystemPrompt(model, skills)`）：按 10K 字符预算自适应降级（描述 24 字 → 12 字 → 只列名字；本机 330 个技能 ≈ +3K token/请求，而 agentic loop 每一步都重发 system prompt，成本要按步数估）。`Agent.setSkills()` 热刷新会改写 OpenAI 分支的 `messages[0].content`；Anthropic 分支 system 每次请求现取、天然生效；`switchModel` 重建 Agent 时必须继续带 `config.skills`。读正文前一律先过 `skills.js` 的 `isSkillRecordSafe(skill)`（`readSkillBody` 内自检 + `queueSkill` / `load_skill` 调用点各一道）：只允许读「当下真实的技能根 / `<技能目录>` / 固定文件名 `SKILL.md`」，文件名不对、`../` 逃逸、`root` 谎报、手搓对象一律拒读——新链路会 `readFileSync(skill.file)`，不加这道边界就退化成任意文件读取（提交前扫描已报过，别撤）。`load_skill` 是只读工具、**不进** DANGEROUS；技能自带脚本一律由模型经 `run_shell` 在技能目录内跑（有意不设专用脚本执行器，避免重复实现与二次确认）。技能目录常是符号链接 / Windows junction，判定要用 `fs.statSync`（跟随链接）而不是 Dirent 的 `isDirectory()`。`bin/cli.js` 的 `/skills` 走 `ui.print` / `ui.showInfo`（内部自动重绘输入行），不要往 `handleScrollCommand` / `handleCommand` 那两段死代码加 case。
- **技能手动加载走「队列 → 随下一条消息发出」**：`repl-agent-engine.js` 的 `queueSkill()` 把正文放进 `pendingSkills`，`_composeMessage()` 在 `sendMessage` 时拼成 `【已加载技能：X】…\n\n【用户消息】\n<原文>` 发出去并移入 `loadedSkillNames`（无队列时原样返回，老行为不变）；`clearSession()` 同时清空两者。**别改成直接往 `agent.messages` 塞 user 消息**：Anthropic 分支历史上连续同角色消息与「用户还没说话就出现 user 块」都会改变对话形状。技能正文入历史后每轮重发，卸载手段只有 `/clear`。
- **Agent 风格（`styles.js` + `/style`）只允许动表达层**：`buildSystemPrompt` 的拼接顺序固定为 base → 技能索引 → 风格段（风格在最后，近因最强）；默认 `code` 的 `blocks` 必须保持为空数组，让 `buildStylePrompt('code') === ''`，否则「未启用功能时的提示词」就不再逐字节一致（已有断言）。运行时切换走 `Agent.setStyle()` → `_syncSystemPrompt()`（与 `setSkills` 共用同一套：重建 prompt 并在 OpenAI 分支改写 `messages[0]`）；`engine.switchModel()` 重建 Agent 时必须继续带 `config.style`。新风格的文案**不得**削弱 base prompt 的纪律（危险操作确认、如实回答模型名、报错原样呈现），也不要写 `${...}` 这类占位符——blocks 是普通字符串，会被原样塞进提示词。UI 侧 `uiPrefix` 只加在 `showInfo`；`showError` 与危险确认文案保持原样，风格标签只出现在统计栏（纯 `console.log`，不影响面板游标记账）。选择持久化在 `config.json` 顶层 `style` 字段，`loadConfig/saveConfig` 整对象读写可直接复用；无效值必须回落 `DEFAULT_STYLE` 而不是报错。**落点只有一处**：面板确认（`acceptPanelItem` 的 `choice` 分支）与 `/style <id>` 都调用 `bin/cli.js` 的 `applyStyleChoice(id, engine, ui, config)`（`setStyle` + `setUiStyle` + `config.style` + `saveConfig`，保存失败只降级提示），不要再复制第二份。
- **REPL 的 `/` 候选面板（`bin/cli.js` 的 `panel` / `renderPanel` / `refreshPanel`）**：terminal-kit 装的是 **3.x**，**没有** `eraseLineThenEnd`、`moveCursor`、`cursorLocation` 这些 1.x 名字——可用的是 `eraseLine()`(ESC[2K)、`eraseDisplayBelow()`(ESC[0J)、`eraseLineAfter()`(ESC[0K)、`up(n)/down(n)`（**只接正数**）、`move(dx,dy)`（带符号）、`column(n)`、`deleteLine(n)`。面板画在输入行下方、不永久占行，做法是逐行 `term('\n') → column(1) → term(行文本) → styleReset()`（**styleReset 必须在换行前**，否则屏底新造的行继承背景色），画完 `term.up(rows) + column(1)` 回输入行；重绘靠 `column(1) + eraseLine + eraseDisplayBelow` 一次清掉「输入行及其下方」（下方只可能是面板）。因此：**绝不能用 `getCursorLocation()` 定行号**（异步、200ms 超时、Windows 有 6 处兜底会跳到底行），每行必须按 `term.width - 1` 自己截断（终端物理换行会把行数记账打乱），非 TTY（`process.stdout.isTTY` 为假，termconfig 退化成空串/空格）直接不画，`resize` 时收起面板。按键按 `name` 白名单分派（`UP/DOWN/TAB/SHIFT_TAB/ENTER/ESCAPE`）；`data.isControl` 在 terminal-kit 里**从未被赋值**，`bin/cli.js` 现有的 `if (data.isCharacter && !data.isControl)` 是死条件，别继续依赖。`singleColumnMenu` 不适合做实时过滤（无输入过滤、字符键被吞、没有 `setItems`、逐键重建会在屏底反复造行），它只留给 `/model` 这类静态列表。
- **面板防漂移的铁律**：`term.up(n)` 的前提是「记账行数 == 真实下移行数」，而只要有一行触到右边界物理换行，真实行数就会比记账多，表现为**每按一次 ↑↓ 多出一行、上面留下旧的 `> ` 残渣**（已踩过：按 `String.length` 裁中文描述，100 列的终端里一行实际吃掉 155 列）。所以任何往面板里画的文本都必须经 `term-width.dispWidth/clipW` 按**显示列**裁剪，行预算取 `term.width - 4`，出图前用 `skillPanel.fitsOneRowEach(lines, term.width)` 校验；不通过就**整块不画（fail-closed）**，绝不能画歪。改 `skill-panel.js` 后请跑一遍行宽断言（纯函数、无需 TTY；已覆盖 12–400 列 × 6–50 行 × 12 组查询 × 三种选中位 → 35 万余行零超宽）。
- **面板是「完整列表 + 滚动窗口」，不是「屏上那几条」**：`panel.items` 存全部匹配项（`skillPanel.buildItems`，命令全部 + 技能上限 `maxItems=400`），`panel.sel` 是绝对选中下标、`panel.win` 是可见窗口起点，`buildLines` 依据 `{selected, winStart, rows}` 切片渲染。可见正文行数 = `skillPanel.panelRowBudget(term.height) - 1`（减掉提示行）。按键：`↑↓` 逐条（越界即滚动窗口 = 翻页）、`PgUp/PgDn` 整页、`Home/End` 首尾、`Tab/Enter` 接受、`Esc` 收起；`moveSel/jumpSel` 负责把 sel 保持在 [win, win+rows) 内。**别再退回「只取前 N 条 + hi 取模」**——那样几百个技能永远选不到后面的（已踩过）。查询词变化时 `refreshPanel` 会把 `sel=0 / win=0` 复位。
- **max_tokens 为 32000，不做自动续写**（v1.2.1 行为）：截断时提示用户输入「继续」接续；会话历史跨轮保留。改动这块前先看 `repl-agent-engine.js` / `agent.js` 里的截断处理
- **面板有两种模式（`panel.mode`）**：`'slash'` = 输入 `/` 的实时搜索；`'pick'` = 命令回车后的二级选择（目前只有 `/style` 无参数）。两种模式**共用**同一套 `renderPanel / moveSel / jumpSel` 与 `up(n)` 记账，所以打开二级面板只能经注入的 `skillUi.pickStyle()` → `beginPick(items, hint)`（它先 `hidePanel()` 复位、再立条目），**绝不能直接给 `panel.items` 赋值**。不变式：`hidePanel()` 把 mode 复位成 `'slash'` 并清 `hint`，`refreshPanel()`（搜索路径）也强制复位，`renderPanel()` 的两条 fail-closed/异常分支同样复位——所以 mode 与 items 永远不会互相打架。`beginPick` 在非 TTY、条目为空、或行宽放不下（被 fail-closed 清空）时返回 `false`，`handleFixedCommand` 的 `/style` 据此退回原来的静态列表文案。pick 模式按键：数字 `1-9` 直接选中该项，其余字符先收起面板再按普通输入走；`Enter`/`Tab` 走 `acceptPanelItem`（按 `item.type === 'choice'` 分派）；`Esc` 收起并回报「仍使用 X」（`wasPick` 要在 `hidePanel()` 之前取）。别把二级面板写成 `singleColumnMenu`：它自带阻塞、要临时摘掉 REPL 的 keyHandler，只有 `/model` 那种长静态列表值得（见下一条）。
- **terminal-kit 按键监听**：弹出菜单时要临时 `term.removeListener('key', keyHandler)`，结束后 `term.grabInput({ mouse: false })` 再装回，否则菜单和 REPL 抢按键（参考 bin/cli.js 的 `pickModelInteractive`）
- **`/exit` 是软返回，`/quit` 才是退进程**：`/exit` 只复位界面（清输入行、收候选面板），会话上下文、`pendingSkills`、待发送队列、token 统计一律不动，用户接着聊；`/quit` / `Ctrl+C` 才 `process.exit(0)`。`/exit` 的分支里**绝不能有 `process.exit`**。
- **`handleFixedCommand` 够不到 REPL 的私有状态**：它是模块级函数，而 `inputBuffer` / `panel` / `hidePanel` 都定义在 `startREPL` 闭包内（`node --check` 只验语法，查不出这类越界引用）。要动这些状态必须像 `report` / `pickStyle` 那样经 `skillUi` 参数注入回调——`/exit` 用的是注入的 `softExit`，调用前先 `typeof … === 'function'` 兜底。
- UI 文案、代码注释、系统提示词全部为中文；README 部分内容已过时（其自述「以文件里面的为准」），改动行为后应同步更新 README
- 用户数据目录 `~/.api-usage-tracker/`（records.json / config.json / apistat.db）已在 .gitignore 排除，勿提交
- read_image 返回 base64 图像内容，走 OpenAI / Anthropic 的视觉消息格式（见 agent.js 中的消息构造）

## 动手前建议先读

- `PLAN.md` — REPL 改造的完整设计文档（架构图、分层、状态栏设计）
- `src/repl-agent-engine.js` + `src/agent.js` — 理解一次对话从输入到统计落盘的完整链路
