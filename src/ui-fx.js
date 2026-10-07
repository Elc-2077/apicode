/**
 * 跳转页面的通用观感层：居中排版 + 载入动画
 *
 * 这个模块只解决两件事，都不碰业务逻辑：
 *   1. 居中 —— 按**显示列**算偏移，绝不用 String.length（中文/全角占 2 列，
 *      用字符数居中会整体偏右，中文越多偏得越狠）。
 *   2. 载入动画 —— 会话式菜单跳转之间的等待反馈，顺带把「刚做了什么」写在同一行上。
 *
 * ── 为什么自带 glyphWidth 而不是用 term-width.dispWidth ──────────────────
 * dispWidth 是**保守**测量：为了面板的 term.up(n) 记账安全，把 0x2500–0x27BF 的
 * 制表符/几何符（─ │ ╭ ▶ ● ✓）一律算 2 列。这个方向对面板是对的（宁可估宽，
 * 最多整块不画），但拿来居中就会偏：真实渲染 1 列的 `▶` 被算成 2 列，
 * 装饰越多偏得越明显。这里的测量只服务于「对齐得好不好看」，偏一点不会崩，
 * 所以按真实渲染给宽度表 —— 与 boot-anim.js 同一套判断。两处保持一致，
 * 往界面加新装饰字形前先确认它在主流终端的真实列宽。
 *
 * ── 与开屏动画共用配色与跳过开关 ────────────────────────────────────────
 * 颜色直接取 boot-anim 的 C，`shouldAnimate()` 也复用（非 TTY、--no-anim、
 * APICODE_NO_ANIM=1 一律不出动画）—— 关闭开关只有一个，用户不该记两遍。
 * 非 TTY 时 withLoader 仍然把结果行打出来（只是不重画），保证日志可读。
 */

const termkit = require('terminal-kit');
const term = termkit.terminal;
const { charWidth } = require('./term-width');
const { glyphWidth, shouldAnimate, colors: C } = require('./boot-anim');

/**
 * 扫描轨道：一段固定长度的游标在轨道上来回扫。550W 主题的可视化等待反馈。
 *
 * 为什么不用百分比：拉模型/验活这类请求的耗时事先不可知，画一个会停在 87% 的
 * 进度条是在说谎。来回扫描是**不确定进度**的通用视觉语言（同类于 Windows 的
 * marquee、NASA 遥测的 sweep），配上轨道刻度就够「像在跑」，也不会误导。
 *
 * 用三角波而非取模：取模到端点会瞬间跳回起点，看着像卡帧；三角波到端点自然折返。
 * @param {number} tick  帧序号
 * @param {number} cells 轨道格数
 * @param {number} [span] 游标长度（格），至少 2
 */
function scanRail(tick, cells, span) {
  const n = Math.max(6, cells | 0);
  const s = Math.max(2, span || 4);
  const period = Math.max(2, (n - s) * 2);
  const t = ((tick % period) + period) % period;
  const head = t <= n - s ? t : period - t;   // 三角波：到右端折返
  let out = '';
  for (let i = 0; i < n; i++) {
    if (i < head) out += C.dim('░');
    else if (i < head + s) out += C.frame('█');
    else out += C.dim('░');
  }
  return out;
}

/** 扫描轨道的显示列宽（所有元素都是 1 列的装饰字形） */
function railWidth(cells) {
  return Math.max(0, cells | 0);
}

