#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const os = require('os');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PLUGIN_ROOT, 'config', 'colors.json');
const LAYOUT_PATH = path.join(PLUGIN_ROOT, 'config', 'layout.json');
const AUTO_COMPACT_BUFFER_PCT = 16.5;
const MAX_STDIN = 1024 * 1024;
const PLATFORM = os.platform();
const IS_MAC = PLATFORM === 'darwin';
const IS_WIN = PLATFORM === 'win32';
const IS_LINUX = PLATFORM === 'linux';

function shellEscape(str) {
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

const DEFAULT_ORDER = ['badge','context','model','agents','cost','elapsed','tools','tokens','cpu','memory','cwd','branch','remote','behind'];
const DEFAULT_NOTIFICATIONS = { cost_warn: 5, cost_critical: 20, context_warn: 70, context_critical: 90, memory_warn: 80, memory_critical: 95 };

function loadLayout() {
  try {
    const raw = JSON.parse(fs.readFileSync(LAYOUT_PATH, 'utf8'));
    return {
      mode: raw.mode || 'verbose',
      order: raw.order || DEFAULT_ORDER,
      compactExclude: raw.compact?.exclude || ['tokens', 'remote'],
      notifications: { ...DEFAULT_NOTIFICATIONS, ...raw.notifications }
    };
  } catch {
    return {
      mode: 'verbose',
      order: DEFAULT_ORDER,
      compactExclude: ['tokens', 'remote'],
      notifications: DEFAULT_NOTIFICATIONS
    };
  }
}

function loadColors(theme) {
  const isLight = theme && /light/i.test(theme);
  const esc = (code) => code ? `\x1b${code}` : '';
  const escInline = (str) => str ? str.replace(/\[/g, '\x1b[') : '';

  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const scheme = isLight ? (raw.light || raw.dark) : (raw.dark || raw.light);
    return {
      company: {
        text: escInline(raw.company?.text),
        bg: esc(raw.company?.background)
      },
      ctxGreen: esc(scheme.context_bar?.green),
      ctxYellow: esc(scheme.context_bar?.yellow),
      ctxAmber: esc(scheme.context_bar?.amber),
      ctxRed: esc(scheme.context_bar?.red),
      ctxThresholds: scheme.context_bar?.thresholds || [40, 60, 80],
      model: esc(scheme.model),
      tokLabel: esc(scheme.tokens?.label),
      tokValue: esc(scheme.tokens?.value),
      agents: esc(scheme.agents),
      cpuLabel: esc(scheme.cpu?.label),
      cpuValue: esc(scheme.cpu?.value),
      memLabel: esc(scheme.memory?.label),
      memValue: esc(scheme.memory?.value),
      cwd: esc(scheme.cwd),
      branch: esc(scheme.git_branch),
      remote: esc(scheme.git_remote),
      behind: esc(scheme.git_behind),
      sep: esc(scheme.separator),
      reset: esc(scheme.reset)
    };
  } catch {
    if (isLight) {
      return {
        company: { text: '\x1b[1;97mA\x1b[22;37mCME', bg: '\x1b[41m' },
        ctxGreen: '\x1b[32m', ctxYellow: '\x1b[33m', ctxAmber: '\x1b[38;2;255;165;0m', ctxRed: '\x1b[1;31m',
        ctxThresholds: [40, 60, 80],
        model: '\x1b[1;30m',
        tokLabel: '\x1b[90m', tokValue: '\x1b[30m',
        agents: '\x1b[1;35m',
        cpuLabel: '\x1b[90m', cpuValue: '\x1b[30m',
        memLabel: '\x1b[90m', memValue: '\x1b[30m',
        cwd: '\x1b[1;34m', branch: '\x1b[1;36m', remote: '\x1b[90m',
        behind: '\x1b[38;5;208m', sep: '\x1b[90m', reset: '\x1b[0m'
      };
    }
    return {
      company: { text: '\x1b[1;97mA\x1b[22;37mCME', bg: '\x1b[41m' },
      ctxGreen: '\x1b[32m', ctxYellow: '\x1b[33m', ctxAmber: '\x1b[38;2;255;165;0m', ctxRed: '\x1b[1;31m',
      ctxThresholds: [40, 60, 80],
      model: '\x1b[1;97m',
      tokLabel: '\x1b[2m', tokValue: '\x1b[97m',
      agents: '\x1b[1;95m',
      cpuLabel: '\x1b[2m', cpuValue: '',
      memLabel: '\x1b[2m', memValue: '',
      cwd: '\x1b[36m', branch: '\x1b[1;96m', remote: '\x1b[2m',
      behind: '\x1b[33m', sep: '\x1b[2m', reset: '\x1b[0m'
    };
  }
}

function trafficColor(percent, c) {
  const [t1, t2, t3] = c.ctxThresholds;
  if (percent < t1) return c.ctxGreen;
  if (percent < t2) return c.ctxYellow;
  if (percent < t3) return c.ctxAmber;
  return c.ctxRed;
}

function formatModelName(model) {
  if (!model) return '';
  const id = model.id || '';
  const match = id.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (match) return `${match[1]} ${match[2]}.${match[3]}`;
  const display = model.display_name || '';
  if (display) return display.toLowerCase();
  return '';
}

function buildCompanyBadge(c) {
  const { text, bg } = c.company;
  if (!text) return '';
  return `${bg} ${text} ${c.reset}`;
}

function getContextBar(remaining, c) {
  if (remaining === null || remaining === undefined) return '';
  const usable = Math.max(0, ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100);
  const used = Math.max(0, Math.min(100, Math.round(100 - usable)));
  const width = 10;
  const filled = Math.round((used / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);

  const [t1, t2, t3] = c.ctxThresholds;
  let color;
  if (used < t1) color = c.ctxGreen;
  else if (used < t2) color = c.ctxYellow;
  else if (used < t3) color = c.ctxAmber;
  else color = c.ctxRed;

  return `${color}${bar} ${used}%${c.reset}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function isValidTranscriptPath(p) {
  if (!p) return false;
  const resolved = path.resolve(p);
  if (!resolved.endsWith('.jsonl')) return false;
  return true;
}

const MODEL_COST_PATH = path.join(PLUGIN_ROOT, 'config', 'modelcost.json');

function loadModelCosts() {
  try {
    return JSON.parse(fs.readFileSync(MODEL_COST_PATH, 'utf8'));
  } catch {
    return {
      haiku: { input: 0.80, output: 4.00, cacheWrite: 1.00, cacheRead: 0.08 },
      sonnet: { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
      opus: { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 }
    };
  }
}

function getDetailedTokens(transcriptPath) {
  try {
    if (!isValidTranscriptPath(transcriptPath) || !fs.existsSync(transcriptPath)) return null;
    const content = fs.readFileSync(transcriptPath, 'utf8');
    let input = 0, output = 0, cacheWrite = 0, cacheRead = 0;
    const inRe = /"input_tokens":(\d+)/g;
    const cwRe = /"cache_creation_input_tokens":(\d+)/g;
    const crRe = /"cache_read_input_tokens":(\d+)/g;
    const outRe = /"output_tokens":(\d+)/g;
    let m;
    while ((m = inRe.exec(content)) !== null) input += parseInt(m[1], 10);
    while ((m = cwRe.exec(content)) !== null) cacheWrite += parseInt(m[1], 10);
    while ((m = crRe.exec(content)) !== null) cacheRead += parseInt(m[1], 10);
    while ((m = outRe.exec(content)) !== null) output += parseInt(m[1], 10);
    return { input, output, cacheWrite, cacheRead };
  } catch {
    return null;
  }
}

function estimateCost(detailedTokens, modelName) {
  if (!detailedTokens) return 0;
  const costs = loadModelCosts();
  const tier = Object.keys(costs).find(k => modelName && modelName.includes(k)) || 'opus';
  const rates = costs[tier];
  const { input, output, cacheWrite, cacheRead } = detailedTokens;
  return (input * rates.input + cacheWrite * rates.cacheWrite + cacheRead * rates.cacheRead + output * rates.output) / 1_000_000;
}

function getSessionElapsed(transcriptPath) {
  if (!isValidTranscriptPath(transcriptPath) || !fs.existsSync(transcriptPath)) return '';
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(16384);
    fs.readSync(fd, buf, 0, 16384, 0);
    fs.closeSync(fd);
    const chunk = buf.toString('utf8');
    const match = chunk.match(/"timestamp":"([^"]+)"/);
    if (!match) return '';
    const startMs = new Date(match[1]).getTime();
    const elapsedSec = Math.floor((Date.now() - startMs) / 1000);
    if (elapsedSec < 60) return `${elapsedSec}s`;
    const mins = Math.floor(elapsedSec / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hours}h${remMins}m` : `${hours}h`;
  } catch {
    return '';
  }
}

function getToolCount(transcriptPath) {
  if (!isValidTranscriptPath(transcriptPath) || !fs.existsSync(transcriptPath)) return 0;
  try {
    if (IS_WIN) {
      const content = fs.readFileSync(transcriptPath, 'utf8');
      return (content.match(/"type":"tool_use"/g) || []).length;
    }
    const safePath = shellEscape(transcriptPath);
    return parseInt(execSync(`grep -c '"type":"tool_use"' ${safePath} 2>/dev/null || echo 0`, { encoding: 'utf8', timeout: 2000 }).trim(), 10);
  } catch {
    return 0;
  }
}

const CUMULATIVE_PATH = path.join(PLUGIN_ROOT, 'config', 'cumulative-tokens.json');

function readCumulative() {
  try {
    return JSON.parse(fs.readFileSync(CUMULATIVE_PATH, 'utf8'));
  } catch {
    return { input: 0, output: 0 };
  }
}

function writeCumulative(data) {
  try {
    fs.writeFileSync(CUMULATIVE_PATH, JSON.stringify(data));
  } catch {}
}


function updateCumulative(sessionTokens) {
  if (!sessionTokens) return readCumulative();
  const cum = readCumulative();
  const sessionTotal = sessionTokens.input + sessionTokens.output;
  if (sessionTotal > (cum.lastSessionTotal || 0)) {
    const delta = sessionTotal - (cum.lastSessionTotal || 0);
    cum.input += sessionTokens.input - (cum.lastSessionIn || 0);
    cum.output += sessionTokens.output - (cum.lastSessionOut || 0);
  }
  cum.lastSessionTotal = sessionTotal;
  cum.lastSessionIn = sessionTokens.input;
  cum.lastSessionOut = sessionTokens.output;
  writeCumulative(cum);
  return cum;
}

function getAgentCounts(transcriptPath) {
  try {
    if (!isValidTranscriptPath(transcriptPath) || !fs.existsSync(transcriptPath)) return { total: 0, turn: 0 };

    if (IS_WIN) {
      const content = fs.readFileSync(transcriptPath, 'utf8');
      const lines = content.split('\n');
      let total = 0;
      let turn = 0;
      let lastUserIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('"role":"user"')) lastUserIdx = i;
        if (lines[i].includes('"name":"Agent"')) total++;
      }
      for (let i = Math.max(0, lastUserIdx); i < lines.length; i++) {
        if (lines[i].includes('"name":"Agent"')) turn++;
      }
      return { total, turn };
    }

    const safePath = shellEscape(transcriptPath);
    const total = parseInt(execSync(`grep -c '"name":"Agent"' ${safePath} 2>/dev/null || echo 0`, { encoding: 'utf8', timeout: 2000 }).trim(), 10);
    const reverseCmd = IS_MAC ? 'tail -r' : 'tac';
    const sinceLastPrompt = parseInt(execSync(`${reverseCmd} ${safePath} | sed '/"role":"user"/q' | grep -c '"name":"Agent"' 2>/dev/null || echo 0`, { encoding: 'utf8', timeout: 2000 }).trim(), 10);
    return { total, turn: sinceLastPrompt };
  } catch {
    return { total: 0, turn: 0 };
  }
}

