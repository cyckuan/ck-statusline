---
description: Remove the ck-statusline config from settings.json
---

Run the uninstall script to remove the statusLine entry from ~/.claude/settings.json:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/uninstall.js"
```

After running, confirm to the user that the status line has been removed and will disappear on the next session.
