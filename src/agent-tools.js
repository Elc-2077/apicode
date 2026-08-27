/**
 * Agent Tools - 给 AI 用的「读写文件 / 搜索 / 跑命令」工具集
 * 类似 Claude Code：模型决定调用哪个工具，这里负责真正执行。
 *
 * 设计要点：
 *  - 危险操作（write_file/edit_file/create_dir/run_shell）执行前都会走 confirm 回调，
 *    由调用方（CLI）弹出 y/n 让用户把关。
 *  - 路径不做目录牢笼（用户选择「整个磁盘不限」），相对路径按 rootDir 解析。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// —— 工具 schema（OpenAI function 格式；Anthropic 会在 agent 里转换）——
const TOOL_SCHEMAS = [
  {
    name: 'read_file',
    description: '读取一个文本文件的内容。返回带行号的内容。用于查看代码/文档。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径（相对或绝对）' },
        offset: { type: 'integer', description: '从第几行开始读（1 起，可选）' },
        limit: { type: 'integer', description: '最多读多少行（可选，默认 2000）' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_dir',
    description: '列出一个目录下的文件和子目录。',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '目录路径（默认当前工作目录）' } },
      required: []
    }
  },
  {
    name: 'glob',
    description: '按通配符查找文件路径，支持 * 和 **。例如 src/**/*.js。',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '通配符，如 **/*.md' },
        path: { type: 'string', description: '搜索根目录（默认当前工作目录）' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'grep',
    description: '在文件内容里按正则搜索，返回匹配的 文件:行号: 内容。',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则表达式' },
        path: { type: 'string', description: '搜索根目录或单个文件（默认当前工作目录）' },
        glob: { type: 'string', description: '只搜匹配该通配符的文件，如 *.js（可选）' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'write_file',
    description: '把内容写入文件（覆盖）。会创建不存在的父目录。危险操作，执行前需用户确认。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '完整文件内容' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'edit_file',
    description: '把文件里的 old_string 替换成 new_string。old_string 必须与文件内容精确匹配。危险操作，需确认。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        old_string: { type: 'string', description: '要被替换的原文（需唯一，除非 replace_all）' },
        new_string: { type: 'string', description: '替换后的新内容' },
        replace_all: { type: 'boolean', description: '是否替换全部匹配（默认 false）' }
      },
      required: ['path', 'old_string', 'new_string']
    }
  },
  {
    name: 'create_dir',
    description: '创建目录（相当于 mkdir -p）。危险操作，需确认。',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '目录路径' } },
      required: ['path']
    }
  },
  {
    name: 'run_shell',
    description: '在终端执行一条命令并返回输出。危险操作，需确认。用于 git/npm/python/构建等。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'shell 命令' },
        cwd: { type: 'string', description: '工作目录（默认当前工作目录）' }
      },
      required: ['command']
    }
  },
  {
    name: 'read_image',
    description: '读取图像文件并返回 base64 编码的数据，用于视觉分析。支持 PNG、JPEG、GIF、WebP 格式。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '图像文件路径（相对或绝对）' }
      },
      required: ['path']
    }
  }
];

const DANGEROUS = new Set(['write_file', 'edit_file', 'create_dir', 'run_shell']);
const MAX_READ_BYTES = 200 * 1024;
const MAX_OUTPUT = 30 * 1024;

function truncate(s, n = MAX_OUTPUT) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + `\n... [输出过长，已截断，共 ${s.length} 字符]` : s;
}

// 把 glob 通配符编译成正则（支持 ** / * / ?）
function globToRegExp(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') { re += '.*'; i++; if (pattern[i + 1] === '/') i++; }
      else re += '[^/\\\\]*';
    } else if (c === '?') re += '[^/\\\\]';
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c;
    else if (c === '/') re += '[/\\\\]';
    else re += c;
  }
  return new RegExp('^' + re + '$');
}

// 递归收集文件（跳过 node_modules/.git 等噪音目录），带上限防爆
function walkFiles(root, { maxFiles = 5000 } = {}) {
  const out = [];
  const skip = new Set(['node_modules', '.git', '.svn', 'dist', 'build', '.next', '.cache']);
  const stack = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!skip.has(e.name)) stack.push(full); }
      else if (e.isFile()) out.push(full);
    }
  }
  return out;
}

// 生成危险操作的预览文本（给用户确认时看）
function previewFor(name, args, rootDir) {
  const resolve = p => path.resolve(rootDir, p || '.');
  if (name === 'write_file') {
    const p = resolve(args.path);
    const exists = fs.existsSync(p);
    const body = String(args.content || '');
    const head = body.split('\n').slice(0, 20).join('\n');
    return `${exists ? '覆盖' : '新建'}文件: ${p}\n内容(${body.length} 字符, 前 20 行):\n${head}${body.split('\n').length > 20 ? '\n...' : ''}`;
  }
  if (name === 'edit_file') {
    return `编辑文件: ${resolve(args.path)}\n- 删除:\n${truncate(args.old_string, 500)}\n+ 加入:\n${truncate(args.new_string, 500)}${args.replace_all ? '\n(替换全部匹配)' : ''}`;
  }
  if (name === 'create_dir') return `创建目录: ${resolve(args.path)}`;
  if (name === 'run_shell') return `执行命令${args.cwd ? ` (cwd=${args.cwd})` : ''}:\n$ ${args.command}`;
  return JSON.stringify(args);
}

/**
 * 执行一个工具。
 * @param {string} name
 * @param {object} args
 * @param {object} ctx { rootDir, confirm(async({name,args,preview,dangerous})=>bool) }
 * @returns {Promise<string>} 给模型看的执行结果文本
 */
