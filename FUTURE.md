# Future Work

Ideas for additional statusline metrics and features, sourced from community implementations and research.

## High Priority

- [x] Session cost in USD — real-time dollar amount based on model token rates
- [x] Session elapsed time — duration since first transcript entry
- [x] Tool call count — total tool invocations this session
- [ ] Cache hit rate — percentage of input tokens served from prompt cache vs fresh
- [ ] Files modified count — scope awareness indicator (requires PostToolUse hook or transcript parsing)
- [ ] Current task — display the active `in_progress` task from the todos system

## Medium Priority

- [ ] Loop detection — alert when the same tool is called 3+ times in a row with identical input (ring buffer of recent calls with hash comparison)
- [ ] Budget tracking — set a session budget in config and show spend vs budget with colour warnings
- [ ] Cost per turn — average cost of each user→assistant exchange
- [ ] Lines added/removed — net code changes this session
- [ ] Pending bash age — detect stalled long-running commands

## Lower Priority / Niche

- [ ] PR/merge queue state — open PRs, issues, merge conflicts from GitHub
- [ ] Agent delegation state — active subagent objectives and worktree branches
- [ ] Linear/GitHub sync status — integration health with external project tools
- [ ] Per-tool cost breakdown — which tools are consuming the most tokens
- [ ] Per-project cumulative cost — separate running totals by project directory
- [ ] Stale detection — visual indicator if metrics haven't updated in >60s
- [ ] Risk/attention flags — boolean indicator for states requiring human attention

## UX Improvements

- [x] Configurable element ordering — reorder statusline segments via `config/layout.json`
- [x] Verbose/compact modes — toggle with `/ccsl more` and `/ccsl less`
- [x] Notification thresholds — flash/blink when cost, context, or memory exceeds configured limits
- [x] History graphs — sparkline-style mini charts for CPU/memory over time (unicode block characters)
- [ ] Tooltip-style expanded view — show detailed breakdown on hover (terminal-dependent)
- [ ] Configurable sparkline width — allow users to set number of history points in layout.json
- [ ] Element-specific compact labels — shorter labels in compact mode (e.g. "c" instead of "cpu")
