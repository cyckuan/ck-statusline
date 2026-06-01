---
description: Toggle statusline between verbose and compact mode
---

Switch the CK-CCSL statusline display mode.

Usage:
- `/ccsl more` — switch to verbose mode (show all elements)
- `/ccsl less` — switch to compact mode (hide elements listed in compact.exclude)

Run the following to update the layout config:

```bash
node -e "
const fs = require('fs');
const path = '${CLAUDE_PLUGIN_ROOT}/config/layout.json';
const layout = JSON.parse(fs.readFileSync(path, 'utf8'));
layout.mode = '$ARGUMENTS' === 'less' ? 'compact' : 'verbose';
fs.writeFileSync(path, JSON.stringify(layout, null, 2) + '\n');
console.log('Statusline mode: ' + layout.mode);
"
```

Confirm the mode change to the user.
