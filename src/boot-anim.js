/**
 * APICode 开屏动画 —— 对外适配层
 *
 * 动画本体在 `src/splash.js`（自 `apicode-splash.js` 原样引入，零依赖，自带屏幕缓冲 /
 * 差分刷新 / 圆环扫描）。本文件只做三件事，不再自己画一帧：
 *
 *   1. 把 `bootScreen(opts)` 接到 `runSplash`，并统一时长口径：
 *      规格原速 15 秒（自 1.3.x 的 13.5 秒延长，各阶段按比例放慢、顺序与占比不变），
 *      默认就按原速完整播放；途中在「授予访问权限」「确认身份」两处停靠，
 *      必须长按 Enter 才继续 —— 停靠等待走真实时钟，不计入这 15 秒。
 *      `APICODE_SPLASH_FAST=1` 或 `--splash-fast` 压到 30%（约 4.5 秒），
 *      `APICODE_SPLASH_DURATION=<秒>` 或 `--splash-duration <秒>` 直接指定总时长。
 *   2. 保留宽度工具（glyphWidth / clipG / clipLine / padTo / padLeftTo / centerIn）——
 *      `src/ui-fx.js` 与 `test-render.js` 依赖它们，且判定口径必须与动画一致。
 *   3. 保留 `shouldAnimate()` 的唯一开关（非 TTY / `--no-anim` / `APICODE_NO_ANIM=1`），
 *      `src/ui-fx.js` 复用它在别处也别忘了关掉动画。`colors` 同理保持原值。
 *
 * ── 为什么不把 splash.js 整个内联进来 ────────────────────────────────────
 *  `runSplash` 自己接管备用屏（`ESC[?1049h`）、隐藏光标、raw mode，并在结束时
 *  `ESC[?1049l` 归还。对 CLI 来说这是干净的：它不往主屏留任何行，随后
 *  `selectOrAddAPI()` 从空白主屏开始，`term.up(n)` 的行数记账不会被动画污染。
 *  旧实现「在主屏逐行重画、绝不回首」是为了不碰 terminal-kit 的记账 —— 现在动画
 *  整段在备用屏里，这个约束自然消失了。
 *
 * ── 尺寸门槛 ────────────────────────────────────────────────────────────
 *  splash.js 要求至少 80×30（`MIN_W` / `MIN_H`），低于此尺寸它只会画一行提示。
 *  与其让用户盯着「终端太小」十几秒，不如直接降级成一行纯文本启动，和管道/CI 一致。
 */

const { charWidth } = require('./term-width');
const splash = require('./splash');

// ─────────────────────────── 宽度：精确表 ───────────────────────────

/**
 * 动画与 ui-fx 共用的字形宽度。
 *
 * 不用 term-width.dispWidth 的原因：dispWidth 是「保守」测量，把 0x2500–0x27BF 的
 * 制表符 / 方块 / 几何符（─ │ █ ░ ▸ ✔）一律算 2 列。对面板是对的（宁可估宽），
 * 对装饰画是致命的 —— 80 列终端下 51 列的框会被误判成 102 列而「放不下」。
 * 这里按真实渲染给 1 列；CJK / emoji 仍交给 charWidth（那是真 2 列）。
 *
 * 另有一处修正：控制字符（\n \r \t）不占列。charWidth 会把 \n 判成 1 列，
 * 于是「整行含换行」的量宽会多出 1，裁剪时把换行符一并吃掉 —— 多行挤成一行。
 */
function glyphWidth(s) {
  let w = 0;
  for (const ch of String(s || '')) {
    // 空串：全角字符在屏幕缓冲里的“第二格”占位符，不占列
    // （charWidth(undefined) 会回退成 1，整行会被多算 —— 中文越多偏差越大）
    if (!ch) continue;
    const cp = ch.codePointAt(0);
    if (cp === 0x0A || cp === 0x0D || cp === 0x09) continue;   // 换行/回车/制表：不占列
    // 制表符 / 方块元素 / 几何图形 / 装饰符：主流终端真实渲染为 1 列
    if (cp >= 0x2500 && cp <= 0x27BF) { w += 1; continue; }
    if (cp >= 0x2B00 && cp <= 0x2BFF) { w += 1; continue; }
    // 通用标点（— – ‥ ‘ ’ 等）：终端按 1 列渲染，但 term-width 把 U+2014 判成 2 列
    if (cp >= 0x2010 && cp <= 0x2027) { w += 1; continue; }
    // 0x1F300+ 是 emoji，真占 2 列，交给 charWidth 统一处理
    w += charWidth(cp);
  }
  return w;
}

