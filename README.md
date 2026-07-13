# pi-todowrite

Todo list management extension for [Pi](https://pi.dev). Automatically creates
structured todos before multi-step work and displays them in the TUI. Keeps the
agent working through Pi's auto-compaction instead of stalling.

## What It Does

- Registers a `todowrite` tool that the LLM calls to manage a structured task list
- Injects a behavior rule into the system prompt so the agent creates todos before
  multi-step work (2+ files, 3+ steps, or delegated/cross-cutting work) and follows a
  CHECK → EXECUTE → UPDATE workflow loop
- Displays the current todo list as a widget in the TUI, updating in real time as
  the agent makes progress
- **Compact mode** (default): shows only incomplete tasks to save screen space —
  completed items are hidden behind a progress summary (`done/total │ remaining`)
- **Full mode**: shows all tasks including completed ones
- **Auto-resume after compaction**: when Pi runs auto-compaction (threshold or
  overflow) and incomplete todos remain, the extension sends a one-shot user
  message so the agent picks up where it left off — no manual "continue" needed
- Persists todos in the session file so they survive compaction and session resume

## Install

```bash
pi install git:github.com/giocom/pi-todowrite
```

Or run directly for testing:

```bash
pi -e ./src/index.ts
```

## Commands

```
/todowrite                  # Show current todo list
/todowrite status           # Same as above
/todowrite compact          # TUI widget: only incomplete items (default)
/todowrite full             # TUI widget: all items
/todowrite toggle           # Show/hide the TUI widget
/todowrite reset            # Clear all todos
/todowrite autoresume       # Show auto-resume status
/todowrite autoresume on    # Enable auto-resume after compaction (default)
/todowrite autoresume off   # Disable auto-resume
```

## Auto-Resume After Compaction

Pi's built-in compaction fires when the context window fills up. After it runs,
the agent stops and waits for user input — even if the work is still mid-flight.
This extension listens to the `session_compact` event and, when incomplete todos
remain, sends a one-shot `Continue with the current task.` user message so the
agent resumes the in-flight work.

### When it fires

- **Threshold compaction** (context grew past the configured threshold) → resume
- **Overflow compaction** (LLM hit context overflow) when not retried by Pi → resume

### When it stays quiet

- **Manual `/compact`** — respects the user's intent to pause
- **Overflow with `willRetry: true`** — Pi already retries the aborted turn
- **No incomplete todos** — nothing to resume
- **Agent no longer idle** — the user (or another extension) already started a turn
- **Debounce** — one resume per agent turn, preventing a compaction-resume loop

Toggle with `/todowrite autoresume on|off`. Default is on.

## License

MIT