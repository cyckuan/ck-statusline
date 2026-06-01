#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const LAYOUT_PATH = path.join(PLUGIN_ROOT, 'config', 'layout.json');

const arg = (process.argv[2] || '').trim().toLowerCase();

if (arg !== 'more' && arg !== 'less') {
  console.error('Usage: set-mode.js <more|less>');
  process.exit(1);
}

try {
  const layout = JSON.parse(fs.readFileSync(LAYOUT_PATH, 'utf8'));
  layout.mode = arg === 'less' ? 'compact' : 'verbose';
  fs.writeFileSync(LAYOUT_PATH, JSON.stringify(layout, null, 2) + '\n');
  console.log(`Statusline mode: ${layout.mode}`);
} catch (err) {
  console.error(`Failed to update layout: ${err.message}`);
  process.exit(1);
}
