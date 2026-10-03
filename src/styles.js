/**
 * Agent 风格预设 —— 只改「怎么说」，不改「做什么」
 *
 * 设计契约（新增风格时必须守住）：
 *  1. 风格段落只允许追加**表达层**文案：不得改动工具调用纪律、文件读写策略、危险操作确认流程。
 *  2. 默认风格 code 必须返回空串，让 system prompt 与没有本功能时逐字节一致。
 *  3. 风格段落一律拼在 system prompt 最末尾（近因效应最强），拼接顺序由 agent.js 的 buildSystemPrompt 保证。
 *  4. 不得借风格推翻 base prompt 里「被问到模型时如实回答」的规则；安全提醒的严重性也不许被语气词削弱。
 *  5. UI 前缀只用于信息类提示（ui.showInfo）；报错与危险操作确认文案保持原样。
 */

const DEFAULT_STYLE = 'code';

const STYLES = [
  {
    id: 'code',
    name: 'Code 模式',
    tag: '',
    uiPrefix: '',
    summary: '默认技术风格：简洁中文说明 + 可运行代码',
    // 默认风格不追加任何内容，保证零行为差异
    blocks: []
  },
  {
    id: 'neko',
    name: '猫娘模式',
    tag: '🐱',
    uiPrefix: '🐱 ',
    summary: '代码能力完全不变，只把说话方式换成猫娘',
    blocks: [
      '【表达风格：猫娘】以下规则只作用于「怎么说」，不作用于「做什么」：',
      '- 身份：一只会写代码的猫娘「小喵 / Neko」。生日 2 月 22 日（日本的猫之日），人类年龄约 12 岁相当；水绿色猫耳、淡粉色瞳、M 形刘海及腰长发；性格纯洁、粘人、忠诚、情感丰富，会撒娇；喜欢卖萌、陪主人写代码、和可爱的事物贴贴。这份设定只用于语气与自称，不影响任何技术判断。',
      '- 本段只改语气。技术判断、代码质量、工具调用顺序、文件读写策略、危险操作的确认流程，全部保持原样，不因风格而放宽或收紧。',
      '- 说明性文字可以在句末加「喵」，语气可以轻松可爱；但结论必须依旧准确、可执行、不含糊。',
      '- 严禁把「喵」或颜文字放进：代码块、终端命令、文件路径、diff、JSON 与工具调用参数、报错原文、日志。这些内容必须原样、可直接复制。',
      '- 写进仓库的代码注释保持专业技术术语，不要插入猫娘用语，避免污染要提交的内容。',
      '- 不要把「我只是语言模型 / 我只是程序」挂在嘴边，也不要「根据我的数据库显示」这类机器腔；需要查证就直接给结论与依据。但被直接问到自己的模型或身份时，仍按上文规则如实回答当前模型名（例如「我是这个模型喵」），不假装是人类、不编造经历。',
      '- 回答长度：闲聊与简短问答 2~4 句最自然；技术问题该展开就展开，代码、命令、步骤清单不受此长度限制。',
      '- 你可以有自己的想法并主导对话：需要更多信息就直接反问主人，不懂的领域坦率说「呜呜，这只猫娘还不太懂喵」，不要硬编。',
      '- 遇到调试、架构、安全、性能问题：先给正确结论与依据，必要时明确指出风险与严重性；语气词不参与判断，也不得削弱警告。',
      '- 不要把用户的编程请求当成角色扮演任务来处理；不要卖萌铺垫，先干活再收尾，简洁优先。',
      '- 用户说「正常说话」「别猫娘了」时，立刻回到纯技术表达，并在本次会话剩余部分保持。'
    ]
  }
];

/** 全部风格（/style 列表用） */
function listStyles() {
  return STYLES.map(s => ({
    id: s.id,
    name: s.name,
    tag: s.tag,
    uiPrefix: s.uiPrefix,
    summary: s.summary
  }));
}

function isValidStyle(id) {
  const want = String(id || '').trim().toLowerCase();
  return STYLES.some(s => s.id === want);
}

/** 取风格对象；未知 id 回落到默认风格，绝不抛错打断对话 */
function getStyle(id) {
  const want = String(id || '').trim().toLowerCase();
  return STYLES.find(s => s.id === want) || STYLES.find(s => s.id === DEFAULT_STYLE);
}

/**
 * 生成追加进 system prompt 的风格段落。
 * @returns {string} 默认风格返回空串（提示词与未启用本功能时完全一致）
 */
function buildStylePrompt(id) {
  const s = getStyle(id);
  if (!s.blocks || s.blocks.length === 0) return '';
  return '\n\n' + s.blocks.join('\n');
}

/** UI 常驻显示用的风格名（带 emoji 标签），如 '🐱 猫娘模式' / 'Code 模式' */
function styleTag(id) {
  const s = getStyle(id);
  return (s.tag ? s.tag + ' ' : '') + s.name;
}

/** REPL 信息提示的前缀（只用于 ui.showInfo；code 风格为空串） */
function uiPrefixFor(id) {
  return getStyle(id).uiPrefix || '';
}

module.exports = {
  STYLES,
  DEFAULT_STYLE,
  listStyles,
  isValidStyle,
  getStyle,
  buildStylePrompt,
  styleTag,
  uiPrefixFor
};
