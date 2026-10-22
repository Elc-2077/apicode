'use strict';
/*
 * APICode 开屏动画 · 机械女声语音提示
 * ─────────────────────────────────────────────────────────────
 * 四个阶段各一句英文机械女声，全部是预生成好的 WAV（assets/voice/*.wav），
 * 播放时不做任何合成 —— 只负责在动画虚拟时钟走到时间点时把文件丢给系统播一遍。
 *
 * 播放方式：常驻播放器
 *   Windows 上启一个 PowerShell 子进程，stdin 逐行收 WAV 路径，收到就用
 *   System.Media.SoundPlayer 播（走 winmm，不依赖 .NET 音频栈初始化）。
 *   进程只在动画开始时启动一次，首句多等 ~0.7 秒；之后再播就是毫秒级，
 *   四句都能和画面同帧出现。若子进程起不来（组策略禁 PowerShell 等），
 *   自动退回「每句单独起进程」，最差也能出声，只是晚一点。
 *   播放失败一律静默忽略，绝不影响启动。
 *
 * macOS 用 afplay，Linux 优先 paplay / aplay / ffplay，都没有就不出声。
 *
 * 时间点与 splash.js 的 STAGE_AT 对齐（设计时间轴，秒）：
 *   1.00  需要访问许可        → ACCESS PERMISSION REQUIRED
 *   3.40  身份资料确认        → IDENTITY VERIFICATION
 *   6.15  开始读取权限        → PERMISSION READ STARTED
 *   12.10 欢迎访问 APICode    → WELCOME
 *
 * 开关：APICODE_SPLASH_VOICE=0 静音；传 { enabled: false } 同理。
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const VOICE_DIR = path.join(__dirname, 'assets', 'voice');

/** 触发点：t 是动画虚拟时钟（秒），file 是 assets/voice 下的文件名。 */
const CUES = [
  { t: 1.0, file: 'access.wav' },       // 需要访问许可
  { t: 3.4, file: 'identity.wav' },     // 身份资料确认
  { t: 6.15, file: 'permission.wav' },  // 开始读取权限
  { t: 12.1, file: 'welcome.wav' },     // 欢迎访问
];

function voiceEnabled(opts = {}) {
  if (opts.enabled === false) return false;
  const env = String(process.env.APICODE_SPLASH_VOICE || '').trim().toLowerCase();
  if (env === '0' || env === 'off' || env === 'false') return false;
  return true;
}

/* ── Windows：常驻 PowerShell 播放器 ─────────────────────────────── */

// $list 持有 SoundPlayer 引用，否则播到一半被 GC 收掉会截断。
const PLAYER_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  '$list = @()',
  'while (($l = [Console]::In.ReadLine()) -ne $null) {',
  '  if ($l.Trim()) {',
  '    $p = New-Object Media.SoundPlayer ($l.Trim())',
  '    $list += $p',
  '    $p.Play()',   // 异步：一句没播完也能接着播下一句
  '  }',
  '}',
].join('; ');

function spawnWindowsPlayer() {
  try {
    const p = spawn('powershell',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', PLAYER_SCRIPT],
      { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    p.on('error', () => {});          // 起不来就走回退路径，别抛
    p.stdin.on('error', () => {});    // 对端已退出时写入会 EPIPE
    return p;
  } catch (e) {
    return null;
  }
}

/** 单句独立进程（回退路径 / 非 Windows）。 */
function playOnce(full) {
  if (process.platform === 'win32') {
    const ps = `(New-Object Media.SoundPlayer '${full.replace(/'/g, "''")}').PlaySync()`;
    return spawn('powershell', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps],
      { stdio: 'ignore', windowsHide: true });
  }
  if (process.platform === 'darwin') return spawn('afplay', [full], { stdio: 'ignore' });
  for (const [bin, args] of [['paplay', [full]], ['aplay', ['-q', full]], ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', full]]]) {
    try { return spawn(bin, args, { stdio: 'ignore' }); } catch (e) { /* 试下一个 */ }
  }
  return null;
}

/**
 * 创建语音调度器。动画每帧调用 tick(vt)。
 * 时间点只触发一次；跳过（S/Q/Esc）时调用方 stop()，已排队的不再补放。
 */
function createVoicePlayer(opts = {}) {
  const enabled = voiceEnabled(opts) && CUES.every((c) => fs.existsSync(path.join(VOICE_DIR, c.file)));
  const fired = new Set();
  const live = new Set();
  let player = null;
  let playerDead = false;

  if (enabled && process.platform === 'win32') {
    player = spawnWindowsPlayer();
    if (player) {
      player.on('exit', () => { player = null; playerDead = true; });
    }
  }

  function speak(file) {
    const full = path.join(VOICE_DIR, file);
    if (player && !playerDead) {
      try { player.stdin.write(full + '\n'); return; } catch (e) { /* 退回单次播放 */ }
    }
    const p = playOnce(full);
    if (p) {
      live.add(p);
      p.on('exit', () => live.delete(p));
      p.on('error', () => live.delete(p));
    }
  }

  function tick(vt) {
    if (!enabled) return;
    for (const c of CUES) {
      if (fired.has(c.file) || vt < c.t) continue;
      fired.add(c.file);
      speak(c.file);
    }
  }

  function stop() {
    if (player) { try { player.stdin.end(); } catch (e) { /* ignore */ } try { player.kill(); } catch (e) { /* ignore */ } player = null; }
    for (const p of live) { try { p.kill(); } catch (e) { /* ignore */ } }
    live.clear();
  }

  return { tick, stop, enabled, cues: CUES, played: () => [...fired] };
}

module.exports = { createVoicePlayer, playOnce, CUES, VOICE_DIR, voiceEnabled };
