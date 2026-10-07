/**
 * 550W 风格开机动画 —— 启动 apicode 时的自检序列
 *
 * 设计取意《流浪地球》的 550 系列量子计算机：冷色终端边框、逐条点亮的自检项、
 * 细密扫描进度条，最后收在一行版本号上。整体属于「观感层」，不参与任何逻辑：
 * 无论动画播不播、跳不跳过，后续流程完全一致。
 *
 * ── 关于宽度测量（本文件最容易改错的地方，动手前先读）────────────────────
 * 本文件**不用** src/term-width.js 的 dispWidth 来排版，改用下面自带的 glyphWidth()。
 * 原因：dispWidth 是「保守」测量，把 0x2500–0x27BF 的制表符/方块/几何符（─ │ █ ░ ▸ ✔ ◈）
 * 一律算 2 列。这个方向对**面板**是正确的（宁可估宽，最多整块不画，绝不会画歪），
 * 但对**装饰画**是致命的：框线宽度会被算成两倍，80 列终端下 51 列的 logo 会被误判成 102 列
 * 而「放不下」，排版全面失真。
 *
 * 而实测（Windows Terminal / ConHost / xterm / iTerm 默认字体）这些字形都是 **1 列**渲染的，
 * 因此这里按真实渲染给宽度表：制表符、方块元素、几何图形一律 1 列，CJK/emoji 仍由
 * term-width.charWidth 判定（那是真 2 列）。**只对动画里实际出现的字形负责** ——
 * 往动画里加新字形前，先确认它在主流终端的真实列宽，并加进 DECO_1COL 的判断里。
 *
 * 风险与兜底：万一某个终端把这些字形渲染成 2 列，最坏结果只是动画某一根框线多占一行
 * （动画全程不用 term.up() 记账，且随后就进正常的 term.clear() 界面），不会污染面板记账。
 * 窄终端另有降级档（见 renderPlan），保证不会出现「框比屏幕宽」。
 *
 * ── 其他硬约束 ──────────────────────────────────────────────────────────
 *  1. 非 TTY（管道、CI、`process.stdout.isTTY` 为假）直接跳过，绝不往管道里灌色块。
 *  2. 支持 `--no-anim` / `APICODE_NO_ANIM=1` 跳过，给用户和自动化留后门。
 *  3. 不装常驻按键监听：动画期间只挂一次性 stdin data 监听用于「任意键跳过」，
 *     返回前必须摘掉并归还 raw mode，否则后面 inputField 收不到输入。
 *  4. 只往前打印；进度条靠 `\r` 回到行首原地重画，**绝不**用 term.up()。
 *  5. 每段「整行」输出前用 clipLine 按列裁剪兜底，宁可截断也不许换行。
 */

const termkit = require('terminal-kit');
const term = termkit.terminal;
const { charWidth } = require('./term-width');

// ─────────────────────────── 宽度：精确表 ───────────────────────────

/**
 * 动画自用字形宽度。与 term-width.dispWidth 的区别只有一个方向：
 * 装饰字形按**真实渲染**算 1 列，而不是保守的 2 列。
 *
 * 另有一处必须修正：控制字符（\n \r \t）**不占列**。term-width.charWidth 会把
 * \n 判成 1 列，于是「整行含换行」的量宽会多出 1，裁剪时把换行符一并吃掉 ——
 * 多行就会挤成一行。这里显式归零，配合 clipLine() 双保险。
 */
