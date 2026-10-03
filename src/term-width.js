/**
 * 终端显示宽度工具（面板/列表按「列」排版时必用，不能用 String.length）
 *
 * 为什么需要：中文、全角，以及「东亚模糊宽度」字符（— … ↑ ↓ ▶ ● ✓ 等）在 CJK locale 的终端里
 * 占 2 列。若按 JS 字符数裁剪，行会物理换行：真实占用行数 > 记账行数，
 * 于是 term.up(n) 少回一行，浮动面板每重绘一次就向下漂一行、留下旧的输入行残渣。
 *
 * 策略：宁可估宽，不可估窄 —— 所有不确定的一律按 2 列算，保证「测量值 ≥ 实际占列」。
 */

function charWidth(cp) {
  // 组合符号 / 变体选择符：不占列
  if ((cp >= 0x0300 && cp <= 0x036F) || (cp >= 0xFE00 && cp <= 0xFE0F)) return 0;

  // 东亚模糊宽度区间：按 2 列
  if ((cp >= 0x2010 && cp <= 0x2027) ||   // 破折号、引号、省略号 …
      (cp >= 0x2030 && cp <= 0x205E) ||
      (cp >= 0x2190 && cp <= 0x21FF) ||   // 箭头 ↑ ↓ →
      (cp >= 0x2200 && cp <= 0x22FF) ||   // 数学符号
      (cp >= 0x2500 && cp <= 0x27BF) ||   // 制表符、几何图形 ▶ ●、装饰符 ✓
      (cp >= 0x2B00 && cp <= 0x2E7F) ||
      (cp >= 0x3000 && cp <= 0x303E) ||   // CJK 标点
      (cp >= 0x3200 && cp <= 0x33FF) ||
      (cp >= 0xFE30 && cp <= 0xFE4F) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||   // 全角形式
      (cp >= 0xFFE0 && cp <= 0xFFE6)) return 2;

  // CJK / 假名 / 谚文 / 补充平面（emoji）：一律 2 列
  if (cp >= 0x2E80 && cp !== 0x303F) return 2;
  if (cp >= 0x1F000) return 2;

  return 1;
}

/** 字符串占用的终端列数（保守估计，≥ 实际） */
function dispWidth(s) {
  let w = 0;
  for (const ch of String(s || '')) w += charWidth(ch.codePointAt(0));
  return w;
}

/** 按显示列截断（不是字符数），省略号按自身宽度计入预算 */
function clipW(s, cols) {
  s = String(s || '');
  if (cols <= 0) return '';
  if (dispWidth(s) <= cols) return s;

  const ellW = charWidth(0x2026);
  let w = 0;
  let out = '';
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0));
    if (w + cw > cols - ellW) break;
    out += ch;
    w += cw;
  }
  return out + '…';
}

/** 去掉 ANSI 转义序列，只为量宽度（chalk 把颜色码混在字符串里） */
function plainOf(s) {
  return String(s || '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[78]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '');
}

module.exports = { charWidth, dispWidth, clipW, plainOf };
