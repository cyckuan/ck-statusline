#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PLUGIN_ROOT, 'config', 'colors.json');
const AUTO_COMPACT_BUFFER_PCT = 16.5;
const MAX_STDIN = 1024 * 1024;

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
      ctxRed: esc(scheme.context_bar?.red),
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
        ctxGreen: '\x1b[32m', ctxYellow: '\x1b[38;5;208m', ctxRed: '\x1b[1;31m',
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
      ctxGreen: '\x1b[32m', ctxYellow: '\x1b[33m', ctxRed: '\x1b[1;31m',
      tokLabel: '\x1b[2m', tokValue: '\x1b[97m',
      agents: '\x1b[1;95m',
      cpuLabel: '\x1b[2m', cpuValue: '',
      memLabel: '\x1b[2m', memValue: '',
      cwd: '\x1b[36m', branch: '\x1b[1;96m', remote: '\x1b[2m',
      behind: '\x1b[33m', sep: '\x1b[2m', reset: '\x1b[0m'
    };
  }
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

  let color;
  if (used < 50) color = c.ctxGreen;
  else if (used < 75) color = c.ctxYellow;
  else color = c.ctxRed;

  return `${color}${bar} ${used}%${c.reset}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function getSessionTokens(transcriptPath) {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
    const content = fs.readFileSync(transcriptPath, 'utf8');
    let totalIn = 0;
    let totalOut = 0;
    const inRe = /"input_tokens":(\d+)/g;
    const cacheCreateRe = /"cache_creation_input_tokens":(\d+)/g;
    const cacheReadRe = /"cache_read_input_tokens":(\d+)/g;
    const outRe = /"output_tokens":(\d+)/g;
    let m;
    while ((m = inRe.exec(content)) !== null) totalIn += parseInt(m[1], 10);
    while ((m = cacheCreateRe.exec(content)) !== null) totalIn += parseInt(m[1], 10);
    while ((m = cacheReadRe.exec(content)) !== null) totalIn += parseInt(m[1], 10);
    while ((m = outRe.exec(content)) !== null) totalOut += parseInt(m[1], 10);
    return { input: totalIn, output: totalOut };
  } catch {
    return null;
  }
}

function getAgentCounts(transcriptPath) {
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return { total: 0, turn: 0 };
    const total = parseInt(execSync(`grep -c '"name":"Agent"' "${transcriptPath}" 2>/dev/null || echo 0`, { encoding: 'utf8', timeout: 2000 }).trim(), 10);
    const sinceLastPrompt = parseInt(execSync(`tac "${transcriptPath}" | sed '/"role":"user"/q' | grep -c '"name":"Agent"' 2>/dev/null || echo 0`, { encoding: 'utf8', timeout: 2000 }).trim(), 10);
    return { total, turn: sinceLastPrompt };
  } catch {
    return { total: 0, turn: 0 };
  }
}

function getCpuPercent() {
  try {
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
  } catch {
    return 0;
  }
}

function getMemInfo() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const totalKb = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)?.[1] || '0', 10);
    const availableKb = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] || '0', 10);
    if (totalKb === 0) return { percent: 0, usedGb: '0' };
    const percent = Math.round(((totalKb - availableKb) / totalKb) * 100);
    const usedGb = ((totalKb - availableKb) / 1048576).toFixed(1);
    return { percent, usedGb };
  } catch {
    return { percent: 0, usedGb: '0' };
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
    return execSync('git remote get-url origin', { cwd: dir, encoding: 'utf8', timeout: 1000 }).trim();
  } catch {
    return '';
  }
}

function getGitBehind(dir, branch) {
  try {
    if (!branch) return 0;
    const out = execSync(`git rev-list --count HEAD..origin/${branch}`, { cwd: dir, encoding: 'utf8', timeout: 2000 }).trim();
    return parseInt(out, 10) || 0;
  } catch {
    return 0;
  }
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
      const cwd = data.workspace?.current_dir || data.cwd || process.cwd();
      const remaining = data.context_window?.remaining_percentage;
      const transcriptPath = data.transcript_path || '';

      const ctx = getContextBar(remaining, c);
      const tokens = getSessionTokens(transcriptPath);
      const agents = getAgentCounts(transcriptPath);
      const cpu = getCpuPercent();
      const mem = getMemInfo();
      const branch = getGitBranch(cwd);
      const remote = getGitRemote(cwd);
      const behind = getGitBehind(cwd, branch);
      const dirName = path.basename(cwd);

      const sep = ` ${c.sep}|${c.reset} `;
      const badge = buildCompanyBadge(c);
      const parts = [];

      if (ctx) parts.push(ctx);
      if (agents.total > 0) parts.push(`${c.agents}${agents.turn}/${agents.total} agents${c.reset}`);
      if (tokens) parts.push(`${c.tokLabel}in${c.reset} ${c.tokValue}${formatTokens(tokens.input)}${c.reset} ${c.tokLabel}out${c.reset} ${c.tokValue}${formatTokens(tokens.output)}${c.reset}`);
      parts.push(`${c.cpuLabel}cpu${c.reset} ${c.cpuValue}${cpu}%${c.reset}`);
      parts.push(`${c.memLabel}mem${c.reset} ${c.memValue}${mem.usedGb}G ${mem.percent}%${c.reset}`);
      parts.push(`${c.cwd}${dirName}${c.reset}`);
      if (branch) parts.push(`${c.branch}${branch}${c.reset}`);
      if (remote) parts.push(`${c.remote}${remote}${c.reset}`);
      if (behind > 0) parts.push(`${c.behind}${behind} behind${c.reset}`);

      const line = badge ? `${badge} ${parts.join(sep)}` : parts.join(sep);
      process.stdout.write(line);
    } catch {
      // silent
    }
  });
}

if (require.main === module) run();
