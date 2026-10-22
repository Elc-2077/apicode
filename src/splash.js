#!/usr/bin/env node
'use strict';
/*
 * APICode 开屏启动动画 · CLI 版
 * ─────────────────────────────────────────────────────────────
 * 零依赖 Node.js 脚本。终端黑界面 · 浅色几何图形 · 橙色状态指示 · 多层圆环扫描。
 * 配色对齐命令行默认终端（Windows Terminal Campbell：#0C0C0C 底 / 浅灰文字），
 * 所以整块画面放进终端里看不出「换了一层皮」，只是同一块黑底上多了图形。
 * 纯展示性动画：身份资料、状态值均为演示占位，不构成任何真实的授权或认证。
 *
 * 用法
 *   node apicode-splash.js                 播放完整动画 (~15 秒)
 *   node apicode-splash.js --wait          授权/身份两步停下，等待长按 Enter
 *   node apicode-splash.js --duration 20   调整总时长（秒）
 *   node apicode-splash.js --ring-speed 2  调整圆环旋转速度（倍率）
 *   node apicode-splash.js --reduced       减少动态效果：只显示各阶段稳定画面
 *   node apicode-splash.js -- <命令...>    动画结束后启动你原有的程序
 *
 * 按键：长按 Enter / Space 确认当前步骤；S / Q / Esc 跳过；Ctrl-C 退出。
 * 两步停靠点（授权、身份）都必须长按才放行，等待时间是真实时钟，不计入 duration。
 *
 * 作为模块使用：
 *   const { runSplash } = require('./apicode-splash');
 *   await runSplash({ ready: initPromise });   // 初始化未完成时停在欢迎画面
 *
 * 架构：整个动画是时间 T 的纯函数 render(T)。控制器只维护一个虚拟时钟 T，
 * 所有阶段、标题、进度条、右侧数据、底部状态都由同一个 T 推导，所以天然同步。
 */

const os = require('os');
const { spawn } = require('child_process');
const { createVoicePlayer } = require('./splash-voice');

/* ═════════════════════ 1. 可调参数 ═════════════════════ */

const TOTAL = 13.5; // 设计时间轴的长度（秒）：STAGE_AT / RING 都按它编排。改播放时长用 --duration，不要改这里的各阶段时间。

// 七个阶段的起点（秒）
const STAGE_AT = [0, 1, 3, 5, 6, 10, 12];

// 圆环：时间、速度全部在这里。角度单位为度，时间单位为秒（设计时间轴上的秒）。
const RING = {
  // 外层主圆弧（原·黑色，黑底后反相为浅色）：描边进度（线性）。弧段占整圆的比例从 startFrac 画到 endFrac。
  draw: { from: 6.5, to: 8.4, startFrac: 0.05, endFrac: 0.86 },
  // 旋转 = degPerSec × travel(T, 起转, 加速结束, 开始减速, 完全停止)
  outer: { degPerSec: 70, spin: [7.2, 7.8, 9.3, 9.95], startAngle: -60 },
  mid: { degPerSec: -30, spin: [7.3, 8.0, 9.2, 9.9], fade: [7.0, 7.6] },
  inner: { degPerSec: [26, -17], spin: [7.7, 8.3, 8.8, 9.5], fade: [7.5, 8.0] },
  // 橙色节点依次点亮的时间
  lit: { fixedA: 9.1, fixedB: 9.3, mid: 9.5, inner: 9.7, outer: 9.85 },
  // 退出
  exit: { inner: [10.0, 0.45], mid: [10.15, 0.45], outer: [10.3, 0.75], ticks: [10.3, 0.5], nodes: [10.8, 0.4] },
};

/* ═════════════════════ 2. 基础工具 ═════════════════════ */

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (T, t0, d) => clamp((T - t0) / d);
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

/** 进入/退出：返回透明度 a 与行偏移 dy（进入自下方 1 行滑入，退出向上 1 行滑出）。 */
function vis(T, inT, inD = 0.4, outT = Infinity, outD = 0.3) {
  const i = easeOut(ramp(T, inT, inD));
  const o = outT === Infinity ? 0 : easeInOut(ramp(T, outT, outD));
  return { a: i * (1 - o), dy: Math.round((1 - i) - o) };
}

/** 速度曲线：a 前静止，a→b 线性加速，b→c 匀速，c→d 线性减速，d 后停止；返回累计“匀速秒数”。 */
function travel(T, a, b, c, d) {
  if (T <= a) return 0;
  const up = (b - a) / 2, flat = c - b;
  if (T <= b) return ((T - a) * (T - a)) / (2 * (b - a));
  if (T <= c) return up + (T - b);
  const k = T < d ? T - c : d - c;
  return up + flat + k - (k * k) / (2 * (d - c));
}

const stageOf = (T) => { let s = 1; for (let i = 0; i < STAGE_AT.length; i++) if (T >= STAGE_AT[i]) s = i + 1; return s; };

/* 颜色：打包为 0xRRGGBB 整数，便于比较与差分输出 */
const pack = (r, g, b) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
const rgb = (p) => [(p >> 16) & 255, (p >> 8) & 255, p & 255];
function blend(fg, bg, a) {
  if (a >= 1) return fg;
  if (a <= 0) return bg;
  const f = rgb(fg), b = rgb(bg);
  return pack(Math.round(b[0] + (f[0] - b[0]) * a), Math.round(b[1] + (f[1] - b[1]) * a), Math.round(b[2] + (f[2] - b[2]) * a));
}
const COL = {
  // 与命令行默认终端同一套：黑底 + 浅灰文字。整张画面按「深 → 浅」重排，
  // 原先的 ink（最暗）现在是最亮 —— 所有绘制都按 alpha 与 bg 混合，换底自动反向。
  bg: pack(12, 12, 12),       // Campbell 的 #0C0C0C
  white: pack(255, 255, 255), // 白色圆环 / 品牌块上的反白字
  hair: pack(32, 32, 32),     // 外框、极淡分隔线
  line: pack(56, 56, 56),     // 常规分隔线
  gray: pack(100, 100, 100),  // 次要文字
  mid: pack(150, 150, 150),   // 英文副标题、中等强调
  ink: pack(232, 232, 232),   // 主文字、浅色圆弧（原·黑色几何，换黑底后反相）
  orange: pack(255, 110, 20), // 真彩下是橙；256 色兜底时落到 208（亮橙），黑底上才够醒目
};