/** 去掉 ANSI 转义序列，只为量宽度（chalk 把颜色码混在字符串里） */
function plainOf(s) {
  return String(s || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

/** 一行可见文本的显示列宽（不占列的 \n \r \t 已在 glyphWidth 里归零） */
function lineWidth(s) {
  return glyphWidth(plainOf(s));
}

/** 左侧补空格，把一行居中到 cols 列。宽度不足时至少留 2 列缩进，不贴左边界 */
function padFor(s, cols = term.width) {
  const c = cols || 80;
  const pad = Math.floor((c - lineWidth(s)) / 2);
  return ' '.repeat(pad > 0 ? pad : 2);
}

/**
 * 单行居中（含左侧补白，不含换行）。
 * 补白后仍超出 cols 的部分会裁掉 —— 居中不该换来一次物理折行。
 */
function centerLine(s, cols = term.width) {
  const c = cols || 80;
  const pad = padFor(s, c);
  return pad + clipFor(s, Math.max(8, c - pad.length));
}

/**
 * 整块的左侧补白：以**最宽那一行**算偏移，整块一起平移。
 * 逐行各自居中会把列表的编号和缩进全打散（每行缩进不同，看起来像锯齿）。
 *
 * 放不下就**不补白**（返回空串）：终端比内容还窄时再补 2 列也居中不了，
 * 只会把右边多挤出去一截、白多折一行。此时退回贴左排版，与改版前一致。
 * @param {string[]} lines
 */
function padWidth(lines, cols = term.width) {
  const arr = (lines || []).map((l) => String(l == null ? '' : l));
  const wide = arr.reduce((m, l) => Math.max(m, l === '' ? 0 : lineWidth(l)), 0);
  // 至少留 2 列边距才值得居中；放不下就贴左
  if (wide + 4 > (cols || 80)) return '';
  const pad = Math.floor(((cols || 80) - wide) / 2);
  return ' '.repeat(pad > 0 ? pad : 0);
}

/**
 * 整块居中：按最宽一行算偏移后整块平移（见 padWidth），
 * 并把每行裁到剩余列宽 —— 居中不该让任何一行越过右边界（越界即物理折行）。
 */
function centerLines(lines, cols = term.width) {
  const arr = (lines || []).map((l) => String(l == null ? '' : l));
  const pad = padWidth(arr, cols);
  const room = Math.max(8, (cols || 80) - pad.length);
  return arr.map((l) => pad + clipFor(l, room));
}

/**
 * 组装一帧载入动画文本（带主题的扫描轨道 + 文案 + 耗时 + 尾注）。
 *
 * 550W 主题：冷青扫描轨道 + 暗青刻度。轨道与文字之间用「▕ ▏」薄边包住，
 * 看着像仪表读数；这不是纯装饰 —— 边界让轨道和文案在视觉上分开，
 * 用户一眼能分清「哪段在动、哪段是说明」。
 *
 * @param {number} tick     帧序号（递增即可，内部取三角波）
 * @param {string} text     状态文案
 * @param {{tail?:string, elapsed?:string, cells?:number, span?:number, failed?:boolean}} o
 */
function loaderFrame(tick, text, o = {}) {
  const cells = o.cells || 20;
  const span = o.span || 4;
  const rail = o.failed
    ? C.dim('░'.repeat(cells))
    : scanRail(tick, cells, span);
  let line = '  ' + C.dim('▕') + rail + C.dim('▏') + '  ' + C.text(text);
  if (o.elapsed) line += C.ghost('  ' + o.elapsed);
  if (o.tail) line += C.ghost('  ' + o.tail);
  return line;
}

/** 一帧载入动画的显示列宽（用于判断轨道能不能放下） */
function loaderFrameWidth(text, o = {}) {
  const cells = o.cells || 20;
  let w = 2 + 1 + railWidth(cells) + 1 + 2 + lineWidth(text);
  if (o.elapsed) w += 2 + lineWidth(o.elapsed);
  if (o.tail) w += 2 + lineWidth(o.tail);
  return w;
}


/** 居中输出一行普通文本（非 TTY 也照打，只是不走动画） */
function outLine(s, opts = {}) {
  const cols = opts.cols || term.width || 80;
  console.log(centerLine(s, cols));
}

/**
 * 空转的载入动画（跳转间的短促反馈）。
 * 用 `\r` 原地重画，**绝不 term.up()** —— 没有行记账就不存在漂移。
 * @param {string} text  状态文案（中文按 2 列算宽）
 */
async function transition(text, opts = {}) {
  const cols = opts.cols || term.width || 80;
  const minMs = typeof opts.minMs === 'number' ? opts.minMs : 340;
  const avail = Math.max(8, cols - 2);
  const started = Date.now();
  let tick = 0;

  if (!shouldAnimate()) return;   // 非 TTY / --no-anim：纯跳转不值得打空行

  const fit = fitLoader(text, cols, opts);
  const o = { cells: fit.cells, span: 3, tail: fit.tail };
  const pad = loaderPad(text, o, cols, opts.indent);
  try {
    while (Date.now() - started < minMs) {
      const line = loaderFrame(tick, text, o);
      process.stdout.write('\r' + clipFor(pad + line, avail));
      tick++;
      await sleep(60);
    }
  } finally {
    // 无论正常结束还是被中断，都把这一行原地擦掉 —— 跳转不留痕迹
    process.stdout.write('\r' + ' '.repeat(avail) + '\r');
  }
}

/**
 * 载入动画左侧补白。
 *   给了 indent → 用它（配置向导那种绝对定位的外框里，必须与框左边界对齐，
 *   否则「回列首 + 擦整行」会把左边框擦掉）。
 *   没给 indent → **居中**（与「除选择供应商与对话外一律居中」的约定一致）。
 *   放不下（内容比终端还宽）→ 返回空串退回贴左，绝不为居中多折一行。
 */
function loaderPad(text, o, cols, indent) {
  if (indent) return indent;
  const c = cols || 80;
  const w = loaderFrameWidth(text, o);
  if (w + 4 > c) return '';
  const pad = Math.floor((c - w) / 2);
  return ' '.repeat(pad > 0 ? pad : 0);
}

/**
 * 按可用宽度挑载入动画的构成：宁可少画元素，也不要被裁成半截。
 *
 * 丢弃顺序按「信息量」从低到高：
 *   ① 尾注（`GET /models` 这类补充说明）—— 最不重要，先丢
 *   ② 耗时秒数 —— 其次
 *   ③ 轨道逐格缩短（下限 6 格，再短就看不出在动了）
 * 三样都丢完还放不下，就只剩文案，交给调用侧 clipFor 兜底。
 *
 * 为什么不直接 clipFor 一刀切：裁剪会拦腰截断轨道，屏幕上出现一条
 * 「少了一截的进度条」，比干脆不画轨道更像故障。
 *
 * @returns {{cells:number, span:number, tail?:string, showElapsed:boolean}}
 */
function fitLoader(text, cols, opts = {}) {
  const c = cols || 80;
  const tw = lineWidth(text);
  const tail = opts.tail;
  const tailW = tail ? 2 + lineWidth(tail) : 0;
  const elapsedW = 2 + 6;             // "  12.3s" 按最长 6 列估
  const span = opts.span || 4;

  // 一帧的固定开销：前导 2 + 左右薄边 2 + 文案与轨道之间的 2 + 文案
  const fixed = 2 + 2 + 2 + tw;

  for (const keepTail of [true, false]) {
    for (const keepElapsed of [true, false]) {
      const need = fixed + tailW * (keepTail ? 1 : 0) + elapsedW * (keepElapsed ? 1 : 0);
      const room = c - 2 - need;      // 留 2 列右缘，别贴着边
      if (room >= 6) {
        return {
          cells: Math.max(6, Math.min(opts.cells || 20, room)),
          span,
          tail: keepTail ? tail : undefined,
          showElapsed: keepElapsed
        };
      }
    }
  }

  // 极端窄：只剩文案，轨道给最小格数，靠外层裁剪
  return { cells: 6, span, tail: undefined, showElapsed: false };
}

/**
 * 带等待的载入动画：把一段异步操作包在动画里，原地重画同一行，
 * 结束后擦掉这一行（失败时也必须擦干净再抛，否则错误信息会叠在动画上）。
 *
 * @param {string} text
 * @param {Function} [task]  要等待的异步操作；省略则只播一段定时动画
 * @param {{minMs?:number, tail?:string, indent?:string, cells?:number}} [opts]
 *   indent —— 每帧左侧的固定补白（带外框的页面里让动画与内容左边界对齐；
 *             不给就居中，见 loaderPad）
 * @returns {Promise<any>} task 的结果（无 task 时为 undefined）
 */
async function withLoader(text, task, opts = {}) {
  const minMs = typeof opts.minMs === 'number' ? opts.minMs : 520;
  const cols = term.width || 80;
  const fit = fitLoader(text, cols, opts);
  const o = { cells: fit.cells, span: 4, tail: fit.tail };

  if (!shouldAnimate()) {
    // 非 TTY：不重画，但也让「正在做 X」这条线索出现在日志里
    if (text) process.stdout.write((opts.indent || '  ') + plainOf(text) + '\n');
    return task ? await task() : undefined;
  }

  let failed = false;
  let tick = 0;
  let anim = null;

  const started = Date.now();
  const paint = () => {
    const elapsed = fit.showElapsed
      ? ((Date.now() - started) / 1000).toFixed(1) + 's'
      : '';
    const pad = loaderPad(text, { ...o, elapsed }, cols, opts.indent);
    const line = loaderFrame(tick, text, { ...o, elapsed, failed });
    term.column(1);
    term.eraseLine();
    term(clipFor(pad + line, cols));
  };

  paint();
  anim = setInterval(() => { tick++; paint(); }, 110);

  try {
    const result = task ? await task() : undefined;
    // 至少播满 minMs，避免「闪一下」比不播还难看
    const left = minMs - (Date.now() - started);
    if (left > 0) await sleep(left);
    return result;
  } catch (e) {
    failed = true;
    throw e;
  } finally {
    if (anim) clearInterval(anim);
    if (shouldAnimate()) {
      term.column(1);
      term.eraseLine();
    }
  }
}

/**
 * 按显示列裁剪（不换行）；保留 \r 前缀的原地重画语义。
 * 省略号自身占 2 列，必须先从预算里扣掉 —— 按 `cols - 1` 留位再补上 2 列的 `…`
 * 会正好多出 1 列，在等宽临界点上把行挤折。
 */
function clipFor(s, cols) {
  s = String(s || '');
  if (cols <= 0) return '';
  if (lineWidth(s) <= cols) return s;

  const ellW = glyphWidth('…');
  if (cols <= ellW) return '';

  const lead = s.startsWith('\r') ? '\r' : '';
  const body = lead ? s.slice(1) : s;
  let w = 0;
  let out = '';
  for (const ch of body) {
    const cw = glyphWidth(ch);
    if (w + cw > cols - ellW) break;
    out += ch;
    w += cw;
  }
  return lead + out + '…';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  lineWidth,
  padFor,
  padWidth,
  centerLine,
  centerLines,
  outLine,
  scanRail,
  railWidth,
  loaderFrame,
  loaderFrameWidth,
  fitLoader,
  transition,
  withLoader,
  clipFor,
  plainOf
};
