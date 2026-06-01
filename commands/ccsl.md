---
description: Toggle statusline between verbose and compact mode
---

Switch the CK-CCSL statusline display mode.

Usage:
- `/ccsl more` — switch to verbose mode (show all elements)
- `/ccsl less` — switch to compact mode (hide elements listed in compact.exclude)

Run the following to update the layout config:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/set-mode.js" "$ARGUMENTS"
```

Confirm the mode change to the user.