/* 字符宽度（中日韩全角占 2 列） */
function cw(cp) {
  return (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ? 2 : 1;
}
const sw = (s) => { let w = 0; for (const c of s) w += cw(c.codePointAt(0)); return w; };
/** 英文大写加字距：字母间加空格，单词间 3 个空格。放不下时退回原样。 */
const spaced = (s) => s.split(' ').map((w) => [...w].join(' ')).join('   ');
const fitSpaced = (s, maxW) => (sw(spaced(s)) <= maxW ? spaced(s) : s);

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ═════════════════════ 3. 字符屏幕缓冲 ═════════════════════ */

class Screen {
  constructor(w, h) {
    this.w = w; this.h = h; this.n = w * h;
    this.ch = new Array(this.n).fill(' ');
    this.fg = new Int32Array(this.n).fill(COL.ink);
    this.bg = new Int32Array(this.n).fill(COL.bg);
    this.bd = new Uint8Array(this.n);
  }
  put(x, y, c, fg, bold = 0, bg) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x, old = this.ch[i];
    // 全角字符占两格：左格是字，右格是空串占位符。
    // 写任意一格之前先把所属的那个字整块清掉，否则新旧文字重叠时会留下“半个字”，
    // 后续空格再落到占位格上，整行就会少算一列（窄终端上表现为溢出边框）。
    if (old === '') {
      if (x > 0) this.ch[i - 1] = ' ';
    } else if (old !== ' ' && cw(old.codePointAt(0)) === 2 && x + 1 < this.w) {
      this.ch[i + 1] = ' ';
    }
    this.ch[i] = c; this.fg[i] = fg; this.bd[i] = bold;
    if (bg !== undefined) this.bg[i] = bg;
    // 新写入的是全角字符：同时占住第二格
    if (c !== '' && x + 1 < this.w && cw(c.codePointAt(0)) === 2) {
      this.ch[i + 1] = ''; this.fg[i + 1] = fg; this.bd[i + 1] = bold;
      if (bg !== undefined) this.bg[i + 1] = bg;
    }
  }
  /** 写文字。o: { a 透明度, bold, bg 底色 } 。透明度是与该格底色混合，所以在黑底上也能正确淡入。 */
  text(x, y, s, fg, o = {}) {
    const a = o.a === undefined ? 1 : o.a;
    if (a <= 0.03) return 0;
    const right = o.right === undefined ? this.w : o.right;
    let cx = x;
    for (const c of s) {
      const w = cw(c.codePointAt(0));
      // 落在全角字符占位格上时跳过（那段已被它左边那个字吃掉），但列仍要前进
      if (cx > 0 && cx < this.w && this.ch[y * this.w + cx] === '') { cx += w; continue; }
      if (cx >= 0 && cx + w <= right && cx + w <= this.w && y >= 0 && y < this.h) {
        const i = y * this.w + cx;
        const base = o.bg !== undefined ? o.bg : this.bg[i];
        const col = blend(fg, base, a);
        this.put(cx, y, c, col, o.bold ? 1 : 0, o.bg);   // put 自己占住第二格
      }
      cx += w;
    }
    return cx - x;
  }
  /** 居中写文字。right 为绝对右边界（不含），缺省到画布右缘；越界自动截断。 */
  textC(cx, y, s, fg, o, right) { const x = Math.floor(cx - sw(s) / 2); return this.text(x, y, s, fg, o, right); }
  fill(x, y, w, h, bg) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
      const i = yy * this.w + xx; this.ch[i] = ' '; this.bg[i] = bg;
    }
  }
}

/* ═════════════════════ 4. 盲文点阵画布（矢量圆弧） ═════════════════════
 * 每个字符格 = 2×4 个点。终端字符约 1:2，所以点近似正方形，圆就是圆。
 * 坐标为“点”坐标：x ∈ [0, 2W)，y ∈ [0, 4H)。角度：正上方 0°，顺时针为正。
 */
const BR = [0x01, 0x02, 0x04, 0x40, 0x08, 0x10, 0x20, 0x80];
const RAD = Math.PI / 180;

class Canvas {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.mask = new Uint8Array(W * H);
    this.col = new Int32Array(W * H);
    this.pri = new Int8Array(W * H);
    this.white = new Float32Array(W * H); // 单元格“白色底”强度，用来表现白色圆环
  }
  plot(x, y, c, p = 1) {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.W * 2 || iy >= this.H * 4) return;
    const i = (iy >> 2) * this.W + (ix >> 1);
    this.mask[i] |= BR[(ix & 1) * 4 + (iy & 3)];
    if (p >= this.pri[i]) { this.pri[i] = p; this.col[i] = c; }
  }
  disc(x, y, r, c, p = 1) {
    for (let dy = -r; dy <= r; dy += 0.5) for (let dx = -r; dx <= r; dx += 0.5) if (dx * dx + dy * dy <= r * r) this.plot(x + dx, y + dy, c, p);
  }
  /** 带粗细的线段，f 为绘制比例（0..1），用于描边动画 */
  line(x0, y0, x1, y1, th, c, p = 1, f = 1) {
    if (f <= 0) return;
    const ex = lerp(x0, x1, f), ey = lerp(y0, y1, f);
    const len = Math.hypot(ex - x0, ey - y0) || 0.001;
    const nx = -(ey - y0) / len, ny = (ex - x0) / len;
    for (let t = 0; t <= len; t += 0.4) {
      const x = x0 + ((ex - x0) * t) / len, y = y0 + ((ey - y0) * t) / len;
      for (let k = -th / 2 + 0.25; k < th / 2; k += 0.5) this.plot(x + nx * k, y + ny * k, c, p);
    }
  }
  /** 圆弧：从 a0 起顺时针 sweep 度，th 为线宽（点）。两端是平头，起止清晰。 */
  arc(cx, cy, r, a0, sweep, th, c, p = 1) {
    if (sweep <= 0.2) return;
    for (let rr = r - th / 2 + 0.25; rr < r + th / 2; rr += 0.5) {
      const n = Math.max(2, Math.ceil((sweep * RAD * rr) / 0.4));
      for (let k = 0; k <= n; k++) {
        const a = (a0 + (sweep * k) / n) * RAD;
        this.plot(cx + rr * Math.sin(a), cy - rr * Math.cos(a), c, p);
      }
    }
  }
  /** 把圆弧对应的单元格底色“提亮为白”——白色圆环 */
  whiteArc(cx, cy, r, a0, sweep, halfW, strength) {
    const n = Math.max(2, Math.ceil((sweep * RAD * r) / 1));
    for (let k = 0; k <= n; k++) {
      const a = (a0 + (sweep * k) / n) * RAD;
      for (let d = -halfW; d <= halfW; d += 1) {
        const x = Math.floor(cx + (r + d) * Math.sin(a)), y = Math.floor(cy - (r + d) * Math.cos(a));
        if (x < 0 || y < 0 || x >= this.W * 2 || y >= this.H * 4) continue;
        const i = (y >> 2) * this.W + (x >> 1);
        if (strength > this.white[i]) this.white[i] = strength;
      }
    }
  }
  composite(S) {
    for (let i = 0; i < this.mask.length; i++) {
      if (this.white[i] > 0) S.bg[i] = blend(COL.white, S.bg[i], this.white[i]);
      if (this.mask[i]) {
        const x = i % this.W, y = (i / this.W) | 0;
        S.put(x, y, String.fromCharCode(0x2800 + this.mask[i]), this.col[i], 0);
      }
    }
  }
}

/* ═════════════════════ 5. APICode 品牌标志 ═════════════════════
 * 抽象字母 A：两条浅色斜腿，横梁是一小段悬浮的橙色线；两侧各有一个细浅色方括号（数据通道）。
 * 全部由点阵线段构成，p 为描边进度，a 为透明度。
 */