function glyphWidth(s) {
  let w = 0;
  for (const ch of String(s || '')) {
    const cp = ch.codePointAt(0);
    if (cp === 0x0A || cp === 0x0D || cp === 0x09) continue;   // 换行/回车/制表：不占列
    // 制表符 / 方块元素 / 几何图形 / 装饰符：主流终端真实渲染为 1 列
    if (cp >= 0x2500 && cp <= 0x27BF) { w += 1; continue; }
    if (cp >= 0x2B00 && cp <= 0x2BFF) { w += 1; continue; }
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

// ─────────────────────────── 配色与素材 ───────────────────────────

// 统一的冷色调：550W 是冷青，只有数值/进度用暖橙提亮
const C = {
  frame: (s) => `\x1b[38;5;51m${s}\x1b[0m`,   // 亮青 —— 边框、标题
  dim: (s) => `\x1b[38;5;30m${s}\x1b[0m`,     // 暗青 —— 分隔线
  ok: (s) => `\x1b[38;5;49m${s}\x1b[0m`,      // 青绿 —— 自检通过
  warm: (s) => `\x1b[38;5;209m${s}\x1b[0m`,   // 橙 —— 数值、进度条
  text: (s) => `\x1b[38;5;252m${s}\x1b[0m`,   // 近白 —— 正文
  ghost: (s) => `\x1b[38;5;240m${s}\x1b[0m`   // 灰 —— 次要信息
};

/** 完整 logo（真实约 51 列，宽终端用） */
const LOGO_FULL = [
  '  █████╗ ██████╗ ██╗ ██████╗ ██████╗ ██████╗ ███████╗',
  ' ██╔══██╗██╔══██╗██║██╔════╝██╔═══██╗██╔══██╗██╔════╝',
  ' ███████║██████╔╝██║██║     ██║   ██║██║  ██║█████╗  ',
  ' ██╔══██║██╔═══╝ ██║██║     ██║   ██║██║  ██║██╔══╝  ',
  ' ██║  ██║██║     ██║╚██████╗╚██████╔╝██████╔╝███████╗',
  ' ╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝'
];

/** 紧凑 logo（真实约 38 列，80 列终端与中等宽度用） */
const LOGO_COMPACT = [
  '  ___  ___  ___ ___  ___  ___  ___ ___',
  ' / _ \\| _ \\|_ _/ __|/ _ \\|   \\| __| __|',
  '| |_| |  _/ | | (__| (_) | |) | _|| _| ',
  ' \\___/|_|  |___\\___|\\___/|___/|___|___|'
];

/** 自检项：[标签, 结果]，结果压到 12 列内，保证窄终端也能整行放下 */
const CHECKS = [
  ['量子运算核心', '3,000 QPU'],
  ['行星发动机链路', '8,127 台在线'],
  ['地月通信信道', '延迟 1.28 s'],
  ['领航员空间站', '信标已锁定'],
  ['AI 推理引擎', '等待接入'],
  ['文件系统沙箱', '危险操作确认']
];

// 标签栏占位：必须覆盖**整段 head**（缩进 2 + 标记 2 + 标签）而不是只有标签本身。
// 最长标签「行星发动机链路」= 14 列，加上「  ▸ 」共 18 列 —— 写成 14 会让 padTo 对最长那项
// 完全不生效，结果列直接顶在标签上（已踩过）。
const LABEL_COLS = 18;
const BAR_CELLS = 14;    // 进度条格数
const MIN_FULL_COLS = 52; // 低于此宽度走紧凑档（不放外框）

// 「任意键跳过」的共享标志；sleep 会轮询它以便即时中断
let skipped = false;

// ─────────────────────────── 小工具 ───────────────────────────

/** 分片 sleep，被跳过时立即返回 */
function sleep(ms) {
  if (skipped) return Promise.resolve();
  return new Promise((resolve) => {
    const started = Date.now();
    const iv = setInterval(() => {
      if (skipped || Date.now() - started >= ms) {
        clearInterval(iv);
        resolve();
      }
    }, 15);
  });
}

/** 扫描进度条：满格用 █，空格用 ░（都按 1 列计） */
function bar(ratio, cells) {
  const filled = Math.max(0, Math.min(cells, Math.round(ratio * cells)));
  return '█'.repeat(filled) + '░'.repeat(cells - filled);
}

/** 一个 logo 变体的最大行宽（不能用第 0 行代替：COMPACT 的第 2 行比第 0 行宽） */
function logoWidth(logo) {
  return logo.reduce((m, l) => Math.max(m, glyphWidth(l)), 0);
}

/** 按可用列宽挑 logo 变体；太窄返回 null（调用侧退回纯文字） */
function pickLogo(cols) {
  if (logoWidth(LOGO_FULL) <= cols) return LOGO_FULL;
  if (logoWidth(LOGO_COMPACT) <= cols) return LOGO_COMPACT;
  return null;
}

/** 是否应该播放动画：非 TTY / 显式跳过 → false */
function shouldAnimate() {
  if (process.env.APICODE_NO_ANIM === '1') return false;
  const argv = process.argv.slice(2);
  if (argv.includes('--no-anim') || argv.includes('--no-animation')) return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

/**
 * 排版计划：把「终端宽度 → 用哪个 logo、框多宽、是否放外框」算清楚。
 * 纯函数，便于按宽度单测。out = 输出流（默认 stdout，测试可注入）。
 */
function renderPlan(cols) {
  const avail = Math.max(16, cols - 2);      // 左右各留 1 列保险
  const logo = pickLogo(avail);
  const logoW = logo ? logoWidth(logo) : 0;

  // 自检行真实宽度：缩进2 + 标记2 + 标签14 + 空格2 + 条14 + 空格2 + 结果/百分比（= LABEL_COLS + 2 + 14 + 2 + 6）
  const checkCols = LABEL_COLS + 2 + BAR_CELLS + 8;

  const full = avail >= MIN_FULL_COLS;
  // 外框宽度：够放下 logo 与自检行即可，最多 60 列
  const boxW = full ? Math.min(avail, Math.max(48, logoW + 4, checkCols + 2)) : 0;

  // 整块居中用的补白：取「最宽的元素」算偏移，整块一起平移。
  // 逐行各自居中会把外框、logo、自检表的左右边界错开，看着像散架。
  // 放不下（内容比终端还宽）就返回空串退回贴左 —— 再补白只会多折一行。
  const contentW = Math.max(boxW, logoW, checkCols, glyphWidth('  ◈ 开机自检 / BOOT SELF-CHECK'));
  const pad = contentW + 4 <= avail ? Math.floor((avail - contentW) / 2) : 0;

  return { avail, logo, logoW, full, boxW, checkCols, pad, contentW };
}

// ─────────────────────────── 跳过 / 中断 ───────────────────────────

/**
 * 挂一次性「任意键跳过」监听，返回卸载函数 —— 必须在动画结束时调用，
 * 把 stdin 干净地还给 terminal-kit。
 *
 * raw mode 会吞掉 Ctrl+C（变成普通字节 0x03 而非 SIGINT），这里显式识别并恢复
 * 「Ctrl+C 立刻退出」的直觉行为 —— 启动阶段不该因为动画让用户觉得按键失灵。
 */
function installSkipHandler() {
  const onData = (buf) => {
    if (buf && buf.length && buf[0] === 0x03) {
      try { process.stdin.setRawMode(false); } catch (e) { /* ignore */ }
      process.stdout.write('\n');
      process.exit(130);   // 128 + SIGINT
    }
    skipped = true;
  };

  try {
    if (!process.stdin.isTTY) return () => {};
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  } catch (e) {
    return () => {};   // 拿不到 stdin（某些 Windows 终端）就退化成「不能跳过」
  }

  return () => {
    try {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    } catch (e) { /* 归还失败不影响启动 */ }
  };
}

// ─────────────────────────── 主体 ───────────────────────────

/**
 * 播放 550W 开机自检动画。所有输出都经 clipG 兜底，永不换行。
 * 整块按 renderPlan 的 pad 居中（终端放不下时才退回贴左）。
 * @param {{version?:string, out?:NodeJS.WriteStream}} opts
 */
async function playBootAnimation(opts = {}) {
  const version = opts.version || '0.0.0';
  const out = opts.out || process.stdout;

  const cols = Math.max(20, (out.columns || term.width || 80));
  const plan = renderPlan(cols);
  const { avail, logo, full, boxW } = plan;
  const pad = ' '.repeat(plan.pad);
  const room = Math.max(8, avail - plan.pad);

  // 整行输出（含收尾换行）：先补白再裁，保证换行符不被裁掉
  const write = (s) => out.write(pad + clipLine(s, room));
  // 同一行内的原地重画（`\r` 开头、不带换行）：补白必须插在 \r **之后**，
  // 否则光标回车后补白排在最前面，整行又贴回左边界（\r 本身不计宽）
  const writeLine = (s) => {
    const lead = String(s).startsWith('\r') ? '\r' : '';
    const body = lead ? String(s).slice(1) : String(s);
    out.write(lead + clipG(pad + body, room));
  };
  const writeRaw = (s) => out.write(s);

  // 外框内宽（不含左右竖线）
  const inner = full ? boxW - 2 : 0;
  const boxLine = (content) =>
    C.dim('│') + padTo(clipG(content, inner), inner) + C.dim('│') + '\n';
  const centerIn = (s) => {
    const w = glyphWidth(plainOf(s));
    return ' '.repeat(Math.max(0, Math.floor((inner - w) / 2))) + s;
  };

  // ── 块内居中 ──────────────────────────────────────────────────────────
  // 整块已经用 plan.pad 平移过，但块内各元素宽度不一（外框 57 / logo 53 /
  // 自检表 42），不各自居中就会全部贴左，右侧空一大片。三个辅助：
  //   blockW   块宽（= 最宽元素）
  //   inBlock  一次性行（标题、页眉、页脚）各自居中并补齐到块宽
  //   innerOff 自检表的固定偏移 —— 必须固定，进度帧和结果帧宽度不同
  //            （42 vs 40），各自居中会让结果帧左移 1 列、在行尾留下残渣
  const blockW = Math.max(1, plan.contentW);
  const inBlock = (s) => {
    const w = glyphWidth(plainOf(s));
    const off = Math.max(0, Math.floor((blockW - w) / 2));
    return ' '.repeat(off) + s;
  };
  const logoOff = ' '.repeat(Math.max(0, Math.floor((blockW - plan.logoW) / 2)));
  const innerOff = ' '.repeat(Math.max(0, Math.floor((blockW - plan.checkCols) / 2)));

  const uninstallSkip = installSkipHandler();

  try {
    writeRaw('\n');

    // ① 标题框：框内只有 apicode 一个字（窄终端降级为一行文字，不画框）
    if (full) {
      write(inBlock(C.dim('┌' + '─'.repeat(inner) + '┐')) + '\n');
      write(inBlock(boxLine(centerIn(C.frame('a p i c o d e'))).replace(/\n$/, '')) + '\n');
      write(inBlock(C.dim('└' + '─'.repeat(inner) + '┘')) + '\n');
    } else {
      write(C.frame('  apicode') + '\n');
    }
    await sleep(180);

    // ② logo 逐行浮现（整块一起平移，不逐行居中 —— 逐行会把字母错开）
    if (logo) {
      for (const line of logo) {
        write(logoOff + C.frame(line) + '\n');
        await sleep(40);
      }
    } else {
      write(C.frame('APICODE') + '\n');
    }

    writeRaw('\n');
    await sleep(90);

    // ③ 自检项逐条点亮：进度条原地跑满，再换成结果
    write(inBlock(C.dim('◈ 开机自检 / BOOT SELF-CHECK')) + '\n');
    for (const [label, result] of CHECKS) {
      const head = '  ' + C.dim('▸ ') + padTo(C.text(label), LABEL_COLS);

      for (let t = 1; t <= BAR_CELLS && !skipped; t++) {
        const ratio = t / BAR_CELLS;
        const pct = String(Math.round(ratio * 100)).padStart(3, ' ');
        // 原地重画：\r 把光标拉回行首、不带 \n，所以用 clipG 而非 clipLine
        writeLine('\r' + innerOff + head + C.warm(bar(ratio, BAR_CELLS)) + C.ghost('  ' + pct + '%'));
        await sleep(34);
      }

      // 收尾这一行要换行（\n 在 clipG 之外追加，不会被裁掉）；
      // 结果列补齐到与进度帧同宽，否则行尾会留下上一帧的 "100%" 残渣
      writeLine(
        '\r' + innerOff + '  ' + C.ok('✔ ') + padTo(C.text(label), LABEL_COLS) +
        C.ghost(padTo(result, BAR_CELLS + 6))
      );
      writeRaw('\n');
      await sleep(55);
    }

    writeRaw('\n');
    await sleep(80);

    // ④ 收束：版本号 + 就绪提示
    write(inBlock(C.dim('apicode ') + C.warm('v' + version)) + C.ghost('   AI 对话 CLI · 已就绪') + '\n');
    writeRaw('\n');
    await sleep(120);
  } catch (e) {
    // 动画是观感层，任何异常都不该拦住启动 —— 静默降级
  } finally {
    uninstallSkip();
  }
}

/**
 * 启动开屏：能播动画就播，否则退回静态 logo。
 * 非 TTY 时只打印纯文本行，保证日志/管道可读。
 */
async function bootScreen(opts = {}) {
  const version = opts.version || '0.0.0';
  const out = opts.out || process.stdout;
  const cols = Math.max(20, (out.columns || term.width || 80));
  const plan = renderPlan(cols);

  if (!shouldAnimate()) {
    if (plan.logo) {
      plan.logo.forEach((l) => out.write(l + '\n'));
    }
    out.write('\n  apicode v' + version + ' · AI 对话 CLI\n\n');
    return;
  }

  skipped = false;   // 允许 /exit 回主菜单后再播一次
  await playBootAnimation({ version, out });
}

module.exports = {
  bootScreen,
  playBootAnimation,
  shouldAnimate,
  pickLogo,
  renderPlan,
  glyphWidth,
  clipG,
  LOGO_FULL,
  LOGO_COMPACT,
  colors: C
};
