/**
 * Skills - 发现本机技能目录（SKILL.md），为系统提示生成精简技能索引，并供 load_skill 工具取正文。
 *
 * 设计要点：
 *  - 零依赖：手写极简 frontmatter 解析（只认顶格 name/description），不引 yaml 包；纯字符串处理，无子进程。
 *  - 全同步 fs：启动扫描必须在建 Agent 之前完成（system prompt 要带上索引），风格与 tracker/config 一致。
 *  - 扫描源：项目根下 .zcode|.agents|.claude/skills 优先，再用户主目录同名三处；按 name 去重（先到先得，项目覆盖全局）。
 *  - 链接兼容：技能目录常是符号链接 / Windows junction（本机 ~/.zcode/skills 即如此），
 *    统一用 fs.statSync 判定（stat 会跟随链接），不依赖 Dirent 的标志位。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_FILE = 'SKILL.md';

// 项目根与主目录下都适用的技能根相对路径
const SKILL_ROOT_SUBDIRS = [
  path.join('.zcode', 'skills'),
  path.join('.agents', 'skills'),
  path.join('.claude', 'skills')
];

// —— 基础小工具 ——
function dedupePaths(list) {
  const out = [];
  const seen = new Set();
  for (const p of list) {
    const key = process.platform === 'win32' ? p.toLowerCase() : p;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function isDirLike(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch (e) {
    return false;
  }
}

function isInside(base, target) {
  const rel = path.relative(base, target);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

// POSIX 风格展示路径（仓库惯例：glob/grep 结果同样这样归一）
function posixPath(p) {
  return String(p).replace(/\\/g, '/');
}

// 折叠换行与制表符，供索引单行展示
function oneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function stripQuotes(v) {
  if (v.length >= 2 &&
      ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
    return v.slice(1, -1).trim();
  }
  return v;
}

function isBlockScalar(v) {
  return /^[>|][-+\d]*$/.test(v);
}

/**
 * 列出候选技能根目录：项目级在前（可覆盖全局同名技能），全局级在后；去掉重复（cwd 恰为主目录时）。
 */
function skillRoots(rootDir) {
  const base = rootDir || process.cwd();
  const project = [];
  const global = [];
  for (const sub of SKILL_ROOT_SUBDIRS) {
    const inProject = path.resolve(base, sub);
    const inHome = path.join(os.homedir(), sub);
    if (isDirLike(inProject)) project.push(inProject);
    if (isDirLike(inHome)) global.push(inHome);
  }
  return dedupePaths([...project, ...global]);
}

/**
 * 解析 SKILL.md 顶部 --- frontmatter（极简 YAML，按行扫描，不借用任何命令执行语义）。
 * 只认顶格键 name / description；其它键（如 metadata）连同其缩进子行一并忽略；
 * 值支持单/双引号，以及折叠标量（> / |）后续的缩进续行。
 * @returns {{name: string|undefined, description: string|undefined, body: string}}
 */
function parseFrontmatter(text) {
  const s = String(text || '').replace(/^/, '');
  const lines = s.split(/\r?\n/);

  // 定位起始围栏（允许前面有空行）
  let openIdx = 0;
  while (openIdx < lines.length && lines[openIdx].trim() === '') openIdx++;
  if (openIdx >= lines.length || lines[openIdx].trim() !== '---') {
    return { name: undefined, description: undefined, body: s }; // 没有 frontmatter
  }

  // 定位闭合围栏（--- 或 YAML 文档结束符 ...）
  let closeIdx = -1;
  for (let j = openIdx + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t === '---' || t === '...') { closeIdx = j; break; }
  }
  if (closeIdx === -1) {
    return { name: undefined, description: undefined, body: s }; // 未闭合：按无 frontmatter 处理，正文全量保留
  }

  const values = {};
  let lastKey = null;

  for (const line of lines.slice(openIdx + 1, closeIdx)) {
    if (line.trim() === '') { lastKey = null; continue; }

    // 缩进行：并入上一个被采纳的键值；若上一个键未被采纳（如 metadata）则整段忽略
    if (/^[ \t]/.test(line)) {
      if (!lastKey) continue;
      const cont = stripQuotes(line.trim());
      if (!cont) continue;
      values[lastKey] = values[lastKey] ? values[lastKey] + ' ' + cont : cont;
      continue;
    }

    const idx = line.indexOf(':');
    if (idx <= 0) { lastKey = null; continue; }
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();

    if (key === 'name' || key === 'description') {
      values[key] = isBlockScalar(val) ? '' : stripQuotes(val);
      lastKey = key;
    } else {
      lastKey = null; // 不关心的键
    }
  }

  return {
    name: values.name,
    description: values.description,
    body: lines.slice(closeIdx + 1).join('\n')
  };
}