function getCpuPercentLinux() {
  const stat1 = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle1 = stat1[3];
  const total1 = stat1.reduce((a, b) => a + b, 0);

  const start = Date.now();
  while (Date.now() - start < 100) {}

  const stat2 = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle2 = stat2[3];
  const total2 = stat2.reduce((a, b) => a + b, 0);

  const idleDelta = idle2 - idle1;
  const totalDelta = total2 - total1;
  if (totalDelta === 0) return 0;
  return Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
}

function getCpuPercentMac() {
  const out = execSync("top -l 1 -n 0 | awk '/CPU usage/'", { encoding: 'utf8', timeout: 3000 }).trim();
  const idle = parseFloat(out.match(/([\d.]+)%\s*idle/)?.[1] || '100');
  return Math.round(100 - idle);
}

function getCpuPercentWin() {
  const out = execSync('wmic cpu get loadpercentage /value', { encoding: 'utf8', timeout: 3000 }).trim();
  return parseInt(out.match(/LoadPercentage=(\d+)/)?.[1] || '0', 10);
}

function getCpuPercent() {
  try {
    if (IS_MAC) return getCpuPercentMac();
    if (IS_WIN) return getCpuPercentWin();
    return getCpuPercentLinux();
  } catch {
    return 0;
  }
}

function getMemInfoLinux() {
  const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
  const totalKb = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)?.[1] || '0', 10);
  const availableKb = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] || '0', 10);
  if (totalKb === 0) return { percent: 0, usedGb: '0' };
  const percent = Math.round(((totalKb - availableKb) / totalKb) * 100);
  const usedGb = ((totalKb - availableKb) / 1048576).toFixed(1);
  return { percent, usedGb };
}

