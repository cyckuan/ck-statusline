#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(PLUGIN_ROOT, 'config', 'colors.json');
const AUTO_COMPACT_BUFFER_PCT = 16.5;
const MAX_STDIN = 1024 * 1024;

function loadColors() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const esc = (code) => code ? `\x1b${code}` : '';
    return {
      ctxGreen: esc(raw.context_bar?.green),
      ctxYellow: esc(raw.context_bar?.yellow),
      ctxRed: esc(raw.context_bar?.red),
      tokLabel: esc(raw.tokens?.label),
      tokValue: esc(raw.tokens?.value),
      agents: esc(raw.agents),
      cpuLabel: esc(raw.cpu?.label),
      cpuValue: esc(raw.cpu?.value),
      memLabel: esc(raw.memory?.label),
      memValue: esc(raw.memory?.value),
      cwd: esc(raw.cwd),
      branch: esc(raw.git_branch),
      remote: esc(raw.git_remote),
      behind: esc(raw.git_behind),
      sep: esc(raw.separator),
      reset: esc(raw.reset)
    };
  } catch {
    return {
      ctxGreen: '\x1b[32m', ctxYellow: '\x1b[33m', ctxRed: '\x1b[1;31m',
      tokLabel: '\x1b[2m', tokValue: '\x1b[97m',
      agents: '\x1b[35m',
      cpuLabel: '\x1b[2m', cpuValue: '',
      memLabel: '\x1b[2m', memValue: '',
      cwd: '\x1b[36m', branch: '\x1b[34m', remote: '\x1b[2m',
      behind: '\x1b[33m', sep: '\x1b[2m', reset: '\x1b[0m'
    };
  }
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

function getSubagentCount() {
  try {
    const out = execSync("ps aux | grep -c '[c]laude'", { encoding: 'utf8', timeout: 1000 }).trim();
    const count = Math.max(0, parseInt(out, 10) - 1);
    return count > 0 ? count : 0;
  } catch {
    return 0;
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

function getMemPercent() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const total = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)?.[1] || '0', 10);
    const available = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] || '0', 10);
    if (total === 0) return 0;
    return Math.round(((total - available) / total) * 100);
  } catch {
    return 0;
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
      const c = loadColors();
      const cwd = data.workspace?.current_dir || data.cwd || process.cwd();
      const remaining = data.context_window?.remaining_percentage;
      const transcriptPath = data.transcript_path || '';

      const ctx = getContextBar(remaining, c);
      const tokens = getSessionTokens(transcriptPath);
      const agents = getSubagentCount();
      const cpu = getCpuPercent();
      const mem = getMemPercent();
      const branch = getGitBranch(cwd);
      const remote = getGitRemote(cwd);
      const behind = getGitBehind(cwd, branch);
      const dirName = path.basename(cwd);

      const sep = ` ${c.sep}|${c.reset} `;
      const parts = [];

      if (ctx) parts.push(ctx);
      if (agents > 0) parts.push(`${c.agents}${agents} agents${c.reset}`);
      if (tokens) parts.push(`${c.tokLabel}in${c.reset} ${c.tokValue}${formatTokens(tokens.input)}${c.reset} ${c.tokLabel}out${c.reset} ${c.tokValue}${formatTokens(tokens.output)}${c.reset}`);
      parts.push(`${c.cpuLabel}cpu${c.reset} ${c.cpuValue}${cpu}%${c.reset}`);
      parts.push(`${c.memLabel}mem${c.reset} ${c.memValue}${mem}%${c.reset}`);
      parts.push(`${c.cwd}${dirName}${c.reset}`);
      if (branch) parts.push(`${c.branch}${branch}${c.reset}`);
      if (remote) parts.push(`${c.remote}${remote}${c.reset}`);
      if (behind > 0) parts.push(`${c.behind}${behind} behind${c.reset}`);

      process.stdout.write(parts.join(sep));
    } catch {
      // silent
    }
  });
}

if (require.main === module) run();
