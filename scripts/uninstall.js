#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

try {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  delete settings.statusLine;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log('Statusline removed from ~/.claude/settings.json');
} catch (err) {
  console.error(`Failed to uninstall: ${err.message}`);
  process.exit(1);
}