async function executeTool(name, args, ctx = {}) {
  const rootDir = ctx.rootDir || process.cwd();
  const resolve = p => path.resolve(rootDir, p || '.');

  // 危险操作先确认
  if (DANGEROUS.has(name)) {
    const preview = previewFor(name, args, rootDir);
    let approved = true;
    if (typeof ctx.confirm === 'function') {
      approved = await ctx.confirm({ name, args, preview, dangerous: true });
    }
    if (!approved) return `❌ 用户拒绝了该操作（${name}），未执行。请换个方案或询问用户。`;
  }

  try {
    switch (name) {
      case 'read_file': {
        const p = resolve(args.path);
        const stat = fs.statSync(p);
        if (stat.size > MAX_READ_BYTES) return `文件过大(${stat.size} 字节)，请用 offset/limit 分段读取或用 grep。`;
        const text = fs.readFileSync(p, 'utf-8');
        let lines = text.split('\n');
        const offset = args.offset && args.offset > 0 ? args.offset - 1 : 0;
        const limit = args.limit && args.limit > 0 ? args.limit : 2000;
        lines = lines.slice(offset, offset + limit);
        const numbered = lines.map((l, i) => `${String(offset + i + 1).padStart(5)}  ${l}`).join('\n');
        return truncate(numbered);
      }
      case 'list_dir': {
        const p = resolve(args.path);
        const entries = fs.readdirSync(p, { withFileTypes: true });
        const lines = entries.map(e => (e.isDirectory() ? '📁 ' : '📄 ') + e.name);
        return lines.length ? lines.join('\n') : '(空目录)';
      }
      case 'glob': {
        const base = resolve(args.path);
        const re = globToRegExp(args.pattern);
        const files = walkFiles(base).filter(f => re.test(path.relative(base, f).replace(/\\/g, '/')));
        return files.length ? truncate(files.map(f => path.relative(base, f).replace(/\\/g, '/')).join('\n')) : '(无匹配文件)';
      }
      case 'grep': {
        const base = resolve(args.path);
        let files;
        const st = fs.existsSync(base) ? fs.statSync(base) : null;
        if (st && st.isFile()) files = [base];
        else {
          files = walkFiles(base);
          if (args.glob) { const g = globToRegExp(args.glob); files = files.filter(f => g.test(path.basename(f))); }
        }
        const re = new RegExp(args.pattern);
        const hits = [];
        for (const f of files) {
          let content;
          try { content = fs.readFileSync(f, 'utf-8'); } catch (e) { continue; }
          const ls = content.split('\n');
          for (let i = 0; i < ls.length; i++) {
            if (re.test(ls[i])) {
              hits.push(`${path.relative(base, f).replace(/\\/g, '/')}:${i + 1}: ${ls[i].trim().slice(0, 200)}`);
              if (hits.length >= 200) break;
            }
          }
          if (hits.length >= 200) break;
        }
        return hits.length ? truncate(hits.join('\n')) : '(无匹配)';
      }
      case 'write_file': {
        const p = resolve(args.path);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, String(args.content ?? ''), 'utf-8');
        return `✅ 已写入 ${p}（${String(args.content ?? '').length} 字符）`;
      }
      case 'edit_file': {
        const p = resolve(args.path);
        const content = fs.readFileSync(p, 'utf-8');
        const oldStr = String(args.old_string);
        if (!content.includes(oldStr)) return `❌ 未找到要替换的原文，文件未改动。请先 read_file 确认精确内容。`;
        if (!args.replace_all) {
          const count = content.split(oldStr).length - 1;
          if (count > 1) return `❌ old_string 匹配到 ${count} 处（不唯一）。请提供更长的唯一片段，或设 replace_all=true。`;
        }
        const next = args.replace_all ? content.split(oldStr).join(String(args.new_string)) : content.replace(oldStr, String(args.new_string));
        fs.writeFileSync(p, next, 'utf-8');
        return `✅ 已编辑 ${p}`;
      }
      case 'create_dir': {
        const p = resolve(args.path);
        fs.mkdirSync(p, { recursive: true });
        return `✅ 已创建目录 ${p}`;
      }
      case 'run_shell': {
        const cwd = args.cwd ? resolve(args.cwd) : rootDir;
        let out;
        try {
          out = execSync(args.command, { cwd, encoding: 'utf-8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 });
        } catch (e) {
          const so = (e.stdout || '') + (e.stderr || '');
          return truncate(`命令退出码 ${e.status ?? '非0'}${e.signal ? ' 信号 ' + e.signal : ''}\n${so || e.message}`);
        }
        return truncate(out || '(无输出)');
      }
      case 'read_image': {
        const p = resolve(args.path);
        const stat = fs.statSync(p);
        if (stat.size > 20 * 1024 * 1024) return `图像文件过大(${stat.size} 字节)，仅支持 20MB 以内的图像。`;

        // 读取图像并转为 base64
        const buffer = fs.readFileSync(p);
        const base64 = buffer.toString('base64');

        // 检测图像类型
        const ext = path.extname(p).toLowerCase();
        let mediaType = 'image/jpeg';
        if (ext === '.png') mediaType = 'image/png';
        else if (ext === '.gif') mediaType = 'image/gif';
        else if (ext === '.webp') mediaType = 'image/webp';

        // 返回一个特殊标记，让 agent 知道这是图像数据
        return JSON.stringify({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64
          },
          path: p
        });
      }
      default:
        return `未知工具: ${name}`;
    }
  } catch (err) {
    return `❌ 执行 ${name} 出错: ${err.message}`;
  }
}

module.exports = { TOOL_SCHEMAS, DANGEROUS, executeTool, previewFor };