function drawLogo(cv, cx, cy, s, p, a, bg = COL.bg) {
  if (a <= 0.02 || p <= 0) return;
  const th = Math.max(2, Math.round(s / 9)), th2 = Math.max(1.5, s / 16);
  const ink = blend(COL.ink, bg, a), org = blend(COL.orange, bg, a);
  const hw = 0.46 * s, top = cy - s / 2, bot = cy + s / 2;
  const part = (a0, a1) => clamp((p - a0) / (a1 - a0));
  cv.line(cx, top, cx - hw, bot, th, ink, 3, part(0, 0.35));
  cv.line(cx, top, cx + hw, bot, th, ink, 3, part(0.3, 0.65));
  const bx = 0.78 * s, by = 0.36 * s, arm = 0.13 * s, bp = part(0.5, 0.85);
  for (const sgn of [-1, 1]) {
    cv.line(cx + sgn * bx, cy - by, cx + sgn * bx, cy + by, th2, ink, 3, bp);
    cv.line(cx + sgn * bx, cy - by, cx + sgn * (bx - arm), cy - by, th2, ink, 3, bp);
    cv.line(cx + sgn * bx, cy + by, cx + sgn * (bx - arm), cy + by, th2, ink, 3, bp);
  }
  const y = cy + 0.16 * s;
  cv.line(cx - 0.2 * s, y, cx + 0.2 * s, y, th, org, 4, part(0.7, 1));
}

/* ═════════════════════ 6. 版面 ═════════════════════ */

function geom(W, H) {
  const showBox = W >= 100;
  const boxW = 28;
  const g = {
    W, H, cx: W / 2, showBox, boxW, boxX: W - 4 - boxW, boxY: 3, boxH: 11,
    titleY: 9, subY: 10, zoneTop: 12, zoneBot: H - 6,
  };
  g.subMax = showBox ? 2 * (g.boxX - g.cx - 3) : W - 12;
  const rows = g.zoneBot - g.zoneTop + 1;
  g.ringCy = (g.zoneTop + rows / 2) * 4;
  g.ringCx = W;
  const rMax = Math.min(rows * 2 - 1, W * 0.42);
  g.R = Math.max(14, rMax - 11); // 外层圆弧半径（点），外侧留 11 点给刻度
  g.tall = H >= 36;
  g.inRing = 0.62 * g.R - 4 >= 17; // 内圈够大才把“读取完毕”放进圆环中心，否则改放标题位置
  return g;
}

/* ═════════════════════ 7. 各部分绘制 ═════════════════════ */

const STATUS = [
  // [开始时间, 中文, 英文, 步骤, 阶段英文名]
  [0, '系统初始化中', 'SYSTEM INITIALIZATION', 1, 'INITIALIZATION'],
  [1, '等待访问授权', 'AWAITING AUTHORIZATION', 2, 'AUTHORIZATION'],
  [3, '身份资料确认中', 'VERIFYING IDENTITY', 3, 'IDENTITY'],
  [5, '正在接收访问需求，建立会话通道...', 'ESTABLISHING SESSION CHANNEL', 4, 'ACCESS REQUEST'],
  [6, '正在读取权限', 'READING PERMISSIONS', 5, 'PERMISSION SCAN'],
  [9.3, '读取完毕，核验通过', 'READ COMPLETE', 5, 'PERMISSION SCAN'],
  [10, '启动完成', 'BOOT COMPLETE', 6, 'WELCOME'],
  [12, '正在进入工作台', 'ENTERING WORKSPACE', 6, 'WELCOME'],
];
const STEP_AT = { 1: 0.85, 2: 1, 3: 3, 4: 5, 5: 6, 6: 10 };

function backdrop(S, G, T) {
  const { W, H } = G;
  const a = easeOut(ramp(T, 0, 0.5));
  const edge = blend(COL.hair, COL.bg, a * 0.9);
  for (let x = 2; x < W - 2; x++) { S.put(x, 0, '─', edge); S.put(x, H - 1, '─', edge); }
  for (let y = 1; y < H - 1; y++) { S.put(1, y, '│', edge); S.put(W - 2, y, '│', edge); }
  const cm = blend(COL.gray, COL.bg, easeOut(ramp(T, 0.25, 0.4)));
  S.put(1, 0, '┏', cm); S.put(W - 2, 0, '┓', cm); S.put(1, H - 1, '┗', cm); S.put(W - 2, H - 1, '┛', cm);

  // 顶部分隔线（避开右侧信息框），从中心向两侧展开
  const sp = easeInOut(ramp(T, 0.2, 0.6)), half = Math.floor(sp * (W / 2));
  const sepC = blend(COL.hair, COL.bg, a);
  for (let x = 2; x < W - 2; x++) {
    if (Math.abs(x - W / 2) > half) continue;
    if (G.showBox && x >= G.boxX - 1 && x <= W - 3) continue;
    S.put(x, 7, '─', sepC);
  }
  if (sp > 0.95) { S.put(1, 7, '├', edge); if (!G.showBox) S.put(W - 2, 7, '┤', edge); }

  // 纵向辅助线 + 定位十字
  const d = Math.max(8, Math.min(40, Math.floor(G.cx) - 8));
  const va = blend(COL.hair, COL.bg, easeOut(ramp(T, 0.35, 0.5)) * 0.8);
  for (const x of [Math.floor(G.cx - d), Math.floor(G.cx + d)]) {
    for (let y = 14; y <= H - 7; y++) S.put(x, y, '┊', va);
    S.put(x, 13, '┼', blend(COL.line, COL.bg, a)); S.put(x, H - 6, '┼', blend(COL.line, COL.bg, a));
  }
}

function brand(S, G, T, version) {
  const x = 4;
  const row = (y, s, color, t0, bold) => { const v = vis(T, t0, 0.4); S.text(x, y + v.dy, s, color, { a: v.a, bold }); };
  row(1, 'APICode', COL.ink, 0.35, true);
  row(2, 'AI POWERED DEVELOPMENT ENVIRONMENT', COL.gray, 0.55);
  row(3, 'APICODE HARNESS OS', COL.mid, 0.7);
  row(5, 'REV ' + (version || '0.1.0') + ' · SYSTEM INITIALIZATION', COL.gray, 0.8);
  // 分段进度指示：当前阶段橙色，其余浅灰
  const step = statusAt(T).step, v = vis(T, 0.9, 0.3);
  for (let i = 0; i < 6; i++) {
    const t = STEP_AT[i + 1];
    let o = i + 1 === step ? ramp(T, t, 0.35) : i + 2 === step ? 1 - ramp(T, STEP_AT[step], 0.35) : 0;
    if (i === 0 && T < STEP_AT[1]) o = 0;
    const c = blend(COL.orange, COL.line, o);
    S.text(x + i * 7, 6, '━━━━━━', c, { a: v.a });
  }
}

function skipHint(S, G, T) {
  const v = vis(T, 0.7, 0.4);
  S.text(G.W - 12, 1, 'SKIP >', COL.ink, { a: v.a });
  S.text(G.W - 12, 2, 'ESC / S', COL.gray, { a: v.a * 0.8 });
}