function getMemInfoMac() {
  const totalBytes = parseInt(execSync('sysctl -n hw.memsize', { encoding: 'utf8', timeout: 1000 }).trim(), 10);
  const vmStat = execSync('vm_stat', { encoding: 'utf8', timeout: 1000 });
  const pageSize = parseInt(vmStat.match(/page size of (\d+)/)?.[1] || '4096', 10);
  const free = parseInt(vmStat.match(/Pages free:\s+(\d+)/)?.[1] || '0', 10);
  const inactive = parseInt(vmStat.match(/Pages inactive:\s+(\d+)/)?.[1] || '0', 10);
  const purgeable = parseInt(vmStat.match(/Pages purgeable:\s+(\d+)/)?.[1] || '0', 10);
  const availableBytes = (free + inactive + purgeable) * pageSize;
  const usedBytes = totalBytes - availableBytes;
  const percent = Math.round((usedBytes / totalBytes) * 100);
  const usedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(1);
  return { percent, usedGb };
}

function getMemInfoWin() {
  const out = execSync('wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value', { encoding: 'utf8', timeout: 3000 }).trim();
  const totalKb = parseInt(out.match(/TotalVisibleMemorySize=(\d+)/)?.[1] || '0', 10);
  const freeKb = parseInt(out.match(/FreePhysicalMemory=(\d+)/)?.[1] || '0', 10);
  if (totalKb === 0) return { percent: 0, usedGb: '0' };
  const usedKb = totalKb - freeKb;
  const percent = Math.round((usedKb / totalKb) * 100);
  const usedGb = (usedKb / 1048576).toFixed(1);
  return { percent, usedGb };
}

