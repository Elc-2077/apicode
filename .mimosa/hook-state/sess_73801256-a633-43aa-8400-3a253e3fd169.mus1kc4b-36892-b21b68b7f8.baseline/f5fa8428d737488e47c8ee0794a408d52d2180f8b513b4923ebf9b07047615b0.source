/**
 * 技能候选面板的「算与画」——纯函数部分（行文本、条目挑选、防换行校验）
 *
 * bin/cli.js 只负责游标移动、擦除与按键分派；这里的所有计算都不碰终端，
 * 因此可以按各种列宽单测：面板每一行都必须只占 1 个终端行，
 * 否则 CLI 侧 term.up(n) 的行数记账会与真实下移脱钩（表现为每按一次 ↑↓ 多出一行）。
 */

const chalk = require('chalk');
const { dispWidth, clipW } = require('./term-width');
const { matchSkills, countSkillMatches } = require('./skills');

const PANEL_MAX_ROWS = 8;

// 列宽留 4 列余量确保不触边；下限不能高于终端本身宽度（否则 20 列的窄窗口反而会超宽）
function panelCols(termWidth) {
  const w = Math.max(12, termWidth || 80);
  return Math.max(8, w - 4);
}

// 行预算受视口高度约束（含底部提示行）
function panelRowBudget(termHeight, maxRows = PANEL_MAX_ROWS) {
  const h = termHeight || 24;
  return Math.max(3, Math.min(maxRows + 1, h - 5));
}

/**
 * 挑选面板条目：斜杠命令在前（全部匹配项），其余给技能。
 * 返回**完整**匹配列表（上限 maxItems），滚动窗口由 buildLines 依据 rows/winStart 切片，
 * 这样几百个技能都能翻到，而不是只能选屏上那几条。
 * @param {{skills, commands, query, maxItems}} o
 * @returns {{items:Array, total:number}}
 */
function buildItems(o) {
  const items = [];
  const query = o.query || '';
  const q = String(query).toLowerCase();
  const commands = o.commands || [];
  const maxItems = o.maxItems || 400;

  for (const c of commands) {
    const hit = q === '' ? true : String(c.cmd).slice(1).toLowerCase().startsWith(q);
    if (!hit) continue;
    items.push({ type: 'cmd', cmd: c.cmd, desc: c.desc });
  }

  const room = Math.max(0, maxItems - items.length);
  for (const s of matchSkills(o.skills, query, { limit: room })) {
    items.push({ type: 'skill', skill: s });
  }

  return {
    items: items.slice(0, maxItems),
    total: countSkillMatches(o.skills, query)
  };
}

/**
 * 渲染面板可见部分：从 items 的第 winStart 项起取 rows 行，再附一行操作提示。
 * 每一行的显示宽度都严格 ≤ cols；行数上限由调用侧的 rows 决定。
 * @param {{items, selected, winStart, rows, query, total, cols, pendingNames, loadedNames, hint?}} o
 * @returns {string[]} 带 ANSI 的行文本，最后一行是提示行（共 rows + 1 行）
 */
function buildLines(o) {
  const items = o.items || [];
  const cols = o.cols || panelCols(80);
  const rows = Math.max(1, o.rows || 1);
  const sel = typeof o.selected === 'number' ? o.selected : -1;
  const maxWin = Math.max(0, items.length - 1);
  const win = Math.max(0, Math.min(o.winStart || 0, maxWin));
  const pending = o.pendingNames || [];
  const loaded = o.loadedNames || [];

  const lines = [];
  const stop = Math.min(items.length, win + rows);

  for (let i = win; i < stop; i++) {
    const it = items[i];
    const mark = i === sel ? '▶ ' : '  ';
    const markCols = dispWidth(mark);

    if (it.type === 'cmd') {
      const descCols = cols - markCols - dispWidth(it.cmd) - 2;
      lines.push(mark + chalk.magenta(it.cmd) +
        (descCols > 6 ? chalk.gray('  ' + clipW(it.desc, descCols)) : ''));
      continue;
    }

    // 二级选择面板条目（如 /style 的风格列表）：名字可长，先裁名字再给说明留列
    if (it.type === 'choice') {
      const label = clipW(it.label, cols - markCols);
      const descCols = cols - markCols - dispWidth(label) - 2;
      lines.push(mark + chalk.white(label) +
        (descCols > 6 ? chalk.gray('  ' + clipW(it.desc, descCols)) : ''));
      continue;
    }

    const s = it.skill;
    let status = '';
    let statusColor = chalk.gray;
    if (pending.includes(s.name)) { status = ' ✓待发送'; statusColor = chalk.yellow; }
    else if (loaded.includes(s.name)) { status = ' ●已在上下文'; statusColor = chalk.blue; }

    // 极窄窗口里连「状态标记」都放不下时，先丢状态标记，保证整行不超宽
    if (status && markCols + dispWidth(status) > cols) status = '';

    // 名字自己就可能超预算（窄终端 + 长技能名），必须先裁名字，再拿剩下的列给描述
    const nameBudget = cols - markCols - dispWidth(status);
    const name = clipW(s.name, nameBudget);

    const sep = ' — ';
    const descCols = cols - markCols - dispWidth(name) - dispWidth(sep) - dispWidth(status);
    const desc = descCols > 6 ? clipW(s.description, descCols) : '';

    lines.push(mark + chalk.white(name) +
      (desc ? chalk.gray(sep + desc) : '') +
      (status ? statusColor(status) : ''));
  }

  const q = o.query || '';
  const pos = items.length ? `第 ${Math.min(sel + 1, items.length)}/${items.length} 项` : '无匹配';
  const winPos = items.length > rows ? ` · 窗口 ${win + 1}-${stop}` : '';
  // 二级选择面板（o.hint）只换掉后半段按键说明；「第 N/M 项 · 窗口 a-b」始终在最前——
  // 窄终端上这行会被 clipW 截尾，先说的必须是最要紧的位置信息。
  const isPick = typeof o.hint === 'string' && o.hint !== '';
  const counts = isPick ? '' : ` · 匹配技能 ${o.total || 0} 个`;
  const legend = isPick ? o.hint
    : `↑↓ 选择 · PgUp/PgDn 翻页 · Home/End 首尾 · Enter ${q ? '加载技能' : '接受'} · Esc 关闭`;
  const hint = `${pos}${winPos}${counts} · ${legend}`;
  lines.push(chalk.gray(clipW('  ' + hint, cols)));

  return lines;
}

/** 去掉 ANSI，便于按显示宽度校验 */
function plainOf(s) {
  return String(s || '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');
}

/**
 * 防换行校验：每一行的显示宽度必须 ≤ termCols - 1，否则 CLI 的行数记账会失真。
 * @returns {boolean} true = 可以安全绘制
 */
function fitsOneRowEach(lines, termCols) {
  const limit = Math.max(12, termCols || 80) - 1;
  return (lines || []).every(l => dispWidth(plainOf(l)) <= limit);
}

module.exports = {
  PANEL_MAX_ROWS,
  panelCols,
  panelRowBudget,
  buildItems,
  buildLines,
  plainOf,
  fitsOneRowEach
};