/** 去掉 ANSI 转义序列，只为量宽度 */
function plainOf(s) {
  return String(s || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

/** 按精确列宽裁剪（不是字符数），省略号按 1 列计入预算；只裁内容，不含换行 */
function clipG(s, cols) {
  s = String(s || '');
  if (cols <= 0) return '';
  if (glyphWidth(plainOf(s)) <= cols) return s;

  let w = 0;
  let out = '';
  for (const ch of s) {
    const cw = glyphWidth(ch);
    if (w + cw > cols - 1) break;
    out += ch;
    w += cw;
  }
  return out + '…';
}

/**
 * 裁剪一行（可带一个尾部换行）。换行符不参与列宽、也绝不会被裁掉 ——
 * clipG 直接把整串（含 \n）裁剪时，换行会被算作 1 列并可能被吃掉，
 * 多行因此挤成一行。所有「整行输出」一律走这里。
 */
function clipLine(s, cols) {
  s = String(s || '');
  if (s.endsWith('\n')) return clipG(s.slice(0, -1), cols) + '\n';
  return clipG(s, cols);
}

/** 按精确列宽右侧补空格（不能用 padEnd：CJK 占 2 列） */
function padTo(s, cols) {
  const w = glyphWidth(plainOf(s));
  return s + ' '.repeat(Math.max(0, cols - w));
}

/** 按精确列宽左侧补空格（居中/右对齐用） */
function padLeftTo(s, cols) {
  const w = glyphWidth(plainOf(s));
  return ' '.repeat(Math.max(0, cols - w)) + s;
}

/** 按精确列宽居中：返回「左补白 + s」 */
function centerIn(s, cols) {
  const w = glyphWidth(plainOf(s));
  return ' '.repeat(Math.max(0, Math.floor((cols - w) / 2))) + s;
}

// ─────────────────────────── 调色板（对外契约）───────────────────────────

/**
 * 对外共享的语义色（**保持 1.2.x 的值不变**）。
 *
 * src/ui-fx.js:26 运行时解构它渲染跳转页的扫描轨道（dim=轨道刻度、frame=游标、
 * text=状态文案、ghost=耗时与尾注）。开屏换主题不该连带把跳转页也换掉，
 * 所以这里原封不动，只保证六个 key 都在且都是函数。
 *
 * 开屏自己的配色在 splash.js 的 COL 表里（命令行同款黑底浅灰字），与本表无关。
 */
const C = {
  frame: (s) => `\x1b[38;5;51m${s}\x1b[0m`,   // 亮青 —— 边框、标题
  dim: (s) => `\x1b[38;5;30m${s}\x1b[0m`,     // 暗青 —— 分隔线
  ok: (s) => `\x1b[38;5;49m${s}\x1b[0m`,      // 青绿 —— 自检通过
  warm: (s) => `\x1b[38;5;209m${s}\x1b[0m`,   // 橙 —— 数值、进度条
  text: (s) => `\x1b[38;5;252m${s}\x1b[0m`,   // 近白 —— 正文
  ghost: (s) => `\x1b[38;5;240m${s}\x1b[0m`   // 灰 —— 次要信息
};

// ─────────────────────────── 时长口径 ───────────────────────────

/** 默认播放时长（秒）。自 1.3.x 的 13.5 秒延长到 15 秒：splash.js 的各阶段时间轴不动，只是整体放慢，顺序与占比完全一致。 */
const DEFAULT_DURATION = 15;

/** 快速档：30%（约 4.5 秒），只想赶紧进主界面时用 */
const FAST_SCALE = 0.30;

/** 读 `--flag value` / `--flag=value`，返回字符串或 undefined */
function argValue(name) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(name + '=')) return argv[i].slice(name.length + 1);
  }
  return undefined;
}