function getMemInfo() {
  try {
    if (IS_MAC) return getMemInfoMac();
    if (IS_WIN) return getMemInfoWin();
    return getMemInfoLinux();
  } catch {
    return { percent: 0, usedGb: '0' };
  }
}

function isGitRepo(dir) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: dir, encoding: 'utf8', timeout: 1000, stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

function getGitBranch(dir) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, encoding: 'utf8', timeout: 1000 }).trim();
  } catch {
    return '';
  }
}

function getGitRemote(dir) {
  try {
    const raw = execSync('git remote get-url origin', { cwd: dir, encoding: 'utf8', timeout: 1000 }).trim();
    return parseRemote(raw);
  } catch {
    return null;
  }
}

function parseRemote(raw) {
  // git@github.com:user/repo.git -> { name: 'user/repo', url: 'https://github.com/user/repo' }
  const sshMatch = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const host = sshMatch[1];
    const path = sshMatch[2];
    return { name: path, url: `https://${host}/${path}` };
  }
  // https://github.com/user/repo.git -> { name: 'user/repo', url: 'https://github.com/user/repo' }
  const httpsMatch = raw.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    const host = httpsMatch[1];
    const path = httpsMatch[2];
    return { name: path, url: `https://${host}/${path}` };
  }
  return { name: raw, url: '' };
}