/** 按显示列宽裁短（CJK 记 2 列）。超宽时保留前段 + … + 尾部，避免窄终端把关键词裁没。 */
function clipText(s, cols) {
  if (cols <= 0) return '';
  if (sw(s) <= cols) return s;
  const chars = Array.from(s);
  if (cols <= 1) return '…';
  const budget = cols - 1;
  const headN = Math.ceil(budget * 0.6), tailN = budget - headN;
  let head = '', w = 0;
  for (const c of chars) { const k = cw(c.codePointAt(0)); if (w + k > headN) break; head += c; w += k; }
  let tail = ''; w = 0;
  for (let i = chars.length - 1; i >= 0; i--) { const k = cw(chars[i].codePointAt(0)); if (w + k > tailN) break; tail = chars[i] + tail; w += k; }
  return head + '…' + tail;
}

function statusAt(T) {
  let s = STATUS[0];
  for (const e of STATUS) if (T >= e[0]) s = e;
  return { start: s[0], cn: s[1], en: s[2], step: s[3], name: s[4] };
}

function infoBox(S, G, T, ctx) {
  if (!G.showBox) return;
  const { boxX: x, boxY: y, boxW: w, boxH: h } = G;
  const v = vis(T, 0.6, 0.5);
  if (v.a <= 0.03) return;
  const bc = blend(COL.line, COL.bg, v.a), lab = COL.gray;
  S.put(x, y, '┌', bc); S.put(x + w - 1, y, '┐', bc); S.put(x, y + h - 1, '└', bc); S.put(x + w - 1, y + h - 1, '┘', bc);
  for (let i = 1; i < w - 1; i++) { S.put(x + i, y, '─', bc); S.put(x + i, y + h - 1, '─', bc); S.put(x + i, y + 5, '─', blend(COL.hair, COL.bg, v.a)); }
  for (let j = 1; j < h - 1; j++) { S.put(x, y + j, '│', bc); S.put(x + w - 1, y + j, '│', bc); }
  S.put(x, y + 5, '├', bc); S.put(x + w - 1, y + 5, '┤', bc);
  S.text(x + 2, y, '━━━━', COL.orange, { a: v.a });

  const st = stageOf(T);
  const sys = st === 1 ? 'BOOTING' : st <= 3 ? 'STANDBY' : st === 4 ? 'ONLINE' : st === 5 ? (T >= 9.3 ? 'READY' : 'SCANNING') : 'READY';
  const granted = T >= 2.75;
  const auth = !granted ? (st === 1 ? '—' : 'PENDING') : st === 5 ? (T >= 9.3 ? 'VERIFIED' : 'READING') : st >= 6 ? 'VERIFIED' : 'GRANTED';
  const sess = st <= 3 ? '—' : st === 4 ? 'OPENING' : st === 5 ? 'OPEN' : 'ACTIVE';
  const chan = st <= 3 ? 'IDLE' : st === 4 ? 'LINKING' : st === 5 ? (T >= 9.3 ? 'SYNCED' : 'STREAMING') : 'SYNCED';
  const rows = [['SYSTEM STATUS', sys], ['AUTHORIZATION', auth], ['SESSION', sess], ['DATA CHANNEL', chan]];
  rows.forEach(([l, val], i) => {
    S.text(x + 2, y + 1 + i, l, lab, { a: v.a });
    S.text(x + w - 2 - sw(val), y + 1 + i, val, val === '—' || val === 'IDLE' ? COL.gray : COL.mid, { a: v.a });
  });

  // 权限读取阶段：十六进制数据，约 2 行/秒低频逐行更新
  const hx = ramp(T, 6.3, 0.2) * (1 - ramp(T, 10.0, 0.6));
  if (hx > 0.03) {
    const tick = Math.floor((Math.min(T, 10.0) - 6.3) / 0.45);
    for (let i = 0; i < 4; i++) {
      const k = tick - 3 + i;
      if (k < 0) continue;
      const r = mulberry32(k * 7919 + 13);
      let line = '0x' + ((k * 8 + 0xa4) & 0xffff).toString(16).toUpperCase().padStart(4, '0');
      for (let b = 0; b < 5; b++) line += ' ' + Math.floor(r() * 256).toString(16).toUpperCase().padStart(2, '0');
      S.text(x + 2, y + 6 + i, line.slice(0, w - 4), i === 3 ? COL.mid : COL.gray, { a: hx * v.a * (i === 3 ? 1 : 0.7) });
    }
  } else if (st < 5) {
    S.text(x + 2, y + 7, '- - - - - - -', COL.line, { a: v.a * 0.6 });
  }
}

function bottom(S, G, T) {
  const { W, H, cx } = G;
  const a = easeOut(ramp(T, 0.6, 0.5));
  // 总进度线
  const prog = clamp(T / TOTAL), n = W - 4, fillN = Math.round(n * prog);
  for (let i = 0; i < n; i++) S.put(2 + i, H - 5, i < fillN && T > 0.9 ? '━' : '─', i < fillN && T > 0.9 ? blend(COL.orange, COL.bg, a) : blend(COL.hair, COL.bg, a));
  S.put(1, H - 5, '├', blend(COL.hair, COL.bg, a)); S.put(W - 2, H - 5, '┤', blend(COL.hair, COL.bg, a));

  const s = statusAt(T);
  const sv = ramp(T, Math.max(s.start, 0.9), 0.35);
  const num = `[ ${String(s.step).padStart(2, '0')} / 06 ]`;
  S.text(4, H - 3, num, COL.ink, { a: a * (0.4 + 0.6 * sv), bold: true });
  S.text(4, H - 2, s.name, COL.gray, { a: a * sv });
  S.textC(cx, H - 3, clipText(s.cn, W - 34), COL.ink, { a: a * sv }, W - 3);
  S.textC(cx, H - 2, fitSpaced(clipText(s.en, W - 34), Math.max(0, W - 56)), COL.gray, { a: a * sv }, W - 3);
  const pw = 'POWERED BY APICode';
  S.text(W - 4 - pw.length, H - 2, pw, COL.gray, { a: a });
}

/* ── 按钮：先画边框（自中心向两侧），再显示文字；橙色强调线；press 为确认时的闪动 ── */
function button(S, cx, y, w, cn, en, T, t0, outT, press) {
  const bp = easeInOut(ramp(T, t0, 0.4)), tv = vis(T, t0 + 0.32, 0.3, outT, 0.3);
  const fo = 1 - easeInOut(ramp(T, outT, 0.3));
  const x = Math.floor(cx - w / 2), half = bp * (w / 2);
  const a = clamp(Math.min(1, bp * 1.5) * fo);
  const bc = blend(press > 0.5 ? COL.ink : COL.mid, COL.bg, a);
  for (let i = 0; i < w; i++) {
    if (Math.abs(i + 0.5 - w / 2) > half) continue;
    const ch = (c) => (i === 0 || i === w - 1 ? c : '─');
    S.put(x + i, y, ch(i === 0 ? '┌' : '┐'), bc);
    S.put(x + i, y + 3, ch(i === 0 ? '└' : '┘'), bc);
  }
  const sd = ramp(bp, 0.55, 0.45) * fo;
  for (const yy of [y + 1, y + 2]) { S.put(x, yy, '│', blend(bc, COL.bg, sd)); S.put(x + w - 1, yy, '│', blend(bc, COL.bg, sd)); }
  const acc = Math.round(lerp(6, w - 2, easeOut(press)));
  S.text(x + 1, y + 3, '━'.repeat(acc), COL.orange, { a: fo * ramp(bp, 0.5, 0.5) });
  const dy = tv.dy;
  S.textC(cx, y + 1, cn, COL.ink, { a: tv.a, bold: true }, x + w - 2);
  S.textC(cx, y + 2, en, press > 0.3 ? COL.ink : COL.mid, { a: tv.a });
}