/**
 * 无 description 时从正文取首个有效行做摘要（跳过标题、引用、列表符号）。
 */
function summarizeBody(body, max = 200) {
  for (const raw of String(body || '').split(/\r?\n/)) {
    const line = raw.replace(/^[ \t]+/, '').replace(/^[#>*+-]+[ \t]*/, '').trim();
    if (!line) continue;
    return line.length > max ? line.slice(0, max) + '…' : line;
  }
  return '';
}

/**
 * 扫描全部技能根目录，返回精简技能表（按 name 排序）。
 * 每项：{ name, description, dir, file, root, source: 'project' | 'global' }
 * root 记录这条技能是从哪个技能根扫出来的，供 isSkillRecordSafe 复核边界。
 */
function discoverSkills(options = {}) {
  const base = options.rootDir || process.cwd();
  const skills = [];
  const seen = new Set();

  for (const root of skillRoots(base)) {
    const source = isInside(base, root) ? 'project' : 'global';

    let entries;
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      continue; // 无权限/竞态删除：跳过该根
    }

    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue; // 隐藏项跳过
      const dir = path.join(root, ent.name);
      if (!isDirLike(dir)) continue;          // statSync 已跟随符号链接 / junction

      const file = path.join(dir, SKILL_FILE);
      let st;
      try {
        st = fs.statSync(file);
      } catch (e) {
        continue; // 该目录下没有 SKILL.md
      }
      if (!st.isFile()) continue;

      let parsed = { name: undefined, description: undefined, body: '' };
      try {
        parsed = parseFrontmatter(fs.readFileSync(file, 'utf-8'));
      } catch (e) {
        // 读失败不致命：名字用目录兜底，正文留给 load_skill 再报错
      }

      const name = oneLine(parsed.name) || ent.name;
      const key = name.toLowerCase();
      if (seen.has(key)) continue; // 同名技能：项目优先、先到先得
      seen.add(key);

      skills.push({
        name,
        description: oneLine(parsed.description) || summarizeBody(parsed.body),
        dir,
        file,
        root,
        source
      });
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * 按给定描述长度渲染索引块（每技能一行）。
 */
function renderIndex(skills, maxDesc) {
  const lines = skills.map(s => {
    const d = s.description || '';
    if (maxDesc <= 0 || !d) return `- ${s.name}`;
    const shown = d.length > maxDesc ? d.slice(0, maxDesc) + '…' : d;
    return `- ${s.name}: ${shown}`;
  });

  const note = maxDesc <= 0
    ? '此处只列名字，描述未进索引：拿不准某个技能就先 load_skill 看它开头的说明。'
    : '描述被截断，拿不准就先 load_skill 读取完整指令再决定。';

  return `\n\n## 可用技能（本机 ${SKILL_FILE}，共 ${skills.length} 个）\n` +
    `当任务明显匹配下面某个技能时，先调用 load_skill(name) 读取该技能完整指令，再严格按其指导执行；` +
    `技能自带的脚本与资源一律经 run_shell 在技能目录内运行。\n` +
    note + '\n' +
    lines.join('\n');
}

/**
 * 生成追加进 system prompt 的精简技能索引块。
 * 中文描述密度高（约 1 字 ≈ 1 token），技能很多时会吃掉上万 token，而 agentic loop 每一步都重发
 * system prompt。因此按字符预算逐级降级：优先带描述（maxDesc 字）→ 12 字 → 只列名字。
 * 空表返回空串，保证无技能环境下行为与改动前完全一致。
 */
function buildSkillIndex(skills, options = {}) {
  if (!skills || skills.length === 0) return '';
  const budget = options.budget || 10000;
  const levels = [options.maxDesc === 0 ? 0 : (options.maxDesc || 24), 12, 0];

  let text = '';
  for (const maxDesc of levels) {
    text = renderIndex(skills, maxDesc);
    if (text.length <= budget) break;
  }
  return text;
}

/**
 * 按查询串匹配技能（供 REPL 里 `/` 前缀的实时筛选面板使用）。
 * 权重：名字前缀 0 > 名字包含 1 > 描述包含 2；空查询按原名顺序返回前 limit 个。
 */
function matchSkills(skills, query, options = {}) {
  const limit = options.limit || 8;
  const list = skills || [];
  const q = oneLine(query).toLowerCase();
  if (!q) return list.slice(0, limit);

  const scored = [];
  for (const s of list) {
    const n = s.name.toLowerCase();
    const d = (s.description || '').toLowerCase();
    let score;
    if (n.startsWith(q)) score = 0;
    else if (n.includes(q)) score = 1;
    else if (d.includes(q)) score = 2;
    else continue;
    scored.push({ s, score });
  }
  scored.sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name));
  return scored.slice(0, limit).map(x => x.s);
}

/**
 * 按查询串匹配到的技能总数（面板用它显示「还有 N 个」，limit 传 Infinity 即全量）。
 */
function countSkillMatches(skills, query) {
  return matchSkills(skills, query, { limit: Infinity }).length;
}

/**
 * 按名字找技能：大小写不敏感匹配 name，再回退匹配目录名。
 */
function findSkill(skills, name) {
  const want = oneLine(name).toLowerCase();
  if (!want) return null;
  const list = skills || [];
  return list.find(s => s.name.toLowerCase() === want)
      || list.find(s => path.basename(s.dir).toLowerCase() === want)
      || null;
}

/**
 * 复核一条技能记录指向的是否确实是「某个技能根 / <技能目录> / SKILL.md」。
 * 正常记录都由 discoverSkills 产出、路径不来自用户输入；这里把边界写死，
 * 免得日后有调用方手搓 { file: '..\\..\\x' } 之类的对象传进来，退化成任意文件读取。
 * 判定权威是当下的技能根集合，**不是记录自带的 root**（root 谎报也越不过去）。
 */
function isSkillRecordSafe(skill) {
  if (!skill || typeof skill.file !== 'string' || typeof skill.dir !== 'string') return false;

  const file = path.resolve(skill.file);
  const dir = path.resolve(skill.dir);
  if (path.basename(file) !== SKILL_FILE) return false;   // 只读这一个固定文件名
  if (path.dirname(file) !== dir) return false;           // 且必须就躺在它自己那个目录里

  // 目录必须落在真实的技能根（项目级 + 全局级）之内
  if (!skillRoots(process.cwd()).some(r => isInside(path.resolve(r), dir))) return false;
  // 记录自带 root 时再对一遍：扫它的那个根也必须真能包住这个目录
  if (typeof skill.root === 'string' && !isInside(path.resolve(skill.root), dir)) return false;
  return true;
}

/**
 * 读取技能正文（已去掉 frontmatter），供 load_skill 工具喂给模型。
 * 先过 isSkillRecordSafe；抛出的错误由 executeTool 的 try/catch 兜成中文文本。
 */
function readSkillBody(skill) {
  if (!isSkillRecordSafe(skill)) {
    throw new Error('技能记录不合法：只允许读取技能目录内的 SKILL.md');
  }
  const parsed = parseFrontmatter(fs.readFileSync(path.resolve(skill.file), 'utf-8'));
  const body = String(parsed.body || '').trim();
  return {
    body: body || '（该技能只有 frontmatter 说明，没有正文指令）',
    description: parsed.description ? oneLine(parsed.description) : skill.description
  };
}

module.exports = {
  SKILL_FILE,
  skillRoots,
  parseFrontmatter,
  discoverSkills,
  buildSkillIndex,
  matchSkills,
  countSkillMatches,
  findSkill,
  readSkillBody,
  isSkillRecordSafe,
  posixPath,
  oneLine
};