function getGitBehind(dir, branch) {
  try {
    if (!branch || !/^[\w\-\/.]+$/.test(branch)) return 0;
    const out = execSync(`git rev-list --count HEAD..origin/${shellEscape(branch)}`, { cwd: dir, encoding: 'utf8', timeout: 2000 }).trim();
    return parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
}

function applyNotification(value, warnThreshold, critThreshold, text, c) {
  if (value >= critThreshold) return `\x1b[5;1;31m${text}${c.reset}`;
  if (value >= warnThreshold) return `\x1b[1;33m${text}${c.reset}`;
  return null;
}

function run() {
  let input = '';
  const timeout = setTimeout(() => process.exit(0), 3000);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (input.length < MAX_STDIN) input += chunk.substring(0, MAX_STDIN - input.length);
  });
  process.stdin.on('end', () => {
    clearTimeout(timeout);
    try {
      const data = JSON.parse(input);
      const theme = data.output_style?.name || '';
      const c = loadColors(theme);
      const layout = loadLayout();
      const cwd = data.workspace?.current_dir || data.cwd || process.cwd();
      const remaining = data.context_window?.remaining_percentage;
      const transcriptPath = data.transcript_path || '';

      const tokens = getDetailedTokens(transcriptPath);
      const cumulative = updateCumulative(tokens ? { input: tokens.input + tokens.cacheWrite + tokens.cacheRead, output: tokens.output } : null);
      const agents = getAgentCounts(transcriptPath);
      const cost = data.cost?.total_cost_usd ?? estimateCost(tokens, data.model ? formatModelName(data.model) : '');
      const elapsed = getSessionElapsed(transcriptPath);
      const toolCount = getToolCount(transcriptPath);
      const cpu = getCpuPercent();
      const mem = getMemInfo();
      const inGitRepo = isGitRepo(cwd);
      const branch = inGitRepo ? getGitBranch(cwd) : '';
      const remote = inGitRepo ? getGitRemote(cwd) : null;
      const behind = inGitRepo ? getGitBehind(cwd, branch) : 0;
      const dirName = path.basename(cwd);
      const modelName = formatModelName(data.model);
      const n = layout.notifications;

      const usedCtx = remaining != null ? Math.max(0, Math.min(100, Math.round(100 - ((remaining - AUTO_COMPACT_BUFFER_PCT) / (100 - AUTO_COMPACT_BUFFER_PCT)) * 100))) : 0;

      const elements = {};

      elements.badge = buildCompanyBadge(c) || null;
      elements.context = getContextBar(remaining, c) || null;
      elements.model = modelName ? `${c.model}${modelName}${c.reset}` : null;
      elements.agents = agents.total > 0 ? `${c.agents}${agents.turn}/${agents.total} agents${c.reset}` : null;

      let costStr = null;
      if (cost > 0) {
        const costText = `$${cost < 10 ? cost.toFixed(2) : cost.toFixed(1)}`;
        costStr = applyNotification(cost, n.cost_warn, n.cost_critical, costText, c) || `${c.tokLabel}$${c.reset}${c.tokValue}${cost < 10 ? cost.toFixed(2) : cost.toFixed(1)}${c.reset}`;
      }
      elements.cost = costStr;

      elements.elapsed = elapsed ? `${c.tokValue}${elapsed}${c.reset}` : null;
      elements.tools = toolCount > 0 ? `${c.tokValue}${toolCount}${c.reset}${c.tokLabel}t${c.reset}` : null;

      if (tokens) {
        const totalIn = tokens.input + tokens.cacheWrite + tokens.cacheRead;
        const sessionTotal = totalIn + tokens.output;
        const cumulativeTotal = cumulative.input + cumulative.output;
        const ratio = tokens.output > 0 ? Math.round(totalIn / tokens.output) : '0';
        elements.tokens = `${c.tokLabel}cum${c.reset} ${c.tokValue}${formatTokens(cumulativeTotal)}${c.reset} ${c.tokLabel}ses${c.reset} ${c.tokValue}${formatTokens(sessionTotal)}${c.reset} ${c.tokLabel}i:o${c.reset} ${c.tokValue}${ratio}${c.reset}`;
      } else {
        elements.tokens = null;
      }

      const cpuColor = trafficColor(cpu, c);
      elements.cpu = `${c.cpuLabel}cpu${c.reset} ${cpuColor}${cpu}%${c.reset}`;

      const memColor = trafficColor(mem.percent, c);
      let memStr = `${c.memLabel}mem${c.reset} ${memColor}${mem.percent}% ${mem.usedGb}G${c.reset}`;
      const memNotif = applyNotification(mem.percent, n.memory_warn, n.memory_critical, `mem ${mem.percent}% ${mem.usedGb}G`, c);
      if (memNotif) memStr = memNotif;
      elements.memory = memStr;

      elements.cwd = `${c.cwd}${dirName}${c.reset}`;
      elements.branch = branch ? `${c.branch}${branch}${c.reset}` : null;

      if (remote) {
        const link = remote.url ? `\x1b]8;;${remote.url}\x07${remote.name}\x1b]8;;\x07` : remote.name;
        elements.remote = `${c.remote}${link}${c.reset}`;
      } else {
        elements.remote = null;
      }

      elements.behind = behind > 0 ? `${c.behind}${behind} behind${c.reset}` : null;

      // Context notification override
      if (remaining != null) {
        const ctxNotif = applyNotification(usedCtx, n.context_warn, n.context_critical, null, c);
        if (ctxNotif && elements.context) {
          elements.context = getContextBar(remaining, c);
        }
      }

      // Assemble in configured order, respecting compact mode
      const excludeSet = layout.mode === 'compact' ? new Set(layout.compactExclude) : new Set();
      const parts = [];

      for (const key of layout.order) {
        if (excludeSet.has(key)) continue;
        if (key === 'badge') continue;
        const el = elements[key];
        if (el) parts.push(el);
      }

      const sep = ` ${c.sep}|${c.reset} `;
      const badge = excludeSet.has('badge') ? '' : (elements.badge || '');
      const line = badge ? `${badge} ${parts.join(sep)}` : parts.join(sep);
      process.stdout.write(line);
    } catch {
      // silent
    }
  });
}

if (require.main === module) run();