/* ── 长按提示：文字 + 蓄力槽。只在停靠点出现；按住时整条由灰转橙 ── */
function hintLine(S, G, T, st) {
  const v = vis(T, st.t0, 0.4, st.out, 0.25);
  const atHold = T >= st.hold - 0.05;
  const charge = Math.max(0, st.charge === undefined ? -1 : st.charge);
  let a = v.a;
  if (atHold && st.pulse !== undefined) a *= 0.55 + 0.45 * st.pulse; // 停靠时轻微呼吸
  S.textC(G.cx, st.y, '长按 ENTER 继续', COL.gray, { a }, G.W - 3);

  // 蓄力槽：宽 24 列，已蓄力部分为橙色实线；松手会回落，不是一次按键就跳满。
  if (atHold && st.charge !== undefined && a > 0.03) {
    const n = 24, x = Math.floor(G.cx - n / 2), fillN = Math.round(clamp(charge) * n);
    for (let i = 0; i < n; i++) {
      S.put(x + i, st.y + 1, i < fillN ? '━' : '─', i < fillN ? blend(COL.orange, COL.bg, a) : blend(COL.line, COL.bg, a));
    }
  }
}

/* ── 圆环扫描装置 ── */
function scanner(S, cv, G, T, ctx) {
  const { R } = G, cx = G.ringCx, cy = G.ringCy, X = RING.exit;
  const sp = ctx.ringSpeed;

  // 刻度（固定）
  const tk = easeOut(ramp(T, RING.draw.from - 0.1, 0.7)) * (1 - ramp(T, X.ticks[0], X.ticks[1]));
  if (tk > 0.03 && R >= 18) {
    for (let a = 0; a < 360; a += 6) {
      const major = a % 30 === 0, c = blend(major ? COL.gray : COL.line, COL.bg, tk);
      const r0 = R + 6, r1 = R + (major ? 10 : 8);
      cv.line(cx + r0 * Math.sin(a * RAD), cy - r0 * Math.cos(a * RAD), cx + r1 * Math.sin(a * RAD), cy - r1 * Math.cos(a * RAD), 1, c, 1);
    }
  }

  // 外层：粗浅色圆弧（COL.ink），线性描边，随后匀速旋转
  const d = RING.draw;
  const frac = lerp(d.startFrac, d.endFrac, ramp(T, d.from, d.to - d.from));
  const rotO = RING.outer.startAngle + RING.outer.degPerSec * sp * travel(T, ...RING.outer.spin);
  let sweep = frac * 360, tail = rotO;
  const ex = easeInOut(ramp(T, X.outer[0], X.outer[1]));
  tail = rotO + sweep * ex; sweep *= 1 - ex; // 退出：头部固定，弧段缩短至消失
  const head = tail + sweep;
  if (T >= d.from) cv.arc(cx, cy, R, tail, sweep, 3, COL.ink, 3);

  // 中层：白色圆弧（白底 + 两侧灰色细线），在深色背景上是一条亮环，缓慢反向旋转
  const mf = easeOut(ramp(T, ...[RING.mid.fade[0], RING.mid.fade[1] - RING.mid.fade[0]])) * (1 - ramp(T, X.mid[0], X.mid[1]));
  const rotM = RING.mid.degPerSec * sp * travel(T, ...RING.mid.spin);
  const rm = 0.84 * R;
  const midSegs = [[0, 118], [150, 74], [252, 44]];
  if (mf > 0.03) {
    const hc = blend(COL.mid, COL.bg, mf);
    for (const [a0, sw0] of midSegs) {
      cv.whiteArc(cx, cy, rm, a0 + rotM, sw0, 3, mf);
      cv.arc(cx, cy, rm - 3.4, a0 + rotM, sw0, 1, hc, 2);
      cv.arc(cx, cy, rm + 3.4, a0 + rotM, sw0, 1, hc, 2);
    }
  }

  // 内层：更细的浅色圆弧，2–3 段，速度明显慢于外层
  const inF = easeOut(ramp(T, RING.inner.fade[0], RING.inner.fade[1] - RING.inner.fade[0])) * (1 - ramp(T, X.inner[0], X.inner[1]));
  const rotI1 = RING.inner.degPerSec[0] * sp * travel(T, ...RING.inner.spin);
  const rotI2 = RING.inner.degPerSec[1] * sp * travel(T, ...RING.inner.spin);
  const ri1 = 0.68 * R, ri2 = 0.62 * R;
  if (inF > 0.03) {
    const ic = blend(COL.ink, COL.bg, inF);
    cv.arc(cx, cy, ri1, 20 + rotI1, 78, 2, ic, 3);
    cv.arc(cx, cy, ri1, 170 + rotI1, 58, 2, ic, 3);
    cv.arc(cx, cy, ri2, 262 + rotI2, 72, 1.5, ic, 3);
  }

  // 橙色扫描节点：随所属圆环运动 / 固定在特定角度；扫描完成后依次点亮
  const nodes = [
    { at: 6.5, ang: head, r: R, lit: RING.lit.outer, track: ex < 0.98 },
    { at: 7.5, ang: midSegs[0][0] + midSegs[0][1] + rotM, r: rm, lit: RING.lit.mid },
    { at: 8.0, ang: 20 + 78 + rotI1, r: ri1, lit: RING.lit.inner },
    { at: 7.2, ang: 58, r: R + 4, lit: RING.lit.fixedA },
    { at: 7.7, ang: 292, r: rm, lit: RING.lit.fixedB },
  ];
  const nf = 1 - ramp(T, X.nodes[0], X.nodes[1]);
  for (const n of nodes) {
    const appear = easeOut(ramp(T, n.at, 0.4)) * nf;
    if (appear <= 0.03) continue;
    const lit = easeOut(ramp(T, n.lit, 0.2));
    const px = cx + n.r * Math.sin(n.ang * RAD), py = cy - n.r * Math.cos(n.ang * RAD);
    cv.disc(px, py, lerp(1.3, 2.6, lit), blend(COL.orange, COL.bg, appear * lerp(0.65, 1, lit)), 5);
  }
  return { R, cx, cy, fr: Math.min(ri2, ri1) - 4 };
}