/**
 * 解析总时长（秒）。这里的秒数是「动画自己的 15 秒」，不含两处长按停靠的等待。
 *   优先级：显式 duration 参数 > --splash-duration > APICODE_SPLASH_DURATION
 *          > （--splash-fast / APICODE_SPLASH_FAST=1 → 15 × 0.3）> 15
 */
function resolveDuration(explicit) {
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  if (num(explicit) !== null) return num(explicit);

  const fromArg = num(argValue('--splash-duration'));
  if (fromArg !== null) return fromArg;

  const fromEnv = num(process.env.APICODE_SPLASH_DURATION);
  if (fromEnv !== null) return fromEnv;

  const fast = process.env.APICODE_SPLASH_FAST === '1'
    || process.argv.slice(2).includes('--splash-fast');
  return DEFAULT_DURATION * (fast ? FAST_SCALE : 1);
}

// ─────────────────────────── 播放 ───────────────────────────

/**
 * 播放开屏动画。整段在备用屏里完成，返回后主屏是干净的。
 *
 * @param {object} [opts]
 * @param {string} [opts.version]     显示在 `REV <version>` 里
 * @param {NodeJS.WriteStream} [opts.out] 输出流（测试注入假流）
 * @param {number} [opts.duration]    总时长（秒）；缺省走 resolveDuration()
 * @param {number} [opts.scale]       时长倍率（= duration / 13.5），1.2.x 兼容参数
 * @param {boolean} [opts.reduced]    减少动态效果：只显示各阶段稳定画面
 * @param {number} [opts.ringSpeed]   圆环旋转速度倍率
 * @param {boolean} [opts.wait=true]  授权 / 身份两步停靠，长按 Enter 才继续（等待不计入 duration）
 */
async function playBootAnimation(opts = {}) {
  const duration = opts.scale !== undefined
    ? splash.TOTAL * opts.scale
    : resolveDuration(opts.duration);

  return splash.runSplash({
    version: opts.version,
    out: opts.out,
    duration,
    reduced: opts.reduced,
    ringSpeed: opts.ringSpeed,
    wait: opts.wait !== false
  });
}

/**
 * 启动开屏：能播动画就播，否则退回一行纯文本降级。
 * 终端小于动画的最低尺寸（80×30）时也走这条降级 —— 比盯着「终端太小」十几秒好。
 */
async function bootScreen(opts = {}) {
  const version = opts.version || '0.0.0';
  const out = opts.out || process.stdout;

  const tooSmall = (out.columns || 0) > 0 && (out.columns < splash.MIN_W || out.rows < splash.MIN_H);
  if (!shouldAnimate() || tooSmall) {
    // 非 TTY / 显式跳过 / 终端太小：纯文本，绝不灌色块（日志、CI、小窗口都可读）
    out.write('APICode v' + version + ' · AI 对话 CLI\n');
    return;
  }

  await playBootAnimation({ version, out, duration: opts.duration, reduced: opts.reduced, ringSpeed: opts.ringSpeed });
}

/** 是否应该播放动画：非 TTY / 显式跳过 → false */
function shouldAnimate() {
  if (process.env.APICODE_NO_ANIM === '1') return false;
  const argv = process.argv.slice(2);
  if (argv.includes('--no-anim') || argv.includes('--no-animation')) return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

module.exports = {
  // 启动
  bootScreen,
  playBootAnimation,
  shouldAnimate,
  // 宽度工具（ui-fx / test-render 依赖）
  glyphWidth,
  plainOf,
  clipG,
  clipLine,
  padTo,
  padLeftTo,
  centerIn,
  // 颜色契约（ui-fx 依赖）
  colors: C,
  // 动画本体（规格时间轴、圆环参数都从这里直接取，便于调参）
  TOTAL: splash.TOTAL,
  RING: splash.RING,
  render: splash.render,
  Screen: splash.Screen,
  Canvas: splash.Canvas
};
