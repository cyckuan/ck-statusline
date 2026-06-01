# Charles Statusline

A Claude Code plugin that displays a custom status line with system metrics, session tokens, and git context.

## Example Output

```
████░░░░░░ 42% | in 4.2M out 39.1k | 3 agents | cpu 38% | mem 6% | myproject | main | git@github.com:user/repo.git | 2 behind
```

## Elements (left to right)

### Context Utilisation Bar

```
████░░░░░░ 42%
```

A 10-character progress bar showing how much of the context window has been consumed. The percentage accounts for a 16.5% auto-compaction buffer — the bar represents usable context, not raw remaining percentage.

**Traffic light colours:**

| Colour | Range | Meaning |
|--------|-------|---------|
| Green | 0–49% | Plenty of room |
| Yellow | 50–74% | Getting full, consider wrapping up complex chains |
| Red (bold) | 75–100% | Near compaction threshold, expect context summarisation soon |

### Session Tokens

```
in 4.2M out 39.1k
```

Cumulative input and output tokens for the current session, parsed from the transcript file. Input includes `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`. Values are formatted as `k` (thousands) or `M` (millions).

### Subagent Count

```
3 agents
```

Number of active Claude processes (minus the main session). Only shown when at least one subagent is running.

### CPU %

```
cpu 38%
```

Current system CPU utilisation, sampled over a 100ms window from `/proc/stat`.

### Memory %

```
mem 6%
```

System memory usage percentage from `/proc/meminfo` (MemTotal minus MemAvailable).

### Working Directory

```
myproject
```

Basename of the current working directory (cyan).

### Git Branch

```
main
```

Current HEAD branch name (blue). Only shown inside a git repository.

### Git Remote URL

```
git@github.com:user/repo.git
```

The `origin` remote URL (dimmed). Only shown inside a git repository.

### Commits Behind

```
2 behind
```

Number of commits the local branch is behind `origin/<branch>` (yellow). Only shown when greater than zero — indicates a `git pull` is needed.

Note: uses locally cached remote refs. Run `git fetch` to update.

## Colour Configuration

Edit `config/colors.json` to customise all colours. Values are ANSI escape code suffixes (everything after `\x1b`).

```json
{
  "context_bar": {
    "green": "[32m",
    "yellow": "[33m",
    "red": "[1;31m"
  },
  "tokens": {
    "label": "[2m",
    "value": "[97m"
  },
  "agents": "[35m",
  "cpu": {
    "label": "[2m",
    "value": ""
  },
  "memory": {
    "label": "[2m",
    "value": ""
  },
  "cwd": "[36m",
  "git_branch": "[34m",
  "git_remote": "[2m",
  "git_behind": "[33m",
  "separator": "[2m",
  "reset": "[0m"
}
```

### Common ANSI codes

| Code | Effect |
|------|--------|
| `[30m`–`[37m` | Standard colours (black, red, green, yellow, blue, magenta, cyan, white) |
| `[90m`–`[97m` | Bright colours |
| `[1m` | Bold |
| `[2m` | Dim |
| `[3m` | Italic |
| `[4m` | Underline |
| `[38;5;Nm` | 256-colour (N = 0–255) |
| `[38;2;R;G;Bm` | True colour RGB |
| `""` | No styling (inherits terminal default) |

## Installation

Add to your `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/home/ubuntu/cc/charles-statusline/scripts/statusline.js\""
  }
}
```

## Conditional Display

Elements that may be absent or zero are omitted:

- Context bar: hidden if no remaining percentage provided
- Tokens: hidden if no transcript path or file unreadable
- Subagents: hidden when count is 0
- Git branch/remote: hidden outside a git repository
- Commits behind: hidden when up to date