function scanText(S, G, T, free) {
  const v = vis(T, 8.8, 0.5, 10.0, 0.35);
  if (v.a <= 0.03) return;
  const cn = '读取完毕 · 核验通过', en = 'READ COMPLETE · VERIFIED';
  // 依次尝试：2 行 → 3 行 → 4 行，取第一个整体都落在内圈之内的排法（文字半宽 = 列数 点）
  const variants = [[cn, en], [cn, 'READ COMPLETE', '· VERIFIED'], ['读取完毕', '核验通过', 'READ COMPLETE', 'VERIFIED']];
  let lines = variants[2];
  for (const vr of variants) {
    const n = vr.length;
    const ok = vr.every((t, i) => {
      const dy = Math.abs((i - (n - 1) / 2) * 4) + 2;
      return sw(t) + 2 <= Math.sqrt(Math.max(0, free * free - dy * dy));
    });
    if (ok) { lines = vr; break; }
  }
  const n = lines.length, top = Math.round(G.ringCy / 4 - n / 2);
  lines.forEach((t, i) => {
    const isCN = /[一-鿿]/.test(t);
    S.textC(G.cx, top + i + v.dy, t, isCN ? COL.ink : COL.mid, { a: v.a, bold: isCN }, G.W - 3);
  });
}

function welcome(S, cv, G, T) {
  const { cx, H } = G;
  const rowsL = G.tall ? 5 : 3;
  const total = 1 + 1 + 3 + 1 + rowsL + 1 + 1 + 1 + 1;
  const zoneMid = (G.zoneTop + G.zoneBot) / 2;
  const y0 = Math.floor(zoneMid - (total - 1) / 2);
  const out = [10.95, 0.001]; // 欢迎界面随全局淡出
  // WELCOME TO
  let v = vis(T, 10.95, 0.4);
  S.textC(cx, y0 + v.dy, fitSpaced('WELCOME TO', 40), COL.ink, { a: v.a }, G.W - 3);
  // 品牌矩形区，由略小的尺寸平滑放大
  const bw = Math.min(40, G.W - 20), sc = lerp(0.72, 1, easeOut(ramp(T, 11.2, 0.45)));
  const ba = easeOut(ramp(T, 11.2, 0.35)), w = Math.max(8, Math.round(bw * sc)), bx = Math.floor(cx - w / 2), by = y0 + 2;
  // 品牌块：黑底上是一块亮色实心带（比背景更亮而不是更暗），块内文字用背景色反白
  const fillC = blend(COL.ink, COL.bg, ba);
  S.fill(bx, by, w, 3, fillC);
  if (ba > 0.3 && sc > 0.9) S.textC(cx, by + 1, 'APICODE HARNESS', COL.bg, { a: ramp(T, 11.45, 0.3), bold: true, bg: fillC });
  // Logo
  const ly = by + 3 + 1;
  const lp = ramp(T, 11.55, 0.5);
  drawLogo(cv, G.W, (ly + rowsL / 2) * 4, rowsL * 4 - 2, lp, 1);
  // A P I C O D E · H A R N E S S
  v = vis(T, 11.9, 0.35);
  S.textC(cx, ly + rowsL + 1 + v.dy, fitSpaced('APICODE · HARNESS', G.W - 20), COL.mid, { a: v.a }, G.W - 3);
  v = vis(T, 12.1, 0.4);
  S.textC(cx, ly + rowsL + 3 + v.dy, '欢迎访问 APICode', COL.ink, { a: v.a, bold: true }, G.W - 3);
}

function center(S, cv, G, T, ctx) {
  const { cx } = G;
  const st = stageOf(T);

  // 标题：同一位置、同一字体，依次淡入淡出
  const TITLES = [
    { cn: '需要访问许可', en: 'ACCESS PERMISSION REQUIRED', in: 1.0, out: 3.0, od: 0.35 },
    { cn: '身份资料确认', en: 'IDENTITY VERIFICATION', in: 3.4, out: 5.0, od: 0.3 },
    { cn: '接收访问需求', en: 'ACCESS REQUEST RECEIVED', in: 5.3, out: 5.95, od: 0.2 },
    { cn: '开始读取权限', en: 'PERMISSION READ STARTED', in: 6.15, out: 10.0, od: 0.35 },
  ];
  if (!G.inRing) {
    TITLES[3].out = 8.65; TITLES[3].od = 0.25;
    TITLES.push({ cn: '读取完毕 · 核验通过', en: 'READ COMPLETE · VERIFIED', in: 8.9, out: 10.0, od: 0.35 });
  }
  for (const t of TITLES) {
    const a = vis(T, t.in, 0.45, t.out, t.od), b = vis(T, t.in + 0.2, 0.45, t.out + 0.07, t.od);
    S.textC(cx, G.titleY + a.dy, t.cn, COL.ink, { a: a.a, bold: true }, G.W - 3);
    S.textC(cx, G.subY + b.dy, fitSpaced(t.en, G.subMax), COL.mid, { a: b.a }, G.W - 3);
  }

  /* 阶段二：访问授权 */
  if (T >= 1.0 && T < 3.7) {
    const dv = easeInOut(ramp(T, 1.7, 0.45)) * (1 - easeInOut(ramp(T, 3.05, 0.3)));
    const dl = Math.round(40 * dv);
    S.text(Math.floor(cx - dl / 2), 12, '─'.repeat(dl), COL.line);
    button(S, cx, 14, 30, '授予访问权限', 'GRANT ACCESS', T, 2.05, 3.15, ramp(T, 2.75, 0.2));
    hintLine(S, G, T, { t0: 2.5, out: 3.05, y: 19, pulse: ctx.pulse, hold: 2.72, charge: ctx.hold });
  }

  /* 阶段三：身份资料确认 */
  if (T >= 3.4 && T < 5.7) {
    const hv = vis(T, 3.7, 0.4, 5.05, 0.25);
    const w = 46, x = Math.floor(cx - w / 2);
    S.text(x, 12, '─'.repeat(w), COL.line, { a: hv.a });
    S.text(x, 16, '─'.repeat(w), COL.line, { a: hv.a });
    const rows = [['IDENTITY NAME', ctx.name], ['IDENTITY ID', ctx.id], ['ACCESS LEVEL', 'L3 · DEVELOPER']];
    rows.forEach(([l, val], i) => {
      const r = vis(T, 3.85 + i * 0.16, 0.35, 5.0 + i * 0.06, 0.25);
      S.text(x + 2, 13 + i, l, COL.gray, { a: r.a });
      S.text(x + 20, 13 + i, val, COL.ink, { a: r.a });
    });
    button(S, cx, 18, 34, '确认身份', 'CONFIRM IDENTITY', T, 4.3, 5.1, ramp(T, 4.75, 0.2));
    hintLine(S, G, T, { t0: 4.5, out: 5.0, y: 23, pulse: ctx.pulse, hold: 4.72, charge: ctx.hold });
  }

  /* 阶段四、五：标志 → 扫描装置 */
  const rowsMid = (G.zoneTop + G.zoneBot) / 2;
  const logoVis = T >= 5.3 && T < (G.inRing ? 9.0 : 10.5);
  if (logoVis) {
    const u = easeInOut(ramp(T, 6.1, 0.9));
    const s4 = G.tall ? 28 : 20, s5 = Math.max(8, Math.min(G.R * 0.675, 20));
    const cy4 = (rowsMid - 2) * 4, cy5 = G.ringCy;
    const a = G.inRing ? 1 - easeInOut(ramp(T, 8.3, 0.6)) : 1 - easeInOut(ramp(T, 10.0, 0.4));
    drawLogo(cv, G.W, lerp(cy4, cy5, u), lerp(s4, s5, u), ramp(T, 5.4, 0.55), a);
    // A P I C O D E：随标志出现，进入扫描阶段前淡出
    const tv = vis(T, 5.75, 0.3, 6.0, 0.25);
    S.textC(cx, Math.round(cy4 / 4 + s4 / 8 + 2.2) + tv.dy, spaced('APICODE'), COL.ink, { a: tv.a });
  }
  if (T >= RING.draw.from - 0.2 && T < 11.4) {
    const free = scanner(S, cv, G, T, ctx).fr;
    if (G.inRing) scanText(S, G, T, free);
  }

  /* 阶段六：欢迎 */
  if (T >= 10.9) welcome(S, cv, G, T);
}

