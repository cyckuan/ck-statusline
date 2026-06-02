# Privacy Policy

## Overview

ck-statusline operates entirely locally. It does not collect, transmit, or share any data with external servers. No analytics, no telemetry, no network requests.

## Data accessed

The plugin reads the following local data to render the status line:

- Stdin JSON provided by Claude Code (session metrics such as token counts, cost, model name)
- Local git state (branch name, working tree status)
- Local transcript files (for cumulative token counting)

All access is read-only and local to your machine.

## Local storage

Runtime state files are written to the plugin's config directory:

- `config/cumulative-tokens.json` — session token totals and timestamps
- `config/sparkline.json` — CPU/memory sparkline history

These files never leave your machine and can be deleted at any time without affecting functionality.

## Third-party sharing

None. The plugin makes zero network requests and shares no data with any third party.

## Contact

Questions or concerns: [GitHub Issues](https://github.com/cyckuan/ck-statusline/issues)