/* ═════════════════════ 8. 渲染入口：render(T) 是纯函数 ═════════════════════ */

function defaultName() {
  try { return (process.env.USER || os.userInfo().username || 'OPERATOR').toUpperCase().slice(0, 20); } catch (e) { return 'OPERATOR'; }
}
function idFor(name) {
  let h = 5381; for (const c of name) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return 'APC-' + (h & 0xffff).toString(16).toUpperCase().padStart(4, '0') + '-0001';
}

function render(T, W, H, st = {}) {
  const G = geom(W, H);
  const S = new Screen(W, H), cv = new Canvas(W, H);
  const name = st.name || defaultName();
  const ctx = { name, id: idFor(name), ringSpeed: st.ringSpeed || 1, pulse: st.pulse, hold: st.hold === undefined ? -1 : st.hold };
  backdrop(S, G, T);
  brand(S, G, T, st.version);
  skipHint(S, G, T);
  infoBox(S, G, T, ctx);
  bottom(S, G, T);
  center(S, cv, G, T, ctx);
  cv.composite(S);

  // 结束过渡：由外向内的遮罩淡出，最后露出原有界面
  const g = Math.max(easeInOut(ramp(T, 12.8, 0.7)), st.fade || 0);
  if (g > 0) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.min(1, Math.hypot((x - G.cx) / (W / 2), (y - H / 2) / (H / 2)));
      const a = clamp(g * 1.5 - (1 - d) * 0.5);
      if (a <= 0) continue;
      const i = y * W + x;
      S.fg[i] = blend(COL.bg, S.fg[i], a); S.bg[i] = blend(COL.bg, S.bg[i], a);
    }
  }
  return S;
}

/* ═════════════════════ 9. 终端输出（差分刷新） ═════════════════════ */

function makeSgr(truecolor) {
  const to256 = (p) => {
    const [r, g, b] = rgb(p);
    if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) { const v = Math.round((r - 8) / 10); return v <= 0 ? 16 : v >= 24 ? 231 : 232 + v; }
    const q = (v) => Math.round((v / 255) * 5);
    return 16 + 36 * q(r) + 6 * q(g) + q(b);
  };
  return {
    fg: (p) => (truecolor ? `38;2;${(p >> 16) & 255};${(p >> 8) & 255};${p & 255}` : `38;5;${to256(p)}`),
    bg: (p) => (truecolor ? `48;2;${(p >> 16) & 255};${(p >> 8) & 255};${p & 255}` : `48;5;${to256(p)}`),
  };
}

function diffOutput(prev, cur, sgr) {
  let out = '', lf = -1, lb = -1, lbold = -1;
  const W = cur.w;
  for (let y = 0; y < cur.h; y++) {
    let x = 0;
    while (x < W) {
      const i = y * W + x;
      const same = prev && prev.ch[i] === cur.ch[i] && prev.fg[i] === cur.fg[i] && prev.bg[i] === cur.bg[i] && prev.bd[i] === cur.bd[i];
      if (same) { x++; continue; }
      // 一段连续变化（容忍 ≤2 格未变化的缝隙，减少光标跳转）
      let end = x, gap = 0;
      for (let k = x; k < W; k++) {
        const j = y * W + k;
        const diff = !(prev && prev.ch[j] === cur.ch[j] && prev.fg[j] === cur.fg[j] && prev.bg[j] === cur.bg[j] && prev.bd[j] === cur.bd[j]);
        if (diff) { end = k; gap = 0; } else if (++gap > 2) break;
      }
      out += `\x1b[${y + 1};${x + 1}H`;
      for (let k = x; k <= end; k++) {
        const j = y * W + k, c = cur.ch[j];
        if (c === '') continue;
        const parts = [];
        if (cur.bd[j] !== lbold) { parts.push(cur.bd[j] ? '1' : '22'); lbold = cur.bd[j]; }
        if (cur.fg[j] !== lf) { parts.push(sgr.fg(cur.fg[j])); lf = cur.fg[j]; }
        if (cur.bg[j] !== lb) { parts.push(sgr.bg(cur.bg[j])); lb = cur.bg[j]; }
        if (parts.length) out += `\x1b[${parts.join(';')}m`;
        out += c;
      }
      x = end + 1;
    }
  }
  return out;
}

/* ═════════════════════ 10. 控制器：单一虚拟时钟 ═════════════════════ */

const MIN_W = 80, MIN_H = 30;

// 长按确认：在停靠点（授权 2.72 / 身份 4.72）按住 Enter 或 Space 满 HOLD_MS 才放行。
// 计的是真实时间（performance.now），与虚拟时钟 vt 无关 —— vt 在停靠点被钳住不动，
// 所以长按期间底部的总进度条、圆环、状态文案全部定在原处，不会偷偷往前跑。
// 毫秒值给得比终端按键重复率宽一点：Windows Terminal 初始重复延迟约 500 ms，
// 这一段用 HOLD_GAP_MS 容忍，之后按 30 次/秒的重复速率每帧都能续上。
const HOLD_MS = 900;      // 需要按住多久（毫秒）
const HOLD_GAP_MS = 620;  // 两次按键字节之间允许的最大间隔；超过视为松手
const HOLD_DECAY = 2.6;   // 松手后蓄力条的回落速度（1/秒）

/** 停靠点共享状态：-1 表示尚未开始，1 表示已满、放行中 */
function makeHolds(wait) {
  return wait
    ? [
        { t: 2.72, released: false, charge: -1, lastKey: 0 },
        { t: 4.72, released: false, charge: -1, lastKey: 0 }
      ]
    : [];
}

function runSplash(opts = {}) {
  return new Promise((resolve) => {
    const out = opts.out || process.stdout, inp = process.stdin;
    const reduced = !!(opts.reduced || process.env.REDUCED_MOTION || process.env.NO_MOTION);
    const speed = TOTAL / (opts.duration || TOTAL);
    const fps = opts.fps || 30;
    const truecolor = /truecolor|24bit/i.test(process.env.COLORTERM || '') || process.env.TERM_PROGRAM === 'iTerm.app' || !!process.env.WT_SESSION;
    const sgr = makeSgr(truecolor);

    if (!out.isTTY) { out.write('APICode · APICODE HARNESS\n'); return resolve(); }

    let W = out.columns, H = out.rows, prev = null, vt = 0, skipAt = null, done = false;
    let holdCharge = -1;   // 当前停靠点的长按蓄力 0..1；-1 表示不在停靠点
    const holds = makeHolds(opts.wait && inp.isTTY);   // stdin 不是 TTY 时没人能按键：不停靠
    // 机械女声：设计时间轴上的四个节点各播一句；reduced / voice:false 时关闭
    const voice = createVoicePlayer({ enabled: opts.voice !== false && !reduced });
    let ready = !opts.ready; if (opts.ready) Promise.resolve(opts.ready).then(() => { ready = true; }, () => { ready = true; });
    const REDUCED = [0.95, 2.7, 4.7, 5.95, 9.9, 12.4];
    let last = process.hrtime.bigint(), elapsed = 0;
    let timer = null;

    const write = (s) => out.write(s);
    function cleanup() {
      if (done) return; done = true;
      if (timer) clearInterval(timer);
      try { voice.stop(); } catch (e) { /* ignore */ }
      try { inp.setRawMode && inp.isTTY && inp.setRawMode(false); } catch (e) { /* ignore */ }
      inp.pause(); inp.removeListener('data', onKey);
      write('\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l');
      process.removeListener('exit', cleanup);
    }
    function finish() {
      cleanup();
      if (opts.command && opts.command.length) {
        const c = spawn(opts.command[0], opts.command.slice(1), { stdio: 'inherit' });
        c.on('exit', (code) => { process.exitCode = code || 0; resolve(); });
        c.on('error', (e) => { console.error(String(e.message)); resolve(); });
      } else resolve();
    }

    function onKey(buf) {
      const s = buf.toString();
      if (s === '\x03') { cleanup(); process.exit(130); }
      if (skipAt === null && (s === '\x1b' || /^[sSqQ]$/.test(s))) { skipAt = performance.now(); return; }
      if (s === '\r' || s === '\n' || s === ' ') {
        const h = holds.find((x) => !x.released);
        if (!h) return;
        // 长按蓄力：第一次按键（或松手后再按）开始计时，重复字节只续期。
        // 只认停靠点附近的按键，前面的阶段乱按不会提前蓄力。
        const now = performance.now();
        if (vt < h.t - 0.05) return;
        if (h.charge < 0 || now - h.lastKey > HOLD_GAP_MS) h.charge = 0;
        h.lastKey = now;
      }
    }

    function frame() {
      const now = process.hrtime.bigint(), dt = Number(now - last) / 1e9; last = now; elapsed += dt;
      if (out.columns !== W || out.rows !== H) { W = out.columns; H = out.rows; prev = null; write('\x1b[2J'); }
      if (reduced) {
        vt = REDUCED[Math.min(REDUCED.length - 1, Math.floor(elapsed / 0.9))];
        if (elapsed > REDUCED.length * 0.9 && skipAt === null) skipAt = performance.now();
      } else {
        vt += dt * speed;
        for (const h of holds) if (!h.released && vt > h.t) vt = h.t;
        // 长按判定：vt 已被钳在停靠点，这里只看真实时间。按住满 HOLD_MS 就放行，
        // 松手（超过 HOLD_GAP_MS 没有新按键）则蓄力回落，重新按住从头再来。
        const now = performance.now();
        let live = null;
        for (const h of holds) {
          if (h.released) continue;
          if (vt < h.t - 0.05) break;               // 还没到停靠点
          live = h; break;
        }
        for (const h of holds) {
          if (h.released || h.charge < 0) continue;
          if (now - h.lastKey > HOLD_GAP_MS) {
            h.charge = Math.max(-1, h.charge - dt * HOLD_DECAY);   // 松手：回落
          } else if (h === live) {
            h.charge += dt;                                         // 按住：累计
            if (h.charge >= HOLD_MS / 1000) { h.released = true; h.charge = -1; }
          }
        }
        holdCharge = live ? Math.max(0, live.charge) : -1;
        if (!ready && vt > 12.5) vt = 12.5; // 真实初始化未完成：停在欢迎画面
      }
      let fade = 0;
      if (skipAt !== null) { voice.stop(); fade = clamp((performance.now() - skipAt) / 300); if (fade >= 1) return finish(); }
      else voice.tick(vt);   // 语音跟随虚拟时钟：停靠等待时不会错位，跳过时不再补放
      if (vt >= TOTAL) return finish();

      let S;
      if (W < MIN_W || H < MIN_H) {
        S = new Screen(W, H);
        S.textC(W / 2, Math.floor(H / 2), `终端太小 · 需要至少 ${MIN_W}×${MIN_H}（当前 ${W}×${H}）`, COL.ink);
      } else {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3);
        S = render(vt, W, H, { name: opts.name, ringSpeed: opts.ringSpeed, pulse, fade, version: opts.version, hold: holdCharge });
      }
      write('\x1b[?2026h' + diffOutput(prev, S, sgr) + '\x1b[?2026l');
      prev = S;
    }

    write('\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[0m\x1b[2J');
    process.on('exit', cleanup);
    if (inp.isTTY) { inp.setRawMode(true); inp.resume(); inp.on('data', onKey); }
    timer = setInterval(frame, Math.round(1000 / fps));
    frame();
  });
}

/* ═════════════════════ 11. 命令行 ═════════════════════ */

function parseArgs(argv) {
  const o = {}, rest = argv.slice(2), dd = rest.indexOf('--');
  if (dd >= 0) { o.command = rest.slice(dd + 1); rest.length = dd; }
  const val = (a, i) => (a.includes('=') ? a.split('=')[1] : rest[i + 1]);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '-h' || a === '--help') o.help = true;
    else if (a === '--wait') o.wait = true;
    else if (a === '--reduced') o.reduced = true;
    else if (a.startsWith('--duration')) { o.duration = parseFloat(val(a, i)); if (!a.includes('=')) i++; }
    else if (a.startsWith('--ring-speed')) { o.ringSpeed = parseFloat(val(a, i)); if (!a.includes('=')) i++; }
    else if (a.startsWith('--name')) { o.name = String(val(a, i)).toUpperCase(); if (!a.includes('=')) i++; }
    else if (a.startsWith('--fps')) { o.fps = parseInt(val(a, i), 10); if (!a.includes('=')) i++; }
  }
  return o;
}

const HELP = `APICode 开屏启动动画（CLI）

  node apicode-splash.js [选项] [-- 动画结束后要启动的命令]

  --duration <秒>     总时长，默认 15（不含两处长按停靠的等待）
  --ring-speed <倍率> 圆环旋转速度倍率，默认 1
  --wait              授权、身份两步停下，等待长按 Enter
  --reduced           减少动态效果（逐阶段显示稳定画面）；也可设环境变量 REDUCED_MOTION=1
  --name <名字>       身份资料里显示的名字（演示占位），默认取系统用户名
  --fps <帧率>        默认 30

  按键：长按 Enter / Space 确认 · S / Q / Esc 跳过 · Ctrl-C 退出
  终端需至少 ${MIN_W}×${MIN_H}；建议 120×40 以上，并使用支持 24 位真彩色的终端。
`;

if (require.main === module) {
  const o = parseArgs(process.argv);
  if (o.help) { process.stdout.write(HELP); process.exit(0); }
  runSplash(o).then(() => process.exit(process.exitCode || 0));
}

module.exports = { runSplash, render, Screen, Canvas, TOTAL, RING, MIN_W, MIN_H, diffOutput, makeSgr, defaultName, idFor };
